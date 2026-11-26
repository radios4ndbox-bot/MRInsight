// Client Supabase unico per tutta l'app.
// Sessione in sessionStorage: sparisce chiudendo la scheda (PC di reparto condivisi).

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const configurato = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const STORAGE_KEY = 'mrinsight-auth';

export const sb = configurato
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: window.sessionStorage,
      storageKey: STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  })
  : null;

/** Messaggi di errore in italiano per i casi più comuni. */
export function messaggioErrore(err) {
  if (!err) return '';
  const m = String(err.message || err).toLowerCase();
  const codice = err.code || '';
  if (codice === 'invalid_credentials' || m.includes('invalid login credentials')) return 'Email o password non corretti.';
  if (codice === 'mfa_verification_failed' || m.includes('invalid totp') || m.includes('invalid mfa')) return 'Codice non valido o scaduto. Controlla che l\'ora del telefono sia automatica.';
  if (codice === 'mfa_challenge_expired' || m.includes('challenge') && m.includes('expired')) return 'Richiesta scaduta: inserisci un nuovo codice.';
  if (err.status === 429 || codice === 'over_request_rate_limit' || m.includes('rate limit')) return 'Troppi tentativi: attendi qualche minuto.';
  if (codice === 'insufficient_aal' || m.includes('aal2')) return 'Serve il secondo fattore per questa operazione.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Supabase non raggiungibile: controlla la rete.';
  if (codice === 'mfa_factor_name_conflict' || m.includes('friendly name')) return 'Esiste già un fattore con questo nome.';
  return err.message || String(err);
}
