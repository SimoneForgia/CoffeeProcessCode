import {
  CATALOG, SUB_LABELS, $, blankStep,
  buildCPC as _buildCPC, buildOpt as _buildOpt,
  safeB64Encode, strongHash, prng32
} from './common.js';

/* ------- DOM refs ------- */
const rail = $('#rail');
const stepsWrap = $('#stepsWrap');
const cpcEl = $('#cpc');
const shareA = $('#shareUrl');
const hint = $('#hint');
const beanPanel = document.getElementById('beanPanel') || null; // opzionale
const canvas = document.getElementById('beanCanvas');
const ctx = canvas.getContext('2d');

/* Rendiamo il rail “trasparente” al tocco e fissiamo il contesto del drag */
if (rail) rail.style.pointerEvents = 'none';
if (stepsWrap) stepsWrap.style.position = 'relative';

/* ------- Rail between fixed steps ------- */
function setRail() {
  const topEl = document.getElementById('fixed-start');
  const botEl = document.getElementById('fixed-end');
  if (!topEl || !botEl || !rail) return;
  const top = topEl.getBoundingClientRect().bottom + window.scrollY;
  const bottom = botEl.getBoundingClientRect().top + window.scrollY;
  const parentTop = rail.parentElement.getBoundingClientRect().top + window.scrollY;
  rail.style.top = (top - parentTop) + 'px';
  rail.style.height = Math.max(0, bottom - top) + 'px';
}
window.addEventListener('resize', setRail);
window.addEventListener('load', setRail);

/* ------- State ------- */
let steps = [blankStep(), blankStep()];

/* ------- Helpers ------- */
function tokenForStep(s) {
  if (!s || !s.main) return '';
  const hrs = (s.hours !== '' && /^\d{1,3}$/.test(String(s.hours)))
    ? String(parseInt(s.hours, 10)) : '';
  return `${s.main}${s.sub || ''}${hrs}`;
}
function buildCPC() { return steps.map(tokenForStep).filter(Boolean).join('.'); }
function buildOpt() { return _buildOpt(steps); }

function linkFrom(cpc, opt) {
  const url = new URL('summary.html', location.href);
  if (cpc) url.searchParams.set('cpc', cpc);
  if (opt) url.searchParams.set('opt', safeB64Encode(opt));
  return url.toString();
}

// ADD: helper per unità di misura della durata
function unitFor(s){
  // Drying sempre Days
  if (s.main === 'D') return 'Days';
  // Rest: in cherries (C)=Hours, in parchment (P)=Days
  if (s.main === 'R') return (s.sub === 'P') ? 'Days' : 'Hours';
  // tutti gli altri: Hours
  return 'Hours';
}

/* ------- Step UI ------- */
function buildStepBlock(i){
  const s = steps[i];
  const card = document.createElement('div');
  card.className = 'step';
  card.dataset.index = i;

  // numero “1)” a sinistra, select che riempie, maniglia a destra, X in alto-destra
  card.innerHTML = `
    <button class="xbtn" title="Remove" aria-label="Remove">×</button>
    <div class="inline" style="gap:8px;display:grid;grid-template-columns:auto 1fr auto;align-items:end">
      <div class="mono" aria-hidden="true" style="padding:10px 6px 0 2px">${i+1})</div>
      <div>
        <select id="sel-${i}">
          <option value="">Select an operation…</option>
          ${CATALOG.map(o=>`<option value="${o.main}" ${s.main===o.main?'selected':''}>${o.label}</option>`).join('')}
        </select>
      </div>
      <button class="handle" title="Reorder" aria-label="Reorder">
        <svg class="dots" viewBox="0 0 14 22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          ${Array.from({length:6}).map((_,r)=>Array.from({length:2})
            .map((_,c)=>`<circle cx="${4+c*6}" cy="${3+r*3.5}" r="1.1" fill="currentColor"/>`).join('')).join('')}
        </svg>
      </button>
    </div>
    <div id="extras-${i}" class="row"></div>
  `;
  stepsWrap.appendChild(card);

  // remove (consentito anche sui primi due; la validazione sta nel Generate)
  card.querySelector('.xbtn').addEventListener('click', ()=>{
    steps.splice(i,1);
    refreshSteps();
  });

  // change main
card.querySelector('#sel-'+i).addEventListener('change', e=>{
  const main = e.target.value;
  const cfg = CATALOG.find(x=>x.main===main) || {duration:false,extras:false,sub:[]};
  s.main = main; s.sub = ''; s.hours='';
  s.mucilagePct=''; 
  s.extras={
    container:'', addition:'', additionKind:'', thermal:'no', temp:'', ph:'',
    contactDuringDrying:'', contactKind:''
  };
  renderExtras(i, cfg, s); setRail();
});


  // drag (mouse + touch) via Pointer Events
  const handle = card.querySelector('.handle');
  handle.addEventListener('pointerdown', (ev)=> startDrag(ev, card));

  renderExtras(i, CATALOG.find(x=>x.main===s.main)||{duration:false,extras:false,sub:[]}, s);
}

function renderExtras(i, cfg, s) {
  const host = document.getElementById('extras-' + i);
  host.innerHTML = '';

  // 1) SUBTYPE (se previsti)
  if (cfg.sub && cfg.sub.length) {
    const sub = document.createElement('div');
    sub.className = 'row';
    sub.innerHTML = `
      <label for="sub-${i}">Subtype</label>
      <select id="sub-${i}">
        <option value="">Select an option</option>
        ${cfg.sub.map(k => `<option value="${k}" ${s.sub === k ? 'selected' : ''}>${SUB_LABELS[k]}</option>`).join('')}
      </select>`;
    host.appendChild(sub);
    sub.querySelector('#sub-' + i).addEventListener('change', e => { s.sub = e.target.value; });
  }

  // 2) Depulping → Mucilage left %
  if (s.main === 'P') {
    const pct = document.createElement('div');
    pct.className = 'row';
    pct.innerHTML = `
      <label for="pct-${i}">Mucilage left</label>
      <select id="pct-${i}">
        <option value="">Select an option</option>
        ${[10,25,50,75].map(v => `<option value="${v}" ${s.mucilagePct==v?'selected':''}>${v}%</option>`).join('')}
      </select>`;
    host.appendChild(pct);
    pct.querySelector('#pct-'+i).addEventListener('change', e => { s.mucilagePct = e.target.value; });
  }

  // 3) Durata (se prevista)
  if (cfg.duration) {
    const unitLabel = unitFor(s);
    const hrs = document.createElement('div');
    hrs.className = 'row';
    hrs.innerHTML = `
      <label for="hrs-${i}">${unitLabel}</label>
      <input id="hrs-${i}" type="number" min="0" max="999" placeholder="e.g., ${unitLabel==='Days'?'10':'24'}" value="${s.hours}"/>`;
    host.appendChild(hrs);
    hrs.querySelector('#hrs-' + i).addEventListener('input', e => {
      const v = e.target.value.replace(/[^0-9]/g, ''); s.hours = v.slice(0, 3);
    });
  }

  // 4) Fermentation → extra campi
  if (s.main === 'F') {
    // Container + Temperature + Addition + (Addition kind*) + Thermal shock
    
    const temp = document.createElement('div');
    temp.className = 'row';
    temp.innerHTML = `
      <label for="temp-${i}">Temperature (°C)</label>
      <input id="temp-${i}" type="text" placeholder="e.g., 18" value="${s.extras.temp || ''}"/>`;
    host.appendChild(temp);
    temp.querySelector('#temp-'+i).addEventListener('input', e => { s.extras.temp = e.target.value.trim(); });
    
    const thermal = document.createElement('div');
    thermal.className = 'row';
    thermal.innerHTML = `
      <label for="th-${i}">Thermal shock</label>
      <select id="th-${i}">
        <option value="no"  ${s.extras.thermal==='no'?'selected':''}>No</option>
        <option value="yes" ${s.extras.thermal==='yes'?'selected':''}>Yes</option>
      </select>`;
    host.appendChild(thermal);
    thermal.querySelector('#th-'+i).addEventListener('change', e => { s.extras.thermal = e.target.value; });
    
    const cont = document.createElement('div');
    cont.className = 'row';
    cont.innerHTML = `
      <label for="ct-${i}">Container</label>
      <select id="ct-${i}">
        ${['','plastic','wood','metal','concrete','clay'].map(v=>{
          const label = v===''?'Select an option':
            v==='plastic'?'Plastic barrel':
            v==='wood'?'Wood barrel':
            v==='metal'?'Metal tank':
            v==='concrete'?'Concrete':
            'Clay pot';
          return `<option value="${v}" ${s.extras.container===v?'selected':''}>${label}</option>`;
        }).join('')}
      </select>`;
    host.appendChild(cont);
    cont.querySelector('#ct-'+i).addEventListener('change', e => { s.extras.container = e.target.value; });

    const add = document.createElement('div');
    add.className = 'row';
    add.innerHTML = `
      <label for="add-${i}">Addition of</label>
      <select id="add-${i}">
        ${['nothing','mosto','yeast','bacteria','koji','fruits','herbs','spices','flowers','essential','other'].map(v=>{
          const lbl = v==='nothing'?'Nothing':
                      v==='essential'?'Essential oils':
                      v[0].toUpperCase()+v.slice(1);
          return `<option value="${v}" ${s.extras.addition===v?'selected':''}>${lbl}</option>`;
        }).join('')}
      </select>`;
    host.appendChild(add);
    const addSel = add.querySelector('#add-'+i);
    addSel.addEventListener('change', e => { s.extras.addition = e.target.value; toggleAddKind(); });

    const addKind = document.createElement('div');
    addKind.className = 'row';
    addKind.innerHTML = `
      <label for="addk-${i}">Specify kind</label>
      <input id="addk-${i}" type="text" placeholder="e.g., mango / lavender / cinnamon" value="${s.extras.additionKind || ''}"/>`;
    host.appendChild(addKind);
    const addKindInput = addKind.querySelector('#addk-'+i);
    addKindInput.addEventListener('input', e => { s.extras.additionKind = e.target.value.trim(); });

    function toggleAddKind(){
      const need = ['fruits','herbs','spices','flowers','essential','other'].includes(s.extras.addition);
      addKind.style.display = need ? '' : 'none';
      if (!need) s.extras.additionKind = '';
    }
    toggleAddKind();
  }

  // 5) Drying → domanda contatto + kind se yes
  if (s.main === 'D') {
    const c = document.createElement('div');
    c.className = 'row';
    c.innerHTML = `
      <label for="cd-${i}">Were the beans put into contact with any other product during drying?</label>
      <select id="cd-${i}">
        <option value="">Select an option</option>
        <option value="no"  ${s.extras.contactDuringDrying==='no'?'selected':''}>No</option>
        <option value="yes" ${s.extras.contactDuringDrying==='yes'?'selected':''}>Yes</option>
      </select>`;
    host.appendChild(c);
    const sel = c.querySelector('#cd-'+i);
    sel.addEventListener('change', e => { s.extras.contactDuringDrying = e.target.value; toggleKind(); });

    const k = document.createElement('div');
    k.className = 'row';
    k.innerHTML = `
      <label for="cdk-${i}">Specify kind</label>
      <input id="cdk-${i}" type="text" placeholder="e.g., orange peels on beds" value="${s.extras.contactKind || ''}"/>`;
    host.appendChild(k);
    const kInput = k.querySelector('#cdk-'+i);
    kInput.addEventListener('input', e => { s.extras.contactKind = e.target.value.trim(); });

    function toggleKind(){
      const need = s.extras.contactDuringDrying === 'yes';
      k.style.display = need ? '' : 'none';
      if (!need) s.extras.contactKind = '';
    }
    toggleKind();
  }
}


function refreshSteps(){
  stepsWrap.innerHTML='';
  steps.forEach((_,i)=> buildStepBlock(i));
  setRail();
}

/* === Drag & drop fluido stile iOS (Pointer Events, con translateY) === */
let drag = { active:false, el:null, startPageY:0, startIndex:0, ph:null, baseTop:0 };

function startDrag(ev, el){
  ev.preventDefault();
  el.setPointerCapture?.(ev.pointerId);

  drag.active = true;
  drag.el = el;
  drag.startPageY = ev.pageY;            // usa pageY per non “saltare” con lo scroll
  drag.startIndex = [...stepsWrap.children].indexOf(el);
  drag.baseTop = el.offsetTop;

  // placeholder che occupa spazio
  drag.ph = document.createElement('div');
  drag.ph.className = 'step';
  drag.ph.style.visibility = 'hidden';
  drag.ph.style.height = el.getBoundingClientRect().height + 'px';
  stepsWrap.insertBefore(drag.ph, el.nextSibling);

  // “stacchiamo” l’elemento, ma lo muoviamo con translateY: segue il dito
  el.classList.add('drag-ghost');
  el.style.position = 'absolute';
  el.style.left = el.offsetLeft + 'px';
  el.style.width = el.offsetWidth + 'px';
  el.style.top = drag.baseTop + 'px';
  el.style.transform = 'translateY(0px)';
  el.style.pointerEvents = 'none';

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', endDrag, { once:true });
}

function onDragMove(ev){
  if(!drag.active) return;
  const el = drag.el;

  // delta rispetto all’ultimo evento, con pageY (robusto su touch)
  const dy = ev.pageY - drag.startPageY;
  drag.startPageY = ev.pageY;

  // muovi l’elemento
  const currentY = parseFloat(el.style.transform.replace(/translateY\\(([-0-9.]+)px\\)/,'$1')) || 0;
  const nextY = currentY + dy;
  el.style.transform = `translateY(${nextY}px)`;

  // posizione del centro per decidere dove mettere la placeholder
  const center = el.offsetTop + nextY + el.offsetHeight/2;

  let targetIndex = Array.from(stepsWrap.children).indexOf(drag.ph);
  const kids = Array.from(stepsWrap.children).filter(n=>n!==el);
  for(let k=0;k<kids.length;k++){
    const n = kids[k];
    const mid = n.offsetTop + n.offsetHeight/2;
    if(center < mid){ targetIndex = k; break; } else { targetIndex = k+1; }
  }
  if(stepsWrap.children[targetIndex] !== drag.ph){
    stepsWrap.insertBefore(drag.ph, stepsWrap.children[targetIndex] || null);
  }
}

function endDrag(){
  if(!drag.active) return;

  const from = drag.startIndex;
  const finalIndex = [...stepsWrap.children].indexOf(drag.ph);

  // rimetti l’elemento al posto della placeholder
  stepsWrap.insertBefore(drag.el, drag.ph);

  // reset stile
  const el = drag.el;
  el.style.position=''; el.style.top=''; el.style.left=''; el.style.width='';
  el.style.transform=''; el.style.pointerEvents='';
  el.classList.remove('drag-ghost');
  drag.ph.remove();

  // aggiorna stato (“fa spazio” definitivo)
  const to = finalIndex > from ? finalIndex - 1 : finalIndex;
  const [moved] = steps.splice(from,1);
  steps.splice(to,0,moved);

  drag = { active:false, el:null, startPageY:0, startIndex:0, ph:null, baseTop:0 };
  refreshSteps();
}

/* ------- BeanTag drawing (esagono/dotcode-like o tua variante attuale) ------- */
async function drawBeanTag(payloadKey) {
  const w = canvas.width, h = canvas.height;
  const digest = await strongHash(payloadKey || '');
  const mix = (digest[0] ^ digest[1] ^ digest[2] ^ digest[3]) >>> 0;
  const rnd = prng32(mix || 1);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#000';
  ctx.fillStyle = ctx.strokeStyle;

  // Esagono semplice
  const cx = 110, cy = 120, R = 90;
  const pts = [[cx, cy - R], [cx + R, cy - R / 2], [cx + R, cy + R / 2], [cx, cy + R], [cx - R, cy + R / 2], [cx - R, cy - R / 2]];
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.stroke();

  // Clip a esagono
  ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for (let i=1;i<6;i++) ctx.lineTo(pts[i][0],pts[i][1]); ctx.closePath(); ctx.clip();

  // Griglia di punti (deterministica)
  const pad = 14, innerR = R - pad, cols = 19, rowH = (innerR * 2) / (cols * 0.9);
  for (let r = 0; r < cols; r++) {
    const y = cy - innerR + r * rowH;
    const offset = (r % 2 ? 0.5 : 0), rowCols = cols - (r % 2 ? 1 : 0);
    for (let c = 0; c < rowCols; c++) {
      const x = (cx - innerR) + (c + offset) * ((innerR * 2) / cols);
      const sel = (((mix >>> ((r * 3 + c) % 24)) & 1) ^ (((r * 31 + c * 17) & 7) === 0 ? 1 : 0));
      if (sel) { const s = 1.6 + rnd() * 0.4; ctx.fillRect(x-s/2, y-s/2, s, s); }
    }
  }
  ctx.restore();

  // short marker
  const short = (mix >>> 0).toString(36).toUpperCase();
  ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(short, cx, h - 8);
}

async function exportSVG(payloadKey) {
  const w = 220, h = 240; const cx = 110, cy = 120, R = 90;
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#000';
  const pts = [[cx, cy - R], [cx + R, cy - R / 2], [cx + R, cy + R / 2], [cx, cy + R], [cx - R, cy + R / 2], [cx - R, cy - R / 2]];
  const hexPath = `M${pts.map(p => p.join(',')).join(' L ')} Z`;
  const digest = await strongHash(payloadKey);
  const mix = (digest[0]^digest[1]^digest[2]^digest[3])>>>0;
  const pad = 14, innerR = R - pad, cols = 19, cellW = (innerR * 2) / cols, rowH = (innerR * 2) / (cols * 0.9);
  const dots = [];
  for (let r = 0; r < cols; r++) {
    const y = cy - innerR + r * rowH, offset = (r % 2 ? 0.5 : 0), rowCols = cols - (r % 2 ? 1 : 0);
    for (let c = 0; c < rowCols; c++) {
      const x = (cx - innerR) + (c + offset) * cellW;
      const sel = (((mix >>> ((r * 3 + c) % 24)) & 1) ^ (((r * 31 + c * 17) & 7) === 0 ? 1 : 0));
      if (sel) { dots.push(`<rect x="${(x-0.9).toFixed(2)}" y="${(y-0.9).toFixed(2)}" width="${(1.8).toFixed(2)}" height="${(1.8).toFixed(2)}" fill="${ink}"/>`); }
    }
  }
  const short = (mix >>> 0).toString(36).toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-encoder="dotcode-like-v1" data-payload="${encodeURIComponent(payloadKey)}">\n<rect width="${w}" height="${h}" fill="#FFFFFF"/>\n<path d="${hexPath}" fill="none" stroke="${ink}" stroke-width="2"/>\n${dots.join('\\n')}\n<text x="${cx}" y="${h-8}" text-anchor="middle" fill="${ink}" font-size="10" font-family="ui-monospace, monospace">${short}</text>\n</svg>`;
}

/* ------- Outputs (CPC/link/tag) ------- */
function redrawLinkAndTag(cpc) {
  const opt = buildOpt();
  const url = linkFrom(cpc, opt);
  if (shareA) shareA.href = url;
  drawBeanTag((cpc || '') + '|' + (opt ? JSON.stringify(opt) : ''));
}

/* ------- Init / Wire ------- */
function refreshAndRail() { refreshSteps(); setRail(); }
refreshAndRail();

// Add / Clear
$('#addStep').addEventListener('click', () => { steps.push(blankStep()); refreshAndRail(); });
$('#clearAll').addEventListener('click', () => {
  steps = [blankStep(), blankStep()];
  refreshAndRail();
  if (cpcEl) cpcEl.textContent = '';
  if (hint) hint.textContent = '';
  if (beanPanel) beanPanel.classList.remove('open'); // chiudi BeanTag
});

// Generate
$('#gen')?.addEventListener('click', async () => {
  // passi minimi: almeno 2 step selezionati
  const filled = steps.filter(s => s.main);
  if (filled.length < 2) {
    hint.textContent = 'Please add at least two steps.';
    return;
  }

  // validazioni per durata + campi opzionali che puoi voler rendere obbligatori
  for (const s of filled) {
    const cfg = CATALOG.find(x => x.main === s.main);

    // Durata obbligatoria dove previsto (Hours/Days a seconda dello step)
    if (cfg && cfg.duration) {
      const v = String(s.hours ?? '').trim();
      if (!/^\d{1,3}$/.test(v)) {
        hint.textContent = 'Please fill duration where required.';
        return;
      }
    }

    // Depulping: se vuoi forzare la % di mucillagine (opzionale, lascia commentato)
    // if (s.main === 'P') {
    //   const ex = s.extras || {};
    //   if (ex.requireMucilagePct && (ex.mucilagePct === '' || ex.mucilagePct == null)) {
    //     hint.textContent = 'Please select mucilage left %.';
    //     return;
    //   }
    // }

    // Fermentation: se si seleziona un’aggiunta “descrittiva”, va specificato cosa
    if (s.main === 'F') {
      const ex = s.extras || {};
      const needsKind = ['fruits', 'herbs', 'spices', 'flowers', 'essential', 'other']
        .includes(ex.addition);
      if (needsKind && !(ex.additionKind && ex.additionKind.trim())) {
        hint.textContent = 'Please specify what was added during fermentation.';
        return;
      }
    }

    // Drying: se è stato indicato contatto con un prodotto, va specificato quale
    if (s.main === 'D') {
      const ex = s.extras || {};
      if (ex.contactDuringDrying === 'yes' && !(ex.contactKind && ex.contactKind.trim())) {
        hint.textContent = 'Please specify the product put in contact during drying.';
        return;
      }
    }

    // Rest: nessuna validazione extra oltre alla durata
  }

  // ok: genera CPC e aggiorna UI
  const cpc = buildCPC();
  cpcEl.textContent = cpc;
  hint.textContent = '';

  // mostra il BeanTag solo dopo la generazione
  if (beanPanel) beanPanel.classList.add('open');

  redrawLinkAndTag(cpc);
  setRail();
});


// Copy CPC (eventuale icona o fallback bottone)
(document.getElementById('copyIcon') || document.getElementById('copyCpc'))?.addEventListener('click', ()=>{
  const t=cpcEl.textContent.trim(); if(!t){alert('Generate the code first.');return;}
  navigator.clipboard.writeText(t).catch(()=>alert('Copy failed.'));
});

// Download unico con menu (se presente)
const dlMenu = document.getElementById('dlMenu');
document.getElementById('downloadBtn')?.addEventListener('click', ()=>{ dlMenu?.classList.toggle('open'); });
document.getElementById('dlPng')?.addEventListener('click', (e)=>{ e.preventDefault(); const link=document.createElement('a'); link.href=canvas.toDataURL('image/png'); link.download='BeanTag.png'; document.body.appendChild(link); link.click(); link.remove(); dlMenu?.classList.remove('open'); });
document.getElementById('dlSvg')?.addEventListener('click', async (e)=>{ e.preventDefault(); const cpc=cpcEl.textContent.trim(); const opt = buildOpt(); const svg=await exportSVG((cpc||'')+'|'+(opt?JSON.stringify(opt):'')); const blob=new Blob([svg],{type:'image/svg+xml'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='BeanTag.svg'; document.body.appendChild(a); a.click(); a.remove(); dlMenu?.classList.remove('open'); });

// Prefill from URL (?cpc=...)
(function prefillFromURL() {
  const p = new URLSearchParams(location.search);
  const cpcQ = p.get('cpc'); if (!cpcQ) return;
  steps = cpcQ.split('.').filter(Boolean).map(tok => {
    const m = tok.match(/^([A-Z])([A-Z]?)(\d{1,3})?$/);
    if (!m) return blankStep();
    const [, L, S, H] = m;
    return { main: L, sub: S || '', hours: H || '', extras: { temp: '', ph: '' } };
  });
  if (steps.length < 2) steps = [blankStep(), blankStep()];
  refreshAndRail();
})();
