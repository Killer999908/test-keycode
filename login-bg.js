// KEYCODE Login 3D Background
(function() {
  if (document.getElementById('kc-3d-bg')) return;

  // Force-dismiss any stuck loading screen
  var loader = document.getElementById('kc-loader');
  if (loader && !loader.classList.contains('kc-dismissed')) {
    loader.classList.add('kc-dismissed');
    loader.style.display = 'none';
    document.body.style.overflow = '';
  }

  var script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  script.onload = init3D;
  document.head.appendChild(script);

  function init3D() {
    var container = document.getElementById('video-bg-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'video-bg-container';
      container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;overflow:hidden;';
      document.body.insertBefore(container, document.body.firstChild);
    }

    var oldVideo = document.getElementById('video-bg');
    if (oldVideo) oldVideo.style.display = 'none';

    var cover = document.getElementById('video-cover') || document.createElement('div');
    cover.id = 'video-cover';
    cover.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(3,3,5,0.55);z-index:1;';
    container.appendChild(cover);
    container.style.background = 'transparent';

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.insertBefore(renderer.domElement, cover);
    renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;';

    camera.position.z = 30;

    var mouse = { x: 0, y: 0 };
    document.addEventListener('mousemove', function(e) {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    // Particles
    var particleCount = 2000;
    var geometry = new THREE.BufferGeometry();
    var positions = new Float32Array(particleCount * 3);
    var colors = new Float32Array(particleCount * 3);
    for (var i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 100;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60 - 10;
      var c = new THREE.Color().setHSL(0.65 + Math.random() * 0.15, 0.6, 0.4 + Math.random() * 0.3);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    var particleMat = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    var particles = new THREE.Points(geometry, particleMat);
    scene.add(particles);

    // Main torus knot
    var knotGeo = new THREE.TorusKnotGeometry(3, 1, 128, 16);
    var knotMat = new THREE.MeshPhongMaterial({
      color: 0x6366f1,
      emissive: 0x6366f1,
      emissiveIntensity: 0.15,
      wireframe: false,
      transparent: true,
      opacity: 0.6,
      roughness: 0.3,
      metalness: 0.7,
    });
    var knot = new THREE.Mesh(knotGeo, knotMat);
    knot.position.set(-6, 0, -5);
    scene.add(knot);

    // Second torus knot
    var knotGeo2 = new THREE.TorusKnotGeometry(2.5, 0.8, 96, 12);
    var knotMat2 = new THREE.MeshPhongMaterial({
      color: 0x8b5cf6,
      emissive: 0x8b5cf6,
      emissiveIntensity: 0.1,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    });
    var knot2 = new THREE.Mesh(knotGeo2, knotMat2);
    knot2.position.set(7, -2, -8);
    scene.add(knot2);

    // Small floating shapes
    var shapes = [];
    var shapeGeos = [
      new THREE.IcosahedronGeometry(0.5, 0),
      new THREE.OctahedronGeometry(0.5, 0),
      new THREE.TetrahedronGeometry(0.6, 0),
    ];
    for (var i = 0; i < 20; i++) {
      var geo = shapeGeos[Math.floor(Math.random() * shapeGeos.length)];
      var mat = new THREE.MeshPhongMaterial({
        color: new THREE.Color().setHSL(0.65 + Math.random() * 0.2, 0.7, 0.5),
        emissive: new THREE.Color().setHSL(0.65 + Math.random() * 0.2, 0.7, 0.2),
        transparent: true,
        opacity: 0.3 + Math.random() * 0.4,
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 30 - 5
      );
      mesh.userData = {
        speed: 0.002 + Math.random() * 0.008,
        rotX: Math.random() * Math.PI * 2,
        rotY: Math.random() * Math.PI * 2,
        rotSpeed: 0.005 + Math.random() * 0.02,
        floatOffset: Math.random() * Math.PI * 2,
      };
      scene.add(mesh);
      shapes.push(mesh);
    }

    // Lights
    var ambientLight = new THREE.AmbientLight(0x222244, 0.5);
    scene.add(ambientLight);

    var light1 = new THREE.PointLight(0x6366f1, 1.5, 50);
    light1.position.set(10, 10, 10);
    scene.add(light1);

    var light2 = new THREE.PointLight(0x8b5cf6, 1, 50);
    light2.position.set(-10, -5, 10);
    scene.add(light2);

    var light3 = new THREE.DirectionalLight(0x22d3ee, 0.5);
    light3.position.set(0, 10, -10);
    scene.add(light3);

    var time = 0;
    function animate() {
      requestAnimationFrame(animate);
      time += 0.005;

      // Rotate main knot
      knot.rotation.x += 0.004;
      knot.rotation.y += 0.007;

      // Rotate second knot
      knot2.rotation.x += 0.006;
      knot2.rotation.y += 0.004;
      knot2.rotation.z += 0.003;

      // Animate particles
      var pos = particles.geometry.attributes.position.array;
      for (var i = 0; i < particleCount; i++) {
        pos[i * 3 + 1] += Math.sin(time * 0.5 + i * 0.01) * 0.008;
        pos[i * 3] += Math.cos(time * 0.3 + i * 0.02) * 0.008;
      }
      particles.geometry.attributes.position.needsUpdate = true;

      // Animate small shapes
      for (var i = 0; i < shapes.length; i++) {
        var s = shapes[i];
        var ud = s.userData;
        s.rotation.x += ud.rotSpeed;
        s.rotation.y += ud.rotSpeed * 0.7;
        s.position.y += Math.sin(time * 2 + ud.floatOffset) * 0.005;
      }

      // Mouse parallax
      camera.position.x += (mouse.x * 3 - camera.position.x) * 0.02;
      camera.position.y += (mouse.y * 2 - camera.position.y) * 0.02;
      camera.lookAt(scene.position);

      renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('resize', function() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
})();
