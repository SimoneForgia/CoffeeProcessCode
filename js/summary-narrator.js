// js/summary-narrator.js
// Prose summary from ?cpc= and ?opt= only (EN).
// - First step: "This coffee ... first ..."
// - Subjects:
//     * BEFORE first Depulping -> alternate "the coffee cherries" / "the cherries"
//     * AFTER first Depulping  -> for D/H -> "(coffee) beans"; for F/W/R -> alternate "the coffee" and "(coffee) beans"
// - "Next," is leading. "After that," and "Lastly," are leading. "then" and "subsequently" are inline (…was then… / …was subsequently…).
// - After a leading connector, the next word is lowercase ("After that, the coffee ...").
// - Subtypes in prose; WR = "rinsed with water"; WK = "manually washed with the Kenyan process".
// - Negatives omitted (addition=nothing, thermal=no, contactDuringDrying=no).
// - °C without a space (e.g., 18°C).

import { SUB_LABELS, $ } from './common.js';

/* ===== WORDS ===== */
const WORDS = {
  then:   'then',
  subseq: 'subsequently',
  after:  'After that,',
  next:   'Next,',
  lastly: 'Lastly,',

  floated:   'floated in water',
  depulped:  'depulped',
  fermented: 'fermented',
  washed:    'washed',
  dried:     'dried',
  rested:    'rested',
  hulled:    'hulled',

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

const VESSEL = {
  concrete: 'concrete tank',
  metal:    'metal tank',
  plastic:  'plastic barrel',
  wood:     'wood barrel',
  clay:     'clay pot'
};

const DESCRIPTIVE_ADDITIONS = new Set(['fruits','herbs','spices','flowers','essential','other']);
const STANDALONE_ADDITIONS  = new Set(['salt','sugar','yeast','bacteria','koji','mosto']);

/* ===== parse/normalize ===== */
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
    (json.steps || []).forEach(e => {
      map[e.i] = {
        MP: e.MP || '', Ct: e.Ct || '',
        Add: e.Add || '', AddK: (e.AddK || ''),
        Th: e.Th || '', T: e.T || '', pH: e.pH || '',
        CD: e.CD || '', CDK: (e.CDK || '')
      };
    });
    return map;
  } catch { return {}; }
}
function normalize(cpc, optB64) {
  const steps = parseCPC(cpc);
  const extrasByIndex = parseOPT(optB64);
  return steps.map((s,i)=>({ ...s, extras: extrasByIndex[i] || {} }));
}

/* ===== subject logic & connectors ===== */
function firstDepulpIndex(steps) {
  const idx = steps.findIndex(s => s.main === 'P');
  return idx < 0 ? Number.POSITIVE_INFINITY : idx;
}

// Deterministic alternators (no randomness)
function makeSubjectPicker(steps) {
  const depIdx = firstDepulpIndex(steps);
  let preCherryToggle = 0; // before depulping: alternate "coffee cherries" / "cherries"
  let postBeanToggle  = 0; // after depulping (for F/W/R): alternate coffee vs beans

  return function pick(i, step) {
    if (i === 0) return { np: 'this coffee', be: 'was', forceCap: true };

    // Before depulping: allow cherries synonyms
    if (i < depIdx) {
      const useCoffeeCherries = (preCherryToggle++ % 2 === 0);
      const np = useCoffeeCherries ? 'the coffee cherries' : 'the cherries';
      return { np, be: 'were' };
    }

    // After (or at) depulping
    if (step.main === 'D' || step.main === 'H') {
      const np = (postBeanToggle % 2 === 0) ? 'the beans' : 'the coffee beans';
      postBeanToggle++;
      return { np, be: 'were' };
    }

    // F/W/R after depulping: alternate coffee vs beans
    const useCoffee = (postBeanToggle++ % 2 === 0);
    if (useCoffee) return { np: 'the coffee', be: 'was' };
    return { np: 'the coffee beans', be: 'were' };
  };
}

// Connector placement and shape
// Returns {lead: string|null, inline: string|null, andPrefix: boolean}
function connectorPlacement(i, total, useLastly) {
  if (i === 0) return { lead: null, inline: null, andPrefix: false };

  // last sentence: "Lastly," leading (only if >=3 steps)
  if (i === total - 1 && useLastly && total >= 3) {
    return { lead: WORDS.lastly, inline: null, andPrefix: false };
  }

  const cycle = ['then', 'after', 'next', 'subseq']; // deterministic rotation
  const key = cycle[(i - 1) % cycle.length];

  if (key === 'after')  return { lead: WORDS.after, inline: null, andPrefix: false };
  if (key === 'next')   return { lead: WORDS.next,  inline: null, andPrefix: false };
  if (key === 'then')   return { lead: null, inline: WORDS.then,   andPrefix: (i % 2 === 0) };
  /* subseq */          return { lead: null, inline: WORDS.subseq, andPrefix: (i % 2 === 0) };
}

/* ===== formatters ===== */
const fmt = {
  duration(step) {
    const n = step.hours ? parseInt(step.hours, 10) : NaN;
    if (!Number.isFinite(n)) return '';
    const isDays = step.unit === 'd';
    const unit = isDays ? (n===1?WORDS.day:WORDS.days) : (n===1?WORDS.hour:WORDS.hours);
    return `${WORDS.for} ${n} ${unit}`;
  },
  temperature(ex) {
    if (!ex.T) return '';
    return `${WORDS.at} ${ex.T}°C`; // no space
  },
  vessel(ex) {
    if (!ex.Ct || !VESSEL[ex.Ct]) return '';
    const noun = VESSEL[ex.Ct];
    const art = /^[aeiou]/i.test(noun) ? 'an' : 'a';
    return `in ${art} ${noun}`;
  },
  mucilagePct(ex) {
    if (!ex.MP) return '';
    return WORDS.leavingPct.replace('{pct}', String(ex.MP));
  },
  addition(ex) {
    const add  = (ex.Add || '').toLowerCase().trim();
    const kind = (ex.AddK || '').toLowerCase().trim();

    if (!add || add === 'nothing') return '';

    if (kind) {
      const isMulti = /[, ]/.test(kind);
      if (isMulti && DESCRIPTIVE_ADDITIONS.has(add)) {
        const category = (add === 'essential') ? 'essential oils' : add;
        return `${WORDS.with} ${category} (${kind})`;
      }
      return `${WORDS.with} ${kind}`;
    }

    if (STANDALONE_ADDITIONS.has(add)) return `${WORDS.with} ${add}`;
    return '';
  },
  contact(ex) {
    if (ex.CD !== 'yes') return '';
    const kind = (ex.CDK || '').trim().toLowerCase();
    return kind ? `${WORDS.contactTxt} (${kind})` : WORDS.contactTxt;
  },
  subtypeProse(main, sub) {
    if (!sub) return '';
    const key = (main||'') + (sub||'');
    const label = SUB_LABELS[key] || SUB_LABELS[sub] || '';
    if (!label) return '';

    switch (key) {
      // Fermentation
      case 'FA': return 'under aerobic conditions';
      case 'FN': return 'under anaerobic conditions';
      case 'FC': return 'with carbonic maceration';
      case 'FI': return 'by immersion';
      // Washing
      case 'WM': return 'using mechanical demucilagers';
      case 'WK': return 'manually washed with the Kenyan process';
      case 'WR': return 'rinsed with water';
      // Drying
      case 'DR': return 'on raised beds';
      case 'DP': return 'on patios';
      case 'DM': return 'in a mechanical dryer';
      // Resting
      case 'RC': return 'in cherries';
      case 'RP': return 'in parchment';
      // Hulling
      case 'HW': return 'wet hulled';
      case 'HD': return 'hulled';
      default:   return label.toLowerCase();
    }
  }
};

/* ===== small utils ===== */
function capFirst(str){ return str ? str[0].toUpperCase()+str.slice(1) : str; }
function end(arr){ return arr.join(' ') + '.'; }

/* ===== templates (one sentence per step) ===== */
const TPL = {
  L(step, ctx) {
    const { np, be, forceCap } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    const andPfx = ctx.andPrefix ? ' and' : '';
    // after a leading connector, DO NOT capitalize the next word
    const sent = `${andPfx} ${np} ${be}${first}${inline} ${WORDS.floated}`.trim();
    parts.push(ctx.lead ? sent : capFirst(sent));
    return end(parts);
  },

  P(step, ctx) {
    const { np, be, forceCap } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    const andPfx = ctx.andPrefix ? ' and' : '';
    let sent = `${andPfx} ${np} ${be}${first}${inline} ${WORDS.depulped}`.trim();
    const mp = fmt.mucilagePct(step.extras);
    if (mp) sent += `, ${mp}`;
    parts.push(ctx.lead ? sent : capFirst(sent));
    return end(parts);
  },

  F(step, ctx) {
    const { np, be } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    const andPfx = ctx.andPrefix ? ' and' : '';

    const chunks = [];
    chunks.push(`${andPfx} ${np} ${be}${first}${inline} ${WORDS.fermented}`.trim());

    const sub = fmt.subtypeProse(step.main, step.sub);
    if (sub) chunks.push(sub);

    const dur = fmt.duration(step);
    if (dur) chunks.push(dur);

    const vess = fmt.vessel(step.extras);
    if (vess) chunks.push(vess);

    const temp = fmt.temperature(step.extras);
    if (temp) chunks.push(temp);

    const add = fmt.addition(step.extras);
    if (add) chunks.push(add);

    if (step.extras.Th === 'yes') chunks.push(`${WORDS.with} a thermal shock`);

    const sent = chunks.join(' ');
    parts.push(ctx.lead ? sent : capFirst(sent));
    return end(parts);
  },

  W(step, ctx) {
    const { np, be } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    const andPfx = ctx.andPrefix ? ' and' : '';

    const sub = fmt.subtypeProse(step.main, step.sub);

    if (sub === 'rinsed with water' || sub === 'manually washed with the Kenyan process') {
      const sent = `${andPfx} ${np} ${be}${first}${inline} ${sub}`.trim();
      parts.push(ctx.lead ? sent : capFirst(sent));
      return end(parts);
    }

    const baseVerb = WORDS.washed;
    const sent = sub
      ? `${andPfx} ${np} ${be}${first}${inline} ${baseVerb} ${sub}`.trim()
      : `${andPfx} ${np} ${be}${first}${inline} ${baseVerb}`.trim();

    parts.push(ctx.lead ? sent : capFirst(sent));
    return end(parts);
  },

  D(step, ctx) {
    const { np, be } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    const andPfx = ctx.andPrefix ? ' and' : '';

    const chunks = [];
    chunks.push(`${andPfx} ${np} ${be}${first}${inline} ${WORDS.dried}`.trim());

    const sub = fmt.subtypeProse(step.main, step.sub);
    if (sub) chunks.push(sub);

    const dur = fmt.duration(step);
    if (dur) chunks.push(dur);

    const contact = fmt.contact(step.extras);
    if (contact) chunks.push(contact);

    const sent = chunks.join(' ');
    parts.push(ctx.lead ? sent : capFirst(sent));
    return end(parts);
  },

  R(step, ctx) {
    const { np, be } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    const andPfx = ctx.andPrefix ? ' and' : '';

    const chunks = [];
    chunks.push(`${andPfx} ${np} ${be}${first}${inline} ${WORDS.rested}`.trim());

    const sub = fmt.subtypeProse(step.main, step.sub);
    if (sub) chunks.push(sub);

    const dur = fmt.duration(step);
    if (dur) chunks.push(dur);

    const sent = chunks.join(' ');
    parts.push(ctx.lead ? sent : capFirst(sent));
    return end(parts);
  },

  H(step, ctx) {
    const { np, be } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    const andPfx = ctx.andPrefix ? ' and' : '';

    const sub = fmt.subtypeProse(step.main, step.sub); // "wet hulled" | "hulled"
    const verb = sub || WORDS.hulled;

    const sent = `${andPfx} ${np} ${be}${first}${inline} ${verb}`.trim();
    parts.push(ctx.lead ? sent : capFirst(sent));
    return end(parts);
  }
};

/* ===== compose/render ===== */
function compose(steps, { useLastly }) {
  const pickSubject = makeSubjectPicker(steps);

  return steps.map((step, i) => {
    const place = connectorPlacement(i, steps.length, useLastly);
    const subject = pickSubject(i, step);
    const tpl = TPL[step.main] || ((st, ctx) => {
      const first = ctx.isFirst ? ' first' : '';
      const inline = ctx.inline ? ` ${ctx.inline}` : '';
      const andPfx = ctx.andPrefix ? ' and' : '';
      const start = ctx.lead ? ctx.lead + ' ' : '';
      const sent = `${andPfx} ${subject.np} ${subject.be}${first}${inline} processed`.trim();
      return capFirst(`${start}${sent}`) + '.';
    });
    return tpl(step, {
      lead: place.lead,
      inline: place.inline,
      andPrefix: place.andPrefix,
      isFirst: i === 0,
      subject
    });
  });
}

function render(targetSel, text) {
  const host = $(targetSel) || document.querySelector(targetSel);
  if (!host) return;
  host.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = text;
  host.appendChild(p);
}

/* ===== public API ===== */
export const SummaryNarrator = {
  init({ target = '#processSummary', useLastly = true } = {}) {
    const p = new URLSearchParams(location.search);
    const cpc = p.get('cpc') || '';
    const opt = p.get('opt') || '';

    if (!cpc) { render(target, 'A process summary will appear once a code is generated.'); return; }
    const steps = normalize(cpc, opt);
    if (!steps.length) { render(target, 'A process summary will appear once a code is generated.'); return; }

    const sentences = compose(steps, { useLastly });
    render(target, sentences.join(' '));
  }
};
window.SummaryNarrator = SummaryNarrator;
