import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parentDir = path.resolve(__dirname, '..', '..');

const TOOLS_DIR = path.join(parentDir, 'tools');
const BLENDER_PATH = process.env.BLENDER_PATH || path.join(TOOLS_DIR, 'blender-4.3.2-linux-x64', 'blender');
const EXPORTS_DIR = path.join(parentDir, 'exports');
fs.mkdirSync(EXPORTS_DIR, { recursive: true });

function which(cmd) {
  try { execSync(`which ${cmd} 2>/dev/null`, { stdio: 'pipe' }); return true; }
  catch (e) { return false; }
}

const TOOLS = {
  ffmpeg:      which('ffmpeg'),
  openscad:    which('openscad'),
  convert:     which('convert'),
  python3:     which('python3'),
  blender:     fs.existsSync(BLENDER_PATH),
  cadquery:    (() => { try { execSync('python3 -c "import cadquery"', { stdio:'pipe' }); return true; } catch(e){return false} })(),
  opencv:      (() => { try { execSync('python3 -c "import cv2"', { stdio:'pipe' }); return true; } catch(e){return false} })(),
  sharp:       (() => { try { return !!require('sharp'); } catch(e) { try { return !!import('sharp'); } catch(e2){return false} } })(),
};

export function getAvailableTools() {
  return {
    blender:    { available: TOOLS.blender,    name: 'Blender',      desc: 'Free 3D creation suite (modeling, rendering, animation)',     url: 'https://www.blender.org/download/' },
    openscad:   { available: TOOLS.openscad,   name: 'OpenSCAD',     desc: 'Free CAD modeling software (programmatic 3D)',                url: 'https://openscad.org/downloads.html' },
    cadquery:   { available: TOOLS.cadquery,   name: 'CadQuery',     desc: 'Python parametric CAD library',                               url: 'pip install cadquery' },
    ffmpeg:     { available: TOOLS.ffmpeg,     name: 'FFmpeg',       desc: 'Free video/audio processing toolkit',                         url: 'https://ffmpeg.org/download.html' },
    imagemagick:{ available: TOOLS.convert,    name: 'ImageMagick',  desc: 'Free image manipulation (resize, convert, effects)',           url: 'https://imagemagick.org/script/download.php' },
    opencv:     { available: TOOLS.opencv,     name: 'OpenCV',       desc: 'Free computer vision library (SfM, photogrammetry, detection)',url: 'pip install opencv-python' },
    sharp:      { available: TOOLS.sharp,      name: 'Sharp',        desc: 'High-speed Node.js image processing',                         url: 'npm install sharp' },
    python3:    { available: TOOLS.python3,    name: 'Python 3',     desc: 'Free programming language runtime',                           url: 'https://python.org/downloads' },
  };
}

// ===== BLENDER OPERATIONS =====
export async function blenderRender(sceneFile, outputPath, format = 'png', engine = 'CYCLES') {
  if (!TOOLS.blender) throw new Error('Blender not installed. Download free from blender.org');
  const script = `
import bpy
bpy.context.scene.render.engine = '${engine}'
bpy.context.scene.render.filepath = '${outputPath.replace(/'/g, "\\'")}'
bpy.context.scene.render.image_settings.file_format = '${format.toUpperCase()}'
bpy.ops.render.render(write_still=True)
  `.trim();
  const tmpScript = path.join(EXPORTS_DIR, '_blender_render.py');
  fs.writeFileSync(tmpScript, script);
  execSync(`"${BLENDER_PATH}" -b "${sceneFile}" -P "${tmpScript}" 2>/dev/null`, { stdio: 'pipe', timeout: 120000 });
  return outputPath;
}

export async function blenderExportSTL(inputFile, outputFile) {
  if (!TOOLS.blender) throw new Error('Blender not installed');
  const script = `
import bpy
bpy.ops.import_scene.obj(filepath="${inputFile.replace(/"/g, '\\"')}")
bpy.ops.export_mesh.stl(filepath="${outputFile.replace(/"/g, '\\"')}", use_selection=True)
  `.trim();
  const tmpScript = path.join(EXPORTS_DIR, '_blender_export.py');
  fs.writeFileSync(tmpScript, script);
  execSync(`"${BLENDER_PATH}" -b -P "${tmpScript}" 2>/dev/null`, { stdio: 'pipe', timeout: 60000 });
  return outputFile;
}

export async function blenderToOBJ(inputStl, outputObj) {
  if (!TOOLS.blender) throw new Error('Blender not installed');
  const script = `
import bpy
bpy.ops.import_mesh.stl(filepath="${inputStl.replace(/"/g, '\\"')}")
bpy.ops.export_scene.obj(filepath="${outputObj.replace(/"/g, '\\"')}", use_selection=True)
  `.trim();
  const tmpScript = path.join(EXPORTS_DIR, '_blender_convert.py');
  fs.writeFileSync(tmpScript, script);
  execSync(`"${BLENDER_PATH}" -b -P "${tmpScript}" 2>/dev/null`, { stdio: 'pipe', timeout: 60000 });
  return outputObj;
}

// ===== FFMPEG OPERATIONS =====
export function ffmpegConvert(inputPath, outputPath, options = {}) {
  if (!TOOLS.ffmpeg) throw new Error('FFmpeg not installed');
  const args = ['-i', inputPath, '-y'];
  if (options.crf) args.push('-crf', String(options.crf));
  if (options.codec) args.push('-c:v', options.codec);
  if (options.resolution) args.push('-vf', `scale=${options.resolution}`);
  if (options.bitrate) args.push('-b:v', options.bitrate);
  if (options.fps) args.push('-r', String(options.fps));
  args.push(outputPath);
  execSync(`ffmpeg ${args.join(' ')} 2>/dev/null`, { stdio: 'pipe', timeout: 120000 });
  return outputPath;
}

export function ffmpegExtractAudio(videoPath, audioPath, format = 'mp3') {
  if (!TOOLS.ffmpeg) throw new Error('FFmpeg not installed');
  execSync(`ffmpeg -i "${videoPath}" -q:a 0 -map a "${audioPath}" -y 2>/dev/null`, { stdio: 'pipe', timeout: 120000 });
  return audioPath;
}

export function ffmpegGenerateThumbnail(videoPath, thumbPath, time = '00:00:01') {
  if (!TOOLS.ffmpeg) throw new Error('FFmpeg not installed');
  execSync(`ffmpeg -i "${videoPath}" -ss ${time} -vframes 1 "${thumbPath}" -y 2>/dev/null`, { stdio: 'pipe', timeout: 30000 });
  return thumbPath;
}

export function ffmpegTrimVideo(inputPath, outputPath, start, duration) {
  if (!TOOLS.ffmpeg) throw new Error('FFmpeg not installed');
  execSync(`ffmpeg -i "${inputPath}" -ss ${start} -t ${duration} -c copy "${outputPath}" -y 2>/dev/null`, { stdio: 'pipe', timeout: 120000 });
  return outputPath;
}

// ===== IMAGEMAGICK OPERATIONS =====
export function imagemagickConvert(inputPath, outputPath, options = {}) {
  if (!TOOLS.convert) throw new Error('ImageMagick not installed');
  let cmd = `convert "${inputPath}"`;
  if (options.resize) cmd += ` -resize ${options.resize}`;
  if (options.quality) cmd += ` -quality ${options.quality}`;
  if (options.blur) cmd += ` -blur ${options.blur}`;
  if (options.grayscale) cmd += ' -grayscale Rec709Luminance';
  if (options.flip) cmd += ' -flip';
  if (options.flop) cmd += ' -flop';
  if (options.rotate) cmd += ` -rotate ${options.rotate}`;
  if (options.border) cmd += ` -bordercolor ${options.borderColor || 'black'} -border ${options.border}`;
  cmd += ` "${outputPath}"`;
  execSync(cmd, { stdio: 'pipe', timeout: 30000 });
  return outputPath;
}

export function imagemagickCollage(imagePaths, outputPath, direction = 'horizontal') {
  if (!TOOLS.convert) throw new Error('ImageMagick not installed');
  const op = direction === 'horizontal' ? '+' : '-';
  execSync(`convert ${imagePaths.map(p => `"${p}"`).join(' ')} ${op}append "${outputPath}"`, { stdio: 'pipe', timeout: 30000 });
  return outputPath;
}

// ===== OPENSCAD OPERATIONS =====
export async function openscadRender(scadCode, outputStl) {
  if (!TOOLS.openscad) throw new Error('OpenSCAD not installed');
  const scadFile = path.join(EXPORTS_DIR, '_temp.scad');
  fs.writeFileSync(scadFile, scadCode);
  execSync(`openscad -o "${outputStl}" "${scadFile}" 2>/dev/null`, { stdio: 'pipe', timeout: 60000 });
  fs.unlinkSync(scadFile);
  return outputStl;
}

export function openscadPreview(scadCode, outputPng) {
  if (!TOOLS.openscad) throw new Error('OpenSCAD not installed');
  const scadFile = path.join(EXPORTS_DIR, '_temp_preview.scad');
  fs.writeFileSync(scadFile, scadCode);
  execSync(`openscad -o "${outputPng}" --imgsize=800,600 --colorscheme=Tomorrow "${scadFile}" 2>/dev/null`, { stdio: 'pipe', timeout: 60000 });
  fs.unlinkSync(scadFile);
  return outputPng;
}

// ===== SHARP (IMAGE PROCESSING) =====
export async function sharpProcess(inputPath, outputPath, ops = {}) {
  const sharp = (await import('sharp')).default;
  let pipeline = sharp(inputPath);
  if (ops.resize) pipeline = pipeline.resize(ops.resize.width, ops.resize.height, { fit: ops.resize.fit || 'cover' });
  if (ops.quality) pipeline = pipeline.jpeg({ quality: ops.quality });
  if (ops.blur) pipeline = pipeline.blur(ops.blur);
  if (ops.sharpen) pipeline = pipeline.sharpen(ops.sharpen);
  if (ops.grayscale) pipeline = pipeline.grayscale();
  if (ops.tint) pipeline = pipeline.tint(ops.tint);
  if (ops.flip) pipeline = pipeline.flip();
  if (ops.flop) pipeline = pipeline.flop();
  if (ops.format) pipeline = pipeline.toFormat(ops.format);
  if (ops.rotate) pipeline = pipeline.rotate(ops.rotate);
  await pipeline.toFile(outputPath);
  return outputPath;
}

export async function sharpOptimize(inputPath, outputPath, quality = 80) {
  const sharp = (await import('sharp')).default;
  await sharp(inputPath).jpeg({ quality, mozjpeg: true }).toFile(outputPath);
  return outputPath;
}

// ===== CADQUERY (Python parametric CAD) =====
export function cadqueryGenerate(params, outputStl) {
  if (!TOOLS.cadquery) throw new Error('CadQuery not installed');
  const pyCode = `
import sys, json
sys.path.insert(0, '${parentDir.replace(/'/g, "\\'")}/server/services')
import cadquery as cq
params = json.loads('${JSON.stringify(params).replace(/'/g, "\\'").replace(/\\/g, '\\\\')}')
# Dispatch by type
if params.get('type') == 'enclosure':
    w = params.get('width', 100)
    h = params.get('height', 60)
    d = params.get('depth', 40)
    t = params.get('thickness', 2)
    box = cq.Workplane('XY').box(w, d, h)
    cut = cq.Workplane('XY').box(w-t*2, d-t*2, h-t*2)
    result = box.cut(cut)
elif params.get('type') == 'bracket':
    w = params.get('width', 50)
    h = params.get('height', 50)
    t = params.get('thickness', 5)
    result = cq.Workplane('XY').box(w, t, h).faces('>Z').workplane().box(t, t, h)
elif params.get('type') == 'cylinder':
    r = params.get('radius', 25)
    h = params.get('height', 50)
    result = cq.Workplane('XY').circle(r).extrude(h)
else: # custom gear
    r = params.get('radius', 30)
    h = params.get('height', 10)
    teeth = params.get('teeth', 12)
    result = cq.Workplane('XY').circle(r).extrude(h)
    for i in range(teeth):
        angle = i * 360.0 / teeth
        tooth = cq.Workplane('XY').transformed(offset=(0,0,0)).box(10, 5, h).rotate((0,0,0),(0,0,1),angle)
        result = result.union(tooth)
cq.exporters.export(result, '${outputStl.replace(/'/g, "\\'")}')
print('OK')
  `.trim();
  const pyFile = path.join(EXPORTS_DIR, '_cadquery_gen.py');
  fs.writeFileSync(pyFile, pyCode);
  execSync(`python3 "${pyFile}" 2>/dev/null`, { stdio: 'pipe', timeout: 60000 });
  fs.unlinkSync(pyFile);
  return outputStl;
}

// ===== GENERAL PURPOSE SHELL WRAPPER =====
export function runCommand(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], timeout: opts.timeout || 30000, ...opts });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `Exit code ${code}`));
    });
    proc.on('error', reject);
  });
}

export function getToolStatus() {
  return Object.fromEntries(
    Object.entries(getAvailableTools()).map(([k, v]) => [k, v.available])
  );
}
