// MRInsight — applicazione: accesso con TOTP, RLS, sessione non persistente, area MRI progress.

import { sb, configurato, messaggioErrore } from './sb.js';
import * as auth from './auth.js';
import * as inattivita from './inattivita.js';
import { inserisciLogo, ICONE, copiaTesto } from './ui.js';
import { apriProgress } from './progress.js';

const $ = (id) => document.getElementById(id);
const ROTTE_PRIVATE = ['progress', 'reports', 'sicurezza'];
const ROTTA_INIZIALE = 'progress';

const stato = {
  dentro: false,          // sessione aal2 attiva
  provaRls: null,         // esito del test RLS a livello aal1 (solo in memoria)
  registrazione: null,    // { factorId } durante una registrazione in corso
};

// ───────────────────────── utilità di interfaccia ─────────────────────────

function mostraVista(nome) {
  document.querySelectorAll('.vista').forEach((v) => { v.hidden = v.dataset.vista !== nome; });
  const privata = ROTTE_PRIVATE.includes(nome);
  $('navDock').hidden = !privata;
  $('pillSessione').hidden = !privata;
  $('btnEsci').hidden = !(privata || nome === 'mfa' || nome === 'registra');
  if (privata) aggiornaDock(nome);
  const fuoco = document.querySelector(`.vista[data-vista="${nome}"] input:not([type=hidden])`);
  if (fuoco) setTimeout(() => fuoco.focus(), 60);
}

function aggiornaDock(rotta) {
  const voci = [...document.querySelectorAll('.dock-item')];
  voci.forEach((a) => a.classList.toggle('active', a.dataset.rotta === rotta));
  const attiva = voci.find((a) => a.dataset.rotta === rotta);
  const hl = $('dockHighlight');
  if (!attiva) return;
  requestAnimationFrame(() => {
    hl.style.width = `${attiva.offsetWidth}px`;
    hl.style.transform = `translateX(${attiva.offsetLeft}px)`;
    hl.classList.add('ready');
  });
}

function messaggio(id, testo, tipo = '') {
  const el = $(id);
  el.className = `avviso ${tipo}`.trim();
  el.textContent = testo;
  el.hidden = !testo;
}

let timerToast = null;
function toast(testo, tipo = '') {
  const t = $('toast');
  t.textContent = testo;
  t.className = `toast visibile ${tipo}`.trim();
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function scuoti(input) {
  input.classList.remove('errore');
  void input.offsetWidth;
  input.classList.add('errore');
  input.select();
}

const soloCifre = (v) => v.replace(/\D/g, '').slice(0, 6);

function occupato(btn, si) {
  btn.disabled = si;
  btn.dataset.testo ??= btn.textContent;
  btn.textContent = si ? 'Attendere…' : btn.dataset.testo;
}

// ───────────────────────── flusso di accesso ─────────────────────────

/** Decide dove andare in base a sessione e livello di garanzia. */
async function instrada() {
  if (!configurato) return mostraVista('config');

  if (inattivita.giaScaduta()) {
    await esci('local', 'Sessione chiusa per inattività.');
    return;
  }

  const sessione = await auth.sessioneCorrente();
  if (!sessione) return vaiAlLogin();

  const aal = await auth.livello();
  if (aal.currentLevel === 'aal2') return entra();

  const { verificati } = await auth.fattori();
  if (verificati.length) return mostraMfa(verificati);
  return mostraPrimaRegistrazione();
}

function vaiAlLogin(msg = '', tipo = '') {
  stato.dentro = false;
  inattivita.ferma();
  $('bannerInattivita').hidden = true;
  if (location.hash) history.replaceState(null, '', location.pathname);
  $('formLogin').reset();
  messaggio('msgLogin', msg, tipo);
  mostraVista('login');
}

async function suLogin(ev) {
  ev.preventDefault();
  const email = $('inEmail').value.trim();
  const password = $('inPassword').value;
  if (!email || !password) return messaggio('msgLogin', 'Inserisci email e password.', 'fail');
  const btn = $('btnAccedi');
  occupato(btn, true);
  try {
    await auth.accedi(email, password);
    $('inPassword').value = '';
    inattivita.registraAttivita();
    // prova di sicurezza: con la sola password il database deve rifiutare le scritture
    stato.provaRls = await auth.provaRlsSenzaSecondoFattore().catch((e) => ({ esito: 'warn', dettaglio: messaggioErrore(e) }));
    await instrada();
  } catch (e) {
    messaggio('msgLogin', messaggioErrore(e), 'fail');
  } finally {
    occupato(btn, false);
  }
}

function mostraMfa(verificati) {
  const sel = $('selFattore');
  sel.replaceChildren(...verificati.map((f) => new Option(f.friendly_name || 'Authenticator', f.id)));
  $('campoFattore').hidden = verificati.length < 2;
  $('inCodice').value = '';
  messaggio('msgMfa', '');
  mostraVista('mfa');
}

async function suMfa(ev) {
  ev.preventDefault();
  const input = $('inCodice');
  const codice = soloCifre(input.value);
  if (codice.length !== 6) return scuoti(input);
  const btn = $('btnVerificaMfa');
  occupato(btn, true);
  try {
    await auth.verificaCodice($('selFattore').value, codice);
    await entra();
  } catch (e) {
    messaggio('msgMfa', messaggioErrore(e), 'fail');
    scuoti(input);
  } finally {
    occupato(btn, false);
  }
}

// ───────────────────────── registrazione TOTP ─────────────────────────

/** Monta il modulo QR + codice in un contenitore e risolve quando il fattore è attivo. */
function montaRegistrazione(contenitore, dati, idMessaggio) {
  const nodo = $('tplRegistrazione').content.cloneNode(true);
  nodo.querySelector('[data-qr]').src = dati.qr;
  nodo.querySelector('[data-segreto]').textContent = dati.segreto.replace(/(.{4})/g, '$1 ').trim();
  contenitore.replaceChildren(nodo);

  const input = contenitore.querySelector('[data-codice]');
  const btn = contenitore.querySelector('[data-conferma]');
  contenitore.querySelector('[data-copia-segreto]').addEventListener('click', async () => {
    try { await copiaTesto(dati.segreto); toast('Chiave copiata'); } catch (_) { toast('Copia non riuscita', 'fail'); }
  });

  return new Promise((risolvi) => {
    const conferma = async () => {
      const codice = soloCifre(input.value);
      if (codice.length !== 6) return scuoti(input);
      occupato(btn, true);
      try {
        await auth.confermaRegistrazione(dati.factorId, codice);
        stato.registrazione = null;
        risolvi();
      } catch (e) {
        messaggio(idMessaggio, messaggioErrore(e), 'fail');
        scuoti(input);
      } finally {
        occupato(btn, false);
      }
    };
    btn.addEventListener('click', conferma);
    input.addEventListener('input', () => {
      input.value = soloCifre(input.value);
      if (input.value.length === 6) conferma();
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') conferma(); });
    setTimeout(() => input.focus(), 80);
  });
}

async function mostraPrimaRegistrazione() {
  messaggio('msgRegistra', '');
  mostraVista('registra');
  const cont = document.querySelector('[data-registrazione="primo"]');
  cont.replaceChildren();
  try {
    const dati = await auth.iniziaRegistrazione('Telefono');
    stato.registrazione = { factorId: dati.factorId };
    await montaRegistrazione(cont, dati, 'msgRegistra');
    toast('Secondo fattore attivato');
    await entra();
  } catch (e) {
    messaggio('msgRegistra', messaggioErrore(e), 'fail');
  }
}

// ───────────────────────── area privata ─────────────────────────

async function entra() {
  stato.dentro = true;
  inattivita.avvia({
    avviso: (s) => { $('bannerInattivita').hidden = false; $('secondiInattivita').textContent = s; $('pillSessione').classList.add('scade'); },
    ripreso: () => { $('bannerInattivita').hidden = true; $('pillSessione').classList.remove('scade'); },
    scaduto: () => esci('local', 'Sessione chiusa dopo 1 ora di inattività.'),
  });
  if (!ROTTE_PRIVATE.includes(rottaCorrente())) location.hash = `#/${ROTTA_INIZIALE}`;
  else await suRotta();
}

const rottaCorrente = () => (location.hash.match(/^#\/([a-z-]+)/) || [])[1] || '';

async function suRotta() {
  if (!stato.dentro) return;
  const r = rottaCorrente();
  const rotta = ROTTE_PRIVATE.includes(r) ? r : ROTTA_INIZIALE;
  mostraVista(rotta);
  if (rotta === 'progress') {
    controllaFattori();
    await apriProgress({ toast });
  }
  if (rotta === 'sicurezza') await Promise.all([caricaStato(), caricaFattori()]);
}

async function controllaFattori() {
  try {
    const { verificati } = await auth.fattori();
    $('avvisoUnFattore').hidden = verificati.length >= 2;
  } catch (_) { /* non bloccante */ }
}

function rigaControllo(lista, nome, esito, dettaglio) {
  const li = document.createElement('li');
  li.className = `check ${esito}`;
  li.innerHTML = '<span class="ico"></span><span class="nome"></span><span class="tempo"></span><span class="dett"></span>';
  li.querySelector('.ico').innerHTML = ICONE[esito] || '';
  li.querySelector('.nome').textContent = nome;
  li.querySelector('.dett').textContent = dettaglio;
  lista.appendChild(li);
  return esito;
}

async function caricaStato() {
  const lista = $('listaStato');
  lista.replaceChildren();
  const esiti = [];
  const { data: { user } } = await sb.auth.getUser();

  const aal = await auth.livello();
  esiti.push(rigaControllo(lista, 'Secondo fattore', aal.currentLevel === 'aal2' ? 'ok' : 'fail',
    aal.currentLevel === 'aal2' ? 'sessione aal2 (password + TOTP)' : `livello ${aal.currentLevel}`));

  const { verificati } = await auth.fattori();
  esiti.push(rigaControllo(lista, 'Dispositivi registrati', verificati.length >= 2 ? 'ok' : 'warn',
    `${verificati.length} ${verificati.length === 1 ? 'dispositivo' : 'dispositivi'}${verificati.length < 2 ? ' — consigliati almeno 2' : ''}`));

  const db = await sb.from('exams').select('id', { count: 'exact', head: true });
  if (db.error) {
    const mancante = ['PGRST205', '42P01'].includes(db.error.code);
    esiti.push(rigaControllo(lista, 'Database', mancante ? 'warn' : 'fail',
      mancante ? 'tabelle assenti: esegui supabase/migrations/0001_schema_rls.sql nel SQL Editor' : messaggioErrore(db.error)));
  } else {
    esiti.push(rigaControllo(lista, 'Database', 'ok', `accesso consentito · ${db.count ?? 0} esami`));
  }

  const st = await sb.storage.from('media').list(user.id, { limit: 1 });
  esiti.push(rigaControllo(lista, 'Storage immagini', st.error ? 'warn' : 'ok',
    st.error ? `bucket «media»: ${messaggioErrore(st.error)}` : 'bucket privato «media» accessibile'));

  if (stato.provaRls) {
    esiti.push(rigaControllo(lista, 'RLS senza secondo fattore', stato.provaRls.esito, stato.provaRls.dettaglio));
  } else {
    esiti.push(rigaControllo(lista, 'RLS senza secondo fattore', 'skip', 'verificata solo al momento del login con password'));
  }

  const b = $('badgeStato');
  const fail = esiti.includes('fail');
  const warn = esiti.includes('warn');
  b.className = `badge ${fail ? 'fail' : warn ? 'warn' : 'ok'}`;
  b.textContent = fail ? 'da correggere' : warn ? 'con avvisi' : 'tutto a posto';
}

// ───────────────────────── sicurezza ─────────────────────────

const ICONA_TELEFONO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>';

async function caricaFattori() {
  messaggio('msgFattori', '');
  const { verificati } = await auth.fattori();
  const lista = $('listaFattori');
  lista.replaceChildren(...verificati.map((f) => {
    const li = document.createElement('li');
    li.className = 'fattore';
    li.innerHTML = `<span class="fattore-ico">${ICONA_TELEFONO}</span><span class="fattore-nome"></span><span class="fattore-info"></span><button class="btn-rimuovi" type="button">Rimuovi</button>`;
    li.querySelector('.fattore-nome').textContent = f.friendly_name || 'Authenticator';
    li.querySelector('.fattore-info').textContent = `registrato il ${new Date(f.created_at).toLocaleDateString('it-IT')}`;
    const btn = li.querySelector('.btn-rimuovi');
    if (verificati.length < 2) {
      btn.disabled = true;
      btn.title = 'Non puoi rimuovere l\'unico dispositivo: aggiungine prima un altro';
    }
    btn.addEventListener('click', () => rimuovi(f));
    return li;
  }));
  const b = $('badgeFattori');
  b.className = `badge ${verificati.length >= 2 ? 'ok' : 'warn'}`;
  b.textContent = `${verificati.length} attivi`;
}

async function rimuovi(f) {
  // eslint-disable-next-line no-alert
  if (!window.confirm(`Rimuovere «${f.friendly_name || 'Authenticator'}»? Non potrai più usarlo per accedere.`)) return;
  try {
    await auth.rimuoviFattore(f.id);
    toast('Dispositivo rimosso');
    await caricaFattori();
  } catch (e) {
    messaggio('msgFattori', messaggioErrore(e), 'fail');
  }
}

function apriNuovoFattore(si) {
  $('nuovoFattore').hidden = !si;
  $('rigaAggiungi').hidden = si;
  document.querySelector('[data-registrazione="aggiuntivo"]').replaceChildren();
  $('btnAvviaFattore').hidden = false;
  $('inNomeFattore').disabled = false;
  if (si) { $('inNomeFattore').value = ''; $('inNomeFattore').focus(); }
}

async function avviaNuovoFattore() {
  const nome = $('inNomeFattore').value.trim();
  if (!nome) return scuoti($('inNomeFattore'));
  messaggio('msgFattori', '');
  try {
    const dati = await auth.iniziaRegistrazione(nome);
    stato.registrazione = { factorId: dati.factorId };
    $('btnAvviaFattore').hidden = true;
    $('inNomeFattore').disabled = true;
    await montaRegistrazione(document.querySelector('[data-registrazione="aggiuntivo"]'), dati, 'msgFattori');
    toast(`«${nome}» attivato`);
    apriNuovoFattore(false);
    await caricaFattori();
  } catch (e) {
    messaggio('msgFattori', messaggioErrore(e), 'fail');
  }
}

async function annullaNuovoFattore() {
  if (stato.registrazione) await auth.annullaRegistrazione(stato.registrazione.factorId);
  stato.registrazione = null;
  apriNuovoFattore(false);
}

// ───────────────────────── uscita ─────────────────────────

async function esci(scope = 'local', motivo = '') {
  if (stato.registrazione) await auth.annullaRegistrazione(stato.registrazione.factorId);
  stato.registrazione = null;
  stato.provaRls = null;
  try {
    await auth.esci(scope);
  } catch (_) { /* la sessione locale è comunque cancellata */ }
  inattivita.azzera();
  vaiAlLogin(motivo || (scope === 'global' ? 'Sei uscito da tutti i dispositivi.' : 'Sei uscito.'));
}

// ───────────────────────── tempo residuo nella barra ─────────────────────────

setInterval(() => {
  if (!stato.dentro) return;
  const u = inattivita.ultimaAttivita() ?? Date.now();
  const resta = Math.max(0, inattivita.LIMITE_MS - (Date.now() - u));
  const m = Math.floor(resta / 60000);
  const s = Math.floor((resta % 60000) / 1000);
  $('pillTempo').textContent = `${m}:${String(s).padStart(2, '0')}`;
}, 1000);

// ───────────────────────── avvio ─────────────────────────

function collega() {
  $('formLogin').addEventListener('submit', suLogin);
  $('formMfa').addEventListener('submit', suMfa);
  $('inCodice').addEventListener('input', (e) => {
    e.target.value = soloCifre(e.target.value);
    if (e.target.value.length === 6) $('formMfa').requestSubmit();
  });
  $('btnEsci').addEventListener('click', () => esci('local'));
  $('btnResta').addEventListener('click', () => inattivita.prolunga());
  $('btnAggiungiFattore').addEventListener('click', () => apriNuovoFattore(true));
  $('btnAvviaFattore').addEventListener('click', avviaNuovoFattore);
  $('btnAnnullaFattore').addEventListener('click', annullaNuovoFattore);
  $('inNomeFattore').addEventListener('keydown', (e) => { if (e.key === 'Enter') avviaNuovoFattore(); });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-azione]');
    if (!a) return;
    if (a.dataset.azione === 'annulla-login' || a.dataset.azione === 'esci-locale') esci('local');
    if (a.dataset.azione === 'esci-ovunque') {
      // eslint-disable-next-line no-alert
      if (window.confirm('Chiudere tutte le sessioni aperte, su ogni dispositivo?')) esci('global');
    }
  });
  window.addEventListener('hashchange', suRotta);
  window.addEventListener('resize', () => { if (stato.dentro) aggiornaDock(rottaCorrente() || ROTTA_INIZIALE); });

  if (sb) {
    sb.auth.onAuthStateChange((evento) => {
      // es. token revocato da «Esci da tutti i dispositivi» su un altro PC
      if (evento === 'SIGNED_OUT' && stato.dentro) {
        inattivita.azzera();
        sessionStorage.clear();
        vaiAlLogin('Sessione terminata.');
      }
    });
  }
}

async function avvia() {
  document.querySelectorAll('[data-logo]').forEach((el) => inserisciLogo(el));
  inserisciLogo($('navLogo'), { disegna: false });
  collega();
  try {
    await instrada();
  } catch (e) {
    vaiAlLogin(messaggioErrore(e), 'fail');
  }
}

avvia();
