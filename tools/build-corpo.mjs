// Costruisce assets/models/corpo.bin da BodyParts3D 4.0 (part-of, OBJ 99%).
// Strumento di sviluppo: NON fa parte del sito e non serve per usarlo.
// Requisiti: Node ≥ 20 e `npm install meshoptimizer` in una cartella di lavoro fuori dal repository.
// Dati: partof_BP3D_4.0_obj_99.zip e partof_element_parts.txt da
//   https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
// Uso: node build-corpo.mjs <cartella OBJ> <partof_element_parts.txt> assets/models/corpo.bin
import fs from 'node:fs';
import path from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';

const [dirObj, fileElementi, uscita] = process.argv.slice(2);

// concetto FMA (nome inglese) → elenco file FJ
const perNome = new Map();
for (const riga of fs.readFileSync(fileElementi, 'utf8').split(/\r?\n/).slice(1)) {
  const [, nome, fj] = riga.split('\t');
  if (!fj) continue;
  if (!perNome.has(nome)) perNome.set(nome, []);
  perNome.get(nome).push(fj);
}
const el = (...nomi) => nomi.flatMap((n) => {
  if (!perNome.has(n)) throw new Error(`concetto assente: ${n}`);
  return perNome.get(n);
});

// zone: id, nome, concetti, budget di triangoli
const ZONE = [
  ['neuro', 'Neuro', el('brain'), 7000],
  ['rachide', 'Rachide', el('vertebral column'), 7000],
  ['spalla', 'Spalla', el('left scapula', 'right scapula', 'left clavicle', 'right clavicle', 'left humerus', 'right humerus'), 4000],
  ['gomito-polso', 'Gomito, polso e mano', el('left radius', 'right radius', 'left ulna', 'right ulna', 'left hand', 'right hand'), 6000],
  ['cuore', 'Cuore', el('heart'), 4000],
  ['fegato', 'Fegato e vie biliari', el('liver', 'gallbladder'), 4000],
  ['pancreas', 'Pancreas', el('pancreas'), 1500],
  ['reni', 'Reni', el('left kidney', 'right kidney'), 2000],
  ['pelvi', 'Pelvi', el('prostate', 'rectum', 'urinary bladder'), 3000],
  ['anca', 'Anca', el('left hip bone', 'right hip bone', 'left femur', 'right femur'), 4000],
  ['ginocchio', 'Ginocchio', el('left patella', 'right patella', 'left tibia', 'right tibia', 'left fibula', 'right fibula'), 3500],
  ['caviglia', 'Caviglia e piede', el('left foot', 'right foot'), 6000],
];
const inZona = new Set(ZONE.flatMap((z) => z[2]));
const PARTI = [
  { id: 'pelle', nome: 'Pelle', ruolo: 'pelle', fj: el('skin'), budget: 30000 },
  { id: 'scheletro', nome: 'Scheletro', ruolo: 'scheletro', fj: el('skeletal system').filter((f) => !inZona.has(f)), budget: 22000 },
  ...ZONE.map(([id, nome, fj, budget]) => ({ id, nome, ruolo: 'zona', fj, budget })),
];

function leggiObj(fj) {
  const testo = fs.readFileSync(path.join(dirObj, `${fj}.obj`), 'utf8');
  const v = [], f = [];
  for (const r of testo.split('\n')) {
    if (r.startsWith('v ')) { const p = r.split(/\s+/); v.push(+p[1], +p[3], -p[2]); } // mm Z-su → Y-su, fronte verso +Z
    else if (r.startsWith('f ')) {
      const p = r.trim().split(/\s+/).slice(1).map((x) => parseInt(x, 10) - 1);
      for (let i = 1; i + 1 < p.length; i++) f.push(p[0], p[i], p[i + 1]);
    }
  }
  return { v, f };
}

await MeshoptSimplifier.ready;
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
const risultati = [];

function semplifica(P, I, obiettivo) {
  if (I.length <= obiettivo) return I;
  let [S] = MeshoptSimplifier.simplify(I, P, 3, obiettivo, 0.08, []);
  if (S.length > obiettivo * 1.15) [S] = MeshoptSimplifier.simplifySloppy(I, P, 3, null, obiettivo, 1);
  return S;
}

for (const parte of PARTI) {
  const mesh = parte.fj.map(leggiObj);
  const triOrig = mesh.reduce((s, m) => s + m.f.length / 3, 0);
  const ratio = Math.min(1, parte.budget / triOrig);
  const pos = [], idx = [];
  for (const m of mesh) {
    const P0 = new Float32Array(m.v), I0 = new Uint32Array(m.f);
    const ob = Math.max(36, Math.floor((m.f.length / 3) * ratio) * 3);
    const S0 = semplifica(P0, I0, ob);
    const base = pos.length / 3;
    for (const x of P0) pos.push(x);
    for (const i of S0) idx.push(i + base);
  }
  const P = new Float32Array(pos);
  const S = new Uint32Array(idx);
  // compatta i vertici usati
  const mappa = new Int32Array(P.length / 3).fill(-1);
  const nv = [];
  const ni = new Uint32Array(S.length);
  for (let k = 0; k < S.length; k++) {
    const o = S[k];
    if (mappa[o] < 0) { mappa[o] = nv.length / 3; nv.push(P[o * 3], P[o * 3 + 1], P[o * 3 + 2]); }
    ni[k] = mappa[o];
  }
  for (let k = 0; k < nv.length; k++) { const a = k % 3; if (nv[k] < min[a]) min[a] = nv[k]; if (nv[k] > max[a]) max[a] = nv[k]; }
  risultati.push({ parte, v: nv, i: ni, triOrig });
  console.log(`${parte.id.padEnd(14)} ${String(parte.fj.length).padStart(4)} file  ${String(triOrig).padStart(8)} → ${String(ni.length / 3).padStart(6)} triangoli, ${nv.length / 3} vertici`);
}

// binario: "MRIC" | uint32 lunghezza header | header JSON (allineato a 4) | per parte: posizioni uint16 ×3, indici uint16|uint32
const blocchi = [];
let off = 0;
const parti = risultati.map(({ parte, v, i }) => {
  const nv = v.length / 3;
  const q = new Uint16Array(v.length);
  for (let k = 0; k < v.length; k++) { const a = k % 3; q[k] = Math.round(((v[k] - min[a]) / (max[a] - min[a])) * 65535); }
  const i32 = nv > 65535;
  const ind = i32 ? i : Uint16Array.from(i);
  const voff = off; blocchi.push(Buffer.from(q.buffer)); off += q.byteLength;
  if (off % 4) { const pad = 4 - (off % 4); blocchi.push(Buffer.alloc(pad)); off += pad; }
  const ioff = off; blocchi.push(Buffer.from(ind.buffer, ind.byteOffset, ind.byteLength)); off += ind.byteLength;
  if (off % 4) { const pad = 4 - (off % 4); blocchi.push(Buffer.alloc(pad)); off += pad; }
  return { id: parte.id, nome: parte.nome, ruolo: parte.ruolo, nv, ni: i.length, i32, voff, ioff };
});
const header = {
  v: 1,
  fonte: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0 (modificato: semplificato e quantizzato)',
  unita: 'mm', min, max, parti,
};
let hj = Buffer.from(JSON.stringify(header), 'utf8');
if (hj.length % 4) hj = Buffer.concat([hj, Buffer.alloc(4 - (hj.length % 4), 0x20)]);
const testa = Buffer.alloc(8); testa.write('MRIC', 0, 'ascii'); testa.writeUInt32LE(hj.length, 4);
fs.mkdirSync(path.dirname(uscita), { recursive: true });
fs.writeFileSync(uscita, Buffer.concat([testa, hj, ...blocchi]));
const tot = parti.reduce((s, p) => s + p.ni / 3, 0);
console.log(`\n${uscita}: ${(fs.statSync(uscita).size / 1024).toFixed(0)} KB, ${tot} triangoli`);
