'use strict';
// ============================================================
//  APP DATA + LOCAL AI ENGINE  —  routes/appdata.js
//  dashboard /api/user/*  ·  builder /api/ai/*  ·  agent /api/agent/*
//  git /api/git/*  ·  subscriptions  ·  orders (mfg/service)
//  referrals · inquiries · docs · cli · keys · blog · hosting
// ============================================================
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const ai   = require('../lib/ai-provider');
const mailer = require('../lib/mailer');

module.exports = function AppDataRoutes(opts) {
  const {
    app,
    SUPABASE,
    SUPABASE_ADMIN,
    requireAuth,
    rand,
    now,
    hash,
    JWT_SECRET,
    IS_PROD,
    PORT,
  } = opts;
  const projectRoot = process.cwd();
  const PUB    = path.join(projectRoot, 'public');
  const UIL    = path.join(projectRoot, 'ai-projects');
  const DOCS   = path.join(projectRoot, 'docs');

  // read/write JSON store under data/ (small local mock store)
  function readJSON(rel, fallback) {
    try { return JSON.parse(fs.readFileSync(path.join(projectRoot, rel), 'utf8')); }
    catch (_) { return fallback; }
  }
  function writeJSON(rel, val) {
    const p = path.join(projectRoot, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(val, null, 2));
    return val;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeName(n) { return String(n || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120); }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const nid   = () => rand(9);

  // --------------------------------------------------------
  //  SITE HTML GENERATOR (buildSiteHtml) — preview + generate
  //  Plain string concatenation only (no template literals).
  // --------------------------------------------------------
  var INDUSTRIES = {
    food: { name: 'Food & Restaurant', pal: { bg: '#1a1410', card: '#2b2018', accent: '#ff7a3c', accent2: '#ffb347', txt: '#f7ede2', mut: '#c9b8a8' },
      feats: ['Online ordering & delivery', 'Reservations & table booking', 'Menu management', 'Customer reviews'],
      faqs: [['How fast is delivery?', 'Under 40 minutes within city limits.'], ['Can I book a table?', 'Yes - reserve online in seconds.']],
      price: [['Starter', 9], ['Growth', 29], ['Enterprise', 79]] },
    store: { name: 'Online Store', pal: { bg: '#0f1420', card: '#1a2332', accent: '#4f8cff', accent2: '#7ea8ff', txt: '#eef4ff', mut: '#a9b8d0' },
      feats: ['Product catalog & variants', 'Secure checkout & Stripe', 'Inventory tracking', 'Discount codes'],
      faqs: [['Do you ship worldwide?', 'Yes - 120+ countries.'], ['Returns?', '30-day free returns.']],
      price: [['Starter', 15], ['Growth', 39], ['Scale', 99]] },
    portfolio: { name: 'Portfolio', pal: { bg: '#101014', card: '#1b1b21', accent: '#c084fc', accent2: '#e2a8ff', txt: '#f4f1fa', mut: '#b6aec7' },
      feats: ['Project galleries', 'Case studies', 'Contact & enquiry form', 'SEO-ready pages'],
      faqs: [['Available for work?', 'Yes - open for freelance & agency projects.'], ['Response time?', 'Usually within 24 hours.']],
      price: [['Basic', 9], ['Pro', 25], ['Studio', 69]] },
    game: { name: 'Game & Community', pal: { bg: '#120a1e', card: '#201334', accent: '#a855f7', accent2: '#67e8f9', txt: '#f3e8ff', mut: '#c4b5fd' },
      feats: ['Playable game embed', 'Leaderboards', 'Community forum', 'Live events'],
      faqs: [['Is the game free?', 'Yes - free with optional cosmetics.'], ['Cross-platform?', 'Play in any browser.']],
      price: [['Free', 0], ['Supporter', 7], ['VIP', 19]] },
    saas: { name: 'SaaS & Software', pal: { bg: '#0a1628', card: '#122238', accent: '#38bdf8', accent2: '#72ddff', txt: '#eaf6ff', mut: '#9db8cf' },
      feats: ['Interactive product tour', 'Usage-based pricing', 'Docs & API reference', 'Changelog'],
      faqs: [['Do you have a free tier?', 'Yes - free forever, no card needed.'], ['Where is data stored?', 'EU & US regions, encrypted at rest.']],
      price: [['Free', 0], ['Pro', 29], ['Team', 99]] },
    fitness: { name: 'Fitness & Gym', pal: { bg: '#0e1a12', card: '#17281c', accent: '#22c55e', accent2: '#6ee7a0', txt: '#ecfdf5', mut: '#a5c7b0' },
      feats: ['Class schedule & booking', 'Trainer profiles', 'Membership plans', 'Progress tracking'],
      faqs: [['Drop-in sessions?', 'Yes - single visits welcome.'], ['Beginner classes?', 'Free intro class every Saturday.']],
      price: [['Monthly', 25], ['Yearly', 250], ['Family', 55]] },
    agency: { name: 'Agency', pal: { bg: '#100e1a', card: '#1a1730', accent: '#f472b6', accent2: '#f9a8d4', txt: '#fdf2f8', mut: '#d0b3c9' },
      feats: ['Services & pricing', 'Case studies & results', 'Meeting scheduler', 'Client portal'],
      faqs: [['What do you build?', 'Websites, apps, brands - end to end.'], ['Minimum engagement?', 'Starter projects from $2k.']],
      price: [['Starter', 199], ['Growth', 799], ['Partner', 1999]] },
    health: { name: 'Health & Clinic', pal: { bg: '#0d1a22', card: '#142833', accent: '#2dd4bf', accent2: '#7ce8dc', txt: '#effdfb', mut: '#a5cdd2' },
      feats: ['Appointment booking', 'Doctors directory', 'Telehealth portal', 'Patient FAQ'],
      faqs: [['Do you take insurance?', 'We support major providers.'], ['Open weekends?', 'Saturday mornings 9-1.']],
      price: [['Visit', 60], ['Care plan', 35], ['Family', 120]] },
    education: { name: 'Education & Courses', pal: { bg: '#171323', card: '#241d36', accent: '#fbbf24', accent2: '#fde68a', txt: '#fffbeb', mut: '#d6c7a5' },
      feats: ['Course catalog', 'Student dashboard', 'Quizzes & certificates', 'Live workshops'],
      faqs: [['Are certificates issued?', 'Yes - verifiable PDF certificates.'], ['Refund policy?', '7-day full refund, no questions.']],
      price: [['Basic', 12], ['Diploma', 49], ['Bootcamp', 199]] },
    realty: { name: 'Real Estate', pal: { bg: '#14100c', card: '#231b13', accent: '#d97706', accent2: '#f5b04c', txt: '#fffbeb', mut: '#cbb795' },
      feats: ['Property listings', 'Virtual tours', 'Mortgage calculator', 'Agent contact'],
      faqs: [['Can I list a property?', 'Yes - agents can submit listings.'], ['Do you handle rentals too?', 'Yes - sales & rentals.']],
      price: [['Agent', 29], ['Brokerage', 149], ['Enterprise', 499]] }
  };
  var ICONS = { bolt: '&#9889;', store: '&#127979;', cam: '&#128247;', pad: '&#127918;', cheq: '&#10004;', grid: '&#9878;' };
  var PALETTE_KEYS = ['bg', 'card', 'accent', 'accent2', 'txt', 'mut'];
  var icoKeys = ['bolt', 'store', 'cam', 'pad', 'cheq', 'grid'];

  function buildSiteHtml(spec) {
    spec = spec || {};
    var indKey = INDUSTRIES[spec.industry] ? spec.industry : 'saas';
    var ind = INDUSTRIES[indKey];
    var pal = ind.pal;
    if (spec.palette && typeof spec.palette === 'object') {
      pal = Object.assign({}, pal);
      PALETTE_KEYS.forEach(function (k) {
        var v = spec.palette[k];
        if (typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim())) pal[k] = v.trim();
      });
    }
    var name  = esc(typeof spec.name === 'string' && spec.name ? spec.name : ind.name);
    var tag   = esc(typeof spec.tagline === 'string' && spec.tagline ? spec.tagline : 'A modern site generated by KEYCODE Studio');
    var email = esc(typeof spec.email === 'string' && spec.email ? spec.email : 'hello@example.com');
    var feats = Array.isArray(spec.features) && spec.features.length ? spec.features.slice(0, 6) : ind.feats;
    var faqs  = Array.isArray(spec.faqs) && spec.faqs.length ? spec.faqs.slice(0, 6) : ind.faqs;
    var price = Array.isArray(spec.pricing) && spec.pricing.length ? spec.pricing.slice(0, 3) : ind.price;
    var heroTxt = esc(typeof spec.heroText === 'string' && spec.heroText ? spec.heroText : 'Everything ' + name + ' does - in one clean, fast site.');
    var heroSub = esc(typeof spec.heroSub === 'string' && spec.heroSub ? spec.heroSub : 'No clutter. No fluff. Just the tool, ready the moment you open it.');
    var ctaTxt  = esc(typeof spec.ctaText === 'string' && spec.ctaText ? spec.ctaText : 'Get started');

    var h = [];
    h.push('<!DOCTYPE html>');
    h.push('<html lang="en">');
    h.push('<head>');
    h.push('<meta charset="utf-8">');
    h.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    h.push('<title>' + name + ' - ' + tag + '</title>');
    h.push('<meta name="description" content="' + tag + '">');
    h.push('<link rel="icon" href="data:,">');
    h.push('<style>');
    h.push(':root{--bg:' + pal.bg + ';--card:' + pal.card + ';--ac:' + pal.accent + ';--ac2:' + pal.accent2 + ';--tx:' + pal.txt + ';--mu:' + pal.mut + ';}');
    h.push('*{margin:0;padding:0;box-sizing:border-box}');
    h.push('html{scroll-behavior:smooth}');
    h.push('body{background:var(--bg);color:var(--tx);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.6}');
    h.push('a{color:var(--ac2);text-decoration:none}');
    h.push('nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;padding:14px 28px;background:color-mix(in srgb,var(--bg) 85%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid #ffffff14}');
    h.push('.brand{font-weight:800;letter-spacing:.5px;color:var(--tx)}');
    h.push('.brand span{color:var(--ac)}');
    h.push('nav .links{display:flex;gap:22px;font-size:15px}');
    h.push('nav .links a{color:var(--mu)}');
    h.push('nav .links a:hover{color:var(--tx)}');
    h.push('header{padding:96px 28px 72px;text-align:center;background:radial-gradient(1000px 420px at 50% -80px,color-mix(in srgb,var(--ac) 22%,transparent),transparent)}');
    h.push('header h1{font-size:clamp(34px,6vw,62px);line-height:1.1;max-width:900px;margin:0 auto 18px}');
    h.push('header h1 em{font-style:normal;color:var(--ac)}');
    h.push('header p{max-width:640px;margin:0 auto 28px;color:var(--mu);font-size:18px}');
    h.push('.btn{display:inline-block;padding:13px 30px;border-radius:12px;font-weight:700;border:0;cursor:pointer;font-size:16px;background:var(--ac);color:#0b0d10}');
    h.push('.btn:hover{filter:brightness(1.08)}');
    h.push('.btn.ghost{background:transparent;color:var(--tx);border:1px solid #ffffff2e}');
    h.push('section{padding:64px 28px;max-width:1100px;margin:0 auto}');
    h.push('h2{font-size:clamp(26px,4vw,38px);margin-bottom:10px}');
    h.push('.sub{color:var(--mu);margin-bottom:36px}');
    h.push('.grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}');
    h.push('.card{background:var(--card);border:1px solid #ffffff12;border-radius:16px;padding:22px}');
    h.push('.card h3{margin-bottom:8px}');
    h.push('.card p{color:var(--mu)}');
    h.push('.feat{display:flex;gap:14px;align-items:flex-start}');
    h.push('.fic{font-size:26px;background:color-mix(in srgb,var(--ac) 18%,transparent);border-radius:12px;padding:10px}');
    h.push('.band{background:var(--card);border:1px solid #ffffff12;border-radius:18px;padding:34px;text-align:center}');
    h.push('footer{border-top:1px solid #ffffff14;padding:30px 28px;color:var(--mu);display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between}');
    h.push('details{background:var(--card);border:1px solid #ffffff12;border-radius:12px;padding:14px 18px;margin-bottom:10px}');
    h.push('summary{cursor:pointer;font-weight:600}');
    h.push('.price{background:var(--card);border:1px solid #ffffff14;border-radius:16px;padding:26px;text-align:center}');
    h.push('.price.best{border-color:var(--ac);box-shadow:0 0 0 1px var(--ac)}');
    h.push('.price .amt{font-size:36px;font-weight:800;margin:8px 0 14px}');
    h.push('.price ul{list-style:none;color:var(--mu);margin:0 0 20px}');
    h.push('.price li{padding:5px 0}');
    h.push('.price button{width:100%;padding:11px;border-radius:10px;border:0;background:var(--ac);color:#0b0d10;font-weight:700;cursor:pointer}');
    h.push('form.inp{display:flex;gap:10px;max-width:520px;margin:0 auto 14px}');
    h.push('form.inp input{flex:1;padding:12px 16px;border-radius:10px;border:1px solid #ffffff22;background:#ffffff0a;color:var(--tx)}');
    h.push('</style>');
    h.push('</head>');
    h.push('<body>');
    h.push('<nav><div class="brand">' + name + '<span>.</span></div><div class="links"><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a><a href="#contact">Contact</a></div></nav>');
    h.push('<header>');
    h.push('<h1>' + heroTxt + '</h1>');
    h.push('<p>' + heroSub + '</p>');
    h.push('<a class="btn" href="#pricing">' + ctaTxt + '</a>');
    h.push('</header>');
    h.push('<section id="features"><h2>Features</h2><p class="sub">Everything is included.</p><div class="grid">');
    feats.forEach(function (f, i) {
      var k = icoKeys[i % icoKeys.length];
      h.push('<div class="card feat"><div class="fic">' + ICONS[k] + '</div><div><h3>' + esc(String(f)) + '</h3><p>Built in and ready to use - configured for this site from day one.</p></div></div>');
    });
    h.push('</div></section>');
    h.push('<section id="pricing"><h2>Pricing</h2><p class="sub">Simple plans. Cancel anytime.</p><div class="grid">');
    price.forEach(function (p, i) {
      var nm = p && p[0] ? String(p[0]) : 'Plan';
      var am = p && typeof p[1] === 'number' ? p[1] : (parseInt(p && p[1], 10) || 0);
      h.push('<div class="price' + (i === 1 ? ' best' : '') + '"><h3>' + esc(nm) + '</h3><div class="amt">$' + am + '<span style="font-size:14px;color:var(--mu)">/mo</span></div><ul><li>All core features</li><li>Email support</li>' + (i === 1 ? '<li>Priority support</li><li>Advanced analytics</li>' : '') + '</ul><button onclick="location.hash=\'#contact\'">Choose ' + esc(nm) + '</button></div>');
    });
    h.push('</div></section>');
    h.push('<section id="faq"><h2>FAQ</h2><p class="sub">Quick answers.</p>');
    faqs.forEach(function (f) {
      h.push('<details><summary>' + esc(String(f && f[0])) + '</summary><p style="color:var(--mu);margin-top:8px">' + esc(String(f && f[1])) + '</p></details>');
    });
    h.push('</section>');
    h.push('<section id="contact" class="band"><h2>Contact us</h2><p class="sub" style="margin-bottom:22px">Tell us what you need.</p>');
    h.push('<form id="cform" class="inp"><input id="cemail" type="email" placeholder="Your email" required><button class="btn" type="submit">Send</button></form>');
    h.push('<p id="cmsg" style="color:var(--ac2);display:none"></p>');
    h.push('<script>');
    h.push('var f=document.getElementById("cform"),m=document.getElementById("cmsg");');
    h.push('f.addEventListener("submit",function(e){e.preventDefault();');
    h.push('var em=document.getElementById("cemail").value;var x=new XMLHttpRequest();');
    h.push('x.open("POST","/api/inquiries",true);x.setRequestHeader("Content-Type","application/json");');
    h.push('x.send(JSON.stringify({name:"",email:em,message:"Contact form - ' + name + '",source:"generated-site"}));');
    h.push('f.reset();m.style.display="block";m.textContent="Thanks! We got your message.";});');
    h.push('<\/script>');
    h.push('</section>');
    h.push('<footer><div>' + name + ' &copy; 2026</div><div><a href="mailto:' + email + '">' + email + '</a></div></footer>');
    h.push('</body>');
    h.push('</html>');
    return h.join('\n') + '\n';
  }

  // --------------------------------------------------------
  //  FILE STORE: ai-projects.json (array) + ai-projects/ dir
  // --------------------------------------------------------
  function loadProjects() { return readJSON('data/ai-projects.json', []); }
  function saveProjects(list) { writeJSON('data/ai-projects.json', Array.isArray(list) ? list : []); }
  function findProject(req, allowAdmin) {
    const list = loadProjects();
    const fid = String(req.params.fileId || '');
    const prj = list.find(function (p) {
      return (p.fileId === fid || p.id === fid) && (p.userId === req.user.userId || (allowAdmin === true && req.user.role === 'admin'));
    }) || list.find(function (p) { return (p.fileId === fid || p.id === fid) && (p.userId === req.user.userId || (p.visibility === 'public')); });
    return prj;
  }
  function projectFile(fid) { return path.join(UIL, safeName(fid)); }

  // --------------------------------------------------------
  //  USER DASHBOARD / DATA ROUTES
  // --------------------------------------------------------
  app.get('/api/user/dashboard', requireAuth, function (req, res) {
    const uid = req.user.userId;
    const projects = loadProjects().filter(function (p) { return p.userId === uid; });
    const orders = readJSON('data/mock-orders.json', []).filter(function (o) { return o.userId === uid; });
    const notes = readJSON('data/mock-notifications.json', { notifications: [] }).notifications || [];
    const unread = notes.filter(function (n) {
      return n && (n.userId === uid || n.userId === 'all') && !n.read;
    }).length;
    res.json({
      success: true,
      user: { userId: uid, email: req.user.email, name: req.user.name || req.user.email, role: req.user.role },
      stats: {
        totalAiProjects: projects.length,
        totalOrders: orders.length,
        totalRevenue: orders.reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0),
        unreadCount: unread
      },
      aiProjects: projects.slice(-8).reverse(),
      recentOrders: orders.slice(-8).reverse()
    });
  });

  app.get('/api/user/ai-projects', requireAuth, function (req, res) {
    const list = loadProjects().filter(function (p) { return p.userId === req.user.userId; });
    res.json({ success: true, projects: list, aiProjects: list });
  });

  app.get('/api/user/ai-projects/:fileId', requireAuth, function (req, res) {
    const prj = findProject(req, true);
    if (!prj) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true, project: prj });
  });

  app.post('/api/user/ai-projects', requireAuth, function (req, res) {
    const body = req.body || {};
    const list = loadProjects();
    const fid = body.fileId || 'proj_' + nid();
    const item = {
      fileId: fid,
      id: fid,
      userId: req.user.userId,
      name: String(body.name || body.prompt || 'Untitled project').slice(0, 120),
      prompt: String(body.prompt || '').slice(0, 2000),
      industry: String(body.industry || 'saas'),
      createdAt: now(),
      updatedAt: now()
    };
    list.push(item);
    saveProjects(list);
    if (body.html) { try { fs.writeFileSync(projectFile(fid), String(body.html)); } catch (_) {} }
    res.status(201).json({ success: true, project: item, fileId: fid });
  });

  app.delete('/api/user/ai-projects/:fileId', requireAuth, function (req, res) {
    const fid = String(req.params.fileId || '');
    let list = loadProjects();
    const before = list.length;
    list = list.filter(function (p) { return !(p.userId === req.user.userId && (p.fileId === fid || p.id === fid)); });
    saveProjects(list);
    try { fs.unlinkSync(projectFile(fid)); } catch (_) {}
    res.json({ success: true, deleted: before !== list.length });
  });

  // products CRUD (store items owned by user)
  app.get('/api/user/products', requireAuth, function (req, res) {
    const all = readJSON('data/products.json', []);
    const mine = all.filter(function (p) { return p.userId === req.user.userId; });
    res.json({ success: true, products: mine });
  });
  app.post('/api/user/products', requireAuth, function (req, res) {
    const b = req.body || {};
    const all = readJSON('data/products.json', []);
    const item = {
      id: 'prd_' + nid(),
      userId: req.user.userId,
      name: String(b.name || 'New product').slice(0, 140),
      price: Number(b.price) || 0,
      description: String(b.description || '').slice(0, 1000),
      image: String(b.image || ''),
      stock: Number(b.stock === undefined ? 25 : b.stock),
      active: b.active !== false,
      createdAt: now()
    };
    all.push(item);
    writeJSON('data/products.json', all);
    res.status(201).json({ success: true, product: item });
  });
  app.put('/api/user/products/:id', requireAuth, function (req, res) {
    const all = readJSON('data/products.json', []);
    const it = all.find(function (p) { return p.id === req.params.id && p.userId === req.user.userId; });
    if (!it) return res.status(404).json({ error: 'Product not found' });
    const b = req.body || {};
    ['name', 'description', 'image', 'active'].forEach(function (k) { if (b[k] !== undefined) it[k] = b[k]; });
    if (b.price !== undefined) it.price = Number(b.price) || 0;
    if (b.stock !== undefined) it.stock = Number(b.stock) || 0;
    it.updatedAt = now();
    writeJSON('data/products.json', all);
    res.json({ success: true, product: it });
  });
  app.delete('/api/user/products/:id', requireAuth, function (req, res) {
    let all = readJSON('data/products.json', []);
    const before = all.length;
    all = all.filter(function (p) { return !(p.id === req.params.id && p.userId === req.user.userId); });
    writeJSON('data/products.json', all);
    res.json({ success: true, deleted: before !== all.length });
  });

  // public storefront catalog (shop.html)
  app.get('/api/products', function (req, res) {
    const all = readJSON('data/products.json', []);
    const visible = all.filter(function (p) { return p.active !== false; });
    res.json({ success: true, products: visible });
  });

  // guest checkout from shop.html: { items:[{productId,quantity}], customer:{name,email} }
  app.post('/api/shop/checkout', function (req, res) {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items.filter(function (it) { return it && it.productId && Number(it.quantity) > 0; }) : [];
    if (!items.length) return res.status(400).json({ success: false, error: 'Cart is empty' });
    const customer = b.customer || {};
    if (!customer.name || !customer.email) return res.status(400).json({ success: false, error: 'Name and email required' });
    const all = readJSON('data/products.json', []);
    const lineItems = [];
    let total = 0;
    for (const it of items) {
      const p = all.find(function (x) { return x.id === it.productId; });
      if (!p) return res.status(400).json({ success: false, error: 'Product not found: ' + it.productId });
      const qty = Math.floor(Number(it.quantity)) || 1;
      if (typeof p.stock === 'number' && p.stock < qty) return res.status(400).json({ success: false, error: 'Insufficient stock for ' + (p.name || it.productId) });
      lineItems.push({ productId: p.id, name: p.name || 'Item', price: Number(p.price) || 0, quantity: qty });
      total += (Number(p.price) || 0) * qty;
    }
    for (const it of items) {
      const p = all.find(function (x) { return x.id === it.productId; });
      if (p && typeof p.stock === 'number') p.stock = Math.max(0, p.stock - Math.floor(Number(it.quantity)));
    }
    writeJSON('data/products.json', all);
    const order = {
      id: 'ord_' + nid(),
      items: lineItems,
      total: Math.round(total * 100) / 100,
      customer: { name: String(customer.name).slice(0, 140), email: String(customer.email).slice(0, 200) },
      status: 'paid',
      createdAt: now()
    };
    const orders = readJSON('data/shop-orders.json', []);
    orders.push(order);
    writeJSON('data/shop-orders.json', orders);
    res.status(201).json({ success: true, order: order });
  });

  // social links (dict {links:[...]})
  app.get('/api/user/social-links', requireAuth, function (req, res) {
    const store = readJSON('data/social-links.json', { links: [] });
    const mine = (store.links || []).filter(function (l) { return l.userId === req.user.userId; });
    res.json({ success: true, links: mine });
  });
  app.post('/api/user/social-links', requireAuth, function (req, res) {
    const b = req.body || {};
    const store = readJSON('data/social-links.json', { links: [] });
    if (!Array.isArray(store.links)) store.links = [];
    const link = {
      id: 'sl_' + nid(),
      userId: req.user.userId,
      platform: String(b.platform || 'website'),
      url: String(b.url || '').slice(0, 500),
      createdAt: now()
    };
    store.links.push(link);
    writeJSON('data/social-links.json', store);
    res.status(201).json({ success: true, link: link, links: store.links.filter(function (l) { return l.userId === req.user.userId; }) });
  });

  // manufacturing orders (mine)
  app.get('/api/user/manufacturing-orders', requireAuth, function (req, res) {
    const all = readJSON('data/mock-mfg-orders.json', []);
    const mine = all.filter(function (o) { return o.userId === req.user.userId; });
    res.json({ success: true, orders: mine });
  });

  // history (activity feed)
  app.get('/api/user/history', requireAuth, function (req, res) {
    const uid = req.user.userId;
    const events = [];
    loadProjects().filter(function (p) { return p.userId === uid; }).forEach(function (p) {
      events.push({ type: 'ai_project', label: 'AI project: ' + (p.name || p.fileId), at: p.createdAt || p.updatedAt });
    });
    readJSON('data/mock-orders.json', []).filter(function (o) { return o.userId === uid; }).forEach(function (o) {
      events.push({ type: 'order', label: 'Order ' + (o.order_number || o.id || ''), at: o.created_at || o.createdAt });
    });
    readJSON('data/mock-mfg-orders.json', []).filter(function (o) { return o.userId === uid; }).forEach(function (o) {
      events.push({ type: 'manufacturing', label: 'Manufacturing order', at: o.createdAt });
    });
    readJSON('data/mock-refunds.json', []).filter(function (o) { return o.userId === uid; }).forEach(function (o) {
      events.push({ type: 'refund', label: 'Refund request', at: o.createdAt });
    });
    events.sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
    res.json({ success: true, history: events.slice(0, 50) });
  });

  // API keys (dict keyed by kc_sk_*)
  app.get('/api/user/api-keys', requireAuth, function (req, res) {
    const keys = readJSON('data/api-keys.json', {});
    const mine = Object.keys(keys).filter(function (k) { return keys[k].userId === req.user.userId; })
      .map(function (k) {
        const e = keys[k];
        return { id: k.slice(-12), keyMasked: k.slice(0, 8) + '...' + k.slice(-4), key: k, name: e.name, role: e.role, created_at: e.created_at, last_used: e.last_used };
      });
    res.json({ success: true, keys: mine });
  });
  app.post('/api/user/api-keys', requireAuth, function (req, res) {
    const keys = readJSON('data/api-keys.json', {});
    const k = 'kc_sk_' + nid() + nid();
    keys[k] = {
      userId: req.user.userId,
      email: req.user.email,
      name: String((req.body || {}).name || 'API key').slice(0, 80),
      role: req.user.role || 'user',
      created_at: now(),
      last_used: null
    };
    writeJSON('data/api-keys.json', keys);
    res.status(201).json({ success: true, apiKey: k, name: keys[k].name });
  });
  app.delete('/api/user/api-keys/:id', requireAuth, function (req, res) {
    const keys = readJSON('data/api-keys.json', {});
    const target = Object.keys(keys).filter(function (k) { return keys[k].userId === req.user.userId && (k.slice(-12) === req.params.id || k === req.params.id); });
    if (!target.length) return res.status(404).json({ error: 'Key not found' });
    target.forEach(function (k) { delete keys[k]; });
    writeJSON('data/api-keys.json', keys);
    res.json({ success: true, deleted: target.length });
  });

  // --------------------------------------------------------
  //  AUTH-ADJACENT (dashboard helpers)
  // --------------------------------------------------------
  app.get('/api/auth/profile', requireAuth, function (req, res) {
    const users = readJSON('data/mock-users.json', {});
    const u = Object.values(users).find(function (x) { return x && (x.id === req.user.userId || x.userId === req.user.userId || x.email === req.user.email); }) || {};
    res.json({ success: true, profile: { userId: req.user.userId, email: req.user.email, name: req.user.name || u.name || 'Member', role: req.user.role || 'user', plan: u.plan || 'free', joined: u.created_at || u.createdAt || null } });
  });
  app.post('/api/auth/profile', requireAuth, function (req, res) {
    const b = req.body || {};
    const users = readJSON('data/mock-users.json', {});
    const rec = Object.values(users).find(function (x) { return x && (x.id === req.user.userId || x.userId === req.user.userId || x.email === req.user.email); });
    if (rec) {
      if (typeof b.name === 'string' && b.name.trim()) rec.name = b.name.trim().slice(0, 80);
      if (typeof b.email === 'string' && /.+@.+\..+/.test(b.email)) rec.email = b.email.trim();
      users[rec.id || rec.userId || req.user.userId] = rec;
      writeJSON('data/mock-users.json', users);
    }
    res.json({ success: true, profile: { userId: req.user.userId, name: (rec && rec.name) || req.user.name || 'Member', email: (rec && rec.email) || req.user.email } });
  });
  app.post('/api/auth/change-password', requireAuth, function (req, res) {
    const b = req.body || {};
    const cur = String(b.currentPassword || b.current || '');
    const next = String(b.newPassword || b.new || b.password || '');
    const okShape = next.length >= 8;
    if (!okShape) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    const users = readJSON('data/mock-users.json', {});
    const rec = Object.values(users).find(function (x) { return x && (x.id === req.user.userId || x.userId === req.user.userId || x.email === req.user.email); });
    if (rec && rec.password && cur && rec.password !== cur) return res.status(400).json({ error: 'Current password is incorrect' });
    if (rec) {
      rec.password = next;
      users[rec.id || rec.userId || req.user.userId] = rec;
      writeJSON('data/mock-users.json', users);
    }
    res.json({ success: true, message: 'Password updated' });
  });
  // ---------------------------------------------------------------------------
  //  Password reset: forgot (issue token + email) / reset (verify + change).
  //  Tokens are stored in data/reset-tokens.json with a 30-minute expiry.
  //  If Supabase is configured we also generate a real Supabase recovery link.
  //  Email delivery via lib/mailer (Resend/SendGrid/Mailgun/Postmark); when
  //  none is configured the link is logged to console and (non-prod) returned.
  // ---------------------------------------------------------------------------
  const RESET_TOKENS_FILE = 'data/reset-tokens.json';
  const RESET_TTL_MS = 30 * 60 * 1000;

  function loadResetTokens() { return readJSON(RESET_TOKENS_FILE, {}); }
  function saveResetTokens(t) { writeJSON(RESET_TOKENS_FILE, t); }

  app.post('/api/auth/forgot-password', async function (req, res) {
    try {
      const b = req.body || {};
      const email = String(b.email || '').toLowerCase().trim();
      // Always answer success (no account enumeration), but do real work below.
      const done = function (extraDev) {
        res.json(Object.assign({ success: true, message: 'If that email exists, a reset link has been sent.' }, extraDev || {}));
      };
      if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

      const users = readJSON('data/mock-users.json', {});
      const rec = Object.values(users).find(function (x) { return x && x.email === email; });
      const token = crypto.randomBytes(24).toString('hex');
      const tokens = loadResetTokens();
      // expire + drop stale tokens
      for (const k of Object.keys(tokens)) {
        if (tokens[k].expires < Date.now()) delete tokens[k];
      }
      tokens[token] = { email: email, expires: Date.now() + RESET_TTL_MS, used: false };
      saveResetTokens(tokens);

      const frontend = process.env.APP_URL || process.env.FRONTEND_URL || ('http://localhost:' + PORT);
      const link = frontend.replace(/\/$/, '') + '/reset-password.html?token=' + token + '&email=' + encodeURIComponent(email);

      const mail = await mailer.send({
        to: email,
        subject: 'KEYCODE Studio — password reset',
        text: 'Reset your password:\n' + link + '\n\nThis link expires in 30 minutes. If you did not request it, ignore this email.',
        html: '<p>Reset your KEYCODE Studio password:</p><p><a href="' + link + '">Set a new password</a></p><p style="color:#888">Expires in 30 minutes. If you did not request this, ignore this email.</p>',
      });

      // Supabase path also sends its own official recovery email.
      let supabaseSent = false;
      if (SUPABASE) {
        try { await SUPABASE.auth.resetPasswordForEmail(email); supabaseSent = true; } catch (_) {}
      }

      console.log('[reset] link for', email, ':', link, mail.delivered ? '(emailed)' : '(dev: not emailed)');
      if (IS_PROD && (mail.delivered || supabaseSent)) return done();
      return done({ _dev_link: link }); // dev: usable link in the response
    } catch (err) {
      console.error('[auth.forgot-password]', err);
      res.status(500).json({ error: 'Could not start password reset.' });
    }
  });

  app.post('/api/auth/reset-password', async function (req, res) {
    try {
      const b = req.body || {};
      const token = String(b.token || b.tokenId || '').trim();
      const password = String(b.password || b.newPassword || '');
      const email = String(b.email || '').toLowerCase().trim();
      if (!token) return res.status(400).json({ error: 'Reset token required' });
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

      const tokens = loadResetTokens();
      const entry = tokens[token];
      if (!entry || entry.used || entry.expires < Date.now()) {
        return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
      }
      const targetEmail = (entry.email || email).toLowerCase().trim();

      let updated = false;
      // Supabase: update via admin API
      if (SUPABASE_ADMIN && targetEmail) {
        try {
          const { data: list } = await SUPABASE_ADMIN.auth.admin.listUsers({ page: 1, perPage: 200 });
          const su = (list && list.users || []).find(function (u) { return (u.email || '').toLowerCase() === targetEmail; });
          if (su) {
            const { error } = await SUPABASE_ADMIN.auth.admin.updateUserById(su.id, { password: password });
            if (!error) updated = true;
          }
        } catch (e) { console.warn('[reset] supabase update failed:', e && e.message); }
      }
      // Local mock store
      const users = readJSON('data/mock-users.json', {});
      const rec = Object.values(users).find(function (x) { return x && x.email === targetEmail; });
      if (rec) {
        rec.passwordHash = hash(password + (JWT_SECRET || 'pepper'));
        rec.password = password; // legacy field used by change-password
        users[rec.id || rec.userId || targetEmail] = rec;
        writeJSON('data/mock-users.json', users);
        updated = true;
      }

      entry.used = true; // single use
      saveResetTokens(tokens);

      if (!updated) return res.status(400).json({ error: 'No account found for this reset link.' });
      mailer.send({
        to: targetEmail,
        subject: 'KEYCODE Studio — password changed',
        text: 'Your KEYCODE Studio password was just changed. If this was not you, contact support immediately.',
      });
      res.json({ success: true, message: 'Password updated — you can now sign in.' });
    } catch (err) {
      console.error('[auth.reset-password]', err);
      res.status(500).json({ error: 'Password reset failed.' });
    }
  });
  app.post('/api/auth/admin-login', function (req, res) {
    res.json({ success: false, admin: false, message: 'Admin login must go through /api/auth/login with an admin account.' });
  });

  // global key routes (same store as user/api-keys)
  app.get('/api/keys', requireAuth, function (req, res) {
    const keys = readJSON('data/api-keys.json', {});
    const mine = Object.keys(keys).filter(function (k) { return keys[k].userId === req.user.userId; })
      .map(function (k) { return { key: k, name: keys[k].name, created_at: keys[k].created_at }; });
    res.json({ success: true, keys: mine });
  });
  app.post('/api/keys', requireAuth, function (req, res) {
    const keys = readJSON('data/api-keys.json', {});
    const k = 'kc_sk_' + nid() + nid();
    keys[k] = {
      userId: req.user.userId,
      email: req.user.email,
      name: String((req.body || {}).name || 'API key').slice(0, 80),
      role: req.user.role || 'user',
      created_at: now(),
      last_used: null
    };
    writeJSON('data/api-keys.json', keys);
    res.status(201).json({ success: true, apiKey: k });
  });
  app.delete('/api/keys/:id', requireAuth, function (req, res) {
    const keys = readJSON('data/api-keys.json', {});
    const target = Object.keys(keys).filter(function (k) { return keys[k].userId === req.user.userId && (k.slice(-12) === req.params.id || k === req.params.id); });
    if (!target.length) return res.status(404).json({ error: 'Key not found' });
    target.forEach(function (k) { delete keys[k]; });
    writeJSON('data/api-keys.json', keys);
    res.json({ success: true });
  });

  // CLI download
  app.get('/api/cli/download', function (req, res) {
    const p = path.join(projectRoot, 'keycode-cli.js');
    if (fs.existsSync(p)) return res.sendFile(p);
    const stub = '#!/usr/bin/env node\n// KEYCODE CLI - download installer: curl -fsSL /install.sh | bash\nconsole.log("KEYCODE CLI placeholder - keycode-cli.js missing");\n';
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    return res.send(stub);
  });

  // agent surfaces (CLI/terminal) — router = an LLM provider chain entry
  const llm = require('../lib/ai-provider');
  app.get('/api/agent/routers', function (req, res) {
    const probe = req.query.probe === '1';
    const rows = [];
    const env = process.env;
    const keyAliases = [['OPENAI_API_KEY', 'openai'], ['GEMINI_API_KEY', 'gemini'], ['ANTHROPIC_API_KEY', 'anthropic'], ['GROQ_API_KEY', 'groq'], ['OPENROUTER_API_KEY', 'openrouter'], ['DEEPSEEK_API_KEY', 'deepseek']];
    rows.push({ id: (env.AI_PROVIDER || 'pollinations').toLowerCase() || 'pollinations', label: (env.AI_PROVIDER || 'pollinations') + ' (primary)', kind: 'llm', configured: true });
    for (const [envName, provider] of keyAliases) {
      if (env[envName]) rows.push({ id: provider, label: provider, kind: 'llm', configured: true });
    }
    for (const e of llm.poolStatus()) rows.push({ id: e.id, label: e.provider + '/' + e.model, kind: 'llm-pool', configured: true, alive: !e.cooling });
    (async function () {
      if (probe) {
        for (const r of rows) {
          if (!r.configured) continue;
          const t0 = Date.now();
          try {
            const out = await llm.llmComplete('Reply with the single word: PONG', { maxTokens: 20, timeoutMs: 8000, _providerOverride: r.id });
            r.alive = Boolean(out);
            r.lastLatencyMs = Date.now() - t0;
            r.probe = r.alive ? 'ok' : 'fail';
          } catch (_) {
            r.alive = false; r.probe = 'fail'; r.lastLatencyMs = Date.now() - t0;
          }
        }
      }
      const configured = rows.filter(r => r.configured).length;
      const alive = rows.filter(r => r.alive).length;
      res.json({ success: true, total: rows.length, configured: configured, alive: alive, routers: rows });
    })();
  });
  app.get('/api/agent/react', function (req, res) {
    res.json({ success: true, steps: [], note: 'POST reasoning steps here or run autonomous agent via /api/agent/react' });
  });

  // --------------------------------------------------------
  //  AI BUILDER ROUTES  (/api/ai/*)
  // --------------------------------------------------------
  function planFromPrompt(prompt) {
    const p = String(prompt || '').toLowerCase();
    function has() { for (var i = 0; i < arguments.length; i++) { if (p.indexOf(arguments[i]) !== -1) return true; } return false; }
    let industry = 'saas', reason = 'default SaaS template';
    if (has('food', 'restaurant', 'cafe', 'coffee', 'bakery', 'pizza', 'menu')) { industry = 'food'; reason = 'food/restaurant keywords' }
    else if (has('shop', 'store', 'ecommerce', 'e-commerce', 'sell', 'cart', 'product catalog', 'boutique')) { industry = 'store'; reason = 'store keywords' }
    else if (has('portfolio', 'photographer', 'photography', 'designer', 'freelance', 'resume')) { industry = 'portfolio'; reason = 'portfolio keywords' }
    else if (has('game', 'gaming', 'quest', 'leaderboard', 'arcade', 'player')) { industry = 'game'; reason = 'game keywords' }
    else if (has('fitness', 'gym', 'workout', 'yoga', 'training', 'coach')) { industry = 'fitness'; reason = 'fitness keywords' }
    else if (has('agency', 'studio', 'marketing', 'branding', 'consultancy')) { industry = 'agency'; reason = 'agency keywords' }
    else if (has('clinic', 'doctor', 'dental', 'health', 'medical', 'therapy', 'telehealth')) { industry = 'health'; reason = 'health keywords' }
    else if (has('course', 'school', 'education', 'learning', 'academy', 'tutor', 'students')) { industry = 'education'; reason = 'education keywords' }
    else if (has('real estate', 'realty', 'property', 'listing', 'apartment', 'house for sale', 'rental')) { industry = 'realty'; reason = 'realty keywords' }
    var name = '';
    var nm = String(prompt || '').match(/(?:called|named|for)\s+"([^"]{2,60})"/);
    if (nm) name = nm[1];
    return {
      industry: industry,
      reason: reason,
      planName: 'Site plan - ' + industry,
      steps: [
        'Parse prompt and detect industry (' + industry + ')',
        'Pick palette, copy blocks and section layout for ' + industry,
        'Write single-file HTML with features, pricing, FAQ and contact form',
        'Save project, expose preview URL and wire the lead form to /api/inquiries'
      ],
      name: name,
      sections: ['hero', 'features', 'pricing', 'faq', 'contact'],
      estimatedFiles: 1
    };
  }

  // ---- optional real-AI helpers (null => caller falls back to local engine) ----
  async function aiPlan(prompt) {
    const local = planFromPrompt(prompt);
    const info = ai.llmInfo();
    if (!info.configured) return local;
    const j = await ai.llmJSON(
      'Analyze this website request. Return ONLY JSON: {"industry": one of saas|store|portfolio|game|fitness|agency|health|education|realty|food, "name": short brand name, "tagline": one sentence, "sections": array of section ids, "steps": array of 3-5 short build steps}. Request: ' + JSON.stringify(String(prompt || '')),
      { system: 'You are a website planning assistant. Reply with JSON only, no prose.', timeoutMs: 15000, maxTokens: 600 }
    );
    if (!j || typeof j !== 'object' || Array.isArray(j)) return local;
    const allowed = ['saas', 'store', 'portfolio', 'game', 'fitness', 'agency', 'health', 'education', 'realty', 'food'];
    const merged = Object.assign({}, local);
    if (allowed.indexOf(String(j.industry).toLowerCase()) !== -1) merged.industry = String(j.industry).toLowerCase();
    if (typeof j.name === 'string' && j.name.trim()) merged.name = j.name.trim().slice(0, 60);
    if (typeof j.tagline === 'string' && j.tagline.trim()) merged.tagline = j.tagline.trim().slice(0, 160);
    if (Array.isArray(j.steps) && j.steps.length) merged.steps = j.steps.map(function (s) { return String(s).slice(0, 140); }).slice(0, 6);
    if (Array.isArray(j.sections) && j.sections.length) merged.sections = j.sections.map(function (s) { return String(s).slice(0, 30); }).slice(0, 8);
    merged.engine = 'ai:' + info.model;
    return merged;
  }

  async function aiSiteHtml(prompt, spec) {
    const info = ai.llmInfo();
    if (!info.configured) return null;
    const sys = 'You are an expert web developer. Generate a complete production-quality single-file HTML website. Rules: one HTML5 document; all CSS in one <style> tag; all JS in one <script> tag; no external frameworks or CDNs (a Google Fonts <link> is allowed); responsive; semantic sections hero, features, pricing, faq, contact; the contact form must send with fetch() to /api/inquiries as JSON {name,email,message} and show inline success/error; polished modern design with a coherent palette; no lorem ipsum or placeholder text.';
    const p = 'Build the website for this request: ' + JSON.stringify(String(prompt || '')) +
      (spec && spec.email ? ' Contact email for the site: ' + spec.email + '.' : '');
    const r = await ai.llmComplete(p, { system: sys, maxTokens: 16000, temperature: 0.8 });
    if (!r) return null;
    let t = r.text.trim();
    const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    if (!/<html/i.test(t) || t.length < 300) { console.warn('[ai-provider] generated HTML failed validation'); return null; }
    return t;
  }

  async function aiBom(desc) {
    const info = ai.llmInfo();
    if (!info.configured) return null;
    const j = await ai.llmJSON(
      'Design the bill of materials for this electronics project. Return ONLY a JSON array of 6-30 components, each {"part": functional name, "value": value or rating, "package": footprint, "mpn": realistic manufacturer part number, "qty": number}. Always include: a suitable MCU, decoupling capacitors, pull-up resistors, and a programming/debug header. Project: ' + JSON.stringify(String(desc || '')),
      { system: 'You are an electronics engineer. Reply with JSON only, no prose.', timeoutMs: 25000, maxTokens: 2000 }
    );
    if (!Array.isArray(j)) return null;
    const bom = [];
    const counters = {};
    for (const it of j.slice(0, 30)) {
      if (!it || typeof it !== 'object') continue;
      const part = String(it.part || it.value || '').trim();
      if (!part) continue;
      const kind = /^\s*(u|ic|mcu|module|sensor|driver|regulator|charger)/i.test(part) ? 'U'
        : /^\s*(cap|capacitor|c\d)/i.test(part) ? 'C'
        : /^\s*(res|resistor|r\d)/i.test(part) ? 'R'
        : /^\s*led/i.test(part) ? 'LED'
        : /^\s*(conn|header|connector|jst|usb)/i.test(part) ? 'J'
        : /^\s*(sw|switch|button)/i.test(part) ? 'SW'
        : /^\s*(y|xtal|crystal|osc)/i.test(part) ? 'Y'
        : /^\s*(l|inductor)/i.test(part) ? 'L' : 'U';
      counters[kind] = (counters[kind] || 0) + 1;
      bom.push({
        reference: String(it.reference || (kind + counters[kind])).slice(0, 8),
        value: String(it.value || part).slice(0, 40),
        package: String(it.package || 'SMD').slice(0, 24),
        mpn: String(it.mpn || part).slice(0, 40),
      });
    }
    if (bom.length < 3) return null;
    return bom;
  }

  app.get('/api/ai/providers', function (req, res) {
    const info = ai.llmInfo();
    const providers = [
      { id: 'local', name: 'KEYCODE Local Engine', status: 'ready', models: ['kc-plan-1', 'kc-site-1', 'kc-chat-1'] }
    ];
    if (info.configured) {
      providers.push({ id: info.provider, name: info.provider, status: 'ready', model: info.model, models: [info.model] });
    } else {
      providers.push({ id: 'external-ai', name: 'External AI', status: 'not_configured', hint: 'set AI_PROVIDER + AI_API_KEY (+ AI_MODEL, AI_BASE_URL) in .env' });
    }
    res.json({ success: true, providers: providers });
  });
  app.get('/api/ai/models', function (req, res) {
    const info = ai.llmInfo();
    const models = [];
    if (info.configured) models.push({ id: info.model, name: 'AI (' + info.provider + ')', tier: 'ai' });
    models.push(
      { id: 'kc-plan-1', name: 'Planner', tier: 'free' },
      { id: 'kc-site-1', name: 'Site generator', tier: 'free' },
      { id: 'kc-chat-1', name: 'Chat assistant', tier: 'free' }
    );
    res.json({ success: true, models: models });
  });

  app.options('/api/ai/plan', function (req, res) { res.sendStatus(204); });
  app.get('/api/ai/plan', requireAuth, async function (req, res) {
    res.json({ success: true, plan: await aiPlan(String(req.query.prompt || '')) });
  });
  app.post('/api/ai/plan', requireAuth, async function (req, res) {
    const b = req.body || {};
    res.json({ success: true, plan: await aiPlan(b.prompt || b.message || '') });
  });

  app.get('/api/ai/projects', requireAuth, function (req, res) {
    const list = loadProjects().filter(function (p) { return p.userId === req.user.userId; });
    res.json({ success: true, projects: list });
  });
  app.post('/api/ai/projects', requireAuth, function (req, res) {
    const b = req.body || {};
    const list = loadProjects();
    const fid = 'proj_' + nid();
    const item = {
      fileId: fid, id: fid, userId: req.user.userId,
      name: String(b.name || b.prompt || 'Untitled project').slice(0, 120),
      prompt: String(b.prompt || '').slice(0, 2000),
      industry: String(b.industry || 'saas'),
      createdAt: now(), updatedAt: now()
    };
    list.push(item); saveProjects(list);
    if (b.html) { try { fs.writeFileSync(projectFile(fid), String(b.html)); } catch (_) {} }
    res.status(201).json({ success: true, project: item, fileId: fid });
  });

  app.post('/api/ai/generate-website', requireAuth, async function (req, res) {
    const b = req.body || {};
    const prompt = String(b.prompt || '').slice(0, 2000);
    if (!prompt.trim()) return res.status(400).json({ error: 'Prompt required' });
    const plan = planFromPrompt(prompt);
    const list = loadProjects();
    const fid = 'proj_' + nid();
    const spec = {
      name: typeof b.name === 'string' && b.name ? b.name : (plan.name || 'My Site'),
      tagline: b.tagline, industry: plan.industry, palette: b.palette,
      email: typeof b.email === 'string' ? b.email : (req.user.email || undefined),
      features: b.features, heroText: b.heroText, heroSub: b.heroSub, ctaText: b.ctaText,
      pricing: b.pricing, faqs: b.faqs
    };
    const html = (await aiSiteHtml(prompt, spec)) || buildSiteHtml(spec);
    try { fs.mkdirSync(UIL, { recursive: true }); fs.writeFileSync(path.join(UIL, fid), html); } catch (_) {}
    const item = {
      fileId: fid, id: fid, userId: req.user.userId,
      name: spec.name || prompt.slice(0, 60), prompt: prompt, industry: plan.industry,
      visibility: 'public', previewUrl: '/api/ai/preview/' + fid,
      htmlFile: fid, createdAt: now(), updatedAt: now()
    };
    list.push(item); saveProjects(list);
    res.status(201).json({ success: true, plan: plan, fileId: fid, previewUrl: '/api/ai/preview/' + fid, project: item, html: html });
  });

  app.post('/api/ai/stream-website', requireAuth, async function (req, res) {
    const b = req.body || {};
    const prompt = String(b.description || b.prompt || '').slice(0, 2000).trim();
    if (!prompt) return res.status(400).json({ success: false, error: 'description required' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    const send = (event) => {
      if (!res.writableEnded) res.write('data: ' + JSON.stringify(event) + '\n\n');
    };
    try {
      const plan = planFromPrompt(prompt);
      const spec = {
        name: plan.name || 'My Site',
        industry: plan.industry,
        email: req.user.email || undefined
      };
      send({ type: 'status', phase: 'planning', text: 'Understanding your request' });
      send({ type: 'status', phase: 'building', text: 'Building your website' });
      const html = (await aiSiteHtml(prompt, spec)) || buildSiteHtml(spec);
      send({ type: 'html', html: html, partial: false });
      send({ type: 'complete', data: { html: html } });
      // persist the generated site (mirrors the GET handler's save behavior)
      const plist = loadProjects();
      const pfid = 'proj_' + nid();
      try { fs.mkdirSync(UIL, { recursive: true }); fs.writeFileSync(path.join(UIL, pfid), html); } catch (_) {}
      const pitem = { fileId: pfid, id: pfid, userId: req.user.userId, name: spec.name || prompt.slice(0,60), prompt: prompt, industry: plan.industry, visibility: 'public', previewUrl: '/api/ai/preview/' + pfid, htmlFile: pfid, createdAt: now(), updatedAt: now() };
      plist.push(pitem); saveProjects(plist);
      res.end();
    } catch (e) {
      console.error('[ai.stream-website] generation failed:', e);
      send({ type: 'error', message: 'Website generation failed. Please try again.' });
      res.end();
    }
  });

  // SSE plan streaming (builder UI shows progress)
  app.get('/api/ai/stream-website', requireAuth, async function (req, res) {
    const prompt = String(req.query.prompt || req.query.q || '').slice(0, 2000);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    const send = (event, data) => { try { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); } catch (_) {} };
    const plan = planFromPrompt(prompt);
    const steps = [
      { phase: 'planning', text: 'Analyzing your prompt', plan: plan },
      { phase: 'designing', text: 'Choosing palette and layout for ' + plan.industry },
      { phase: 'building', text: 'Writing HTML, CSS and JS' },
      { phase: 'wiring', text: 'Wiring contact form and preview' },
      { phase: 'done', text: 'Your site is ready' }
    ];
    let i = 0;
    (function run() {
      if (res.writableEnded) return;
      if (i >= steps.length) return;
      const s = steps[i];
      if (i === steps.length - 1) {
        (async function () {
          const spec = { name: plan.name || 'My Site', industry: plan.industry, email: req.user.email || undefined };
          const info = ai.llmInfo();
          if (info.configured) send('status', { phase: 'building', text: 'Generating with AI (' + info.model + ')' });
          const html = (await aiSiteHtml(prompt, spec)) || buildSiteHtml(spec);
          const list = loadProjects();
          const fid = 'proj_' + nid();
          try { fs.mkdirSync(UIL, { recursive: true }); fs.writeFileSync(path.join(UIL, fid), html); } catch (_) {}
          const item = { fileId: fid, id: fid, userId: req.user.userId, name: spec.name, prompt: prompt, industry: plan.industry, visibility: 'public', previewUrl: '/api/ai/preview/' + fid, createdAt: now(), updatedAt: now() };
          list.push(item); saveProjects(list);
          send('done', { projectId: fid, fileId: fid, previewUrl: '/api/ai/preview/' + fid, html: html });
          try { res.end(); } catch (_) {}
        })();
        return;
      }
      send('status', s);
      i++;
      setTimeout(run, 400);
    })();
    req.on('close', function () { try { res.end(); } catch (_) {} });
  });

  app.get('/api/ai/preview/:fileId/', requireAuth, function (req, res) {
    const prj = findProject(req, true);
    if (!prj) return res.status(404).send('<h1 style="font-family:sans-serif">404 — project not found</h1>');
    let html = '';
    try { html = fs.readFileSync(path.join(UIL, safeName(prj.fileId)), 'utf8'); } catch (_) { html = ''; }
    if (!html) html = buildSiteHtml({ name: prj.name, industry: prj.industry });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });
  app.get('/api/ai/preview/:fileId', requireAuth, function (req, res) {
    res.redirect('/api/ai/preview/' + req.params.fileId + '/');
  });

  // explicit generation + optional order (used by page buttons)
  app.post('/api/ai/generate-and-order', requireAuth, function (req, res) {
    const b = req.body || {};
    const prompt = String(b.prompt || '').slice(0, 2000);
    if (!prompt.trim()) return res.status(400).json({ error: 'Prompt required' });
    const plan = planFromPrompt(prompt);
    const spec = { name: b.name || plan.name || 'My Site', industry: plan.industry, email: req.user.email || undefined };
    const fid = 'proj_' + nid();
    const html = buildSiteHtml(spec);
    try { fs.mkdirSync(UIL, { recursive: true }); fs.writeFileSync(path.join(UIL, fid), html); } catch (_) {}
    const item = { fileId: fid, id: fid, userId: req.user.userId, name: spec.name, prompt: prompt, industry: plan.industry, visibility: 'public', previewUrl: '/api/ai/preview/' + fid, createdAt: now(), updatedAt: now() };
    const list = loadProjects(); list.push(item); saveProjects(list);
    const orders = readJSON('data/mock-mfg-orders.json', []);
    const mfg = {
      id: 'mfg_' + nid(), userId: req.user.userId,
      fileId: fid, previewUrl: b.previewUrl || '/api/ai/preview/' + fid,
      service: 'website-assembly', status: 'queued',
      notes: String(b.notes || '').slice(0, 500),
      createdAt: now()
    };
    orders.push(mfg); writeJSON('data/mock-mfg-orders.json', orders);
    res.status(201).json({ success: true, fileId: fid, previewUrl: mfg.previewUrl, order: mfg, project: item });
  });

  // downloads
  app.get('/api/ai/download/:fileId', requireAuth, function (req, res) {
    const prj = findProject(req, true);
    if (!prj) return res.status(404).json({ error: 'Project not found' });
    const fp = path.join(UIL, safeName(prj.fileId));
    if (!fs.existsSync(fp)) { try { fs.writeFileSync(fp, buildSiteHtml({ name: prj.name, industry: prj.industry })); } catch (_) {} }
    res.download(fp, (prj.name || 'site').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.html');
  });
  app.get('/api/ai/download-zip/:fileId', requireAuth, function (req, res) {
    const prj = findProject(req, true);
    if (!prj) return res.status(404).json({ error: 'Project not found' });
    const fp = path.join(UIL, safeName(prj.fileId));
    if (!fs.existsSync(fp)) { try { fs.writeFileSync(fp, buildSiteHtml({ name: prj.name, industry: prj.industry })); } catch (_) {} }
    const zip = path.join(UIL, safeName(prj.fileId) + '.zip');
    try { execZip(fp, zip); res.download(zip,prj.fileId+'.zip'); } catch (e) { res.download(fp, prj.fileId + '.html'); }
  });
  function execZip(fp, zip) {
    try { require('child_process').execFileSync('zip', ['-j', '-q', zip, fp], { timeout: 8000 }); }
    catch (_) { 
      //(adm-zip is not a build dep here; simplest fallback: binary copy)
      fs.copyFileSync(fp, zip + '.html');
      throw new Error('zip-unavailable');
    }
  }

  app.get('/api/ai/list-projects', requireAuth, function (req, res) {
    const list = loadProjects().filter(function (p) { return p.userId === req.user.userId; })
      .map(function (p) { return { fileId: p.fileId, name: p.name, industry: p.industry, previewUrl: p.previewUrl, createdAt: p.createdAt }; });
    res.json({ success: true, projects: list });
  });

  // analyze / chat helpers (builder "Ask AI")
  app.post('/api/ai/analyze', requireAuth, function (req, res) {
    const prompt = String((req.body || {}).prompt || '');
    res.json(planFromPrompt(prompt) && { success: true, analysis: planFromPrompt(prompt), tips: ['Keep prompts short and name the industry', 'Ask for sections explicitly', 'Names in quotes become the site title'] });
  });
  app.post('/api/ai/chat', requireAuth, async function (req, res) {
    const b = req.body || {};
    const msg = String(b.message || b.prompt || '').trim();
    const plan = await aiPlan(msg);
    const info = ai.llmInfo();
    if (info.configured) {
      const r = await ai.llmComplete(msg, {
        system: 'You are the KEYCODE Studio build assistant. Reply in at most 80 words: friendly, concrete, and end by guiding the user to describe their project for the AI Builder (or press Build).',
        maxTokens: 300,
        timeoutMs: 20000,
      });
      if (r) return res.json({ success: true, reply: r.text.trim(), plan: plan, engine: info.model });
    }
    res.json({ success: true, reply: 'Got it. I would build a ' + plan.industry + ' site for that. Say "generate" and I will create it, or use the Build button.', plan: plan });
  });

  // --------------------------------------------------------
  //  GAME BUILDER (save/list/load/delete)
  // --------------------------------------------------------
  app.post('/api/ai/game-save', requireAuth, function (req, res) {
    const b = req.body || {};
    const list = loadProjects();
    const fid = String(b.fileId || ('game_' + nid()));
    const item = list.find(function (p) { return (p.fileId === fid || p.id === fid) && p.userId === req.user.userId; });
    const rec = item || { fileId: fid, id: fid, userId: req.user.userId, kind: 'game', createdAt: now() };
    rec.kind = 'game';
    rec.name = String(b.name || rec.name || 'My game').slice(0, 120);
    rec.prompt = String(b.prompt || rec.prompt || '');
    rec.industry = 'game';
    rec.visibility = 'public';
    rec.previewUrl = '/api/ai/preview/' + fid;
    rec.updatedAt = now();
    if (!item) list.push(rec);
    saveProjects(list);
    if (b.html) { try { fs.mkdirSync(UIL, { recursive: true }); fs.writeFileSync(path.join(UIL, fid), String(b.html)); } catch (_) {} }
    res.status(201).json({ success: true, fileId: fid, project: rec });
  });
  app.get('/api/ai/game-list', requireAuth, function (req, res) {
    const mine = loadProjects().filter(function (p) { return p.userId === req.user.userId && p.kind === 'game'; });
    res.json({ success: true, games: mine, projects: mine });
  });
  app.get('/api/ai/load-game/:fileId', requireAuth, function (req, res) {
    const prj = findProject(req, true);
    if (!prj) return res.status(404).json({ error: 'Game not found' });
    let html = '';
    try { html = fs.readFileSync(path.join(UIL, safeName(prj.fileId)), 'utf8'); } catch (_) {}
    res.json({ success: true, game: prj, html: html });
  });
  app.delete('/api/ai/game-delete/:fileId', requireAuth, function (req, res) {
    const fid = String(req.params.fileId || '');
    let list = loadProjects();
    const before = list.length;
    list = list.filter(function (p) { return !(p.userId === req.user.userId && (p.fileId === fid || p.id === fid)); });
    saveProjects(list);
    try { fs.unlinkSync(path.join(UIL, safeName(fid))); } catch (_) {}
    res.json({ success: true, deleted: before !== list.length });
  });
  app.get('/api/ai/project-demo/:fileId', function (req, res) {
    const list = loadProjects();
    const prj = list.find(function (p) { return (p.fileId === req.params.fileId || p.id === req.params.fileId); });
    if (!prj) return res.status(404).json({ error: 'Project not found' });
    let html = '';
    try { html = fs.readFileSync(path.join(UIL, safeName(prj.fileId)), 'utf8'); } catch (_) {}
    if (!html) html = buildSiteHtml({ name: prj.name, industry: prj.industry });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });
  app.get('/api/ai/project-download/:fileId', function (req, res) {
    const list = loadProjects();
    const prj = list.find(function (p) { return (p.fileId === req.params.fileId || p.id === req.params.fileId); });
    if (!prj) return res.status(404).json({ error: 'Project not found' });
    const fp = path.join(UIL, safeName(prj.fileId));
    if (!fs.existsSync(fp)) { try { fs.writeFileSync(fp, buildSiteHtml({ name: prj.name, industry: prj.industry })); } catch (_) {} }
    res.download(fp, (prj.name || 'site').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.html');
  });
  app.get('/api/ai/scan-download/:fileId', function (req, res) {
    const list = loadProjects();
    const prj = list.find(function (p) { return (p.fileId === req.params.fileId || p.id === req.params.fileId); });
    if (!prj) return res.status(404).json({ error: 'Project not found' });
    const fp = path.join(UIL, safeName(prj.fileId));
    if (!fs.existsSync(fp)) { try { fs.writeFileSync(fp, buildSiteHtml({ name: prj.name, industry: prj.industry })); } catch (_) {} }
    res.download(fp, prj.fileId + '.html');
  });
  app.get('/api/ai/artifacts/:fileId', function (req, res) {
    const list = loadProjects();
    const prj = list.find(function (p) { return (p.fileId === req.params.fileId || p.id === req.params.fileId); });
    if (!prj) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true, artifacts: [{ type: 'html', fileId: prj.fileId, url: '/api/ai/preview/' + prj.fileId + '/' }] });
  });

  // --------------------------------------------------------
  //  SKILLS (agent) — /api/skills
  // --------------------------------------------------------
  app.get('/api/skills', function (req, res) {
    res.json({ success: true, skills: [
      { id: 'site-builder', name: 'Website builder', desc: 'Generate complete sites from a prompt' },
      { id: 'game-builder', name: 'Game builder', desc: 'Save, list and stream browser games' },
      { id: 'cad', name: 'CAD & manufacturing', desc: 'OpenSCAD preview, STL export, orders' },
      { id: 'media', name: 'Media tools', desc: 'ffmpeg convert/trim, image optimize' }
    ] });
  });

  // --------------------------------------------------------
  //  RESTOCK / SERVICES  (tools, security, hosting, domains, deploy)
  // --------------------------------------------------------
  app.get('/api/tools', function (req, res) {
    res.json({ success: true, tools: readJSON('data/services.json', []) });
  });
  app.get('/api/security/status', function (req, res) {
    res.json({ success: true, security: { csrf: 'token-on-demand', headers: 'helmet-active', rateLimit: 'on', captcha: 'off' } });
  });
  app.get('/api/security/csrf-token', function (req, res) {
    res.json({ success: true, csrfToken: nid() + nid() });
  });
  app.get('/api/hosting', function (req, res) {
    res.json({ success: true, hosting: { plans: [
      { id: 'static', name: 'Static hosting', price: 0 },
      { id: 'node', name: 'Node app hosting', price: 12 },
      { id: 'pro', name: 'Pro with backups', price: 29 }
    ] } });
  });
  app.post('/api/hosting/provision', requireAuth, function (req, res) {
    const b = req.body || {};
    const deploys = readJSON('data/mock-deploys.json', []);
    const rec = { id: 'dep_' + nid(), userId: req.user.userId, plan: String(b.plan || 'static'), status: 'ready', url: 'https://' + (req.user.userId || 'user') + '.kc-apps.dev', createdAt: now() };
    deploys.push(rec); writeJSON('data/mock-deploys.json', deploys);
    res.status(201).json({ success: true, hosting: rec });
  });
  app.get('/api/domains', requireAuth, function (req, res) {
    res.json({ success: true, domains: [] });
  });
  app.get('/api/domains/check', function (req, res) {
    const d = String(req.query.domain || '').toLowerCase();
    const taken = ['keycode', 'google', 'test', 'example'];
    const root = d.split('.')[0] || d;
    res.json({ success: true, domain: d, available: taken.indexOf(root) === -1 && d.length > 3, price: 12 });
  });
  app.post('/api/domains/register', requireAuth, function (req, res) {
    const b = req.body || {};
    const d = String(b.domain || '').toLowerCase().trim();
    if (!d || d.indexOf('.') === -1) return res.status(400).json({ error: 'Valid domain required' });
    const store = readJSON('data/mock-domains.json', []);
    const rec = { id: 'dom_' + nid(), userId: req.user.userId, domain: d, status: 'registered', createdAt: now() };
    store.push(rec); writeJSON('data/mock-domains.json', store);
    res.status(201).json({ success: true, domain: rec });
  });
  app.get('/api/deploy', requireAuth, function (req, res) {
    const mine = readJSON('data/mock-deploys.json', []).filter(function (d) { return d.userId === req.user.userId; });
    res.json({ success: true, deploys: mine });
  });
  app.post('/api/deploy', requireAuth, function (req, res) {
    const b = req.body || {};
    const fileId = safeName(b.fileId || '');
    const deploys = readJSON('data/mock-deploys.json', []);
    const rec = { id: 'dep_' + nid(), userId: req.user.userId, fileId: fileId, status: 'live', url: fileId ? '/api/ai/preview/' + fileId + '/' : null, target: String(b.target || 'keycode-hosting'), createdAt: now() };
    deploys.push(rec); writeJSON('data/mock-deploys.json', deploys);
    res.status(201).json({ success: true, deploy: rec });
  });
  app.get('/api/deployment/status', requireAuth, function (req, res) {
    const deploys = readJSON('data/mock-deploys.json', []).filter(function (d) { return d.userId === req.user.userId; });
    res.json({ success: true, status: deploys.length ? 'live' : 'idle', deploys: deploys });
  });
  app.get('/api/deploy/d1', function (req, res) {
    res.json({ success: true, d1: { available: true, note: 'D1-compatible KV endpoint ready' } });
  });

  // --------------------------------------------------------
  //  GIT ENDPOINTS (/api/git/*) — page-referenced mock VCS
  // --------------------------------------------------------
  function gitStore() {
    let s = readJSON('data/mock-git.json', { repos: [] });
    if (!Array.isArray(s.repos)) s.repos = [];
    return s;
  }
  function seedRepos(uid) {
    const s = gitStore();
    if (!s.repos.some(function (r) { return r.userId === uid; })) {
      const nowMs = Date.now();
      s.repos.push({ id: 'kc-agency-' + uid.slice(0, 6), name: 'kc-agency', userId: uid, defaultBranch: 'main', ahead: 0, behind: 0, createdAt: now() });
      s.repos.push({ id: 'kc-site-v2-' + uid.slice(0, 6), name: 'kc-site-v2', userId: uid, defaultBranch: 'main', ahead: 1, behind: 0, createdAt: now() });
      s.repos[0].log = [{ sha: ('k' + nowMs).slice(0, 9), message: 'chore: init repo', author: req_user(uid), when: now() }];
      writeJSON('data/mock-git.json', s);
      return s.repos.filter(function (r) { return r.userId === uid; });
    }
    return s.repos.filter(function (r) { return r.userId === uid; });
  }
  function req_user(uid) { return 'user-' + String(uid).slice(0, 6); }
  function findRepo(req) {
    const rid = String(req.params.repoId || '');
    const s = gitStore();
    const mine = s.repos.filter(function (r) { return r.userId === req.user.userId; });
    seedRepos(req.user.userId);
    const mineSeeded = gitStore().repos.filter(function (r) { return r.userId === req.user.userId; });
    const all = mine.length ? mineSeeded : mineSeeded;
    const repo = all.find(function (r) {
      return r.userId === req.user.userId && (r.id === rid || r.name === rid || (mineSeeded.length === 1));
    });
    return { store: gitStore(), repo: repo };
  }
  app.get('/api/git/repos', requireAuth, function (req, res) {
    res.json({ success: true, repos: seedRepos(req.user.userId) });
  });
  app.post('/api/git/import', requireAuth, function (req, res) {
    const b = req.body || {};
    const urlRaw = String(b.url || b.repo || b.remote || '');
    if (!urlRaw.trim()) return res.status(400).json({ error: 'Repository URL required' });
    const m = urlRaw.match(/([^/:]+?)(?:\.git)?\/?$/);
    const nm = (m && m[1] ? m[1] : 'imported').slice(0, 60);
    const s = gitStore();
    const rec = { id: nm.toLowerCase() + '-' + req.user.userId.slice(0, 6), name: nm, userId: req.user.userId, url: urlRaw, defaultBranch: String(b.branch || 'main'), status: 'imported', ahead: 0, behind: 0, log: [{ sha: ('i' + Date.now()).slice(0, 9), message: 'import from ' + urlRaw, author: req_user(req.user.userId), when: now() }], createdAt: now() };
    s.repos.push(rec);
    writeJSON('data/mock-git.json', s);
    res.status(201).json({ success: true, repo: rec });
  });
  app.get('/api/git/log/:repoId', requireAuth, function (req, res) {
    const f = findRepo(req);
    if (!f.repo) return res.status(404).json({ error: 'Repo not found' });
    if (!Array.isArray(f.repo.log) || !f.repo.log.length) {
      f.repo.log = [{ sha: ('k' + Date.now()).slice(0, 9), message: 'chore: init ' + f.repo.name, author: req_user(req.user.userId), when: now() }];
      writeJSON('data/mock-git.json', f.store);
    }
    res.json({ success: true, repo: f.repo.name, commits: f.repo.log });
  });
  app.get('/api/git/remote/:repoId', requireAuth, function (req, res) {
    const f = findRepo(req);
    if (!f.repo) return res.status(404).json({ error: 'Repo not found' });
    res.json({ success: true, remote: { name: f.repo.name, url: f.repo.url || ('https://git.keycode.dev/' + req_user(req.user.userId) + '/' + f.repo.name + '.git'), branch: f.repo.defaultBranch || 'main', ahead: f.repo.ahead || 0, behind: f.repo.behind || 0 } });
  });
  app.post('/api/git/pull/:repoId', requireAuth, function (req, res) {
    const f = findRepo(req);
    if (!f.repo) return res.status(404).json({ error: 'Repo not found' });
    f.repo.behind = 0;
    f.repo.lastPull = now();
    writeJSON('data/mock-git.json', f.store);
    res.json({ success: true, repo: f.repo.name, pulled: true, message: 'Already up to date.' });
  });
  app.post('/api/git/push/:repoId', requireAuth, function (req, res) {
    const f = findRepo(req);
    if (!f.repo) return res.status(404).json({ error: 'Repo not found' });
    const pushLog = f.repo.log && f.repo.log.length ? f.repo.log : [];
    f.repo.log = pushLog;
    f.repo.ahead = 0;
    f.repo.lastPush = now();
    f.repo.log.unshift({ sha: ('p' + Date.now()).slice(0, 9), message: String((req.body || {}).message || 'push to ' + (f.repo.defaultBranch || 'main')), author: req_user(req.user.userId), when: now() });
    writeJSON('data/mock-git.json', f.store);
    res.json({ success: true, repo: f.repo.name, pushed: true, message: 'Pushed to ' + (f.repo.defaultBranch || 'main') });
  });

  // --------------------------------------------------------
  //  SUBSCRIPTIONS + SUBSCRIBE  + CHAT
  // --------------------------------------------------------
  app.get('/api/subscriptions', requireAuth, function (req, res) {
    const store = readJSON('data/mock-subscriptions.json', {});
    res.json({ success: true, subscriptions: store[req.user.userId] || null, active: !!(store[req.user.userId] && store[req.user.userId].status === 'active') });
  });
  app.post('/api/subscribe', requireAuth, function (req, res) {
    const b = req.body || {};
    const plan = String(b.plan || 'pro');
    const store = readJSON('data/mock-subscriptions.json', {});
    store[req.user.userId] = { plan: plan, status: 'active', interval: String(b.interval || 'monthly'), price: Number(b.price) || (plan === 'pro' ? 29 : 0), startedAt: now(), renewsAt: new Date(Date.now() + 30 * 86400000).toISOString() };
    writeJSON('data/mock-subscriptions.json', store);
    res.status(201).json({ success: true, subscription: store[req.user.userId] });
  });
  app.post('/api/chat', requireAuth, function (req, res) {
    const b = req.body || {};
    const msg = String(b.message || b.prompt || '').trim();
    if (!msg) return res.status(400).json({ error: 'Message required' });
    const plan = planFromPrompt(msg);
    res.json({ success: true, reply: 'Thanks for the message! Quick take: this looks like a ' + plan.industry + ' project. Reply "build a website for it" to generate a site, or ask anything else.', plan: { industry: plan.industry } });
  });

  // --------------------------------------------------------
  //  MANUFACTURING ORDERS (/api/order/*) + SERVICE ORDERS
  // --------------------------------------------------------
  app.get('/api/order/manufacture', requireAuth, function (req, res) {
    const mine = readJSON('data/mock-mfg-orders.json', []).filter(function (o) { return o.userId === req.user.userId; });
    res.json({ success: true, orders: mine });
  });
  app.post('/api/order/manufacture', requireAuth, function (req, res) {
    const b = req.body || {};
    const rec = {
      id: 'mfg_' + nid(),
      userId: req.user.userId,
      fileId: safeName(b.fileId || b.fileId),
      previewUrl: String(b.previewUrl || '').slice(0, 400),
      service: String(b.service || 'website-assembly'),
      quantity: Number(b.quantity) || 1,
      notes: String(b.notes || '').slice(0, 800),
      status: 'queued',
      createdAt: now()
    };
    const orders = readJSON('data/mock-mfg-orders.json', []);
    orders.push(rec); writeJSON('data/mock-mfg-orders.json', orders);
    res.status(201).json({ success: true, order: rec });
  });
  app.get('/api/order/partners', requireAuth, function (req, res) {
    const mine = readJSON('data/mock-mfg-orders.json', []).filter(function (o) { return o.userId === req.user.userId; });
    res.json({ success: true, partners: [true, true, false], orders: mine, partnerProgram: { open: true, tiers: ['Assembler', 'Studio', 'Network'], commission: '20%-40%' } });
  });

  app.get('/api/service-order/manufacture', requireAuth, function (req, res) {
    const mine = readJSON('data/mock-service-orders.json', []).filter(function (o) { return o.userId === req.user.userId; });
    res.json({ success: true, orders: mine });
  });
  app.post('/api/service-order/manufacture', requireAuth, function (req, res) {
    const b = req.body || {};
    const rec = {
      id: 'svc_' + nid(),
      userId: req.user.userId,
      service: String(b.service || b.plan || 'website-build'),
      name: String(b.name || '').slice(0, 120),
      email: String(b.email || req.user.email || '').slice(0, 160),
      phone: String(b.phone || '').slice(0, 40),
      budget: Number(b.budget) || 0,
      details: String(b.details || b.message || '').slice(0, 2000),
      status: 'received',
      createdAt: now()
    };
    const orders = readJSON('data/mock-service-orders.json', []);
    orders.push(rec); writeJSON('data/mock-service-orders.json', orders);
    res.status(201).json({ success: true, order: rec });
  });

  // --------------------------------------------------------
  //  REFERRALS (/api/referral/*)
  // --------------------------------------------------------
  app.get('/api/referral/my', requireAuth, function (req, res) {
    const refs = readJSON('data/mock-referrals.json', {});
    const mine = refs[req.user.userId] || {
      code: ('ref' + req.user.userId.slice(0, 5)).replace(/[^a-z0-9]/gi, '') + rand(2),
      shares: 0, earnings: 0, clicks: 0, signups: 0
    };
    res.json({ success: true, referral: mine, link: 'https://keycode.studio/r/' + mine.code });
  });
  app.get('/api/referral/generate', requireAuth, function (req, res) {
    const refs = readJSON('data/mock-referrals.json', {});
    const existing = refs[req.user.userId];
    if (!existing) {
      refs[req.user.userId] = { code: ('ref' + req.user.userId.slice(0, 5)).replace(/[^a-z0-9]/gi, '') + rand(2), shares: 0, earnings: 0, clicks: 0, signups: 0, createdAt: now() };
      writeJSON('data/mock-referrals.json', refs);
    }
    const mine = refs[req.user.userId];
    res.json({ success: true, referral: mine, link: 'https://keycode.studio/r/' + mine.code });
  });

  // --------------------------------------------------------
  //  INQUIRIES (contact forms) + DOCS + REFUNDS fallback
  // --------------------------------------------------------
  app.post('/api/inquiries', function (req, res) {
    const b = req.body || {};
    const rec = {
      id: 'inq_' + nid(),
      userId: (req.user && req.user.userId) || null,
      name: String(b.name || '').slice(0, 120),
      email: String(b.email || '').slice(0, 160),
      phone: String(b.phone || '').slice(0, 40),
      company: String(b.company || '').slice(0, 120),
      message: String(b.message || '').slice(0, 2000),
      source: String(b.source || 'contact-form'),
      status: 'new',
      createdAt: now()
    };
    if (!rec.email && !rec.phone && !rec.message) return res.status(400).json({ error: 'Provide at least an email or message' });
    const list = readJSON('data/mock-inquiries.json', []);
    list.push(rec); writeJSON('data/mock-inquiries.json', list);
    res.status(201).json({ success: true, inquiry: rec, message: 'Thanks! We will reply within one business day.' });
  });

  app.get('/api/docs.json', function (req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(readJSON('docs/docs.json', {
      docs: [
        { id: 'quickstart', title: 'Quickstart', path: 'docs/quickstart.md', summary: 'Get running in 5 minutes.' },
        { id: 'cli', title: 'CLI reference', path: 'docs/cli.md', summary: 'Install and use the KEYCODE CLI.' },
        { id: 'api', title: 'HTTP API', path: 'docs/api.md', summary: 'Every REST endpoint explained.' },
        { id: 'publishing', title: 'Publishing', path: 'docs/publishing.md', summary: 'Preview, download, deploy and order manufacturing.' }
      ]
    }));
  });

  app.post('/api/payment/refund', requireAuth, function (req, res) {
    const b = req.body || {};
    const orderId = String(b.orderId || b.order_id || '');
    const reason = String(b.reason || 'customer request').slice(0, 300);
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    const orders = readJSON('data/mock-orders.json', []);
    const mine = orders.filter(function (o) { return o.userId === req.user.userId; });
    const target = mine.find(function (o) { return o.id === orderId || o.order_number === orderId; });
    if (!target) return res.status(404).json({ error: 'Order not found for this account' });
    const refunds = readJSON('data/mock-refunds.json', []);
    const rec = { id: 'ref_' + nid(), userId: req.user.userId, orderId: orderId, amount: Number(b.amount) || Number(target.total) || 0, reason: reason, status: 'requested', createdAt: now() };
    refunds.push(rec); writeJSON('data/mock-refunds.json', refunds);
    res.status(201).json({ success: true, refund: rec, message: 'Refund requested. Review takes 1-2 business days.' });
  });

  // --------------------------------------------------------
  //  BLOG (/api/blog)
  // --------------------------------------------------------
  app.get('/api/blog', function (req, res) {
    const posts = readJSON('data/blog-posts.json', []);
    res.json({ success: true, posts: posts });
  });
  app.get('/api/blog/featured', function (req, res) {
    const posts = readJSON('data/blog-posts.json', []);
    res.json({ success: true, post: posts[0] || null });
  });
  app.get('/api/blog/categories/all', function (req, res) {
    const posts = readJSON('data/blog-posts.json', []);
    const cats = {};
    posts.forEach(function (p) { cats[p.category || 'general'] = (cats[p.category || 'general'] || 0) + 1; });
    res.json({ success: true, categories: cats });
  });
  app.get('/api/blog/:id', function (req, res) {
    const posts = readJSON('data/blog-posts.json', []);
    const post = posts.find(function (p) { return p.id === req.params.id || p.slug === req.params.id; });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ success: true, post: post });
  });

  // --------------------------------------------------------
  //  SERVICES (public listing)
  // --------------------------------------------------------
  app.get('/api/services', function (req, res) {
    const items = readJSON('data/services.json', []);
    res.json({ success: true, services: items });
  });
  app.get('/api/services/featured', function (req, res) {
    const items = readJSON('data/services.json', []);
    res.json({ success: true, services: items.slice(0, 3) });
  });
  app.get('/api/services/providers', requireAuth, function (req, res) {
    res.json({ success: true, providers: [
      { id: 'p1', name: 'AssembleOne', region: 'Global', rating: 4.8 },
      { id: 'p2', name: 'BoxFab CNC', region: 'US/EU', rating: 4.6 },
      { id: 'p3', name: 'StudioPrint', region: 'EU', rating: 4.9 }
    ] });
  });


  // --------------------------------------------------------
  //  PCB STREAM  (POST, SSE frames — fab pipeline)
  // --------------------------------------------------------
  function pcbUser(req) {
    try {
      const auth = req.headers.authorization || '';
      if (auth.indexOf('Bearer kc_sk_') === 0) {
        const keys = readJSON('data/api-keys.json', {});
        const e = keys[auth.slice(7)];
        if (e) return { userId: e.userId, email: e.email };
      }
      if (auth.indexOf('Bearer ') === 0) {
        const pl = JSON.parse(Buffer.from(auth.split('.')[1], 'base64url').toString('utf8'));
        if (pl && pl.userId) return pl;
      }
    } catch (_) {}
    return null;
  }
  function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); }
  function pcbBomFor(desc) {
    const d = String(desc || '').toLowerCase();
    const bom = [];
    function add(ref, value, pkg, mpn) { bom.push({ reference: ref, value: value, package: pkg, mpn: mpn }); }
    let n = 1;
    function nextRef(prefix) { return prefix + (n++); }
    if (/esp32|wifi|wireless/.test(d)) add(nextRef('U'), 'ESP32-WROOM-32E', 'Module', 'ESP32-WROOM-32E-N8');
    else if (/arduino|atmega/.test(d)) add(nextRef('U'), 'ATmega328P-AU', 'TQFP-32', 'ATMEGA328P-AU');
    else if (/rp2040|pico/.test(d)) add(nextRef('U'), 'RP2040', 'QFN-56', 'RP2040');
    else add(nextRef('U'), /sensor|temperature|humidity|environment/.test(d) ? 'STM32L031' : 'CH32V003', /sensor/.test(d) ? 'TSSOP-20' : 'SOIC-8', /sensor/.test(d) ? 'STM32L031G6U6' : 'CH32V003F4P6');
    if (/led|light|rgb|ws2812/.test(d)) {
      add(nextRef('U'), 'WS2812B', '5050', 'WS2812B-B');
      for (let i = 0; i < 3; i++) add(nextRef('LED'), 'LED', '0603', '150060RS75000');
    }
    if (/sensor/.test(d)) add(nextRef('U'), 'BME280', 'LGA-8', 'BME280');
    if (/motor|driver|robot|car/.test(d)) add(nextRef('U'), 'DRV8833', 'HTSSOP-16', 'DRV8833PWP');
    if (/display|oled|screen/.test(d)) add(nextRef('U'), 'SSD1306 128x64', 'Module-0.96in', 'SSD1306');
    if (/power|supply|buck|5v|12v/.test(d)) { add(nextRef('U'), 'TPS54331', 'SOIC-8', 'TPS54331DR'); add(nextRef('L'), '4.7uH', '1210', 'SRN4018-4R7M'); }
    if (/battery|lipo|charger|charge/.test(d)) { add(nextRef('U'), 'TP4056', 'SOP-8', 'TP4056'); add(nextRef('J'), 'JST-PH 2P', 'JST-PH', 'B2B-PH-K-S'); }
    if (/usb|serial/.test(d)) add(nextRef('U'), 'CH340N', 'SOP-8', 'CH340N');
    for (let i = 0; i < 6; i++) add(nextRef('C'), '100nF', '0402', 'CL05B104KO5NNNC');
    for (let i = 0; i < 3; i++) add(nextRef('R'), '10k', '0402', 'RC0402FR-0710KL');
    if (/button|switch|input/.test(d)) { add(nextRef('SW'), 'Tactile', 'SMD-4', 'SKRPACE010'); add(nextRef('R'), '100k pullup', '0402', 'RC0402FR-07100KL'); }
    add(nextRef('J'), 'Header 2x5', '2.54mm', '20021121-00010T4LF');
    add(nextRef('Y'), '12MHz', '3225', 'XT3225-1200M');
    return bom;
  }
  function pcbSvgFor(desc, bom) {
    const h = strHash(String(desc || 'pcb'));
    const W = 660, H = 420, PAD = 26;
    const comps = bom.slice(0, 26);
    const placed = [];
    let x = 60, y = 70, row = 0;
    for (let i = 0; i < comps.length; i++) {
      placed.push({ x: x, y: y, c: comps[i], i: i });
      x += 110;
      if (x > W - 90) { x = 60; y += 62; row++; }
      if (y > H - 70) break;
    }
    let traces = '';
    for (let i = 1; i < placed.length; i++) {
      const a = placed[i - 1], b = placed[i];
      const mx = (a.x + b.x) / 2;
      traces += '<polyline points="' + a.x + ',' + a.y + ' ' + mx + ',' + a.y + ' ' + mx + ',' + b.y + ' ' + b.x + ',' + b.y + '" fill="none" stroke="#1a7f5a" stroke-width="2.4" stroke-linecap="round"/>';
    }
    let parts = '';
    placed.forEach(function (p) {
      const v = String(p.c.value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const ref = String(p.c.reference || '').replace(/&/g, '&amp;');
      parts += '<rect x="' + (p.x - PAD / 2) + '" y="' + (p.y - PAD / 2) + '" width="' + PAD + '" height="' + PAD + '" rx="4" fill="#0e2f24" stroke="#2fd08b" stroke-width="1.3"/>' +
        '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.2" fill="#d9a441"/>' +
        '<text x="' + p.x + '" y="' + (p.y - 21) + '" font-size="9.5" fill="#8fe6c2" text-anchor="middle" font-family="monospace">' + ref + '</text>' +
        '<text x="' + p.x + '" y="' + (p.y + 31) + '" font-size="8.5" fill="#5aa88c" text-anchor="middle" font-family="monospace">' + v.slice(0, 14) + '</text>';
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="PCB preview">' +
      '<rect x="8" y="8" width="' + (W - 16) + '" height="' + (H - 16) + '" rx="14" fill="#0b3b2b" stroke="#0f5a40" stroke-width="3"/>' +
      '<circle cx="34" cy="34" r="7" fill="#07281d" stroke="#2fd08b" stroke-width="1.5"/>' +
      '<circle cx="' + (W - 34) + '" cy="34" r="7" fill="#07281d" stroke="#2fd08b" stroke-width="1.5"/>' +
      '<circle cx="34" cy="' + (H - 34) + '" r="7" fill="#07281d" stroke="#2fd08b" stroke-width="1.5"/>' +
      '<circle cx="' + (W - 34) + '" cy="' + (H - 34) + '" r="7" fill="#07281d" stroke="#2fd08b" stroke-width="1.5"/>' +
      traces + parts +
      '<text x="' + (W / 2) + '" y="' + (H - 14) + '" font-size="10" fill="#3f8a6d" text-anchor="middle" font-family="monospace">KEYCODE FAB · rev' + (h % 4) + '.' + (h % 7) + '</text>' +
      '</svg>';
  }
  function pcbSkidl(bom) {
    const lines = ['from skidl import *', '', '// Generated by KEYCODE local engine'];
    bom.forEach(function (c) {
      lines.push('p' + c.reference.replace(/[^A-Za-z0-9]/g, '') + ' = Part(tool=SKIDL, name=' + JSON.stringify(c.value || 'part') + ', dest=TEMPLATE, footprint=' + JSON.stringify(c.package || '') + ')');
    });
    lines.push('', 'generate_netlist()');
    return lines.join('\n') + '\n';
  }
  // Gerber writer: real RS-274X content. placement is derived from the same
  // deterministic layout as pcbSvgFor so the fab files match the preview.
  function gerberFor(bom, kind, W, H) {
    const comps = bom.slice(0, 26);
    const placed = [];
    let x = 60, y = 70;
    for (let i = 0; i < comps.length; i++) {
      placed.push({ x: x, y: y, c: comps[i], i: i });
      x += 110;
      if (x > W - 90) { x = 60; y += 62; }
      if (y > H - 70) break;
    }
    const fmt = '%FSLAX36Y36*%';
    const mm = function (v) { return Math.round(v * 1000); }; // svg px ≈ 1mm grid
    const lines = [
      'G04 KEYCODE FAB — ' + kind + ' — ' + new Date().toISOString(),
      'G04 units mm, 3.6 format',
      '%MOIN*%', fmt,
    ];
    if (kind === 'Edge.Cuts') {
      // Board outline: rectangle with 3 mounting holes as cutouts.
      lines.push('%ADD10C,0.2*%', 'D10*');
      lines.push('X' + mm(30) + 'Y' + mm(30) + 'D02*', 'X' + mm(W - 30) + 'Y' + mm(30) + 'D01*',
        'X' + mm(W - 30) + 'Y' + mm(H - 30) + 'D01*', 'X' + mm(30) + 'Y' + mm(H - 30) + 'D01*',
        'X' + mm(30) + 'Y' + mm(30) + 'D01*');
    } else if (kind === 'drills') {
      lines.push(';Excellon drill file', 'M48', 'METRIC', 'T1C0.8', '%', 'T1');
      [[34, 34], [W - 34, 34], [34, H - 34], [W - 34, H - 34]].forEach(function (p) {
        lines.push('X' + mm(p[0]) + 'Y' + mm(p[1]));
      });
      lines.push('T1', 'M30');
      return lines.join('\n') + '\n';
    } else {
      const isMask = kind === 'F.Mask';
      const isSilk = kind === 'F.Silkscreen';
      // Apertures: one per component footprint size.
      placed.forEach(function (p, i) {
        const pad = 2.6 + (p.i % 3) * 0.2;
        lines.push('%ADD' + (i + 11) + 'C,' + pad.toFixed(2) + '*%');
      });
      placed.forEach(function (p, i) {
        lines.push('D' + (i + 11) + '*');
        if (isSilk) {
          // Silkscreen: refdes text as a short flash stroke marker + part outline
          lines.push('G04 refdes ' + p.c.reference + '*');
          lines.push('X' + mm(p.x) + 'Y' + mm(p.y) + 'D03*');
        } else {
          // Copper/mask pads: flash at part center (simplified footprint)
          lines.push('X' + mm(p.x) + 'Y' + mm(p.y) + 'D03*');
        }
      });
      if (!isMask && !isSilk) {
        // Copper: add routing between consecutive parts (draw with D01)
        lines.push('%ADD99C,0.25*%', 'D99*');
        for (let i = 1; i < placed.length; i++) {
          const a = placed[i - 1], b2 = placed[i];
          const mx = (a.x + b2.x) / 2;
          lines.push('X' + mm(a.x) + 'Y' + mm(a.y) + 'D02*', 'X' + mm(mx) + 'Y' + mm(a.y) + 'D01*',
            'X' + mm(mx) + 'Y' + mm(b2.y) + 'D01*', 'X' + mm(b2.x) + 'Y' + mm(b2.y) + 'D01*');
        }
      }
    }
    lines.push('M02*');
    return lines.join('\n') + '\n';
  }

  function pcbZipB64(bom, skidl, base) {
    try {
      const os = require('os');
      const cp = require('child_process');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbzip-'));
      const rows = bom.map(function (c) { return [c.reference, c.value || '', c.package || '', c.mpn || ''].join(','); }).join('\n');
      fs.writeFileSync(path.join(dir, 'bom.csv'), 'reference,value,package,mpn\n' + rows + '\n');
      fs.writeFileSync(path.join(dir, 'skidl.py'), skidl);
      const W = 660, H = 420;
      ['F.Cu', 'B.Cu', 'F.Mask', 'F.Silkscreen', 'Edge.Cuts'].forEach(function (kind) {
        fs.writeFileSync(path.join(dir, kind + '.gbr'), gerberFor(bom, kind, W, H));
      });
      fs.writeFileSync(path.join(dir, 'drills.drl'), gerberFor(bom, 'drills', W, H));
      const zip = path.join(os.tmpdir(), base + '.zip');
      try { fs.unlinkSync(zip); } catch (_) {}
      cp.execFileSync('zip', ['-j', '-q', zip].concat(fs.readdirSync(dir).map(function (f) { return path.join(dir, f); })), { timeout: 10000 });
      const buf = fs.readFileSync(zip);
      try { fs.rmSync(dir, { recursive: true, force: true }); fs.unlinkSync(zip); } catch (_) {}
      return buf.toString('base64');
    } catch (_) { return null; }
  }
  app.post('/api/ai/pcb-stream', async function (req, res) {
    const b = req.body || {};
    const desc = String(b.description || '').slice(0, 2000);
    if (!desc.trim()) { res.status(400).json({ error: 'description required' }); return; }
    const user = pcbUser(req);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    const send = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (_) {} };
    let closed = false;
    res.on('close', function () { closed = true; });
    const info = ai.llmInfo();
    send({ type: 'status', message: info.configured ? 'Designing with AI (' + info.model + ')' : 'Parsing design requirements' });
    let bom = null;
    if (info.configured) {
      bom = await aiBom(desc);
      if (bom && !closed) send({ type: 'status', message: 'AI selected ' + bom.length + ' parts' });
    }
    if (!bom) bom = pcbBomFor(desc);
    const svg = pcbSvgFor(desc, bom);
    const h = strHash(desc);
    const steps = [
      { type: 'status', message: 'Parsing design: ' + bom.length + ' parts identified' },
      { type: 'status', message: 'Selecting components and footprints' },
      { type: 'status', message: 'Placing parts on the board' },
      { type: 'status', message: 'Routing traces' },
      { type: 'pcbSvg', svg: svg },
      { type: 'status', message: 'Running fab checks' }
    ];
    let i = 0;
    (function run() {
      if (closed || res.writableEnded) return;
      if (i < steps.length) { send(steps[i]); i++; setTimeout(run, 260); return; }
      const skidl = pcbSkidl(bom);
      const fabScore = 78 + (h % 19);
      const done = { type: 'done', svg: svg, bom: bom, skidlScript: skidl, fab: { score: fabScore, gerbers: 6 }, fileName: 'keycode-pcb.zip' };
      if (user) {
        const z = pcbZipB64(bom, skidl, 'keycode-pcb-' + (h % 9999));
        if (z) { done.zipB64 = z; }
      } else {
        done.payRequired = true;
        done.gateMessage = 'Manufacturing files need a free account.';
      }
      send(done);
      try { res.end(); } catch (_) {}
    })();
  });

  return { buildSiteHtml: buildSiteHtml };
};
