/* js/typing-anim-summary.js — animazioni SOLO per summary.html */

(function () {
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

  async function typeText(el, text, {
    min = 12, max = 28,
    chunkFirstReveal = 6,
    caret = true,
  } = {}) {
    if (!text) return;
    if (caret) el.classList.add('type-caret');

    if (reduceMotion) {
      el.textContent = text;
      el.classList.remove('type-caret');
      return;
    }

    let shown = 0;
    for (let i = 0; i < text.length; i++) {
      el.textContent += text[i];
      shown++;
      const ch = text[i];
      let delay = rand(min, max);
      if (/[.,;:!?]/.test(ch)) delay += 80;
      if (/\n/.test(ch)) delay += 60;
      await wait(delay);
      if (shown === chunkFirstReveal) {
        el.dispatchEvent(new CustomEvent('first-chunk-shown', { bubbles: true }));
      }
    }
    el.classList.remove('type-caret');
  }

  async function animateTitle() {
    const title = document.getElementById('heroTitle');
    const left  = title?.querySelector('.bracket.left');
    const right = title?.querySelector('.bracket.right');
    const tgt   = title?.querySelector('.type-target');
    if (!title || !left || !right || !tgt) return;

    if (!reduceMotion) {
      left.style.animation  = 'bracket-open-left .28s ease-out forwards';
      right.style.animation = 'bracket-open-right .28s ease-out forwards';
      await wait(160);
    }
    const txt = tgt.getAttribute('data-text') || '';
    await typeText(tgt, txt, { min: 10, max: 22, chunkFirstReveal: 3 });
  }

  // Attende che un elemento venga riempito da altri script (SummaryNarrator, summary.js)
  function waitForNonEmptyText(el, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      if (!el) return reject(new Error('Elemento mancante'));
      const hasText = () => (el.textContent || '').trim().length > 0;

      if (hasText()) return resolve(el.textContent.trim());

      const obs = new MutationObserver(() => {
        if (hasText()) {
          obs.disconnect();
          resolve(el.textContent.trim());
        }
      });
      obs.observe(el, { childList: true, characterData: true, subtree: true });

      setTimeout(() => {
        obs.disconnect();
        // se nulla è arrivato, risolviamo con stringa vuota per non bloccare
        resolve((el.textContent || '').trim());
      }, timeoutMs);
    });
  }

  async function animateSummaryCard() {
    const summaryCard = document.getElementById('card-summary');
    const summaryTarget = document.getElementById('processSummary');
    if (!summaryCard || !summaryTarget) return;

    // 1) attendi che SummaryNarrator popoli #processSummary
    const produced = await waitForNonEmptyText(summaryTarget);

    // 2) sposta il testo in data-text e svuota l’elemento
    const text = produced || summaryTarget.getAttribute('data-text') || '';
    summaryTarget.setAttribute('data-text', text);
    summaryTarget.textContent = '';

    // 3) digita il Summary
    await typeText(summaryTarget, text, { min: 12, max: 26, chunkFirstReveal: 6 });

    // 4) segnala che la prima porzione è comparsa (se non già fatto)
    summaryTarget.dispatchEvent(new CustomEvent('first-chunk-shown', { bubbles: true }));
  }

  async function animateBreakdownCard() {
    const breakdownCard = document.getElementById('card-breakdown');
    if (!breakdownCard) return;

    // mostra la card (era hidden per non “caricare” prima della prima porzione)
    breakdownCard.hidden = false;
    breakdownCard.classList.remove('is-pending');

    // 1) lead
    const leadTarget = breakdownCard.querySelector('.lead .type-target');
    const leadText = (leadTarget?.getAttribute('data-text') || '').trim();
    if (leadTarget && leadText) {
      leadTarget.textContent = '';
      await typeText(leadTarget, leadText, { min: 12, max: 26, chunkFirstReveal: 5 });
    }

    // 2) lista popolata da summary.js — digita ogni <li> nell’ordine in cui appare
    const ul = document.getElementById('summary');
    if (!ul) return;

    const typeLi = async (li) => {
      if (!li) return;
      // incapsula contenuto esistente in span .type-target
      const raw = li.textContent.trim();
      li.textContent = '';
      const wrap = document.createElement('span');
      wrap.className = 'type-wrap';
      const tgt = document.createElement('span');
      tgt.className = 'type-target';
      tgt.setAttribute('data-text', raw);
      wrap.appendChild(tgt);
      li.appendChild(wrap);
      await typeText(tgt, raw, { min: 11, max: 23, chunkFirstReveal: 5 });
    };

    // digita quelli già presenti
    const existing = Array.from(ul.querySelectorAll('li'));
    for (const li of existing) await typeLi(li);

    // e quelli che arrivano dopo
    const obs = new MutationObserver(async (muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.tagName === 'LI') {
            // serializza: attendi l’ultimo in coda prima di proseguire
            await typeLi(n);
          }
        }
      }
    });
    obs.observe(ul, { childList: true });
  }

  async function run() {
    await animateTitle();

    // Sequenza: quando la PRIMA PORZIONE del summary compare, sblocca la card successiva
    const summaryCard = document.getElementById('card-summary');
    const summaryTarget = document.getElementById('processSummary');
    if (!summaryCard || !summaryTarget) return;

    // avvia l’animazione del Summary
    const firstChunkPromise = new Promise((resolve) => {
      const handler = () => { summaryTarget.removeEventListener('first-chunk-shown', handler); resolve(); };
      summaryTarget.addEventListener('first-chunk-shown', handler);
    });
    const summaryTyping = animateSummaryCard();

    // aspetta la prima porzione, poi fai partire la seconda card
    await firstChunkPromise;
    await animateBreakdownCard();

    // lascia concludere la digitazione del summary se non ha ancora finito
    await summaryTyping;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
