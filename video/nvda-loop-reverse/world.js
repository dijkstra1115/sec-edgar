/* 輝達的錢繞一圈：倒著轉 — the same loop as last episode, one continuous 3D take.
   Everything in the world is a pure function of time t, so any frame can be seeked. */
(function () {
  const TM = window.TIMING;
  const SC = {};
  TM.scenes.forEach((s) => (SC[s.id] = s));
  const Ln = (sid, i, off = 0) => SC[sid].lines[i].start + off;
  const S = (id) => SC[id].start;
  const $ = (s) => document.querySelector(s);
  const h = (tag, cls, parent, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  };
  const W = 1080;
  const H = 1920;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = (a, b, u) => a + (b - a) * u;
  const EZ = {};
  const ez = (n) => EZ[n] || (EZ[n] = gsap.parseEase(n));
  // progress of a cue: 0 before t0, 1 after t0+d
  const pr = (t, t0, d, e) => { const u = clamp01((t - t0) / d); return e ? ez(e)(u) : u * u * (3 - 2 * u); };
  const pop = (t, t0, d = 0.45) => pr(t, t0, d, "back.out(2)");
  const win = (t, a, b, d = 0.3) => pr(t, a, d) * (1 - pr(t, b, d)); // on over [a, b]
  let seed = 1123;
  const rnd = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const COL = { green: 0x9be000, greenD: 0x3d5c00, copper: 0xf5a552, copperD: 0xb5622a, red: 0xff5a45, ink: 0xf2f4ea, bg: 0x050807, cyan: 0x9fe8ff };
  const c3 = (hex) => new THREE.Color(hex);
  const TAU = Math.PI * 2;

  // ───────────────────────── renderer / world ─────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas: $("#gl"), antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x21150d, 0.006);
  const cam = new THREE.PerspectiveCamera(42, W / H, 0.3, 3000);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1800, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { cTop: { value: c3(0x030908) }, cMid: { value: c3(0x123a30) }, cGlow: { value: c3(0x5e3418) }, cHor: { value: c3(0x21150d) } },
      vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "varying vec3 vD; uniform vec3 cTop; uniform vec3 cMid; uniform vec3 cGlow; uniform vec3 cHor; void main(){ float y = clamp(vD.y, 0.0, 1.0); vec3 c = mix(cHor, cGlow, smoothstep(0.0, 0.085, y)); c = mix(c, cMid, smoothstep(0.05, 0.26, y)); c = mix(c, cTop, smoothstep(0.16, 0.62, y)); gl_FragColor = vec4(c, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
    }),
  );
  scene.add(sky);
  {
    const n = 700;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU;
      const e = 0.08 + rnd() * 1.4;
      p[i * 3] = Math.cos(a) * Math.cos(e) * 1500; p[i * 3 + 1] = Math.sin(e) * 1500; p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 1500;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    sky.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe0d0, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.7, fog: false, depthWrite: false })));
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x0b120e, roughness: 0.88, metalness: 0.05 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(3000, 300, 0x35501f, 0x24361a);
  grid.position.y = 0.03;
  grid.material.transparent = true;
  grid.material.opacity = 0.45;
  scene.add(grid);
  // a sparse city of light sticks outside the loop
  {
    const P = [];
    while (P.length < 1500) {
      const x = -320 + rnd() * 640;
      const z = -320 + rnd() * 640;
      const r = Math.hypot(x, z);
      if (r < 66) continue;
      if (Math.hypot(x + 10, z + 60) < 14) continue; // supply tower
      P.push([x, z, 0.5 + rnd() * rnd() * 6, rnd()]);
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 1, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }), P.length);
    const cc = new THREE.Color();
    const o = new THREE.Object3D();
    P.forEach((p, i) => {
      o.position.set(p[0], p[2] / 2, p[1]); o.scale.set(1, p[2], 1); o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      im.setColorAt(i, cc.set(p[3] > 0.72 ? 0x7a4420 : 0x385600));
    });
    im.frustumCulled = false;
    scene.add(im);
  }
  const hemi = new THREE.HemisphereLight(0x9cc0aa, 0x0b0f0c, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc79a, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 500 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const glowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,0.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const glow = (color, size, parent, pos) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.setScalar(size);
    if (pos) s.position.copy(pos);
    (parent || scene).add(s);
    return s;
  };
  const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.1 }, o));
  const basic = (color, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color }, o));
  const mesh = (geo, mat, parent, pos, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.copy(pos);
    m.castShadow = shadow; m.receiveShadow = true;
    (parent || scene).add(m);
    return m;
  };
  const edges = (m, color, opacity = 1) => {
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
    m.add(l);
    return l;
  };
  const dummy = new THREE.Object3D();
  const tmpC = new THREE.Color();

  // ───────────────────────── labels inside the world ─────────────────────────
  // Labels keep a constant on-screen size (f = css px scale) unless o.s fixes a world size.
  const labelLayer = $("#labels");
  const labels = [];
  function lab(html, cls, o) {
    const el = h("div", "w3 " + (cls || ""), labelLayer, html);
    if (o.size) el.style.fontSize = o.size + "px";
    const L = { el, pos: V(...o.pos), f: o.f || 1, o: 0, k: 1, upd: o.upd, vis: false, anchor: o.anchor || "b" };
    labels.push(L);
    return L;
  }
  const show = (a, b = 1e9, popIn = true) => (t, L) => {
    L.o = pr(t, a, 0.22) * (1 - pr(t, b, 0.22));
    L.k = popIn ? 0.55 + 0.45 * pop(t, a, 0.5) : 1;
  };
  const slam = (a, b = 1e9) => (t, L) => {
    L.o = pr(t, a, 0.1) * (1 - pr(t, b, 0.2));
    L.k = lerp(2.4, 1, pr(t, a, 0.22, "power4.out"));
  };
  // several on-windows: [[a, b], ...]
  const showMany = (wins) => (t, L) => {
    let o = 0;
    let k = 1;
    for (const [a, b] of wins) {
      const v = pr(t, a, 0.22) * (1 - pr(t, b, 0.22));
      if (v > o) { o = v; k = 0.55 + 0.45 * pop(t, a, 0.5); }
    }
    L.o = o; L.k = k;
  };
  const mS = new THREE.Matrix4().set(W / 2, 0, 0, W / 2, 0, -H / 2, 0, H / 2, 0, 0, 1, 0, 0, 0, 0, 1);
  const mF = new THREE.Matrix4();
  const mM = new THREE.Matrix4();
  const mT = new THREE.Matrix4();
  const vS = new THREE.Vector3();
  const vP = new THREE.Vector3();
  const PX = Math.tan((42 * Math.PI) / 360) * 2 / H; // world units per css px at distance 1 (fov 42)
  function placeLabels(t) {
    const px = Math.tan((cam.fov * Math.PI) / 360) * 2 / H;
    for (const L of labels) {
      if (L.upd) L.upd(t, L);
      vP.copy(L.pos).applyMatrix4(cam.matrixWorldInverse);
      if (L.o <= 0.004 || vP.z > -1.0) {
        if (L.vis) { L.el.style.visibility = "hidden"; L.vis = false; }
        continue;
      }
      const w = L.el.offsetWidth;
      const hh = L.el.offsetHeight;
      const s = -vP.z * px * L.f * L.k;
      mM.compose(L.pos, cam.quaternion, vS.set(s, s, s));
      mF.set(1, 0, 0, -w / 2, 0, -1, 0, L.anchor === "b" ? hh : hh / 2, 0, 0, 1, 0, 0, 0, 0, 1);
      mT.copy(mS).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse).multiply(mM).multiply(mF);
      L.el.style.transform = "matrix3d(" + mT.elements.map((v) => +v.toPrecision(9)).join(",") + ")";
      L.el.style.opacity = L.o.toFixed(3);
      if (!L.vis) { L.el.style.visibility = "visible"; L.vis = true; }
    }
  }
  void PX;

  const updaters = [];
  const RING = 40;
  const P1 = V(0, 0, RING); // 01 invest
  const P2 = V(RING, 0, 0); // 02 customer buys GPUs
  const P3 = V(0, 0, -RING); // 03 rent back
  const P4 = V(-RING, 0, 0); // 04 guarantee
  const SUP = V(-10, 0, -60); // s6 supply-commitment tower
  const OPI = V(14, 0, 13); // s7 operating-income column
  const CF = V(-15, 0, 15); // s5 cash-flow bars

  const plinth = (at, r) => {
    mesh(new THREE.CylinderGeometry(r, r + 0.6, 0.5, 64), std(0x111915, { roughness: 0.4, metalness: 0.4 }), scene, V(at.x, 0.25, at.z));
    mesh(new THREE.TorusGeometry(r + 0.05, 0.06, 8, 96), basic(0x6f7d70), scene, V(at.x, 0.52, at.z), false).rotation.x = Math.PI / 2;
  };

  // value that eases between keyframes [[t, v], ...] (smoothstep between neighbours)
  const curve = (keys) => (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [ta, va] = keys[i];
      const [tb, vb] = keys[i + 1];
      if (t < tb) { const u = clamp01((t - ta) / Math.max(1e-6, tb - ta)); return lerp(va, vb, u * u * (3 - 2 * u)); }
    }
    return keys[keys.length - 1][1];
  };

  // ───────────────────────── the tower (NVIDIA) ─────────────────────────
  const towerMat = std(0x0e1612, { roughness: 0.35, metalness: 0.65 });
  {
    plinth(V(0, 0, 0), 9);
    const tb = mesh(new THREE.BoxGeometry(7, 26, 7), towerMat, scene, V(0, 13.5, 0));
    edges(tb, COL.green, 0.9);
    for (let k = 0; k < 6; k++) mesh(new THREE.BoxGeometry(7.25, 0.2, 7.25), basic(COL.green), scene, V(0, 3.5 + k * 4, 0), false);
    mesh(new THREE.BoxGeometry(7.6, 1.2, 7.6), basic(COL.green), scene, V(0, 27.1, 0), false);
    glow(COL.green, 34, scene, V(0, 28.5, 0)).material.opacity = 0.5;
    const tl = new THREE.PointLight(COL.green, 900, 90, 2);
    tl.position.set(0, 32, 0);
    scene.add(tl);
  }

  // ───────────────────────── the loop, now running backward ─────────────────────────
  const speed = curve([
    [0, 0.18], [Ln("s1", 4), 0.18], [Ln("s1", 4, 1.4), -0.5],
    [S("s2") + 0.2, -0.5], [S("s2") + 1.4, 0.22],
    [S("s3"), 0.22], [S("s3") + 1.2, 0.75],
    [Ln("s4", 0), 0.75], [Ln("s4", 0, 1.0), -0.85], [Ln("s4", 3), -0.85], [Ln("s4", 3, 1.2), -0.4],
    [Ln("s6", 4), -0.4], [Ln("s6", 4, 1.6), -0.16],
    [Ln("s7", 5), -0.16], [Ln("s7", 5, 1.6), -0.015],
    [S("s9"), -0.015], [S("s9") + 3, 0.05],
  ]);
  const phaseAt = (t) => {
    let p = 0;
    const dt = 1 / 60;
    for (let x = 0; x < t; x += dt) p += speed(x) * Math.min(dt, t - x);
    return p;
  };
  const NSEG = 280;
  const ringMat = basic(COL.green, { transparent: true, opacity: 1 });
  const ringIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.18, 0.55), ringMat, NSEG);
  ringIM.frustumCulled = false;
  scene.add(ringIM);
  for (let i = 0; i < NSEG; i++) {
    const a = (i / NSEG) * TAU;
    dummy.position.set(RING * Math.sin(a), 0.3, RING * Math.cos(a)); dummy.rotation.set(0, a, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
    ringIM.setMatrixAt(i, dummy.matrix);
  }
  const ringHalo = mesh(new THREE.RingGeometry(RING - 1.6, RING + 1.6, 160), basic(COL.green, { transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), scene, V(0, 0.08, 0), false);
  ringHalo.rotation.x = -Math.PI / 2;
  const NC = 40;
  const coinGeo = new THREE.CylinderGeometry(1, 1, 0.3, 28);
  const coinMat = std(COL.copper, { metalness: 0.85, roughness: 0.3, emissive: 0x6a3208, emissiveIntensity: 0.9 });
  const coins = new THREE.InstancedMesh(coinGeo, coinMat, NC);
  coins.castShadow = true;
  coins.frustumCulled = false;
  scene.add(coins);
  const cG = c3(COL.green);
  const cR = c3(COL.red);
  updaters.push((t) => {
    const sp = speed(t);
    const back = clamp01(-sp / 0.35);
    const idle = 1 - clamp01(Math.abs(sp) / 0.12); // dims when the loop stalls
    ringMat.color.copy(cG).lerp(cR, back).multiplyScalar(1 - 0.55 * idle);
    ringHalo.material.color.copy(ringMat.color);
    ringHalo.material.opacity = 0.32 * (1 - 0.6 * idle) * (0.85 + 0.15 * Math.sin(t * 3));
    const ph = phaseAt(t);
    for (let i = 0; i < NC; i++) {
      const a = (i / NC) * TAU + ph;
      dummy.position.set(RING * Math.sin(a), 1.6, RING * Math.cos(a));
      dummy.rotation.set(Math.PI / 2, a + ph * 6 + i, 0, "YXZ");
      dummy.scale.setScalar(1.05);
      dummy.updateMatrix();
      coins.setMatrixAt(i, dummy.matrix);
    }
    coins.instanceMatrix.needsUpdate = true;
    coinMat.emissiveIntensity = 0.4 + 0.6 * (1 - idle);
  });
  lab("⟲ 倒著轉", "big r", { pos: [0, 44, 0], upd: slam(Ln("s1", 4, 1.5), S("s2") + 0.2) });
  lab("⟲ 倒著轉", "big r", { pos: [0, 40, 40], f: 0.8, upd: slam(Ln("s4", 0, 0.9), Ln("s4", 1, 0.2)) });
  const stepWin = () => [[S("s2") + 0.6, Ln("s2", 3, -0.2)]];
  lab("<b>01</b>投資客戶", "step", { pos: [P1.x, 12, P1.z], upd: showMany(stepWin()) });
  lab("<b>02</b>客戶買 GPU", "step", { pos: [P2.x - 9, 12, P2.z], upd: showMany(stepWin()) });
  lab("<b>03</b>輝達租回來", "step", { pos: [P3.x, 12, P3.z], upd: showMany(stepWin()) });
  lab("<b>04</b>替客戶作保", "step", { pos: [P4.x + 9, 14, P4.z], upd: showMany(stepWin()) });

  // ───────────────────────── flying things ─────────────────────────
  const chipGeo = new THREE.BoxGeometry(1.5, 0.32, 1.5);
  const chipMat = std(COL.green, { emissive: COL.green, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.3 });
  const redCoinMat = std(COL.red, { metalness: 0.7, roughness: 0.35, emissive: 0x6a1208, emissiveIntensity: 0.9 });
  const fA = new THREE.Vector3();
  const fB = new THREE.Vector3();
  const fM = new THREE.Vector3();
  // n items travel from -> to on an arc; item j leaves at t0 + j * gap and flies for T seconds
  function flow(o) {
    const geo = o.kind === "chip" ? chipGeo : coinGeo;
    const mat = o.mat || (o.kind === "chip" ? chipMat : coinMat);
    const im = new THREE.InstancedMesh(geo, mat, o.n);
    im.frustumCulled = false;
    im.castShadow = true;
    scene.add(im);
    const sc = o.scale || (o.kind === "chip" ? 1 : 0.85);
    const T = o.T || 1.1;
    const gap = o.gap || 0.12;
    updaters.push((t) => {
      for (let j = 0; j < o.n; j++) {
        const t0 = o.t0 + j * gap;
        const u = clamp01((t - t0) / T);
        const live = t >= t0 && t < t0 + T && t < (o.until || 1e9) ? 1 : 0;
        const e = ez("power1.inOut")(u);
        const jit = ((j * 7919) % 13) / 13 - 0.5;
        fA.copy(o.from); fB.copy(o.to);
        fA.x += jit * (o.spread || 2); fB.x += jit * (o.spread || 2);
        fA.z += (((j * 104729) % 11) / 11 - 0.5) * (o.spread || 2);
        fM.lerpVectors(fA, fB, 0.5); fM.y += o.lift || 12;
        const v = 1 - e;
        dummy.position.set(0, 0, 0).addScaledVector(fA, v * v).addScaledVector(fM, 2 * v * e).addScaledVector(fB, e * e);
        if (o.kind === "chip") dummy.rotation.set(0.3 * Math.sin(t * 5 + j), t * 2 + j, 0);
        else dummy.rotation.set(Math.PI / 2, t * 6 + j, 0, "YXZ");
        dummy.scale.setScalar(live * sc);
        dummy.updateMatrix();
        im.setMatrixAt(j, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    });
  }
  const unitBox = () => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; };

  // ───────────────────────── scenery: the two clouds and the guaranteed campus ─────────────────────────
  function dataCenter(at, ry, tint) {
    const g = new THREE.Group();
    g.position.copy(at);
    g.rotation.y = ry;
    scene.add(g);
    const hall = mesh(new THREE.BoxGeometry(14, 6.5, 10), std(0x101813, { roughness: 0.45, metalness: 0.5, transparent: true, opacity: 0.55 }), g, V(0, 3.75, 0));
    hall.castShadow = false;
    edges(hall, tint, 0.85);
    mesh(new THREE.BoxGeometry(14.4, 0.4, 10.4), std(0x18221c, { metalness: 0.5, roughness: 0.4 }), g, V(0, 7.2, 0));
    const n = 24;
    const racks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, 4.6, 1.3), std(0x3d5c00, { roughness: 0.4, metalness: 0.4, emissive: COL.green, emissiveIntensity: 0.25 }), n);
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / 6);
      const c = i % 6;
      dummy.position.set(-5 + c * 2, 2.8, -3.3 + r * 2.2); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      racks.setMatrixAt(i, dummy.matrix);
    }
    racks.castShadow = true;
    g.add(racks);
    plinth(at, 9.5);
  }
  dataCenter(P2, Math.PI / 2, COL.ink);
  dataCenter(P3, 0, COL.ink);
  const campus = [];
  {
    plinth(P4, 13);
    for (let i = 0; i < 9; i++) {
      const r = Math.floor(i / 3) - 1;
      const c = (i % 3) - 1;
      const m = std(0x1a2420, { roughness: 0.45, metalness: 0.45, transparent: true, opacity: 1 });
      const g = new THREE.BoxGeometry(4.8, 3.4, 4.8);
      g.translate(0, 1.7, 0);
      const b = mesh(g, m, scene, V(P4.x + c * 6.4, 0.5, P4.z + r * 6.4));
      const ed = edges(b, COL.copper, 0.9);
      ed.material.transparent = true;
      const cap = mesh(new THREE.BoxGeometry(4.2, 0.12, 4.2), basic(COL.copper, { transparent: true }), b, V(0, 3.47, 0), false);
      const dm = new THREE.Group();
      dm.position.set(P4.x + c * 6.4, 0.5, P4.z + r * 6.4);
      scene.add(dm);
      const R = 3.3;
      mesh(new THREE.SphereGeometry(R, 24, 12, 0, TAU, 0, Math.PI / 2), basic(COL.copper, { transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), dm, null, false);
      dm.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(R, 12, 5, 0, TAU, 0, Math.PI / 2)), new THREE.LineBasicMaterial({ color: COL.copper, transparent: true, opacity: 0.8 })));
      campus.push({ b, m, ed, cap, dm });
    }
  }

  // ───────────────────────── s3 · the profit pie above the tower ─────────────────────────
  {
    const pie = new THREE.Group();
    pie.position.set(0, 50, 0);
    scene.add(pie);
    const R = 10;
    const share = 237 / 1414;
    const inner = new THREE.Group();
    inner.rotation.x = Math.PI / 2;
    pie.add(inner);
    const big = mesh(new THREE.CylinderGeometry(R, R, 2, 72, 1, false, share * TAU, (1 - share) * TAU), std(COL.green, { emissive: COL.greenD, emissiveIntensity: 0.6, roughness: 0.45, metalness: 0.3 }), inner, null, false);
    const cut = mesh(new THREE.CylinderGeometry(R, R, 2.4, 40, 1, false, 0, share * TAU), std(COL.copper, { emissive: 0x5a2a08, emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.6 }), inner, null, false);
    edges(big, 0xd8ff8a, 0.5); edges(cut, 0xffe2bd, 0.8);
    const mid = (share * TAU) / 2;
    const g1 = Ln("s3", 1), g2 = Ln("s3", 2), g3 = Ln("s3", 3);
    const end = S("s4") + 0.2;
    lab('稅前獲利 <span class="n">1,414</span> 億<small>今年上半年</small>', "tag g", { pos: [0, 61.5, 0], upd: show(g1 + 0.2, g3 + 0.1) });
    // pie rotated about x by 90°: local (sin a, 0, cos a) maps to world (sin a, -cos a, 0)
    lab('投資收益 <span class="n">237</span> 億<small>≈ 1/6</small>', "tag c", { pos: [Math.sin(mid) * 15 + 2, 50 - Math.cos(mid) * 12, 3], upd: show(g2 + 0.6, end) });
    lab("客戶估值 ↑　輝達帳面 ↑", "tag w", { pos: [0, 61.5, 0], f: 0.9, upd: show(g3 + 0.3, end) });
    updaters.push((t) => {
      const k = pop(t, S("s3") + 0.6, 0.6) * (1 - pr(t, end - 0.1, 0.4));
      pie.scale.setScalar(Math.max(0.001, k));
      pie.visible = k > 0.002;
      pie.rotation.y = 0.25 * Math.sin(t * 0.6);
      const out = pr(t, g2 + 0.4, 0.5, "back.out(2)") * 3.2;
      cut.position.set(Math.sin(mid) * out, 0, Math.cos(mid) * out);
      cut.material.emissiveIntensity = 0.8 + 0.8 * win(t, g3, end, 0.3) * (0.5 + 0.5 * Math.sin(t * 7));
    });
  }

  // ───────────────────────── s4 · the 13F holdings shrink ─────────────────────────
  {
    plinth(P1, 14);
    const U4 = 0.07; // world units per 億 USD
    // 13F value at 9/30 and the same shares at the 11/20 close (億 USD)
    const HOLD = [
      { name: "SpaceX", v0: 196.8, v1: 166.7, d: "−15%", x: -10.5, lag: 1.4 },
      { name: "Intel", v0: 193.7, v1: 82.6, d: "−57%", x: -3.5, lag: 0 },
      { name: "CoreWeave", v0: 41.1, v1: 18.7, d: "−55%", x: 3.5, lag: 0.8 },
      { name: "Nokia", v0: 7.4, v1: 5.0, d: "−32%", x: 10.5, lag: 1.8 },
    ];
    const k0 = Ln("s4", 1), k2 = Ln("s4", 2), k3 = Ln("s4", 3), k4 = Ln("s4", 4), k5 = Ln("s4", 5);
    const end = S("s5") + 0.3;
    lab("13F・九月底持有的上市股票", "tag w", { pos: [0, 21, P1.z], f: 0.9, upd: show(k0 + 0.4, k3 - 0.1) });
    lab('<span class="n">−166</span> 億<small>最大四檔・7 週</small>', "big r", { pos: [0, 19, P1.z], upd: slam(k4 + 1.4, k5 - 0.1) });
    HOLD.forEach((o, i) => {
      const z = P1.z - o.x;
      const solid = mesh(unitBox(), std(i < 3 ? COL.copper : COL.copperD, { roughness: 0.35, metalness: 0.7, emissive: 0x3a1a04 }), scene, V(P1.x, 0.5, z));
      edges(solid, 0xffe2bd, 0.8);
      const ghost = mesh(unitBox(), basic(COL.red, { transparent: true, opacity: 0, depthWrite: false }), scene, V(P1.x, 0.5, z), false);
      const gEd = edges(ghost, COL.red, 0.5);
      const h0 = o.v0 * U4, h1 = o.v1 * U4;
      const tag = lab(`${o.name}<small>${Math.round(o.v0)} 億</small>`, "tag w", { pos: [P1.x, 0, z], f: 0.62, upd: show(k2 + 0.3 + i * 0.25, k5 - 0.1) });
      const dl = lab(o.d, "tag r", { pos: [P1.x + 2.5, 0, z], f: 0.62, upd: show(k3 + 0.6 + o.lag, i === 0 ? Ln("s4", 6) - 0.1 : end) });
      updaters.push((t) => {
        const up = pr(t, k2 + 0.2 + i * 0.25, 0.8, "power3.out") * (1 - pr(t, end - 0.2, 0.5));
        const down = pr(t, k3 + 0.2 + o.lag, 1.0, "power3.inOut");
        const hs = Math.max(0.001, up * lerp(h0, h1, down));
        solid.scale.set(3.6, hs, 3.6);
        solid.visible = up > 0.002;
        const gh = Math.max(0.001, up * (h0 - h1) * down);
        ghost.scale.set(3.7, gh, 3.7);
        ghost.position.y = 0.5 + hs;
        ghost.visible = down > 0.002 && up > 0.002;
        ghost.material.opacity = 0.16 * down;
        gEd.material.opacity = 0.9 * down;
        tag.pos.y = 0.5 + up * h0 + 1.1;
        dl.pos.y = 0.5 + hs + gh * 0.5 - 1.2;
      });
    });
  }

  // ───────────────────────── s5 · earn, invest, borrow ─────────────────────────
  {
    const U5 = 0.012;
    const l1 = Ln("s5", 1), l2 = Ln("s5", 2), l3 = Ln("s5", 3), l4 = Ln("s5", 4);
    const end = S("s6") + 0.3;
    const BARS = [
      { v: 1833, x: -6, col: COL.green, emi: COL.greenD, t: l1, html: '前三季淨利<small><span class="n">1,833</span> 億</small>', cls: "g" },
      { v: 581, x: 0, col: COL.copper, emi: 0x3a1a04, t: l2, html: '買股權<small><span class="n">581</span> 億</small>', cls: "c" },
      { v: 249, x: 6, col: COL.red, emi: 0x4a0c06, t: l3, html: '新借<small><span class="n">≈ 250</span> 億</small>', cls: "r" },
    ];
    BARS.forEach((o) => {
      const m = mesh(unitBox(), std(o.col, { emissive: o.emi, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.4 }), scene, V(CF.x + o.x, 0.1, CF.z));
      edges(m, 0xffffff, 0.5);
      const hh = o.v * U5;
      const L = lab(o.html, "tag " + o.cls, { pos: [CF.x + o.x, 0, CF.z], f: 0.7, upd: show(o.t + 0.5, end) });
      updaters.push((t) => {
        const k = pr(t, o.t + 0.2, 1.0, "power3.out") * (1 - pr(t, end - 0.2, 0.5));
        const pulse = 1 + 0.04 * win(t, l4, end - 0.3, 0.3) * Math.sin(t * 8 + o.x);
        m.scale.set(4.2 * pulse, Math.max(0.001, k * hh), 4.2 * pulse);
        m.visible = k > 0.002;
        L.pos.y = 0.1 + k * hh + 1.2;
      });
    });
    flow({ kind: "coin", from: V(CF.x - 6, 1833 * U5, CF.z), to: V(CF.x, 581 * U5, CF.z), t0: l2 + 0.1, n: 16, gap: 0.08, T: 0.9, lift: 5, spread: 2.5 });
    flow({ kind: "coin", mat: redCoinMat, from: V(CF.x + 14, 40, CF.z - 10), to: V(CF.x + 6, 249 * U5, CF.z), t0: l3 + 0.1, n: 14, gap: 0.08, T: 0.9, lift: 2, spread: 2.5 });
  }

  // ───────────────────────── s6 · the supply-commitment tower ─────────────────────────
  {
    plinth(SUP, 7);
    const U6 = 0.009;
    const m1 = Ln("s6", 1), m2 = Ln("s6", 2), m3 = Ln("s6", 3), m4 = Ln("s6", 4);
    const end = S("s7") + 0.3;
    const base = mesh(unitBox(), std(0x1a2620, { emissive: COL.greenD, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.6 }), scene, V(SUP.x, 0.5, SUP.z));
    edges(base, COL.green, 0.8);
    const top = mesh(unitBox(), std(COL.cyan, { emissive: 0x1e5a6a, emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.4 }), scene, V(SUP.x, 0.5, SUP.z));
    edges(top, 0xffffff, 0.7);
    const hB = 2790 * U6, hT = 1110 * U6;
    const LT = lab('採購承諾 <span class="n">2,790</span> → <span class="n">3,900</span> 億', "tag g", { pos: [SUP.x, 0, SUP.z], f: 0.85, upd: show(m1 + 0.6, m4 + 1.4) });
    const RT = V(-0.9, 0, -0.43); // screen-right for the s6 camera
    const TC = V(0.43, 0, -0.9); // toward the s6 camera
    const at = (dx, y, dc) => [SUP.x + RT.x * dx + TC.x * dc, y, SUP.z + RT.z * dx + TC.z * dc];
    lab("多出來的：記憶體", "tag w", { pos: at(0, hB + hT * 0.5 + 0.5, 6), f: 0.75, upd: show(m2 + 0.3, m3 + 0.1) });
    const sup = [["欣興", "Unimicron", -10, 22], ["景碩", "Kinsus", -10, 12], ["矽品", "SPIL", 10, 22], ["京元電", "KYEC", 10, 12]];
    sup.forEach(([zh, en, dx, y], i) => lab(`${zh}<small>${en}・台灣</small>`, "tag c", { pos: at(dx, y, 5), f: 0.7, upd: show(m3 + 0.6 + i * 0.3, end) }));
    lab("下一張訂單？", "tag r", { pos: [SUP.x * 0.5, 34, SUP.z * 0.5], f: 0.85, upd: show(m4 + 1.6, end) });
    flow({ kind: "chip", from: V(SUP.x, 30, SUP.z), to: V(0, 26, 0), t0: m1 + 0.3, n: 90, gap: 0.1, T: 1.4, lift: 8, spread: 3, until: m4 + 0.8 });
    flow({ kind: "chip", from: V(SUP.x, 30, SUP.z), to: V(0, 26, 0), t0: m4 + 0.8, n: 6, gap: 0.9, T: 1.6, lift: 8, spread: 3, until: end });
    updaters.push((t) => {
      const k = pr(t, m1 + 0.1, 0.9, "power3.out") * (1 - pr(t, end - 0.2, 0.5));
      const k2 = pr(t, m1 + 0.9, 0.8, "power3.out") * (1 - pr(t, end - 0.2, 0.5));
      base.scale.set(8, Math.max(0.001, k * hB), 8);
      top.scale.set(8.1, Math.max(0.001, k2 * hT), 8.1);
      top.position.y = 0.5 + k * hB;
      base.visible = k > 0.002; top.visible = k2 > 0.002;
      top.material.emissiveIntensity = 0.6 + 0.9 * win(t, m2, m3, 0.3) * (0.5 + 0.5 * Math.sin(t * 7));
      LT.pos.y = 0.5 + k * hB + k2 * hT + 1.2;
    });
  }

  // ───────────────────────── s7 · the rebuttal: real sales, guarantees one building at a time ─────────────────────────
  {
    const n1 = Ln("s7", 1), n2 = Ln("s7", 2), n3 = Ln("s7", 3);
    const end = S("s8") + 0.4;
    const col = mesh(unitBox(), std(COL.green, { emissive: COL.greenD, emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.4 }), scene, V(OPI.x, 0.1, OPI.z));
    edges(col, 0xe2ffa8, 0.8);
    const hOp = 775 * 0.02;
    const L = lab('Q3 營業利益 <span class="n">775</span> 億<small>一季・實打實賣出去</small>', "tag g", { pos: [OPI.x, 0, OPI.z], f: 0.85, upd: show(n1 + 0.9, n2 + 0.2) });
    updaters.push((t) => {
      const k = pr(t, n1 + 0.2, 1.4, "power3.out") * (1 - pr(t, n2 + 0.6, 0.6));
      col.scale.set(5, Math.max(0.001, k * hOp), 5);
      col.visible = k > 0.002;
      L.pos.y = k * hOp + 1.4;
    });
    lab('擔保上限 <span class="n">1,050</span> 億<small>OpenAI・俄亥俄州</small>', "tag c", { pos: [P4.x, 13.5, P4.z], f: 0.85, upd: show(n2 + 0.3, n3 + 0.2) });
    lab('<span class="n">2028</span> 年起分批上線', "tag w", { pos: [P4.x, 6.5, P4.z + 9], f: 0.8, upd: show(n2 + 1.3, n3 + 0.2) });
    lab("完工一棟・生效一棟", "tag c", { pos: [P4.x - 4, 17, P4.z + 4], f: 0.85, upd: show(n3 + 0.3, Ln("s7", 5) - 0.2) });
    const FAIL = 2; // back corner of the campus
    const tFail = n3 + 3.0;
    lab("蓋不起來 → 擔保不存在", "tag r", { pos: [campus[FAIL].dm.position.x, 7.5, campus[FAIL].dm.position.z], f: 0.72, upd: show(tFail + 0.2, Ln("s7", 5) - 0.2) });
    updaters.push((t) => {
      campus.forEach((o, i) => {
        const on = pr(t, n3 + 0.4 + i * 0.22, 0.4, "back.out(1.8)") * (1 - pr(t, end, 0.4));
        const failed = i === FAIL ? pr(t, tFail, 0.5) : 0;
        const k = Math.max(0.001, on * (1 - failed));
        o.dm.scale.setScalar(k);
        o.dm.visible = k > 0.002;
        const lit = on * (1 - failed);
        o.cap.material.color.setHex(COL.copper).lerp(c3(COL.green), lit);
        o.ed.material.color.setHex(COL.copper).lerp(c3(COL.green), lit);
        o.m.opacity = 1 - 0.75 * failed;
        o.cap.material.opacity = 1 - 0.8 * failed;
        o.ed.material.opacity = 0.9 - 0.6 * failed;
      });
    });
  }

  // ───────────────────────── camera: one take ─────────────────────────
  const K = [];
  const key = (t, p, l, e = "io", fov = 42, via) => K.push({ t, p: V(...p), l: V(...l), e, fov, via: via ? V(...via) : null });
  (function () {
    const a2 = Ln("s1", 2), a4 = Ln("s1", 4);
    key(0, [0, 27, 58], [0, 23, 0], "lin", 44);
    key(a2, [6, 25, 48], [0, 22, 0], "io", 42);
    key(a4 + 0.2, [9, 24, 44], [0, 22, 0], "lin", 42);
    key(a4 + 2.4, [0, 236, 134], [0, 0, -6], "io", 44);
    key(S("s2") - 0.1, [4, 234, 132], [0, 0, -6], "lin", 44);
    key(Ln("s2", 3), [12, 228, 136], [0, 0, -6], "lin", 44);
    key(S("s3") - 0.1, [40, 190, 120], [0, 0, -4], "lin", 44);
    const g0 = Ln("s3", 0), g2 = Ln("s3", 2);
    key(g0 + 1.2, [-32, 56, 78], [0, 49, 0], "io", 42);
    key(g2 - 0.2, [-29, 55, 76], [0, 49, 0], "lin");
    key(g2 + 0.9, [-24, 54, 72], [2, 48, 0], "io");
    key(S("s4") - 0.1, [-23, 54, 71], [2, 48, 0], "lin");
    const k0 = Ln("s4", 0), k3 = Ln("s4", 3), k4 = Ln("s4", 4), k5 = Ln("s4", 5);
    key(k0 + 1.2, [64, 18, 42], [0, 8, 40], "io", 42, [20, 80, 110]);
    key(k3, [61, 17, 41], [0, 8, 40], "lin");
    key(k4 + 1.0, [68, 22, 40], [0, 10, 40], "io");
    key(k5 - 0.1, [67, 22, 40], [0, 10, 40], "lin");
    key(k5 + 0.8, [74, 30, 42], [0, 3, 40], "io");
    key(S("s5") - 0.1, [75, 31, 42], [0, 3, 40], "lin");
    const l4 = Ln("s5", 4);
    key(S("s5") + 1.4, [-8, 18, 80], [-15, 11, 15], "io", 42, [40, 40, 90]);
    key(l4, [-11, 19, 78], [-15, 11, 15], "lin");
    key(S("s6") - 0.1, [-15, 21, 80], [-15, 12, 15], "io");
    key(Ln("s6", 1, 0.4), [46, 32, -150], [-8, 18, -54], "io", 48, [70, 60, -40]);
    key(Ln("s6", 3), [44, 30, -146], [-8, 17, -56], "lin", 48);
    key(Ln("s6", 4, 0.5), [44, 34, -146], [-9, 20, -54], "io", 48);
    key(S("s7") - 0.1, [43, 35, -144], [-9, 20, -54], "lin", 48);
    const n1 = Ln("s7", 1), n2 = Ln("s7", 2), n5 = Ln("s7", 5);
    key(n1 + 0.4, [48, 20, 60], [14, 9, 13], "io", 42);
    key(n2 - 0.1, [46, 20, 58], [14, 9, 13], "lin");
    key(n2 + 1.2, [-90, 32, 46], [-40, 4, 0], "io", 42, [-20, 60, 80]);
    key(n5 - 0.2, [-86, 30, 42], [-40, 4, 0], "lin");
    key(n5 + 2.0, [0, 200, 116], [0, 0, -4], "io", 42);
    key(S("s8") + 0.2, [8, 198, 114], [0, 0, -4], "lin");
    key(S("s9"), [60, 160, 140], [0, 0, 0], "lin");
    key(TM.total + 0.2, [112, 132, 92], [0, 0, 0], "lin");
  })();
  const shakes = [[Ln("s1", 0, 0.95), 0.4], [Ln("s1", 2, 0.45), 0.35], [Ln("s1", 4, 1.5), 0.3], [Ln("s4", 4, 1.4), 0.4], [S("s7") + 0.05, 0.55]];
  const EASE = { io: "power2.inOut", in: "power2.in", out: "power2.out", xo: "expo.out", lin: "none" };
  const cp = new THREE.Vector3();
  const cl = new THREE.Vector3();
  function camAt(t) {
    let i = 0;
    while (i < K.length - 2 && K[i + 1].t <= t) i++;
    const a = K[i];
    const b = K[i + 1];
    const u = ez(EASE[b.e])(clamp01((t - a.t) / (b.t - a.t)));
    if (b.via) {
      const v = 1 - u;
      cp.set(0, 0, 0).addScaledVector(a.p, v * v).addScaledVector(b.via, 2 * v * u).addScaledVector(b.p, u * u);
      cl.lerpVectors(a.l, b.l, ez("power2.out")(clamp01(u * 1.5)));
    } else {
      cp.lerpVectors(a.p, b.p, u);
      cl.lerpVectors(a.l, b.l, u);
    }
    cam.fov = lerp(a.fov, b.fov, u);
    cp.x += Math.sin(t * 0.83) * 0.07; cp.y += Math.sin(t * 1.07 + 1) * 0.05; cp.z += Math.cos(t * 0.71) * 0.07;
    for (const s of shakes) {
      const d = t - s[0];
      if (d > 0 && d < 0.9) { const e = s[1] * Math.exp(-d * 7); cp.y += e * Math.sin(d * 58); cp.x += e * 0.6 * Math.sin(d * 47 + 1); }
    }
    cam.position.copy(cp);
    cam.lookAt(cl);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  // ───────────────────────── atmosphere over time: red while the loop runs backward ─────────────────────────
  const redness = curve([
    [0, 1], [S("s2"), 1], [S("s2") + 1.2, 0.1], [S("s3"), 0.1], [S("s3") + 1, 0],
    [Ln("s4", 0), 0], [Ln("s4", 0, 1.0), 0.85], [S("s7"), 0.85], [S("s7") + 1.6, 0.15],
    [S("s8"), 0.15], [S("s8") + 1, 0.6], [S("s9"), 0.6], [S("s9") + 1.5, 0.35],
  ]);
  const cHor = [c3(0x21150d), c3(0x3a100b)];
  const cGlow = [c3(0x5e3418), c3(0x8a2616)];
  const cMid = [c3(0x123a30), c3(0x2c0e0c)];
  const cFog = [c3(0x21150d), c3(0x3a100b)];
  const cSun = [c3(0xffc79a), c3(0xff7a5c)];
  function atmosphere(t) {
    const red = redness(t);
    sky.material.uniforms.cHor.value.copy(cHor[0]).lerp(cHor[1], red);
    sky.material.uniforms.cGlow.value.copy(cGlow[0]).lerp(cGlow[1], red);
    sky.material.uniforms.cMid.value.copy(cMid[0]).lerp(cMid[1], red);
    scene.fog.color.copy(cFog[0]).lerp(cFog[1], red);
    sun.color.copy(cSun[0]).lerp(cSun[1], red);
    const high = clamp01((cp.y - 40) / 120);
    scene.fog.density = lerp(0.0062, 0.0018, high);
    sky.position.copy(cam.position);
    sun.target.position.copy(cl);
    sun.position.copy(cl).add(V(-38, 62, 46));
    sun.target.updateMatrixWorld();
  }

  const glEl = $("#gl");
  const pPrev = new THREE.Vector3();
  const lPrev = new THREE.Vector3();
  const dA = new THREE.Vector3();
  const dB = new THREE.Vector3();
  let lastBlur = -1;
  function render(t) {
    camAt(Math.max(0, t - 1 / 30));
    pPrev.copy(cp); lPrev.copy(cl);
    camAt(t);
    dA.subVectors(lPrev, pPrev).normalize();
    dB.subVectors(cl, cp).normalize();
    const speedC = cp.distanceTo(pPrev) * 30 + dA.angleTo(dB) * 30 * 45;
    const blur = Math.round(Math.min(9, Math.max(0, (speedC - 60) * 0.06)) * 2) / 2;
    if (blur !== lastBlur) {
      const f = blur > 0.4 ? "blur(" + blur + "px)" : "none";
      glEl.style.filter = f;
      labelLayer.style.filter = f;
      lastBlur = blur;
    }
    atmosphere(t);
    for (const u of updaters) u(t);
    placeLabels(t);
    renderer.render(scene, cam);
  }

  // ───────────────────────── timeline: drives the world + screen-space layer ─────────────────────────
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });
  const F = (target, a, b, t) => tl.fromTo(target, a, b, t);
  const out = (sel, t, y = -60) => { tl.to(sel, { opacity: 0, y, duration: 0.28, ease: "power2.in" }, t); tl.set(sel, { visibility: "hidden" }, t + 0.3); };
  const clock = { t: 0 };
  tl.fromTo(clock, { t: 0 }, { t: TM.total, duration: TM.total, ease: "none", onUpdate: () => render(clock.t) }, 0);

  // HUD
  const kick = [null, ["那個圓", "輝達的三個數字"], ["順轉", "估值漲，帳面漲"], ["倒轉", "持股縮水"], ["現金流", "一邊投資，一邊借錢"], ["台灣", "採購承諾"], ["反方", "實打實的那一半"], ["SEC", "據報導・未證實"], ["下一步", "等 10-Q"]];
  const kcol = { 3: "var(--red)", 4: "var(--red)", 5: "var(--copper)", 7: "var(--copper)" };
  TM.scenes.forEach((s, i) => {
    const u = h("u", "", h("i", "", $("#prog")));
    F(u, { scaleX: 0 }, { scaleX: 1, duration: s.end - s.start, ease: "none" }, s.start);
    if (!kick[i]) return;
    const k = h("div", "", $("#kicker"), `<b${kcol[i] ? ` style="background:${kcol[i]}"` : ""}>${kick[i][0]}</b>${kick[i][1]}`);
    F(k, { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, s.start + 0.5);
    tl.to(k, { opacity: 0, x: 40, duration: 0.25, ease: "power2.in" }, s.end + 0.15);
    tl.set(k, { visibility: "hidden" }, s.end + 0.42);
  });
  F("#hud", { y: -60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.25);

  // S1: the hook
  (function () {
    const a0 = Ln("s1", 0), a2 = Ln("s1", 2), a3 = Ln("s1", 3), a4 = Ln("s1", 4);
    const a1 = Ln("s1", 1);
    F("#s1-a .tk", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" }, a0 + 0.05);
    F("#s1-a b", { scale: 2.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.24, ease: "power4.out" }, a0 + 0.9);
    F("#s1-a em", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "back.out(1.6)" }, a1 + 0.3);
    out("#s1-a", a2 - 0.3, -100);
    F("#s1-b .tk", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" }, a2 - 0.05);
    F("#s1-b b", { scale: 2.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.24, ease: "power4.out" }, a2 + 0.4);
    F("#s1-b small", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" }, a2 + 0.7);
    F("#s1-c .row", { x: -120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "back.out(1.6)", stagger: 1.4 }, a3 + 0.2);
    out("#s1-b, #s1-c", a4 - 0.1, -80);
  })();
  // S2: the three numbers, answered
  (function () {
    const b3 = Ln("s2", 3), b4 = Ln("s2", 4), b5 = Ln("s2", 5);
    F("#s2-card .head", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, b3 - 0.2);
    const rows = document.querySelectorAll("#s2-card .row");
    [b3, b4, b5].forEach((t0, i) => {
      F(rows[i], { x: -120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)" }, t0 + 0.1);
      F(rows[i].querySelector("b"), { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2.4)" }, t0 + 1.0);
    });
    F("#s2-card .foot", { opacity: 0 }, { opacity: 1, duration: 0.5 }, b5 + 1.2);
    out("#s2-card", S("s3") - 0.2);
  })();
  // S4: the profit share collapses
  (function () {
    const k5 = Ln("s4", 5), k6 = Ln("s4", 6);
    const rows = document.querySelectorAll("#s4-card .row");
    F(rows[0], { x: -120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)" }, k5);
    F(rows[0].querySelector("b"), { scale: 2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.28, ease: "power4.out" }, k5 + 1.3);
    F(rows[1], { x: -120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)" }, k6);
    out("#s4-card", S("s5") - 0.2);
  })();
  // S7: the slap, then the stamp
  (function () {
    const T = S("s7");
    F("#flash", { opacity: 0 }, { opacity: 0.85, duration: 0.07, ease: "power2.in" }, T - 0.07);
    tl.to("#flash", { opacity: 0, duration: 0.5, ease: "power2.out" }, T);
    F("#s7-slap", { scale: 1.7, opacity: 0, rotation: -6 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.24, ease: "power4.out" }, T + 0.02);
    tl.to("#s7-slap", { y: -300, scale: 0.5, opacity: 0, duration: 0.3, ease: "power3.in" }, Ln("s7", 1) + 0.2);
    tl.set("#s7-slap", { visibility: "hidden" }, Ln("s7", 1) + 0.55);
    const a = Ln("s7", 4) + 1.2;
    F("#ov-stamp7", { scale: 2.4, opacity: 0, rotation: -20 }, { scale: 1, opacity: 1, rotation: -5, duration: 0.24, ease: "power4.out" }, a);
    tl.to("#ov-stamp7", { opacity: 0, scale: 0.8, duration: 0.25, ease: "power2.in" }, S("s8") - 0.3);
    tl.set("#ov-stamp7", { visibility: "hidden" }, S("s8") - 0.04);
  })();
  // S8: what we do and don't know
  (function () {
    const p1 = Ln("s8", 1), p2 = Ln("s8", 2), p3 = Ln("s8", 3);
    F("#s8-card .head", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, p1 - 0.1);
    F("#s8-card .row", { x: -120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)", stagger: 0.7 }, p2);
    F("#s8-card .big", { scale: 1.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2.2)" }, p3 + 0.1);
    out("#s8-card", S("s9") - 0.2);
  })();
  // S9: wait for the 10-Q
  (function () {
    const q0 = Ln("s9", 0), q1 = Ln("s9", 1), q2 = Ln("s9", 2), q3 = Ln("s9", 3);
    F("#s9-cta .head", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, q0 + 0.1);
    F("#s9-cta .vs > div", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)", stagger: 1.4 }, q1 + 0.1);
    F("#s9-cta .row", { x: -120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)", stagger: 0.5 }, q2);
    F("#s9-cta .foot", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.out" }, q3 + 0.4);
  })();

  // captions
  (function () {
    const box = $("#caps");
    const colour = (s) =>
      s.replace(/輝達|對答案|實打實|SpaceX|Intel|CoreWeave|OpenAI|SEC|−[\d.]+%|[\d.,]+ ?(億美元|億|%|天|年)|1\/6|倒著轉|記憶體|欣興|景碩|矽品|京元電|減損|借|有錯|嚴格評估|踩煞車|未來幾週/g, (m) => {
        const cls = /輝達|對答案|實打實/.test(m) ? "g" : /^−|倒著轉|減損|借|SEC|有錯/.test(m) ? "r" : "c";
        return `<span class="${cls}">${m}</span>`;
      });
    const width = (s) => [...s].reduce((w, ch) => w + (/[\u0000-ÿ]/.test(ch) ? (ch === " " ? 0.3 : 0.6) : 1), 0);
    TM.scenes.forEach((sc) => {
      sc.lines.forEach((ln, i) => {
        const e = h("div", "cap", box, colour(ln.cap));
        e.style.fontSize = Math.min(66, Math.floor(950 / width(ln.cap))) + "px";
        const next = sc.lines[i + 1];
        const on = Math.max(0, ln.start - 0.08);
        const off = next ? next.start - 0.08 : Math.min(ln.end + 0.3, sc.end + 0.1);
        F(e, { opacity: 0, y: 16, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.14, ease: "back.out(2.2)" }, on);
        tl.set(e, { opacity: 0, visibility: "hidden" }, off);
      });
    });
  })();

  window.__timelines["main"] = tl;
  tl.seek(0);
  render(0);
})();
