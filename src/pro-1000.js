// PRO-1000 behaviors: stagger, counters, tilt-lite, marquee, reading time
document.addEventListener('DOMContentLoaded',()=>{
try{document.querySelectorAll('.flagship-grid,.pricing-grid,.works-grid,.products-grid').forEach(g=>{[...g.children].forEach((c,i)=>{c.classList.add('d'+((i%100)+1));});});}catch{}
try{const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('kc-revealed');io.unobserve(e.target)}}),{threshold:0.1});document.querySelectorAll('[data-reveal],.kc-card,.card').forEach(el=>io.observe(el));}catch{}
try{document.querySelectorAll('[data-count]').forEach(el=>{const t=parseFloat(el.dataset.count)||0;const o=new IntersectionObserver(es=>{if(es[0].isIntersecting){o.disconnect();const s=performance.now();const step=n=>{const p=Math.min(1,(n-s)/1200);el.textContent=Math.round(t*p);if(p<1)requestAnimationFrame(step)};requestAnimationFrame(step)}});o.observe(el)});}catch{}
});