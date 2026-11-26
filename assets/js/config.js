// Configurazione pubblica di MRInsight.
//
// Qui vanno SOLO due valori pubblici, che finiscono comunque nel browser:
//   - l'URL del progetto Supabase (https://<ref>.supabase.co)
//   - la chiave PUBLISHABLE (sb_publishable_...)
//
// MAI la chiave secret (sb_secret_...) né la legacy service_role:
// scavalcano la RLS e darebbero accesso completo ai dati.
// La sicurezza dei contenuti dipende dalla RLS + secondo fattore (aal2), non da questi valori.

export const SUPABASE_URL = 'https://dtciqxgfewjgtbsgfmsh.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_AQsLs05zBJt1h9anRyaHDQ_p98taGfC';

export const APP = {
  nome: 'MRInsight',
  firma: 'by StructuRad',
  versione: '0.2.0-fase2',
};
