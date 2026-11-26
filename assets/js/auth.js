// Accesso: password + TOTP (Supabase MFA), con livelli di garanzia aal1/aal2.

import { sb } from './sb.js';

export async function sessioneCorrente() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function livello() {
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return data; // { currentLevel, nextLevel, currentAuthenticationMethods }
}

export async function accedi(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

/** Fattori TOTP dell'utente, separati per stato. */
export async function fattori() {
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) throw error;
  const tutti = (data.all || []).filter((f) => f.factor_type === 'totp');
  return {
    verificati: tutti.filter((f) => f.status === 'verified'),
    nonVerificati: tutti.filter((f) => f.status !== 'verified'),
  };
}

/** Verifica un codice a 6 cifre su un fattore già attivo → sessione aal2. */
export async function verificaCodice(factorId, code) {
  const { data, error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw error;
  return data;
}

function qrComeImmagine(qr) {
  // GoTrue restituisce l'SVG (a volte già con il prefisso data:): lo ricodifichiamo
  // in modo sicuro per usarlo come <img src>.
  const svg = qr.startsWith('data:') ? decodeURIComponent(qr.slice(qr.indexOf(',') + 1)) : qr;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Avvia la registrazione di un nuovo fattore TOTP. */
export async function iniziaRegistrazione(nome) {
  // le registrazioni lasciate a metà occupano il nome: si eliminano
  const { nonVerificati } = await fattori();
  for (const f of nonVerificati) {
    await sb.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: nome, issuer: 'MRInsight' });
  if (error) throw error;
  return { factorId: data.id, qr: qrComeImmagine(data.totp.qr_code), segreto: data.totp.secret, uri: data.totp.uri };
}

/** Conferma la registrazione con il primo codice generato dall'app. */
export async function confermaRegistrazione(factorId, code) {
  const ch = await sb.auth.mfa.challenge({ factorId });
  if (ch.error) throw ch.error;
  const { data, error } = await sb.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
  if (error) throw error;
  return data;
}

export async function annullaRegistrazione(factorId) {
  try { await sb.auth.mfa.unenroll({ factorId }); } catch (_) { /* irrilevante */ }
}

/** Rimuove un fattore (serve aal2). La UI impedisce di togliere l'ultimo. */
export async function rimuoviFattore(factorId) {
  const { error } = await sb.auth.mfa.unenroll({ factorId });
  if (error) throw error;
  await sb.auth.refreshSession();
}

/** Esce: 'local' revoca questa sessione, 'global' tutte le sessioni dell'utente. */
export async function esci(scope = 'local') {
  try {
    await sb.auth.signOut({ scope });
  } finally {
    // qualunque cosa succeda in rete, nel browser non resta nulla
    sessionStorage.clear();
  }
}

/**
 * Prova che la RLS blocchi chi ha solo la password (aal1):
 * un inserimento deve essere rifiutato. Va chiamata PRIMA del codice TOTP.
 */
export async function provaRlsSenzaSecondoFattore() {
  const { data, error } = await sb.from('exams')
    .insert({ slug: 'verifica-rls', title: 'verifica RLS' })
    .select('id');
  if (error) {
    if (error.code === '42501') return { esito: 'ok', dettaglio: 'con la sola password il database rifiuta le scritture' };
    if (error.code === 'PGRST205' || error.code === '42P01') return { esito: 'warn', dettaglio: 'tabelle assenti: esegui la migrazione SQL 0001' };
    return { esito: 'warn', dettaglio: `risposta inattesa: ${error.code || ''} ${error.message}` };
  }
  // non dovrebbe mai succedere: si ripulisce e si segnala
  if (data && data[0]) await sb.from('exams').delete().eq('id', data[0].id);
  return { esito: 'fail', dettaglio: 'ATTENZIONE: scrittura riuscita senza secondo fattore — la policy restrittiva manca' };
}
