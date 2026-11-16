/* 沒有黃仁勳的輝達 — v2: one continuous 3D take.
   Everything in the world is a pure function of time t, so any frame can be seeked. */
(function () {
  const TM = window.TIMING;
  const SC = {};
  TM.scenes.forEach((s) => (SC[s.id] = s));
  const Ln = (sid, i, off = 0) => SC[sid].lines[i].start + off;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
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
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  let seed = 1116;
  const rnd = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const COL = { green: 0x9be000, greenD: 0x3d5c00, copper: 0xf5a552, copperD: 0xb5622a, red: 0xff5a45, ink: 0xf2f4ea, bg: 0x050807 };
  const c3 = (hex) => new THREE.Color(hex);

  // ───────────────────────── renderer / world ─────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas: $("#gl"), antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  const FOG = c3(0x21150d);
  scene.fog = new THREE.FogExp2(FOG.getHex(), 0.011);
  const cam = new THREE.PerspectiveCamera(42, W / H, 0.3, 2400);

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
      const a = rnd() * Math.PI * 2;
      const e = 0.08 + rnd() * 1.4;
      p[i * 3] = Math.cos(a) * Math.cos(e) * 1500; p[i * 3 + 1] = Math.sin(e) * 1500; p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 1500;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    sky.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe0d0, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.7, fog: false, depthWrite: false })));
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: 0x0b120e, roughness: 0.88, metalness: 0.05 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(3000, 300, 0x35501f, 0x24361a);
  grid.position.set(200, 0.03, 0);
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);

  {
    const P = [];
    const keep = [[0, 0, 15], [70, -10, 27], [150, 0, 45], [240, -10, 21], [282, -10, 15], [326, -20, 11], [334, 8, 9]];
    while (P.length < 1100) {
      const x = -80 + rnd() * 412;
      const z = -270 + rnd() * 410;
      if (keep.some((k) => Math.hypot(x - k[0], z - k[1]) < k[2])) continue;
      const fx = (((x - 240) % 36) + 54) % 36 - 18;
      const fz = (((z + 10) % 36) + 54) % 36 - 18;
      if (Math.hypot(fx, fz) < 15) continue;
      P.push([x, z, 0.5 + rnd() * rnd() * 4.5, rnd()]);
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff }), P.length);
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
  const hemi = new THREE.HemisphereLight(0x9cc0aa, 0x0b0f0c, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc79a, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  // soft glow sprite (no font needed)
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
  const setI = (im, i, x, y, z, s = 1, ry = 0) => {
    dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  };
  const tmpC = new THREE.Color();

  // ───────────────────────── labels inside the world ─────────────────────────
  const labelLayer = $("#labels");
  const labels = [];
  const sAt = (d) => d * 0.0004; // world units per css px so the label reads 1:1 at distance d (fov 42)
  function lab(html, cls, o) {
    const el = h("div", "w3 " + (cls || ""), labelLayer, html);
    if (o.size) el.style.fontSize = o.size + "px";
    const L = { el, pos: V(...o.pos), rot: new THREE.Euler(...(o.rot || [0, 0, 0])), s: o.s || 0.02, bill: !!o.bill, o: 0, k: 1, upd: o.upd, vis: false, anchor: o.anchor || "c" };
    labels.push(L);
    return L;
  }
  // standard visibility: pop in at a, fade out at b
  const show = (a, b = 1e9, popIn = true) => (t, L) => {
    L.o = pr(t, a, 0.22) * (1 - pr(t, b, 0.22));
    L.k = popIn ? 0.55 + 0.45 * pop(t, a, 0.5) : 1;
  };
  const slam = (a, b = 1e9) => (t, L) => {
    L.o = pr(t, a, 0.1) * (1 - pr(t, b, 0.2));
    L.k = lerp(2.4, 1, pr(t, a, 0.22, "power4.out"));
  };
  const mS = new THREE.Matrix4().set(W / 2, 0, 0, W / 2, 0, -H / 2, 0, H / 2, 0, 0, 1, 0, 0, 0, 0, 1);
  const mF = new THREE.Matrix4();
  const mM = new THREE.Matrix4();
  const mT = new THREE.Matrix4();
  const qL = new THREE.Quaternion();
  const vS = new THREE.Vector3();
  const vP = new THREE.Vector3();
  function placeLabels(t) {
    for (const L of labels) {
      if (L.upd) L.upd(t, L);
      vP.copy(L.pos).applyMatrix4(cam.matrixWorldInverse);
      if (L.o <= 0.004 || vP.z > -1.0) {
        if (L.vis) { L.el.style.visibility = "hidden"; L.vis = false; }
        continue;
      }
      const w = L.el.offsetWidth;
      const hh = L.el.offsetHeight;
      if (L.bill) qL.copy(cam.quaternion); else qL.setFromEuler(L.rot);
      const s = L.s * L.k;
      mM.compose(L.pos, qL, vS.set(s, s, s));
      mF.set(1, 0, 0, -w / 2, 0, -1, 0, L.anchor === "b" ? hh : hh / 2, 0, 0, 1, 0, 0, 0, 0, 1);
      mT.copy(mS).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse).multiply(mM).multiply(mF);
      L.el.style.transform = "matrix3d(" + mT.elements.map((v) => +v.toPrecision(9)).join(",") + ")";
      L.el.style.opacity = L.o.toFixed(3);
      if (!L.vis) { L.el.style.visibility = "visible"; L.vis = true; }
    }
  }

  const updaters = []; // each station registers a function of t
  const A = V(0, 0, 0);
  const B = V(70, 0, -10);
  const C = V(150, 0, 0);
  const E = V(240, 0, -10);
  const R = V(282, 0, -10);
  const G = V(326, 0, -20); // second stage, in front of the wall
  const WALLX = 340;
  const beacon = (at, color, t0, t1) => {
    const m = mesh(new THREE.CylinderGeometry(0.32, 0.32, 170, 12, 1, true), basic(color, { transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), scene, V(at.x, 85, at.z), false);
    const halo = glow(color, 16, scene, V(at.x, 3, at.z));
    halo.material.fog = false;
    updaters.push((t) => {
      const k = pr(t, t0, 0.5) * (1 - pr(t, t1, 0.9));
      m.material.opacity = 0.2 * k;
      halo.material.opacity = 0.3 * k;
      m.visible = halo.visible = k > 0.004;
    });
  };
  beacon(B, 0x3aa7c2, Ln("s1", 3), SC.s2.start + 0.5);
  beacon(C, COL.green, Ln("s2", 4), Ln("s3", 1) - 1.3);
  beacon(E, COL.green, Ln("s4", 4), Ln("s5", 0) - 0.1);
  beacon(G, COL.copper, Ln("s6", 6), SC.s7.start + 0.7);

  // ───────────────────────── stage + hanger + jacket ─────────────────────────
  function makeStage(at, withJacket) {
    const g = new THREE.Group();
    g.position.copy(at);
    scene.add(g);
    mesh(new THREE.CylinderGeometry(5, 5.5, 0.4, 64), std(0x121a15, { roughness: 0.35, metalness: 0.4 }), g, V(0, 0.2, 0));
    mesh(new THREE.TorusGeometry(5.05, 0.05, 8, 96), basic(0xdfe6d8), g, V(0, 0.42, 0), false).rotation.x = Math.PI / 2;
    const cone = mesh(new THREE.ConeGeometry(6.2, 19, 48, 1, true), basic(0xfff3d6, { transparent: true, opacity: 0.085, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }), g, V(0, 9.9, 0), false);
    const pool = glow(0xfff0d0, 13, g, V(0, 0.6, 0));
    pool.material.opacity = 0.35;
    const spot = new THREE.SpotLight(0xfff1d8, 900, 60, 0.36, 0.7, 1.6);
    spot.position.set(0, 19, 2.5);
    spot.target.position.set(0, 3, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    g.add(spot, spot.target);
    const rim = new THREE.PointLight(COL.green, 260, 40, 2);
    rim.position.set(-6, 5, -5);
    g.add(rim);
    const rim2 = new THREE.PointLight(COL.copper, 200, 40, 2);
    rim2.position.set(7, 4, -4);
    g.add(rim2);
    // hanger: pivot at the hook
    const piv = new THREE.Group();
    piv.position.set(0, 7.6, 0);
    g.add(piv);
    const metal = std(0xdfe6d8, { roughness: 0.25, metalness: 0.85 });
    const hook = mesh(new THREE.TorusGeometry(0.26, 0.045, 10, 28, Math.PI * 1.45), metal, piv, V(0, 0.2, 0));
    hook.rotation.z = -Math.PI * 0.2;
    mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8), metal, piv, V(0, -0.3, 0));
    const arm = (sx) => {
      const m = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.86, 8), metal, piv, V(sx * 0.82, -0.9, 0));
      m.rotation.z = sx * 1.12;
    };
    arm(1); arm(-1);
    const bar = mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.36, 8), metal, piv, V(0, -1.26, 0));
    bar.rotation.z = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 12, 6), basic(0x8a968c), g, V(0, 13.9, 0), false);
    const out = { g, piv, cone, spot, pool, rim, rim2 };
    if (withJacket) {
      const k = 0.0085;
      const P = (x, y) => new THREE.Vector2((x - 260) * k, -(y - 46) * k);
      const shape = (pts) => new THREE.Shape(pts.map((p) => P(p[0], p[1])));
      const ex = (pts, depth, mat, z) => {
        const geo = new THREE.ExtrudeGeometry(shape(pts), { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3 });
        const m = mesh(geo, mat, jk);
        m.position.z = z;
        return m;
      };
      const jk = new THREE.Group();
      piv.add(jk);
      const leather = new THREE.MeshPhysicalMaterial({ color: 0x0b0d0c, roughness: 0.34, metalness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.3 });
      const leather2 = new THREE.MeshPhysicalMaterial({ color: 0x151917, roughness: 0.3, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.25 });
      ex([[150, 168], [206, 150], [260, 236], [314, 150], [370, 168], [386, 300], [378, 596], [142, 596], [134, 300]], 0.5, leather, -0.25);
      ex([[150, 168], [92, 198], [34, 470], [104, 494], [160, 300]], 0.4, leather, -0.2);
      ex([[370, 168], [428, 198], [486, 470], [416, 494], [360, 300]], 0.4, leather, -0.2);
      ex([[206, 150], [260, 236], [212, 336], [166, 214]], 0.1, leather2, 0.3);
      ex([[314, 150], [260, 236], [332, 356], [356, 214]], 0.1, leather2, 0.3);
      ex([[142, 546], [378, 546], [378, 596], [142, 596]], 0.08, leather2, 0.3);
      const zip = mesh(new THREE.BoxGeometry(0.06, 3.05, 0.04), metal, jk, V(0.26, -3.16, 0.33));
      zip.rotation.z = 0.165;
      mesh(new THREE.BoxGeometry(0.5, 0.36, 0.06), metal, jk, V(0, -4.46, 0.42));
      [[166, 404, 226, 388], [294, 426, 352, 410]].forEach((s) => {
        const a = P(s[0], s[1]);
        const b = P(s[2], s[3]);
        const m = mesh(new THREE.BoxGeometry(a.distanceTo(b), 0.05, 0.04), metal, jk, V((a.x + b.x) / 2, (a.y + b.y) / 2, 0.33));
        m.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
      });
      [[184, 224], [340, 226], [110, 210], [410, 210]].forEach((s) => { const a = P(s[0], s[1]); mesh(new THREE.SphereGeometry(0.05, 10, 8), metal, jk, V(a.x, a.y, 0.42)); });
      out.jk = jk;
    }
    return out;
  }

  // ═════════ A · the empty hanger ═════════
  (function () {
    const st = makeStage(A, true);
    const t1 = Ln("s1", 1);
    const t2 = Ln("s1", 2);
    const t4 = Ln("s1", 4);
    // the obvious answer, hung where the jacket was
    const plate = new THREE.Group();
    st.piv.add(plate);
    const board = mesh(new THREE.BoxGeometry(4.5, 2.3, 0.22), std(0x121c10, { roughness: 0.4, emissive: 0x1c3300, emissiveIntensity: 0.6 }), plate, V(0, -3.1, 0));
    edges(board, COL.green);
    const chainM = std(0x9aa59c, { metalness: 0.8, roughness: 0.3 });
    const ch1 = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 6), chainM, plate, V(-1.5, -1.6, 0));
    const ch2 = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 6), chainM, plate, V(1.5, -1.6, 0));
    const strike = mesh(new THREE.BoxGeometry(4.3, 0.16, 0.06), basic(COL.copper), plate, V(0, -3.2, 0.16), false);
    strike.rotation.z = 0.12;
    const cuda = lab('<small class="mute" style="font-size:44px;letter-spacing:.14em">多數人的答案</small>CUDA', "num glow-g", { pos: [0, 0, 0], s: 0.0052, size: 300, upd: null });
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    updaters.push((t) => {
      // jacket is yanked away
      const up = pr(t, t1 + 0.08, 0.42, "power3.in");
      st.jk.position.y = up * 46;
      st.jk.rotation.z = up * -0.5;
      st.jk.visible = up < 1;
      // hanger swings, damped
      const dt = t - (t1 + 0.42);
      let sw = dt > 0 ? 0.24 * Math.exp(-dt * 1.3) * Math.sin(dt * 7.5) : 0;
      // plate drops in, bounces, then loses one chain
      const drop = pr(t, t2 + 0.25, 0.75, "bounce.out");
      plate.visible = t > t2 + 0.25;
      plate.position.y = (1 - drop) * 14;
      const d2 = t - (t2 + 0.75);
      if (d2 > 0) sw += 0.05 * Math.exp(-d2 * 2) * Math.sin(d2 * 9);
      const brk = pr(t, t4 + 0.3, 0.7, "elastic.out(1, 0.4)");
      plate.rotation.z = brk * 0.16;
      ch2.visible = t < t4 + 0.3;
      strike.scale.x = Math.max(0.001, pr(t, t4 + 0.2, 0.22, "power4.out"));
      strike.visible = t > t4 + 0.2;
      board.material.emissiveIntensity = lerp(0.6, 0.15, pr(t, t4 + 0.26, 0.3));
      st.piv.rotation.z = sw;
      // flicker when the jacket goes
      const fl = t > t1 + 0.4 && t < t1 + 0.8 ? (Math.sin(t * 90) > 0 ? 0.35 : 1) : 1;
      st.spot.intensity = 900 * fl * pr(t, 0.02, 0.12);
      st.cone.material.opacity = 0.085 * fl;
      // label rides the plate
      board.updateWorldMatrix(true, false);
      board.matrixWorld.decompose(wp, wq, vS);
      cuda.pos.copy(wp).add(V(0, 0, 0.14).applyQuaternion(wq));
      cuda.rot.setFromQuaternion(wq);
      cuda.o = plate.visible && t < SC.s2.start + 0.9 ? lerp(1, 0.45, pr(t, t4 + 0.26, 0.3)) : 0;
    });
  })();

  // ═════════ B · the CUDA moat ═════════
  (function () {
    const g = new THREE.Group();
    g.position.copy(B);
    scene.add(g);
    const t1 = Ln("s2", 1);
    const t2 = Ln("s2", 2);
    const t3 = Ln("s2", 3);
    const t4 = Ln("s2", 4);
    const stone = std(0x1b2a19, { roughness: 0.75 });
    const stone2 = std(0x223420, { roughness: 0.7 });
    const RIM0 = 15;
    const water = mesh(new THREE.CircleGeometry(RIM0, 96), std(0x0d4a5c, { roughness: 0.15, metalness: 0.4, emissive: 0x1787a5, emissiveIntensity: 0.9 }), g, V(0, 0.05, 0), false);
    water.rotation.x = -Math.PI / 2;
    const rimLine = mesh(new THREE.TorusGeometry(RIM0, 0.09, 8, 128), basic(0x3aa7c2), g, V(0, 0.1, 0), false);
    rimLine.rotation.x = Math.PI / 2;
    const ripples = [0, 1, 2].map(() => {
      const r = mesh(new THREE.RingGeometry(0.985, 1, 96), basic(0x6fc4d8, { transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }), g, V(0, 0.08, 0), false);
      r.rotation.x = -Math.PI / 2;
      return r;
    });
    mesh(new THREE.CylinderGeometry(7, 7.4, 0.5, 64), stone, g, V(0, 0.25, 0));
    const keep = mesh(new THREE.BoxGeometry(5.2, 8, 5.2), stone2, g, V(0, 4.5, 0));
    edges(keep, COL.green, 0.9);
    for (let i = 0; i < 4; i++) for (let k = -1; k <= 1; k++) {
      const a = (i * Math.PI) / 2;
      mesh(new THREE.BoxGeometry(1, 0.9, 1), stone2, g, V(Math.cos(a) * 2.1 - Math.sin(a) * k * 2.1, 8.95, Math.sin(a) * 2.1 + Math.cos(a) * k * 2.1));
    }
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const tw = mesh(new THREE.CylinderGeometry(1.25, 1.4, 6.6, 20), stone, g, V(sx * 4.4, 3.8, sz * 4.4));
      mesh(new THREE.CylinderGeometry(1.55, 1.25, 0.6, 20), stone2, g, V(sx * 4.4, 7.4, sz * 4.4));
      mesh(new THREE.ConeGeometry(1.5, 2.2, 20), std(0x2f4a16, { roughness: 0.5, emissive: 0x1c3300, emissiveIntensity: 0.5 }), g, V(sx * 4.4, 8.8, sz * 4.4));
      void tw;
    });
    [[0, 4.4, 8.8, 0.7], [0, -4.4, 8.8, 0.7], [4.4, 0, 0.7, 8.8], [-4.4, 0, 0.7, 8.8]].forEach(([x, z, w, d]) => mesh(new THREE.BoxGeometry(w, 4.2, d), stone, g, V(x, 2.6, z)));
    const winM = basic(0xcfff5a);
    [[-1.3, 6.4], [1.3, 6.4], [-1.3, 4.2], [1.3, 4.2], [0, 2.3]].forEach(([x, y], i) => mesh(new THREE.BoxGeometry(i === 4 ? 1.4 : 0.6, i === 4 ? 2.2 : 1.0, 0.08), winM, g, V(x, y, 2.63), false));
    [[-4.4, 4.4], [4.4, 4.4]].forEach(([x, z]) => [5.6, 3.4].forEach((y) => mesh(new THREE.BoxGeometry(0.4, 0.8, 0.08), winM, g, V(x, y, z + 1.33), false)));
    const keyL = new THREE.PointLight(COL.green, 0, 70, 2);
    keyL.position.set(-6, 12, 12);
    g.add(keyL);
    glow(COL.green, 26, g, V(0, 6, -2)).material.opacity = 0.16;
    // rivals lined up on the bank
    const pawnM = std(0xb23324, { roughness: 0.4, emissive: 0x6a140c, emissiveIntensity: 0.9 });
    const pawns = [];
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Group();
      mesh(new THREE.CylinderGeometry(0.34, 0.6, 1.5, 14), pawnM, p, V(0, 0.75, 0));
      mesh(new THREE.SphereGeometry(0.44, 16, 12), pawnM, p, V(0, 1.85, 0));
      g.add(p);
      pawns.push({ p, a: Math.PI / 2 + (i - 3) * 0.17 });
    }
    // the AI that writes kernels
    const ai = new THREE.Group();
    ai.position.set(8.5, 7.4, 13);
    g.add(ai);
    const aiBox = mesh(new THREE.BoxGeometry(2.3, 2.3, 2.3), std(0xf2f4ea, { roughness: 0.25, emissive: 0xf2f4ea, emissiveIntensity: 0.55 }), ai);
    glow(0xffffff, 9, ai).material.opacity = 0.5;
    const aiL = new THREE.PointLight(0xffffff, 0, 40, 2);
    ai.add(aiL);
    const names = ["matmul", "conv2d", "softmax", "attention", "layernorm"];
    const step = (t4 - t2 - 0.9) / names.length;
    const blocks = names.map((n, k) => {
      const b = mesh(new THREE.BoxGeometry(2.6, 0.5, 1.0), std(0x1c3300, { emissive: COL.green, emissiveIntensity: 0.8, roughness: 0.4 }), g);
      const at = t2 + 0.7 + k * step;
      const land = V((k - 2) * 2.3, 0.3, RIM0 - 0.9 * k - 0.6);
      const L = lab(`kernel_${n}()<em>✓ pass</em>`, "tick", { pos: [0, 0, 0], s: sAt(35) * 0.5, bill: true, upd: (t, L) => {
        L.o = pr(t, at + 0.42, 0.15) * (1 - pr(t, at + 1.5, 0.3));
        L.k = 0.6 + 0.4 * pop(t, at + 0.42, 0.4);
        L.pos.set(B.x + land.x, 2.2 + pr(t, at + 0.42, 1.4) * 1.6, B.z + land.z);
      } });
      void L;
      return { b, at, land };
    });
    lab("CUDA<small>輝達獨門的程式工具</small>", "num glow-g out", { pos: [B.x, 9.9, B.z], s: 0.0082, size: 300, bill: true, anchor: "b", upd: (t, L) => { show(SC.s2.start + 0.35, SC.s3.start - 0.05)(t, L); L.o *= 1 - (pr(t, t2 - 0.2, 0.3) - pr(t, t4 + 0.6, 0.3)); } });
    lab("護　城　河", "serif", { pos: [B.x - 8.6, 0.14, B.z + 7.6], rot: [-Math.PI / 2, 0, 0.75], s: 0.017, size: 120, upd: (t, L) => { L.o = 0.85 * pr(t, SC.s2.start + 0.5, 0.4) * (1 - pr(t, t2 + 0.9, 0.4)); L.k = 1; } }).el.style.color = "#8fd6e6";
    lab("抄不走", "stamp red", { pos: [B.x - 3.4, 4.6, B.z + 15.5], s: sAt(25) * 1.3, bill: true, upd: slam(t1 + 0.55, t2 - 0.05) });
    lab("AI<small>寫 kernel 程式</small>", "num", { pos: [B.x + 8.5, 9.6, B.z + 13], s: sAt(30) * 0.6, size: 190, bill: true, anchor: "b", upd: show(t2 + 0.25, t4 + 0.4) });
    lab("正在變窄", "stamp", { pos: [B.x, 17, B.z + 9], s: sAt(34) * 2.0, bill: true, upd: slam(t4 + 0.8, SC.s3.start - 0.1) });
    updaters.push((t) => {
      if (t < 5 || t > SC.s3.start + 3) { g.visible = false; return; }
      g.visible = true;
      keyL.intensity = 900 * pr(t, SC.s2.start, 0.8);
      // each kernel that lands pushes the bank inward: the moat really gets narrower
      let rimR = RIM0;
      blocks.forEach((o) => {
        const u = clamp01((t - o.at) / 0.45);
        const start = V(8.5, 7.4, 13);
        o.b.visible = u > 0 && t < t4 + 1.6;
        const e = ez("power2.in")(u);
        o.b.position.set(lerp(start.x, o.land.x, u), lerp(start.y, o.land.y, e) + Math.sin(u * Math.PI) * 3, lerp(start.z, o.land.z, u));
        o.b.rotation.set(u * 6, u * 3, 0);
        if (u >= 1) o.b.rotation.set(0, 0, 0);
        rimR -= 0.9 * pr(t, o.at + 0.42, 0.4, "back.out(2)");
      });
      rimR -= 1.5 * pr(t, t4 + 0.3, 0.9, "power2.inOut");
      const s = rimR / RIM0;
      water.scale.setScalar(s);
      rimLine.scale.setScalar(s);
      ripples.forEach((r, i) => {
        const u = (t * 0.22 + i / 3) % 1;
        r.scale.setScalar(lerp(7.4, rimR, u));
        r.material.opacity = 0.45 * Math.sin(u * Math.PI);
      });
      // rivals: arrive, hop at the edge, then advance with the bank
      pawns.forEach((o, i) => {
        const inn = pop(t, t1 - 0.45 + i * 0.05, 0.4);
        const r = rimR + 1.5 + (1 - inn) * 9;
        const hopT = t - (t1 + 0.1 + i * 0.05);
        const hop = hopT > 0 && hopT < 1.2 ? Math.abs(Math.sin(hopT * 10)) * 0.8 * (1 - hopT / 1.2) : 0;
        const march = t > t4 ? Math.abs(Math.sin((t - t4) * 9 + i)) * 0.25 : 0;
        o.p.position.set(Math.cos(o.a) * r, hop + march, Math.sin(o.a) * r);
        o.p.scale.setScalar(Math.max(0.001, inn * 0.8));
      });
      const aiIn = pop(t, t2 + 0.05, 0.5);
      ai.scale.setScalar(Math.max(0.001, aiIn));
      ai.position.y = 7.4 + Math.sin(t * 2.2) * 0.3;
      aiBox.rotation.set(t * 0.6, t * 0.9, 0);
      aiL.intensity = 300 * aiIn;
    });
  })();

  // ═════════ C · 1,000 GB vs 288 GB, then the board ═════════
  (function () {
    const g = new THREE.Group();
    g.position.copy(C);
    scene.add(g);
    const t1 = Ln("s3", 1);
    const t2 = Ln("s3", 2);
    const t3 = Ln("s3", 3);
    const t4 = Ln("s3", 4);
    const t5 = Ln("s3", 5);
    const m1 = Ln("s4", 1);
    const m2 = Ln("s4", 2);
    const m3 = Ln("s4", 3);
    const m5 = Ln("s4", 5);
    const N = 1000;
    const cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.86, 0.86, 0.86), std(0xffffff, { roughness: 0.3, metalness: 0.1 }), N);
    cubes.castShadow = true;
    cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(cubes);
    const chipAt = [V(4.6, 0, 4.6), V(-4.6, 0, 4.6), V(4.6, 0, -4.6), V(-4.6, 0, -4.6)];
    const info = [];
    for (let iy = 0; iy < 10; iy++) for (let iz = 0; iz < 10; iz++) for (let ix = 0; ix < 10; ix++) {
      const idx = iy * 100 + (9 - iz) * 10 + ix;
      const grp = Math.min(3, Math.floor(idx / 288));
      const j = idx - grp * 288;
      const home = V(ix - 4.5, 4 + iy, iz - 4.5);
      const cp = chipAt[grp];
      const tgt = V(cp.x + ((j % 12) - 5.5) * 0.5, 0.8 + Math.floor(j / 144) * 0.5, cp.z + ((Math.floor(j / 12) % 12) - 5.5) * 0.5);
      info.push({ home, tgt, grp, j, d: home.distanceTo(V(0, 8.5, 0)) });
    }
    const cGray = c3(0xcfd6c8);
    const cGreen = c3(COL.green);
    const cRed = c3(0xff1f10);
    for (let i = 0; i < N; i++) cubes.setColorAt(i, cGray);
    const cubeL = new THREE.PointLight(COL.green, 0, 80, 2);
    cubeL.position.set(8, 16, 12);
    g.add(cubeL);
    // the four chips
    const chipBody = std(0x101a13, { roughness: 0.45, metalness: 0.3 });
    const chips = chipAt.map((p) => {
      const c = new THREE.Group();
      c.position.copy(p);
      g.add(c);
      const b = mesh(new THREE.BoxGeometry(7.6, 0.5, 7.6), chipBody, c, V(0, 0.25, 0));
      edges(b, COL.green);
      mesh(new THREE.BoxGeometry(6.4, 0.08, 6.4), std(0x18261b, { roughness: 0.3, metalness: 0.5 }), c, V(0, 0.52, 0));
      return c;
    });
    // the rest of the board
    const extra = [];
    for (let i = -3; i < 3; i++) for (let k = -3; k < 3; k++) {
      if ((i === -1 || i === 0) && (k === -1 || k === 0)) continue;
      extra.push(V((i + 0.5) * 9.2, 0, (k + 0.5) * 9.2));
    }
    const exBody = new THREE.InstancedMesh(new THREE.BoxGeometry(7.6, 0.5, 7.6), chipBody, extra.length);
    const exRim = new THREE.InstancedMesh(new THREE.BoxGeometry(8.0, 0.2, 8.0), basic(0x6fa000), extra.length);
    const exDie = new THREE.InstancedMesh(new THREE.BoxGeometry(5.6, 0.1, 5.6), basic(0x24380f), extra.length);
    g.add(exDie);
    exBody.receiveShadow = true;
    g.add(exBody, exRim);
    const all = chipAt.concat(extra);
    const links = [];
    all.forEach((a, i) => all.forEach((b, k) => { if (k > i && Math.abs(a.distanceTo(b) - 9.2) < 0.1) links.push([a, b, i < 4 && k < 4]); }));
    const inner = links.filter((l) => l[2]);
    const LY = 2.5;
    const linkM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 0.24), basic(0xffffff), links.length);
    linkM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(linkM);
    const cLinkG = c3(0x6fa000);
    const cLinkC = c3(COL.copper);
    // meeting pulses
    const NP = 110;
    const pp = new Float32Array(NP * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pp, 3));
    const pulses = new THREE.Points(pg, new THREE.PointsMaterial({ map: glowTex, color: COL.copper, size: 2.6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pulses.frustumCulled = false;
    g.add(pulses);
    const pdef = [];
    for (let i = 0; i < NP; i++) {
      const first = i < 8;
      const l = first ? inner[i % inner.length] : links[Math.floor(rnd() * links.length)];
      pdef.push({ l, t0: first ? m1 + (i % 4) * 0.08 : m2 + 0.45 + rnd() * 1.3, f: first ? 2.6 : 3 + rnd() * 3, ph: rnd() });
    }
    const board = mesh(new THREE.BoxGeometry(60, 0.1, 60), std(0x0c1810, { roughness: 0.8, transparent: true, opacity: 0 }), g, V(0, 0.06, 0), false);
    // labels
    let lastN = -1;
    const big = lab('<small class="mute" style="font-size:54px">一個 AI 模型</small><span>0</span> GB', "num", { pos: [C.x, 14.6, C.z], s: sAt(46) * 0.52, size: 250, bill: true, anchor: "b", upd: (t, L) => {
      show(t2 - 0.1, t5 + 0.45)(t, L);
      const n = Math.round(1000 * pr(t, t2 + 0.2, 0.95, "power3.out"));
      if (n !== lastN) { L.el.querySelector("span").textContent = fmt(n); lastN = n; }
    } });
    void big;
    chipAt.forEach((p, i) => lab("<b>288</b> GB", "num", { pos: [C.x + p.x, 0.7, C.z + p.z + 4.9], rot: [-Math.PI / 2, 0, 0], s: 0.012, size: 110, upd: show(i === 0 ? t4 + 0.15 : t5 + 0.35 + i * 0.1, m2 + 0.1) }).el.style.color = "#cfd6c8");
    lab("裝不下", "stamp red", { pos: [C.x + 2, 9.6, C.z + 6], s: sAt(40) * 1.7, bill: true, upd: slam(t4 + 1.35, t5 - 0.05) });
    lab('<span class="mute" style="font-family:var(--mono);font-size:70px">1,000 ÷ 288 ≈ 3.5</span><br>→ 至少 4 顆', "glow-g out", { pos: [C.x - 2, 0.9, C.z - 15], rot: [-Math.PI / 2, 0, 0.42], s: 0.0135, size: 130, upd: show(t5 + 0.95, SC.s4.start + 0.9) }).el.style.fontWeight = 900;
    let lastM = -1;
    lab('<small class="mute" style="font-size:60px">每秒開會次數</small><span>0</span><span style="font-size:.4em"> 次+</span>', "num glow-c", { pos: [C.x, 14, C.z], s: sAt(80) * 0.72, size: 300, bill: true, upd: (t, L) => {
      show(m2 + 0.3, m5 - 0.2)(t, L);
      const n = Math.round(10000 * pr(t, m3 + 0.1, 1.3, "power2.in"));
      if (n !== lastM) { L.el.querySelectorAll("span")[0].textContent = fmt(n); lastM = n; }
    } });
    updaters.push((t) => {
      if (t < SC.s3.start - 1 || t > SC.s5.start + 2.5) { g.visible = false; return; }
      g.visible = true;
      cubeL.intensity = 1400 * pr(t, t1 - 1.2, 0.6);
      const redK = pr(t, t4 + 1.15, 0.25) - pr(t, t5, 0.25);
      for (let i = 0; i < N; i++) {
        const o = info[i];
        const born = pr(t, t1 - 1.0 + o.d * 0.06, 0.35, "back.out(2)");
        const td = o.grp === 0 ? t4 + 0.45 + o.j * 0.0016 : t5 + 0.5 + o.grp * 0.16 + o.j * 0.0012;
        const u = pr(t, td, 0.55, "power2.in");
        let x = lerp(o.home.x, o.tgt.x, u);
        let y = lerp(o.home.y, o.tgt.y, u);
        let z = lerp(o.home.z, o.tgt.z, u);
        if (o.grp > 0 && redK > 0) { x += Math.sin(t * 60 + i) * 0.07 * redK; z += Math.cos(t * 53 + i * 2) * 0.07 * redK; }
        // groups peel apart before they fall
        if (o.grp > 0) y += o.grp * 0.5 * pr(t, t5 + 0.05, 0.35, "back.out(2)") * (1 - u);
        setI(cubes, i, x, y, z, Math.max(0.0001, born) * lerp(1, 0.5, u));
        if (o.grp === 0) tmpC.copy(cGray).lerp(cGreen, pr(t, t4 + 0.3, 0.2));
        else tmpC.copy(cGray).lerp(cRed, redK).lerp(cGreen, pr(t, t5, 0.25));
        cubes.setColorAt(i, tmpC);
      }
      cubes.instanceMatrix.needsUpdate = true;
      cubes.instanceColor.needsUpdate = true;
      cubes.visible = t < m2 + 0.6;
      chips.forEach((c, i) => {
        const s = pop(t, i === 0 ? t3 : t5 + 0.1 + i * 0.1, 0.5);
        c.scale.setScalar(Math.max(0.001, s));
        const hit = i === 0 ? t4 + 1.0 : t5 + 1.05 + i * 0.16;
        c.position.y = -0.35 * Math.sin(Math.PI * clamp01((t - hit) / 0.25));
      });
      extra.forEach((p, i) => {
        const s = pop(t, m2 + p.length() * 0.018, 0.4);
        setI(exBody, i, p.x, 0.25, p.z, Math.max(0.0001, s));
        setI(exRim, i, p.x, 0.1, p.z, Math.max(0.0001, s));
        setI(exDie, i, p.x, 0.52, p.z, Math.max(0.0001, s));
      });
      exBody.instanceMatrix.needsUpdate = true;
      exRim.instanceMatrix.needsUpdate = true;
      exDie.instanceMatrix.needsUpdate = true;
      board.material.opacity = pr(t, m2 - 0.1, 0.5);
      links.forEach((l, i) => {
        const k = l[2] ? pr(t, SC.s4.start + 0.3, 0.4) : pr(t, m2 + 0.35 + i * 0.004, 0.4);
        dummy.position.set((l[0].x + l[1].x) / 2, LY, (l[0].z + l[1].z) / 2);
        dummy.rotation.set(0, Math.abs(l[0].x - l[1].x) > 1 ? 0 : Math.PI / 2, 0);
        dummy.scale.set(Math.max(0.0001, 9.2 * k), 1, 1 + 1.2 * pr(t, m5 + 0.15, 0.3));
        dummy.updateMatrix();
        linkM.setMatrixAt(i, dummy.matrix);
        linkM.setColorAt(i, tmpC.copy(l[2] ? cLinkC : cLinkG).lerp(cLinkC, pr(t, m5 + 0.15, 0.3)));
      });
      linkM.instanceMatrix.needsUpdate = true;
      linkM.instanceColor.needsUpdate = true;
      for (let i = 0; i < NP; i++) {
        const d = pdef[i];
        const on = t > d.t0 && (i >= 8 || t < m2 + 0.4 || true);
        if (!on) { pp[i * 3 + 1] = -50; continue; }
        const ph = (t - d.t0) * d.f + d.ph;
        const u = Math.abs((ph % 2) - 1);
        pp[i * 3] = lerp(d.l[0].x, d.l[1].x, u); pp[i * 3 + 1] = LY + 0.1; pp[i * 3 + 2] = lerp(d.l[0].z, d.l[1].z, u);
      }
      pg.attributes.position.needsUpdate = true;
    });
  })();

  // ═════════ tables: NVLink (green) and Helios (red) ═════════
  function makeTable(at, r, color, colorD) {
    const g = new THREE.Group();
    g.position.copy(at);
    scene.add(g);
    const top = mesh(new THREE.CylinderGeometry(r, r * 0.97, 1.2, 96), std(colorD, { roughness: 0.4, metalness: 0.3 }), g, V(0, 0.6, 0));
    const rings = [1, 0.865, 0.63].map((k) => {
      const m = mesh(new THREE.TorusGeometry(r * k, 0.07, 8, 128), basic(color), g, V(0, 1.23, 0), false);
      m.rotation.x = Math.PI / 2;
      return m;
    });
    const hub = mesh(new THREE.CylinderGeometry(r * 0.145, r * 0.16, 0.5, 48), std(0x5a2a0c, { emissive: COL.copperD, emissiveIntensity: 0.55, roughness: 0.35 }), g, V(0, 1.45, 0), false);
    const hubGlow = glow(COL.copper, r * 0.42, g, V(0, 1.8, 0));
    const light = new THREE.PointLight(COL.copper, 0, r * 5, 2);
    light.position.set(0, 9, 0);
    g.add(light);
    const seats = [];
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; seats.push(V(Math.cos(a) * r * 0.865, 1.43, Math.sin(a) * r * 0.865)); }
    for (let i = 0; i < 32; i++) { const a = ((i + 0.5) / 32) * Math.PI * 2; seats.push(V(Math.cos(a) * r * 0.63, 1.43, Math.sin(a) * r * 0.63)); }
    const sc = r / 15;
    const chips = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5 * sc, 0.45, 1.15 * sc), basic(0xffffff), 72);
    chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(chips);
    const cp = [];
    seats.forEach((s) => cp.push(0, 1.3, 0, s.x, 1.3, s.z));
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3));
    const cables = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: COL.copper, transparent: true, opacity: 0 }));
    g.add(cables);
    const pp = new Float32Array(72 * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pp, 3));
    const pulses = new THREE.Points(pg, new THREE.PointsMaterial({ map: glowTex, color: 0xffe2b8, size: 1.5 * sc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pulses.frustumCulled = false;
    g.add(pulses);
    return { g, top, rings, hub, hubGlow, light, seats, chips, cables, pulses, pp, pg, r, color: c3(color) };
  }

  // ═════════ E · email vs one table, the moderator, and the farm ═════════
  (function () {
    const T = makeTable(E, 15, COL.green, 0x0e1b0c);
    const g = T.g;
    const t0 = Ln("s5", 0);
    const t1 = Ln("s5", 1);
    const t2 = Ln("s5", 2);
    const t3 = Ln("s5", 3);
    const t4 = Ln("s5", 4);
    const h0 = Ln("s6", 0);
    const h1 = Ln("s6", 1);
    const h2 = Ln("s6", 2);
    const h3 = Ln("s6", 3);
    const h4 = Ln("s6", 4);
    const h5 = Ln("s6", 5);
    const h6 = Ln("s6", 6);
    // scattered start positions on the ground
    const scatter = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 8; c++) scatter.push(V((c - 3.5) * 5.6 + (rnd() - 0.5) * 3, 0.25, (r - 4) * 5.6 + (rnd() - 0.5) * 3));
    const free = scatter.slice();
    const from = T.seats.map((s) => {
      let bi = 0;
      let bd = 1e9;
      free.forEach((p, i) => { const d = p.distanceToSquared(s); if (d < bd) { bd = d; bi = i; } });
      return free.splice(bi, 1)[0];
    });
    const cGray = c3(0x7d8a80);
    const cWhite = c3(0xffffff);
    const cCopper = c3(COL.copper);
    const mail = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.1, 1.3), basic(0xf2f4ea), 16);
    mail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(mail);
    const mdef = [];
    for (let i = 0; i < 16; i++) {
      const a = scatter[Math.floor(rnd() * 72)];
      let b = scatter[Math.floor(rnd() * 72)];
      if (b === a) b = scatter[(scatter.indexOf(a) + 23) % 72];
      mdef.push({ a, b, t0: t0 - 0.9 + i * 0.3, d: 3.4 });
    }
    // moderator
    const host = new THREE.Group();
    g.add(host);
    mesh(new THREE.CylinderGeometry(0.09, 0.09, 3, 10), std(0xdfe6d8, { metalness: 0.8, roughness: 0.3 }), host, V(0, 3.1, 0));
    mesh(new THREE.CapsuleGeometry(0.5, 0.8, 8, 16), std(0x6a3210, { emissive: COL.copperD, emissiveIntensity: 0.7, roughness: 0.3 }), host, V(0, 5.3, 0));
    const hostGlow = glow(COL.copper, 4.5, host, V(0, 5.3, 0));
    const pick = [50, 9, 27];
    const rp = [];
    pick.forEach((i) => rp.push(V(0, 1.55, 0), V(T.seats[i].x, 1.55, T.seats[i].z)));
    const route = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rp), new THREE.LineBasicMaterial({ color: 0xffe2b8 }));
    g.add(route);
    // the farm: the same table, thousands of times
    const cells = [];
    for (let i = -7; i <= 7; i++) for (let j = -18; j <= 4; j++) {
      if (i === 0 && j === 0) continue;
      const x = E.x + i * 36;
      const z = E.z + j * 36;
      if (V(x, 0, z).distanceTo(C) < 62 || V(x, 0, z).distanceTo(B) < 50 || x > 292 || V(x, 0, z).distanceTo(R) < 30) continue;
      cells.push({ x, z, d: Math.hypot(i, j), hsh: rnd() });
    }
    const fTop = new THREE.InstancedMesh(new THREE.CylinderGeometry(13, 12.6, 1.2, 28), std(0x0e1b0c, { roughness: 0.4, metalness: 0.3 }), cells.length);
    const fRingG = new THREE.TorusGeometry(11.2, 0.5, 6, 44);
    fRingG.rotateX(Math.PI / 2);
    const fRing = new THREE.InstancedMesh(fRingG, basic(0xffffff), cells.length);
    const fHub = new THREE.InstancedMesh(new THREE.CylinderGeometry(2, 2, 0.5, 16), basic(COL.copper), cells.length);
    [fTop, fRing, fHub].forEach((m) => { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); });
    const scan = mesh(new THREE.BoxGeometry(700, 0.4, 5), basic(COL.red, { transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), scene, V(E.x, 2.2, 0), false);
    const cGreen = c3(COL.green);
    const cRed = c3(COL.red);
    // labels
    lab('<span style="color:var(--mute)">一般的連法</span><br>72 個人用 email 開會', "tag", { pos: [E.x, 9.5, E.z - 4], s: sAt(34) * 0.85, bill: true, upd: show(t1 - 0.15, t2 - 0.15) });
    lab("NVLink", "num glow-g", { pos: [E.x - 6.5, 2.0, E.z - 15.5], s: sAt(50) * 0.5, size: 330, bill: true, anchor: "b", upd: (t, L) => { slam(t2 + 0.25, h0 + 0.2)(t, L); } });
    lab("72 顆晶片　同一張桌子", "tag g", { pos: [E.x - 6.5, 7.6, E.z - 15.5], s: sAt(50) * 0.6, bill: true, upd: show(t3 + 0.5, t4 + 0.2) });
    lab("延遲 ≈ 0", "tag c", { pos: [E.x, 1.6, E.z + 5.9], rot: [-Math.PI / 2, 0, 0], s: 0.017, upd: show(t4 + 0.35, h0 - 0.1) });
    lab("NCCL<small style='color:var(--copper)'>會議主持人</small>", "num", { pos: [E.x, 6.6, E.z], s: sAt(24) * 0.6, size: 280, bill: true, anchor: "b", upd: show(h0 + 0.75, h2 + 0.1) });
    pick.forEach((i, n) => lab(String(n + 1), "ball", { pos: [E.x + T.seats[i].x, 3.1, E.z + T.seats[i].z], s: sAt(26) * 0.8, bill: true, upd: show(h1 + 0.15 + n * 0.25, h2 + 0.1) }));
    lab(
      '<div class="bar"><i></i><i></i><i></i><span>RCCL　AMD 的通訊函式庫 · 原始碼開頭</span></div><pre><span class="ln">1</span>/*\n<span class="ln">2</span> <span class="mark g">* Copyright (c) … NVIDIA CORPORATION.</span>\n<span class="ln">3</span> <span class="mark r">* Modifications Copyright (c) … AMD</span>\n<span class="ln">4</span> */</pre><div class="call">版權聲明第一行，寫的是 <b>NVIDIA</b></div>',
      "code",
      { pos: [E.x, 10, E.z], s: sAt(25) * 1.02, bill: true, upd: (t, L) => {
        L.o = pr(t, h2 - 0.1, 0.25) * (1 - pr(t, h4 + 0.1, 0.3));
        L.k = 0.7 + 0.3 * pr(t, h2 - 0.1, 0.5, "back.out(1.6)");
        L.pos.y = lerp(5, 11.5, pr(t, h2 - 0.1, 0.55, "power3.out"));
        const m = L.el.querySelectorAll(".mark");
        m[0].style.setProperty("--sweep", pr(t, h2 + 0.75, 0.4).toFixed(3));
        m[1].style.setProperty("--sweep", pr(t, h3 + 0.35, 0.4).toFixed(3));
        L.el.querySelector(".call").style.setProperty("--pop", pop(t, h3 + 0.85, 0.35).toFixed(3));
      } },
    );
    lab("上萬顆晶片<small>一起跑好幾天，問題才冒出來</small>", "glow-g out", { pos: [E.x + 4, 46, E.z - 50], s: sAt(225) * 0.95, size: 170, bill: true, upd: show(h5 - 0.1, SC.s7.start - 0.1) }).el.style.fontWeight = 900;
    updaters.push((t) => {
      const act = t > SC.s5.start - 1.5;
      g.visible = act;
      const gather = pr(t, t2 - 0.05, 0.95, "expo.inOut");
      const rise = pr(t, t2 + 0.05, 0.8, "expo.out");
      T.top.scale.y = Math.max(0.001, rise);
      T.top.position.y = 0.6 * rise;
      T.top.visible = rise > 0.01;
      T.rings.forEach((r) => { r.visible = rise > 0.5; });
      T.hub.visible = rise > 0.5;
      T.hubGlow.material.opacity = 0.3 * pr(t, t2 + 0.7, 0.5) * (0.85 + 0.15 * Math.sin(t * 5));
      T.light.intensity = 420 * pr(t, t2 + 0.7, 0.5);
      const notes = t > t4 ? Math.max(0, Math.sin((t - t4) * 11)) * (1 - pr(t, t4 + 1.6, 0.4)) : 0;
      T.cables.material.opacity = (0.45 + 0.55 * notes) * pr(t, t2 + 0.8, 0.5);
      for (let i = 0; i < 72; i++) {
        const s = T.seats[i];
        const f = from[i];
        const u = clamp01(gather * 1.15 - (i / 72) * 0.15);
        const born = pop(t, SC.s5.start - 0.6 + (i % 12) * 0.03, 0.35);
        const y = lerp(f.y, s.y, u) + Math.sin(u * Math.PI) * 2.5;
        setI(T.chips, i, lerp(f.x, s.x, u), y, lerp(f.z, s.z, u), Math.max(0.0001, born) * (1 + 0.35 * notes), -Math.atan2(s.z, s.x) * u);
        tmpC.copy(cGray).lerp(T.color, u).lerp(cWhite, notes * 0.7);
        const pi = pick.indexOf(i);
        if (pi >= 0) tmpC.lerp(cCopper, pr(t, h1 + 0.15 + pi * 0.25, 0.2));
        T.chips.setColorAt(i, tmpC);
        const ph = ((t - t4) * 2.4 + (i % 2) * 0.5) % 1;
        const onP = t > t2 + 1 ? 1 : 0;
        const uu = t > t4 && t < t4 + 1.8 ? Math.abs(((t - t4) * 5) % 2 - 1) : ph;
        T.pp[i * 3] = s.x * uu; T.pp[i * 3 + 1] = onP ? 1.5 : -50; T.pp[i * 3 + 2] = s.z * uu;
      }
      T.chips.instanceMatrix.needsUpdate = true;
      T.chips.instanceColor.needsUpdate = true;
      T.pg.attributes.position.needsUpdate = true;
      mdef.forEach((m, i) => {
        const u = ((t - m.t0) / m.d) % 1;
        const live = t > m.t0 && t < t2 - 0.1;
        const k = live ? Math.sin(u * Math.PI) : 0;
        dummy.position.set(lerp(m.a.x, m.b.x, u), 1.2 + Math.sin(u * Math.PI) * 4.5, lerp(m.a.z, m.b.z, u));
        dummy.rotation.set(0.3, u * 2, 0.2);
        dummy.scale.setScalar(Math.max(0.0001, Math.min(1, k * 4)));
        dummy.updateMatrix();
        mail.setMatrixAt(i, dummy.matrix);
      });
      mail.instanceMatrix.needsUpdate = true;
      // moderator
      const hd = pr(t, h0 + 0.25, 0.65, "bounce.out");
      host.visible = t > h0 + 0.25;
      host.position.y = (1 - hd) * 16;
      hostGlow.material.opacity = 0.32 + 0.12 * Math.sin(t * 6);
      route.visible = t > h1 + 0.9;
      route.geometry.setDrawRange(0, Math.floor(clamp01((t - h1 - 0.9) / 0.9) * 3 + 0.999) * 2);
      // farm
      const farmOn = t > h4;
      fTop.visible = fRing.visible = fHub.visible = farmOn;
      if (farmOn) {
        cells.forEach((c, i) => {
          const s = pop(t, h4 + 0.3 + c.d * 0.045, 0.5);
          setI(fTop, i, c.x, 0.6, c.z, Math.max(0.0001, s));
          setI(fRing, i, c.x, 1.3, c.z, Math.max(0.0001, s));
          setI(fHub, i, c.x, 1.45, c.z, Math.max(0.0001, s));
          const bt = h5 + c.hsh * 14;
          const bug = c.hsh < 0.22 ? pr(t, bt, 0.12) * (1 - pr(t, bt + 0.7, 0.4)) : 0;
          fRing.setColorAt(i, tmpC.copy(cGreen).lerp(cRed, bug));
        });
        fTop.instanceMatrix.needsUpdate = fRing.instanceMatrix.needsUpdate = fHub.instanceMatrix.needsUpdate = true;
        fRing.instanceColor.needsUpdate = true;
      }
      const su = ((t - h5) / 2.6) % 1;
      scan.visible = t > h5 && t < SC.s7.start;
      scan.position.z = lerp(E.z + 150, E.z - 520, su);
    });
  })();

  // ═════════ G · the wall, what is written into it, and the challenger ═════════
  (function () {
    const st = makeStage(G, false);
    st.g.scale.setScalar(1.2);
    st.g.rotation.y = -Math.PI / 2;
    st.rim.intensity = 70;
    st.rim2.intensity = 70;
    const y1 = Ln("s7", 1);
    const y2 = Ln("s7", 2);
    const y3 = Ln("s7", 3);
    const y4 = Ln("s7", 4);
    const y5 = Ln("s7", 5);
    const y6 = Ln("s7", 6);
    const r1 = Ln("s8", 1);
    const r2 = Ln("s8", 2);
    const r3 = Ln("s8", 3);
    const r4 = Ln("s8", 4);
    const r5 = Ln("s8", 5);
    const ROWS = 16;
    const bricks = [];
    for (let r = 0; r < ROWS; r++) for (let k = -92; k <= 92; k++) bricks.push({ r, z: -10 + k * 2.5 + (r % 2 ? 1.25 : 0), cu: rnd() > 0.45 });
    const bGeo = new THREE.BoxGeometry(2.9, 0.93, 2.42);
    const cu = bricks.filter((b) => b.cu);
    const cd = bricks.filter((b) => !b.cu);
    const mCu = new THREE.InstancedMesh(bGeo, std(0xc9742f, { roughness: 0.42, metalness: 0.45, emissive: 0x5a2608, emissiveIntensity: 0.7 }), cu.length);
    const mCd = new THREE.InstancedMesh(bGeo, std(0x0c160b, { roughness: 0.85, emissive: 0x1c3300, emissiveIntensity: 0.55 }), cd.length);
    [mCu, mCd].forEach((m) => { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); });
    const wallL = new THREE.PointLight(COL.copper, 0, 120, 2);
    wallL.position.set(WALLX - 16, 10, -10);
    scene.add(wallL);
    // three generations = three towers on the wall
    const towers = [-6.4, 0, 6.4].map((dz, i) => {
      const hgt = 5 + i * 3.4;
      const m = mesh(new THREE.BoxGeometry(4.4, hgt, 5.2), std(0x1a2b12, { roughness: 0.45, emissive: COL.greenD, emissiveIntensity: 0.9 }), scene, V(WALLX, 0, -10 + dz));
      edges(m, COL.green);
      return { m, hgt, dz };
    });
    // money bars
    const bar1 = mesh(new THREE.BoxGeometry(3, 1, 3), std(0x7d8a80, { roughness: 0.5 }), scene, V(334, 0, 5.6));
    const bar2 = mesh(new THREE.BoxGeometry(3, 1, 3), std(0xd9843f, { roughness: 0.35, metalness: 0.4, emissive: 0x7a3d16, emissiveIntensity: 1 }), scene, V(334, 0, 10.6));
    edges(bar2, COL.copper);
    // the challenger
    const RT = makeTable(R, 11, COL.red, 0x1c0d0a);
    const arrows = [];
    for (let i = 0; i < 9; i++) {
      const a = mesh(new THREE.ConeGeometry(1.5, 2.6, 3), basic(COL.red, { transparent: true, opacity: 0.9 }), scene, V(297 + i * 4, 0.4, -10), false);
      a.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
      a.scale.set(1, 1, 0.12);
      arrows.push(a);
    }
    const face = WALLX - 1.52;
    const ry = -Math.PI / 2;
    [["①", "硬體", "NVLink 已做到第三代整櫃", y2 + 0.35], ["②", "產品藍圖", "下一代早就排好了", y2 + (SC.s7.lines[2].end - y2) * 0.58], ["③", "簽好的合約", "供應鏈白紙黑字", y3 + 0.1]].forEach((p, i) => {
      lab(`<i>${p[0]}</i><b>${p[1]}</b><span>${p[2]}</span>`, "brick", { pos: [face, 12.6 - i * 4, -10], rot: [0, ry, 0], s: 0.0128, upd: (t, L) => { L.o = pr(t, p[3], 0.12) * (1 - pr(t, SC.s8.start + 0.1, 0.3)); L.k = lerp(1.7, 1, pr(t, p[3], 0.3, "power4.out")); } });
    });
    let lastV = -1;
    lab('<small class="mute" style="font-size:50px">資料中心「網路」營收 · 單季</small><b style="color:var(--copper)">$<span>0</span><span style="font-size:.36em"> 億美元</span></b>', "num panel", { pos: [331.5, 9.1, 8.2], s: sAt(30) * 0.62, size: 260, bill: true, anchor: "b", upd: (t, L) => {
      show(y5 - 0.1, SC.s8.start + 0.1)(t, L);
      const n = Math.round(150 * pr(t, y5 + 0.1, 1.0, "power3.out"));
      if (n !== lastV) { L.el.querySelector("span").textContent = n; lastV = n; }
    } });
    lab("去年同期", "tag", { pos: [332.4, 3.9, 5.6], s: sAt(30) * 0.6, bill: true, upd: show(y6 - 0.1, SC.s8.start + 0.1) });
    lab("年增近 3 倍", "tag c", { pos: [332.2, 4.6, 10.6], s: sAt(30) * 0.8, bill: true, upd: show(y6 + 0.6, SC.s8.start + 0.1) });
    lab("資料來源：NVIDIA 法說會逐字稿（Q1）", "", { pos: [330, 0.6, 8.2], s: sAt(28) * 0.62, size: 40, bill: true, upd: show(y6 + 0.2, SC.s8.start + 0.1, false) }).el.style.color = "#93a096";
    lab("AMD Helios<small>72 顆 · 開放標準 UALink</small>", "num glow-r out", { pos: [R.x, 4.6, R.z - 2], s: sAt(30) * 0.56, size: 230, bill: true, anchor: "b", upd: show(r1 + 0.9, r3 - 0.1) });
    lab("Anthropic 已下單<small>最多 2 GW · 2027 上半年起</small>", "stamp red", { pos: [R.x + 8, 3.2, R.z + 2.2], s: sAt(20) * 1.05, bill: true, upd: slam(r2 + 0.75, r3 - 0.1) });
    towers.forEach((tw, i) => lab(`第 ${i + 1} 代`, "tag g", { pos: [face - 0.75, 16.6 + tw.hgt * 0.5, -10 + tw.dz], rot: [0, ry, 0], s: 0.021, upd: (t, L) => { show((i < 2 ? r3 + 0.35 + i * 0.4 : r4 + 0.5) + 0.3)(t, L); L.o *= 1 - (pr(t, SC.s9.start, 0.3) - pr(t, Ln("s9", 3) + 0.9, 0.5)); } }));
    lab("領先的不是「只有它會」<br>而是<b style='color:var(--copper);font-family:var(--serif);font-size:1.6em'> 時間</b>", "tag", { pos: [304, 13, -9], s: sAt(76) * 0.95, bill: true, upd: show(r5 - 0.2, SC.s9.start - 0.2) });
    updaters.push((t) => {
      const act = t > SC.s6.start + 8;
      st.g.visible = act;
      st.spot.intensity = act ? 420 : 0;
      st.cone.material.opacity = 0.05;
      st.piv.rotation.z = 0.1 * Math.sin(t * 1.7);
      // the wall slams up out of the ground on "還在"
      const set = (m, list) => {
        list.forEach((b, i) => {
          const u = pr(t, y1 - 0.06 + Math.abs(b.z + 10) * 0.004 + b.r * 0.018, 0.42, "back.out(1.4)");
          dummy.position.set(WALLX, lerp(-2 - b.r * 1.2, 0.5 + b.r, u), b.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(u > 0.001 ? 1 : 0.0001);
          dummy.updateMatrix();
          m.setMatrixAt(i, dummy.matrix);
        });
        m.instanceMatrix.needsUpdate = true;
        m.visible = t > y1 - 0.1;
      };
      set(mCu, cu);
      set(mCd, cd);
      wallL.intensity = 800 * pr(t, y1, 0.4);
      towers.forEach((tw, i) => {
        const u = pr(t, i < 2 ? r3 + 0.35 + i * 0.4 : r4 + 0.5, 0.55, "back.out(1.6)");
        tw.m.visible = u > 0;
        tw.m.position.y = 16 - tw.hgt / 2 + tw.hgt * u;
        tw.m.material.emissiveIntensity = i === 2 ? 0.9 + 1.4 * pr(t, r4 + 0.9, 0.3) * (0.7 + 0.3 * Math.sin(t * 7)) : 0.9;
      });
      const b1 = 2.9 * pr(t, y6 - 0.1, 0.35, "power2.out");
      const b2 = 8.4 * pr(t, y6 + 0.15, 0.8, "expo.out");
      bar1.visible = b1 > 0.01 && t < SC.s8.start + 0.4; bar1.scale.y = Math.max(0.01, b1); bar1.position.y = b1 / 2;
      bar2.visible = b2 > 0.01 && t < SC.s8.start + 0.4; bar2.scale.y = Math.max(0.01, b2); bar2.position.y = b2 / 2;
      // Helios rises
      const up = pr(t, r1 + 0.35, 0.7, "back.out(1.4)");
      RT.g.visible = up > 0;
      RT.g.position.y = (1 - up) * -3;
      RT.g.scale.setScalar(Math.max(0.001, 0.6 + 0.4 * up));
      RT.light.color.set(COL.red);
      RT.light.intensity = 900 * up;
      RT.hub.material.emissive.set(0xb02a1c); RT.hub.material.color.set(0x4a100a);
      RT.hubGlow.material.color.set(COL.red);
      RT.hubGlow.material.opacity = 0.3 * up;
      RT.cables.material.color.set(COL.red);
      RT.cables.material.opacity = 0.5 * pr(t, r1 + 1.3, 0.5);
      for (let i = 0; i < 72; i++) {
        const s = RT.seats[i];
        const k = pop(t, r1 + 0.85 + i * 0.012, 0.3);
        setI(RT.chips, i, s.x, s.y, s.z, Math.max(0.0001, k), -Math.atan2(s.z, s.x));
        RT.chips.setColorAt(i, RT.color);
        RT.pp[i * 3 + 1] = -50;
      }
      RT.chips.instanceMatrix.needsUpdate = true;
      RT.chips.instanceColor.needsUpdate = true;
      RT.pg.attributes.position.needsUpdate = true;
      // closing in on the wall
      arrows.forEach((a, i) => {
        const on = pr(t, r5 + 0.3 + i * 0.22, 0.2);
        a.visible = on > 0;
        a.material.opacity = on * (0.55 + 0.45 * Math.sin(t * 6 - i * 0.9));
      });
    });
  })();

  // ───────────────────────── camera: one take ─────────────────────────
  const K = [];
  const key = (t, p, l, e = "io", fov = 42, via) => K.push({ t, p: V(...p), l: V(...l), e, fov, via: via ? V(...via) : null });
  const S = (id) => SC[id].start;
  (function () {
    const a1 = Ln("s1", 1), a2 = Ln("s1", 2), a3 = Ln("s1", 3), a4 = Ln("s1", 4);
    key(0, [0, 10.5, 50], [0, 5.3, 0], "lin", 50);
    key(1.2, [0.9, 5.6, 16.2], [0, 5.5, 0], "xo", 44);
    key(a1 + 0.55, [1.3, 5.6, 15.4], [0, 6.3, 0], "out", 44);
    key(a2, [1.8, 5.6, 15.4], [0, 6.0, 0], "io", 44);
    key(a3 + 0.2, [3.4, 5.3, 14.0], [0, 5.95, 0], "io", 44);
    key(a4 + 0.7, [4.4, 5.3, 13.5], [0, 5.9, 0], "lin", 44);
    const b1 = Ln("s2", 1), b2 = Ln("s2", 2), b3 = Ln("s2", 3), b4 = Ln("s2", 4);
    key(S("s2") + 1.1, [68, 6.4, 31], [70, 4.6, -10], "io", 42, [30, 13, 44]);
    key(b1 + 0.9, [66.5, 6, 29], [70, 4.4, -10], "lin");
    key(b2 + 0.9, [75, 13.5, 31], [70, 2.6, -6], "io");
    key(b3 + 1.3, [73, 14.5, 30], [70, 2.6, -6], "lin");
    key(b4 + 0.95, [70, 52, 8], [70, 0, -5], "io");
    key(S("s3") - 0.1, [71, 57, 10], [71, 0, -5], "lin");
    const c1 = Ln("s3", 1), c2 = Ln("s3", 2), c4 = Ln("s3", 4), c5 = Ln("s3", 5);
    key(c1 - 0.15, [178, 14, 44], [150, 8.2, 0], "io", 42, [122, 15, 56]);
    key(c2 + 1.1, [175, 13.5, 42.5], [150, 8.0, 0], "lin");
    key(c4 + 0.1, [173, 11.5, 39], [151, 6.0, 1], "io");
    key(c5 - 0.1, [172, 12, 38.5], [151, 6.2, 1], "lin");
    key(c5 + 0.95, [162, 30, 25], [150, 1.6, 0], "io");
    key(S("s4") + 0.1, [161, 31.5, 24], [150, 1.2, 0], "lin");
    const d1 = Ln("s4", 1), d2 = Ln("s4", 2), d4 = Ln("s4", 4), d5 = Ln("s4", 5);
    key(d1 - 0.1, [159, 23, 18], [150, 0.6, 0], "io");
    key(d2 - 0.1, [157, 24, 18], [150, 0.6, 0], "lin");
    key(d2 + 1.4, [164, 62, 50], [150, 0, -2], "io");
    key(d4 + 0.3, [157, 64, 47], [150, 0, -2], "lin");
    key(d5 + 0.25, [126, 5.2, 21], [156, 1.4, -6], "io");
    key(S("s5") - 0.15, [131, 4.8, 17.5], [160, 1.4, -8], "lin");
    const e1 = Ln("s5", 1), e2 = Ln("s5", 2), e3 = Ln("s5", 3), e4 = Ln("s5", 4);
    key(e1 - 0.05, [234, 8, 27], [240, 1.4, -10], "io", 42, [190, 13, 42]);
    key(e2 - 0.3, [238.5, 9, 25], [240, 1.4, -10], "lin");
    key(e2 + 1.5, [260, 20, 17], [240, 3.4, -11], "io");
    key(e4 - 0.2, [247, 26, 20], [240, 3.2, -11], "lin");
    key(e4 + 0.8, [240, 49, -1], [240, 0, -8.5], "io");
    key(S("s6") - 0.05, [240, 47, -2], [240, 0, -8.5], "lin");
    void e3;
    const f0 = Ln("s6", 0), f2 = Ln("s6", 2), f4 = Ln("s6", 4), f6 = Ln("s6", 6);
    key(f0 + 1.1, [253, 11, 10], [240, 3.4, -10], "io");
    key(f2 - 0.35, [255, 11.6, 9], [240, 3.4, -10], "lin");
    key(f2 + 0.7, [243, 9.5, 17], [240, 7.6, -10], "io");
    key(f4 - 0.1, [242, 9.7, 18], [240, 7.6, -10], "lin");
    key(f4 + 2.4, [264, 125, 150], [244, 0, -60], "io", 46);
    key(f6 + 1.9, [254, 132, 158], [244, 0, -64], "lin", 46);
    const g1 = Ln("s7", 1), g2 = Ln("s7", 2), g4 = Ln("s7", 4), g6 = Ln("s7", 6);
    key(S("s7") + 1.75, [310.5, 6.2, -19], [326, 7.8, -20], "io", 42, [300, 70, 50]);
    key(g1 - 0.08, [309.5, 6.4, -18.6], [326, 7.8, -20], "lin");
    key(g1 + 0.5, [300, 7.2, -11.5], [340, 9.4, -10], "xo");
    key(g2 + 0.75, [308.5, 8.6, -10], [340, 8.5, -10], "io");
    key(g4 - 0.15, [310, 8.6, -9.6], [340, 8.5, -10], "lin");
    key(g4 + 1.1, [306, 8, 18], [334, 5.2, 8.2], "io");
    key(g6 + 1.5, [307.5, 8.4, 19], [334, 5.4, 8.2], "lin");
    const h0 = Ln("s8", 0), h1 = Ln("s8", 1), h2 = Ln("s8", 2), h3 = Ln("s8", 3), h4 = Ln("s8", 4), h5 = Ln("s8", 5);
    key(h0 + 0.75, [311, 10.5, -5], [282, 2.6, -10], "io");
    key(h1 + 2.6, [313, 11.5, -6], [282, 2.8, -10], "lin");
    key(h2 + 2.2, [307, 9.6, -7], [282, 3, -10], "io");
    key(h3 + 1.15, [289, 13, -10], [340, 17.5, -10], "io");
    key(h4 + 1.7, [287, 13.6, -10], [340, 18.4, -10], "lin");
    key(h5 + 1.1, [230, 27, -8], [325, -3, -10], "io");
    key(S("s9") + 0.05, [228, 28, -8], [325, -3, -10], "lin");
    const i0 = Ln("s9", 0), i2 = Ln("s9", 2), i3 = Ln("s9", 3);
    key(i0 + 1.05, [310, 3.0, -18.6], [340, 12.4, -20], "io");
    key(i2 + 0.1, [309, 3.3, -18.2], [340, 12.6, -20], "lin");
    key(i3 + 1.9, [222, 30, -12], [322, -4.4, -12], "io");
    key(TM.total + 0.2, [214, 32, -12], [322, -4.4, -12], "lin");
    void a4; void b3; void c4; void d4; void h0;
  })();
  const shakes = [[Ln("s1", 1), 0.25], [Ln("s3", 4) + 1.38, 0.2], [Ln("s7", 1), 0.75], [Ln("s8", 0) + 0.1, 0.55], [Ln("s8", 2) + 0.78, 0.2], [Ln("s9", 3), 0.3]];
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
      // look ahead: turn toward the destination early in a flight
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
    const red = pr(t, S("s8"), 0.4) - pr(t, S("s9") - 0.2, 1.6);
    sky.material.uniforms.cHor.value.copy(cHor[0]).lerp(cHor[1], red);
    sky.material.uniforms.cGlow.value.copy(cGlow[0]).lerp(cGlow[1], red);
    sky.material.uniforms.cMid.value.copy(cMid[0]).lerp(cMid[1], red);
    scene.fog.color.copy(cFog[0]).lerp(cFog[1], red);
    sun.color.copy(cSun[0]).lerp(cSun[1], red);
    const far = pr(t, Ln("s6", 4), 1.6) - pr(t, S("s7") + 0.9, 1.0);
    const wide = pr(t, Ln("s4", 2), 1.0) - pr(t, Ln("s4", 5), 0.6);
    scene.fog.density = lerp(lerp(lerp(0.0105, 0.0058, wide), 0.0026, far), 0.0048, pr(t, Ln("s8", 5), 1.2));
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
    const speed = cp.distanceTo(pPrev) * 30 + dA.angleTo(dB) * 30 * 45;
    const blur = Math.round(Math.min(9, Math.max(0, (speed - 42) * 0.075)) * 2) / 2;
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
  const kick = [["01", "多數人的第一直覺：CUDA"], ["01", "CUDA 這條護城河"], ["02", "一顆晶片，裝不下"], ["03", "晶片得一直「開會」"], ["04", "一般的連法 vs NVLink"], ["05", "程式碼抄得走，經驗抄不走"], ["06", "沒有他，這些還在嗎？"], ["反方", "對手也坐上了同一張桌"], ["結論", "領先的是時間"]];
  TM.scenes.forEach((s, i) => {
    const u = h("u", "", h("i", "", $("#prog")));
    F(u, { scaleX: 0 }, { scaleX: 1, duration: s.end - s.start, ease: "none" }, s.start);
    if (i === 0) return;
    const k = h("div", "", $("#kicker"), `<b${i === 7 ? ' style="background:var(--red)"' : ""}>${kick[i][0]}</b>${kick[i][1]}`);
    F(k, { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, s.start + 0.5);
    tl.to(k, { opacity: 0, x: 40, duration: 0.25, ease: "power2.in" }, s.end + 0.15);
    tl.set(k, { visibility: "hidden" }, s.end + 0.42);
  });
  F("#hud", { y: -60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.25);

  // S1 title
  (function () {
    $("#s1-t1").innerHTML = '<span>沒</span><span>有</span><span class="name"><span>黃</span><span>仁</span><span>勳</span><u></u></span><span>的</span><span class="nv">輝</span><span class="nv">達</span>';
    const top = $$("#s1-t1 > span");
    const seq = [top[0], top[1], ...$$("#s1-t1 .name > span"), top[3], top[4], top[5]];
    F(seq, { y: 80, opacity: 0, rotation: 10 }, { y: 0, opacity: 1, rotation: 0, duration: 0.36, ease: "back.out(2)", stagger: 0.035 }, 0.12);
    F("#s1-t1 .name u", { scaleX: 0 }, { scaleX: 1, duration: 0.26, ease: "power4.out" }, Ln("s1", 0, 0.5));
    tl.to("#s1-t1 .name > span", { color: "#93a096", duration: 0.25 }, Ln("s1", 0, 0.54));
    const t1 = Ln("s1", 1);
    F("#s1-t2", { scale: 1.8, opacity: 0, filter: "blur(16px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "expo.out" }, t1 - 0.06);
    tl.to("#s1-t2 i", { rotation: 14, duration: 0.22, repeat: 9, yoyo: true, ease: "sine.inOut" }, t1 + 0.3);
    F("#s1-me", { x: -600, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, Ln("s1", 3, 0.05));
    tl.to("#s1-title", { y: -220, opacity: 0, filter: "blur(14px)", duration: 0.3, ease: "power2.in" }, SC.s2.start - 0.42);
    tl.to("#s1-me", { x: -600, opacity: 0, duration: 0.3, ease: "power2.in" }, SC.s2.start - 0.42);
    tl.set("#s1-title, #s1-me", { visibility: "hidden" }, SC.s2.start);
  })();
  // "真正的城牆，在別的地方" — said mid-flight
  (function () {
    const a = Ln("s3", 0);
    F("#ov-real > div:first-child", { scale: 0.6, opacity: 0, filter: "blur(14px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.4, ease: "expo.out" }, a - 0.05);
    F("#ov-real .sub", { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, a + 0.75);
    tl.to("#ov-real", { scale: 1.5, opacity: 0, filter: "blur(18px)", duration: 0.35, ease: "power2.in" }, Ln("s3", 1) - 0.45);
    tl.set("#ov-real", { visibility: "hidden" }, Ln("s3", 1) - 0.08);
  })();
  (function () {
    F("#s4-vs .lose", { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, Ln("s4", 4) + 0.5);
    F("#s4-vs .win", { scale: 1.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2.4)" }, Ln("s4", 5) + 0.15);
    tl.to("#s4-vs", { opacity: 0, y: 40, duration: 0.25, ease: "power2.in" }, SC.s5.start - 0.2);
    tl.set("#s4-vs", { visibility: "hidden" }, SC.s5.start + 0.06);
  })();
  (function () {
    const a = Ln("s6", 6) + 0.85;
    F("#ov-stamp6", { scale: 2.4, opacity: 0, rotation: -20 }, { scale: 1, opacity: 1, rotation: -5, duration: 0.24, ease: "power4.out" }, a);
    tl.to("#ov-stamp6", { opacity: 0, scale: 0.8, duration: 0.25, ease: "power2.in" }, SC.s7.start + 0.1);
    tl.set("#ov-stamp6", { visibility: "hidden" }, SC.s7.start + 0.36);
  })();
  (function () {
    const a = Ln("s7", 0);
    const y = Ln("s7", 1);
    F("#s7-q .q1", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, a + 0.25);
    F("#s7-q .q2", { scale: 0.8, opacity: 0, filter: "blur(10px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.4, ease: "expo.out" }, a + 1.0);
    tl.to("#s7-q", { opacity: 0, y: -80, duration: 0.14, ease: "power2.in" }, y - 0.16);
    tl.set("#s7-q", { visibility: "hidden" }, y);
    F("#s7-yes", { scale: 3.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: "power4.out" }, y - 0.04);
    tl.to("#s7-yes", { scale: 0.5, y: -330, opacity: 0, duration: 0.4, ease: "power3.in" }, Ln("s7", 2) - 0.3);
    tl.set("#s7-yes", { visibility: "hidden" }, Ln("s7", 2) + 0.12);
  })();
  (function () {
    const T = SC.s8.start;
    F("#flash", { opacity: 0 }, { opacity: 0.85, duration: 0.07, ease: "power2.in" }, T - 0.07);
    tl.to("#flash", { opacity: 0, duration: 0.5, ease: "power2.out" }, T);
    F("#s8-slap", { scale: 1.7, opacity: 0, rotation: -6 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.24, ease: "power4.out" }, T + 0.02);
    tl.to("#s8-slap", { y: -300, scale: 0.5, opacity: 0, duration: 0.3, ease: "power3.in" }, Ln("s8", 1) - 0.35);
    tl.set("#s8-slap", { visibility: "hidden" }, Ln("s8", 1));
  })();
  (function () {
    F("#s9-a .l1", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power2.out" }, Ln("s9", 0));
    F("#s9-a .l2", { scale: 1.3, opacity: 0, filter: "blur(12px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.4, ease: "expo.out" }, Ln("s9", 1, 0.05));
    const t3 = Ln("s9", 3);
    tl.to("#s9-a", { opacity: 0, y: -60, duration: 0.3, ease: "power2.in" }, t3 - 0.4);
    tl.set("#s9-a", { visibility: "hidden" }, t3 - 0.08);
    const reel = $("#s9-reel");
    ["1", "2", "3", "5", "8", "10", "?"].forEach((n) => h("u", "", reel, n));
    F("#s9-q .l1", { scale: 1.8, opacity: 0, filter: "blur(14px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "expo.out" }, t3 - 0.05);
    F("#s9-q .l2", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, t3 + 0.5);
    F(reel, { y: 0 }, { y: -170 * 6, duration: 1.5, ease: "power3.out" }, t3 + 0.55);
    tl.to("#s9-q .l2 i", { rotation: 14, scale: 1.2, duration: 0.25, repeat: 13, yoyo: true, ease: "sine.inOut", transformOrigin: "50% 80%" }, t3 + 1.6);
    const t4 = Ln("s9", 4);
    F("#s9-cta .ask", { y: 80, opacity: 0, scale: 0.8 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2)" }, t4 + 0.05);
    F("#s9-cta .follow", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, t4 + 0.5);
    tl.to("#s9-cta .ask i", { y: 10, duration: 0.3, repeat: 11, yoyo: true, ease: "sine.inOut" }, t4 + 0.6);
  })();

  // captions
  (function () {
    const box = $("#caps");
    const colour = (s) =>
      s.replace(/CUDA|NVLink|輝達|AMD|Anthropic|1,000 GB|288 GB|4 顆|72 [個顆]|150 億美元|3 倍|上萬次|上萬顆|第三代|幾年|還在。|「開會」/g, (m) => {
        const cls = /CUDA|NVLink|輝達|還在/.test(m) ? "g" : /AMD|Anthropic/.test(m) ? "r" : "c";
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
