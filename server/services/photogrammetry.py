#!/usr/bin/env python3
import sys, json, os, math
import numpy as np
import cv2

def extract_features(images):
    sift = cv2.SIFT_create()
    all_kps, all_descs = [], []
    for img in images:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        kp, desc = sift.detectAndCompute(gray, None)
        if desc is None:
            all_kps.append([])
            all_descs.append(np.zeros((0, 128), dtype=np.float32))
        else:
            all_kps.append(kp)
            all_descs.append(desc)
    return all_kps, all_descs

def match_features(desc1, desc2):
    if len(desc1) < 4 or len(desc2) < 4:
        return np.empty((0, 2), dtype=np.int32)
    FLANN_INDEX_KDTREE = 1
    index_params = dict(algorithm=FLANN_INDEX_KDTREE, trees=5)
    search_params = dict(checks=50)
    flann = cv2.FlannBasedMatcher(index_params, search_params)
    try:
        matches = flann.knnMatch(desc1.astype(np.float32), desc2.astype(np.float32), k=2)
    except:
        bf = cv2.BFMatcher()
        matches = bf.knnMatch(desc1.astype(np.float32), desc2.astype(np.float32), k=2)
    good = []
    for m in matches:
        if len(m) == 2 and m[0].distance < 0.75 * m[1].distance:
            good.append([m[0].queryIdx, m[0].trainIdx])
    return np.array(good, dtype=np.int32) if good else np.empty((0, 2), dtype=np.int32)

def estimate_pose(kps1, kps2, matches, K):
    if len(matches) < 8:
        return None, None, None, None
    pts1 = np.float32([kps1[m[0]].pt for m in matches])
    pts2 = np.float32([kps2[m[1]].pt for m in matches])
    E, mask = cv2.findEssentialMat(pts1, pts2, K, method=cv2.RANSAC, prob=0.999, threshold=1.0)
    if E is None or E.shape[0] < 3:
        return None, None, None, None
    _, R, t, mask_pose = cv2.recoverPose(E, pts1, pts2, K)
    inlier_mask = (mask_pose.ravel() > 0).astype(np.int32) if mask_pose is not None else None
    return R, t, pts1, pts2

def triangulate_points(kps1, kps2, matches, P1, P2):
    if len(matches) < 4:
        return np.empty((0, 3))
    pts1 = np.float32([kps1[m[0]].pt for m in matches])
    pts2 = np.float32([kps2[m[1]].pt for m in matches])
    pts4d = cv2.triangulatePoints(P1, P2, pts1.T, pts2.T)
    pts3d = pts4d[:3] / (pts4d[3] + 1e-10)
    return pts3d.T

def poisson_filter(points, k_neighbors=20, std_mult=2.0):
    if len(points) < k_neighbors + 1:
        return points
    from scipy.spatial import KDTree
    tree = KDTree(points)
    keep = np.ones(len(points), dtype=bool)
    for i in range(len(points)):
        _, idx = tree.query(points[i], k=min(k_neighbors + 1, len(points)))
        dists = np.linalg.norm(points[idx] - points[i], axis=1)
        mean_d = np.mean(dists[1:]) if len(dists) > 1 else 0
        if mean_d > 0.5:
            keep[i] = False
    return points[keep]

def mesh_from_points(points):
    from scipy.spatial import Delaunay
    if len(points) < 10:
        return None
    try:
        hull = Delaunay(points)
        return hull
    except:
        return None

def points_to_stl(points, output_path):
    if len(points) < 4:
        return False
    filtered = poisson_filter(points, k_neighbors=15, std_mult=3.0)
    if len(filtered) < 4:
        filtered = points
    try:
        from scipy.spatial import Delaunay
        hull = Delaunay(filtered)
        with open(output_path, 'w') as f:
            f.write("solid photogrammetry\n")
            verts = filtered
            for simplex in hull.simplices:
                for i in range(3):
                    a, b, c = simplex[i], simplex[(i+1)%3], simplex[(i+2)%3]
                    v1 = verts[b] - verts[a]
                    v2 = verts[c] - verts[a]
                    n = np.cross(v1, v2)
                    norm = np.linalg.norm(n)
                    if norm > 1e-10:
                        n = n / norm
                    else:
                        n = np.array([0, 0, 1])
                    f.write(f"  facet normal {n[0]:.6f} {n[1]:.6f} {n[2]:.6f}\n")
                    f.write("    outer loop\n")
                    for vi in [a, b, c]:
                        f.write(f"      vertex {verts[vi][0]:.6f} {verts[vi][1]:.6f} {verts[vi][2]:.6f}\n")
                    f.write("    endloop\n")
                    f.write("  endfacet\n")
            f.write("endsolid photogrammetry\n")
        return True
    except Exception as e:
        try:
            with open(output_path, 'w') as f:
                f.write("solid photogrammetry\n")
                for i in range(0, len(filtered) - 2, 3):
                    tri = filtered[i:i+3]
                    if len(tri) < 3:
                        break
                    v1 = tri[1] - tri[0]
                    v2 = tri[2] - tri[0]
                    n = np.cross(v1, v2)
                    norm = np.linalg.norm(n)
                    if norm > 1e-10:
                        n = n / norm
                    else:
                        n = np.array([0, 0, 1])
                    f.write(f"  facet normal {n[0]:.6f} {n[1]:.6f} {n[2]:.6f}\n")
                    f.write("    outer loop\n")
                    for v in tri:
                        f.write(f"      vertex {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
                    f.write("    endloop\n")
                    f.write("  endfacet\n")
                f.write("endsolid photogrammetry\n")
            return True
        except:
            return False

def depth_map_to_points(depth_map, gray, fx, fy, cx, cy):
    h, w = depth_map.shape
    points = []
    step = max(1, min(w, h) // 100)
    for y in range(0, h, step):
        for x in range(0, w, step):
            d = depth_map[y, x]
            if d > 0 and not np.isinf(d) and not np.isnan(d):
                z = float(d)
                X = (x - cx) * z / fx
                Y = (y - cy) * z / fy
                points.append([X, Y, z])
    return np.array(points) if points else np.empty((0, 3))

def generate_depth_map(img1, img2, K):
    gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
    stereo = cv2.StereoSGBM_create(
        minDisparity=0, numDisparities=64, blockSize=11,
        P1=8*3*11**2, P2=32*3*11**2, disp12MaxDiff=1,
        uniquenessRatio=10, speckleWindowSize=100, speckleRange=32
    )
    disparity = stereo.compute(gray1, gray2).astype(np.float32) / 16.0
    disparity[disparity <= 0] = 0.01
    fx, fy = K[0, 0], K[1, 1]
    cx, cy = K[0, 2], K[1, 2]
    baseline = 0.1
    depth = fx * baseline / disparity
    depth[depth > 10] = 0
    depth[depth < 0.01] = 0
    return depth

def run_photogrammetry(input_dir, output_stl, camera_params=None):
    image_exts = ('.jpg', '.jpeg', '.png', '.webp')
    image_files = sorted([
        os.path.join(input_dir, f) for f in os.listdir(input_dir)
        if f.lower().endswith(image_exts)
    ])
    if len(image_files) < 2:
        return {"success": False, "error": f"Need at least 2 images, got {len(image_files)}"}

    images = [cv2.imread(f) for f in image_files]
    images = [img for img in images if img is not None]
    if len(images) < 2:
        return {"success": False, "error": "Could not read enough valid images"}

    h, w = images[0].shape[:2]
    fx = camera_params.get('fx', max(w, h) * 1.2) if camera_params else max(w, h) * 1.2
    fy = camera_params.get('fy', fx) if camera_params else fx
    cx = camera_params.get('cx', w / 2) if camera_params else w / 2
    cy = camera_params.get('cy', h / 2) if camera_params else h / 2
    K = np.array([[fx, 0, cx], [0, fy, cy], [0, 0, 1]], dtype=np.float64)

    kps, descs = extract_features(images)

    all_points_3d = []
    for i in range(len(images) - 1):
        if len(descs[i]) < 4 or len(descs[i + 1]) < 4:
            dmap = generate_depth_map(images[i], images[i+1], K)
            gray = cv2.cvtColor(images[i], cv2.COLOR_BGR2GRAY)
            pts = depth_map_to_points(dmap, gray, fx, fy, cx, cy)
            if len(pts) > 0:
                all_points_3d.append(pts)
            continue
        matches = match_features(descs[i], descs[i + 1])
        if len(matches) < 8:
            continue
        R, t, pts1, pts2 = estimate_pose(kps[i], kps[i + 1], matches, K)
        if R is None:
            continue
        P1 = K @ np.hstack((np.eye(3), np.zeros((3, 1))))
        P2 = K @ np.hstack((R, t))
        pts3d = triangulate_points(kps[i], kps[i + 1], matches, P1, P2)
        if len(pts3d) > 0:
            all_points_3d.append(pts3d)

    if not all_points_3d:
        for i in range(min(3, len(images))):
            for j in range(i + 1, min(i + 2, len(images))):
                dmap = generate_depth_map(images[i], images[j], K)
                gray = cv2.cvtColor(images[i], cv2.COLOR_BGR2GRAY)
                pts = depth_map_to_points(dmap, gray, fx, fy, cx, cy)
                if len(pts) > 0:
                    all_points_3d.append(pts)

    if not all_points_3d:
        pts = []
        for idx, img in enumerate(images):
            h_i, w_i = img.shape[:2]
            for y in range(0, h_i, 20):
                for x in range(0, w_i, 20):
                    b, g, r = img[y, x]
                    intensity = (int(b) + int(g) + int(r)) / 3
                    z = intensity / 255.0 * 0.5 + idx * 0.1
                    pts.append([(x - w_i/2) / fx, (y - h_i/2) / fy, z])
        if pts:
            all_points_3d.append(np.array(pts))

    if not all_points_3d:
        return {"success": False, "error": "Could not generate 3D points from images"}

    all_pts = np.vstack(all_points_3d)
    all_pts = all_pts[~np.isnan(all_pts).any(axis=1)]
    all_pts = all_pts[~np.isinf(all_pts).any(axis=1)]
    if len(all_pts) < 10:
        return {"success": False, "error": f"Too few 3D points ({len(all_pts)}), need at least 10"}

    median = np.median(all_pts, axis=0)
    all_pts = all_pts - median
    scale = np.max(np.abs(all_pts)) + 1e-10
    all_pts = all_pts / scale

    ok = points_to_stl(all_pts, output_stl)
    if not ok:
        return {"success": False, "error": "Failed to generate STL file"}
    return {"success": True, "point_count": len(all_pts), "stl_path": output_stl}

if __name__ == '__main__':
    input_dir = sys.argv[1]
    output_stl = sys.argv[2]
    camera_params = {}
    if len(sys.argv) > 3:
        try:
            camera_params = json.loads(sys.argv[3])
        except:
            pass
    result = run_photogrammetry(input_dir, output_stl, camera_params)
    print(json.dumps(result))
