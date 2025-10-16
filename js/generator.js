import {CATALOG,SUB_LABELS,$,blankStep,buildCPC,buildOpt,safeB64Encode,strongHash,prng32} from './common.js';

const rail = $('#rail'), stepsWrap = $('#stepsWrap'), cpcEl = $('#cpc'),
      shareA = $('#shareUrl'), hint = $('#hint'),
      canvas = document.getElementById('beanCanvas'), ctx = canvas.getContext('2d');

function setRail(){
  const top = document.getElementById('fixed-start').getBoundingClientRect().bottom + window.scrollY;
  const bottom = document.getElementById('fixed-end').getBoundingClientRect().top + window.scrollY;
  const parentTop = rail.parentElement.getBoundingClientRect().top + window.scrollY;
  rail.style.top = (top - parentTop) + 'px';
  rail.style.height = Math.max(0, bottom - top) + 'px';
}
window.addEventListener('resize', setRail);
window.addEventListener('load', setRail);

let steps = [blankStep(), blankStep()];

function buildStepBlock(i){
  const s = steps[i];
  const card = document.createElement('div');
  card.className = 'step';
  card.innerHTML = `
    <div class="inline" style="gap:8px;display:grid;grid-template-columns:1fr auto;align-items:end">
      <div>
        <label for="sel-${i}">Step ${i+1} *</label>
        <select id="sel-${i}">
          <option value="">Select an operation…</option>
          ${CATALOG.map(o=>`<option value="${o.main}" ${s.main===o.main?'selected':''}>${o.label}</option>`).join('')}
        </select>
      </div>
      ${i<2?'<span></span>':`<button class="ghost square" id="del-${i}" title="Remove" aria-label="Remove step">
        <svg class="trash" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9z"/></svg>
      </button>`}
    </div>
    <div id="extras-${i}" class="row"></div>
  `;
  stepsWrap.appendChild(card);

  card.querySelector('#sel-'+i).addEventListener('change', e=>{
    const main = e.target.value;
    const cfg = CATALOG.find(x=>x.main===main) || {duration:false,extras:false,sub:[]};
    s.main = main; s.sub = ''; s.hours=''; s.extras={temp:'',ph:''};
    renderExtras(i, cfg, s); setRail();
  });
  const delBtn = card.querySelector('#del-'+i);
  if(delBtn){ delBtn.addEventListener('click', ()=>{ if(steps.length>2){ steps.splice(i,1); refreshSteps(); } }); }
  renderExtras(i, CATALOG.find(x=>x.main===s.main)||{duration:false,extras:false,sub:[]}, s);
}
function renderExtras(i, cfg, s){
  const host = document.getElementById('extras-'+i); host.innerHTML='';
  if(cfg.sub && cfg.sub.length){
    const sub = document.createElement('div'); sub.className='row';
    sub.innerHTML = `
      <label for="sub-${i}">Subtype</label>
      <select id="sub-${i}">
        <option value="">(none)</option>
        ${cfg.sub.map(k=>`<option value="${k}" ${s.sub===k?'selected':''}>${SUB_LABELS[k]}</option>`).join('')}
      </select>`;
    host.appendChild(sub);
    sub.querySelector('#sub-'+i).addEventListener('change', e=>{ s.sub = e.target.value; });
  }
  if(cfg.duration){
    const hrs=document.createElement('div'); hrs.className='row';
    hrs.innerHTML = `<label for="hrs-${i}">Hours *</label>
      <input id="hrs-${i}" type="number" min="0" max="999" placeholder="e.g., 80" value="${s.hours}"/>`;
    host.appendChild(hrs);
    hrs.querySelector('#hrs-'+i).addEventListener('input', e=>{
      const v=e.target.value.replace(/[^0-9]/g,''); s.hours=v.slice(0,3);
    });
  }
  if(s.main==='F'){
    const g=document.createElement('div'); g.className='grid2';
    g.innerHTML = `
      <div class="row">
        <label for="temp-${i}">Temperature (°C)</label>
        <input id="temp-${i}" type="text" placeholder="e.g., 18" value="${s.extras.temp||''}"/>
      </div>
      <div class="row">
        <label for="ph-${i}">pH</label>
        <input id="ph-${i}" type="text" placeholder="e.g., 3.8" value="${s.extras.ph||''}"/>
      </div>`;
    host.appendChild(g);
    g.querySelector('#temp-'+i).addEventListener('input', e=>{ s.extras.temp = e.target.value.trim(); });
    g.querySelector('#ph-'+i).addEventListener('input', e=>{ s.extras.ph = e.target.value.trim(); });
  }
}
function refreshSteps(){ stepsWrap.innerHTML=''; steps.forEach((_,i)=>buildStepBlock(i)); setRail(); }
refreshSteps();

// Build CPC + link + tag
function linkFrom(cpc,opt){
  const url=new URL('summary.html', location.href);
  if(cpc) url.searchParams.set('cpc',cpc);
  if(opt) url.searchParams.set('opt', safeB64Encode(opt));
  return url.toString();
}

async function drawBeanTag(payloadKey){
  const w=canvas.width,h=canvas.height;
  const digest = await strongHash(payloadKey||'');
  const mix=(digest[0]^digest[1]^digest[2]^digest[3])>>>0;
  const rnd=prng32(mix||1);
  ctx.clearRect(0,0,w,h); ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()||'#000';
  ctx.fillStyle=ctx.strokeStyle;

  // Hexagon outline
  const cx=110, cy=120, R=90; const pts=[[cx,cy-R],[cx+R,cy-R/2],[cx+R,cy+R/2],[cx,cy+R],[cx-R,cy+R/2],[cx-R,cy-R/2]];
  ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<6;i++) ctx.lineTo(pts[i][0],pts[i][1]); ctx.closePath(); ctx.stroke();

  // Dot grid inside
  const pad=14, innerR=R-pad, cols=19, rowH=(innerR*2)/(cols*0.9);
  for(let r=0;r<cols;r++){
    const y = cy-innerR + r*rowH;
    const offset=(r%2?0.5:0), rowCols=cols-(r%2?1:0);
    for(let c=0;c<rowCols;c++){
      const x=(cx-innerR)+(c+offset)*((innerR*2)/cols);
      // point-in-hex quick check
      let inside=true; for(let i=0;i<6;i++){ const a=pts[i], b=pts[(i+1)%6]; if(((b[0]-a[0])*(y-a[1]) - (b[1]-a[1])*(x-a[0]))<0){ inside=false; break; } }
      if(!inside) continue;
      // pseudo-random bit from payload mix
      const sel = (((mix>>>((r*3+c)%24)) & 1) ^ (((r*31+c*17)&7)===0?1:0));
      if(sel){ const s=1.6 + rnd()*0.4; ctx.beginPath(); ctx.arc(x,y,s/2,0,Math.PI*2); ctx.fill(); }
    }
  }

  // metadata text (short key)
  const short=(mix>>>0).toString(36).toUpperCase();
  ctx.font='10px ui-monospace,monospace'; ctx.textAlign='center'; ctx.fillText(short, cx, h-8);
}

async function exportSVG(payloadKey){
  const w=220,h=240; const cx=110,cy=120,R=90; const ink=getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()||'#000';
  const pts=[[cx,cy-R],[cx+R,cy-R/2],[cx+R,cy+R/2],[cx,cy+R],[cx-R,cy+R/2],[cx-R,cy-R/2]];
  const hexPath=`M${pts.map(p=>p.join(',')).join(' L ')} Z`;
  const mix = (await strongHash(payloadKey)).reduce((a,b)=>a^b)>>>0;
  const pad=14, innerR=R-pad, cols=19, cellW=(innerR*2)/cols, rowH=(innerR*2)/(cols*0.9);
  let k=0; const dots=[];
  for(let r=0;r<cols;r++){
    const y = cy-innerR + r*rowH, offset=(r%2?0.5:0), rowCols=cols-(r%2?1:0);
    for(let c=0;c<rowCols;c++){
      const x=(cx-innerR)+(c+offset)*cellW; const sel = (((mix>>>((r*3+c)%24)) & 1) ^ (((r*31+c*17)&7)===0?1:0));
      if(sel){ dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="0.9" fill="${ink}"/>`); }
      k++;
    }
  }
  const payload = encodeURIComponent(payloadKey); // embed so lo scanner SVG legge facile
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-encoder="dotcode-like-v1" data-payload="${payload}">\n<rect width="${w}" height="${h}" fill="#FFFFFF"/>\n<path d="${hexPath}" fill="none" stroke="${ink}" stroke-width="2"/>\n${dots.join('\\n')}\n<text x="${cx}" y="${h-8}" text-anchor="middle" fill="${ink}" font-size="10" font-family="ui-monospace, monospace">${(mix>>>0).toString(36).toUpperCase()}</text>\n</svg>`;
}

// Wire
$('#addStep').addEventListener('click', ()=>{ steps.push(blankStep()); refreshSteps(); });
$('#clearAll').addEventListener('click', ()=>{ steps=[blankStep(),blankStep()]; refreshSteps(); cpcEl.textContent=''; hint.textContent=''; });

$('#gen').addEventListener('click', async ()=>{
  const filled=steps.filter(s=>s.main);
  if(filled.length<2){ hint.textContent='Add at least two steps.'; return; }
  for(const s of filled){ const cfg=CATALOG.find(x=>x.main===s.main); if(cfg && cfg.duration && (s.hours==='')){ hint.textContent='Hours * required where duration applies.'; return; } }
  const cpc=buildCPC(steps), opt=buildOpt(steps); cpcEl.textContent=cpc;
  const url=linkFrom(cpc,opt); $('#shareUrl').href=url;
  await drawBeanTag(cpc+'|'+(opt?JSON.stringify(opt):''));
});

$('#copyCpc').addEventListener('click', ()=>{ const t=cpcEl.textContent.trim(); if(!t){alert('Generate the code first.');return;} navigator.clipboard.writeText(t); });

$('#dlPng').addEventListener('click', ()=>{ const link=document.createElement('a'); link.href=canvas.toDataURL('image/png'); link.download='BeanTag.png'; document.body.appendChild(link); link.click(); link.remove(); });
$('#dlSvg').addEventListener('click', async ()=>{ const cpc=cpcEl.textContent.trim(); const opt=buildOpt(steps); const svg=await exportSVG(cpc+'|'+(opt?JSON.stringify(opt):'')); const blob=new Blob([svg],{type:'image/svg+xml'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='BeanTag.svg'; document.body.appendChild(a); a.click(); a.remove(); });

// URL prefill
(function(){
  const p=new URLSearchParams(location.search), cpcQ=p.get('cpc'); if(!cpcQ) return;
  steps = cpcQ.split('.').filter(Boolean).map(tok=>{ const m=tok.match(/^([A-Z])([A-Z]?)(\\d{1,3})?$/); if(!m) return blankStep(); const [,L,S,H]=m; return {main:L, sub:S||'', hours:H||'', extras:{temp:'',ph:''}}; });
  if(steps.length<2) steps=[blankStep(),blankStep()]; refreshSteps();
})();
