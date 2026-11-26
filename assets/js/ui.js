// Piccole utilità di interfaccia condivise dalle pagine di MRInsight.

const LOGO_URL = new URL('../img/structurad-logo.svg', import.meta.url);

export const riduciMovimento = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Inserisce il logo StructuRad (SVG inline, così si può animare il tracciato). */
export async function inserisciLogo(contenitore, { disegna = true } = {}) {
  if (!contenitore) return;
  try {
    const r = await fetch(LOGO_URL, { cache: 'force-cache' });
    if (!r.ok) throw new Error(r.status);
    const testo = await r.text();
    const doc = new DOMParser().parseFromString(testo, 'image/svg+xml');
    const svg = doc.documentElement;
    if (svg.nodeName.toLowerCase() !== 'svg') throw new Error('svg non valido');
    svg.setAttribute('aria-hidden', 'true');
    if (disegna && !riduciMovimento()) {
      svg.classList.add('logo-draw');
      svg.querySelectorAll('path').forEach((p) => p.setAttribute('pathLength', '1'));
    }
    contenitore.replaceChildren(document.importNode(svg, true));
  } catch (_) {
    /* il logo è decorativo: se non arriva, la barra resta comunque leggibile */
  }
}

/** Comparsa a cascata delle schede, con la stessa molla dei tool StructuRad. */
export function popSections(selettore = '.pop-section', passo = 70) {
  document.querySelectorAll(selettore).forEach((el, i) => {
    el.style.setProperty('--pop-delay', `${i * passo}ms`);
  });
}

export const ICONE = {
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M12 6v8"/><path d="M12 18.5v.01"/></svg>',
  fail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  skip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 12h12"/></svg>',
};

/** Copia testo negli appunti; prova la Clipboard API e ripiega su execCommand. */
export async function copiaTesto(testo) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(testo);
      return 'clipboard-api';
    } catch (_) { /* ripiego sotto */ }
  }
  const ta = document.createElement('textarea');
  ta.value = testo;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let riuscito = false;
  try { riuscito = document.execCommand('copy'); } catch (_) { riuscito = false; }
  ta.remove();
  if (!riuscito) throw new Error('copia non riuscita');
  return 'execCommand';
}
