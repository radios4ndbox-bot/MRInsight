// MRInsight — prova di grafica 3D per la pagina di diagnostica.
// Usa WebGL "nudo" (nessuna libreria): se funziona questo, funziona anche Three.js.

const SOFTWARE = /swiftshader|llvmpipe|softpipe|microsoft basic render|basic render driver|software/i;

/** Informazioni sul contesto WebGL disponibile. */
export function infoWebGL() {
  const c = document.createElement('canvas');
  const gl2 = c.getContext('webgl2');
  const gl = gl2 || c.getContext('webgl') || c.getContext('experimental-webgl');
  if (!gl) return { disponibile: false };

  // con failIfMajorPerformanceCaveat il browser rifiuta il contesto se disegnerebbe in software
  const c2 = document.createElement('canvas');
  const accelerato = !!(c2.getContext(gl2 ? 'webgl2' : 'webgl', { failIfMajorPerformanceCaveat: true }));

  let renderer = gl.getParameter(gl.RENDERER);
  let vendor = gl.getParameter(gl.VENDOR);
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) {
    renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || renderer;
    vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || vendor;
  }
  const info = {
    disponibile: true,
    versione: gl2 ? 'WebGL 2' : 'WebGL 1',
    renderer: String(renderer),
    vendor: String(vendor),
    software: !accelerato || SOFTWARE.test(String(renderer)),
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    indici32: !!gl2 || !!gl.getExtension('OES_element_index_uint'),
  };
  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();
  return info;
}

function sfera(lat, lon) {
  const pos = new Float32Array((lat + 1) * (lon + 1) * 3);
  let k = 0;
  for (let i = 0; i <= lat; i++) {
    const t = (i / lat) * Math.PI;
    for (let j = 0; j <= lon; j++) {
      const f = (j / lon) * 2 * Math.PI;
      // sfera leggermente deformata, per avere un'ombreggiatura non banale
      const r = 0.8 + 0.06 * Math.sin(6 * t) * Math.cos(5 * f);
      pos[k++] = r * Math.sin(t) * Math.cos(f);
      pos[k++] = r * Math.cos(t);
      pos[k++] = r * Math.sin(t) * Math.sin(f);
    }
  }
  const idx = new Uint16Array(lat * lon * 6);
  k = 0;
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * (lon + 1) + j, b = a + lon + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = a + 1;
      idx[k++] = b; idx[k++] = b + 1; idx[k++] = a + 1;
    }
  }
  return { pos, idx };
}

const VS = `attribute vec3 p; uniform float a; uniform float asp; varying float l;
void main(){
  float c=cos(a), s=sin(a);
  vec3 q=vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z);
  float ct=cos(.35), st=sin(.35);
  q=vec3(q.x, ct*q.y-st*q.z, st*q.y+ct*q.z);
  l=max(dot(normalize(q), normalize(vec3(.4,.6,.8))), 0.);
  gl_Position=vec4(q.x/asp, q.y, q.z*.5, 1.);
}`;
const FS = `precision mediump float; varying float l;
void main(){ vec3 base=vec3(.18,.49,.88); gl_FragColor=vec4(base*(.25+.75*l)+vec3(.9)*pow(l,24.)*.4, 1.); }`;

/**
 * Disegna per `durataMs` una mesh di ~100k triangoli e misura i fotogrammi al secondo.
 * Il risultato è limitato dalla frequenza dello schermo (di solito 60).
 */
export function provaDisegno(canvas, durataMs = 3000) {
  return new Promise((resolve, reject) => {
    const gl = canvas.getContext('webgl', { antialias: true });
    if (!gl) { reject(new Error('contesto WebGL non disponibile')); return; }

    const compila = (tipo, src) => {
      const sh = gl.createShader(tipo);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader non compilato');
      return sh;
    };
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compila(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compila(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('programma non collegato');
    } catch (e) { reject(e); return; }

    const { pos, idx } = sfera(160, 312); // 99.840 triangoli, 50.393 vertici (indici a 16 bit)
    const triangoli = idx.length / 3;
    gl.useProgram(prog);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    const uA = gl.getUniformLocation(prog, 'a');
    gl.uniform1f(gl.getUniformLocation(prog, 'asp'), canvas.width / canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);

    const px = new Uint8Array(4);
    const tempi = [];
    const t0 = performance.now();
    let prec = t0;

    const fotogramma = (ora) => {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(uA, (ora - t0) / 900);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // forza la fine del disegno
      tempi.push(ora - prec);
      prec = ora;
      if (ora - t0 < durataMs) { requestAnimationFrame(fotogramma); return; }
      const validi = tempi.slice(3).sort((a, b) => a - b); // scarta i primi fotogrammi di riscaldamento
      const medio = validi.reduce((s, x) => s + x, 0) / Math.max(validi.length, 1);
      const p95 = validi[Math.floor(validi.length * 0.95)] || medio;
      resolve({ fps: 1000 / medio, p95ms: p95, triangoli, fotogrammi: tempi.length });
    };
    requestAnimationFrame((ora) => { prec = ora; requestAnimationFrame(fotogramma); });
  });
}
