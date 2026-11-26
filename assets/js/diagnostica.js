// MRInsight — pagina di diagnostica (fase 1).
// Verifica browser, sito e raggiungibilità di Supabase senza autenticarsi e senza salvare nulla
// oltre la scheda corrente (sessionStorage).

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, APP } from './config.js';
import { inserisciLogo, popSections, ICONE, copiaTesto } from './ui.js';
import { infoWebGL, provaDisegno } from './prova3d.js';

const CHIAVE_SESSIONE = 'mrinsight.diagnostica';
const TIMEOUT_MS = 8000;
const $ = (id) => document.getElementById(id);

const risultati = { browser: [], sito: [], grafica: [], supabase: [] };

// ───────────────────────── righe di verifica ─────────────────────────

function nuovaRiga(lista, nome) {
  const li = document.createElement('li');
  li.className = 'check run';
  li.innerHTML = '<span class="ico"></span><span class="nome"></span><span class="tempo"></span><span class="dett"></span>';
  li.querySelector('.nome').textContent = nome;
  $(lista).appendChild(li);
  return li;
}

function chiudiRiga(li, gruppo, nome, esito, dettaglio = '', ms = null) {
  li.className = `check ${esito}`;
  li.querySelector('.ico').innerHTML = ICONE[esito] || '';
  li.querySelector('.dett').textContent = dettaglio;
  li.querySelector('.tempo').textContent = ms == null ? '' : `${Math.round(ms)} ms`;
  risultati[gruppo].push({ nome, esito, dettaglio, ms });
}

async function verifica(gruppo, lista, nome, fn) {
  const li = nuovaRiga(lista, nome);
  const t0 = performance.now();
  try {
    const r = await fn();
    chiudiRiga(li, gruppo, nome, r.esito, r.dettaglio, r.tempo === false ? null : performance.now() - t0);
  } catch (e) {
    chiudiRiga(li, gruppo, nome, 'fail', String(e && e.message ? e.message : e), performance.now() - t0);
  }
}

function aggiornaBadge(gruppo, badgeId) {
  const r = risultati[gruppo];
  const b = $(badgeId);
  if (!r.length) { b.className = 'badge'; b.textContent = '—'; return; }
  const fail = r.filter((x) => x.esito === 'fail').length;
  const warn = r.filter((x) => x.esito === 'warn').length;
  const ok = r.filter((x) => x.esito === 'ok').length;
  b.className = `badge ${fail ? 'fail' : warn ? 'warn' : 'ok'}`;
  b.textContent = fail ? `${fail} errori` : warn ? `${ok} ok · ${warn} avvisi` : `${ok} ok`;
}

function aggiornaPill() {
  const tutti = [...risultati.browser, ...risultati.sito, ...risultati.grafica, ...risultati.supabase];
  const pill = $('pillStato');
  const fail = tutti.some((x) => x.esito === 'fail');
  const sbOk = risultati.supabase.length && !risultati.supabase.some((x) => x.esito === 'fail');
  pill.className = `live-pill ${fail ? 'fail' : sbOk ? 'ok' : ''}`;
  $('pillTesto').textContent = fail ? 'problemi rilevati' : sbOk ? 'tutto raggiungibile' : 'Supabase da verificare';
}

// ───────────────────────── 01 · browser ─────────────────────────

function infoBrowser() {
  const ua = navigator.userAgent;
  const m = ua.match(/Edg\/([\d.]+)/) ? ['Edge', ua.match(/Edg\/([\d.]+)/)[1]]
    : ua.match(/Firefox\/([\d.]+)/) ? ['Firefox', ua.match(/Firefox\/([\d.]+)/)[1]]
    : ua.match(/Chrome\/([\d.]+)/) ? ['Chrome', ua.match(/Chrome\/([\d.]+)/)[1]]
    : ua.match(/Version\/([\d.]+).*Safari/) ? ['Safari', ua.match(/Version\/([\d.]+)/)[1]]
    : ['Sconosciuto', ''];
  return { nome: m[0], versione: m[1], major: parseInt(m[1], 10) || 0 };
}

const MINIMI = { Edge: 111, Chrome: 111, Firefox: 121, Safari: 16 }; // :has(), moduli, CSSOM moderni

async function verificheBrowser() {
  const L = 'listaBrowser', G = 'browser';

  await verifica(G, L, 'Browser e versione', () => {
    const b = infoBrowser();
    const min = MINIMI[b.nome];
    if (!min) return { esito: 'warn', dettaglio: `${b.nome} ${b.versione} — non testato`, tempo: false };
    return b.major >= min
      ? { esito: 'ok', dettaglio: `${b.nome} ${b.versione}`, tempo: false }
      : { esito: 'warn', dettaglio: `${b.nome} ${b.versione} — consigliata ≥ ${min}`, tempo: false };
  });

  await verifica(G, L, 'Contesto sicuro (HTTPS)', () => (window.isSecureContext
    ? { esito: 'ok', dettaglio: location.protocol === 'https:' ? 'HTTPS' : `${location.hostname} (considerato sicuro solo in locale)`, tempo: false }
    : { esito: 'fail', dettaglio: 'Serve HTTPS: appunti e crittografia non sono disponibili', tempo: false }));

  await verifica(G, L, 'sessionStorage (sessione non persistente)', () => {
    const k = '__mri_test__';
    sessionStorage.setItem(k, '1');
    const ok = sessionStorage.getItem(k) === '1';
    sessionStorage.removeItem(k);
    return ok ? { esito: 'ok', dettaglio: 'scrittura e lettura riuscite', tempo: false }
      : { esito: 'fail', dettaglio: 'lettura non coerente', tempo: false };
  });

  await verifica(G, L, 'Crittografia (crypto.subtle, randomUUID)', () => {
    const ok = !!(window.crypto && crypto.subtle && typeof crypto.randomUUID === 'function');
    return ok ? { esito: 'ok', dettaglio: 'disponibile', tempo: false }
      : { esito: 'fail', dettaglio: 'necessaria per sessione e ID', tempo: false };
  });

  await verifica(G, L, 'Appunti (copia nel PACS)', () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return { esito: 'ok', dettaglio: 'Clipboard API presente — prova reale con «Copia rapporto»', tempo: false };
    }
    return { esito: 'warn', dettaglio: 'Clipboard API assente: si userà il metodo di ripiego', tempo: false };
  });

  await verifica(G, L, 'Immagini WebP (ricodifica senza metadati)', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    const ok = c.toDataURL('image/webp').startsWith('data:image/webp');
    return ok ? { esito: 'ok', dettaglio: 'il browser sa produrre WebP', tempo: false }
      : { esito: 'warn', dettaglio: 'WebP non disponibile: si userà JPEG', tempo: false };
  });

  await verifica(G, L, 'CSS moderno (:has, @property)', () => {
    const has = CSS.supports('selector(:has(*))');
    const prop = typeof CSS.registerProperty === 'function';
    return has && prop ? { esito: 'ok', dettaglio: 'supportato', tempo: false }
      : { esito: 'warn', dettaglio: `:has ${has ? 'sì' : 'no'} · @property ${prop ? 'sì' : 'no'} — resa grafica ridotta`, tempo: false };
  });

  await verifica(G, L, 'Orologio del PC', () => {
    const d = new Date();
    return { esito: 'ok', dettaglio: `${d.toLocaleString('it-IT')} (${Intl.DateTimeFormat().resolvedOptions().timeZone}) — verifica che coincida con l'ora reale`, tempo: false };
  });

  aggiornaBadge(G, 'badgeBrowser');
}

// ───────────────────────── 02 · sito ─────────────────────────

async function verificheSito() {
  const L = 'listaSito', G = 'sito';

  await verifica(G, L, 'Pagina caricata', () => {
    const gh = /\.github\.io$/.test(location.hostname);
    const locale = ['localhost', '127.0.0.1'].includes(location.hostname);
    return { esito: gh || locale ? 'ok' : 'warn', dettaglio: `${location.origin}${gh ? ' (GitHub Pages)' : locale ? ' (server locale)' : ''}`, tempo: false };
  });

  await verifica(G, L, 'Libreria Supabase (copia locale)', () => (window.supabase && typeof window.supabase.createClient === 'function'
    ? { esito: 'ok', dettaglio: 'vendor/supabase-js-2.119.2 caricata dal sito, nessun CDN', tempo: false }
    : { esito: 'fail', dettaglio: 'file vendor non caricato', tempo: false }));

  await verifica(G, L, 'Configurazione (config.js)', () => (SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? { esito: 'ok', dettaglio: `${APP.nome} ${APP.versione} — progetto configurato`, tempo: false }
    : { esito: 'warn', dettaglio: `${APP.nome} ${APP.versione} — progetto non ancora configurato: inserisci i valori nella scheda 04`, tempo: false }));

  await verifica(G, L, 'Font IBM Plex (Google Fonts)', async () => {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
    const ok = document.fonts.check('400 14px "IBM Plex Sans"') && [...document.fonts].some((f) => f.family.includes('IBM Plex') && f.status === 'loaded');
    return ok ? { esito: 'ok', dettaglio: 'caricati' }
      : { esito: 'warn', dettaglio: 'bloccati o lenti: si usa il font di sistema (non bloccante)' };
  });

  aggiornaBadge(G, 'badgeSito');
}

// ───────────────────────── 03 · grafica 3D ─────────────────────────

async function verificheGrafica() {
  const L = 'listaGrafica', G = 'grafica';
  let info = { disponibile: false };

  await verifica(G, L, 'WebGL', () => {
    info = infoWebGL();
    if (!info.disponibile) return { esito: 'fail', dettaglio: 'non disponibile: disattivato dal browser o dai criteri dell\'ospedale. Si userà la mappa 2D.', tempo: false };
    return { esito: 'ok', dettaglio: `${info.versione} · texture max ${info.maxTexture}px · indici 32 bit ${info.indici32 ? 'sì' : 'no'}`, tempo: false };
  });
  if (!info.disponibile) { aggiornaBadge(G, 'badgeGrafica'); return; }

  await verifica(G, L, 'Scheda grafica', () => (info.software
    ? { esito: 'warn', dettaglio: `${info.renderer} — disegno in software (senza accelerazione): il 3D sarà lento, meglio la mappa 2D`, tempo: false }
    : { esito: 'ok', dettaglio: `${info.renderer} (accelerazione hardware)`, tempo: false }));

  await verifica(G, L, 'Prova di disegno (3 s)', async () => {
    const r = await provaDisegno($('canvasProva'));
    const det = `${Math.round(r.fps)} fotogrammi/s con ${r.triangoli.toLocaleString('it-IT')} triangoli · picco ${Math.round(r.p95ms)} ms`;
    if (r.fps >= 45) return { esito: 'ok', dettaglio: `${det} — fluido`, tempo: false };
    if (r.fps >= 20) return { esito: 'warn', dettaglio: `${det} — usabile, userò un modello più leggero`, tempo: false };
    return { esito: 'fail', dettaglio: `${det} — troppo lento: si userà la mappa 2D`, tempo: false };
  });

  aggiornaBadge(G, 'badgeGrafica');
}

// ───────────────────────── 04 · supabase ─────────────────────────

function controllaUrl(url) {
  let u;
  try { u = new URL(url); } catch (_) { return { errore: 'URL non valido' }; }
  if (u.protocol !== 'https:') return { errore: 'L\'URL deve iniziare con https://' };
  if (!/^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname)) {
    return { errore: 'Atteso un indirizzo del tipo https://<ref di 20 caratteri>.supabase.co' };
  }
  return { url: u.origin, ref: u.hostname.split('.')[0] };
}

function controllaChiave(k) {
  if (!k) return { errore: 'Chiave mancante' };
  if (k.startsWith('sb_secret_')) return { errore: 'Questa è una chiave SECRET: non va mai usata nel browser. Revocala dalla dashboard se l\'hai esposta.', grave: true };
  if (k.startsWith('sb_publishable_')) return { tipo: 'publishable' };
  if (k.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role === 'service_role') return { errore: 'Questa è la chiave legacy service_role: non va mai usata nel browser.', grave: true };
      if (payload.role === 'anon') return { tipo: 'anon-legacy' };
    } catch (_) { /* sotto */ }
  }
  return { errore: 'Formato di chiave non riconosciuto (attesa sb_publishable_…)' };
}

const mascheraChiave = (k) => (k.length > 22 ? `${k.slice(0, 20)}…` : '…');

async function chiama(url, chiave) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { apikey: chiave }, signal: ctrl.signal, cache: 'no-store', credentials: 'omit' });
    let corpo = null;
    try { corpo = await r.json(); } catch (_) { corpo = null; }
    return { stato: r.status, ok: r.ok, corpo };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`nessuna risposta entro ${TIMEOUT_MS / 1000} s`);
    throw new Error('non raggiungibile: rete bloccata (proxy/firewall) o CORS');
  } finally {
    clearTimeout(t);
  }
}

async function verificheSupabase() {
  const L = 'listaSupabase', G = 'supabase';
  risultati.supabase = [];
  $(L).replaceChildren();

  const cu = controllaUrl($('inUrl').value.trim());
  const ck = controllaChiave($('inKey').value.trim());

  if (cu.errore || ck.errore) {
    const li = nuovaRiga(L, 'Valori inseriti');
    chiudiRiga(li, G, 'Valori inseriti', 'fail', [cu.errore, ck.errore].filter(Boolean).join(' · '));
    if (ck.grave) $('inKey').value = '';
    aggiornaBadge(G, 'badgeSupabase'); aggiornaPill(); scriviRapporto();
    return;
  }

  const chiave = $('inKey').value.trim();
  sessionStorage.setItem(CHIAVE_SESSIONE, JSON.stringify({ url: cu.url, key: chiave }));

  await verifica(G, L, 'Tipo di chiave', () => (ck.tipo === 'publishable'
    ? { esito: 'ok', dettaglio: `publishable (${mascheraChiave(chiave)})`, tempo: false }
    : { esito: 'warn', dettaglio: 'chiave anon legacy: funziona, ma Supabase la dismette nel 2027 — usa la publishable', tempo: false }));

  let raggiungibile = false;

  await verifica(G, L, 'Auth · stato del servizio', async () => {
    const r = await chiama(`${cu.url}/auth/v1/health`, chiave);
    raggiungibile = true;
    if (r.ok) return { esito: 'ok', dettaglio: `HTTP ${r.stato}${r.corpo && r.corpo.version ? ` · GoTrue ${r.corpo.version}` : ''}` };
    if (r.stato === 401) return { esito: 'fail', dettaglio: 'HTTP 401: chiave non valida per questo progetto' };
    if (r.stato === 503 || r.stato === 540) return { esito: 'fail', dettaglio: `HTTP ${r.stato}: progetto in pausa? Riattivalo dalla dashboard` };
    return { esito: 'fail', dettaglio: `HTTP ${r.stato}` };
  });

  await verifica(G, L, 'Auth · impostazioni di sicurezza', async () => {
    const r = await chiama(`${cu.url}/auth/v1/settings`, chiave);
    if (!r.ok || !r.corpo) return { esito: 'fail', dettaglio: `HTTP ${r.stato}` };
    const s = r.corpo;
    const note = [];
    note.push(s.disable_signup ? 'registrazione pubblica disattivata' : 'REGISTRAZIONE PUBBLICA ATTIVA');
    const esterni = Object.entries(s.external || {}).filter(([k, v]) => v && k !== 'email').map(([k]) => k);
    note.push(s.external && s.external.email ? 'login email attivo' : 'login email disattivato');
    if (esterni.length) note.push(`altri provider attivi: ${esterni.join(', ')}`);
    const esito = s.disable_signup && !esterni.length ? 'ok' : 'warn';
    return { esito, dettaglio: note.join(' · ') + (s.disable_signup ? '' : ' — disattivala dopo aver creato il tuo utente') };
  });

  await verifica(G, L, 'Database · API REST', async () => {
    const r = await chiama(`${cu.url}/rest/v1/`, chiave);
    // qualsiasi risposta HTTP leggibile vuol dire: dominio raggiungibile e CORS consentito
    return r.stato < 500
      ? { esito: 'ok', dettaglio: `raggiungibile (HTTP ${r.stato})` }
      : { esito: 'fail', dettaglio: `HTTP ${r.stato}` };
  });

  await verifica(G, L, 'Storage · API immagini', async () => {
    const r = await chiama(`${cu.url}/storage/v1/bucket`, chiave);
    return r.stato < 500
      ? { esito: 'ok', dettaglio: `raggiungibile (HTTP ${r.stato})` }
      : { esito: 'fail', dettaglio: `HTTP ${r.stato}` };
  });

  await verifica(G, L, 'Client supabase-js (sessione in sessionStorage)', async () => {
    const client = window.supabase.createClient(cu.url, chiave, {
      auth: {
        storage: window.sessionStorage,
        storageKey: 'mrinsight-diagnostica-auth',
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await client.auth.getSession();
    if (error) return { esito: 'fail', dettaglio: error.message };
    return { esito: 'ok', dettaglio: data.session ? 'sessione presente' : 'client pronto, nessuna sessione (corretto)' };
  });

  if (!raggiungibile) {
    const li = nuovaRiga(L, 'Suggerimento');
    chiudiRiga(li, G, 'Suggerimento', 'warn', `Controlla prima che l'URL sia corretto e il progetto attivo. Se dal PC di casa funziona e qui no, la rete di reparto blocca ${cu.ref}.supabase.co: chiedi ai Sistemi Informativi di consentire *.supabase.co (HTTPS 443).`);
  }

  aggiornaBadge(G, 'badgeSupabase');
  aggiornaPill();
  scriviRapporto();
}

// ───────────────────────── 05 · rapporto ─────────────────────────

function scriviRapporto() {
  const b = infoBrowser();
  const righe = [
    `${APP.nome} · diagnostica ${APP.versione}`,
    `Data: ${new Date().toLocaleString('it-IT')}`,
    `Origine: ${location.origin}`,
    `Browser: ${b.nome} ${b.versione}`,
    '',
  ];
  const sezioni = [['BROWSER', 'browser'], ['SITO', 'sito'], ['GRAFICA 3D', 'grafica'], ['SUPABASE', 'supabase']];
  const simbolo = { ok: '[OK]  ', warn: '[!]   ', fail: '[ERR] ', skip: '[--]  ' };
  for (const [titolo, g] of sezioni) {
    righe.push(titolo);
    if (!risultati[g].length) righe.push('  non ancora verificato');
    for (const r of risultati[g]) {
      righe.push(`  ${simbolo[r.esito]}${r.nome}${r.ms != null ? ` (${Math.round(r.ms)} ms)` : ''}${r.dettaglio ? ` — ${r.dettaglio}` : ''}`);
    }
    righe.push('');
  }
  $('rapporto').textContent = righe.join('\n').trim();
}

// ───────────────────────── avvio ─────────────────────────

function precompila() {
  let salvati = null;
  try { salvati = JSON.parse(sessionStorage.getItem(CHIAVE_SESSIONE) || 'null'); } catch (_) { salvati = null; }
  $('inUrl').value = SUPABASE_URL || (salvati && salvati.url) || '';
  $('inKey').value = SUPABASE_PUBLISHABLE_KEY || (salvati && salvati.key) || '';
}

async function avvia() {
  popSections();
  inserisciLogo($('navLogo'));
  precompila();

  $('btnVerifica').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    try { await verificheSupabase(); } finally { btn.disabled = false; }
  });
  $('btnDimentica').addEventListener('click', () => {
    sessionStorage.removeItem(CHIAVE_SESSIONE);
    $('inUrl').value = SUPABASE_URL || '';
    $('inKey').value = SUPABASE_PUBLISHABLE_KEY || '';
  });
  $('btnCopia').addEventListener('click', async () => {
    const s = $('statoCopia');
    try {
      const metodo = await copiaTesto($('rapporto').textContent);
      s.style.color = '';
      s.textContent = `Copiato negli appunti (${metodo === 'clipboard-api' ? 'Clipboard API' : 'metodo di ripiego'}). Prova a incollarlo nel PACS/RIS.`;
    } catch (_) {
      s.style.color = 'var(--fail)';
      s.textContent = 'Copia non riuscita: gli appunti sono bloccati su questo PC.';
    }
  });

  await verificheBrowser();
  await verificheSito();
  await verificheGrafica();
  aggiornaPill();
  scriviRapporto();
  if ($('inUrl').value && $('inKey').value) await verificheSupabase();
}

avvia();
