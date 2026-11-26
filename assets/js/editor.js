// MRInsight — editor a blocchi per le pagine di appunti.
// Volutamente semplice: blocchi uno sotto l'altro, menu «/», scorciatoie Markdown, trascinamento.
//
// creaEditor(radice, { contenuto, onCambio }) → { get(), focusInizio(), distruggi() }
// Formato: { v: 1, blocks: [{ id, type, html?, fatto?, righe? }] }

export const TIPI = {
  testo: { nome: 'Testo', descr: 'Paragrafo semplice', md: '' },
  titolo: { nome: 'Titolo', descr: 'Titolo di sezione', md: '#' },
  sottotitolo: { nome: 'Sottotitolo', descr: 'Titolo più piccolo', md: '##' },
  puntato: { nome: 'Elenco puntato', descr: 'Voci con pallino', md: '-' },
  numerato: { nome: 'Elenco numerato', descr: 'Voci numerate', md: '1.' },
  check: { nome: 'Checklist', descr: 'Voci da spuntare', md: '[]' },
  pitfall: { nome: 'Pitfall', descr: 'Trappola da ricordare', md: '!' },
  nota: { nome: 'Nota', descr: 'Riquadro informativo', md: '>' },
  tabella: { nome: 'Tabella', descr: 'Righe e colonne', md: '' },
  separatore: { nome: 'Separatore', descr: 'Linea orizzontale', md: '---' },
};
const TESTUALI = new Set(['testo', 'titolo', 'sottotitolo', 'puntato', 'numerato', 'check', 'pitfall', 'nota']);
const CONTINUANO = new Set(['puntato', 'numerato', 'check']); // Invio crea un'altra voce dello stesso tipo
const MD = Object.fromEntries(Object.entries(TIPI).filter(([, t]) => t.md).map(([k, t]) => [t.md, k]));
MD['*'] = 'puntato';

const ICONE = {
  maniglia: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  piu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  pitfall: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.5"/></svg>',
  nota: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
};

const nuovoId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);

// ───────────────────────── HTML consentito ─────────────────────────
// Solo formattazione in linea. Tutto il resto (script, stili, link, immagini incollate) viene tolto.
const CONSENTITI = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', CODE: 'code', MARK: 'mark', SUB: 'sub', SUP: 'sup', BR: 'br' };
const BLOCCHI_HTML = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'TR']);

function copiaPulito(src, dst) {
  for (const n of src.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) { dst.appendChild(document.createTextNode(n.nodeValue)); continue; }
    if (n.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = CONSENTITI[n.tagName];
    if (tag === 'br') { dst.appendChild(document.createElement('br')); continue; }
    if (tag) { const e = document.createElement(tag); copiaPulito(n, e); if (e.childNodes.length) dst.appendChild(e); continue; }
    if (['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'SVG', 'MATH'].includes(n.tagName)) continue;
    if (BLOCCHI_HTML.has(n.tagName) && dst.childNodes.length && dst.lastChild.nodeName !== 'BR') dst.appendChild(document.createElement('br'));
    copiaPulito(n, dst);
  }
}

export function pulisci(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out = document.createElement('div');
  copiaPulito(doc.body, out);
  while (out.lastChild && out.lastChild.nodeName === 'BR') out.lastChild.remove();
  return out.innerHTML;
}

const testoPiano = (el) => (el.textContent || '').replace(/ /g, ' ');

// ───────────────────────── cursore ─────────────────────────

function selezione(el) {
  const s = window.getSelection();
  if (!s.rangeCount) return null;
  const r = s.getRangeAt(0);
  return el.contains(r.startContainer) ? r : null;
}
function caretInizio(el) {
  const r = selezione(el);
  if (!r || !r.collapsed) return false;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length === 0 && !pre.cloneContents().querySelector('br');
}
function caretFine(el) {
  const r = selezione(el);
  if (!r || !r.collapsed) return false;
  const post = document.createRange();
  post.selectNodeContents(el);
  post.setStart(r.endContainer, r.endOffset);
  return post.toString().length === 0;
}
function metti(el, inizio) {
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(inizio);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

// ───────────────────────── editor ─────────────────────────

export function creaEditor(radice, { contenuto, onCambio = () => {} } = {}) {
  radice.classList.add('editor');
  radice.replaceChildren();
  const menu = document.createElement('div');
  menu.className = 'editor-menu';
  menu.hidden = true;
  const segno = document.createElement('div');
  segno.className = 'editor-segno-drop';
  segno.hidden = true;

  const lista = document.createElement('div');
  lista.className = 'editor-blocchi';
  radice.append(lista, menu, segno);

  let statoMenu = null; // { modo: 'slash'|'blocco', blocco, voci, indice }
  const cambiato = () => onCambio();

  // ───── creazione dei blocchi ─────
  function campoTesto(html, placeholder) {
    const t = document.createElement('div');
    t.className = 'blocco-testo';
    t.contentEditable = 'true';
    t.spellcheck = true;
    t.dataset.placeholder = placeholder;
    t.innerHTML = pulisci(html);
    return t;
  }

  function cella(html) {
    const td = document.createElement('td');
    td.className = 'cella';
    td.contentEditable = 'true';
    td.innerHTML = pulisci(html);
    return td;
  }

  function costruisciTabella(righe) {
    const wrap = document.createElement('div');
    wrap.className = 'tabella-wrap';
    const table = document.createElement('table');
    table.className = 'tabella';
    const tbody = document.createElement('tbody');
    righe.forEach((riga) => {
      const tr = document.createElement('tr');
      riga.forEach((c) => tr.appendChild(cella(c)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    const comandi = document.createElement('div');
    comandi.className = 'tabella-comandi';
    for (const [azione, testo] of [['+riga', '+ riga'], ['+colonna', '+ colonna'], ['-riga', '− riga'], ['-colonna', '− colonna']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.tab = azione;
      b.textContent = testo;
      comandi.appendChild(b);
    }
    wrap.append(table, comandi);
    return wrap;
  }

  function creaBlocco(b) {
    const tipo = TIPI[b.type] ? b.type : 'testo';
    const el = document.createElement('div');
    el.className = `blocco tipo-${tipo}`;
    el.dataset.id = b.id || nuovoId();
    el.dataset.tipo = tipo;

    const lato = document.createElement('div');
    lato.className = 'blocco-lato';
    lato.innerHTML = `<button type="button" class="blocco-aggiungi" title="Aggiungi un blocco sotto" tabindex="-1">${ICONE.piu}</button><button type="button" class="blocco-maniglia" title="Trascina per spostare · clic per il menu" draggable="true" tabindex="-1">${ICONE.maniglia}</button>`;
    el.appendChild(lato);

    const corpo = document.createElement('div');
    corpo.className = 'blocco-corpo';
    if (TESTUALI.has(tipo)) {
      if (tipo === 'check') {
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.className = 'blocco-spunta';
        c.checked = !!b.fatto;
        c.setAttribute('aria-label', 'Fatto');
        el.classList.toggle('fatto', !!b.fatto);
        corpo.appendChild(c);
      }
      if (tipo === 'pitfall' || tipo === 'nota') {
        const i = document.createElement('span');
        i.className = 'blocco-icona';
        i.innerHTML = ICONE[tipo];
        corpo.appendChild(i);
      }
      const ph = tipo === 'testo' ? 'Scrivi, oppure «/» per scegliere un blocco' : TIPI[tipo].nome;
      corpo.appendChild(campoTesto(b.html || '', ph));
    } else if (tipo === 'tabella') {
      const righe = Array.isArray(b.righe) && b.righe.length ? b.righe : [['', '', ''], ['', '', ''], ['', '', '']];
      corpo.appendChild(costruisciTabella(righe));
    } else if (tipo === 'separatore') {
      el.tabIndex = 0;
      corpo.appendChild(document.createElement('hr'));
    }
    el.appendChild(corpo);
    return el;
  }

  const blocchi = () => [...lista.children];
  const testoDi = (el) => el && el.querySelector(':scope > .blocco-corpo > .blocco-testo');
  const bloccoDi = (nodo) => nodo && nodo.closest && nodo.closest('.blocco');

  function serializzaBlocco(el) {
    const tipo = el.dataset.tipo;
    const b = { id: el.dataset.id, type: tipo };
    if (TESTUALI.has(tipo)) b.html = pulisci(testoDi(el).innerHTML);
    if (tipo === 'check') b.fatto = el.querySelector('.blocco-spunta').checked;
    if (tipo === 'tabella') b.righe = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((td) => pulisci(td.innerHTML)));
    return b;
  }

  function inserisciDopo(rif, b, focus = true) {
    const el = creaBlocco(b);
    if (rif) rif.after(el); else lista.appendChild(el);
    if (focus) focalizza(el, true);
    return el;
  }

  function focalizza(el, inizio) {
    if (!el) return;
    const t = testoDi(el);
    if (t) metti(t, inizio);
    else if (el.dataset.tipo === 'tabella') metti(el.querySelector('td'), inizio);
    else el.focus();
  }

  function trasforma(el, tipo) {
    const vecchio = serializzaBlocco(el);
    const html = TESTUALI.has(vecchio.type) ? vecchio.html : '';
    const nuovo = creaBlocco({ id: vecchio.id, type: tipo, html: TESTUALI.has(tipo) ? html : '' });
    el.replaceWith(nuovo);
    if (!TESTUALI.has(tipo) && tipo !== 'tabella') {
      // un separatore non si scrive: si aggiunge subito un paragrafo sotto
      const sotto = nuovo.nextElementSibling;
      if (!sotto) inserisciDopo(nuovo, { type: 'testo' });
      else focalizza(sotto, true);
    } else {
      focalizza(nuovo, false);
    }
    cambiato();
    return nuovo;
  }

  function rimuovi(el, verso = 'su') {
    const prima = el.previousElementSibling;
    const dopo = el.nextElementSibling;
    el.remove();
    if (!lista.children.length) inserisciDopo(null, { type: 'testo' });
    else if (verso === 'su' && prima) focalizza(prima, false);
    else focalizza(dopo || prima, true);
    cambiato();
  }

  // ───── menu (scelta del blocco e azioni) ─────
  function apriMenu(blocco, modo, filtro = '') {
    const voci = modo === 'slash'
      ? Object.entries(TIPI).filter(([k, t]) => !filtro || `${k} ${t.nome}`.toLowerCase().includes(filtro.toLowerCase())).map(([k, t]) => ({ azione: `tipo:${k}`, nome: t.nome, descr: t.descr + (t.md ? ` · ${t.md} + spazio` : '') }))
      : [
        ...Object.entries(TIPI).filter(([k]) => TESTUALI.has(k) && k !== blocco.dataset.tipo && TESTUALI.has(blocco.dataset.tipo)).map(([k, t]) => ({ azione: `tipo:${k}`, nome: `Trasforma in ${t.nome.toLowerCase()}` })),
        { azione: 'su', nome: 'Sposta su' },
        { azione: 'giu', nome: 'Sposta giù' },
        { azione: 'duplica', nome: 'Duplica' },
        { azione: 'elimina', nome: 'Elimina', pericolo: true },
      ];
    if (!voci.length) { chiudiMenu(); return; }
    statoMenu = { modo, blocco, voci, indice: 0 };
    menu.replaceChildren(...voci.map((v, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `menu-voce${i === 0 ? ' attiva' : ''}${v.pericolo ? ' pericolo' : ''}`;
      b.dataset.i = i;
      const n = document.createElement('span'); n.className = 'menu-nome'; n.textContent = v.nome; b.appendChild(n);
      if (v.descr) { const d = document.createElement('span'); d.className = 'menu-descr'; d.textContent = v.descr; b.appendChild(d); }
      return b;
    }));
    const rr = radice.getBoundingClientRect();
    const rb = blocco.getBoundingClientRect();
    menu.style.left = `${Math.max(0, rb.left - rr.left + (modo === 'slash' ? 28 : 0))}px`;
    menu.style.top = `${rb.bottom - rr.top + 4}px`;
    menu.hidden = false;
  }
  function chiudiMenu() { menu.hidden = true; statoMenu = null; }
  function evidenziaVoce(i) {
    if (!statoMenu) return;
    statoMenu.indice = (i + statoMenu.voci.length) % statoMenu.voci.length;
    [...menu.children].forEach((b, k) => b.classList.toggle('attiva', k === statoMenu.indice));
    menu.children[statoMenu.indice].scrollIntoView({ block: 'nearest' });
  }
  function eseguiVoce(i) {
    if (!statoMenu) return;
    const { blocco, voci, modo } = statoMenu;
    const v = voci[i];
    chiudiMenu();
    if (v.azione.startsWith('tipo:')) {
      if (modo === 'slash') testoDi(blocco).innerHTML = '';
      trasforma(blocco, v.azione.slice(5));
    } else if (v.azione === 'su' && blocco.previousElementSibling) {
      blocco.previousElementSibling.before(blocco); focalizza(blocco, false); cambiato();
    } else if (v.azione === 'giu' && blocco.nextElementSibling) {
      blocco.nextElementSibling.after(blocco); focalizza(blocco, false); cambiato();
    } else if (v.azione === 'duplica') {
      inserisciDopo(blocco, { ...serializzaBlocco(blocco), id: nuovoId() }); cambiato();
    } else if (v.azione === 'elimina') {
      rimuovi(blocco);
    }
  }

  menu.addEventListener('mousedown', (e) => e.preventDefault()); // non togliere il fuoco al blocco
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('.menu-voce');
    if (b) eseguiVoce(Number(b.dataset.i));
  });
  const fuoriMenu = (e) => { if (statoMenu && !menu.contains(e.target) && !e.target.closest('.blocco-maniglia')) chiudiMenu(); };
  document.addEventListener('mousedown', fuoriMenu);

  // ───── input: menu «/» e scorciatoie Markdown ─────
  lista.addEventListener('input', (e) => {
    const t = e.target.closest('.blocco-testo, .cella');
    if (!t) return;
    if (t.classList.contains('blocco-testo')) {
      if (t.innerHTML === '<br>') t.innerHTML = '';
      const el = bloccoDi(t);
      const testo = testoPiano(t);
      if (testo.startsWith('/') && !testo.includes(' ', 1) && testo.length <= 20) apriMenu(el, 'slash', testo.slice(1));
      else if (statoMenu && statoMenu.modo === 'slash') chiudiMenu();
      if (el.dataset.tipo === 'testo') {
        const m = testo.match(/^(\S{1,3}) $/);
        if (m && MD[m[1]]) { t.innerHTML = ''; trasforma(el, MD[m[1]]); return; }
      }
    }
    cambiato();
  });

  lista.addEventListener('change', (e) => {
    if (e.target.classList.contains('blocco-spunta')) {
      bloccoDi(e.target).classList.toggle('fatto', e.target.checked);
      cambiato();
    }
  });

  // incolla solo testo: una riga va nel blocco, più righe diventano più blocchi
  lista.addEventListener('paste', (e) => {
    const t = e.target.closest('.blocco-testo, .cella');
    if (!t) return;
    e.preventDefault();
    const testo = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\r\n?/g, '\n');
    const righe = testo.split('\n');
    if (t.classList.contains('cella') || righe.length === 1) {
      document.execCommand('insertText', false, t.classList.contains('cella') ? testo : righe[0]);
      return;
    }
    document.execCommand('insertText', false, righe.shift());
    let rif = bloccoDi(t);
    for (const riga of righe) {
      const m = riga.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
      const tipo = m ? (/\d/.test(m[1]) ? 'numerato' : 'puntato') : 'testo';
      const div = document.createElement('div');
      div.textContent = m ? m[2] : riga;
      rif = inserisciDopo(rif, { type: tipo, html: div.innerHTML }, false);
    }
    focalizza(rif, false);
    cambiato();
  });

  // ───── tastiera ─────
  lista.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    const el = bloccoDi(e.target);
    if (!el) return;

    if (statoMenu) {
      if (e.key === 'ArrowDown') { e.preventDefault(); evidenziaVoce(statoMenu.indice + 1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); evidenziaVoce(statoMenu.indice - 1); return; }
      if (e.key === 'Enter') { e.preventDefault(); eseguiVoce(statoMenu.indice); return; }
      if (e.key === 'Escape') { e.preventDefault(); chiudiMenu(); return; }
    }

    // separatore selezionato
    if (el.dataset.tipo === 'separatore' && e.target === el) {
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); rimuovi(el); }
      if (e.key === 'Enter') { e.preventDefault(); inserisciDopo(el, { type: 'testo' }); cambiato(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); focalizza(el.previousElementSibling, false); }
      if (e.key === 'ArrowDown') { e.preventDefault(); focalizza(el.nextElementSibling, true); }
      return;
    }

    // celle della tabella
    const td = e.target.closest('.cella');
    if (td) {
      if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
      if (e.key === 'Tab') {
        e.preventDefault();
        const celle = [...el.querySelectorAll('.cella')];
        let i = celle.indexOf(td) + (e.shiftKey ? -1 : 1);
        if (i >= celle.length) { azioneTabella(el, '+riga'); i = celle.length; }
        const tutte = [...el.querySelectorAll('.cella')];
        if (tutte[i]) metti(tutte[i], false);
      }
      return;
    }

    const t = testoDi(el);
    if (!t || e.target !== t) return;
    const tipo = el.dataset.tipo;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (CONTINUANO.has(tipo) && !testoPiano(t).trim()) { trasforma(el, 'testo'); return; }
      // divide il blocco al cursore
      const r = selezione(t);
      let html = '';
      if (r) {
        r.deleteContents();
        const coda = document.createRange();
        coda.selectNodeContents(t);
        coda.setStart(r.endContainer, r.endOffset);
        const box = document.createElement('div');
        box.appendChild(coda.extractContents());
        html = box.innerHTML;
      }
      if (t.innerHTML === '<br>') t.innerHTML = '';
      const nuovoTipo = CONTINUANO.has(tipo) ? tipo : 'testo';
      inserisciDopo(el, { type: nuovoTipo, html });
      cambiato();
      return;
    }

    if (e.key === 'Backspace' && caretInizio(t)) {
      if (tipo !== 'testo') { e.preventDefault(); trasforma(el, 'testo'); metti(testoDi(lista.querySelector(`[data-id="${el.dataset.id}"]`)), true); return; }
      const prima = el.previousElementSibling;
      if (!prima) return;
      e.preventDefault();
      const tp = testoDi(prima);
      if (!tp) {
        // prima c'è un separatore o una tabella
        if (!testoPiano(t)) rimuovi(el);
        else if (prima.dataset.tipo === 'separatore') { prima.remove(); cambiato(); }
        return;
      }
      // unisce al blocco precedente
      const punto = tp.childNodes.length;
      const frammento = document.createRange();
      frammento.selectNodeContents(t);
      tp.appendChild(frammento.extractContents());
      el.remove();
      tp.focus();
      const r = document.createRange();
      r.setStart(tp, Math.min(punto, tp.childNodes.length));
      r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      cambiato();
      return;
    }

    if (e.key === 'Delete' && caretFine(t)) {
      const dopo = el.nextElementSibling;
      const td2 = testoDi(dopo);
      if (!td2) return;
      e.preventDefault();
      const frammento = document.createRange();
      frammento.selectNodeContents(td2);
      const r = selezione(t);
      t.appendChild(frammento.extractContents());
      dopo.remove();
      if (r) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
      cambiato();
      return;
    }

    if (e.key === 'ArrowUp' && caretInizio(t) && el.previousElementSibling) { e.preventDefault(); focalizza(el.previousElementSibling, false); return; }
    if (e.key === 'ArrowDown' && caretFine(t) && el.nextElementSibling) { e.preventDefault(); focalizza(el.nextElementSibling, true); }
  });

  // ───── pulsanti a lato e tabella ─────
  function azioneTabella(el, azione) {
    const tbody = el.querySelector('tbody');
    const righe = [...tbody.children];
    const colonne = righe[0] ? righe[0].children.length : 0;
    if (azione === '+riga') {
      const tr = document.createElement('tr');
      for (let i = 0; i < colonne; i++) tr.appendChild(cella(''));
      tbody.appendChild(tr);
    } else if (azione === '+colonna' && colonne < 8) {
      righe.forEach((tr) => tr.appendChild(cella('')));
    } else if (azione === '-riga' && righe.length > 1) {
      righe[righe.length - 1].remove();
    } else if (azione === '-colonna' && colonne > 1) {
      righe.forEach((tr) => tr.lastElementChild.remove());
    }
    cambiato();
  }

  lista.addEventListener('mousedown', (e) => {
    if (e.target.closest('.blocco-aggiungi, .tabella-comandi button')) e.preventDefault();
  });
  lista.addEventListener('click', (e) => {
    const el = bloccoDi(e.target);
    if (!el) return;
    if (e.target.closest('.blocco-aggiungi')) {
      const nuovo = inserisciDopo(el, { type: 'testo' });
      testoDi(nuovo).textContent = '/';
      metti(testoDi(nuovo), false);
      apriMenu(nuovo, 'slash');
      return;
    }
    if (e.target.closest('.blocco-maniglia')) {
      if (statoMenu && statoMenu.blocco === el && statoMenu.modo === 'blocco') chiudiMenu();
      else apriMenu(el, 'blocco');
      return;
    }
    const bt = e.target.closest('.tabella-comandi button');
    if (bt) azioneTabella(el, bt.dataset.tab);
  });

  // ───── trascinamento dei blocchi ─────
  let trascinato = null;
  let destinazione = null;
  lista.addEventListener('dragstart', (e) => {
    const m = e.target.closest && e.target.closest('.blocco-maniglia');
    if (!m) { e.preventDefault(); return; }
    trascinato = bloccoDi(m);
    trascinato.classList.add('trascinato');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    e.dataTransfer.setDragImage(trascinato, 20, 16);
    chiudiMenu();
  });
  lista.addEventListener('dragover', (e) => {
    if (!trascinato) return;
    e.preventDefault();
    const el = bloccoDi(e.target);
    if (!el || el === trascinato) return;
    const r = el.getBoundingClientRect();
    const sopra = e.clientY < r.top + r.height / 2;
    destinazione = { el, sopra };
    const rr = radice.getBoundingClientRect();
    segno.style.top = `${(sopra ? r.top : r.bottom) - rr.top - 1}px`;
    segno.hidden = false;
  });
  const fineTrascina = () => {
    if (trascinato) trascinato.classList.remove('trascinato');
    trascinato = null; destinazione = null; segno.hidden = true;
  };
  lista.addEventListener('drop', (e) => {
    if (!trascinato) return;
    e.preventDefault();
    if (destinazione) {
      if (destinazione.sopra) destinazione.el.before(trascinato); else destinazione.el.after(trascinato);
      cambiato();
    }
    fineTrascina();
  });
  lista.addEventListener('dragend', fineTrascina);

  // ───── contenuto iniziale ─────
  const iniziali = contenuto && Array.isArray(contenuto.blocks) ? contenuto.blocks : [];
  (iniziali.length ? iniziali : [{ type: 'testo' }]).forEach((b) => lista.appendChild(creaBlocco(b)));

  return {
    get() {
      const bl = blocchi().map(serializzaBlocco);
      // un solo paragrafo vuoto = pagina vuota
      if (bl.length === 1 && bl[0].type === 'testo' && !bl[0].html) return { v: 1, blocks: [] };
      return { v: 1, blocks: bl };
    },
    focusInizio() { focalizza(lista.firstElementChild, true); },
    focusFine() { focalizza(lista.lastElementChild, false); },
    distruggi() {
      document.removeEventListener('mousedown', fuoriMenu);
      radice.replaceChildren();
    },
  };
}
