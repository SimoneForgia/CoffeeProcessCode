import {CATALOG,SUB_LABELS,DESCRIPTIONS,$} from './common.js';

const summaryEl = $('#summary');

function parseCPC(cpc){
  if(!cpc) return [];
  return cpc.split('.').filter(Boolean).map(tok=>{
    const m = tok.match(/^([A-Z])([A-Z]?)(\d{0,3})$/);
    if(!m) return {raw:tok, main:'?', sub:'', hours:''};
    return {raw:tok, main:m[1], sub:m[2]||'', hours:m[3]||''};
  });
}
function makeDetails(titleKey, titleText, descKey){
  const det=document.createElement('details');
  const sum=document.createElement('summary');
  sum.className='sum-title';
  const caret=document.createElement('i'); caret.className='caret-small';
  const lbl=document.createElement('span'); lbl.textContent=titleText;
  sum.appendChild(caret); sum.appendChild(lbl);
  det.appendChild(sum);
  const p=document.createElement('div'); p.className='sum-desc'; p.textContent = DESCRIPTIONS[descKey] || '—';
  det.appendChild(p);
  return det;
}
function renderVerticalSummary(cpc){
  summaryEl.innerHTML='';
  const groups = parseCPC(cpc);
  if(groups.length===0){
    const li=document.createElement('li');
    li.className='tiny';
    li.textContent='No CPC in link.';
    summaryEl.appendChild(li);
    return;
  }

  groups.forEach((g, idx) => {
    const frag = document.createDocumentFragment();

    // --- MAIN ROW (sempre per prima) ---
    const liMain = document.createElement('li');
    liMain.className = 'sum-row';

    const codeMain = document.createElement('div');
    codeMain.className = 'sum-code mono';
    codeMain.textContent = g.main;
    liMain.appendChild(codeMain);

    const rightMain = document.createElement('div');
    const mainLabel = (CATALOG.find(x => x.main === g.main) || {}).label || 'Unknown';
    rightMain.appendChild(makeDetails(g.main, mainLabel, g.main));
    liMain.appendChild(rightMain);

    frag.appendChild(liMain);

    // --- SUB ROW (se presente) ---
    if (g.sub) {
      const liSub = document.createElement('li');
      liSub.className = 'sum-row';

      const codeSub = document.createElement('div');
      codeSub.className = 'sum-code mono';
      codeSub.textContent = g.sub;
      liSub.appendChild(codeSub);

      const rightSub = document.createElement('div');
      rightSub.appendChild(makeDetails('S' + g.sub, SUB_LABELS[g.sub] || g.sub, 'S' + g.sub));
      liSub.appendChild(rightSub);

      frag.appendChild(liSub);
    }

    // --- TIME ROW (se presente) ---
    if (g.hours) {
      const liTime = document.createElement('li');
      liTime.className = 'sum-row';

      const codeTime = document.createElement('div');
      codeTime.className = 'sum-code mono';
      codeTime.textContent = g.hours;  // numero allineato nella colonna da 40px
      liTime.appendChild(codeTime);

      const n = parseInt(g.hours, 10);
      const isDays = (g.main === 'D' || g.main === 'R'); // Drying / Rest in parchment
      const unit = isDays ? 'day' : 'hour';

      const rightTime = document.createElement('div');
      rightTime.textContent = `${n} ${unit}${n === 1 ? '' : 's'}`;
      liTime.appendChild(rightTime);

      frag.appendChild(liTime);
    }

    // --- SEPARATORE (pallino) tra gruppi ---
    if (idx < groups.length - 1) {
      const liDot = document.createElement('li');
      liDot.className = 'sum-row';

      const codeDot = document.createElement('div');
      codeDot.className = 'sum-code mono';
      codeDot.textContent = '.';
      liDot.appendChild(codeDot);

      const rightDot = document.createElement('div');
      rightDot.textContent = '';
      liDot.appendChild(rightDot);

      frag.appendChild(liDot);
    }

    // Append tutto insieme, nell'ordine corretto
    summaryEl.appendChild(frag);
  });
}


(function(){
  const p=new URLSearchParams(location.search);
  const cpc=p.get('cpc')||'';
  // opt non obbligatorio; se serve, puoi decodificare con atob/JSON.parse
  renderVerticalSummary(cpc);
})();
