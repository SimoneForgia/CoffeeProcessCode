// js/summary-narrator.js
// Builds a one-paragraph, English prose summary of the CPC steps,
// using ONLY data present in the link (?cpc=… & ?opt=base64json).
// Subtypes are shown only if present (two-letter token), using SUB_LABELS.
// Negatives are omitted (addition=nothing, thermal=no, contactDuringDrying=no).
// "Lastly," is used only if total steps >= 3.

import { SUB_LABELS, $ } from './common.js';

/* =========================
   VERTICAL WORD LIST / MAPS
   (edit-friendly: one item per line)
   ========================= */
const WORDS = {
  lead:       'This coffee was',
  then:       'Then,',
  after:      'After that,',
  next:       'Next,',
  subseq:     'Subsequently,',
  lastly:     'Lastly,',

  depulped:   'depulped',
  fermented:  'fermented',
  washed:     'washed',
  dried:      'dried',
  rested:     'rested',
  hulled:     'hulled',

  leavingPct: 'leaving {pct}% of the mucilage',

  for:        'for',
  at:         'at',
  hour:       'hour',
  hours:      'hours',
  day:        'day',
  days:       'days',
  with:       'with',
  using:      'using',

  contactTxt: 'in contact with other products'
};

// container labels (ONLY if container is present in opt)
const VESSEL = {
  concrete: 'concrete tank',
  metal:    'metal tank',
  plastic:  'plastic barrel',
  wood:     'wood barrel',
  clay:     'clay pot'
};

// categories considered “descriptive”; when a multi-item kind is given,
// we show "with <category> (<kind list>)"; otherwise if single-kind, show "with <kind>"
const DESCRIPTIVE_ADDITIONS = new Set(['fruits','herbs','spices','flowers','essential','other']);

// additions which stand on their own even without kind
const STANDALONE_ADDITIONS = new Set(['salt','sugar','yeast','bacteria','koji','mosto']);


/* =========================
   PARSERS & NORMALIZERS
   ========================= */
function parseCPC(cpc) {
  if (!cpc) return [];
  return cpc.split('.').filter(Boolean).map(tok => {
    const m = tok.match(/^([A-Z])([A-Z]?)(\d{0,3})([hd])?$/);
    if (!m) return { raw: tok, main: '?', sub: '', hours: '', unit: '' };
    return { raw: tok, main: m[1], sub: m[2] || '', hours: m[3] || '', unit: m[4] || '' };
  });
}

function parseOPT(optB64) {
  if (!optB64) return {};
  try {
    const json = JSON.parse(decodeURIComponent(escape(atob(optB64))));
    const map = {};
    (json.steps || []).forEach(entry => {
      const i = entry.i;
      map[i] = {
        MP:  entry.MP || '',     // mucilage %
        Ct:  entry.Ct || '',     // container
        Add: entry.Add || '',    // addition
        AddK:entry.AddK || '',   // addition kind (free text)
        Th:  entry.Th || '',     // thermal yes|no
        T:   entry.T  || '',     // temperature (assume °C if present)
        pH:  entry.pH || '',     // optional
        CD:  entry.CD || '',     // contactDuringDrying yes|no
        CDK: entry.CDK|| ''      // contact kind (free text)
      };
    });
    return map;
  } catch {
    return {};
  }
}

function normalize(cpc, optB64) {
  const steps = parseCPC(cpc);
  const extrasByIndex = parseOPT(optB64);
  return steps.map((s, i) => ({
    ...s,
    extras: extrasByIndex[i] || {}
  }));
}


/* =========================
   FORMATTERS (small, composable)
   ========================= */
const fmt = {
  // "for 24 hours" / "for 1 day"
  duration(step) {
    const h = step.hours ? parseInt(step.hours, 10) : NaN;
    if (!Number.isFinite(h)) return '';
    const isDays = step.unit === 'd';
    const unit = isDays
      ? (h === 1 ? WORDS.day : WORDS.days)
      : (h === 1 ? WORDS.hour : WORDS.hours);
    return `${WORDS.for} ${h} ${unit}`;
  },

  // "at 18 °C" (default °C; we do NOT convert)
  temperature(ex) {
    if (!ex.T) return '';
    return `${WORDS.at} ${ex.T} °C`;
  },

  // "in a concrete tank"
  vessel(ex) {
    if (!ex.Ct || !VESSEL[ex.Ct]) return '';
    const noun = VESSEL[ex.Ct];
    const article = /^[aeiou]/i.test(noun) ? 'an' : 'a';
    return `in ${article} ${noun}`;
  },

  // Depulping mucilage percent
  mucilagePct(ex) {
    if (!ex.MP) return '';
    return WORDS.leavingPct.replace('{pct}', String(ex.MP));
  },

  // Fermentation addition, applying your exact rules
  addition(ex) {
    const add = (ex.Add || '').toLowerCase().trim();
    const kindRaw = (ex.AddK || '').trim();
    const kind = kindRaw ? kindRaw.toLowerCase() : '';

    // omit negative / default cases
    if (!add || add === 'nothing') return '';

    // if kind is provided
    if (kind) {
      // if multi-word or list → use category if descriptive; kind in parentheses
      const isMulti = /[, ]/.test(kind);
      if (isMulti && DESCRIPTIVE_ADDITIONS.has(add)) {
        // ensure plural category for readability in English
        const category = (add === 'essential') ? 'essential oils' : add;
        return `${WORDS.with} ${category} (${kind})`;
      }
      // otherwise single-word (or non-descriptive category) → only the kind
      return `${WORDS.with} ${kind}`;
    }

    // no kind, but standalone additions (salt/sugar/yeast/bacteria/koji/mosto)
    if (STANDALONE_ADDITIONS.has(add)) {
      return `${WORDS.with} ${add}`;
    }

    // no kind and not standalone → omit entirely
    return '';
  },

  // Drying contact
  contact(ex) {
    if (ex.CD !== 'yes') return '';
    const kind = (ex.CDK || '').trim().toLowerCase();
    if (kind) return `${WORDS.contactTxt} (${kind})`;
    return WORDS.contactTxt;
  },

  // Subtype label in parentheses, only if present
  subtype(main, sub) {
    if (!sub) return '';
    const key = (main || '') + (sub || '');
    const label = SUB_LABELS[key] || SUB_LABELS[sub] || sub;
    return label ? `(${label})` : '';
  }
};


/* =========================
   CONNECTORS
   ========================= */
function connector(index, total, useLastly) {
  if (index === 0) return WORDS.lead;
  const pool = [WORDS.then, WORDS.after, WORDS.next, WORDS.subseq];
  // last item: use "Lastly," only if total >= 3 and useLastly=true
  if (index === total - 1 && useLastly && total >= 3) return WORDS.lastly;
  return pool[(index - 1) % pool.length];
}


/* =========================
   TEMPLATES per lettera (1 frase per step)
   Ogni template restituisce UNA stringa già punteggiata.
   ========================= */
const TPL = {
  // L — Floating (no extras in opt by design)
  L(step, idxCtx) {
    const parts = [
      `${idxCtx.conn} ${WORDS.depulped}`, // We don't really "depulp" here, but Floating is pre-selection.
    ];
    // For Floating (L), say it clearly:
    parts[0] = `${idxCtx.conn} floated in water`;
    return parts[0] + '.';
  },

  // P — Depulping (optional mucilage %)
  P(step, idxCtx) {
    const bits = [];
    const sub = fmt.subtype(step.main, step.sub);
    bits.push(`${idxCtx.conn} ${WORDS.depulped}`);
    if (sub) bits.push(sub);
    const mp = fmt.mucilagePct(step.extras);
    if (mp) bits[bits.length - 1] += `, ${mp}`;
    return bits.join(' ') + '.';
  },

  // F — Fermentation (duration, vessel, temperature, addition, thermal)
  F(step, idxCtx) {
    const pieces = [];
    const sub = fmt.subtype(step.main, step.sub); // "(Immersion)" etc.

    pieces.push(`${idxCtx.conn} ${WORDS.fermented}`);
    if (sub) pieces.push(sub);

    const dur = fmt.duration(step);
    if (dur) pieces.push(dur);

    const vess = fmt.vessel(step.extras);
    if (vess) pieces.push(vess);

    const temp = fmt.temperature(step.extras);
    if (temp) pieces.push(temp);

    const add = fmt.addition(step.extras);
    if (add) pieces.push(add);

    if (step.extras.Th === 'yes') {
      pieces.push(`${WORDS.with} a thermal shock`);
    }

    return pieces.join(' ') + '.';
  },

  // W — Washing (subtype only if present)
  W(step, idxCtx) {
    const sub = fmt.subtype(step.main, step.sub);
    const base = `${idxCtx.conn} ${WORDS.washed}`;
    return (sub ? `${base} ${sub}.` : `${base}.`);
  },

  // D — Drying (duration, contact if yes)
  D(step, idxCtx) {
    const pieces = [];
    const sub = fmt.subtype(step.main, step.sub);

    pieces.push(`${idxCtx.conn} ${WORDS.dried}`);
    if (sub) pieces.push(sub);

    const dur = fmt.duration(step);
    if (dur) pieces.push(dur);

    const contact = fmt.contact(step.extras);
    if (contact) pieces.push(contact);

    return pieces.join(' ') + '.';
  },

  // R — Resting (duration)
  R(step, idxCtx) {
    const sub = fmt.subtype(step.main, step.sub);
    const pieces = [`${idxCtx.conn} ${WORDS.rested}`];
    if (sub) pieces.push(sub);
    const dur = fmt.duration(step);
    if (dur) pieces.push(dur);
    return pieces.join(' ') + '.';
  },

  // H — Hulling (subtype only if present)
  H(step, idxCtx) {
    const sub = fmt.subtype(step.main, step.sub);
    const base = `${idxCtx.conn} ${WORDS.hulled}`;
    return (sub ? `${base} ${sub}.` : `${base}.`);
  }
};


/* =========================
   COMPOSER
   ========================= */
function composeSentences(steps, { useLastly }) {
  return steps.map((step, i) => {
    const conn = connector(i, steps.length, useLastly);
    const idxCtx = { conn };
    const fn = TPL[step.main] || ((s, ctx) => `${ctx.conn} processed.`);
    return fn(step, idxCtx);
  });
}

function render(targetSel, text) {
  const host = $(targetSel) || document.querySelector(targetSel);
  if (!host) return;
  host.innerHTML = ''; // clear
  const p = document.createElement('p');
  p.textContent = text;
  host.appendChild(p);
}


/* =========================
   PUBLIC API
   ========================= */
export const SummaryNarrator = {
  init({ target = '#processSummary', useLastly = true } = {}) {
    const p = new URLSearchParams(location.search);
    const cpc = p.get('cpc') || '';
    const opt = p.get('opt') || '';

    if (!cpc) {
      render(target, 'A process summary will appear once a code is generated.');
      return;
    }

    const steps = normalize(cpc, opt);
    if (!steps.length) {
      render(target, 'A process summary will appear once a code is generated.');
      return;
    }

    const sentences = composeSentences(steps, { useLastly });
    // Join with a space. Sentences are already punctuated.
    const paragraph = sentences.join(' ');
    render(target, paragraph);
  }
};

// expose globally for the inline init snippet
window.SummaryNarrator = SummaryNarrator;
