// MRInsight — vista di un esame: albero delle pagine di appunti + pagina aperta con l'editor.
// Salvataggio automatico un secondo dopo l'ultima modifica.

import { messaggioErrore } from './sb.js';
import { zonaDa } from './zone.js';
import * as db from './pagine.js';
import { creaEditor } from './editor.js';

const $ = (id) => document.getElementById(id);
const MAX_LIVELLI = 3;
const RITARDO_MS = 1000;
const STRUTTURA_BASE = ['Anatomia', 'Protocollo e sequenze', 'Pitfall', 'Diagnosi differenziali', 'Score e misure'];

const ICONE = {
  pagina: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  freccia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  piu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  altro: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/></svg>',
};

const st = {
  esame: null,        // { id, title, zona }
  pagine: [],         // elenco piatto
  aperte: new Set(),  // nodi espansi nell'albero
  pagina: null,       // pagina aperta { id, title }
  editor: null,
  sporco: false,
  versione: 0,        // cresce a ogni modifica: serve a capire se durante il salvataggio è cambiato qualcosa
  salvando: null,     // Promise del salvataggio in corso
  timer: null,
  avvisa: () => {},
  preparato: false,
};

// ───────────────────────── utilità ─────────────────────────

const figli = (padre) => st.pagine.filter((p) => (p.parent_id || null) === (padre || null)).sort((a, b) => a.sort - b.sort);
const pagina = (id) => st.pagine.find((p) => p.id === id);
function antenati(id) {
  const out = [];
  let p = pagina(id);
  while (p && p.parent_id) { p = pagina(p.parent_id); if (p) out.unshift(p); }
  return out;
}
const livello = (id) => antenati(id).length + 1;
function discendenti(id) {
  const out = [];
  for (const f of figli(id)) out.push(f, ...discendenti(f.id));
  return out;
}
const hashPagina = (id) => `#/progress/${st.esame.zona}/${st.esame.id}${id ? `/${id}` : ''}`;
const vai = (id) => { const h = hashPagina(id); if (location.hash !== h) location.hash = h; };
const ora = () => new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

function statoSalvataggio(testo, tipo = '') {
  const el = $('statoSalvataggio');
  el.textContent = testo;
  el.className = `stato-salvataggio ${tipo}`.trim();
}

// ───────────────────────── salvataggio ─────────────────────────

function segnaModifica() {
  st.sporco = true;
  st.versione += 1;
  statoSalvataggio('Modifiche non salvate', 'attesa');
  clearTimeout(st.timer);
  st.timer = setTimeout(() => { salva(); }, RITARDO_MS);
}

function titoloCorrente() {
  return ($('titoloPagina').textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Senza titolo';
}

/** Salva la pagina aperta se ci sono modifiche. Restituisce true se tutto è salvato. */
export async function salva() {
  clearTimeout(st.timer);
  if (st.salvando) await st.salvando;
  if (!st.sporco || !st.pagina || !st.editor) return true;
  const id = st.pagina.id;
  const versione = st.versione;
  const dati = { title: titoloCorrente(), content: st.editor.get() };
  statoSalvataggio('Salvataggio…', 'attesa');
  st.salvando = (async () => {
    try {
      await db.salvaPagina(id, dati);
      const p = pagina(id);
      if (p) p.title = dati.title;
      if (st.versione === versione) { st.sporco = false; statoSalvataggio(`Salvato alle ${ora()}`, 'ok'); }
      return true;
    } catch (e) {
      statoSalvataggio(`Non salvato: ${messaggioErrore(e)} · riprovo tra poco`, 'fail');
      st.timer = setTimeout(() => { salva(); }, 5000);
      return false;
    } finally {
      st.salvando = null;
    }
  })();
  const ok = await st.salvando;
  if (ok && st.sporco) return salva(); // modifiche arrivate durante il salvataggio
  return ok;
}

/** Da chiamare prima di uscire o di cambiare pagina. */
export async function salvaInSospeso() {
  if (st.sporco) return salva();
  return true;
}

window.addEventListener('beforeunload', (e) => {
  if (!st.sporco) return;
  salva();
  e.preventDefault();
  e.returnValue = '';
});

// ───────────────────────── albero ─────────────────────────

let menuAperto = null;
function chiudiMenuPagina() { if (menuAperto) { menuAperto.remove(); menuAperto = null; } }
document.addEventListener('mousedown', (e) => { if (menuAperto && !menuAperto.contains(e.target)) chiudiMenuPagina(); });

function disegnaAlbero() {
  const radice = $('alberoPagine');
  const costruisci = (padre, prof) => {
    const ul = document.createElement('ul');
    ul.className = 'albero-lista';
    for (const p of figli(padre)) {
      const li = document.createElement('li');
      const riga = document.createElement('div');
      riga.className = `albero-voce${st.pagina && st.pagina.id === p.id ? ' attiva' : ''}`;
      riga.style.paddingLeft = `${4 + (prof - 1) * 14}px`;
      const haFigli = figli(p.id).length > 0;
      const aperta = st.aperte.has(p.id);
      riga.innerHTML = `<button type="button" class="albero-espandi${haFigli ? '' : ' vuoto'}${aperta ? ' aperta' : ''}" tabindex="-1" aria-label="Espandi">${ICONE.freccia}</button><a class="albero-link"><span class="albero-ico">${ICONE.pagina}</span><span class="albero-titolo"></span></a><span class="albero-azioni">${prof < MAX_LIVELLI ? `<button type="button" class="albero-azione" data-azione="sotto" title="Aggiungi sottopagina">${ICONE.piu}</button>` : ''}<button type="button" class="albero-azione" data-azione="menu" title="Altre azioni">${ICONE.altro}</button></span>`;
      riga.querySelector('.albero-titolo').textContent = p.title || 'Senza titolo';
      riga.querySelector('.albero-link').href = hashPagina(p.id);
      riga.dataset.id = p.id;
      li.appendChild(riga);
      if (haFigli && aperta) li.appendChild(costruisci(p.id, prof + 1));
      ul.appendChild(li);
    }
    return ul;
  };
  radice.replaceChildren(costruisci(null, 1));
  $('alberoVuoto').hidden = st.pagine.length > 0;
}

function apriMenuPagina(id, ancora) {
  chiudiMenuPagina();
  const fratelli = figli(pagina(id).parent_id);
  const i = fratelli.findIndex((p) => p.id === id);
  const voci = [
    i > 0 && ['su', 'Sposta su'],
    i < fratelli.length - 1 && ['giu', 'Sposta giù'],
    ['elimina', 'Elimina pagina'],
  ].filter(Boolean);
  const m = document.createElement('div');
  m.className = 'editor-menu menu-pagina';
  voci.forEach(([azione, testo]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `menu-voce${azione === 'elimina' ? ' pericolo' : ''}`;
    b.innerHTML = '<span class="menu-nome"></span>';
    b.firstChild.textContent = testo;
    b.addEventListener('click', () => { chiudiMenuPagina(); azionePagina(id, azione); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  const r = ancora.getBoundingClientRect();
  m.style.left = `${r.left + window.scrollX}px`;
  m.style.top = `${r.bottom + window.scrollY + 4}px`;
  m.hidden = false;
  menuAperto = m;
}

async function azionePagina(id, azione) {
  try {
    if (azione === 'su' || azione === 'giu') {
      const p = pagina(id);
      const fratelli = figli(p.parent_id);
      const i = fratelli.findIndex((x) => x.id === id);
      const j = azione === 'su' ? i - 1 : i + 1;
      if (j < 0 || j >= fratelli.length) return;
      [fratelli[i], fratelli[j]] = [fratelli[j], fratelli[i]];
      const cambi = [];
      fratelli.forEach((x, k) => { if (x.sort !== k) { x.sort = k; cambi.push({ id: x.id, sort: k, parent_id: x.parent_id }); } });
      disegnaAlbero();
      await db.riordina(cambi);
    }
    if (azione === 'elimina') {
      const p = pagina(id);
      const sotto = discendenti(id);
      const extra = sotto.length ? ` e ${sotto.length === 1 ? 'la sua sottopagina' : `le sue ${sotto.length} sottopagine`}` : '';
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Eliminare «${p.title}»${extra}? Non si può annullare.`)) return;
      const coinvolte = new Set([id, ...sotto.map((x) => x.id)]);
      if (st.pagina && coinvolte.has(st.pagina.id)) { st.sporco = false; clearTimeout(st.timer); }
      await db.eliminaPagina(id);
      st.pagine = st.pagine.filter((x) => !coinvolte.has(x.id));
      st.avvisa(`«${p.title}» eliminata`);
      if (st.pagina && coinvolte.has(st.pagina.id)) {
        st.pagina = null;
        const prossima = (p.parent_id && pagina(p.parent_id)) || figli(null)[0];
        vai(prossima ? prossima.id : null);
        if (!prossima) mostraPagina(null);
      }
      disegnaAlbero();
    }
  } catch (e) {
    st.avvisa(messaggioErrore(e), 'fail');
  }
}

async function nuovaPagina(parentId = null, title = 'Senza titolo', apri = true) {
  const p = await db.creaPagina({ examId: st.esame.id, parentId, title, sort: figli(parentId).length });
  st.pagine.push(p);
  if (parentId) st.aperte.add(parentId);
  disegnaAlbero();
  if (apri) {
    st.titoloDaSelezionare = true;
    vai(p.id);
  }
  return p;
}

async function creaStrutturaBase() {
  const btn = $('btnStrutturaBase');
  btn.disabled = true;
  try {
    let prima = null;
    for (const t of STRUTTURA_BASE) {
      const p = await nuovaPagina(null, t, false);
      prima = prima || p;
    }
    vai(prima.id);
  } catch (e) {
    st.avvisa(messaggioErrore(e), 'fail');
  } finally {
    btn.disabled = false;
  }
}

// ───────────────────────── pagina ─────────────────────────

function briciole() {
  const box = $('briciole');
  box.replaceChildren();
  const z = zonaDa(st.esame.zona);
  const pezzi = [[z ? z.nome : 'Zona', `#/progress/${st.esame.zona}`], [st.esame.title, hashPagina(null)]];
  if (st.pagina) antenati(st.pagina.id).forEach((p) => pezzi.push([p.title, hashPagina(p.id)]));
  pezzi.forEach(([testo, href], i) => {
    if (i) { const s = document.createElement('span'); s.className = 'briciole-sep'; s.textContent = '/'; box.appendChild(s); }
    const a = document.createElement('a');
    a.href = href;
    a.textContent = testo;
    box.appendChild(a);
  });
}

async function mostraPagina(id) {
  await salvaInSospeso();
  if (st.editor) { st.editor.distruggi(); st.editor = null; }
  st.pagina = null;
  const vuota = !id;
  $('paginaVuota').hidden = true;
  $('paginaAperta').hidden = vuota;
  statoSalvataggio('');
  if (vuota) {
    // nessuna pagina scelta: apro la prima, se c'è
    const prima = figli(null)[0];
    if (prima) { vai(prima.id); return; }
    $('paginaVuota').hidden = false;
    briciole();
    disegnaAlbero();
    return;
  }
  $('paginaAperta').classList.add('in-caricamento');
  try {
    const p = await db.leggiPagina(id);
    if (!p) { st.avvisa('Pagina non trovata', 'fail'); vai(null); return; }
    st.pagina = { id: p.id, title: p.title };
    antenati(p.id).forEach((a) => st.aperte.add(a.id));
    const titolo = $('titoloPagina');
    titolo.textContent = p.title === 'Senza titolo' ? '' : p.title;
    st.sporco = false;
    st.editor = creaEditor($('editorPagina'), { contenuto: p.content, onCambio: segnaModifica });
    statoSalvataggio(`Salvato · ${new Date(p.updated_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`, 'ok');
    if (st.titoloDaSelezionare) {
      st.titoloDaSelezionare = false;
      titolo.focus();
    }
  } catch (e) {
    st.avvisa(messaggioErrore(e), 'fail');
  } finally {
    $('paginaAperta').classList.remove('in-caricamento');
  }
  briciole();
  disegnaAlbero();
}

// ───────────────────────── collegamenti dell'interfaccia ─────────────────────────

function prepara() {
  st.preparato = true;
  $('btnNuovaPagina').addEventListener('click', () => nuovaPagina(null).catch((e) => st.avvisa(messaggioErrore(e), 'fail')));
  $('btnPrimaPagina').addEventListener('click', () => nuovaPagina(null).catch((e) => st.avvisa(messaggioErrore(e), 'fail')));
  $('btnStrutturaBase').addEventListener('click', creaStrutturaBase);

  $('alberoPagine').addEventListener('click', (e) => {
    const riga = e.target.closest('.albero-voce');
    if (!riga) return;
    const id = riga.dataset.id;
    if (e.target.closest('.albero-espandi')) {
      e.preventDefault();
      if (st.aperte.has(id)) st.aperte.delete(id); else st.aperte.add(id);
      disegnaAlbero();
      return;
    }
    const az = e.target.closest('.albero-azione');
    if (az) {
      e.preventDefault();
      if (az.dataset.azione === 'sotto') nuovaPagina(id).catch((err) => st.avvisa(messaggioErrore(err), 'fail'));
      if (az.dataset.azione === 'menu') apriMenuPagina(id, az);
    }
  });

  const titolo = $('titoloPagina');
  titolo.addEventListener('input', () => {
    if (titolo.innerHTML === '<br>') titolo.innerHTML = '';
    const voce = document.querySelector(`.albero-voce[data-id="${st.pagina && st.pagina.id}"] .albero-titolo`);
    if (voce) voce.textContent = titoloCorrente();
    segnaModifica();
  });
  titolo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || (e.key === 'ArrowDown')) { e.preventDefault(); if (st.editor) st.editor.focusInizio(); }
  });
  titolo.addEventListener('paste', (e) => {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s+/g, ' ');
    document.execCommand('insertText', false, t);
  });

  // nome dell'esame modificabile
  const nome = $('nomeEsame');
  nome.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nome.blur(); } if (e.key === 'Escape') { nome.textContent = st.esame.title; nome.blur(); } });
  nome.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s+/g, ' ')); });
  nome.addEventListener('blur', async () => {
    const t = (nome.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!t) { nome.textContent = st.esame.title; return; }
    if (t === st.esame.title) return;
    try {
      await db.rinominaEsame(st.esame.id, t);
      st.esame.title = t;
      briciole();
      st.avvisa('Nome dell\'esame aggiornato');
    } catch (e) {
      nome.textContent = st.esame.title;
      st.avvisa(messaggioErrore(e), 'fail');
    }
  });

  // Ctrl+S salva subito
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && st.pagina) { e.preventDefault(); st.sporco = true; salva(); }
  });
}

// ───────────────────────── ingresso ─────────────────────────

export async function apriEsame({ examId, pageId, toast }) {
  st.avvisa = toast;
  if (!st.preparato) prepara();
  if (!st.esame || st.esame.id !== examId) {
    await salvaInSospeso();
    if (st.editor) { st.editor.distruggi(); st.editor = null; }
    st.pagina = null;
    st.aperte = new Set();
    $('alberoPagine').replaceChildren();
    $('paginaAperta').hidden = true;
    $('paginaVuota').hidden = true;
    const [e, pagine] = await Promise.all([db.esame(examId), db.elencoPagine(examId)]);
    if (!e) { toast('Esame non trovato', 'fail'); location.hash = '#/progress'; return; }
    st.esame = e;
    st.pagine = pagine;
    $('nomeEsame').textContent = e.title;
    const z = zonaDa(e.zona);
    $('lnkZona').href = `#/progress/${e.zona}`;
    $('lnkZonaNome').textContent = z ? z.nome : 'Zona';
    disegnaAlbero();
  }
  if (!st.pagina || st.pagina.id !== pageId) await mostraPagina(pageId || null);
}
