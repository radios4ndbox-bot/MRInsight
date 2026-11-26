// MRInsight — area MRI progress: mappa del corpo, zone ed esami di ogni zona.

import { sb, messaggioErrore } from './sb.js';
import { ZONE, zonaDa } from './zone.js';
import { apriEsame, salvaInSospeso } from './esame.js';

export { salvaInSospeso };

const $ = (id) => document.getElementById(id);
const ICONA_CESTINO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>';

let corpo = null;          // istanza della mappa 3D (null se non disponibile)
let preparato = false;
let zonaAttiva = null;
let avvisa = () => {};
let caricamento = 0;       // evita che risposte vecchie sovrascrivano quelle nuove

const vai = (id) => {
  const h = id ? `#/progress/${id}` : '#/progress';
  if (location.hash !== h) location.hash = h;
};
/** #/progress/<zona>/<esame>/<pagina> */
function leggiHash() {
  const [, , zona, esame, pagina] = location.hash.split('/');
  const uuid = /^[0-9a-f-]{36}$/;
  return {
    zona: zonaDa(zona) ? zona : null,
    esame: uuid.test(esame || '') ? esame : null,
    pagina: uuid.test(pagina || '') ? pagina : null,
  };
}

function messaggio(testo, tipo = '') {
  const el = $('msgEsami');
  el.className = `avviso ${tipo}`.trim();
  el.textContent = testo;
  el.hidden = !testo;
}

function slug(titolo) {
  const s = titolo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return s || 'esame';
}

// ───────────────────────── mappa ─────────────────────────

async function montaMappa() {
  const stato = $('statoMappa');
  try {
    const { montaCorpo3D } = await import('./corpo3d.js');
    corpo = await montaCorpo3D($('mappaCorpo'), {
      onZona: (id) => vai(id),
      onPassaggio: (id) => evidenziaChip(id),
    });
    stato.hidden = true;
    if (zonaAttiva) corpo.seleziona(zonaAttiva);
  } catch (e) {
    corpo = null;
    $('mappaCorpo').classList.add('senza-3d');
    stato.textContent = `Mappa 3D non disponibile su questo PC (${e && e.message ? e.message : e}). Usa l'elenco delle zone.`;
  }
}

function disegnaChips() {
  const box = $('elencoZone');
  box.replaceChildren(...ZONE.map((z, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'zona-chip';
    b.dataset.zona = z.id;
    b.innerHTML = '<span class="zona-num"></span><span class="zona-nome"></span>';
    b.querySelector('.zona-num').textContent = String(i + 1).padStart(2, '0');
    b.querySelector('.zona-nome').textContent = z.nome;
    b.addEventListener('click', () => vai(z.id));
    b.addEventListener('pointerenter', () => corpo && corpo.evidenzia(z.id));
    b.addEventListener('pointerleave', () => corpo && corpo.evidenzia(null));
    return b;
  }));
}

function evidenziaChip(id) {
  document.querySelectorAll('.zona-chip').forEach((b) => b.classList.toggle('evidenziata', b.dataset.zona === id));
}

// ───────────────────────── zona ed esami ─────────────────────────

async function mostraZona(id) {
  zonaAttiva = id;
  if (corpo) corpo.seleziona(id);
  const z = zonaDa(id);
  $('titoloZona').textContent = z ? z.nome : 'Zone';
  $('numZona').textContent = z ? String(ZONE.indexOf(z) + 1).padStart(2, '0') : '—';
  $('elencoZone').hidden = !!z;
  $('dettaglioZona').hidden = !z;
  $('btnTutteZone').hidden = !z;
  messaggio('');
  if (!z) return;
  $('inTitoloEsame').placeholder = z.esempio;
  await caricaEsami(id);
}

async function caricaEsami(id) {
  const turno = ++caricamento;
  const lista = $('listaEsami');
  lista.classList.add('in-caricamento');
  const { data, error } = await sb.from('exams')
    .select('id, title, sort')
    .eq('zona', id)
    .order('sort', { ascending: true })
    .order('title', { ascending: true });
  if (turno !== caricamento) return;
  lista.classList.remove('in-caricamento');
  lista.replaceChildren();
  if (error) {
    const manca = error.code === '42703' || /zona/.test(error.message || '');
    messaggio(manca ? 'Database da aggiornare: esegui supabase/migrations/0002_zone_esami.sql nel SQL Editor di Supabase, poi ricarica.' : messaggioErrore(error), 'fail');
    $('esamiVuoti').hidden = true;
    return;
  }
  $('esamiVuoti').hidden = data.length > 0;
  data.forEach((esame, i) => lista.appendChild(rigaEsame(esame, i)));
}

function rigaEsame(esame, i) {
  const li = document.createElement('li');
  li.className = 'esame';
  li.style.animationDelay = `${i * 40}ms`;
  li.innerHTML = '<button type="button" class="esame-apri"><span class="esame-titolo"></span><span class="esame-info">apri gli appunti</span></button><button type="button" class="esame-elimina" title="Elimina esame"></button>';
  li.querySelector('.esame-titolo').textContent = esame.title;
  li.querySelector('.esame-elimina').innerHTML = ICONA_CESTINO;
  li.querySelector('.esame-elimina').setAttribute('aria-label', `Elimina ${esame.title}`);
  li.querySelector('.esame-apri').addEventListener('click', () => { location.hash = `#/progress/${zonaAttiva}/${esame.id}`; });
  li.querySelector('.esame-elimina').addEventListener('click', () => elimina(esame));
  return li;
}

async function crea(ev) {
  ev.preventDefault();
  const input = $('inTitoloEsame');
  const titolo = input.value.trim().replace(/\s+/g, ' ');
  if (!titolo) { messaggio('Scrivi il nome dell\'esame.', 'warn'); input.focus(); return; }
  if (!zonaAttiva) return;
  const btn = $('btnCreaEsame');
  btn.disabled = true;
  messaggio('');
  try {
    const sort = $('listaEsami').children.length;
    let riga = { title: titolo, slug: slug(titolo), zona: zonaAttiva, sort };
    let { error } = await sb.from('exams').insert(riga);
    if (error && error.code === '23505') {
      // slug già usato da un altro esame: aggiungo un suffisso casuale
      riga = { ...riga, slug: `${riga.slug.slice(0, 54)}-${crypto.randomUUID().slice(0, 5)}` };
      ({ error } = await sb.from('exams').insert(riga));
    }
    if (error) throw error;
    input.value = '';
    avvisa(`«${titolo}» aggiunto`);
    await caricaEsami(zonaAttiva);
  } catch (e) {
    messaggio(e.code === '42703' ? 'Database da aggiornare: esegui supabase/migrations/0002_zone_esami.sql nel SQL Editor.' : messaggioErrore(e), 'fail');
  } finally {
    btn.disabled = false;
  }
}

async function elimina(esame) {
  // eslint-disable-next-line no-alert
  if (!window.confirm(`Eliminare «${esame.title}»? Verranno cancellate anche le sue pagine di appunti.`)) return;
  const { error } = await sb.from('exams').delete().eq('id', esame.id);
  if (error) { messaggio(messaggioErrore(error), 'fail'); return; }
  avvisa(`«${esame.title}» eliminato`);
  await caricaEsami(zonaAttiva);
}

// ───────────────────────── ingresso ─────────────────────────

export async function apriProgress({ toast }) {
  avvisa = toast;
  if (!preparato) {
    preparato = true;
    disegnaChips();
    $('formEsame').addEventListener('submit', crea);
    $('btnTutteZone').addEventListener('click', () => vai(null));
    $('btnVistaIniziale').addEventListener('click', () => vai(null));
    montaMappa();
  }
  const h = leggiHash();
  if (h.esame) {
    $('progressMappa').hidden = true;
    $('progressEsame').hidden = false;
    try {
      await apriEsame({ examId: h.esame, pageId: h.pagina, toast });
    } catch (e) {
      const manca = e && (e.code === '42703' || /parent_id/.test(e.message || ''));
      toast(manca ? 'Database da aggiornare: esegui supabase/migrations/0003_pagine_appunti.sql nel SQL Editor.' : messaggioErrore(e), 'fail');
    }
    return;
  }
  await salvaInSospeso();
  $('progressEsame').hidden = true;
  $('progressMappa').hidden = false;
  await mostraZona(h.zona);
}
