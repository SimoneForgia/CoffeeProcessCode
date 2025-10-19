import {CATALOG,SUB_LABELS,DESCRIPTIONS,$} from './common.js';

const summaryEl = $('#summary');

function parseCPC(cpc){
  if(!cpc) return [];
  return cpc.split('.').filter(Boolean).map(tok=>{
    const m = tok.match(/^([A-Z])([A-Z]?)(\d{0,3})?([hd])?$/);
    if(!m) return {raw:tok, main:'?', sub:'', hours:'', unit:''};
    return {raw:tok, main:m[1], sub:m[2]||'', hours:m[3]||'', unit:m[4]||''};
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

    // --- HEADER "Step 1" PRIMA DELLA PRIMA CATEGORIA ---
    if (idx === 0) {
      const liStepHdr = document.createElement('li');
      liStepHdr.className = 'sum-row';

      // colonna sinistra vuota (40px)
      const leftBlank = document.createElement('div');
      leftBlank.className = 'sum-code mono';
      leftBlank.textContent = '';  // solo spazio di allineamento
      liStepHdr.appendChild(leftBlank);

      // colonna destra "Step 1" in grassetto
      const rightHdr = document.createElement('div');
      rightHdr.innerHTML = '<b>Step 1</b>';
      liStepHdr.appendChild(rightHdr);

      frag.appendChild(liStepHdr);
    }

    // --- MAIN ROW ---
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
      const subKey = g.main + g.sub; // es. 'W'+'M' => 'WM'
      const subLabel = SUB_LABELS[subKey] || SUB_LABELS[g.sub] || g.sub;
      rightSub.appendChild(makeDetails(subKey, subLabel, subKey));
      liSub.appendChild(rightSub);

      frag.appendChild(liSub);
    }

    // --- TIME ROW (se presente) ---
    if (g.hours) {
  const liTime = document.createElement('li');
  liTime.className = 'sum-row';

  const codeTime = document.createElement('div');
  codeTime.className = 'sum-code mono';
  codeTime.textContent = g.hours;
  liTime.appendChild(codeTime);

  const n = parseInt(g.hours, 10);
  const unitChar = (g.unit === 'd' || g.unit === 'h') ? g.unit : ((g.main==='D'||g.main==='R') ? 'd' : 'h');
  const unitWord = unitChar === 'd' ? 'day' : 'hour';

  const rightTime = document.createElement('div');
  rightTime.textContent = `${n} ${unitWord}${n === 1 ? '' : 's'}`;
  liTime.appendChild(rightTime);

  frag.appendChild(liTime);
}


    // --- SEPARATORE con "Step N+1" nella cella destra ---
    if (idx < groups.length - 1) {
      const liDot = document.createElement('li');
      liDot.className = 'sum-row';

      const codeDot = document.createElement('div');
      codeDot.className = 'sum-code mono';
      codeDot.textContent = '.';
      liDot.appendChild(codeDot);

      const rightDot = document.createElement('div');
      rightDot.innerHTML = `<b>Step ${idx + 2}</b>`;
      liDot.appendChild(rightDot);

      frag.appendChild(liDot);
    }

    summaryEl.appendChild(frag);
  });
}



(function(){
  const p=new URLSearchParams(location.search);
  const cpc=p.get('cpc')||'';
  // opt non obbligatorio; se serve, puoi decodificare con atob/JSON.parse
  renderVerticalSummary(cpc);
})();
