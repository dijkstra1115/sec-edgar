/* 沒有黃仁勳的輝達 — master timeline. Every cue is keyed to narration timing in timing.js. */
(function () {
  const TM = window.TIMING;
  const SC = {};
  TM.scenes.forEach((s) => (SC[s.id] = s));
  const L = (sid, i, off = 0) => SC[sid].lines[i].start + off;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const h = (tag, cls, parent, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  };
  // deterministic PRNG (mulberry32)
  let seed = 1116;
  const rnd = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const C = { green: "#9be000", greenD: "#3d5c00", copper: "#f5a552", red: "#ff5a45", ink: "#f2f4ea", mute: "#93a096", bg: "#050807" };
  const fmt = (n) => Math.round(n).toLocaleString("en-US");

  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });
  const F = (target, a, b, t) => tl.fromTo(target, a, b, t);
  const count = (el, to, t, d, ease = "power2.out") => {
    const o = { v: 0 };
    tl.to(o, { v: to, duration: d, ease, onUpdate: () => (el.textContent = fmt(o.v)) }, t);
  };
  const shake = (sel, t, amp = 12, n = 6) =>
    tl.fromTo(sel, { x: 0 }, { x: amp, duration: 0.045, repeat: n * 2 - 1, yoyo: true, ease: "sine.inOut" }, t);

  // ---------- reusable drawings ----------
  const hangerSVG = (stroke = "#c9d0c2") =>
    `<svg viewBox="0 0 520 320" width="100%" height="100%" preserveAspectRatio="xMidYMin meet"><path d="M260 96 V72 a24 24 0 1 0 -24 -24" fill="none" stroke="${stroke}" stroke-width="10" stroke-linecap="round"/><path d="M260 96 L92 178 Q76 190 98 192 H422 Q444 190 428 178 Z" fill="none" stroke="${stroke}" stroke-width="10" stroke-linejoin="round"/></svg>`;
  const jacketSVG = `<svg viewBox="0 0 520 620" width="520" height="620">
    <defs><linearGradient id="lj" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#39413b"/><stop offset=".45" stop-color="#101412"/><stop offset="1" stop-color="#252b27"/></linearGradient></defs>
    <path d="M150 168 L92 198 L34 470 L104 494 L160 300 Z" fill="url(#lj)" stroke="#59645c" stroke-width="4" stroke-linejoin="round"/>
    <path d="M370 168 L428 198 L486 470 L416 494 L360 300 Z" fill="url(#lj)" stroke="#59645c" stroke-width="4" stroke-linejoin="round"/>
    <path d="M150 168 L206 150 L260 236 L314 150 L370 168 L386 300 L378 596 L142 596 L134 300 Z" fill="url(#lj)" stroke="#59645c" stroke-width="4" stroke-linejoin="round"/>
    <path d="M206 150 L260 236 L212 336 L166 214 Z" fill="#2b332d" stroke="#6b776e" stroke-width="4" stroke-linejoin="round"/>
    <path d="M314 150 L260 236 L332 356 L356 214 Z" fill="#2b332d" stroke="#6b776e" stroke-width="4" stroke-linejoin="round"/>
    <path d="M262 242 L320 594" stroke="#d9dfd3" stroke-width="6" stroke-dasharray="3 8"/>
    <rect x="142" y="546" width="236" height="50" fill="#1a1f1c" stroke="#59645c" stroke-width="4"/>
    <rect x="232" y="552" width="54" height="38" rx="6" fill="none" stroke="#d9dfd3" stroke-width="6"/>
    <path d="M166 404 L226 388 M294 426 L352 410" stroke="#d9dfd3" stroke-width="6" stroke-linecap="round"/>
    <circle cx="184" cy="224" r="6" fill="#d9dfd3"/><circle cx="340" cy="226" r="6" fill="#d9dfd3"/><circle cx="110" cy="210" r="5" fill="#d9dfd3"/><circle cx="410" cy="210" r="5" fill="#d9dfd3"/>
    <path d="M160 306 L170 520 M70 340 L52 440 M452 340 L468 440" stroke="#7b877e" stroke-width="5" opacity=".6" stroke-linecap="round"/>
  </svg>`;
  // 72 seats: 40 on the outer ring, 32 on the inner one
  const seats = (cx, cy, rx, ry, k = 0.69) => {
    const p = [];
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; p.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }); }
    for (let i = 0; i < 32; i++) { const a = ((i + 0.5) / 32) * Math.PI * 2; p.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k }); }
    return p;
  };

  // ---------- world: slow descent + color temperature ----------
  tl.fromTo("#bg-dots", { y: 0 }, { y: -378, duration: TM.total, ease: "none" }, 0);
  tl.fromTo("#glow-a", { x: 0, y: 0, scale: 1 }, { x: 260, y: 240, scale: 1.25, duration: TM.total, ease: "sine.inOut" }, 0);
  tl.fromTo("#glow-b", { x: 0, y: 0 }, { x: -320, y: -260, duration: TM.total, ease: "sine.inOut" }, 0);
  TM.scenes.forEach((s, i) => {
    const u = h("u", "", h("i", "", $("#prog")));
    F(u, { scaleX: 0 }, { scaleX: 1, duration: s.end - s.start, ease: "none" }, s.start);
    // each scene breathes differently
    const amb = [{ scale: 1.05 }, { scale: 1.035, x: -14 }, { scale: 1.04 }, { scale: 1.05, x: 12 }, { scale: 1.07 }, { scale: 1.035, x: -10 }, { scale: 1.04 }, { scale: 1.03, x: 10 }, { scale: 1.06 }][i];
    const camAmb = h("div", "", null);
    void camAmb;
    tl.fromTo(`#${s.id} .cam`, { scale: 1 }, { scale: amb.scale, duration: s.end - s.start + 0.4, ease: "none" }, Math.max(0, s.start - 0.1));
  });
  F("#hud", { y: -60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.25);

  // ---------- scene changes: one continuous descent, with two accents ----------
  function cut(a, b, type) {
    const t = SC[b].start;
    const A = "#" + a;
    const B = "#" + b;
    if (type === "zoom") {
      tl.to(A, { scale: 1.6, filter: "blur(16px)", opacity: 0, duration: 0.3, ease: "power3.in" }, t - 0.26);
      F(B, { scale: 0.72, filter: "blur(16px)", opacity: 0 }, { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.55, ease: "expo.out" }, t - 0.02);
    } else if (type === "flash") {
      F("#flash", { opacity: 0 }, { opacity: 0.9, duration: 0.07, ease: "power2.in" }, t - 0.07);
      tl.to("#flash", { opacity: 0, duration: 0.45, ease: "power2.out" }, t);
      tl.to(A, { opacity: 0, duration: 0.06, ease: "none" }, t - 0.06);
      F(B, { scale: 1.14, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "power4.out" }, t);
    } else if (type === "dissolve") {
      tl.to(A, { filter: "blur(22px)", opacity: 0, duration: 0.55, ease: "sine.inOut" }, t - 0.35);
      F(B, { filter: "blur(22px)", opacity: 0 }, { filter: "blur(0px)", opacity: 1, duration: 0.7, ease: "sine.inOut" }, t - 0.2);
    } else {
      tl.to(A, { y: -300, filter: "blur(18px)", opacity: 0, duration: 0.3, ease: "power2.in" }, t - 0.26);
      F(B, { y: 300, filter: "blur(18px)", opacity: 0 }, { y: 0, filter: "blur(0px)", opacity: 1, duration: 0.5, ease: "power3.out" }, t - 0.04);
    }
    tl.set(A, { visibility: "hidden" }, t + 0.25);
  }
  cut("s1", "s2", "rise");
  cut("s2", "s3", "rise");
  cut("s3", "s4", "zoom");
  cut("s4", "s5", "rise");
  cut("s5", "s6", "zoom");
  cut("s6", "s7", "rise");
  cut("s7", "s8", "flash");
  cut("s8", "s9", "dissolve");

  // ================= S1 · hook =================
  (function () {
    $("#s1-hanger").innerHTML = hangerSVG();
    $("#s1-jacket").innerHTML = jacketSVG;
    $("#s1-t1").innerHTML = '<span>沒</span><span>有</span><span class="name"><span>黃</span><span>仁</span><span>勳</span><u></u></span><span>的</span><span class="nv">輝</span><span class="nv">達</span>';
    const chars = $$("#s1-t1 > span:not(.name), #s1-t1 .name > span");
    const order = [chars[0], chars[1], ...$$("#s1-t1 .name > span"), chars[chars.length - 3], chars[chars.length - 2], chars[chars.length - 1]];
    const seq = Array.from(new Set(order));
    F("#s1-spot", { opacity: 0 }, { opacity: 1, duration: 0.1, ease: "none" }, 0.04);
    tl.to("#s1-spot", { opacity: 0.35, duration: 0.05, repeat: 3, yoyo: true, ease: "none" }, 0.2);
    F("#s1-floor", { opacity: 0, scaleX: 0.3 }, { opacity: 1, scaleX: 1, duration: 0.5, ease: "power2.out" }, 0.1);
    F("#s1-rig", { y: -60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: "power3.out" }, 0.06);
    F(seq, { y: 80, opacity: 0, rotation: 10 }, { y: 0, opacity: 1, rotation: 0, duration: 0.36, ease: "back.out(2)", stagger: 0.035 }, 0.12);
    F("#s1-t1 .name u", { scaleX: 0 }, { scaleX: 1, duration: 0.26, ease: "power4.out" }, L("s1", 0, 0.62));
    tl.to("#s1-t1 .name > span", { color: C.mute, duration: 0.25 }, L("s1", 0, 0.66));
    // "還剩下什麼？" — the jacket is gone
    const t1 = L("s1", 1);
    F("#s1-t2", { scale: 1.8, opacity: 0, filter: "blur(16px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "expo.out" }, t1 - 0.06);
    tl.to("#s1-t2 i", { rotation: 14, duration: 0.22, repeat: 9, yoyo: true, ease: "sine.inOut" }, t1 + 0.3);
    tl.to("#s1-jacket", { y: -1500, rotation: -16, duration: 0.4, ease: "power3.in" }, t1 + 0.08);
    shake("#s1 .cam", t1 - 0.02, 14, 4);
    tl.fromTo("#s1-hanger", { rotation: 0 }, { rotation: 11, duration: 0.2, ease: "power2.out" }, t1 + 0.42);
    [-8, 6, -4, 2.5, -1, 0].forEach((r, i) => tl.to("#s1-hanger", { rotation: r, duration: 0.3, ease: "sine.inOut" }, t1 + 0.62 + i * 0.3));
    tl.to("#s1-spot", { opacity: 0.4, duration: 0.05, repeat: 5, yoyo: true, ease: "none" }, t1 + 0.45);
    // "多數人會說：CUDA" — the obvious answer gets hung on the empty hanger
    const t2 = L("s1", 2);
    F("#s1-sign", { y: -640, opacity: 0, rotation: -12 }, { y: 0, opacity: 1, rotation: 0, duration: 0.75, ease: "bounce.out" }, t2 + 0.25);
    F("#s1-me", { x: -560, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, L("s1", 3, 0.05));
    // "我的答案不一樣"
    const t4 = L("s1", 4);
    F("#s1-strike", { scaleX: 0 }, { scaleX: 1, duration: 0.22, ease: "power4.out" }, t4 + 0.2);
    tl.to("#s1-cuda", { color: "#5d695f", duration: 0.25 }, t4 + 0.26);
    tl.to("#s1-sign", { rotation: 6, y: 16, duration: 0.7, ease: "elastic.out(1, 0.35)" }, t4 + 0.3);
    F("#s1-stamp", { scale: 2.4, opacity: 0, rotation: -18 }, { scale: 1, opacity: 1, rotation: -6, duration: 0.24, ease: "power4.out" }, t4 + 0.62);
  })();

  // ================= S2 · the CUDA moat =================
  (function () {
    const T = SC.s2.start - 0.22; // content rides in with the scene change
    const D = SC.s2.end - SC.s2.start;
    const rivals = $("#s2-rivals");
    for (let i = 0; i < 5; i++) h("i", "", rivals, "對手").style.left = i * 112 + "px";
    const fill = $("#s2-fill");
    const names = ["matmul", "conv2d", "softmax", "attention", "layernorm"];
    const strips = names.map((n, k) => {
      const s = h("div", "strip", fill, `<span>kernel_${n}()</span><em>✓ pass</em>`);
      s.style.top = 244 - k * 48 + "px";
      return s;
    });
    F("#s2 .kicker", { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, T + 0.1);
    F("#s2 h2", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, T + 0.18);
    F("#s2-castle", { y: -140, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "back.out(1.5)" }, T + 0.22);
    F("#s2-moat", { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "expo.out" }, T + 0.15);
    tl.fromTo("#s2-moat .waves", { x: 0 }, { x: -240, duration: D + 0.5, ease: "none" }, T);
    F("#s2-gauge", { opacity: 0, scaleY: 1 }, { opacity: 1, scaleY: 1, duration: 0.3 }, T + 0.7);
    // "以前沒人抄得走"
    const t1 = L("s2", 1);
    F("#s2-rivals i", { y: 260, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)", stagger: 0.06 }, t1 - 0.45);
    tl.to("#s2-rivals i", { y: -30, duration: 0.14, repeat: 3, yoyo: true, ease: "power2.out", stagger: 0.05 }, t1 + 0.1);
    F("#s2-nope", { scale: 2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: "power4.out" }, t1 + 0.55);
    // "但 AI 最會寫的就是這種程式" — code fills the moat
    const t2 = L("s2", 2);
    const t3 = L("s2", 3);
    const t4 = L("s2", 4);
    tl.to("#s2-nope", { opacity: 0, scale: 0.8, duration: 0.2, ease: "power2.in" }, t2 - 0.1);
    F("#s2-ai", { scale: 0, rotation: -40, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.5, ease: "back.out(2.2)" }, t2 + 0.05);
    const step = (t4 - t2 - 0.6) / strips.length;
    strips.forEach((s, k) => {
      const at = t2 + 0.55 + k * step;
      F(s, { x: 420, y: 360 + k * 48, opacity: 0, rotation: 10, scale: 0.4 }, { x: 0, y: 0, opacity: 1, rotation: 0, scale: 1, duration: 0.42, ease: "power3.out" }, at);
      tl.to("#s2-gauge", { scaleY: (244 - k * 48) / 292, duration: 0.3, ease: "power2.out" }, at + 0.2);
      tl.to("#s2-ai .ai-chip", { scale: 1.12, duration: 0.08, repeat: 1, yoyo: true }, at);
    });
    F("#s2-verify", { y: 90, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, t3 - 0.1);
    F("#s2-verify .v-check", { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.4, ease: "back.out(3)" }, t3 + 0.9);
    // "這條護城河，正在變窄" — the rivals walk across
    tl.to("#s2-rivals", { y: -206, duration: 0.9, ease: "power2.inOut" }, t4 + 0.1);
    F("#s2-narrow", { scale: 2.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.26, ease: "power4.out" }, t4 + 0.7);
    shake("#s2-castle", t4 + 0.92, 8, 7);
  })();

  // ================= S3 · one chip is not enough =================
  (function () {
    const T = SC.s3.start - 0.22; // content rides in with the scene change
    const slab = $("#s3-slab");
    const bandOf = (r) => (r >= 7 ? 0 : r >= 4 ? 1 : r >= 1 ? 2 : 3);
    const cells = [];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
      const e = h("i", "", slab);
      e.style.left = c * 50 + 3 + "px";
      e.style.top = r * 50 + 3 + "px";
      cells.push({ e, r, c, b: bandOf(r) });
    }
    const chips = $("#s3-chips");
    const slots = [0, 1, 2, 3].map((b) => {
      const s = h("div", "slot", chips, `<div class="gchip"></div><div class="fillbar"></div><div class="cap288"><b>288</b> GB</div>`);
      s.style.left = b * 242 + "px";
      return s;
    });
    // "真正的城牆，在別的地方"
    F("#s3-open > div:first-child", { scale: 0.7, opacity: 0, filter: "blur(12px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.45, ease: "expo.out" }, T + 0.12);
    F("#s3-open .sub", { y: -50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "bounce.out" }, L("s3", 0, 0.75));
    // "現在的 AI 模型有多大？"
    const t1 = L("s3", 1);
    tl.to("#s3-open", { y: -260, scale: 0.5, opacity: 0, duration: 0.32, ease: "power3.in" }, t1 - 0.3);
    F("#s3-head .kicker", { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, t1 - 0.05);
    F("#s3-head h2", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, t1 + 0.05);
    F(cells.map((c) => c.e), { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)", stagger: { each: 0.012, grid: [10, 10], from: "center" } }, t1);
    // "光是模型本身，就要 1,000 GB"
    const t2 = L("s3", 2);
    F("#s3-size", { x: 90, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, t2 - 0.05);
    count($("#s3-num"), 1000, t2 + 0.25, 0.95, "power3.out");
    tl.to("#s3-slab", { scale: 1.05, duration: 0.14, repeat: 1, yoyo: true, ease: "power2.out" }, t2 + 1.15);
    // "而輝達最新的晶片 / 一顆只裝得下 288 GB"
    const t3 = L("s3", 3);
    const t4 = L("s3", 4);
    F(slots[0], { y: 160, opacity: 0, scale: 0.5 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.8)" }, t3);
    F(slots.map((s) => s.querySelector(".fillbar")), { scaleY: 0 }, { scaleY: 0, duration: 0.01 }, T);
    F(slots.map((s) => s.querySelector(".cap288")), { opacity: 0, y: -16 }, { opacity: 0, y: -16, duration: 0.01 }, T);
    tl.to(slots[0].querySelector(".cap288"), { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, t4 + 0.2);
    const band = (b) => cells.filter((c) => c.b === b).map((c) => c.e);
    tl.to(band(0), { backgroundColor: C.green, duration: 0.2, stagger: 0.012 }, t4 + 0.45);
    tl.to(slots[0].querySelector(".fillbar"), { scaleY: 1, duration: 0.5, ease: "power2.out" }, t4 + 0.6);
    tl.to([...band(1), ...band(2), ...band(3)], { backgroundColor: C.red, duration: 0.25, stagger: { each: 0.004, from: "end" } }, t4 + 1.15);
    F("#s3-over", { scale: 2.2, opacity: 0, rotation: -18 }, { scale: 1, opacity: 1, rotation: -5, duration: 0.22, ease: "power4.out" }, t4 + 1.35);
    shake("#s3-slab-wrap", t4 + 1.38, 10, 4);
    // "至少要 4 顆，才塞得進去" — split it
    const t5 = L("s3", 5);
    tl.to("#s3-over", { opacity: 0, scale: 0.7, duration: 0.2, ease: "power2.in" }, t5 - 0.1);
    tl.to(cells.map((c) => c.e), { backgroundColor: C.green, duration: 0.25 }, t5);
    [1, 2, 3].forEach((b) => tl.to(band(b), { y: -b * 16, duration: 0.35, ease: "back.out(2)" }, t5 + 0.05));
    F(slots.slice(1), { y: 160, opacity: 0, scale: 0.5 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.8)", stagger: 0.1 }, t5 + 0.1);
    tl.to(slots.slice(1).map((s) => s.querySelector(".cap288")), { opacity: 1, y: 0, duration: 0.3, stagger: 0.1 }, t5 + 0.4);
    [0, 1, 2, 3].forEach((b) => {
      const at = t5 + 0.55 + b * 0.14;
      const cx = b * 242 + 107;
      cells.filter((c) => c.b === b).forEach((c, i) => {
        tl.to(c.e, { x: cx - (c.c * 50 + 25), y: 1040 + 107 - (470 + c.r * 50 + 25), scale: 0.25, opacity: 0, duration: 0.45, ease: "power2.in" }, at + i * 0.006);
      });
      if (b > 0) tl.to(slots[b].querySelector(".fillbar"), { scaleY: b === 3 ? 0.47 : 1, duration: 0.4, ease: "power2.out" }, at + 0.4);
      tl.to(slots[b].querySelector(".gchip"), { scale: 1.08, duration: 0.1, repeat: 1, yoyo: true }, at + 0.55);
    });
    F("#s3-eq span", { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, t5 + 0.6);
    F("#s3-eq b", { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2.5)" }, t5 + 1.0);
  })();

  // ================= S4 · chips hold meetings =================
  (function () {
    const T = SC.s4.start - 0.22; // content rides in with the scene change
    const E = SC.s4.end;
    const net = $("#s4-net");
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 900 560");
    net.appendChild(svg);
    const pos = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) pos.push({ x: 75 + c * 150, y: 70 + r * 140, r, c });
    const first = pos.filter((p) => p.r === 1 && p.c >= 1 && p.c <= 4);
    const link = (a, b, cls) => {
      const l = document.createElementNS(NS, "line");
      l.setAttribute("x1", a.x); l.setAttribute("y1", a.y); l.setAttribute("x2", b.x); l.setAttribute("y2", b.y);
      l.setAttribute("stroke", C.greenD); l.setAttribute("stroke-width", 4); l.setAttribute("class", cls);
      svg.appendChild(l);
      return { a, b, l };
    };
    const links0 = [0, 1, 2].map((i) => link(first[i], first[i + 1], "lk0"));
    const links1 = [];
    pos.forEach((p) => {
      const right = pos.find((q) => q.r === p.r && q.c === p.c + 1);
      const down = pos.find((q) => q.c === p.c && q.r === p.r + 1);
      const diag = pos.find((q) => q.c === p.c + 1 && q.r === p.r + 1);
      if (right && !(p.r === 1 && p.c >= 1 && p.c <= 3)) links1.push(link(p, right, "lk1"));
      if (down) links1.push(link(p, down, "lk1"));
      if (diag && (p.r + p.c) % 2 === 0) links1.push(link(p, diag, "lk1"));
    });
    const chipEls = pos.map((p) => {
      const e = h("div", "gchip", net);
      e.style.left = p.x - 52 + "px";
      e.style.top = p.y - 52 + "px";
      p.e = e;
      return e;
    });
    const firstEls = first.map((p) => p.e);
    const restEls = chipEls.filter((e) => !firstEls.includes(e));
    F("#s4 .kicker", { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, T + 0.15);
    F("#s4 h2", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, T + 0.22);
    F(firstEls, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2)", stagger: 0.07 }, T + 0.2);
    F(".lk0", { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.08 }, T + 0.5);
    F(".lk1", { opacity: 0 }, { opacity: 0, duration: 0.01 }, T);
    // "每算一步，就要互相對一次答案"
    const t1 = L("s4", 1);
    links0.forEach((k, i) => {
      const p = h("div", "pk", net);
      F(p, { x: k.a.x, y: k.a.y }, { x: k.b.x, y: k.b.y, duration: 0.34, ease: "power1.inOut", repeat: 7, yoyo: true }, t1 + i * 0.09);
      tl.set(p, { opacity: 1 }, t1 + i * 0.09);
      tl.set(p, { opacity: 0 }, t1 + i * 0.09 + 0.34 * 8);
      tl.to([k.a.e, k.b.e], { scale: 1.1, duration: 0.17, repeat: 7, yoyo: true, ease: "sine.inOut" }, t1 + i * 0.09);
    });
    // "等於幾十顆晶片 / 每秒要開上萬次會"
    const t2 = L("s4", 2);
    const t3 = L("s4", 3);
    F(restEls, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)", stagger: { each: 0.025, from: "center" } }, t2);
    tl.to(".lk1", { opacity: 1, duration: 0.25, stagger: 0.008 }, t2 + 0.3);
    F("#s4-count", { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, t2 + 0.25);
    count($("#s4-num"), 10000, t3 + 0.1, 1.3, "power2.in");
    tl.to("#s4-count .num", { scale: 1.12, duration: 0.12, repeat: 1, yoyo: true, ease: "power2.out" }, t3 + 1.4);
    const all = links0.concat(links1);
    for (let i = 0; i < 34; i++) {
      const k = all[Math.floor(rnd() * all.length)];
      const p = h("div", "pk", net);
      const at = t2 + 0.5 + rnd() * 1.2;
      const d = 0.2 + rnd() * 0.14;
      const n = Math.max(1, Math.floor((E - 0.3 - at) / d));
      const flip = rnd() > 0.5;
      const a = flip ? k.b : k.a;
      const b = flip ? k.a : k.b;
      F(p, { x: a.x, y: a.y }, { x: b.x, y: b.y, duration: d, ease: "none", repeat: n - 1, yoyo: true }, at);
      tl.set(p, { opacity: 1 }, at);
      tl.set(p, { opacity: 0 }, at + d * n);
    }
    // "比的不是誰算得快，而是誰「開會」快"
    const t4 = L("s4", 4);
    const t5 = L("s4", 5);
    F("#s4-vs .lose", { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, t4 + 0.5);
    tl.to(chipEls, { borderColor: "#55614f", duration: 0.3 }, t4 + 0.9);
    F("#s4-vs .win", { scale: 1.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2.4)" }, t5 + 0.15);
    tl.to("#s4-net line", { stroke: C.copper, strokeWidth: 7, duration: 0.3, stagger: 0.004 }, t5 + 0.15);
  })();

  // ================= S5 · email vs one table =================
  (function () {
    const T = SC.s5.start - 0.22; // content rides in with the scene change
    const dotsEl = $("#s5-dots");
    const P = seats(540, 490, 432, 258);
    const scatter = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 8; c++) scatter.push({ x: 100 + c * 125 + (rnd() - 0.5) * 60, y: 70 + r * 92 + (rnd() - 0.5) * 44 });
    // pair each seat with the nearest free scatter point so the gather reads as one move
    const free = scatter.slice();
    const dots = P.map((p) => {
      let bi = 0;
      let bd = 1e9;
      free.forEach((s, i) => { const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2; if (d < bd) { bd = d; bi = i; } });
      const s = free.splice(bi, 1)[0];
      const e = h("i", "", dotsEl);
      e.style.left = p.x + "px";
      e.style.top = p.y + "px";
      return { e, p, s };
    });
    const NS = "http://www.w3.org/2000/svg";
    const svg = $("#s5-spokes");
    const spokes = P.map((p) => {
      const l = document.createElementNS(NS, "line");
      l.setAttribute("x1", 540); l.setAttribute("y1", 490); l.setAttribute("x2", p.x); l.setAttribute("y2", p.y);
      svg.appendChild(l);
      return l;
    });
    F("#s5-head-a .kicker", { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, T + 0.1);
    F("#s5-head-a h2", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, T + 0.18);
    F("#s5-table", { scale: 0.4, opacity: 0 }, { scale: 0.4, opacity: 0, duration: 0.01 }, T);
    F(spokes, { opacity: 0 }, { opacity: 0, duration: 0.01 }, T);
    // scattered people, slow mail
    const t2 = L("s5", 2);
    dots.forEach((d, i) => {
      F(d.e, { x: d.s.x - d.p.x, y: d.s.y - d.p.y, scale: 0, backgroundColor: "#6f7b72" }, { x: d.s.x - d.p.x, y: d.s.y - d.p.y, scale: 1, backgroundColor: "#6f7b72", duration: 0.3, ease: "back.out(2)" }, T + 0.15 + (i % 12) * 0.02 + Math.floor(i / 12) * 0.03);
    });
    const mail = $("#s5-mail");
    for (let i = 0; i < 11; i++) {
      const a = scatter[Math.floor(rnd() * scatter.length)];
      let b = scatter[Math.floor(rnd() * scatter.length)];
      if (b === a) b = scatter[(scatter.indexOf(a) + 17) % scatter.length];
      const m = h("i", "", mail);
      const at = L("s5", 0, 0.1) + i * 0.28;
      F(m, { x: a.x, y: a.y, opacity: 0, rotation: -8 }, { x: b.x, y: b.y, opacity: 1, rotation: 8, duration: 2.6, ease: "sine.inOut" }, at);
    }
    F("#s5-label-a", { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, L("s5", 1, -0.1));
    tl.to("#s5-label-a i", { opacity: 0.2, duration: 0.3, repeat: 7, yoyo: true, ease: "sine.inOut" }, L("s5", 1, 0.3));
    // "輝達的 NVLink" — everyone sits down at one table
    tl.to("#s5-mail", { opacity: 0, duration: 0.2 }, t2 - 0.1);
    tl.to("#s5-head-a", { opacity: 0, y: -40, duration: 0.2, ease: "power2.in" }, t2 - 0.15);
    tl.to("#s5-label-a", { opacity: 0, y: 50, duration: 0.25, ease: "power2.in" }, t2 - 0.1);
    F("#s5-head-b .kicker", { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: "power3.out" }, t2 + 0.05);
    F("#s5-head-b h2", { scale: 1.6, opacity: 0, filter: "blur(14px)", transformOrigin: "0% 50%" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.35, ease: "expo.out" }, t2 + 0.1);
    tl.set("#s5-head-b", { opacity: 1 }, t2);
    tl.to("#s5-table", { scale: 1, opacity: 1, duration: 0.75, ease: "expo.out" }, t2 + 0.1);
    dots.forEach((d, i) => tl.to(d.e, { x: 0, y: 0, backgroundColor: C.green, duration: 0.85, ease: "expo.inOut" }, t2 - 0.05 + i * 0.006));
    tl.to(spokes, { opacity: 0.5, duration: 0.3, stagger: 0.006 }, t2 + 0.8);
    tl.fromTo("#s5-table .hub", { scale: 0.6 }, { scale: 1, duration: 0.6, ease: "elastic.out(1, 0.5)" }, t2 + 0.75);
    F("#s5-label-b", { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, L("s5", 3, 0.5));
    // "直接看彼此的筆記"
    const t4 = L("s5", 4);
    [0, 0.5, 1.0].forEach((o) => F("#s5-ripple", { scale: 0.12, opacity: 0.9 }, { scale: 1.12, opacity: 0, duration: 0.75, ease: "power2.out", immediateRender: false }, t4 + 0.05 + o));
    tl.to(spokes, { opacity: 1, strokeWidth: 6, duration: 0.14, repeat: 5, yoyo: true, ease: "sine.inOut" }, t4 + 0.05);
    dots.forEach((d, i) => tl.to(d.e, { backgroundColor: "#f2f4ea", scale: 1.3, duration: 0.12, repeat: 3, yoyo: true }, t4 + 0.08 + (i % 40) * 0.008));
  })();

  // ================= S6 · the moderator =================
  (function () {
    const T = SC.s6.start - 0.22; // content rides in with the scene change
    const P = seats(540, 250, 352, 162);
    const dotsEl = $("#s6-dots");
    const els = P.map((p) => {
      const e = h("i", "", dotsEl);
      e.style.left = p.x + "px";
      e.style.top = p.y + "px";
      return e;
    });
    const pick = [33, 7, 20];
    pick.forEach((i, n) => { h("u", "", els[i], String(n + 1)); els[i].style.zIndex = 5; });
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("pathLength", "1");
    path.setAttribute("d", `M${P[33].x} ${P[33].y} L540 250 L${P[7].x} ${P[7].y} L540 250 L${P[20].x} ${P[20].y}`);
    $("#s6-route").appendChild(path);
    F("#s6 .kicker", { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, T + 0.15);
    F("#s6 h2", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, T + 0.22);
    F("#s6-tablewrap", { y: 190, scale: 1.22 }, { y: 190, scale: 1.22, duration: 0.01 }, T);
    tl.to("#s6-tablewrap", { y: 0, scale: 1, duration: 0.55, ease: "power3.inOut" }, L("s6", 2, -0.3));
    F("#s6-table", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "expo.out" }, T + 0.1);
    F(els, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)", stagger: 0.006 }, T + 0.2);
    F("#s6-host", { y: -260, opacity: 0 }, { y: 0, opacity: 1, duration: 0.65, ease: "bounce.out" }, L("s6", 0, 0.25));
    tl.to("#s6-host .mic", { scale: 1.15, duration: 0.3, repeat: 9, yoyo: true, ease: "sine.inOut" }, L("s6", 0, 0.9));
    // "決定誰先講、資料怎麼走"
    const t1 = L("s6", 1);
    F(pick.map((i) => els[i].querySelector("u")), { scale: 0 }, { scale: 1, duration: 0.3, ease: "back.out(3)", stagger: 0.24 }, t1 + 0.15);
    pick.forEach((i, n) => tl.to(els[i], { backgroundColor: C.copper, duration: 0.2 }, t1 + 0.15 + n * 0.24));
    F(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut" }, t1 + 0.95);
    // "有趣的是，它的程式碼 / 連對手 AMD 都拿去改"
    const t2 = L("s6", 2);
    const t3 = L("s6", 3);
    F("#s6-code", { y: 460, opacity: 0, rotation: 3 }, { y: 0, opacity: 1, rotation: 0, duration: 0.55, ease: "power3.out" }, t2 - 0.1);
    F("#s6-l1", { "--sweep": 0 }, { "--sweep": 1, duration: 0.4, ease: "power2.out" }, t2 + 0.75);
    F("#s6-l2", { "--sweep": 0 }, { "--sweep": 1, duration: 0.4, ease: "power2.out" }, t3 + 0.35);
    F("#s6-call", { scale: 0, opacity: 0, transformOrigin: "100% 100%" }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2.4)" }, t3 + 0.85);
    // "真正抄不走的 / 是在上萬顆晶片上 / 磨了好幾年的實戰經驗"
    const t4 = L("s6", 4);
    const t5 = L("s6", 5);
    const t6 = L("s6", 6);
    tl.to("#s6-tablewrap", { opacity: 0, scale: 0.8, duration: 0.3, ease: "power2.in" }, t4 - 0.05);
    tl.to("#s6-code", { opacity: 0.4, duration: 0.4 }, t4);
    F("#s6-farm", { opacity: 0, scale: 1.2 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }, t4 + 0.2);
    F("#s6-farm .farm-lab", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" }, t5);
    F("#s6-farm .scan", { x: -160 }, { x: 940, duration: 1.3, ease: "none", repeat: 3 }, t4 + 0.4);
    F("#s6-years", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }, t6 - 0.15);
    F("#s6-yfill", { scaleX: 0 }, { scaleX: 1, duration: 1.3, ease: "power1.inOut" }, t6);
    F("#s6-stamp", { scale: 2.4, opacity: 0, rotation: -20 }, { scale: 1, opacity: 1, rotation: -5, duration: 0.24, ease: "power4.out" }, t6 + 0.85);
    shake("#s6-top", t6 + 0.88, 8, 4);
  })();

  // ================= S7 · still there? =================
  (function () {
    const T = SC.s7.start - 0.22; // content rides in with the scene change
    $("#s7-hanger").innerHTML = hangerSVG();
    F("#s7-q .spot", { opacity: 0 }, { opacity: 1, duration: 0.3 }, T + 0.1);
    F("#s7-hanger", { y: -200, opacity: 0, rotation: -14 }, { y: 0, opacity: 1, rotation: 8, duration: 0.5, ease: "power3.out" }, T + 0.1);
    [-6, 4, -2, 0].forEach((r, i) => tl.to("#s7-hanger", { rotation: r, duration: 0.4, ease: "sine.inOut" }, T + 0.6 + i * 0.4));
    F("#s7-q .q1", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, L("s7", 0, 0.05));
    F("#s7-q .q2", { scale: 0.8, opacity: 0, filter: "blur(10px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.4, ease: "expo.out" }, L("s7", 0, 0.75));
    // "還在。"
    const t1 = L("s7", 1);
    F("#s7-yes", { scale: 3.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: "power4.out" }, t1 - 0.04);
    shake("#s7 .cam", t1 + 0.14, 16, 5);
    // "早就寫進硬體、產品藍圖 / 和簽好的合約裡"
    const t2 = L("s7", 2);
    const t3 = L("s7", 3);
    tl.to("#s7-q", { opacity: 0, y: -120, duration: 0.3, ease: "power2.in" }, t2 - 0.3);
    tl.to("#s7-yes", { y: -735, scale: 0.4, duration: 0.5, ease: "power3.inOut" }, t2 - 0.28);
    const bricks = $$("#s7-plaques .brick");
    const mid = t2 + (SC.s7.lines[2].end - t2) * 0.58;
    F(bricks[0], { x: -700, opacity: 0 }, { x: 0, opacity: 1, duration: 0.42, ease: "expo.out" }, t2 + 0.35);
    F(bricks[1], { x: 700, opacity: 0 }, { x: 0, opacity: 1, duration: 0.42, ease: "expo.out" }, mid);
    F(bricks[2], { y: 200, opacity: 0, scale: 0.8 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.8)" }, t3 + 0.1);
    // "光是網路這門生意 / 一季就進帳 150 億美元 / 年增將近 3 倍"
    const t4 = L("s7", 4);
    const t5 = L("s7", 5);
    const t6 = L("s7", 6);
    F("#s7-money .lab", { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, t4);
    F("#s7-money .big", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, t5 - 0.1);
    count($("#s7-num"), 150, t5 + 0.1, 1.0, "power3.out");
    F("#s7-money .row span, #s7-money .src", { opacity: 0 }, { opacity: 1, duration: 0.3 }, t6 - 0.2);
    F("#s7-b1", { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: "power2.out" }, t6 - 0.1);
    F("#s7-b2", { scaleX: 0 }, { scaleX: 1, duration: 0.75, ease: "expo.out" }, t6 + 0.15);
    F("#s7-money .row b", { scale: 0.4, opacity: 0, transformOrigin: "0% 50%" }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.5)" }, t6 + 0.55);
  })();

  // ================= S8 · the self-rebuttal =================
  (function () {
    const T = SC.s8.start;
    const mini = (sel) => {
      const m = $(sel);
      h("div", "tb", m);
      return seats(230, 139, 204, 112).map((p) => {
        const e = h("i", "", m);
        e.style.left = p.x + "px";
        e.style.top = p.y + "px";
        return e;
      });
    };
    const nv = mini("#s8-nv");
    const amd = mini("#s8-amd");
    tl.to("#glow-r", { opacity: 1, duration: 0.5 }, T);
    tl.to("#glow-a", { opacity: 0.25, duration: 0.5 }, T);
    tl.to("#glow-r", { opacity: 0, duration: 1.2 }, SC.s9.start - 0.3);
    tl.to("#glow-a", { opacity: 1, duration: 1.2 }, SC.s9.start - 0.3);
    F("#s8-slap", { scale: 1.7, opacity: 0, rotation: -6 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.24, ease: "power4.out" }, T + 0.02);
    shake("#s8 .cam", T + 0.2, 18, 6);
    // "AMD 也做出 72 顆晶片的整櫃系統 / Anthropic 已經下單"
    const t1 = L("s8", 1);
    const t2 = L("s8", 2);
    tl.to("#s8-slap", { y: -300, scale: 0.5, opacity: 0, duration: 0.3, ease: "power3.in" }, t1 - 0.35);
    tl.set("#s8-head", { opacity: 1 }, t1 - 0.1);
    F("#s8-head .kicker", { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, t1 - 0.1);
    F("#s8-head h2", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, t1);
    F("#s8-duel .nv", { x: -160, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, t1 - 0.05);
    F(nv, { scale: 0 }, { scale: 1, duration: 0.25, ease: "back.out(2)", stagger: 0.004 }, t1 + 0.1);
    F("#s8-duel .amd", { y: 420, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "back.out(1.5)" }, t1 + 0.45);
    F(amd, { scale: 0 }, { scale: 1, duration: 0.25, ease: "back.out(2)", stagger: 0.012 }, t1 + 0.8);
    F("#s8-order", { scale: 2.4, opacity: 0, rotation: 18 }, { scale: 1, opacity: 1, rotation: 4, duration: 0.24, ease: "power4.out" }, t2 + 0.75);
    shake("#s8-duel .amd", t2 + 0.78, 8, 4);
    // "不是只有它做得到 / 而是它已經做到第三代"
    const t3 = L("s8", 3);
    const t4 = L("s8", 4);
    F("#s8-gnv i", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "back.out(2)", stagger: 0.14 }, t3 + 0.2);
    F("#s8-gamd i", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "back.out(2)", stagger: 0.1 }, t3 + 1.0);
    tl.to("#s8-gnv i.now", { scale: 1.18, boxShadow: "0 0 50px 6px rgba(155,224,0,0.7)", duration: 0.25, repeat: 3, yoyo: true, ease: "sine.inOut" }, t4 + 0.55);
    // "時間的領先，終究會被追上"
    const t5 = L("s8", 5);
    F("#s8-race .lab", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, t5 - 0.25);
    F("#s8-race .lane", { opacity: 0 }, { opacity: 1, duration: 0.3 }, t5 - 0.1);
    tl.to("#s8-gaplab", { x: 150, duration: SC.s8.end - t5 - 0.5, ease: "power1.in" }, t5 + 0.45);
    F("#s8-c1", { x: 200 }, { x: 0, duration: 0.5, ease: "power3.out" }, t5 - 0.1);
    F("#s8-c2", { x: -200 }, { x: 0, duration: 0.5, ease: "power3.out" }, t5 - 0.1);
    const run = SC.s8.end - t5 - 0.5;
    tl.to("#s8-c2", { x: 450, duration: run, ease: "power1.in" }, t5 + 0.45);
    F("#s8-gap", { scaleX: 1 }, { scaleX: 0.224, duration: run, ease: "power1.in" }, t5 + 0.45);
  })();

  // ================= S9 · close =================
  (function () {
    const T = SC.s9.start - 0.22; // content rides in with the scene change
    $("#s9-hanger").innerHTML = hangerSVG();
    const wall = $("#s9-wall");
    const code = ["nvlink.route()", "ncclAllReduce", "rack[72]", "topology.tune", "ring.sync()", "copper.lane", "gen3.rack", "retry.backoff"];
    const bricks = [];
    for (let r = 0; r < 13; r++) {
      let x = r % 2 ? -110 : -20;
      let i = 0;
      while (x < 1130) {
        const w = 150 + Math.floor(rnd() * 5) * 30;
        const isCode = rnd() > 0.55;
        const b = h("i", isCode ? "cd" : "cu", wall, isCode ? code[Math.floor(rnd() * code.length)] : "");
        b.style.left = x + "px";
        b.style.top = r * 90 + "px";
        b.style.width = w - 6 + "px";
        bricks.push({ e: b, r, i: i++ });
        x += w;
      }
    }
    bricks.forEach((b) => F(b.e, { y: 240, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, T + 0.05 + (12 - b.r) * 0.07 + b.i * 0.02));
    F("#s9-spot", { opacity: 0 }, { opacity: 1, duration: 0.6 }, T + 0.2);
    F("#s9-shade", { opacity: 0.3 }, { opacity: 1, duration: 0.5, ease: "power2.out" }, L("s9", 3, -0.25));
    F("#s9-hanger", { opacity: 0, rotation: 7 }, { opacity: 1, rotation: -5, duration: 0.8, ease: "sine.inOut" }, T + 0.2);
    const sw = Math.floor((TM.total - T - 1.2) / 1.1);
    tl.to("#s9-hanger", { rotation: 4, duration: 1.1, repeat: Math.max(0, sw - 1), yoyo: true, ease: "sine.inOut" }, T + 1.0);
    F("#s9-a .l1", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power2.out" }, L("s9", 0, 0));
    F("#s9-a .l2", { scale: 1.3, opacity: 0, filter: "blur(12px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.4, ease: "expo.out" }, L("s9", 1, 0.05));
    // a shimmer runs up the wall on "最硬的那一半"
    bricks.forEach((b) => tl.to(b.e, { filter: "brightness(1.45)", duration: 0.16, repeat: 1, yoyo: true }, L("s9", 1, 0.7) + (12 - b.r) * 0.04));
    // "這道牆，還能領先幾年？"
    const t3 = L("s9", 3);
    const reel = $("#s9-reel");
    ["1", "2", "3", "5", "8", "10", "?"].forEach((n) => h("u", "", reel, n));
    F("#s9-q .l1", { scale: 1.8, opacity: 0, filter: "blur(14px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "expo.out" }, t3 - 0.05);
    F("#s9-q .l2", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, t3 + 0.5);
    F(reel, { y: 0 }, { y: -170 * 6, duration: 1.5, ease: "power3.out" }, t3 + 0.55);
    tl.to("#s9-q .l2 i", { rotation: 14, scale: 1.2, duration: 0.25, repeat: 11, yoyo: true, ease: "sine.inOut", transformOrigin: "50% 80%" }, t3 + 1.6);
    tl.set("#s9-q .l2 i", { display: "inline-block" }, 0);
    // "財報開獎後，我會回來對答案"
    const t4 = L("s9", 4);
    F("#s9-cta .ask", { y: 80, opacity: 0, scale: 0.8 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2)" }, t4 + 0.05);
    F("#s9-cta .follow", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, t4 + 0.5);
    tl.to("#s9-cta .ask i", { y: 10, duration: 0.3, repeat: 11, yoyo: true, ease: "sine.inOut" }, t4 + 0.6);
    tl.to("#s9-cta .ask", { scale: 1.06, duration: 0.5, repeat: 5, yoyo: true, ease: "sine.inOut" }, t4 + 1.4);
  })();

  // ================= captions =================
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
        const show = Math.max(0, ln.start - 0.08);
        const hide = next ? next.start - 0.08 : Math.min(ln.end + 0.3, sc.end + 0.1);
        F(e, { opacity: 0, y: 16, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.14, ease: "back.out(2.2)" }, show);
        tl.set(e, { opacity: 0, visibility: "hidden" }, hide);
      });
    });
  })();

  window.__timelines["main"] = tl;
  tl.seek(0);
})();
