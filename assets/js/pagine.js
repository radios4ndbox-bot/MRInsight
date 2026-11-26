// MRInsight — accesso ai dati di esami e pagine di appunti.
// Tutto passa dalla RLS: senza sessione aal2 il database non restituisce nulla.

import { sb } from './sb.js';

export const CONTENUTO_VUOTO = () => ({ v: 1, blocks: [] });

function esito({ data, error }) {
  if (error) throw error;
  return data;
}

export async function esame(id) {
  return esito(await sb.from('exams').select('id, title, zona').eq('id', id).maybeSingle());
}

export async function rinominaEsame(id, title) {
  return esito(await sb.from('exams').update({ title }).eq('id', id).select('id, title').single());
}

/** Elenco piatto delle pagine di appunti di un esame (senza contenuto). */
export async function elencoPagine(examId) {
  return esito(await sb.from('pages')
    .select('id, parent_id, title, sort, updated_at')
    .eq('exam_id', examId)
    .eq('kind', 'appunti')
    .order('sort', { ascending: true })
    .order('created_at', { ascending: true }));
}

export async function leggiPagina(id) {
  return esito(await sb.from('pages').select('id, parent_id, title, content, updated_at').eq('id', id).maybeSingle());
}

export async function creaPagina({ examId, parentId = null, title = 'Senza titolo', sort = 0 }) {
  return esito(await sb.from('pages')
    .insert({ exam_id: examId, parent_id: parentId, title, sort, kind: 'appunti', content: CONTENUTO_VUOTO() })
    .select('id, parent_id, title, sort, updated_at')
    .single());
}

export async function salvaPagina(id, { title, content }) {
  const campi = {};
  if (title !== undefined) campi.title = title;
  if (content !== undefined) campi.content = content;
  return esito(await sb.from('pages').update(campi).eq('id', id).select('id, updated_at').single());
}

export async function eliminaPagina(id) {
  // le sottopagine se ne vanno con la pagina (on delete cascade)
  esito(await sb.from('pages').delete().eq('id', id));
}

/** Aggiorna l'ordine (e il padre) di più pagine. */
export async function riordina(righe) {
  await Promise.all(righe.map((r) => sb.from('pages').update({ sort: r.sort, parent_id: r.parent_id }).eq('id', r.id).then(esito)));
}
