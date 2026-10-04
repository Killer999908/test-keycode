(function(){
  if(document.getElementById('kc-ai-widget')) return;
  var css=document.createElement('style');
  css.textContent='#kc-ai-widget{position:fixed;bottom:24px;right:24px;z-index:9999;font-family:Inter,system-ui,sans-serif}#kc-ai-btn{width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;cursor:pointer;box-shadow:0 8px 32px rgba(99,102,241,0.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;transition:transform .2s}#kc-ai-btn:hover{transform:scale(1.08)}#kc-ai-panel{display:none;position:absolute;bottom:70px;right:0;width:360px;max-height:480px;background:#12122a;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.5)}#kc-ai-panel.open{display:flex}#kc-ai-header{padding:14px 16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:700;font-size:14px;display:flex;justify-content:space-between;align-items:center}#kc-ai-close{background:none;border:none;color:#fff;cursor:pointer;font-size:18px}#kc-ai-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;max-height:300px}#kc-ai-msg{padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.5;max-width:85%}#kc-ai-msg.user{align-self:flex-end;background:#6366f1;color:#fff}#kc-ai-msg.bot{align-self:flex-start;background:rgba(255,255,255,0.06);color:#e2e8f0;border:1px solid rgba(255,255,255,0.06)}#kc-ai-input-row{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,0.06)}#kc-ai-input{flex:1;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#fff;font-size:13px;outline:none}#kc-ai-input::placeholder{color:#64748b}#kc-ai-send{padding:10px 16px;border-radius:10px;border:none;background:#6366f1;color:#fff;cursor:pointer;font-weight:600}#kc-ai-status{font-size:11px;color:#94a3b8;padding:0 16px 8px}#kc-ai-badge{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}#kc-ai-badge.online{background:#10b981;box-shadow:0 0 6px #10b981}#kc-ai-badge.offline{background:#ef4444}';
  document.head.appendChild(css);
  var w=document.createElement('div');
  w.id='kc-ai-widget';
  w.innerHTML='<div id="kc-ai-panel"><div id="kc-ai-header"><span><span id="kc-ai-badge" class="offline"></span>KEYCODE AI</span><button id="kc-ai-close">&times;</button></div><div id="kc-ai-messages"><div id="kc-ai-msg" class="bot">Hi! I\'m KEYCODE AI — powered by real AI (Cloudflare + Mistral + Groq). Ask me anything about building websites, apps, 3D, PCBs, pricing, or any feature!</div></div><div id="kc-ai-status">Checking AI status...</div><div id="kc-ai-input-row"><input id="kc-ai-input" placeholder="Ask AI anything..." /><button id="kc-ai-send">Send</button></div></div><button id="kc-ai-btn" aria-label="Chat with AI">✦</button>';
  document.body.appendChild(w);
  var btn=document.getElementById('kc-ai-btn'),panel=document.getElementById('kc-ai-panel'),close=document.getElementById('kc-ai-close'),input=document.getElementById('kc-ai-input'),send=document.getElementById('kc-ai-send'),msgs=document.getElementById('kc-ai-messages'),status=document.getElementById('kc-ai-status'),badge=document.getElementById('kc-ai-badge');
  btn.onclick=function(){panel.classList.toggle('open')};
  close.onclick=function(){panel.classList.remove('open')};
  function addMsg(t,c){var d=document.createElement('div');d.id='kc-ai-msg';d.className=c;d.textContent=t;msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight}
  async function checkStatus(){try{var r=await fetch('/api/ai/providers');var d=await r.json();var on=d.online||0,total=d.total||0;badge.className=on>0?'online':'offline';status.textContent=on>0?on+'/'+total+' AI providers online — real AI ready':'AI checking...';}catch(e){status.textContent='AI status unknown';}}
  checkStatus();setInterval(checkStatus,30000);
  async function doSend(){
    var q=input.value.trim();if(!q)return;
    addMsg(q,'user');input.value='';
    var typing=document.createElement('div');typing.id='kc-ai-msg';typing.className='bot';typing.textContent='Thinking...';msgs.appendChild(typing);msgs.scrollTop=msgs.scrollHeight;
    try{
      var feature=location.pathname.replace('.html','').replace('/','')||'home';
      var r=await fetch('/api/ai/assist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:q,feature:feature,context:document.title})});
      var d=await r.json();
      typing.remove();
      addMsg(d.response||d.error||'AI temporarily busy, try again','bot');
    }catch(e){typing.remove();addMsg('Connection error — try again','bot')}
  }
  send.onclick=doSend;
  input.addEventListener('keydown',function(e){if(e.key==='Enter')doSend()});
})();
