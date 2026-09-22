// ============================================================
// KEYCODE Pro Game Factory
// Professional 3D (Three.js) game templates + AI generation
// prompts used by the unified AI analyze/generate pipeline.
// ============================================================

export const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

const DEFAULT_PRIMARY = '#6366f1';
const DEFAULT_SECONDARY = '#22d3ee';

function hexCss(hex) { return hex || DEFAULT_PRIMARY; }
function hexNum(hex) { return parseInt((hex || DEFAULT_PRIMARY).replace('#', ''), 16); }

export function is3DRequest(description) {
  const d = (description || '').toLowerCase();
  return /3d|\b3 d\b|\bthree\b|three\.js|webgl|\bvr\b|immersive|racing|race\s*car|driving|highway|space\s*shooter|flight|fighter jet|fps|first[\s-]?person|minecraft|voxel|open[\s-]?world|3d.*(platform|adventure|puzzle)|realistic|simulation|simulator|open\s*world|sandbox|survival|city\s*builder|physics\s*game|aircraft|spaceship|galaxy|planet|zombie|battle\s*royale|car\s*game|bike|truck|bus|train|robot|mech|dinosaur|shooter|rpg|dungeon/i.test(d);
}

// ---------------------------------------------------------------------------
// AI prompts
// ---------------------------------------------------------------------------
export function gamePrompt(description, is3D) {
  if (is3D) {
    return `You are a LEAD GAME ENGINEER at a AAA studio (Rockstar / Naughty Dog / CD Projekt Red caliber) with deep Three.js expertise. Build a complete, REALISTIC, PRODUCTION-READY 3D HTML5 game for: "${description}".

This is NOT a toy demo. It is judged by a AAA game critic against commercial WebGL titles.

The game MUST be a single self-contained HTML file. Include Three.js r128 from CDN:
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>

Return a VALID JSON object (no markdown, no backticks) with this exact structure:
{
  "title": "Cinematic game title",
  "description": "One-line description of gameplay",
  "type": "3d-racer | 3d-shooter | 3d-platformer | 3d-adventure | 3d-puzzle | 3d-simulation | 3d-sandbox",
  "controls": { "Arrow Keys": "Move", "Space": "Jump / Action", "Click": "Shoot / Interact" },
  "code": "The complete HTML file as a string. MUST be playable immediately."
}

AAA VISUAL REALISM (non-negotiable):
- renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; tuned exposure; renderer.shadowMap.enabled with PCFSoftShadowMap and a 2048 shadow map on the key light.
- Physically-based materials everywhere: MeshStandardMaterial with tuned metalness/roughness per surface (asphalt, chrome, fabric, foliage); emissive materials for neon/glass/screens.
- Procedural PBR detail: runtime <canvas>-generated albedo/roughness textures (road markings, brick, tile, metal panels) applied via CanvasTexture with repeat wrapping — zero external assets.
- Lighting rig: hemisphere fill + shadow-casting key directional + rim/accent lights; THREE.FogExp2 atmosphere matched to the scene mood; layered environment (gradient skydome, distant silhouette meshes, parallax clouds/stars, ground scatter props with merged geometry).
- Cinematic post feel: vignette + film grain overlay, FOV kick on boost/impacts, motion speed-lines, dynamic chase camera with lag/look-ahead/handheld sway.
- Particles that read real: additive-blended exhaust/smoke/dust sprites, gravity-driven sparks, explosion shockwave rings, tumbling debris.

AAA GAMEPLAY & FEEL (non-negotiable):
- Real physics: gravity, inertia, suspension/traction on vehicles, momentum-based movement — never teleport-y motion.
- Geometry-respecting collisions (Box3/BoundingSphere) with impact response: camera shake, hit-stop, knockback, damage vignette.
- Synthesized WebAudio: engine loop (osc + filter sweep), impact noise bursts, UI clicks, ambient pad; audio unlocks on first gesture; mute toggle.
- AI opponents/traffic: steering behaviors (pursue/evade/patrol/waypoints), spawn director scaling intensity with player performance.
- Full meta layer: main menu → options (quality toggle, sensitivity) → gameplay → pause (Esc) → game over with stats → best score in localStorage → restart.
- AAA HUD: canvas minimap/radar with blips, speedometer/health/ammo, objective tracker, floating damage numbers, streak popups.
- Waves/levels with escalating difficulty and a signature boss or set-piece moment; S/A/B/C rank system.

ENGINEERING FLOOR:
- Fixed-timestep physics with accumulator + rAF render; delta-time everywhere; auto-pause on tab blur.
- Object pooling for bullets/particles/traffic; zero per-frame allocation in hot loops; reused geometries/materials; devicePixelRatio capped at 2; auto quality degradation on sustained low fps.
- Controls: keyboard + mouse + touch (virtual joystick on mobile) + gamepad API where natural; fully responsive.
- Zero placeholder code. The file runs offline from file:// (except the Three.js CDN).`;
  }
  return `You are a LEAD GAME ENGINEER at a AAA studio. Build a complete, POLISHED, PRODUCTION-READY HTML5 2D game using the Phaser.js framework for: "${description}".

The game MUST be a single self-contained HTML file. Include Phaser from CDN:
<script src="https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js"><\/script>

Return a VALID JSON object (no markdown, no backticks) with this structure:
{
  "title": "Catchy game title",
  "description": "One-line description of gameplay",
  "type": "platformer | shooter | runner | puzzle | arcade | clicker | strategy",
  "controls": { "Arrow Keys": "Move", "Space": "Jump", "Click": "Shoot / Interact" },
  "code": "The complete HTML file as a string. MUST be playable immediately."
}

PROFESSIONAL REQUIREMENTS (judged by a real game critic):
- Proper Phaser 3 config with physics (arcade) enabled, scene with preload/create/update.
- Juice and polish: camera shake on hits, particle effects on collect/destroy, tweened UI, sprite rotation/bob, floating score popups.
- Create all art procedurally (Phaser.Graphics or tinted shapes / inline SVG data-URIs). No external image files.
- Full HUD: score, lives or timer, and a styled GAME OVER / WIN screen with a restart button.
- Increasing difficulty over time. Sound effects via Web Audio API (simple synthesized beeps) if possible.
- Controls on keyboard AND touch (pointer input).
- Responsive canvas sizing; mobile friendly.
- Add professional CSS: dark gradient background, centered canvas, glowing HUD text with a modern font.`;
}

// ---------------------------------------------------------------------------
// Shared HTML shell for 3D games
// ---------------------------------------------------------------------------
function wrap3D(opts, body) {
  const pcss = hexCss(opts.primary);
  const scss = hexCss(opts.secondary);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${opts.title}</title>
<script src="${THREE_CDN}"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{overflow:hidden;background:radial-gradient(ellipse at 50% 0%,#0d1026 0%,#05060f 60%);font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#fff}
canvas{display:block}
#hud{position:fixed;top:18px;left:18px;z-index:10;pointer-events:none;display:flex;gap:22px;font-size:13px;letter-spacing:.08em;color:#aab2d0;font-weight:600;text-shadow:0 2px 12px rgba(0,0,0,.6)}
#hud b{font-size:22px;color:${scss};font-weight:800}
#overlay{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(5,6,15,.82);backdrop-filter:blur(10px);z-index:20;text-align:center;padding:20px}
#overlay h1{font-size:42px;margin-bottom:8px;font-weight:800;background:linear-gradient(135deg,${pcss},${scss});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
#overlay p{color:#9aa3c0;font-size:15px;margin-bottom:26px;max-width:480px;line-height:1.7}
#overlay button{background:linear-gradient(135deg,${pcss},${scss});color:#fff;border:none;padding:14px 38px;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;letter-spacing:.06em;transition:.25s;box-shadow:0 8px 30px rgba(99,102,241,.35)}
#overlay button:hover{transform:translateY(-2px) scale(1.02);box-shadow:0 12px 40px rgba(99,102,241,.5)}
#hint{position:fixed;bottom:16px;left:0;right:0;text-align:center;color:#5a6484;font-size:12px;z-index:10;pointer-events:none;letter-spacing:.08em;text-transform:uppercase}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 3D Neon Racer — perspective highway dodge game
// ---------------------------------------------------------------------------
function game3DRacer(opts) {
  const p = hexNum(opts.primary);
  const s = hexNum(opts.secondary);
  const pcss = hexCss(opts.primary);
  const scss = hexCss(opts.secondary);
  return wrap3D(opts, `<div id="hud"><span>SCORE <b id="score">0</b></span><span>SPEED <b id="speed">0</b></span></div>
<div id="overlay"><h1>${opts.title}</h1><p>Dodge the traffic on the neon highway. Steer with <b>← →</b> or <b>A/D</b> keys, or <b>drag</b> on touch. Speed keeps climbing — grab the energy orbs for bonus points!</p><button onclick="startGame()">▶ &nbsp;START RACE</button></div>
<div id="hint">← → / A D · DRAG TO STEER · COLLECT ORBS</div>
<script>
(function(){
var started=false,score=0,speed=0,gameOver=false;
var scene=new THREE.Scene();scene.background=new THREE.Color(0x05060f);scene.fog=new THREE.FogExp2(0x05060f,0.011);
var camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,0.1,1000);camera.position.set(0,4.6,7);camera.lookAt(0,1.2,0);
var renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));document.body.appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(0x404060,1.2));
var dL=new THREE.DirectionalLight(0xffffff,1.1);dL.position.set(5,10,5);scene.add(dL);
(function(){var g=new THREE.BufferGeometry(),v=[];for(var i=0;i<500;i++)v.push((Math.random()-0.5)*420,Math.random()*70+5,(Math.random()-0.5)*420);g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:0.5})));})();
var road=new THREE.Mesh(new THREE.PlaneGeometry(11,160),new THREE.MeshStandardMaterial({color:0x141a30,side:THREE.DoubleSide}));road.rotation.x=-Math.PI/2;scene.add(road);
var lanes=[-2.5,0,2.5],markers=[];
for(var i=0;i<40;i++){var m=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.02,1.6),new THREE.MeshBasicMaterial({color:0x3a4a8a}));m.position.set(lanes[i%3],0.01,-i*4+2);markers.push(m);scene.add(m);}
[-(5.6),5.6].forEach(function(x){var r=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.3,160),new THREE.MeshStandardMaterial({color:0x232c55}));r.position.set(x,0.15,0);scene.add(r);});
var car=new THREE.Group();
var bodyM=new THREE.MeshStandardMaterial({color:new THREE.Color(${p}),roughness:0.25,metalness:0.7});
var body=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.5,2.6),bodyM);body.position.y=0.4;car.add(body);
var cab=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.45,1.3),new THREE.MeshStandardMaterial({color:0x0b1020,roughness:0.2,metalness:0.85}));cab.position.y=0.85;cab.position.z=-0.2;car.add(cab);
var wheelGeo=new THREE.CylinderGeometry(0.32,0.32,0.2,14);var wheelM=new THREE.MeshStandardMaterial({color:0x0a0d1a});
[[-0.72,0.9],[0.72,0.9],[-0.72,-0.9],[0.72,-0.9]].forEach(function(w){var wh=new THREE.Mesh(wheelGeo,wheelM);wh.rotation.x=Math.PI/2;wh.position.set(w[0],0.32,w[1]);car.add(wh);});
var glow=new THREE.PointLight(${s},0.9,9);glow.position.set(0,0.6,1.3);car.add(glow);
car.position.set(0,0,5);scene.add(car);
var traffic=[],orbs=[],carColors=[0xef4444,0xec4899,0xf59e0b,0x10b981,0x8b5cf6];
function spawnTraffic(){if(gameOver)return;var t=new THREE.Group();var col=carColors[Math.floor(Math.random()*carColors.length)];
var b=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.5,2.6),new THREE.MeshStandardMaterial({color:col,roughness:0.35,metalness:0.55}));b.position.y=0.4;t.add(b);
var c=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.45,1.3),new THREE.MeshBasicMaterial({color:0x0b1020}));c.position.y=0.85;c.position.z=-0.2;t.add(c);
t.position.set(lanes[Math.floor(Math.random()*3)],0,-80);scene.add(t);traffic.push(t);}
function spawnOrb(){if(gameOver)return;var o=new THREE.Mesh(new THREE.OctahedronGeometry(0.35),new THREE.MeshStandardMaterial({color:new THREE.Color(${s}),emissive:new THREE.Color(${s}),emissiveIntensity:0.7}));o.position.set(lanes[Math.floor(Math.random()*3)],1.1,-70);scene.add(o);orbs.push(o);}
var lastSpawn=0,lastOrb=0;
function animate(){
 requestAnimationFrame(animate);
 if(started&&!gameOver){
  score+=speed*0.02;document.getElementById('score').textContent=Math.floor(score);
  speed=Math.min(20+score*0.015,58);document.getElementById('speed').textContent=Math.round(speed*5);
  markers.forEach(function(m){m.position.z+=speed*0.16;if(m.position.z>6)m.position.z-=160;});
  traffic.forEach(function(t){t.position.z+=speed*0.16;});
  traffic=traffic.filter(function(t){if(t.position.z>8){scene.remove(t);return false;}return true;});
  orbs.forEach(function(o){o.position.z+=speed*0.16;o.rotation.y+=0.06;});
  orbs=orbs.filter(function(o){if(o.position.z>8){scene.remove(o);return false;}return true;});
  if(Date.now()-lastSpawn>1300){lastSpawn=Date.now();spawnTraffic();}
  if(Date.now()-lastOrb>6500){lastOrb=Date.now();spawnOrb();}
  var hit=false;
  traffic.forEach(function(t){if(Math.abs(t.position.x-car.position.x)<1.15&&Math.abs(t.position.z-car.position.z)<2.4&&t.position.z>car.position.z-3&&t.position.z<car.position.z+0.6)hit=true;});
  if(hit)endGame();
  for(var i=orbs.length-1;i>=0;i--){var o=orbs[i];if(Math.abs(o.position.x-car.position.x)<1.1&&Math.abs(o.position.z-car.position.z)<1.6){scene.remove(o);orbs.splice(i,1);score+=150;document.getElementById('score').textContent=Math.floor(score);}}
  camera.position.y=4.6+Math.sin(Date.now()*0.02)*speed*0.005;
 }else if(!gameOver){
  camera.position.y=4.6+Math.sin(Date.now()*0.002)*0.25;
 }
 camera.position.x+=(car.position.x*0.65-camera.position.x)*0.1;
 camera.lookAt(car.position.x*0.65,1.2,0);
 renderer.render(scene,camera);
}
animate();
var steer=0;
addEventListener('keydown',function(e){if(e.code==='ArrowLeft'||e.code==='KeyA')steer=-1;if(e.code==='ArrowRight'||e.code==='KeyD')steer=1;});
addEventListener('keyup',function(e){if(e.code==='ArrowLeft'||e.code==='KeyA'||e.code==='ArrowRight'||e.code==='KeyD')steer=0;});
var dragX=null;
addEventListener('pointerdown',function(e){if(gameOver){restart();return;}if(started)dragX=e.clientX;});
addEventListener('pointermove',function(e){if(dragX===null||!started)return;var dx=e.clientX-dragX;steer=Math.max(-1,Math.min(1,dx/50));if(Math.abs(dx)<5)steer=0;});
addEventListener('pointerup',function(){dragX=null;});
(function tick(){car.position.x=Math.max(-4,Math.min(4,car.position.x+steer*0.32));car.rotation.z=-steer*0.14;requestAnimationFrame(tick);})();
function startGame(){document.getElementById('overlay').style.display='none';started=true;}
function endGame(){gameOver=true;document.getElementById('overlay').innerHTML='<h1>CRASHED</h1><p>Final Score: <b style="color:${scss}">'+Math.floor(score)+'</b> · Top Speed: '+Math.round(speed*5)+'</p><button onclick="restart()">↻ &nbsp;PLAY AGAIN</button>';document.getElementById('overlay').style.display='flex';}
function restart(){score=0;speed=0;gameOver=false;started=true;traffic.forEach(function(t){scene.remove(t);});traffic=[];orbs.forEach(function(o){scene.remove(o);});orbs=[];car.position.set(0,0,5);car.rotation.z=0;document.getElementById('overlay').style.display='none';document.getElementById('score').textContent='0';document.getElementById('speed').textContent='0';}
window.startGame=startGame;window.restart=restart;
})();
</script>`);
}

// ---------------------------------------------------------------------------
// 3D Space Shooter — forward scrolling asteroid blaster
// ---------------------------------------------------------------------------
function game3DShooter(opts) {
  const p = hexNum(opts.primary);
  const s = hexNum(opts.secondary);
  const pcss = hexCss(opts.primary);
  const scss = hexCss(opts.secondary);
  return wrap3D(opts, `<div id="hud"><span>SCORE <b id="score">0</b></span><span>LIVES <b id="lives">3</b></span></div>
<div id="overlay"><h1>${opts.title}</h1><p>You are the last defense pilot. <b>Move</b> with arrows / WASD or <b>drag</b>, <b>shoot</b> with <b>Space</b> or <b>click/tap</b>. Destroy the incoming asteroids — protect the sector!</p><button onclick="startGame()">▶ &nbsp;LAUNCH</button></div>
<div id="hint">ARROWS / WASD · SPACE OR CLICK TO SHOOT</div>
<script>
(function(){
var started=false,score=0,lives=3,gameOver=false,shootLock=0;
var scene=new THREE.Scene();scene.background=new THREE.Color(0x030409);scene.fog=new THREE.FogExp2(0x030409,0.006);
var camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,0.1,300);camera.position.set(0,2.5,11);camera.lookAt(0,2.5,-10);
var renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));document.body.appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(0x334,1.4));
var dL=new THREE.DirectionalLight(0xffffff,1.0);dL.position.set(4,6,4);scene.add(dL);
var starField;
(function(){var g=new THREE.BufferGeometry(),v=[];for(var i=0;i<700;i++){v.push((Math.random()-0.5)*120,Math.random()*8+0.5,(Math.random()-0.5)*120);}g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));starField=new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:0.4,transparent:true,opacity:0.9}));scene.add(starField);})();
var ship=new THREE.Group();
var hull=new THREE.Mesh(new THREE.ConeGeometry(0.55,1.9,6),new THREE.MeshStandardMaterial({color:new THREE.Color(${p}),roughness:0.25,metalness:0.8}));hull.rotation.x=Math.PI/2;hull.position.z=-0.4;ship.add(hull);
var nose=new THREE.Mesh(new THREE.ConeGeometry(0.26,1.1,6),new THREE.MeshStandardMaterial({color:0xffffff,emissive:new THREE.Color(${s}),emissiveIntensity:0.6}));nose.rotation.x=Math.PI/2;nose.position.z=-1.3;ship.add(nose);
[[0.62,0],[-0.62,0]].forEach(function(w){var wing=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.06,0.8),new THREE.MeshStandardMaterial({color:new THREE.Color(${p}),roughness:0.3,metalness:0.7}));wing.position.set(w[0],0,w[1]);ship.add(wing);});
var engine=new THREE.PointLight(${s},1.2,6);engine.position.set(0,0,0.9);ship.add(engine);
var tail=new THREE.Mesh(new THREE.ConeGeometry(0.18,0.6,6),new THREE.MeshStandardMaterial({color:0xffffff,emissive:new THREE.Color(${s}),emissiveIntensity:1.2}));tail.rotation.x=-Math.PI/2;tail.position.set(0,0,0.9);ship.add(tail);
ship.position.set(0,2.5,0);scene.add(ship);
var bullets=[],asteroids=[],particles=[];
function shoot(){
 if(gameOver)return;
 var now=Date.now();if(now-shootLock<190)return;shootLock=now;
 var b=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.4,6),new THREE.MeshStandardMaterial({color:0xffffff,emissive:new THREE.Color(${s}),emissiveIntensity:1.5}));
 b.rotation.x=Math.PI/2;b.position.copy(ship.position);b.position.z-=0.4;b.userData={vz:-1.6};scene.add(b);bullets.push(b);
}
function spawnAsteroid(){
 if(gameOver)return;
 var size=Math.random()*1.2+0.5;
 var col=Math.floor(Math.random()*0xffffff);
 var a=new THREE.Mesh(new THREE.DodecahedronGeometry(size),new THREE.MeshStandardMaterial({color:col,roughness:0.8,metalness:0.2,flatShading:true}));
 a.position.set((Math.random()-0.5)*16,Math.random()*6+0.6,-55);
 a.userData={vz:0.25+Math.random()*0.25,vy:(Math.random()-0.5)*0.08,vx:(Math.random()-0.5)*0.08,rot:new THREE.Vector3(Math.random(),Math.random(),Math.random()),radius:size*1.15};
 scene.add(a);asteroids.push(a);
}
function spawnBurst(pos,color,n){
 for(var i=0;i<n;i++){var p=new THREE.Mesh(new THREE.SphereGeometry(0.05,4,4),new THREE.MeshBasicMaterial({color:color}));
 p.position.copy(pos);p.userData={v:new THREE.Vector3((Math.random()-0.5)*0.3,(Math.random()-0.5)*0.3,(Math.random()-0.5)*0.3),life:30};scene.add(p);particles.push(p);}
}
var lastSpawn=0;
function animate(){
 requestAnimationFrame(animate);
 if(started&&!gameOver){
  var arr=starField.geometry.attributes.position.array;
  for(var i=0;i<arr.length;i+=3){arr[i+2]+=0.6;if(arr[i+2]>60)arr[i+2]=-60;}
  starField.geometry.attributes.position.needsUpdate=true;
  bullets.forEach(function(b){b.position.z+=b.userData.vz;});
  bullets=bullets.filter(function(b){if(b.position.z<-80){scene.remove(b);return false;}return true;});
  asteroids.forEach(function(a){a.position.z+=a.userData.vz;a.position.x+=a.userData.vx;a.position.y+=a.userData.vy;a.rotation.x+=a.userData.rot.x*0.01;a.rotation.y+=a.userData.rot.y*0.01;});
  asteroids=asteroids.filter(function(a){if(a.position.z>2.2){scene.remove(a);return false;}return true;});
  particles.forEach(function(p){p.userData.life--;p.position.add(p.userData.v);p.scale.multiplyScalar(0.96);});
  particles=particles.filter(function(p){if(p.userData.life<=0){scene.remove(p);return false;}return true;});
  if(Date.now()-lastSpawn>600){lastSpawn=Date.now();spawnAsteroid();}
  for(var bi=bullets.length-1;bi>=0;bi--){var b=bullets[bi];
   for(var ai=asteroids.length-1;ai>=0;ai--){var a=asteroids[ai];
    if(Math.abs(b.position.z-a.position.z)<1.4&&b.position.distanceTo(a.position)<a.userData.radius+0.3){
     scene.remove(b);bullets.splice(bi,1);
     spawnBurst(a.position,${s},14);
     scene.remove(a);asteroids.splice(ai,1);
     score+=40;document.getElementById('score').textContent=score;
     break;
    }
   }
  }
  // ship vs asteroid
  for(var ai2=asteroids.length-1;ai2>=0;ai2--){var a2=asteroids[ai2];
   if(a2.position.z>1.2&&a2.position.distanceTo(ship.position)<a2.userData.radius+0.9){
    scene.remove(a2);asteroids.splice(ai2,1);
    spawnBurst(ship.position,${p},20);
    lives--;document.getElementById('lives').textContent=lives;
    if(lives<=0){endGame();break;}
   }
  }
  ship.rotation.z=Math.sin(Date.now()*0.004)*0.05;
  camera.position.x+=(ship.position.x*0.6-camera.position.x)*0.08;
  camera.lookAt(ship.position.x*0.6,2.5,-10);
 }else if(!gameOver){
  ship.rotation.z=Math.sin(Date.now()*0.002)*0.1;
 }
 renderer.render(scene,camera);
}
animate();
var keys={};
addEventListener('keydown',function(e){keys[e.code]=true;if(e.code==='Space'){e.preventDefault();shoot();}});
addEventListener('keyup',function(e){keys[e.code]=false;});
var dragging=false,lastX=0,lastY=0;
addEventListener('pointerdown',function(e){if(gameOver){restart();return;}if(started){dragging=true;lastX=e.clientX;lastY=e.clientY;shoot();}});
addEventListener('pointermove',function(e){if(!dragging||!started)return;ship.position.x=Math.max(-7,Math.min(7,ship.position.x+(e.clientX-lastX)*0.04));ship.position.y=Math.max(0.6,Math.min(5.2,ship.position.y-(e.clientY-lastY)*0.04));lastX=e.clientX;lastY=e.clientY;});
addEventListener('pointerup',function(){dragging=false;});
(function move(){if(started&&!gameOver){
 if(keys['ArrowLeft']||keys['KeyA'])ship.position.x-=0.14;
 if(keys['ArrowRight']||keys['KeyD'])ship.position.x+=0.14;
 if(keys['ArrowUp']||keys['KeyW'])ship.position.y+=0.14;
 if(keys['ArrowDown']||keys['KeyS'])ship.position.y-=0.14;
 ship.position.x=Math.max(-7,Math.min(7,ship.position.x));ship.position.y=Math.max(0.6,Math.min(5.2,ship.position.y));
}requestAnimationFrame(move);})();
function startGame(){document.getElementById('overlay').style.display='none';started=true;}
function endGame(){gameOver=true;document.getElementById('overlay').innerHTML='<h1>GAME OVER</h1><p>Final Score: <b style="color:${scss}">'+score+'</b></p><button onclick="restart()">↻ &nbsp;PLAY AGAIN</button>';document.getElementById('overlay').style.display='flex';}
function restart(){score=0;lives=3;gameOver=false;started=true;shootLock=0;asteroids.forEach(function(a){scene.remove(a);});asteroids=[];bullets.forEach(function(b){scene.remove(b);});bullets=[];particles.forEach(function(p){scene.remove(p);});particles=[];ship.position.set(0,2.5,0);document.getElementById('score').textContent='0';document.getElementById('lives').textContent='3';document.getElementById('overlay').style.display='none';}
window.startGame=startGame;window.restart=restart;
})();
</script>`);
}

// ---------------------------------------------------------------------------
// 3D Sky Hopper — third-person platform collect
// ---------------------------------------------------------------------------
function game3DPlatformer(opts) {
  const p = hexNum(opts.primary);
  const s = hexNum(opts.secondary);
  const pcss = hexCss(opts.primary);
  const scss = hexCss(opts.secondary);
  return wrap3D(opts, `<div id="hud"><span>SCORE <b id="score">0</b></span><span>LIVES <b id="lives">3</b></span></div>
<div id="overlay"><h1>${opts.title}</h1><p>Leap across the floating sky islands and collect every energy orb. <b>Move</b> with arrows / WASD, <b>jump</b> with <b>Space</b> (or tap). Don't fall off the world!</p><button onclick="startGame()">▶ &nbsp;START</button></div>
<div id="hint">ARROWS / WASD · SPACE / TAP TO JUMP</div>
<script>
(function(){
var started=false,score=0,lives=3,gameOver=false,onGround=true;
var scene=new THREE.Scene();scene.background=new THREE.Color(0x07091a);scene.fog=new THREE.FogExp2(0x07091a,0.012);
var camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,0.1,500);
var renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));document.body.appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(0x404068,1.1));
var dL=new THREE.DirectionalLight(0xffffff,1.2);dL.position.set(8,14,6);scene.add(dL);
(function(){var g=new THREE.BufferGeometry(),v=[];for(var i=0;i<400;i++)v.push((Math.random()-0.5)*500,Math.random()*120+5,(Math.random()-0.5)*500);g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:0.6})));})();
var grid=new THREE.GridHelper(420,42,0x3a4a8a,0x222a55);grid.position.y=-0.5;scene.add(grid);
// floating islands: x, z, half-w, half-d, y (base of box), h
var islandDefs=[
 {x:0,z:0,hw:6,hd:6,y:0,h:1},
 {x:13,z:0,hw:2.6,hd:2.6,y:2.6,h:1.2},
 {x:-13,z:0,hw:2.6,hd:2.6,y:2.6,h:1.2},
 {x:0,z:13,hw:2.6,hd:2.6,y:2.6,h:1.2},
 {x:0,z:-13,hw:2.6,hd:2.6,y:2.6,h:1.2},
 {x:26,z:11,hw:2.2,hd:2.2,y:5,h:1.2},
 {x:26,z:-11,hw:2.2,hd:2.2,y:5,h:1.2},
 {x:-26,z:11,hw:2.2,hd:2.2,y:5,h:1.2},
 {x:-26,z:-11,hw:2.2,hd:2.2,y:5,h:1.2},
 {x:39,z:0,hw:2.2,hd:2.2,y:7.5,h:1.2}
];
var platforms=[];
islandDefs.forEach(function(pd){
 var mesh=new THREE.Mesh(new THREE.BoxGeometry(pd.hw*2,pd.h,pd.hd*2),new THREE.MeshStandardMaterial({color:0x232c55,roughness:0.55,metalness:0.35}));
 mesh.position.set(pd.x,pd.y+pd.h/2,pd.z);scene.add(mesh);
 // floating crystals under island for atmosphere
 var cry=new THREE.Mesh(new THREE.ConeGeometry(pd.hw*0.9,0.8,4),new THREE.MeshStandardMaterial({color:0x2a3560,roughness:0.4,metalness:0.5}));
 cry.position.set(pd.x,pd.y-0.45,pd.z);scene.add(cry);
 platforms.push({pd:pd,top:pd.y+pd.h});
});
// orbs
var orbGeo=new THREE.OctahedronGeometry(0.5);
var orbs=[];
function spawnOrb(x,y,z){var m=new THREE.Mesh(orbGeo,new THREE.MeshStandardMaterial({color:new THREE.Color(${s}),emissive:new THREE.Color(${s}),emissiveIntensity:0.8}));m.position.set(x,y,z);m.userData={taken:false};scene.add(m);orbs.push(m);}
spawnOrb(3,1.5,3);spawnOrb(-3,1.5,-3);spawnOrb(13,3.4,0);spawnOrb(-13,3.4,0);spawnOrb(0,3.4,13);spawnOrb(0,3.4,-13);spawnOrb(26,5.8,11);spawnOrb(26,5.8,-11);spawnOrb(-26,5.8,11);spawnOrb(-26,5.8,-11);spawnOrb(39,8.3,0);
// player
var player=new THREE.Group();
var pb=new THREE.Mesh(new THREE.BoxGeometry(1,1.4,1),new THREE.MeshStandardMaterial({color:new THREE.Color(${p}),roughness:0.3,metalness:0.6}));pb.position.y=0.7;player.add(pb);
var eye=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.35,0.15),new THREE.MeshBasicMaterial({color:new THREE.Color(${s})}));eye.position.set(0,0.95,0.52);player.add(eye);
var pl=new THREE.PointLight(${s},0.7,5);pl.position.set(0,1.2,0);player.add(pl);
player.position.set(0,1,0);scene.add(player);
var vel={x:0,y:0,z:0},gravity=-26,jumpV=12,moveS=9;
function collide(o){
 var px=o.x,pz=o.z,py=o.y;
 for(var i=0;i<platforms.length;i++){var pd=platforms[i].pd,top=platforms[i].top;
  if(px>pd.x-pd.hw&&px<pd.x+pd.hw&&pz>pd.z-pd.hd&&pz<pd.z+pd.hd){
   if(py>top-0.01&&py<top+1.1&&vel.y<=0){o.y=top;vel.y=0;onGround=true;return true;}
  }
 }
 return false;
}
function reset(){player.position.set(0,6,0);vel.x=0;vel.z=0;vel.y=0;}
var lastT=Date.now();
function animate(){
 requestAnimationFrame(animate);
 if(started&&!gameOver){
  var now=Date.now(),dt=Math.min((now-lastT)/1000,0.05);lastT=now;
  vel.y+=gravity*dt;
  player.position.x+=vel.x*dt;player.position.z+=vel.z*dt;player.position.y+=vel.y*dt;
  onGround=false;
  var landed=collide({x:player.position.x,y:player.position.y,z:player.position.z});
  if(player.position.y<-8){lives--;document.getElementById('lives').textContent=lives;if(lives<=0){endGame();}else{reset();}}
  // orb collect
  for(var i=orbs.length-1;i>=0;i--){var o=orbs[i];o.rotation.y+=0.05;
   if(!o.userData.taken&&o.position.distanceTo(player.position)<1.6){o.userData.taken=true;scene.remove(o);orbs.splice(i,1);score+=50;document.getElementById('score').textContent=score;}
  }
  if(orbs.length===0){score+=500;endGame(true);}
  player.rotation.y=Math.atan2(vel.x,vel.z);
  var lookX=player.position.x*0.8,lookZ=player.position.z*0.8;
  camera.position.x+=(lookX-camera.position.x)*0.08;camera.position.z+=(lookZ+8-camera.position.z)*0.08;camera.position.y+=(player.position.y+5.5-camera.position.y)*0.08;
  camera.lookAt(lookX,player.position.y+1,lookZ);
 }else if(!gameOver){
  camera.position.x+=(0-camera.position.x)*0.08;camera.position.z+=(0+8-camera.position.z)*0.08;camera.position.y+=(5.5-camera.position.y)*0.08;camera.lookAt(0,1,0);
  player.rotation.y+=0.01;
 }
 renderer.render(scene,camera);
}
animate();
var keys={};
addEventListener('keydown',function(e){keys[e.code]=true;if(e.code==='Space'){e.preventDefault();if(onGround){vel.y=jumpV;onGround=false;}}});
addEventListener('keyup',function(e){keys[e.code]=false;});
var dragX=null,dragY=null;
addEventListener('pointerdown',function(e){if(gameOver){restart();return;}if(started){if(onGround){vel.y=jumpV;onGround=false;}dragX=e.clientX;dragY=e.clientY;}});
addEventListener('pointermove',function(e){if(dragX===null||!started)return;var dx=(e.clientX-dragX)/45,dy=(e.clientY-dragY)/45;dragX=e.clientX;dragY=e.clientY;vel.x=Math.max(-moveS,Math.min(moveS,vel.x+dx));vel.z=Math.max(-moveS,Math.min(moveS,vel.z+dy));});
addEventListener('pointerup',function(){dragX=null;});
(function move(){
 if(started&&!gameOver){
  var ax=0,az=0;
  if(keys['ArrowLeft']||keys['KeyA'])ax-=1;if(keys['ArrowRight']||keys['KeyD'])ax+=1;
  if(keys['ArrowUp']||keys['KeyW'])az-=1;if(keys['ArrowDown']||keys['KeyS'])az+=1;
  var len=Math.hypot(ax,az);if(len>0){ax/=len;az/=len;}
  vel.x=ax*moveS;vel.z=az*moveS;
 }
 requestAnimationFrame(move);
})();
function startGame(){document.getElementById('overlay').style.display='none';started=true;lastT=Date.now();}
function endGame(won){gameOver=true;document.getElementById('overlay').innerHTML='<h1>'+(won?'LEVEL CLEAR!':'GAME OVER')+'</h1><p>Final Score: <b style="color:${scss}">'+score+'</b></p><button onclick="restart()">↻ &nbsp;PLAY AGAIN</button>';document.getElementById('overlay').style.display='flex';}
function restart(){score=0;lives=3;gameOver=false;started=true;orbs.forEach(function(o){o.userData.taken=false;o.visible=true;});orbs=[];spawnOrb(3,1.5,3);spawnOrb(-3,1.5,-3);spawnOrb(12,2.5,0);spawnOrb(-12,2.5,0);spawnOrb(24,2.5,10);spawnOrb(24,2.5,-10);spawnOrb(-24,2.5,10);spawnOrb(-24,2.5,-10);spawnOrb(38,2.5,0);reset();document.getElementById('score').textContent='0';document.getElementById('lives').textContent='3';document.getElementById('overlay').style.display='none';lastT=Date.now();}
window.startGame=startGame;window.restart=restart;
})();
</script>`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function build3DFallback(type, opts) {
  const o = { title: 'Neon Racer', primary: DEFAULT_PRIMARY, secondary: DEFAULT_SECONDARY, ...opts };
  switch (type) {
    case '3d-racer': return game3DRacer(o);
    case '3d-shooter': return game3DShooter(o);
    case '3d-platformer': return game3DPlatformer(o);
    default: return game3DRacer(o);
  }
}

export const THREE_TEMPLATES = [
  { id: '3d-racer', name: 'Neon Racer', icon: '🏎️', desc: '3D highway dodge', tag: '3D', engine: 'three' },
  { id: '3d-shooter', name: 'Space Shooter', icon: '🚀', desc: '3D asteroid blaster', tag: '3D', engine: 'three' },
  { id: '3d-platformer', name: 'Sky Hopper', icon: '🌌', desc: '3D platform collect', tag: '3D', engine: 'three' },
];
