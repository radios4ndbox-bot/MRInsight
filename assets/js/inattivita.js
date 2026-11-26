// Logout per inattività, gestito nel browser.
// (Il timeout lato server di Supabase è disponibile solo dal piano Pro.)
//
// L'ultima attività è salvata in sessionStorage, così anche ricaricando la
// pagina dopo 1 ora di assenza si esce comunque; ricaricare prima non fa uscire.

const CHIAVE = 'mrinsight.ultimaAttivita';
// anche il solo movimento del mouse conta (es. lettura degli appunti): le scritture restano limitate a una ogni 5 s
const EVENTI = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];

export const LIMITE_MS = 60 * 60 * 1000;
export const PREAVVISO_MS = 2 * 60 * 1000;

let timer = null;
let attivo = false;
let ultimoSalvataggio = 0;
let callback = { avviso() {}, scaduto() {}, ripreso() {} };

const ora = () => Date.now();

export function ultimaAttivita() {
  const v = Number(sessionStorage.getItem(CHIAVE));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** true se la sessione salvata è più vecchia del limite (es. scheda riaperta dopo ore). */
export function giaScaduta() {
  const u = ultimaAttivita();
  return u != null && ora() - u > LIMITE_MS;
}

export function registraAttivita() {
  const t = ora();
  // non scrivere a ogni movimento: basta una volta ogni 5 s
  if (t - ultimoSalvataggio < 5000) return;
  ultimoSalvataggio = t;
  sessionStorage.setItem(CHIAVE, String(t));
}

function controlla() {
  const u = ultimaAttivita() ?? ora();
  const resta = LIMITE_MS - (ora() - u);
  if (resta <= 0) {
    ferma();
    callback.scaduto();
  } else if (resta <= PREAVVISO_MS) {
    callback.avviso(Math.ceil(resta / 1000));
  } else {
    callback.ripreso();
  }
}

const suEvento = () => registraAttivita();
const suVisibilita = () => { if (document.visibilityState === 'visible') controlla(); };

export function avvia(cb) {
  callback = { ...callback, ...cb };
  if (attivo) return;
  attivo = true;
  ultimoSalvataggio = 0;
  registraAttivita();
  EVENTI.forEach((e) => window.addEventListener(e, suEvento, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', suVisibilita);
  timer = setInterval(controlla, 1000);
}

/** «Resta collegato» dal preavviso. */
export function prolunga() {
  ultimoSalvataggio = 0;
  registraAttivita();
  callback.ripreso();
}

export function ferma() {
  attivo = false;
  clearInterval(timer);
  timer = null;
  EVENTI.forEach((e) => window.removeEventListener(e, suEvento, { capture: true }));
  document.removeEventListener('visibilitychange', suVisibilita);
}

export function azzera() {
  sessionStorage.removeItem(CHIAVE);
}
