// MRInsight — mappa 3D del corpo, WebGL senza librerie.
// Modello: assets/models/corpo.bin, ricavato da BodyParts3D (© DBCLS, CC BY 4.0).
//
// montaCorpo3D(contenitore, { onZona, onPassaggio }) → { seleziona, reimposta, distruggi, zone }

const URL_MODELLO = new URL('../models/corpo.bin', import.meta.url);

const COLORI = {
  pelle: [0.18, 0.49, 0.88],
  scheletro: [0.80, 0.84, 0.90],
  zona: [0.62, 0.71, 0.87],
  passaggio: [0.18, 0.49, 0.88],
  selezione: [0.07, 0.23, 0.55],
};

const VS = `
attribute vec3 q; attribute vec3 n;
uniform vec3 uMin; uniform vec3 uExt; uniform mat4 uP; uniform mat4 uV; uniform mat3 uN;
varying vec3 vN; varying vec3 vPos;
void main(){
  vec4 p = uV * vec4(uMin + q * uExt, 1.0);
  vPos = p.xyz; vN = uN * n;
  gl_Position = uP * p;
}`;
const FS = `
precision mediump float;
uniform vec3 uCol; uniform float uAlpha; uniform float uRim;
varying vec3 vN; varying vec3 vPos;
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(-vPos);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(vec3(0.35, 0.55, 0.75));
  float d = max(dot(N, L), 0.0);
  float s = pow(max(dot(N, normalize(L + V)), 0.0), 40.0);
  float r = pow(1.0 - max(dot(N, V), 0.0), 2.2);
  vec3 c = uCol * (0.38 + 0.62 * d) + vec3(s * 0.25);
  gl_FragColor = vec4(c + uCol * r * uRim, uAlpha + r * uRim * 0.55);
}`;
const FS_ID = `
precision mediump float; uniform vec3 uCol;
void main(){ gl_FragColor = vec4(uCol, 1.0); }`;

// ───────── matrici (colonne, come WebGL) ─────────
const mul = (a, b) => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
};
const prospettiva = (fov, asp, n, f) => {
  const t = 1 / Math.tan(fov / 2);
  return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]);
};
const trasla = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
const mat3 = (m) => new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);

function leggiModello(buf) {
  const dv = new DataView(buf);
  if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== 'MRIC') throw new Error('modello non valido');
  const lung = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, lung)));
  const base = 8 + lung;
  const ext = header.max.map((m, i) => m - header.min[i]);
  const parti = header.parti.map((p) => {
    const q = new Uint16Array(buf, base + p.voff, p.nv * 3);
    const idx = p.i32 ? new Uint32Array(buf, base + p.ioff, p.ni) : new Uint16Array(buf, base + p.ioff, p.ni);
    // normali lisce calcolate qui: non pesano sul file
    const nrm = new Float32Array(p.nv * 3);
    const P = (k, a) => header.min[a] + (q[k * 3 + a] / 65535) * ext[a];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const ux = P(b, 0) - P(a, 0), uy = P(b, 1) - P(a, 1), uz = P(b, 2) - P(a, 2);
      const vx = P(c, 0) - P(a, 0), vy = P(c, 1) - P(a, 1), vz = P(c, 2) - P(a, 2);
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { nrm[k * 3] += nx; nrm[k * 3 + 1] += ny; nrm[k * 3 + 2] += nz; }
    }
    for (let k = 0; k < nrm.length; k += 3) {
      const l = Math.hypot(nrm[k], nrm[k + 1], nrm[k + 2]) || 1;
      nrm[k] /= l; nrm[k + 1] /= l; nrm[k + 2] /= l;
    }
    return { ...p, q, idx, nrm };
  });
  return { header, ext, parti };
}

export async function montaCorpo3D(contenitore, { onZona = () => {}, onPassaggio = () => {} } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'corpo3d-canvas';
  const etichetta = document.createElement('div');
  etichetta.className = 'corpo3d-etichetta';
  etichetta.hidden = true;
  contenitore.append(canvas, etichetta);

  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false })
    || canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) { canvas.remove(); etichetta.remove(); throw new Error('WebGL non disponibile'); }
  const ext32 = gl instanceof WebGLRenderingContext ? gl.getExtension('OES_element_index_uint') : true;

  const risposta = await fetch(URL_MODELLO, { cache: 'force-cache' });
  if (!risposta.ok) throw new Error(`modello non caricato (HTTP ${risposta.status})`);
  const modello = leggiModello(await risposta.arrayBuffer());

  const compila = (vs, fs) => {
    const p = gl.createProgram();
    for (const [tipo, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'q'); gl.bindAttribLocation(p, 1, 'n');
    gl.linkProgram(p);
    const u = {};
    for (const nome of ['uMin', 'uExt', 'uP', 'uV', 'uN', 'uCol', 'uAlpha', 'uRim']) u[nome] = gl.getUniformLocation(p, nome);
    return { p, u };
  };
  const progColore = compila(VS, FS);
  const progId = compila(VS, FS_ID);

  const mesh = modello.parti.map((p, i) => {
    if (p.i32 && !ext32) return null;
    const vq = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vq); gl.bufferData(gl.ARRAY_BUFFER, p.q, gl.STATIC_DRAW);
    const vn = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vn); gl.bufferData(gl.ARRAY_BUFFER, p.nrm, gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.idx, gl.STATIC_DRAW);
    return { ...p, vq, vn, ib, tipo: p.i32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, pickId: i + 1 };
  }).filter(Boolean);
  const zone = mesh.filter((m) => m.ruolo === 'zona');

  // ───────── camera ─────────
  const { min, max } = modello.header;
  const centro = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const altezza = max[1] - min[1];
  const INIZIO = { yaw: -0.3, pitch: 0.06, dist: altezza * 2.0, cy: centro[1] };
  const cam = { ...INIZIO, yaw: INIZIO.yaw - 1.2 };
  let obiettivo = { ...INIZIO };

  let passaggio = null, selezione = null;
  let ridisegna = true;
  let anim = 0;

  // framebuffer per il picking (colore = id della zona)
  const fb = gl.createFramebuffer();
  const tex = gl.createTexture();
  const rb = gl.createRenderbuffer();
  let fbW = 0, fbH = 0;
  function preparaFb(w, h) {
    if (w === fbW && h === fbH) return;
    fbW = w; fbH = h;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function matrici() {
    const w = canvas.width, h = canvas.height;
    const P = prospettiva(0.5, w / h, altezza * 0.2, altezza * 5);
    const V = mul(trasla(0, 0, -cam.dist), mul(rotX(cam.pitch), mul(rotY(cam.yaw), trasla(-centro[0], -cam.cy, -centro[2]))));
    return { P, V, N: mat3(V) };
  }

  function usa(prog, M) {
    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(prog.u.uP, false, M.P);
    gl.uniformMatrix4fv(prog.u.uV, false, M.V);
    if (prog.u.uN) gl.uniformMatrix3fv(prog.u.uN, false, M.N);
    gl.uniform3fv(prog.u.uMin, min);
    gl.uniform3fv(prog.u.uExt, modello.ext);
  }
  function disegnaMesh(m) {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vq);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, true, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vn);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
    gl.drawElements(gl.TRIANGLES, m.ni, m.tipo, 0);
  }

  function disegna() {
    const M = matrici();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    usa(progColore, M);
    for (const m of zone) {
      const attiva = m.id === passaggio || m.id === selezione;
      gl.uniform3fv(progColore.u.uCol, m.id === selezione ? COLORI.selezione : m.id === passaggio ? COLORI.passaggio : COLORI.zona);
      gl.uniform1f(progColore.u.uAlpha, 1);
      gl.uniform1f(progColore.u.uRim, attiva ? 0.6 : 0.2);
      disegnaMesh(m);
    }
    // scheletro e pelle trasparenti: si vedono gli organi sotto costole e cranio
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    for (const ruolo of ['scheletro', 'pelle']) {
      for (const m of mesh) {
        if (m.ruolo !== ruolo) continue;
        gl.uniform3fv(progColore.u.uCol, COLORI[ruolo]);
        gl.uniform1f(progColore.u.uAlpha, ruolo === 'pelle' ? 0.05 : 0.42);
        gl.uniform1f(progColore.u.uRim, ruolo === 'pelle' ? 0.8 : 0.25);
        disegnaMesh(m);
      }
    }
    gl.depthMask(true);
  }

  function leggiId(x, y) {
    const M = matrici();
    preparaFb(canvas.width, canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    usa(progId, M);
    for (const m of zone) {
      gl.uniform3fv(progId.u.uCol, [m.pickId / 255, 0, 0]);
      disegnaMesh(m);
    }
    const px = new Uint8Array(4);
    gl.readPixels(x, canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const z = zone.find((m) => m.pickId === px[0] && px[3] > 0);
    return z ? z.id : null;
  }

  // ───────── ciclo: disegna solo quando serve ─────────
  function ciclo() {
    let mosso = false;
    for (const k of ['yaw', 'pitch', 'dist', 'cy']) {
      const d = obiettivo[k] - cam[k];
      if (Math.abs(d) > 1e-4 * (k === 'dist' || k === 'cy' ? altezza : 1)) { cam[k] += d * 0.14; mosso = true; } else cam[k] = obiettivo[k];
    }
    if (mosso || ridisegna) { disegna(); ridisegna = false; }
    anim = requestAnimationFrame(ciclo);
  }

  function ridimensiona() {
    const r = contenitore.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ridisegna = true;
  }
  const ro = new ResizeObserver(ridimensiona);
  ro.observe(contenitore);
  ridimensiona();

  // ───────── interazione ─────────
  let trascina = null;
  const nomeZona = (id) => (zone.find((z) => z.id === id) || {}).nome || '';
  const coordinate = (e) => {
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    return { x: Math.round((e.clientX - r.left) * dpr), y: Math.round((e.clientY - r.top) * dpr), cx: e.clientX - r.left, cy: e.clientY - r.top };
  };
  function aggiornaPassaggio(e) {
    const c = coordinate(e);
    const id = leggiId(c.x, c.y);
    if (id !== passaggio) { passaggio = id; ridisegna = true; onPassaggio(id); }
    canvas.style.cursor = id ? 'pointer' : 'grab';
    etichetta.hidden = !id;
    if (id) {
      etichetta.textContent = nomeZona(id);
      etichetta.style.transform = `translate(${c.cx + 14}px, ${c.cy - 10}px)`;
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    trascina = { x: e.clientX, y: e.clientY, yaw: obiettivo.yaw, pitch: obiettivo.pitch, mosso: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (trascina) {
      const dx = e.clientX - trascina.x, dy = e.clientY - trascina.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) trascina.mosso = true;
      obiettivo.yaw = trascina.yaw + dx * 0.008;
      obiettivo.pitch = Math.max(-0.6, Math.min(0.9, trascina.pitch + dy * 0.006));
      canvas.style.cursor = 'grabbing';
      etichetta.hidden = true;
      return;
    }
    aggiornaPassaggio(e);
  });
  canvas.addEventListener('pointerup', (e) => {
    const t = trascina; trascina = null;
    if (t && !t.mosso) {
      const c = coordinate(e);
      const id = leggiId(c.x, c.y);
      if (id) seleziona(id, true);
    }
    aggiornaPassaggio(e);
  });
  canvas.addEventListener('pointerleave', () => {
    if (passaggio) { passaggio = null; ridisegna = true; onPassaggio(null); }
    etichetta.hidden = true;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    obiettivo.dist = Math.max(altezza * 0.45, Math.min(altezza * 3, obiettivo.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
  }, { passive: false });
  canvas.addEventListener('dblclick', () => reimposta());

  function centroZona(id) {
    const m = zone.find((z) => z.id === id);
    if (!m) return null;
    let y0 = Infinity, y1 = -Infinity;
    for (let k = 1; k < m.q.length; k += 3) { const y = m.q[k]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const toY = (v) => min[1] + (v / 65535) * modello.ext[1];
    return { y: (toY(y0) + toY(y1)) / 2, alto: toY(y1) - toY(y0) };
  }

  function seleziona(id, daClic = false) {
    selezione = id;
    ridisegna = true;
    const c = id && centroZona(id);
    if (c) {
      obiettivo.cy = c.y;
      obiettivo.dist = Math.max(altezza * 0.6, Math.min(altezza * 1.6, c.alto * 5));
    }
    if (daClic) onZona(id);
  }
  function reimposta() {
    obiettivo = { ...INIZIO, yaw: obiettivo.yaw };
    selezione = null; ridisegna = true;
    onZona(null);
  }

  anim = requestAnimationFrame(ciclo);

  return {
    zone: zone.map((z) => ({ id: z.id, nome: z.nome })),
    fonte: modello.header.fonte,
    seleziona: (id) => seleziona(id, false),
    reimposta,
    distruggi() {
      cancelAnimationFrame(anim);
      ro.disconnect();
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      canvas.remove(); etichetta.remove();
    },
  };
}
