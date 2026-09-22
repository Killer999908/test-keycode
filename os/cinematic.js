/* ============================================================
   KEYCODE — Cinematic 3D scroll website engine
     Act 0  VOID -> CORE       (loader arrival into neural core)
     Act 1  FLAGSHIPS          (4 grabbable orbital crystals)
     Act 2  CONSTELLATION      (40+ service nodes, fly-through, filter)
     Act 3  AGENTS             (AI build showcase)
     Act 4  PRICING / CTA      (3D panels + footer)
   ============================================================ */
import {
  BACKGROUND_VERTEX, BACKGROUND_FRAGMENT, makeStarTexture,
} from './shaders.js';

window.__modCin = (window.__modCin||0)+1;

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- data ---------- */
const FLAGSHIPS = [
  { id:'ai',    name:'AI Full-Stack Coding',   tag:'Code in real time',        href:'ai-builder.html',     color:0x8b5cf6 },
  { id:'game',  name:'3D Game Engine',          tag:'Playable worlds on demand',href:'ai-builder.html?mode=game',   color:0x22d3ee },
  { id:'scan',  name:'3D Scan \u2192 CAD',      tag:'Reality, engineered',      href:'ai-builder.html?mode=cad',        color:0x6ee7b7 },
  { id:'pcb',   name:'PCB Fabrication',        tag:'Fab-ready hardware',        href:'tools.html',          color:0xa78bfa },
];

const SERVICES = [
  ['AI','AI Full-Stack Coding','ai-builder.html'],
  ['AI','Real-Time Code Streaming','ai-builder.html'],
  ['AI','Autonomous Agent Deploy','ai-builder.html'],
  ['AI','Prompt Engineering as a Service','ai-builder.html'],
  ['AI','Model Tuning (Vision/Code)','ai-builder.html'],
  ['AI','AI Support Bots','ai-builder.html'],
  ['GAME','3D Game Generation','ai-builder.html?mode=game'],
  ['GAME','Playable Web Games','game.html'],
  ['GAME','Procedural Environments','ai-builder.html?mode=game'],
  ['GAME','Physics Sandboxes','ai-builder.html?mode=game'],
  ['SCAN','3D Scan \u2192 CAD','ai-builder.html?mode=cad'],
  ['SCAN','CAD Reconstruction','ai-builder.html?mode=cad'],
  ['SCAN','Mesh Repair & Retopo','tools.html'],
  ['SCAN','Photogrammetry Service','ai-builder.html?mode=cad'],
  ['MAKE','3D Print Model Generation','tools.html'],
  ['MAKE','STL \u2192 Printable Parts','tools.html'],
  ['MAKE','PCB Design & Fabrication','tools.html'],
  ['MAKE','PCB DFM Check','tools.html'],
  ['MAKE','Drone / Robotics Builds','tools.html'],
  ['DESIGN','Brand Identity Systems','pricing.html'],
  ['DESIGN','Premium Web Experiences','pricing.html'],
  ['DESIGN','3D Product Visuals','ai-builder.html?mode=cad'],
  ['DESIGN','Interaction Design','pricing.html'],
  ['AUTO','Workflow Automation','tools.html'],
  ['AUTO','Browser Automations','tools.html'],
  ['AUTO','Data Pipelines','tools.html'],
  ['AUTO','Agent Orchestration','ai-builder.html'],
  ['SHOP','Digital Products','shop.html'],
  ['SHOP','Custom Billing','shop.html'],
  ['SHOP','Subscriptions','pricing.html'],
];

const CAT_CENTER = {
  AI:[ -3,2.2, 0], GAME:[ 3.4,2.2,-1], SCAN:[ -3.2,-0.2,0],
  MAKE:[ 3.2,-0.2,1], DESIGN:[ 0,2.4,-2], AUTO:[ 0,-2.0,0],
  SHOP:[ -1.4,-2.8,0.6], COMM:[ 1.8,-2.4,1.4],
};
const CAT_COLOR_MAP = {
  AI:0x8b5cf6, GAME:0x22d3ee, SCAN:0x6ee7b7, MAKE:0x4ade80,
  DESIGN:0xf472b6, AUTO:0xf59e0b, SHOP:0x34d399, COMM:0x38bdf8,
};

/* ---------- engine ---------- */
class Cinema {
  constructor(){
    this.mouse = { x:0, y:0, tx:0, ty:0 };
    this.dragging = null;
    this.rays = new THREE.Raycaster();
    this.nodes = [];

    this.buildRenderer();
    this.buildScene();
    this.buildStars();
    this.buildAct1();
    this.buildAct2();
    this.buildAct3();
    this.buildAct4();
    this.bindEvents();
    this.raf();
  }

  buildRenderer(){
    const canvas = document.getElementById('stage');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 200);
    this.camera.position.set(0,0,11);
    this.defaultZoom = 11;
  }

  buildScene(){
    this.scene = new THREE.Scene();
    this.background = new THREE.Mesh(
      new THREE.PlaneGeometry(50,50),
      new THREE.ShaderMaterial({
        vertexShader:BACKGROUND_VERTEX, fragmentShader:BACKGROUND_FRAGMENT,
        uniforms:{
          uTime:{value:0}, uIntensity:{value:1},
          uRes:{value:new THREE.Vector2(innerWidth,innerHeight)},
          uColorA:{value:new THREE.Color('#3b0d71')},
          uColorB:{value:new THREE.Color('#0e7490')},
        },
        depthWrite:false, transparent:true,
      })
    );
    this.background.position.z = -24;
    this.scene.add(this.background);

    // core (act 0)
    const coreMat = new THREE.MeshBasicMaterial({ color:0x8b5cf6, wireframe:true });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4,3), coreMat);
    this.core.scale.setScalar(0.001);
    this.scene.add(this.core);
    this.coreGlow = this.sprite(0x22d3ee, 0.6);
    this.coreGlow.scale.setScalar(0.1);
    this.scene.add(this.coreGlow);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dl = new THREE.DirectionalLight(0xffffff, 0.6);
    dl.position.set(4,6,5); this.scene.add(dl);
  }

  sprite(color, op=0.6){
    return new THREE.Sprite(new THREE.SpriteMaterial({
      map:makeStarTexture(), color, transparent:true, opacity:op,
      blending:THREE.AdditiveBlending, depthWrite:false }));
  }

  addGlow(parent, color, scale, op=0.6){
    const s = this.sprite(color, op);
    s.scale.setScalar(scale);
    parent.add(s);
    return s;
  }

  buildStars(){
    const n = reduce?0:420;
    const pos = new Float32Array(n*3);
    for(let i=0;i<n;i++){
      pos[i*3]=  (Math.random()-0.5)*46;
      pos[i*3+1]=(Math.random()-0.5)*46;
      pos[i*3+2]=(Math.random()-0.5)*20 - 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos,3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({
      map:makeStarTexture(), size:0.07, transparent:true, opacity:0.7,
      blending:THREE.AdditiveBlending, depthWrite:false }));
    this.scene.add(this.stars);
  }

  /* ============ ACT 1 flagships ============ */
  buildAct1(){
    this.crystals = [];
    const R = 4.6;
    FLAGSHIPS.forEach((f,i)=>{
      const a = i/4*Math.PI*2 + Math.PI/4;
      const grp = new THREE.Group();
      grp.position.set(Math.cos(a)*R, (i%2?0.3:-0.3), Math.sin(a)*R*0.5 - 1);
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.62,0),
        new THREE.MeshStandardMaterial({
          color:f.color, metalness:0.4, roughness:0.15,
          emissive:f.color, emissiveIntensity:reduce?0:0.2,
          transparent:true, opacity:0.94 }));
      const shell = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.86,0),
        new THREE.MeshBasicMaterial({ color:f.color, wireframe:true, transparent:true, opacity:0.3 }));
      grp.add(core); grp.add(shell);
      this.addGlow(grp, f.color, 2.2, 0.55);
      grp.userData = Object.assign({ href:f.href, name:f.name, tag:f.tag }, f);
      grp.count = 0.04 + i*0.03;
      this.scene.add(grp);
      this.crystals.push(grp);
    });
  }

  /* ===== ACT 2 constellation ===== */
  buildAct2(){
    this.act2 = new THREE.Group();
    this.scene.add(this.act2);
    this.visibleCat = new Set(Object.keys(CAT_COLOR_MAP));
    SERVICES.forEach((s, i)=>{
      const center = CAT_CENTER[s[0]]||[0,0,0];
      const grp = new THREE.Group();
      grp.position.set(
        center[0]+(Math.random()-0.5)*1.3,
        center[1]+(Math.random()-0.5)*1.3,
        center[2]+(Math.random()-0.5)*0.6);
      const col = CAT_COLOR_MAP[s[0]]||0xffffff;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.11,8,8),
        new THREE.MeshBasicMaterial({ color:col }));
      grp.add(dot);
      this.addGlow(grp, col, 0.6, 0.6);
      grp.userData = { href:s[2], name:s[1], cat:s[0], color:col };
      this.act2.add(grp);
      this.nodes.push(grp);
    });
  }

  /* ===== ACT 3 agents ===== */
  buildAct3(){
    this.act3 = new THREE.Group();
    this.scene.add(this.act3);
    this.agents = [];
    ['Core','Builder','Design','QA','Scout','Sweep'].forEach((nm,i)=>{
      const a = i/6*Math.PI*2;
      const grp = new THREE.Group();
      grp.position.set(Math.cos(a)*2.6, Math.sin(i*2.4)*0.35, Math.sin(a)*2.6);
      const col = i%2===0?0x8b5cf6:0x22d3ee;
      const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24,0),
        new THREE.MeshStandardMaterial({ color:0x2a1454, emissive:col, emissiveIntensity:0.7 }));
      grp.add(mesh);
      this.addGlow(grp, col, 0.9, 0.6);
      grp.userData = { name:nm, href:'ai-builder.html' };
      grp.count = 0.2 + i*0.2;
      this.act3.add(grp);
      this.agents.push(grp);
    });
  }

  /* ===== ACT 4 pricing ===== */
  buildAct4(){
    this.act4 = new THREE.Group();
    this.scene.add(this.act4);
    this.panels = [];
    const tiers = [
      { n:'Build',  c:0x8b5cf6, z:0.6 },
      { n:'Studio', c:0x22d3ee, z:1.6 },
      { n:'Limit',  c:0xf472b6, z:-0.4 },
    ];
    tiers.forEach((t,i)=>{
      const grp = new THREE.Group();
      grp.position.set((i-1)*3.4, 0, t.z);
      const w=2.4,h=3.0;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w,h),
        new THREE.MeshStandardMaterial({ color:t.c, metalness:0.7, roughness:0.2,
          transparent:true, opacity:0.9, emissive:t.c, emissiveIntensity:0.15 }));
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(w+0.2,h+0.2),
        new THREE.MeshBasicMaterial({ color:t.c, wireframe:true, transparent:true, opacity:0.5 }));
      frame.position.z = -0.02;
      grp.add(panel); grp.add(frame);
      this.addGlow(grp, t.c, 3.2, 0.35);
      grp.userData = { tier:t.n, href:'pricing.html' };
      this.act4.add(grp);
      this.panels.push(grp);
    });
  }

  /* ---------- events ---------- */
  bindEvents(){
    this.capEl = document.getElementById('cap');
    this.tipEl = document.getElementById('tip');
    this.capNameEl = document.getElementById('capName');
    this.capTagEl = document.getElementById('capTag');
    this.capHintEl = document.getElementById('capHint');
    this._down = null;

    addEventListener('pointermove', e=>{
      this.mouse.tx = e.clientX/innerWidth - 0.5;
      this.mouse.ty = e.clientY/innerHeight - 0.5;
      this.curX = e.clientX; this.curY = e.clientY;
      this.updateHover();
      document.body.classList.toggle('dragging-cursor', !!this._down);
      document.body.classList.toggle('draggable', !this._down && !!this.hover);
      this.showTooltip(this.hover, e.clientX, e.clientY);
    });
    addEventListener('pointerdown', e=>{
      const hit = this.pick(e.clientX,e.clientY);
      this._down = hit ? { x:e.clientX, y:e.clientY, g:hit } : null;
    });
    const end = ()=>{
      if(this._down){ this._down = null; }
    };
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
    addEventListener('resize', ()=> this.onResize());
    addEventListener('scroll', ()=>{
      const max = document.body.scrollHeight - innerHeight;
      this.scrollP = max>0 ? clamp(scrollY/max, 0, 1.25) : 0;
      const bar = document.querySelector('.progress span');
      if(bar) bar.style.width = (Math.min(scrollY/max,1)*100)+'%';
    }, { passive:true });
    addEventListener('click', e=>{
      if(!this._down) return;
      const dist = Math.hypot(e.clientX-this._down.x, e.clientY-this._down.y);
      this._down = null;
      if(dist < 8){
        const hit = this.pick(e.clientX,e.clientY);
        if(hit && hit.userData.href) window.location.href = hit.userData.href;
      }
    });
  }

  updateHover(){
    this.hover = null;
    if(this._down || reduce) return;
    const hit = this.pick(this.curX||innerWidth/2, this.curY||innerHeight/2);
    if(hit) this.hover = hit;
    // flagship caption
    if(this.capNameEl) this.capNameEl.textContent = this.hover && this.hover.userData.name
      ? this.hover.userData.name
      : (this.hover && (this.hover.userData.cat || this.hover.userData.tier)) || '';
    if(this.capTagEl) this.capTagEl.textContent = this.hover && this.hover.userData.tag
      ? this.hover.userData.tag : '';
  }

  showTooltip(hit, cx, cy){
    if(hit && !this._down && !(this.crystals||[]).includes(hit)){
      if(this.tipEl){
        this.tipEl.innerHTML =
          '<span class="t-cat">'+ (hit.userData.cat||'') +'</span>'+
          '<span>'+ (hit.userData.name||'') +'</span>';
        this.tipEl.style.left = cx+'px'; this.tipEl.style.top = cy+'px';
        this.tipEl.classList.add('show');
        return;
      }
    } else if(this.tipEl){ this.tipEl.classList.remove('show'); }
  }

  setFilter(cat){
    (this.nodes||[]).forEach(n=>{
      const show = cat==='ALL' || n.userData.cat===cat;
      n.visible = show;
    });
    this.dimNodes(cat);
  }

  renderChips(){
    const wrap = document.getElementById('chips');
    if(!wrap) return;
    const cats = [
      ['ALL','ALL'],['AI','AI Engineering'],['GAME','Games'],['SCAN','Scan to CAD'],
      ['MAKE','Manufacturing'],['DESIGN','Design'],['AUTO','Automation'],['SHOP','Commerce'],
    ];
    wrap.innerHTML = cats.map(c=>
      '<button class="chip'+(c[0]==='ALL'?' on':'')+'" data-cat="'+c[0]+'">'+c[1]+'</button>'
    ).join('');
    wrap.addEventListener('click', e=>{
      const b = e.target.closest('.chip'); if(!b) return;
      wrap.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      this.setFilter(b.dataset.cat);
    });
    this.setFilter('ALL');
  }

  /* ---------- driver for external boot ---------- */
  start(){
    this.renderChips();
  }

  /* ---------- filter helpers ---------- */
  dimNodes(active){
    (this.nodes||[]).forEach(n=>{
      const glow = n.children[1];
      if(glow && glow.isSprite){
        const hot = active==='ALL' || n.userData.cat===active;
        glow.material.opacity = hot ? 0.6 : 0.12;
      }
    });
  }

  pick(cx, cy){
    if(reduce) return null;
    const x = cx/innerWidth*2 -1;
    const y = -(cy/innerHeight)*2 +1;
    this.rays.setFromCamera(new THREE.Vector2(x,y), this.camera);
    const all = this.crystals.concat(this.nodes, this.agents, this.panels);
    const hits = this.rays.intersectObjects(all, true);
    if(hits.length){
      let g = hits[0].object;
      while(g && !g.userData.href) g = g.parent;
      return g && g.userData.href ? g : null;
    }
    return null;
  }

  cursorState(){}

  onResize(){
    this.camera.aspect = innerWidth/innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
    if(this.background.material.uniforms)
      this.background.material.uniforms.uRes.value.set(innerWidth, innerHeight);
  }

  setScroll(p){ this.scrollP = p; }

  /* ---------- loop ---------- */
  raf(){
    requestAnimationFrame(()=>this.raf());
    const t = performance.now()/1000;
    this.mouse.x += (this.mouse.tx - this.mouse.x)*0.06;
    this.mouse.y += (this.mouse.ty - this.mouse.y)*0.06;

    // damping on camera
    this.updateCamera(t);

    // animate bg shader
    if(this.background.material.uniforms){
      this.background.material.uniforms.uTime.value = t;
    }
    if(this.stars) this.stars.rotation.y = t*0.008;
    if(this.crystals) this.crystals.forEach((c,i)=>{
      if(this._down && this._down.g === c){
        c.rotation.y += (this.mouse.x - this._lastX)*2.4;
        c.rotation.x += (this.mouse.y - this._lastYY)*2.4;
        this._lastX = this.mouse.x; this._lastYY = this.mouse.y;
      } else {
        c.rotation.y += (Math.sin(t*0.4+i)*0.25 - c.rotation.y)*0.06;
        c.rotation.x += (Math.cos(t*0.5+i)*0.2 - c.rotation.x)*0.06;
      }
      if(!this._down) { this._lastX = this.mouse.x; this._lastYY = this.mouse.y; }
    });
    if(this.agents) this.agents.forEach(a=>{
      a.rotation.x += 0.004; a.rotation.y += 0.006;
    });
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(t){
    // camera vertical follows scrollP
    const p = this.scrollP||0;
    this.camera.position.y += ((p*22 - 3) - this.camera.position.y)*0.06;
    this.camera.position.x += (this.mouse.x*1.4 - this.camera.position.x)*0.05;
    this.camera.position.z += ((11 - p*4) - this.camera.position.z)*0.05;
    this.camera.lookAt(0, this.camera.position.y, 0);
  }

  /* ---------- loader done ---------- */
  setLoaded(){
    document.documentElement.classList.remove('loading');
    document.body.classList.add('ready');
    if(!reduce){
      gsap.to(this.core.scale, { x:1.05,y:1.05,z:1.05, duration:2.4, ease:'power3.out' });
      gsap.to(this.coreGlow.scale, { x:5,y:5,z:5, duration:2.4, ease:'power3.out' });
    }
  }
}

/* ---------- boot ---------- */
let cin = null;
function safeBoot(){
  try {
    if (window.__cin) cin = window.__cin;
    else {
      if (!window.THREE) return;
      cin = new Cinema();
      // soft-land a static poster if WebGL unavailable
      window.__cin = cin;
    }
  } catch(e){
    window.__errs = window.__errs||[]; window.__errs.push('cin:'+(e.message||e));
    document.documentElement.classList.remove('loading');
    document.body.classList.add('ready');
    console.error('[KEYCODE] cinematic boot failed:', e);
  }
}
if (!reduce){
  if (document.readyState !== 'loading') safeBoot();
  else addEventListener('DOMContentLoaded', safeBoot);
}
export default Cinema;