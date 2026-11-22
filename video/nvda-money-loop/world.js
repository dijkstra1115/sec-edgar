/* 輝達的錢繞一圈 — one continuous 3D take around a money loop.
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
  let seed = 1122;
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
      if (x < -50 && x > -130 && z < -2 && z > -50) continue; // power corridor
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
  const BUYER = V(-12, 0, -60);
  const OPI = V(13, 0, 12); // operating-income column

  const plinth = (at, r) => {
    mesh(new THREE.CylinderGeometry(r, r + 0.6, 0.5, 64), std(0x111915, { roughness: 0.4, metalness: 0.4 }), scene, V(at.x, 0.25, at.z));
    mesh(new THREE.TorusGeometry(r + 0.05, 0.06, 8, 96), basic(0x6f7d70), scene, V(at.x, 0.52, at.z), false).rotation.x = Math.PI / 2;
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
  const TOP = V(0, 27, 0);
  lab("輝達<small>NVIDIA</small>", "tag g", { pos: [0, 31, 0], upd: showMany([[Ln("s1", 4, 1.4), S("s4") + 0.3], [S("s5"), Ln("s6", 0, 0.2)]]) });
  lab("建商", "term", { pos: [0, 31, 0], f: 1.1, upd: show(Ln("s6", 0, 0.35), S("s7") - 0.2) });

  // ───────────────────────── the loop ─────────────────────────
  const NSEG = 280;
  const ringMat = basic(COL.green, { transparent: true, opacity: 1 });
  const ringIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.18, 0.55), ringMat, NSEG);
  ringIM.frustumCulled = false;
  scene.add(ringIM);
  const ringHalo = mesh(new THREE.RingGeometry(RING - 1.6, RING + 1.6, 160), basic(COL.green, { transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), scene, V(0, 0.08, 0), false);
  ringHalo.rotation.x = -Math.PI / 2;
  const ringStart = Ln("s1", 4, 0.15);
  const ringDraw = 1.1;
  // how lit the ring is (dims when demand slows in s9)
  const ringLit = (t) => 1 - 0.75 * pr(t, Ln("s9", 1, 0.2), 1.2) + 0.75 * pr(t, Ln("s9", 4), 0.8);
  // coin speed around the loop, integrated so position stays a pure function of t
  const speed = (t) => 0.16 + 1.6 * win(t, Ln("s6", 4), Ln("s6", 4, 1.6), 0.4) + 3.2 * pr(t, Ln("s9", 0), 1.6, "power2.in") * (1 - pr(t, Ln("s9", 1), 1.4, "power2.out")) - 0.12 * pr(t, Ln("s9", 1, 0.4), 1.2) + 0.12 * pr(t, Ln("s9", 4), 0.8);
  const phaseAt = (t) => {
    let p = 0;
    const dt = 1 / 60;
    for (let x = 0; x < t; x += dt) p += speed(x) * Math.min(dt, t - x);
    return p;
  };
  const NC = 40;
  const coinGeo = new THREE.CylinderGeometry(1, 1, 0.3, 28);
  const coinMat = std(COL.copper, { metalness: 0.85, roughness: 0.3, emissive: 0x6a3208, emissiveIntensity: 0.9 });
  const coins = new THREE.InstancedMesh(coinGeo, coinMat, NC);
  coins.castShadow = true;
  coins.frustumCulled = false;
  scene.add(coins);
  updaters.push((t) => {
    const p = pr(t, ringStart, ringDraw, "power2.inOut");
    const lit = ringLit(t);
    for (let i = 0; i < NSEG; i++) {
      const a = (i / NSEG) * TAU;
      const on = a / TAU <= p ? 1 : 0;
      dummy.position.set(RING * Math.sin(a), 0.3, RING * Math.cos(a));
      dummy.rotation.set(0, a, 0);
      dummy.scale.setScalar(on);
      dummy.updateMatrix();
      ringIM.setMatrixAt(i, dummy.matrix);
    }
    ringIM.instanceMatrix.needsUpdate = true;
    ringMat.color.setHex(COL.green).multiplyScalar(0.35 + 0.65 * lit);
    ringHalo.material.opacity = 0.32 * pr(t, ringStart + ringDraw - 0.1, 0.4) * lit * (0.85 + 0.15 * Math.sin(t * 3));
    const ph = phaseAt(t);
    const k = pr(t, ringStart + ringDraw - 0.2, 0.6);
    for (let i = 0; i < NC; i++) {
      const a = (i / NC) * TAU + ph;
      dummy.position.set(RING * Math.sin(a), 1.6, RING * Math.cos(a));
      dummy.rotation.set(Math.PI / 2, a + t * 2.2 + i, 0, "YXZ");
      dummy.scale.setScalar(k * 1.05);
      dummy.updateMatrix();
      coins.setMatrixAt(i, dummy.matrix);
    }
    coins.instanceMatrix.needsUpdate = true;
    coinMat.emissiveIntensity = 0.5 + 0.6 * lit;
  });
  // step tags around the loop
  const stepWins = () => [[ringStart + ringDraw, S("s2") + 0.3], [S("s9"), Ln("s9", 2)]];
  lab("<b>01</b>投資客戶", "step", { pos: [P1.x, 12, P1.z], upd: showMany(stepWins()) });
  lab("<b>02</b>客戶買 GPU", "step", { pos: [P2.x, 12, P2.z], upd: showMany(stepWins()) });
  lab("<b>03</b>輝達租回來", "step", { pos: [P3.x, 12, P3.z], upd: showMany(stepWins()) });
  lab("<b>04</b>替客戶作保", "step", { pos: [P4.x, 14, P4.z], upd: showMany(stepWins()) });

  // ───────────────────────── flying things: coins, chips, compute ─────────────────────────
  const chipGeo = new THREE.BoxGeometry(1.5, 0.32, 1.5);
  const chipMat = std(COL.green, { emissive: COL.green, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.3 });
  const beamGeo = new THREE.SphereGeometry(0.55, 12, 8);
  const beamMat = basic(COL.cyan, { transparent: true, opacity: 0.95 });
  const fA = new THREE.Vector3();
  const fB = new THREE.Vector3();
  const fM = new THREE.Vector3();
  // n items travel from -> to on an arc; item j leaves at t0 + j * gap and flies for T seconds
  function flow(o) {
    const geo = o.kind === "coin" ? coinGeo : o.kind === "chip" ? chipGeo : beamGeo;
    const mat = o.kind === "coin" ? coinMat : o.kind === "chip" ? chipMat : beamMat;
    const im = new THREE.InstancedMesh(geo, mat, o.n);
    im.frustumCulled = false;
    im.castShadow = o.kind !== "beam";
    scene.add(im);
    const sc = o.scale || (o.kind === "coin" ? 0.85 : 1);
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
        if (o.kind === "coin") dummy.rotation.set(Math.PI / 2, t * 6 + j, 0, "YXZ");
        else if (o.kind === "chip") dummy.rotation.set(0.3 * Math.sin(t * 5 + j), t * 2 + j, 0);
        else dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(live * sc * (o.kind === "beam" ? 0.6 + 0.4 * Math.sin(Math.PI * u) : 1));
        dummy.updateMatrix();
        im.setMatrixAt(j, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    });
  }

  // ───────────────────────── 01 · invest: the equity columns ─────────────────────────
  const U = 0.05; // world units per 1 億 USD of equity: 479 億 -> 24
  {
    plinth(P1, 10);
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const colA = mesh(box, std(COL.copperD, { roughness: 0.5, metalness: 0.5 }), scene, V(P1.x - 4.5, 0.5, P1.z + 1));
    const colB = mesh(box, std(COL.copper, { roughness: 0.35, metalness: 0.7, emissive: 0x3a1a04 }), scene, V(P1.x + 3.5, 0.5, P1.z + 1));
    const colC = mesh(box, std(0xffd29a, { roughness: 0.35, metalness: 0.6, emissive: 0x3a2a10 }), scene, V(P1.x + 3.5, 0.5, P1.z + 1));
    edges(colA, 0xffd9a8, 0.6); edges(colB, 0xffe2bd, 0.8); edges(colC, 0xffffff, 0.7);
    const hA = 38 * U;
    const hB = 479 * U;
    const hC = (477 + 33) * U; // listed stock + equity-method stakes
    const b1 = Ln("s2", 1), b2 = Ln("s2", 2), b3 = Ln("s2", 3);
    const LA = lab('<span class="n">38</span> 億<small>一年前</small>', "tag c", { pos: [P1.x - 4.5, 0, P1.z + 1], f: 0.9, upd: show(b1 + 0.5, b3 + 0.6) });
    const LB = lab('<span class="n">479</span> 億<small>現在・未上市股權</small>', "tag c", { pos: [P1.x + 9, 0, P1.z + 1], f: 0.9, upd: show(b2 + 0.4, S("s3") + 0.6) });
    const LX = lab('×12', "big c", { pos: [P1.x - 1, 0, P1.z + 4], f: 0.9, upd: slam(b2 + 1.3, S("s3") + 0.6) });
    const LC = lab('≈ <span class="n">1,000</span> 億<small>加上上市股票</small>', "tag w", { pos: [P1.x + 3.5, 0, P1.z + 1], f: 1.05, upd: show(b3 + 1.0, S("s3") + 0.6) });
    updaters.push((t) => {
      const a = pr(t, b1 + 0.2, 0.6, "power3.out") * hA;
      const b = lerp(0, hA, pr(t, b1 + 0.2, 0.6, "power3.out")) + (hB - hA) * pr(t, b2 + 0.2, 1.6, "power3.inOut");
      const c = hC * pr(t, b3 + 0.4, 1.3, "power3.inOut");
      colA.scale.set(3.6, Math.max(0.001, a), 3.6);
      colB.scale.set(3.6, Math.max(0.001, b), 3.6);
      colC.scale.set(3.6, Math.max(0.001, c), 3.6);
      colC.position.y = 0.5 + b;
      colA.visible = a > 0.01; colB.visible = b > 0.01; colC.visible = c > 0.01;
      LA.pos.y = 0.5 + a + 1.0;
      LB.pos.y = 0.5 + b - 3;
      LX.pos.y = 0.5 + hB * 0.62;
      LC.pos.y = 0.5 + b + c + 1.2;
    });
  }

  // ───────────────────────── data centers ─────────────────────────
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
    const racks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, 4.6, 1.3), std(0xffffff, { roughness: 0.4, metalness: 0.4, emissive: COL.green, emissiveIntensity: 0.0 }), n);
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / 6);
      const c = i % 6;
      dummy.position.set(-5 + c * 2, 2.8, -3.3 + r * 2.2); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      racks.setMatrixAt(i, dummy.matrix);
      racks.setColorAt(i, tmpC.set(0x2a332d));
    }
    racks.castShadow = true;
    g.add(racks);
    plinth(at, 9.5);
    return { g, racks, n };
  }
  // 02 · CoreWeave
  const DC2 = dataCenter(P2, Math.PI / 2, COL.ink);
  {
    const c0 = Ln("s3", 0), c1 = Ln("s3", 1), c2 = Ln("s3", 2);
    flow({ kind: "coin", from: V(0, 24, 0), to: V(P2.x, 8, P2.z), t0: c1 + 0.2, n: 14, gap: 0.1, T: 1.0, lift: 14, spread: 3 });
    flow({ kind: "coin", from: V(P2.x, 8, P2.z), to: V(0, 22, 0), t0: c2 - 0.6, n: 14, gap: 0.1, T: 1.0, lift: 10, spread: 3 });
    flow({ kind: "chip", from: V(0, 22, 0), to: V(P2.x, 4, P2.z), t0: c2 - 0.3, n: 24, gap: 0.09, T: 1.1, lift: 16, spread: 4 });
    lab("CoreWeave<small>雲端公司</small>", "tag w", { pos: [P2.x, 9, P2.z], upd: show(c0 + 0.9, S("s4") + 0.3) });
    lab('<span class="n">20</span> 億美元<small>輝達買下的股票</small>', "tag c", { pos: [P2.x * 0.5, 15, 0], upd: show(c1 + 1.0, c2 - 0.2) });
    lab("GPU：<b>100% 輝達</b>", "tag g", { pos: [P2.x, 14, P2.z], f: 1.05, upd: slam(c2 + 1.0, S("s4") + 0.3) });
    updaters.push((t) => {
      for (let i = 0; i < DC2.n; i++) {
        const k = pr(t, c2 - 0.2 + i * 0.09 + 1.0, 0.25);
        DC2.racks.setColorAt(i, tmpC.set(0x2a332d).lerp(c3(COL.green), k));
      }
      DC2.racks.instanceColor.needsUpdate = true;
      DC2.racks.material.emissiveIntensity = 0.35 * pr(t, c2 + 0.6, 1.0);
    });
  }
  // 03 · an AI cloud that NVIDIA rents back from, plus a richer outside buyer
  const DC3 = dataCenter(P3, 0, COL.ink);
  const buyer = new THREE.Group();
  {
    buyer.position.copy(BUYER);
    scene.add(buyer);
    const b = mesh(new THREE.BoxGeometry(6, 9, 6), std(0x141b17, { metalness: 0.5, roughness: 0.4 }), buyer, V(0, 4.5, 0));
    edges(b, COL.copper, 0.9);
    glow(COL.copper, 12, buyer, V(0, 10, 0)).material.opacity = 0.4;
    const d0 = Ln("s4", 0), d1 = Ln("s4", 1), d2 = Ln("s4", 2), d3 = Ln("s4", 3), d4 = Ln("s4", 4);
    flow({ kind: "chip", from: V(0, 22, 0), to: V(P3.x, 4, P3.z), t0: d0 + 0.8, n: 20, gap: 0.08, T: 1.0, lift: 14, spread: 4 });
    // compute flowing back to NVIDIA: the rent-back
    flow({ kind: "beam", from: V(P3.x, 7, P3.z), to: V(0, 20, 0), t0: d1 + 0.6, n: 60, gap: 0.09, T: 1.0, lift: 6, spread: 3, until: d3 + 0.4 });
    // a higher bidder pulls capacity away
    flow({ kind: "beam", from: V(P3.x, 7, P3.z), to: V(BUYER.x, 8, BUYER.z), t0: d3 + 0.2, n: 40, gap: 0.08, T: 0.9, lift: 5, spread: 2 });
    lab("AI 雲端業者", "tag w", { pos: [P3.x, 9, P3.z], upd: show(d0 + 1.0, S("s5") + 0.3) });
    lab('回租承諾 <span class="n">360</span> 億<small>輝達把算力租回來</small>', "tag g", { pos: [P3.x * 0.5 - 4, 17, P3.z * 0.5], upd: show(d2 + 0.2, S("s5") + 0.3) });
    const YRS = lab("<u></u><u></u><u></u><u></u><u></u><u></u>&nbsp;6 年", "years", { pos: [P3.x * 0.5 - 4, 12.5, P3.z * 0.5], upd: show(d2 + 1.2, S("s5") + 0.3) });
    const us = Array.from(YRS.el.querySelectorAll("u"));
    updaters.push((t) => us.forEach((u, i) => u.style.setProperty("--on", pr(t, d2 + 1.4 + i * 0.16, 0.2, "back.out(2)").toFixed(3))));
    lab("出價更高的客人", "tag c", { pos: [BUYER.x, 11, BUYER.z], upd: show(d3 + 0.3, S("s5") + 0.3) });
    updaters.push((t) => {
      const k = pop(t, d3 - 0.1, 0.6);
      buyer.scale.set(1, Math.max(0.001, k), 1);
      buyer.visible = k > 0.002;
      for (let i = 0; i < DC3.n; i++) {
        const lit = pr(t, d0 + 1.6 + i * 0.05, 0.25);
        DC3.racks.setColorAt(i, tmpC.set(0x2a332d).lerp(c3(COL.green), lit));
      }
      DC3.racks.instanceColor.needsUpdate = true;
      DC3.racks.material.emissiveIntensity = 0.3 * pr(t, d1, 1.0);
    });
    void d4;
  }

  // ───────────────────────── 04 · the guaranteed campus ─────────────────────────
  const campus = [];
  const dome = new THREE.Group();
  {
    plinth(P4, 13);
    for (let i = 0; i < 9; i++) {
      const r = Math.floor(i / 3) - 1;
      const c = (i % 3) - 1;
      const m = std(0x1a2420, { roughness: 0.45, metalness: 0.45 });
      const g = new THREE.BoxGeometry(4.8, 3.4, 4.8);
      g.translate(0, 1.7, 0);
      const b = mesh(g, m, scene, V(P4.x + c * 6.4, 0.5, P4.z + r * 6.4));
      const ed = edges(b, COL.copper, 0.9);
      const cap = mesh(new THREE.BoxGeometry(4.2, 0.12, 4.2), basic(COL.copper), b, V(0, 3.47, 0), false);
      campus.push({ b, ed, cap });
    }
    const R = 15;
    const fill = mesh(new THREE.SphereGeometry(R, 48, 24, 0, TAU, 0, Math.PI / 2), basic(COL.copper, { transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), dome, null, false);
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(R, 20, 8, 0, TAU, 0, Math.PI / 2)), new THREE.LineBasicMaterial({ color: COL.copper, transparent: true, opacity: 0.7 }));
    dome.add(wire);
    dome.position.set(P4.x, 0.5, P4.z);
    scene.add(dome);
    const e0 = Ln("s5", 0), e1 = Ln("s5", 1), e2 = Ln("s5", 2), e3 = Ln("s5", 3);
    const h2 = Ln("s8", 2);
    lab("OpenAI・俄亥俄州", "tag w", { pos: [P4.x, 10.5, P4.z], upd: show(e1 + 0.2, e2 + 0.2) });
    lab('<span class="n">4.25</span> GW・一租 <span class="n">20</span> 年', "tag w", { pos: [P4.x, 6.2, P4.z], f: 0.85, upd: show(e1 + 1.6, e2 + 0.2) });
    lab('擔保上限 <span class="n">1,050</span> 億', "tag c", { pos: [P4.x, 13, P4.z], f: 1.05, upd: showMany([[e2 + 0.55, S("s6") + 0.3], [h2 - 0.2, Ln("s8", 3, 0.3)]]) });
    lab("只能放輝達的設備", "tag g", { pos: [P4.x, 6.5, P4.z], upd: show(e3 + 0.9, S("s6") + 0.3) });
    lab('最快 <span class="n">2029</span> 生效<small>OpenAI 違約才會觸發</small>', "tag r", { pos: [P4.x, 6.5, P4.z], upd: show(h2 + 0.3, Ln("s8", 3, 0.3)) });
    updaters.push((t) => {
      campus.forEach((o, i) => {
        const k = pr(t, e1 + 0.1 + i * 0.16, 0.45, "back.out(1.6)");
        o.b.scale.set(1, Math.max(0.001, k), 1);
        o.b.visible = k > 0.002;
        const g = pr(t, e3 + 1.0 + i * 0.07, 0.3);
        o.cap.material.color.setHex(COL.copper).lerp(c3(COL.green), g);
        o.ed.material.color.setHex(COL.copper).lerp(c3(COL.green), g);
      });
      const drop = pr(t, e2 + 0.2, 0.5, "power4.in");
      const ghost = pr(t, h2 + 0.2, 0.6);
      dome.position.y = 0.5 + 40 * (1 - drop);
      dome.visible = drop > 0.001;
      fill.material.opacity = lerp(0.12, 0.03, ghost) * (1 + 1.5 * Math.exp(-Math.max(0, t - e2 - 0.7) * 4));
      wire.material.opacity = lerp(0.75, 0.2, ghost);
    });
    void e0;
  }

  // ───────────────────────── s7 · the profit pie above the tower ─────────────────────────
  const pie = new THREE.Group();
  {
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
    const g1 = Ln("s7", 1), g2 = Ln("s7", 2), g3 = Ln("s7", 3);
    lab('稅前獲利 <span class="n">1,414</span> 億<small>上半年</small>', "tag g", { pos: [0, 61.5, 0], upd: show(g1 + 0.2, g3 + 0.1) });
    // pie rotated about x by 90°: local (sin a, 0, cos a) maps to world (sin a, -cos a, 0)
    lab('投資收益 <span class="n">237</span> 億<small>≈ 1/6</small>', "tag c", { pos: [Math.sin(mid) * 15 + 2, 50 - Math.cos(mid) * 12, 3], upd: show(g2 + 0.6, S("s8") + 0.2) });
    lab("客戶估值 ↑　輝達帳面 ↑", "tag w", { pos: [0, 61.5, 0], f: 0.9, upd: show(g3 + 0.3, S("s8") + 0.2) });
    updaters.push((t) => {
      const k = pop(t, g1 - 0.1, 0.6) * (1 - pr(t, S("s8") + 0.1, 0.4));
      pie.scale.setScalar(Math.max(0.001, k));
      pie.visible = k > 0.002;
      pie.rotation.y = 0.25 * Math.sin(t * 0.6);
      const out = pr(t, g2 + 0.4, 0.5, "back.out(2)") * 3.2;
      cut.position.set(Math.sin(mid) * out, 0, Math.cos(mid) * out);
      cut.material.emissiveIntensity = 0.8 + 0.8 * win(t, g3, S("s8"), 0.3) * (0.5 + 0.5 * Math.sin(t * 7));
    });
  }

  // ───────────────────────── s8 · real sales and the power grab ─────────────────────────
  {
    const h3 = Ln("s8", 3), h4 = Ln("s8", 4);
    const box = new THREE.BoxGeometry(5, 1, 5);
    box.translate(0, 0.5, 0);
    const col = mesh(box, std(COL.green, { emissive: COL.greenD, emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.4 }), scene, V(OPI.x, 0.1, OPI.z));
    edges(col, 0xe2ffa8, 0.8);
    const hOp = 637 * U; // same scale as the equity columns
    const L = lab('營業利益 <span class="n">637</span> 億<small>一季・實打實賣出去</small>', "tag g", { pos: [OPI.x, 0, OPI.z], upd: show(h3 + 0.9, S("s9") + 0.4) });
    updaters.push((t) => {
      const k = pr(t, h3 + 0.2, 1.4, "power3.out") * (1 - pr(t, S("s9") + 0.2, 0.6));
      col.scale.y = Math.max(0.001, k * hOp);
      col.visible = k > 0.002;
      L.pos.y = k * hOp + 1.4;
    });
    // pylons carrying power into the campus
    const pyl = [];
    const wireMat = basic(COL.cyan, { transparent: true, opacity: 0 });
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const u = i / 5;
      const x = lerp(-122, -56, u);
      const z = lerp(-44, -5, u);
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = Math.atan2(39, 66) + Math.PI / 2;
      scene.add(g);
      const m = std(0x8d978d, { metalness: 0.8, roughness: 0.35 });
      mesh(new THREE.BoxGeometry(0.5, 14, 0.5), m, g, V(0, 7, 0));
      mesh(new THREE.BoxGeometry(6, 0.35, 0.35), m, g, V(0, 13, 0));
      mesh(new THREE.BoxGeometry(4, 0.3, 0.3), m, g, V(0, 10.5, 0));
      pyl.push(g);
      pts.push(V(x, 13, z));
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const curve = new THREE.QuadraticBezierCurve3(a, V((a.x + b.x) / 2, a.y - 2, (a.z + b.z) / 2), b);
      mesh(new THREE.TubeGeometry(curve, 16, 0.12, 6, false), wireMat, scene, null, false);
    }
    lab("電・地・機房　＝　產能", "tag w", { pos: [-74, 21, -18], f: 0.95, upd: show(h4 + 0.8, S("s9") + 0.5) });
    updaters.push((t) => {
      pyl.forEach((g, i) => {
        const k = pr(t, h4 - 0.3 + i * 0.12, 0.45, "back.out(1.7)");
        g.scale.set(1, Math.max(0.001, k), 1);
        g.visible = k > 0.002;
      });
      wireMat.opacity = 0.9 * pr(t, h4 + 0.6, 0.5) * (0.75 + 0.25 * Math.sin(t * 9));
    });
    flow({ kind: "beam", from: V(-122, 13, -44), to: V(-48, 4, -3), t0: h4 + 0.8, n: 30, gap: 0.1, T: 1.2, lift: 1, spread: 1 });
  }

  // ───────────────────────── s6 · the developer analogy ─────────────────────────
  {
    const f0 = Ln("s6", 0), f1 = Ln("s6", 1), f2 = Ln("s6", 2), f3 = Ln("s6", 3), f4 = Ln("s6", 4);
    lab("入股你<small>投資客戶</small>", "term", { pos: [P1.x, 13, P1.z - 4], upd: show(f1 + 0.1, f4 - 0.1) });
    lab("買房<small>買 GPU</small>", "term g", { pos: [30, 4, 9], upd: show(f1 + 1.4, f4 - 0.1) });
    lab("包租<small>回租承諾</small>", "term", { pos: [P3.x, 13, P3.z + 6], upd: show(f2 + 0.2, f4 - 0.1) });
    lab("保證人<small>擔保</small>", "term", { pos: [-30, 4, 9], upd: show(f3 + 0.2, f4 - 0.1) });
    void f0; void f4;
  }

  // ───────────────────────── camera: one take ─────────────────────────
  const K = [];
  const key = (t, p, l, e = "io", fov = 42, via) => K.push({ t, p: V(...p), l: V(...l), e, fov, via: via ? V(...via) : null });
  (function () {
    const a2 = Ln("s1", 2), a4 = Ln("s1", 4);
    key(0, [0, 16, 96], [0, 15, 0], "lin", 46);
    key(a2, [5, 15, 72], [0, 16, 0], "io", 44);
    key(a4 + 0.15, [7, 15, 64], [0, 15, 0], "lin", 44);
    key(a4 + 2.4, [0, 255, 112], [0, 0, -22], "io", 42);
    key(S("s2") - 0.15, [4, 258, 110], [0, 0, -22], "lin");
    const b0 = Ln("s2", 0), b1 = Ln("s2", 1), b2 = Ln("s2", 2), b3 = Ln("s2", 3);
    key(b0 + 1.1, [22, 10, 74], [0, 5, 40], "io", 42, [40, 60, 130]);
    key(b1 + 1.4, [20, 9, 72], [0, 4.5, 40], "lin");
    key(b2 + 1.0, [25, 19, 84], [0, 13, 40], "io");
    key(b3 - 0.1, [24, 20, 83], [0, 14, 40], "lin");
    key(b3 + 1.5, [44, 48, 146], [0, 29, 40], "io");
    key(S("s3") - 0.1, [43, 49, 144], [0, 29, 40], "lin");
    const c0 = Ln("s3", 0), c1 = Ln("s3", 1), c2 = Ln("s3", 2);
    key(c0 + 1.0, [64, 27, 64], [28, 9, 0], "io", 42, [70, 50, 100]);
    key(c1 + 0.3, [62, 26, 62], [29, 9, 0], "lin");
    key(c2 + 0.1, [70, 21, 40], [38, 6, 0], "io");
    key(S("s4") - 0.1, [69, 21, 38], [39, 6, 0], "lin");
    const d0 = Ln("s4", 0), d1 = Ln("s4", 1), d2 = Ln("s4", 2), d3 = Ln("s4", 3), d4 = Ln("s4", 4);
    key(d0 + 1.1, [6, 30, -96], [0, 9, -22], "io", 44, [70, 45, -70]);
    key(d1 + 0.4, [6, 31, -98], [0, 9, -22], "lin");
    key(d2 + 0.4, [2, 26, -92], [0, 9, -24], "io");
    key(d3 - 0.2, [2, 27, -94], [0, 9, -24], "lin");
    key(d3 + 1.0, [-4, 38, -116], [-4, 11, -40], "io");
    key(d4 + 1.3, [-4, 39, -118], [-4, 11, -40], "lin");
    const e1 = Ln("s5", 1), e2 = Ln("s5", 2), e3 = Ln("s5", 3);
    key(S("s5") + 1.2, [-76, 20, 34], [-40, 4, 0], "io", 42, [-60, 60, -80]);
    key(e1 + 0.3, [-74, 19, 32], [-40, 4, 0], "lin");
    key(e2 - 0.1, [-84, 32, 46], [-40, 8, 0], "io");
    key(e3 + 0.2, [-82, 30, 43], [-40, 7, 0], "lin");
    key(e3 + 2.0, [-72, 21, 31], [-40, 5, 0], "io");
    key(S("s6") - 0.1, [-71, 21, 30], [-40, 5, 0], "lin");
    const f4 = Ln("s6", 4);
    key(Ln("s6", 0, 1.3), [0, 240, 72], [0, 0, 4], "io", 42);
    key(f4, [6, 236, 64], [0, 0, 4], "lin");
    key(S("s7") - 0.1, [8, 234, 62], [0, 0, 4], "lin");
    const g0 = Ln("s7", 0), g2 = Ln("s7", 2);
    key(g0 + 1.1, [-32, 56, 78], [0, 49, 0], "io", 42);
    key(g2 - 0.2, [-29, 55, 76], [0, 49, 0], "lin");
    key(g2 + 0.9, [-24, 54, 72], [2, 48, 0], "io");
    key(S("s8") - 0.1, [-23, 54, 71], [2, 48, 0], "lin");
    const h1 = Ln("s8", 1), h2 = Ln("s8", 2), h3 = Ln("s8", 3), h4 = Ln("s8", 4);
    key(h1 + 0.3, [-74, 22, 32], [-40, 5, 0], "io", 42, [-20, 80, 70]);
    key(h2 + 3.0, [-72, 21, 30], [-40, 5, 0], "lin");
    key(h3 + 0.7, [62, 32, 88], [8, 18, 6], "io", 42, [-10, 60, 80]);
    key(h4 - 0.1, [60, 33, 86], [8, 18, 6], "lin");
    key(h4 + 1.4, [-62, 82, 140], [-62, 4, -16], "io", 44);
    key(S("s9") - 0.1, [-63, 83, 138], [-62, 4, -16], "lin");
    const i0 = Ln("s9", 0), i2 = Ln("s9", 2);
    key(i0 + 1.4, [60, 150, 150], [0, 0, 0], "io", 42);
    key(i2, [88, 142, 124], [0, 0, 0], "lin");
    key(TM.total + 0.2, [112, 132, 92], [0, 0, 0], "lin");
  })();
  const shakes = [[Ln("s1", 2, 0.5), 0.3], [Ln("s1", 4, 1.25), 0.25], [Ln("s5", 2, 0.7), 0.45], [Ln("s8", 0, 0.1), 0.55]];
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

  // ───────────────────────── atmosphere over time ─────────────────────────
  const cHor = [c3(0x21150d), c3(0x3a100b)];
  const cGlow = [c3(0x5e3418), c3(0x8a2616)];
  const cMid = [c3(0x123a30), c3(0x2c0e0c)];
  const cFog = [c3(0x21150d), c3(0x3a100b)];
  const cSun = [c3(0xffc79a), c3(0xff7a5c)];
  function atmosphere(t) {
    const red = pr(t, S("s8"), 0.4) - pr(t, Ln("s8", 3) - 0.2, 1.6);
    sky.material.uniforms.cHor.value.copy(cHor[0]).lerp(cHor[1], red);
    sky.material.uniforms.cGlow.value.copy(cGlow[0]).lerp(cGlow[1], red);
    sky.material.uniforms.cMid.value.copy(cMid[0]).lerp(cMid[1], red);
    scene.fog.color.copy(cFog[0]).lerp(cFog[1], red);
    sun.color.copy(cSun[0]).lerp(cSun[1], red);
    // thinner fog on the high shots so the whole loop reads
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
  const clock = { t: 0 };
  tl.fromTo(clock, { t: 0 }, { t: TM.total, duration: TM.total, ease: "none", onUpdate: () => render(clock.t) }, 0);

  // HUD
  const kick = [null, ["01", "投資自己的客戶"], ["02", "客戶拿錢買 GPU"], ["03", "租不出去，輝達租回來"], ["04", "替客戶作保"], ["比喻", "建商的一條龍"], ["證據", "財報上的痕跡"], ["反方", "這不是作假帳"], ["結論", "盯住這三個數字"]];
  TM.scenes.forEach((s, i) => {
    const u = h("u", "", h("i", "", $("#prog")));
    F(u, { scaleX: 0 }, { scaleX: 1, duration: s.end - s.start, ease: "none" }, s.start);
    if (!kick[i]) return;
    const k = h("div", "", $("#kicker"), `<b${i === 7 ? ' style="background:var(--red)"' : i === 5 ? ' style="background:var(--copper)"' : ""}>${kick[i][0]}</b>${kick[i][1]}`);
    F(k, { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, s.start + 0.5);
    tl.to(k, { opacity: 0, x: 40, duration: 0.25, ease: "power2.in" }, s.end + 0.15);
    tl.set(k, { visibility: "hidden" }, s.end + 0.42);
  });
  F("#hud", { y: -60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.25);

  // S1: the hook
  (function () {
    const a0 = Ln("s1", 0), a1 = Ln("s1", 1), a2 = Ln("s1", 2), a3 = Ln("s1", 3), a4 = Ln("s1", 4);
    F("#s1-a .l1", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, a0 - 0.1);
    F("#s1-a .l2", { scale: 1.8, opacity: 0, filter: "blur(14px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.32, ease: "expo.out" }, a0 + 0.35);
    const num = { v: 0 };
    F(num, { v: 0 }, { v: 600, duration: 0.9, ease: "power3.out", onUpdate: () => ($("#s1-num").textContent = Math.round(num.v)) }, a0 + 0.35);
    F("#s1-b", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, a1 - 0.05);
    tl.to("#s1-b i", { rotation: 14, duration: 0.22, repeat: 5, yoyo: true, ease: "sine.inOut" }, a1 + 1.2);
    tl.to("#s1-a, #s1-b", { y: -120, opacity: 0, filter: "blur(10px)", duration: 0.25, ease: "power2.in" }, a2 - 0.25);
    tl.set("#s1-a, #s1-b", { visibility: "hidden" }, a2);
    F("#s1-c small", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" }, a2 - 0.05);
    F("#s1-c b", { scale: 2.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.24, ease: "power4.out" }, a2 + 0.45);
    F("#s1-c span", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" }, a2 + 0.7);
    tl.to("#s1-c", { scale: 0.7, y: -260, opacity: 0, duration: 0.35, ease: "power3.in" }, a3 - 0.2);
    tl.set("#s1-c", { visibility: "hidden" }, a3 + 0.2);
    F("#s1-d .lose", { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, a3 + 0.2);
    F("#s1-d .win", { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2.4)" }, a4 + 1.25);
    tl.to("#s1-d", { opacity: 0, y: 40, duration: 0.25, ease: "power2.in" }, S("s2") - 0.25);
    tl.set("#s1-d", { visibility: "hidden" }, S("s2"));
  })();
  (function () {
    const a = Ln("s4", 4) + 0.3;
    F("#ov-stamp4", { scale: 2.4, opacity: 0, rotation: -20 }, { scale: 1, opacity: 1, rotation: -5, duration: 0.24, ease: "power4.out" }, a);
    tl.to("#ov-stamp4", { opacity: 0, scale: 0.8, duration: 0.25, ease: "power2.in" }, S("s5") + 0.1);
    tl.set("#ov-stamp4", { visibility: "hidden" }, S("s5") + 0.36);
  })();
  (function () {
    const a = Ln("s6", 4);
    F("#s6-end", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, a + 0.1);
    tl.to("#s6-end", { opacity: 0, y: -40, duration: 0.25, ease: "power2.in" }, S("s7") - 0.2);
    tl.set("#s6-end", { visibility: "hidden" }, S("s7") + 0.05);
  })();
  (function () {
    const T = S("s8");
    F("#flash", { opacity: 0 }, { opacity: 0.85, duration: 0.07, ease: "power2.in" }, T - 0.07);
    tl.to("#flash", { opacity: 0, duration: 0.5, ease: "power2.out" }, T);
    F("#s8-slap", { scale: 1.7, opacity: 0, rotation: -6 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.24, ease: "power4.out" }, T + 0.02);
    tl.to("#s8-slap", { y: -300, scale: 0.5, opacity: 0, duration: 0.3, ease: "power3.in" }, Ln("s8", 1) + 0.4);
    tl.set("#s8-slap", { visibility: "hidden" }, Ln("s8", 1) + 0.75);
  })();
  (function () {
    const i2 = Ln("s9", 2), i3 = Ln("s9", 3), i4 = Ln("s9", 4);
    F("#s9-a .l1", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" }, i2);
    F("#s9-a .l2", { scale: 1.3, opacity: 0, filter: "blur(12px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.4, ease: "expo.out" }, i3);
    tl.to("#s9-a", { opacity: 0, y: -60, duration: 0.3, ease: "power2.in" }, i4 - 0.35);
    tl.set("#s9-a", { visibility: "hidden" }, i4 - 0.04);
    F("#s9-cta .head", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, i4 - 0.1);
    F("#s9-cta .row", { x: -120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)", stagger: 0.22 }, i4 + 0.25);
    F("#s9-cta .foot", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.out" }, i4 + 1.2);
  })();

  // captions
  (function () {
    const box = $("#caps");
    const colour = (s) =>
      s.replace(/輝達|建商|OpenAI|CoreWeave|GPU|[\d.,]+ ?(億美元|億|GW|年|倍以上)|1\/6|一個圓|保證人|擔保|包租|作假帳|股權投資|回租承諾|擔保總額/g, (m) => {
        const cls = /輝達|GPU|一個圓/.test(m) ? "g" : /作假帳/.test(m) ? "r" : "c";
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
