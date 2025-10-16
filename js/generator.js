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
const beanPanel = document.getElementById('beanPanel') || null; // opzionale (se non esiste: nessun errore)
const canvas = document.getElementById('beanCanvas');
const ctx = canvas.getContext('2d');

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

/* ------- Step UI ------- */
function buildStepBlock(i) {
  const s = steps[i];
  const card = document.createElement('div');
  card.className = 'step';
  card.dataset.index = i;
  card.draggable = true;

  card.innerHTML = `
    <button class="handle" title="Drag to reorder" aria-label="Reorder">≡</button>
    <button class="close" title="Remove step" aria-label="Remove">×</button>

    <div class="row">
      <label class="num">${i + 1})</label>
      <select id="sel-${i}">
        <option value="">Select an operation…</option>
        ${CATALOG.map(o => `<option value="${o.main}" ${s.main === o.main ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
    </div>

    <div id="extras-${i}" class="row"></div>
  `;

  stepsWrap.appendChild(card);

  // Change op
  card.querySelector('#sel-' + i).addEventListener('change', e => {
    const main = e.target.value;
    const cfg = CATALOG.find(x => x.main === main) || { duration: false, extras: false, sub: [] };
    s.main = main; s.sub = ''; s.hours = ''; s.extras = { temp: '', ph: '' };
    renderExtras(i, cfg, s); setRail();
  });

  // Remove
  card.querySelector('.close').addEventListener('click', () => {
    steps.splice(i, 1);
    refreshSteps();
  });

  // Drag & drop
  card.addEventListener('dragstart', (ev) => {
    ev.dataTransfer.setData('text/plain', String(i));
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('dragover', (ev) => ev.preventDefault());
  card.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const from = parseInt(ev.dataTransfer.getData('text/plain'), 10);
    const to = parseInt(card.dataset.index, 10);
    if (isNaN(from) || isNaN(to) || from === to) return;
    const [moved] = steps.splice(from, 1);
    steps.splice(to, 0, moved);
    refreshSteps();
  });

  renderExtras(i, CATALOG.find(x => x.main === s.main) || { duration: false, extras: false, sub: [] }, s);
}

function renderExtras(i, cfg, s) {
  const host = document.getElementById('extras-' + i);
  host.innerHTML = '';

  // Subtype (second line)
  if (cfg.sub && cfg.sub.length) {
    const sub = document.createElement('div');
    sub.className = 'row';
    sub.innerHTML = `
      <label for="sub-${i}">Subtype</label>
      <select id="sub-${i}">
        <option value="">(none)</option>
        ${cfg.sub.map(k => `<option value="${k}" ${s.sub === k ? 'selected' : ''}>${SUB_LABELS[k]}</option>`).join('')}
      </select>`;
    host.appendChild(sub);
    sub.querySelector('#sub-' + i).addEventListener('change', e => { s.sub = e.target.value; });
  }

  // Hours (if duration)
  if (cfg.duration) {
    const hrs = document.createElement('div');
    hrs.className = 'row';
    hrs.innerHTML = `
      <label for="hrs-${i}">Hours</label>
      <input id="hrs-${i}" type="number" min="0" max="999" placeholder="e.g., 80" value="${s.hours}"/>`;
    host.appendChild(hrs);
    hrs.querySelector('#hrs-' + i).addEventListener('input', e => {
      const v = e.target.value.replace(/[^0-9]/g, ''); s.hours = v.slice(0, 3);
    });
  }

  // Extras for Fermentation only
  if (s.main === 'F') {
    const g = document.createElement('div'); g.className = 'grid2';
    g.innerHTML = `
      <div class="row">
        <label for="temp-${i}">Temperature (°C)</label>
        <input id="temp-${i}" type="text" placeholder="e.g., 18" value="${s.extras.temp || ''}"/>
      </div>
      <div class="row">
        <label for="ph-${i}">pH</label>
        <input id="ph-${i}" type="text" placeholder="e.g., 3.8" value="${s.extras.ph || ''}"/>
      </div>`;
    host.appendChild(g);
    g.querySelector('#temp-' + i).addEventListener('input', e => { s.extras.temp = e.target.value.trim(); });
    g.querySelector('#ph-' + i).addEventListener('input', e => { s.extras.ph = e.target.value.trim(); });
  }
}

function refreshSteps() {
  stepsWrap.innerHTML = '';
  steps.forEach((_, i) => buildStepBlock(i));
  setRail();
}

/* ------- BeanTag drawing (esagono-dotcode-like) ------- */
async function drawBeanTag(payloadKey) {
  const w = canvas.width, h = canvas.height;
  const digest = await strongHash(payloadKey || '');
  const mix = (digest[0] ^ digest[1] ^ digest[2] ^ digest[3]) >>> 0;
  const rnd = prng32(mix || 1);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#000';
  ctx.fillStyle = ctx.strokeStyle;

  // Hexagon outline
  const cx = 110, cy = 120, R = 90;
  const pts = [[cx, cy - R], [cx + R, cy - R / 2], [cx + R, cy + R / 2], [cx, cy + R], [cx - R, cy + R / 2], [cx - R, cy - R / 2]];
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.stroke();

  // Clip to hex
  ctx.save();
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.clip();

  // Dot grid
  const pad = 14, innerR = R - pad, cols = 19, rowH = (innerR * 2) / (cols * 0.9);
  for (let r = 0; r < cols; r++) {
    const y = cy - innerR + r * rowH;
    const offset = (r % 2 ? 0.5 : 0), rowCols = cols - (r % 2 ? 1 : 0);
    for (let c = 0; c < rowCols; c++) {
      const x = (cx - innerR) + (c + offset) * ((innerR * 2) / cols);
      // quick point-in-hex
      let inside = true; for (let k = 0; k < 6; k++) { const a = pts[k], b = pts[(k + 1) % 6]; if (((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) < 0) { inside = false; break; } }
      if (!inside) continue;
      const sel = (((mix >>> ((r * 3 + c) % 24)) & 1) ^ (((r * 31 + c * 17) & 7) === 0 ? 1 : 0));
      if (sel) { const s = 1.6 + rnd() * 0.4; ctx.beginPath(); ctx.arc(x, y, s / 2, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.restore();

  // Short marker
  const short = (mix >>> 0).toString(36).toUpperCase();
  ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(short, cx, h - 8);
}

async function exportSVG(payloadKey) {
  const w = 220, h = 240; const cx = 110, cy = 120, R = 90;
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#000';
  const pts = [[cx, cy - R], [cx + R, cy - R / 2], [cx + R, cy + R / 2], [cx, cy + R], [cx - R, cy + R / 2], [cx - R, cy - R / 2]];
  const hexPath = `M${pts.map(p => p.join(',')).join(' L ')} Z`;
  const mix = (await strongHash(payloadKey)).reduce((a, b) => a ^ b) >>> 0;
  const pad = 14, innerR = R - pad, cols = 19, cellW = (innerR * 2) / cols, rowH = (innerR * 2) / (cols * 0.9);
  const dots = [];
  for (let r = 0; r < cols; r++) {
    const y = cy - innerR + r * rowH, offset = (r % 2 ? 0.5 : 0), rowCols = cols - (r % 2 ? 1 : 0);
    for (let c = 0; c < rowCols; c++) {
      const x = (cx - innerR) + (c + offset) * cellW;
      const sel = (((mix >>> ((r * 3 + c) % 24)) & 1) ^ (((r * 31 + c * 17) & 7) === 0 ? 1 : 0));
      if (sel) { dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="0.9" fill="${ink}"/>`); }
    }
  }
  const payload = encodeURIComponent(payloadKey);
  const short = (mix >>> 0).toString(36).toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-encoder="dotcode-like-v1" data-payload="${payload}">\n<rect width="${w}" height="${h}" fill="#FFFFFF"/>\n<path d="${hexPath}" fill="none" stroke="${ink}" stroke-width="2"/>\n${dots.join('\\n')}\n<text x="${cx}" y="${h-8}" text-anchor="middle" fill="${ink}" font-size="10" font-family="ui-monospace, monospace">${short}</text>\n</svg>`;
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
  const filled = steps.filter(s => s.main);
  if (filled.length < 2) { hint.textContent = 'Please add at least two steps.'; return; }
  for (const s of filled) {
    const cfg = CATALOG.find(x => x.main === s.main);
    if (cfg && cfg.duration && (s.hours === '')) { hint.textContent = 'Please fill Hours where required.'; return; }
  }
  const cpc = buildCPC(); cpcEl.textContent = cpc; hint.textContent = '';
  if (beanPanel) beanPanel.classList.add('open'); // mostra il BeanTag solo ora
  redrawLinkAndTag(cpc); setRail();
});

// Copy CPC via icona dentro il box (fallback su #copyCpc se presente)
const copyIcon = document.getElementById('copyIcon');
if (copyIcon) {
  copyIcon.addEventListener('click', () => {
    const t = cpcEl.textContent.trim(); if (!t) { alert('Generate the code first.'); return; }
    navigator.clipboard.writeText(t).catch(() => alert('Copy failed.'));
  });
} else {
  // compat vecchio markup
  $('#copyCpc')?.addEventListener('click', () => {
    const t = cpcEl.textContent.trim(); if (!t) { alert('Generate the code first.'); return; }
    navigator.clipboard.writeText(t).catch(() => alert('Copy failed.'));
  });
}

// Download unico con menu
const dlMenu = document.getElementById('dlMenu');
document.getElementById('downloadBtn')?.addEventListener('click', () => { dlMenu?.classList.toggle('open'); });
document.getElementById('dlPng')?.addEventListener('click', (e) => {
  e.preventDefault();
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = 'BeanTag.png';
  document.body.appendChild(link); link.click(); link.remove();
  dlMenu?.classList.remove('open');
});
document.getElementById('dlSvg')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const cpc = cpcEl.textContent.trim();
  const opt = buildOpt();
  const svg = await exportSVG((cpc || '') + '|' + (opt ? JSON.stringify(opt) : ''));
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'BeanTag.svg';
  document.body.appendChild(a); a.click(); a.remove();
  dlMenu?.classList.remove('open');
});

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
