/*! 초록별 퀴즈 마을 — 3D 마을
 *
 * 떠 있는 섬 위의 작은 마을입니다. 가운데 광장에 열이 나는 아기 지구 '동글이'와 지구 열 온도계가 있고,
 * 네 마을(에너지 집 · 재활용 공장 · 쑥쑥 숲 · 등굣길)마다 퀴즈 친구가 기다립니다.
 * 퀴즈를 맞힐 때마다 마을 위 회색 탄소 구름 '뭉게'가 하나씩 나비로 바뀌고,
 * 지구 열이 내려갈수록 하늘이 맑아지고 잔디가 푸르러지며 북극 얼음(지구 위쪽 흰 부분)이 다시 커집니다.
 *
 * 캐릭터 모양과 걸음 움직임은 「푸른하늘 업무체험관」(수도권대기환경청, 2026)의 코드를 바탕으로 했습니다.
 * three.js 0.160.0 (MIT) 사용. index.html이 window.THREE를 채운 뒤 GQWorld.create()를 부릅니다.
 */
(function () {
'use strict';

function create(canvas, opts) {
  opts = opts || {};
  var THREE = window.THREE;
  var isTouch = matchMedia('(pointer: coarse)').matches;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FONT = "'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif";
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var angLerp = function (a, b, t) { var d = (b - a + Math.PI) % (Math.PI * 2); if (d < 0) d += Math.PI * 2; return a + (d - Math.PI) * t; };
  var T = 0;

  /* ---------------- renderer / scene ---------------- */
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  var SKY_DIRTY = new THREE.Color('#d4ccb5'), SKY_CLEAN = new THREE.Color('#a9dcf6');
  scene.background = SKY_DIRTY.clone();
  scene.fog = new THREE.Fog(SKY_DIRTY.clone(), 34, 105);
  var camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 400);
  camera.position.set(0, 16, 26);
  var hemi = new THREE.HemisphereLight('#fff8ec', '#7a9a5e', 0.95);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight('#fff1d6', 1.7);
  sun.position.set(16, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  var mats = new Map();
  function mat(c) { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c })); return mats.get(c); }
  var plushMats = new Map();
  function pm(c, glow) { var k = c + (glow || ''); if (!plushMats.has(k)) plushMats.set(k, new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: glow != null ? glow : (c === '#ffffff' || c === '#fbfbf8' ? 0.4 : 0.18) })); return plushMats.get(k); }
  function put(m, parent, x, y, z, cast) { m.position.set(x, y, z); m.castShadow = cast !== false; m.receiveShadow = true; (parent || scene).add(m); return m; }
  function box(w, h, d, c, x, y, z, p, cast) { return put(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)), p, x, y, z, cast); }
  function cyl(rt, rb, h, c, x, y, z, p, seg) { return put(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16), mat(c)), p, x, y, z); }
  function sph(r, c, x, y, z, p) { return put(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(c)), p, x, y, z); }
  function cone(r, h, c, x, y, z, p, seg) { return put(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 8), mat(c)), p, x, y, z); }
  function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function textPlane(text, o) {
    o = Object.assign({ w: 5, h: 1, bg: '#2f7d5b', fg: '#ffffff', size: 0.58, radius: 0.22 }, o || {});
    var px = 110, c = document.createElement('canvas'); c.width = Math.round(o.w * px); c.height = Math.round(o.h * px);
    var g = c.getContext('2d');
    if (o.bg) { g.fillStyle = o.bg; rr(g, 0, 0, c.width, c.height, o.radius * px); g.fill(); }
    var fs = o.h * px * o.size; g.font = '800 ' + fs + 'px ' + FONT;
    while (g.measureText(text).width > c.width * 0.86 && fs > 10) { fs -= 2; g.font = '800 ' + fs + 'px ' + FONT; }
    g.fillStyle = o.fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, c.width / 2, c.height / 2 + fs * 0.06);
    var tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  }

  /* ---------------- 충돌 ---------------- */
  var circles = [];
  var ISLAND_R = 25.2;
  function addCircle(x, z, r) { var c = { x: x, z: z, r: r }; circles.push(c); return c; }
  function resolve(p, r, self) {
    for (var i = 0; i < circles.length; i++) {
      var c = circles[i]; if (c === self || c.off) continue;
      var dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-4) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
    }
    var dd = Math.hypot(p.x, p.z), mm = ISLAND_R - r;
    if (dd > mm) { p.x *= mm / dd; p.z *= mm / dd; }
  }

  /* ---------------- 트윈 · 파티클 ---------------- */
  var tweens = [];
  function tween(dur, fn, done) { tweens.push({ t: 0, dur: dur, fn: fn, done: done }); if (reduce) { fn(1); } }
  function updateTweens(dt) {
    for (var i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i]; tw.t += dt; var k = Math.min(1, tw.t / tw.dur);
      tw.fn(k); if (k >= 1) { tweens.splice(i, 1); tw.done && tw.done(); }
    }
  }
  var easeOutBack = function (k) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  var easeInOut = function (k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; };

  var parts = [];
  var partGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  var leafGeo = new THREE.BoxGeometry(0.22, 0.03, 0.14);
  function burst(x, y, z, colors, n, opt) {
    opt = opt || {};
    for (var i = 0; i < n; i++) {
      var c = colors[i % colors.length];
      var m = new THREE.Mesh(opt.leaf ? leafGeo : partGeo, pm(c, 0.3));
      m.position.set(x, y, z); scene.add(m);
      var a = rand(0, Math.PI * 2), sp = rand(1.5, opt.leaf ? 3.5 : 5);
      parts.push({ m: m, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rand(3, opt.leaf ? 6 : 7.5), life: opt.life || rand(0.8, 1.3), age: 0, spin: rand(-8, 8), leaf: !!opt.leaf });
    }
  }
  function updateParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]; p.age += dt;
      if (p.age > p.life) { scene.remove(p.m); parts.splice(i, 1); continue; }
      p.vy -= (p.leaf ? 4 : 11) * dt; if (p.leaf) { p.vx *= 0.98; p.vz *= 0.98; p.vy = Math.max(p.vy, -1.4); }
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * 0.7 * dt;
      var s = 1 - Math.max(0, (p.age - p.life * 0.6) / (p.life * 0.4)); p.m.scale.setScalar(Math.max(0.01, s));
    }
  }

  /* 연기 (공장 굴뚝 · 자동차 배기) */
  var puffGeo = new THREE.SphereGeometry(0.4, 10, 8);
  var puffs = [], emitters = [];
  for (var pi = 0; pi < 46; pi++) {
    var pmesh = new THREE.Mesh(puffGeo, new THREE.MeshLambertMaterial({ color: '#8f8b85', transparent: true, opacity: 0, depthWrite: false }));
    pmesh.visible = false; scene.add(pmesh); puffs.push({ m: pmesh, age: 9, life: 2.4 });
  }
  function addEmitter(getPos, rate, size) { var e = { getPos: getPos, rate: rate, size: size || 1, acc: 0, on: true }; emitters.push(e); return e; }
  var tmpV = new THREE.Vector3();
  function updateSmoke(dt) {
    emitters.forEach(function (e) {
      if (!e.on) return; e.acc += dt * e.rate;
      while (e.acc > 1) {
        e.acc -= 1;
        var p = puffs.find(function (q) { return q.age >= q.life; }); if (!p) break;
        e.getPos(tmpV); p.m.position.copy(tmpV); p.age = 0; p.life = rand(2, 2.8); p.size = e.size; p.vx = rand(-0.25, 0.25); p.vz = rand(-0.25, 0.25); p.m.visible = true;
      }
    });
    puffs.forEach(function (p) {
      if (p.age >= p.life) return; p.age += dt;
      var k = p.age / p.life;
      p.m.position.y += dt * 1.1; p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt;
      p.m.scale.setScalar((0.45 + k * 1.1) * p.size); p.m.material.opacity = 0.5 * (1 - k);
      if (p.age >= p.life) p.m.visible = false;
    });
  }

  /* ---------------- 섬 ---------------- */
  var GRASS_DIRTY = new THREE.Color('#a3b27f'), GRASS_CLEAN = new THREE.Color('#7fcd6b');
  var grassMat = new THREE.MeshLambertMaterial({ color: GRASS_DIRTY.clone() });
  var islandTop = new THREE.Mesh(new THREE.CylinderGeometry(28, 28.6, 1.2, 64), grassMat);
  islandTop.position.y = -0.6; islandTop.receiveShadow = true; scene.add(islandTop);
  var dirt = new THREE.Mesh(new THREE.CylinderGeometry(28.55, 8, 13, 48), mat('#c99863')); dirt.position.y = -7.7; scene.add(dirt);
  var band = new THREE.Mesh(new THREE.CylinderGeometry(28.62, 28.4, 1.1, 64), mat('#a97a4c')); band.position.y = -1.7; scene.add(band);
  for (var ri = 0; ri < 9; ri++) { var ra = (ri / 9) * Math.PI * 2 + 0.3, rrad = rand(9, 22); var rk = cone(rand(1.5, 3), rand(4, 8), ri % 2 ? '#b58654' : '#9c7045', Math.cos(ra) * rrad, -12 - rand(0, 3), Math.sin(ra) * rrad, null, 6); rk.rotation.x = Math.PI; rk.castShadow = false; }

  var plaza = cyl(7, 7, 0.14, '#f4ebd7', 0, 0.07, 0, null, 56); plaza.castShadow = false;
  var plazaRim = cyl(7.35, 7.35, 0.1, '#e2d3b1', 0, 0.05, 0, null, 56); plazaRim.castShadow = false;

  /* 마을 위치 */
  var ZPOS = { home: [-13, -10.5], recycle: [13, -10.5], forest: [-13, 11], road: [13, 11] };
  function zoneDir(id) { var p = ZPOS[id], l = Math.hypot(p[0], p[1]); return { x: -p[0] / l, z: -p[1] / l }; } // 마을 → 광장 방향
  Object.keys(ZPOS).forEach(function (id) { // 광장에서 마을로 가는 길
    var p = ZPOS[id], l = Math.hypot(p[0], p[1]), len = l - 7.2, mid = 7 + len / 2;
    var path = box(len, 0.1, 2.4, '#ecdcb8', (p[0] / l) * mid, 0.05, (p[1] / l) * mid, null, false);
    path.rotation.y = -Math.atan2(p[1], p[0]);
  });

  /* ---------------- 나무 · 꽃 · 구름 ---------------- */
  var LEAF = ['#5fb85a', '#6cc463', '#53a650'];
  function tree(x, z, s, kind, parent, noCol) {
    var g = new THREE.Group(); g.position.set(x, 0, z); (parent || scene).add(g);
    cyl(0.17 * s, 0.24 * s, 1.3 * s, '#8a5a35', 0, 0.65 * s, 0, g, 7);
    if (kind === 1) { cone(1.05 * s, 1.7 * s, '#4f9f52', 0, 1.9 * s, 0, g, 7); cone(0.8 * s, 1.4 * s, '#5bb35d', 0, 2.7 * s, 0, g, 7); }
    else { sph(0.85 * s, LEAF[0], 0, 2.0 * s, 0, g); sph(0.6 * s, LEAF[1], 0.45 * s, 2.35 * s, 0.2 * s, g); sph(0.55 * s, LEAF[2], -0.4 * s, 2.25 * s, -0.25 * s, g); }
    if (!noCol) addCircle(x + (parent ? parent.position.x : 0), z + (parent ? parent.position.z : 0), 0.45 * s);
    return g;
  }
  function nearZone(x, z, r) { return Object.keys(ZPOS).some(function (id) { var p = ZPOS[id]; return Math.hypot(x - p[0], z - p[1]) < r; }); }
  for (var ti = 0; ti < 34; ti++) {
    var ta = rand(0, Math.PI * 2), tr = rand(20.5, 24.5), tx = Math.cos(ta) * tr, tz = Math.sin(ta) * tr;
    if (nearZone(tx, tz, 7.5) || (tz > 14 && Math.abs(tx) < 6)) continue;
    tree(tx, tz, rand(0.8, 1.25), Math.random() < 0.4 ? 1 : 0);
  }
  [[-8.5, 3.5], [8.5, 3.5], [-6, -8.5], [6, -8.5]].forEach(function (p, i) { tree(p[0], p[1], 0.9, i % 2); });

  /* 꽃 (맑아질수록 늘어남) */
  var FLOWER_N = 90;
  var stemIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 4), mat('#4f9f52'), FLOWER_N);
  var headIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshLambertMaterial({ color: '#ffffff' }), FLOWER_N);
  var FCOL = ['#ff8fab', '#ffd166', '#ffffff', '#b8a1ff', '#ff9f68', '#8fd3ff'];
  var mtx = new THREE.Matrix4(), fc = new THREE.Color(), fk = 0;
  while (fk < FLOWER_N) {
    var fa = rand(0, Math.PI * 2), fr = rand(8, 24), fx = Math.cos(fa) * fr, fz = Math.sin(fa) * fr;
    if (nearZone(fx, fz, 5.2)) continue;
    mtx.makeTranslation(fx, 0.17, fz); stemIM.setMatrixAt(fk, mtx);
    mtx.makeTranslation(fx, 0.38, fz); headIM.setMatrixAt(fk, mtx);
    headIM.setColorAt(fk, fc.set(FCOL[fk % FCOL.length])); fk++;
  }
  stemIM.count = 0; headIM.count = 0; scene.add(stemIM, headIM);

  /* 둥실 구름 */
  var cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.3 });
  var clouds = [];
  for (var ci = 0; ci < 10; ci++) {
    var cg = new THREE.Group(), cn = 3 + (ci % 3);
    for (var cj = 0; cj < cn; cj++) { var cm = new THREE.Mesh(new THREE.SphereGeometry(rand(1.2, 2), 12, 9), cloudMat); cm.position.set((cj - cn / 2) * 1.6, rand(-0.3, 0.4), rand(-0.6, 0.6)); cg.add(cm); }
    var cr = rand(32, 50), ca = (ci / 10) * Math.PI * 2;
    cg.position.set(Math.cos(ca) * cr, rand(-2, 9), Math.sin(ca) * cr); scene.add(cg);
    clouds.push({ g: cg, a: ca, r: cr, sp: rand(0.008, 0.02) });
  }

  /* 무지개 (지구 열이 다 내려가면) */
  var rainbow = new THREE.Group(); rainbow.position.set(0, -1, -15); rainbow.scale.setScalar(0.001); scene.add(rainbow);
  ['#ff8a8a', '#ffb870', '#ffe377', '#8fe08a', '#7cc8ff', '#b39cff'].forEach(function (c, i) {
    var t = new THREE.Mesh(new THREE.TorusGeometry(12.4 - i * 0.42, 0.21, 8, 64, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 }));
    rainbow.add(t);
  });
  rainbow.visible = false;

  /* ---------------- 탄소 구름 '뭉게' ---------------- */
  var smogMat = new THREE.MeshLambertMaterial({ color: '#8e8a84', transparent: true, opacity: 0.96 });
  var smogDark = new THREE.MeshLambertMaterial({ color: '#77736d', transparent: true, opacity: 0.96 });
  function makeSmog(x, y, z) {
    var g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    var body = new THREE.Group(); g.add(body);
    [[0, 0, 0, 0.62], [0.55, -0.08, 0.05, 0.45], [-0.55, -0.06, 0.02, 0.48], [0.18, 0.32, -0.05, 0.42]].forEach(function (s, i) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(s[3], 12, 9), i === 3 ? smogDark : smogMat); m.position.set(s[0], s[1], s[2]); m.castShadow = true; body.add(m);
    });
    [-0.17, 0.17].forEach(function (ex) { var e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat('#2b2b30')); e.position.set(ex, 0.05, 0.58); body.add(e); });
    var mo = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 10, Math.PI), mat('#2b2b30')); mo.position.set(0, -0.12, 0.6); body.add(mo);
    return { g: g, body: body, base: y, seed: rand(0, 9), alive: true };
  }

  /* 나비 */
  var butterflies = [];
  var wingGeo = new THREE.CircleGeometry(0.22, 10);
  function spawnButterfly(x, y, z, home) {
    var BCOL = ['#ff8fab', '#ffd166', '#b8a1ff', '#ff9f68', '#8fd3ff'];
    var col = BCOL[Math.floor(Math.random() * BCOL.length)];
    var g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    var wm = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
    var L = new THREE.Mesh(wingGeo, wm), R = new THREE.Mesh(wingGeo, wm);
    L.position.x = -0.2; R.position.x = 0.2;
    var lp = new THREE.Group(), rp = new THREE.Group(); lp.add(L); rp.add(R); g.add(lp, rp);
    var bodyM = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.18, 3, 6), mat('#3b3b40')); bodyM.rotation.x = Math.PI / 2; g.add(bodyM);
    g.rotation.x = -Math.PI / 2.6;
    butterflies.push({ g: g, lp: lp, rp: rp, home: home ? home.clone() : new THREE.Vector3(x, 0, z), seed: rand(0, 9), t: 0 });
    if (butterflies.length > 16) { var old = butterflies.shift(); scene.remove(old.g); }
  }
  function updateButterflies(dt) {
    butterflies.forEach(function (b) {
      b.t += dt; var s = b.seed;
      var tx = b.home.x + Math.sin(T * 0.6 + s) * 3, tz = b.home.z + Math.cos(T * 0.45 + s * 1.3) * 3, ty = 1.4 + Math.sin(T * 1.3 + s) * 0.5;
      b.g.position.x = lerp(b.g.position.x, tx, dt * 0.8); b.g.position.z = lerp(b.g.position.z, tz, dt * 0.8); b.g.position.y = lerp(b.g.position.y, ty, dt * 0.8);
      var f = Math.sin(T * 18 + s) * 0.9; b.lp.rotation.y = f; b.rp.rotation.y = -f;
    });
  }

  /* ---------------- 캐릭터: 사람 ---------------- */
  function shade(hex, k) { var c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }
  function makePerson(o) {
    o = Object.assign({ shirt: '#5cb85c', pants: '#3d5a80', hair: '#2a221d', skin: '#f6d2b0', style: 'short', body: 'm', top: 'tee', bottom: 'pants', eye: 'round', mouth: 'smile' }, o || {});
    var root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    var mk = function (geo, c, x, y, z, parent) { var m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); m.castShadow = true; (parent || body).add(m); return m; };
    var cap = function (r, len) { return new THREE.CapsuleGeometry(r, len, 4, 10); };
    var f = o.body === 'f', TR = f ? 0.26 : 0.29, SZ = 0.82;
    var legs = [-0.12, 0.12].map(function (x) {
      var p = new THREE.Group(); p.position.set(x, 0.5, 0); body.add(p);
      if (o.bottom === 'pants') mk(cap(0.1, 0.24), o.pants, 0, -0.2, 0, p);
      else { mk(cap(0.1, 0.06), o.bottom === 'shorts' ? o.pants : o.skin, 0, -0.1, 0, p); mk(cap(0.085, 0.18), o.skin, 0, -0.27, 0, p); }
      var shoe = mk(new THREE.SphereGeometry(0.12, 12, 8), '#3a3f46', 0, -0.44, 0.045, p); shoe.scale.set(1, 0.62, 1.35);
      return p;
    });
    if (o.bottom === 'skirt') mk(new THREE.CylinderGeometry(TR * 0.95, TR * 1.5, 0.3, 14), o.pants, 0, 0.56, 0);
    var torso = mk(cap(TR, 0.1), o.shirt, 0, 0.84, 0); torso.scale.set(1.1, 1, SZ);
    if (o.top === 'hoodie') {
      var hd = mk(new THREE.SphereGeometry(1, 12, 8), shade(o.shirt, 0.85), 0, 1.1, -TR * SZ + 0.02); hd.scale.set(0.22, 0.12, 0.12);
      mk(new THREE.BoxGeometry(0.3, 0.12, 0.02), shade(o.shirt, 0.85), 0, 0.72, TR * SZ);
    }
    var AX = TR * 1.1 + 0.07;
    var arms = [-AX, AX].map(function (x) {
      var p = new THREE.Group(); p.position.set(x, 1.04, 0); body.add(p);
      if (o.top === 'tee') { mk(cap(0.082, 0.05), o.shirt, 0, -0.07, 0, p); mk(cap(0.068, 0.16), o.skin, 0, -0.23, 0, p); }
      else mk(cap(0.075, 0.24), o.shirt, 0, -0.17, 0, p);
      mk(new THREE.SphereGeometry(0.085, 10, 8), o.skin, 0, -0.38, 0, p); return p;
    });
    var head = new THREE.Group(); head.position.set(0, 1.2, 0); body.add(head);
    var HR = 0.42, HY = 0.36;
    var face = mk(new THREE.SphereGeometry(HR, 20, 16), o.skin, 0, HY, 0, head); face.scale.set(1.04, 0.96, 1);
    var sph2 = function (r, c, x, y, z, ps, pl, ts, tl) { return mk(new THREE.SphereGeometry(r, 18, 12, ps || 0, pl == null ? Math.PI * 2 : pl, ts || 0, tl == null ? Math.PI : tl), c, x, y, z, head); };
    if (o.style === 'cap') {
      sph2(0.455, o.shirt, 0, HY + 0.02, 0, 0, Math.PI * 2, 0, Math.PI * 0.5);
      var bill = mk(new THREE.BoxGeometry(0.5, 0.04, 0.3), o.shirt, 0, HY + 0.03, 0.44, head); bill.rotation.x = 0.12;
      sph2(HR + 0.012, o.hair, 0, HY, 0, Math.PI, Math.PI, Math.PI * 0.42, Math.PI * 0.3);
    } else {
      var front = sph2(HR + 0.02, o.hair, 0, HY + 0.01, 0, 0, Math.PI * 2, 0, Math.PI * 0.44); front.rotation.x = -0.16;
      sph2(HR + 0.015, o.hair, 0, HY, 0, Math.PI, Math.PI, 0, Math.PI * (o.style === 'bob' ? 0.86 : 0.7));
      if (o.style === 'bob') [-1, 1].forEach(function (s) { var sd = mk(cap(0.1, 0.18), o.hair, s * 0.39, HY - 0.12, 0.02, head); sd.scale.z = 0.8; });
      if (o.style === 'pony') { var tl = mk(cap(0.11, 0.34), o.hair, 0, HY - 0.05, -0.5, head); tl.rotation.x = 0.55; mk(new THREE.TorusGeometry(0.1, 0.03, 6, 12), '#ffd166', 0, HY + 0.12, -0.42, head).rotation.x = 1.1; }
      if (o.style === 'bun') sph2(0.17, o.hair, 0, HY + 0.45, -0.12);
      if (o.style === 'curly') for (var k = 0; k < 11; k++) { var a = (k / 11) * Math.PI * 2; sph2(0.13, o.hair, Math.cos(a) * 0.34, HY + 0.28 + Math.sin(k * 1.7) * 0.05, Math.sin(a) * 0.3 - 0.05); }
    }
    var EZ = HR - 0.035, INK = '#1d1d22';
    var eyes = [-0.15, 0.15].map(function (x) {
      if (o.eye === 'smile') { var se = mk(new THREE.TorusGeometry(0.05, 0.017, 6, 12, Math.PI), INK, x, HY - 0.005, EZ + 0.022, head); se.userData.sy = 1; return se; }
      var big = o.eye === 'sparkle';
      var e = mk(new THREE.SphereGeometry(big ? 0.077 : 0.062, 12, 10), INK, x, HY + 0.02, EZ, head); e.scale.set(0.85, 1.18, 0.55); e.userData.sy = 1.18;
      mk(new THREE.SphereGeometry(big ? 0.027 : 0.02, 6, 6), '#ffffff', x + 0.022, HY + 0.06, EZ + 0.032, head);
      return e;
    });
    [-1, 1].forEach(function (s) { var b = mk(new THREE.CircleGeometry(0.065, 14), '#f5a3a3', s * 0.25, HY - 0.08, HR - 0.07, head); b.rotation.y = s * 0.6; b.castShadow = false; });
    var MY = HY - 0.12, MZ = HR - 0.025;
    if (o.mouth === 'grin') { var gm = mk(new THREE.CircleGeometry(0.062, 16, Math.PI, Math.PI), '#7a2f33', 0, MY + 0.02, MZ + 0.004, head); gm.castShadow = false; }
    else if (o.mouth === 'o') { var om = mk(new THREE.CircleGeometry(0.03, 14), '#7a2f33', 0, MY, MZ + 0.004, head); om.castShadow = false; }
    else { var sm = mk(new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI), f ? '#c95b6b' : '#9b4a45', 0, MY, MZ, head); sm.rotation.z = Math.PI; sm.castShadow = false; }
    return { root: root, body: body, head: head, eyes: eyes, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1], phase: 0, blink: rand(1, 4), wave: 0, jump: 0, seed: rand(0, 9), land: 0 };
  }
  function animPerson(rig, speed, dt) {
    rig.phase += dt * (2.6 + speed * 1.55);
    var a = Math.min(1, speed / 4) * 0.8, sn = Math.sin(rig.phase), s = sn * a, bounce = Math.abs(sn);
    rig.legL.rotation.x = s * 0.95; rig.legR.rotation.x = -s * 0.95;
    var jumping = rig.jump > 0;
    if (jumping) { rig.armL.rotation.x = lerp(rig.armL.rotation.x, -2.9, 0.3); rig.armR.rotation.x = lerp(rig.armR.rotation.x, -2.9, 0.3); rig.armL.rotation.z = lerp(rig.armL.rotation.z, -0.35, 0.3); rig.armR.rotation.z = lerp(rig.armR.rotation.z, 0.35, 0.3); }
    else if (rig.wave > 0) { rig.armL.rotation.x = -s; rig.armR.rotation.x = lerp(rig.armR.rotation.x, -2.75, 0.3); rig.armR.rotation.z = Math.sin(rig.wave * 13) * 0.45; }
    else { rig.armL.rotation.x = -s * 1.25; rig.armR.rotation.x = lerp(rig.armR.rotation.x, s * 1.25, 0.5); rig.armL.rotation.z = lerp(rig.armL.rotation.z, -0.12 - a * 0.1, 0.2); rig.armR.rotation.z = lerp(rig.armR.rotation.z, 0.12 + a * 0.1, 0.2); }
    rig.wave = Math.max(0, rig.wave - dt);
    var jy = 0;
    if (jumping) { rig.jump -= dt; var k = 1 - rig.jump / 0.55; jy = Math.max(0, 2 * k * (1 - k)); if (rig.jump <= 0) rig.land = 0.18; }
    rig.body.position.y = bounce * 0.075 * (a / 0.8) + jy;
    var idle = 1 - a, breath = Math.sin(T * 2.3 + rig.seed) * 0.018 * idle;
    rig.land = Math.max(0, rig.land - dt);
    var squash = (1 - bounce) * 0.07 * a + (rig.land > 0 ? rig.land * 0.6 : 0);
    rig.body.scale.set(1 + squash * 0.6, 1 - squash + breath, 1 + squash * 0.6);
    rig.body.rotation.z = lerp(rig.body.rotation.z, sn * 0.07 * a + Math.sin(T * 1.2 + rig.seed) * 0.03 * idle, 0.25);
    rig.head.rotation.z = lerp(rig.head.rotation.z, -sn * 0.06 * a + Math.sin(T * 0.9 + rig.seed) * 0.04 * idle, 0.2);
    rig.blink -= dt; var shut = rig.blink < 0.12; rig.eyes.forEach(function (e) { e.scale.y = shut ? 0.12 : (e.userData.sy || 1); }); if (rig.blink < 0) rig.blink = rand(2, 5.5);
  }

  /* ---------------- 캐릭터: 동물 친구 · 얼음이 ---------------- */
  function makeCritter(kind, accent) {
    var PAL = {
      bear: { body: '#fbfbf8', light: '#ffffff', muzzle: '#fff7ec', dark: '#24242a', inner: '#f7b7c3' },
      rabbit: { body: '#fbf3ea', light: '#ffffff', muzzle: '#ffffff', dark: '#3a2f2f', inner: '#f7b7c3' },
      raccoon: { body: '#a6aab0', light: '#eef0f2', muzzle: '#eef0f2', dark: '#4a4e55', inner: '#d9a0aa' },
      squirrel: { body: '#d38f53', light: '#f8dec2', muzzle: '#f8dec2', dark: '#6b4224', inner: '#f2b49a' },
      puppy: { body: '#f2d4a4', light: '#fff4e2', muzzle: '#fff4e2', dark: '#94643c', inner: '#f2a0a0' }
    }[kind];
    var root = new THREE.Group(); root.rotation.order = 'YXZ'; var bod = new THREE.Group(); root.add(bod);
    var mk = function (geo, c, x, y, z, p) { var m = new THREE.Mesh(geo, pm(c)); m.position.set(x, y, z); m.castShadow = true; (p || bod).add(m); return m; };
    var soft = function (r, sx, sy, sz, c, x, y, z, p) { var m = mk(new THREE.SphereGeometry(r, 16, 12), c, x, y, z, p); m.scale.set(sx, sy, sz); return m; };
    var capg = function (r, l) { return new THREE.CapsuleGeometry(r, l, 6, 12); };
    mk(capg(0.37, 0.32), PAL.body, 0, 0.64, 0).scale.set(1, 1, 0.86);
    soft(0.27, 1, 1.1, 0.5, PAL.light, 0, 0.6, 0.25);
    var head = new THREE.Group(); head.position.set(0, 1.28, 0); bod.add(head);
    soft(0.42, 1.04, 0.95, 0.96, PAL.body, 0, 0, 0, head);
    soft(0.16, 1.25, 0.85, 0.72, PAL.muzzle, 0, -0.1, 0.34, head);
    soft(0.055, 1.2, 0.85, 0.8, PAL.dark, 0, -0.05, 0.46, head);
    var eyes = [];
    [-1, 1].forEach(function (s) {
      var e = soft(0.055, 0.85, 1.2, 0.55, '#1d1d22', s * 0.15, 0.07, 0.37, head); e.userData.sy = 1.2; eyes.push(e);
      soft(0.018, 1, 1, 1, '#ffffff', s * 0.15 + 0.02, 0.1, 0.4, head);
      var ch = mk(new THREE.CircleGeometry(0.06, 14), '#f7a8b2', s * 0.26, -0.06, 0.33, head); ch.rotation.y = s * 0.6; ch.castShadow = false;
    });
    var mouth = mk(new THREE.TorusGeometry(0.04, 0.011, 6, 12, Math.PI), '#7a2f33', 0, -0.17, 0.43, head); mouth.rotation.z = Math.PI; mouth.castShadow = false;
    var arms = [-1, 1].map(function (s) { var p = new THREE.Group(); p.position.set(s * 0.36, 0.86, 0.04); p.rotation.z = s * 0.55; bod.add(p); mk(capg(0.095, 0.16), PAL.body, 0, -0.13, 0, p); return p; });
    var legs = [-1, 1].map(function (s) { var p = new THREE.Group(); p.position.set(s * 0.16, 0.3, 0.03); bod.add(p); mk(capg(0.11, 0.08), PAL.body, 0, -0.12, 0.03, p); return p; });
    if (kind === 'bear') {
      [-1, 1].forEach(function (s) { soft(0.12, 1, 1, 0.7, PAL.body, s * 0.28, 0.32, -0.02, head); soft(0.06, 1, 1, 0.5, PAL.inner, s * 0.28, 0.32, 0.05, head); });
      soft(0.09, 1, 1, 1, PAL.body, 0, 0.4, -0.33);
    } else if (kind === 'rabbit') {
      [-1, 1].forEach(function (s) { var e = mk(capg(0.09, 0.42), PAL.body, s * 0.15, 0.55, -0.03, head); e.rotation.z = s * -0.18; var ie = mk(capg(0.045, 0.32), PAL.inner, s * 0.15, 0.55, 0.035, head); ie.rotation.z = s * -0.18; ie.scale.z = 0.4; });
      soft(0.13, 1, 1, 1, '#ffffff', 0, 0.42, -0.36);
    } else if (kind === 'raccoon') {
      soft(0.2, 2.0, 0.55, 0.5, PAL.dark, 0, 0.06, 0.3, head);
      [-1, 1].forEach(function (s) { soft(0.12, 1, 1, 0.6, PAL.dark, s * 0.27, 0.32, -0.02, head); });
      for (var k = 0; k < 4; k++) soft(0.14 - k * 0.012, 1, 1, 1, k % 2 ? PAL.light : PAL.dark, 0, 0.45 + k * 0.17, -0.42 - k * 0.07);
    } else if (kind === 'squirrel') {
      [-1, 1].forEach(function (s) { var e = mk(new THREE.ConeGeometry(0.09, 0.2, 8), PAL.body, s * 0.22, 0.4, -0.02, head); e.rotation.z = s * -0.25; });
      [[0, 0.5, -0.42, 0.2], [0, 0.8, -0.55, 0.24], [0, 1.15, -0.5, 0.25], [0, 1.42, -0.32, 0.2]].forEach(function (t, i) { soft(t[3], 1, 1, 1, i % 2 ? PAL.light : PAL.body, t[0], t[1], t[2]); });
      soft(0.09, 1, 1.15, 1, '#a0642f', 0.33, 0.62, 0.22); soft(0.08, 1, 0.5, 1, '#6b4224', 0.33, 0.71, 0.22);
    } else if (kind === 'puppy') {
      [-1, 1].forEach(function (s) { var e = mk(capg(0.1, 0.22), PAL.dark, s * 0.4, -0.02, 0, head); e.rotation.z = s * 0.25; e.scale.z = 0.55; });
      soft(0.1, 1, 1, 0.5, PAL.dark, 0.17, 0.1, 0.34, head);
      var tail = mk(capg(0.06, 0.2), PAL.body, 0, 0.55, -0.36); tail.rotation.x = -0.8;
    }
    if (accent) {
      var sc = mk(new THREE.TorusGeometry(0.3, 0.07, 8, 18), accent, 0, 0.98, 0); sc.rotation.x = Math.PI / 2; sc.scale.set(1, 0.86, 1);
      soft(0.09, 1, 1, 0.7, accent, 0.12, 0.9, 0.28);
    }
    return { root: root, bod: bod, head: head, eyes: eyes, arms: arms, legs: legs, blink: rand(1, 4), seed: rand(0, 9), jump: 0, wave: 0 };
  }
  function animCritter(c, moving, dt) {
    c.blink -= dt; var shut = c.blink < 0.12; c.eyes.forEach(function (e) { e.scale.y = shut ? 0.15 : e.userData.sy; }); if (c.blink < 0) c.blink = rand(2, 5);
    var ph = T * (moving ? 11 : 2.2) + c.seed;
    var hop = moving ? Math.abs(Math.sin(ph)) * 0.18 : Math.abs(Math.sin(ph * 0.5)) * 0.02;
    if (c.jump > 0) { c.jump -= dt; var k = 1 - c.jump / 0.6; hop += Math.max(0, 2.4 * k * (1 - k)); }
    c.bod.position.y = hop;
    c.legs[0].rotation.x = moving ? Math.sin(ph) * 0.6 : 0; c.legs[1].rotation.x = moving ? -Math.sin(ph) * 0.6 : 0;
    if (c.wave > 0) { c.wave -= dt; c.arms[1].rotation.z = -1.9 + Math.sin(c.wave * 14) * 0.4; }
    else c.arms[1].rotation.z = lerp(c.arms[1].rotation.z, 0.55 + Math.sin(T * 2 + c.seed) * 0.08, 0.15);
    c.arms[0].rotation.z = lerp(c.arms[0].rotation.z, -0.55 - Math.sin(T * 2 + c.seed) * 0.08 - (c.jump > 0 ? 1.4 : 0), 0.2);
    c.bod.rotation.z = Math.sin(T * 1.6 + c.seed) * 0.05;
  }

  /* ---------------- 이름표 ---------------- */
  var labelsEl = document.getElementById('labels');
  var labels = [];
  function addLabel(html, obj, dy, cls) {
    var el = document.createElement('div'); el.className = 'tag ' + (cls || ''); el.innerHTML = html; labelsEl.appendChild(el);
    var L = { el: el, obj: obj, dy: dy || 2.2 }; labels.push(L); return L;
  }
  var lv = new THREE.Vector3();
  function updateLabels() {
    var w = innerWidth, h = innerHeight;
    labels.forEach(function (L) {
      L.obj.getWorldPosition(lv); lv.y += L.dy; lv.project(camera);
      var vis = lv.z < 1 && lv.x > -1.2 && lv.x < 1.2 && lv.y > -1.2 && lv.y < 1.2 && !L.hide;
      L.el.style.display = vis ? '' : 'none';
      if (vis) L.el.style.transform = 'translate(-50%,-100%) translate(' + ((lv.x * 0.5 + 0.5) * w).toFixed(1) + 'px,' + ((-lv.y * 0.5 + 0.5) * h).toFixed(1) + 'px)';
    });
  }

  /* ---------------- 상호작용 대상 ---------------- */
  var targets = [];
  var hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  function addTarget(t, obj, r, y) {
    var hit = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), hitMat); hit.position.y = y; hit.userData.target = t; obj.add(hit);
    t.obj = obj; t.hit = hit; targets.push(t); return t;
  }

  /* ---------------- 광장: 아기 지구 동글이 ---------------- */
  var earth = new THREE.Group(); earth.position.set(0, 0, -2.4); scene.add(earth);
  cyl(1.95, 2.25, 0.7, '#f4ecda', 0, 0.35, 0, earth, 28);
  cyl(2.02, 2.02, 0.12, '#7fcd6b', 0, 0.74, 0, earth, 28);
  addCircle(0, -2.4, 2.35);
  var ball = new THREE.Group(); ball.position.y = 2.75; earth.add(ball);
  var ocean = new THREE.Mesh(new THREE.SphereGeometry(1.75, 32, 24), new THREE.MeshLambertMaterial({ color: '#58b4ea', emissive: '#1f6ea6', emissiveIntensity: 0.16 }));
  ocean.castShadow = true; ball.add(ocean);
  var lands = new THREE.Group(); ball.add(lands);
  var Z1 = new THREE.Vector3(0, 0, 1);
  function blob(theta, phi, r, flat, c, parent) {
    var dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), pm(c, 0.12));
    m.position.copy(dir).multiplyScalar(1.66); m.quaternion.setFromUnitVectors(Z1, dir); m.scale.set(1, 1, flat); (parent || lands).add(m); return m;
  }
  /* 대륙은 얼굴(앞쪽)을 피해서 옆·뒤·아래에만 놓습니다 (θ: 가로 각도, π/2가 정면) */
  [[0.15, 1.35, 0.62], [2.95, 1.45, 0.7], [3.7, 1.15, 0.6], [4.5, 1.65, 0.75], [5.35, 1.05, 0.55], [5.9, 1.9, 0.5], [0.5, 2.05, 0.45], [2.6, 2.1, 0.5], [1.57, 2.62, 0.42]].forEach(function (b, i) {
    blob(b[0], b[1], b[2], 0.3, i % 3 ? '#7ccb6a' : '#a4d97a');
  });
  var iceN = blob(0, 0.001, 0.95, 0.32, '#ffffff', ball); iceN.position.set(0, 1.6, 0);
  var iceS = blob(0, Math.PI - 0.001, 0.75, 0.3, '#ffffff', ball); iceS.position.set(0, -1.62, 0);
  var faceG = new THREE.Group(); ball.add(faceG);
  var ER = 1.75;
  var surfZ = function (x, y, lift) { return Math.sqrt(Math.max(0.01, ER * ER - x * x - y * y)) + (lift || 0); };
  var fmk = function (geo, c, x, y, lift) { var m = new THREE.Mesh(geo, pm(c, 0.1)); m.position.set(x, y, surfZ(x, y, lift)); faceG.add(m); return m; };
  var onFace = function (m, x, y, lift) { m.position.set(x, y, surfZ(x, y, lift)); var n = new THREE.Vector3(x, y, surfZ(x, y, 0)).normalize(); m.quaternion.setFromUnitVectors(Z1, n); faceG.add(m); return m; };
  var eEyes = [-1, 1].map(function (s) { var e = fmk(new THREE.SphereGeometry(0.19, 16, 12), '#1d1d22', s * 0.5, 0.3, 0.02); e.scale.set(0.82, 1.15, 0.55); e.userData.sy = 1.15; return e; });
  [-1, 1].forEach(function (s) { fmk(new THREE.SphereGeometry(0.06, 8, 6), '#ffffff', s * 0.5 + 0.06, 0.4, 0.12); });
  var spark = [-1, 1].map(function (s) { return fmk(new THREE.SphereGeometry(0.035, 8, 6), '#ffffff', s * 0.5 - 0.05, 0.2, 0.12); });
  var eCheeks = [-1, 1].map(function (s) { var c = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), new THREE.MeshBasicMaterial({ color: '#ff6b6b', transparent: true, opacity: 0.85 })); return onFace(c, s * 0.92, -0.08, 0.02); });
  var frown = onFace(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.055, 8, 18, Math.PI), pm('#7a2f33', 0.1)), 0, -0.5, 0.02);
  var smile = onFace(new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.055, 8, 18, Math.PI), pm('#7a2f33', 0.1)), 0, -0.3, 0.02); smile.rotateZ(Math.PI);
  var grin = onFace(new THREE.Mesh(new THREE.CircleGeometry(0.32, 20, Math.PI, Math.PI), new THREE.MeshBasicMaterial({ color: '#c6424a' })), 0, -0.26, 0.03);
  var ohMouth = fmk(new THREE.SphereGeometry(0.12, 12, 8), '#7a2f33', 0, -0.45, 0); ohMouth.scale.set(1, 0.8, 0.4);
  var sweat = [0, 1].map(function (i) { var d = fmk(new THREE.SphereGeometry(0.11, 10, 8), '#9fdcff', i ? -1.2 : 1.22, 0.7, 0.05); d.scale.set(0.8, 1.3, 0.8); d.userData.y0 = 0.7 - i * 0.3; return d; });
  var icePack = new THREE.Group(); icePack.position.set(0.15, 1.72, 0.25); icePack.rotation.z = -0.22; ball.add(icePack);
  var ipm = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.32, 0.95), pm('#bfe9ff', 0.3)); icePack.add(ipm);
  var ipc = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.12, 0.3), pm('#ffffff', 0.4)); ipc.position.y = 0.12; icePack.add(ipc);
  var eArms = [-1, 1].map(function (s) { var p = new THREE.Group(); p.position.set(s * 1.65, -0.25, 0.2); ball.add(p); var a = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 6, 10), pm('#58b4ea', 0.16)); a.position.y = -0.3; p.add(a); p.rotation.z = s * 0.5; return p; });
  var earthT = addTarget({ id: 'earth', type: 'earth', name: '동글이', r: 3.6 }, earth, 2.2, 2.6);
  earthT.pos = earth.position;
  addLabel('<b>아기 지구 동글이</b><small>말 걸어 보기</small>', ball, 2.55, 'earth');

  /* 지구 열 온도계 */
  var thermo = new THREE.Group(); thermo.position.set(3.2, 0, -2.4); scene.add(thermo);
  addCircle(3.2, -2.4, 0.75);
  cyl(0.55, 0.65, 0.35, '#e8dcc4', 0, 0.18, 0, thermo, 16);
  var tubeMat = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 });
  var tube = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 3.4, 16), tubeMat); tube.position.y = 2.55; thermo.add(tube);
  var liqMat = new THREE.MeshLambertMaterial({ color: '#ff5a4f', emissive: '#ff5a4f', emissiveIntensity: 0.35 });
  var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 12), liqMat); bulb.position.y = 0.78; bulb.castShadow = true; thermo.add(bulb);
  var colGeo = new THREE.CylinderGeometry(0.16, 0.16, 3.0, 12); colGeo.translate(0, 1.5, 0);
  var column = new THREE.Mesh(colGeo, liqMat); column.position.y = 1.05; thermo.add(column);
  for (var tk = 0; tk < 6; tk++) box(0.16, 0.035, 0.04, '#7a6a55', 0.32, 1.4 + tk * 0.5, 0, thermo, false);
  var thermoLbl = textPlane('지구 열', { w: 1.8, h: 0.55, bg: '#e8735a' }); thermoLbl.position.set(0, 4.65, 0); thermo.add(thermoLbl);
  var LIQ_HOT = new THREE.Color('#ff5a4f'), LIQ_COOL = new THREE.Color('#47b4ff');

  /* 입구 표지판 */
  var sign = new THREE.Group(); sign.position.set(-3.6, 0, 9.2); scene.add(sign);
  cyl(0.12, 0.14, 2.2, '#8a5a35', -1.4, 1.1, 0, sign, 8); cyl(0.12, 0.14, 2.2, '#8a5a35', 1.4, 1.1, 0, sign, 8);
  box(3.4, 1.1, 0.16, '#f6e7c8', 0, 1.9, 0, sign);
  var sgt = textPlane('초록별 퀴즈 마을', { w: 3.1, h: 0.85, bg: null, fg: '#2f7d5b' }); sgt.position.set(0, 1.9, 0.09); sign.add(sgt);
  addCircle(-3.6, 9.2, 0.6);

  /* ---------------- 네 마을 ---------------- */
  var ZONES = {};
  var zonesMeta = window.GQ_ZONES || [];
  function zoneGroup(id) {
    var p = ZPOS[id], d = zoneDir(id);
    var g = new THREE.Group(); g.position.set(p[0] - d.x * 1.6, 0, p[1] - d.z * 1.6); g.rotation.y = Math.atan2(d.x, d.z); scene.add(g);
    return g;
  }
  function local(g, x, z) { var v = new THREE.Vector3(x, 0, z).applyMatrix4(new THREE.Matrix4().makeRotationY(g.rotation.y)); return { x: g.position.x + v.x, z: g.position.z + v.z }; }
  function colLocal(g, x, z, r) { var w = local(g, x, z); return addCircle(w.x, w.z, r); }
  function signFor(g, text, color, x, z) {
    var s = textPlane(text, { w: 3.6, h: 0.75, bg: color }); s.position.set(x || 0, 4.1, z || 2.6); g.add(s); return s;
  }
  function popIn(obj, delay, instant) {
    obj.visible = true;
    if (instant || reduce) { obj.scale.setScalar(1); return; }
    obj.scale.setScalar(0.001);
    setTimeout(function () { tween(0.7, function (k) { obj.scale.setScalar(Math.max(0.001, easeOutBack(k))); }); }, (delay || 0) * 1000);
  }

  /* 반짝 에너지 집 */
  (function () {
    var g = zoneGroup('home');
    box(4.6, 3, 4.2, '#fff1dc', 0, 1.5, 0, g);
    var roof = cone(3.75, 2.3, '#ef7d63', 0, 4.15, 0, g, 4); roof.rotation.y = Math.PI / 4;
    box(0.5, 1.1, 0.5, '#c9654f', 1.3, 4.6, -0.6, g);
    box(1.0, 1.75, 0.12, '#a8693f', 0, 0.88, 2.12, g);
    sph(0.06, '#ffd166', 0.32, 0.9, 2.2, g);
    var lit = new THREE.MeshLambertMaterial({ color: '#fff0b0', emissive: '#ffc93c', emissiveIntensity: 0.95 });
    var wins = [];
    [[-1.4, 1.95, 2.12], [1.4, 1.95, 2.12], [2.32, 1.9, 0], [-2.32, 1.9, 0]].forEach(function (w, i) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(i < 2 ? 0.95 : 0.12, 0.95, i < 2 ? 0.1 : 0.95), lit); m.position.set(w[0], w[1], w[2]); g.add(m); wins.push(m);
      if (i < 2) box(1.08, 0.1, 0.16, '#ffffff', w[0], w[1] - 0.52, w[2], g, false);
    });
    var bulbL = new THREE.PointLight('#ffcf55', 1.4, 7); bulbL.position.set(0, 2.2, 2.6); g.add(bulbL);
    var panels = new THREE.Group(); panels.position.set(0, 4.05, 1.3); panels.rotation.x = 0.73; g.add(panels);
    [-0.85, 0.85].forEach(function (x) { box(1.5, 0.08, 1.05, '#2c5aa6', x, 0, 0, panels); box(1.56, 0.06, 0.06, '#dfe7ef', x, 0.03, 0.5, panels, false); });
    panels.visible = false;
    var turbine = new THREE.Group(); var tw = local(g, -3.4, 1.2); turbine.position.set(tw.x, 0, tw.z); scene.add(turbine);
    cyl(0.08, 0.13, 3.6, '#f4f4f0', 0, 1.8, 0, turbine, 8);
    var rotor = new THREE.Group(); rotor.position.set(0, 3.6, 0.15); turbine.add(rotor);
    for (var b = 0; b < 3; b++) { var bl = box(0.16, 1.3, 0.05, '#ffffff', 0, 0.65, 0, null); var piv = new THREE.Group(); piv.rotation.z = (b / 3) * Math.PI * 2; piv.add(bl); rotor.add(piv); }
    turbine.rotation.y = g.rotation.y; turbine.visible = false;
    colLocal(g, 0, 0, 2.9);
    signFor(g, '반짝 에너지 집', '#e0a21c', 0, 2.3);
    ZONES.home = { g: g, clear: function (instant) {
      if (instant || reduce) { lit.emissiveIntensity = 0.05; lit.color.set('#bfe3f5'); bulbL.intensity = 0; }
      else tween(1.2, function (k) { lit.emissiveIntensity = lerp(0.95, 0.05, k); lit.color.lerpColors(new THREE.Color('#fff0b0'), new THREE.Color('#bfe3f5'), k); bulbL.intensity = lerp(1.4, 0, k); });
      popIn(panels, 0.6, instant); popIn(turbine, 1.1, instant); addCircle(tw.x, tw.z, 0.35);
    }, update: function (dt) { if (turbine.visible) rotor.rotation.z -= dt * 2.4; } };
  })();

  /* 뚝딱 재활용 공장 */
  (function () {
    var g = zoneGroup('recycle');
    box(5.4, 3.2, 4.2, '#e4ecf2', 0, 1.6, 0, g);
    box(5.6, 0.3, 4.4, '#8fa9bb', 0, 3.35, 0, g);
    [-1.8, 0, 1.8].forEach(function (x) { var t = box(1.7, 0.9, 4.2, '#a9c0d0', x, 3.75, 0, g); t.rotation.z = 0.45; });
    box(2.2, 2.0, 0.12, '#7d93a6', -1.0, 1.0, 2.12, g);
    for (var s = 0; s < 4; s++) box(2.2, 0.05, 0.14, '#6b8194', -1.0, 0.35 + s * 0.45, 2.15, g, false);
    box(0.9, 0.9, 0.1, '#bfe3f5', 1.6, 2.0, 2.12, g);
    cyl(0.45, 0.55, 3.4, '#bba998', 1.9, 4.9, -1.1, g, 12);
    cyl(0.47, 0.47, 0.35, '#e8735a', 1.9, 5.9, -1.1, g, 12);
    var smoke = addEmitter(function (v) { var w = local(g, 1.9, -1.1); v.set(w.x, 6.8, w.z); }, 2.4, 1.3);
    var bins = new THREE.Group(); g.add(bins); bins.position.set(1.4, 0, 3.1);
    [['#3d8bd9', '종이'], ['#f2b93b', '플라'], ['#5cb85c', '유리'], ['#9aa3ad', '캔']].forEach(function (b, i) {
      var x = (i - 1.5) * 0.95; box(0.8, 0.95, 0.8, b[0], x, 0.48, 0, bins); box(0.88, 0.12, 0.88, shade(b[0], 0.85), x, 1.0, 0, bins);
      var l = textPlane(b[1], { w: 0.6, h: 0.3, bg: '#ffffff', fg: '#33424a' }); l.position.set(x, 0.55, 0.41); bins.add(l);
    });
    bins.visible = false;
    colLocal(g, 0, 0, 3.1);
    signFor(g, '뚝딱 재활용 공장', '#2f86c4', -0.4, 2.3);
    ZONES.recycle = { g: g, clear: function (instant) { smoke.on = false; popIn(bins, 0.4, instant); var w = local(g, 1.4, 3.1); addCircle(w.x, w.z, 1.4); }, update: function () {} };
  })();

  /* 쑥쑥 숲 */
  (function () {
    var g = zoneGroup('forest');
    var patchMat = new THREE.MeshLambertMaterial({ color: '#b9a074' });
    var patch = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.06, 32), patchMat); patch.position.set(0, 0.03, -0.5); patch.receiveShadow = true; g.add(patch);
    tree(-2.6, -1.6, 1.15, 0, g, true); tree(2.4, -2.0, 1.0, 1, g, true);
    [[-1, 0.4], [1.2, 0.6], [0.2, -2.4]].forEach(function (s) { cyl(0.36, 0.42, 0.45, '#8a5a35', s[0], 0.22, s[1], g, 10); cyl(0.33, 0.33, 0.02, '#e0b57d', s[0], 0.46, s[1], g, 10); });
    var grow = [];
    [[-0.6, -0.9, 1.25, 0], [1.6, 0.9, 0.9, 1], [-2.2, 1.2, 0.95, 0], [0.4, -3.2, 1.1, 1], [3.0, -0.2, 0.85, 0], [-3.4, -0.2, 0.8, 1]].forEach(function (t) {
      var tr = tree(t[0], t[1], t[2], t[3], g, true); tr.visible = false; grow.push({ tr: tr, x: t[0], z: t[1], s: t[2] });
    });
    var flowersG = new THREE.Group(); g.add(flowersG);
    for (var i = 0; i < 14; i++) { var a = rand(0, Math.PI * 2), r = rand(1, 4.2); cyl(0.03, 0.03, 0.3, '#4f9f52', Math.cos(a) * r, 0.15, Math.sin(a) * r - 0.5, flowersG, 4); sph(0.12, FCOL[i % FCOL.length], Math.cos(a) * r, 0.34, Math.sin(a) * r - 0.5, flowersG); }
    flowersG.visible = false;
    var post = new THREE.Group(); post.position.set(2.2, 0, 2.4); g.add(post);
    cyl(0.1, 0.12, 2.2, '#8a5a35', 0, 1.1, 0, post, 8);
    var ps = textPlane('쑥쑥 숲', { w: 2.0, h: 0.7, bg: '#3e9b4f' }); ps.position.set(0, 2.2, 0.12); post.add(ps);
    colLocal(g, -2.6, -1.6, 0.55); colLocal(g, 2.4, -2.0, 0.5);
    ZONES.forest = { g: g, clear: function (instant) {
      grow.forEach(function (t, i) { popIn(t.tr, 0.25 * i, instant); colLocal(g, t.x, t.z, 0.45 * t.s); });
      popIn(flowersG, 1.4, instant);
      if (instant || reduce) patchMat.color.set('#79c867'); else tween(1.6, function (k) { patchMat.color.lerpColors(new THREE.Color('#b9a074'), new THREE.Color('#79c867'), k); });
    }, update: function () {} };
  })();

  /* 씽씽 등굣길 */
  (function () {
    var g = zoneGroup('road');
    box(12, 0.06, 3.2, '#5d636b', 0, 0.05, -0.6, g, false);
    for (var i = -5; i <= 5; i += 1.6) box(0.8, 0.07, 0.14, '#ffffff', i, 0.07, -0.6, g, false);
    for (var j = 0; j < 5; j++) box(0.36, 0.075, 1.4, '#ffffff', -0.9 + j * 0.45, 0.075, 1.6, g, false);
    var shelter = new THREE.Group(); shelter.position.set(-3.6, 0, 2.6); g.add(shelter);
    [-1, 1].forEach(function (s) { cyl(0.07, 0.07, 2.4, '#7d93a6', s * 1.1, 1.2, -0.4, shelter, 6); });
    box(2.6, 0.12, 1.3, '#7cc8ff', 0, 2.45, -0.2, shelter); box(2.0, 0.12, 0.5, '#c58b55', 0, 0.55, -0.2, shelter);
    var st = textPlane('씽씽 정류장', { w: 2.2, h: 0.5, bg: '#e8735a' }); st.position.set(0, 2.8, -0.2); shelter.add(st);
    var car = new THREE.Group(); g.add(car);
    box(1.9, 0.62, 1.0, '#e5484d', 0, 0.55, 0, car); box(1.0, 0.5, 0.92, '#f7f2ec', -0.1, 1.1, 0, car); box(1.02, 0.36, 0.94, '#9fd3f5', -0.1, 1.12, 0, car, false);
    [[-0.6, 0.5], [0.6, 0.5], [-0.6, -0.5], [0.6, -0.5]].forEach(function (w) { var wh = cyl(0.24, 0.24, 0.16, '#2f3437', w[0], 0.26, w[1], car, 12); wh.rotation.x = Math.PI / 2; });
    var bus = new THREE.Group(); g.add(bus);
    box(3.6, 1.35, 1.35, '#4caf50', 0, 0.95, 0, bus); box(3.62, 0.12, 1.37, '#ffffff', 0, 0.7, 0, bus, false); box(3.0, 0.45, 1.37, '#bfe8ff', 0.1, 1.3, 0, bus, false);
    var bl = textPlane('전기버스', { w: 1.3, h: 0.32, bg: '#ffffff', fg: '#2e7d32' }); bl.position.set(0, 0.95, 0.69); bus.add(bl);
    [[-1.2, 0.62], [1.2, 0.62], [-1.2, -0.62], [1.2, -0.62]].forEach(function (w) { var wh = cyl(0.3, 0.3, 0.18, '#2f3437', w[0], 0.3, w[1], bus, 12); wh.rotation.x = Math.PI / 2; });
    bus.visible = false;
    var bikes = new THREE.Group(); bikes.position.set(3.4, 0, 2.6); g.add(bikes);
    [0, 0.8].forEach(function (z) {
      var b = new THREE.Group(); b.position.z = z - 0.4; bikes.add(b);
      [-0.45, 0.45].forEach(function (x) { var wh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 16), mat('#2f3437')); wh.position.set(x, 0.32, 0); b.add(wh); });
      var fr = box(0.95, 0.07, 0.07, z ? '#ffd166' : '#ff8fab', 0, 0.55, 0, b); fr.rotation.z = 0.15; box(0.07, 0.4, 0.07, '#555b61', 0.35, 0.72, 0, b); box(0.3, 0.06, 0.12, '#2f3437', -0.25, 0.75, 0, b);
    });
    bikes.visible = false;
    var exhaust = addEmitter(function (v) { var w = local(g, car.position.x - car.userData.dir * 1.1, car.position.z); v.set(w.x, 0.45, w.z); }, 3, 0.7);
    car.userData.dir = 1; bus.userData.dir = 1;
    function drive(v, dt, sp) { v.position.x += v.userData.dir * dt * sp; if (Math.abs(v.position.x) > 4.4) { v.userData.dir *= -1; v.position.x = clamp(v.position.x, -4.4, 4.4); } v.rotation.y = v.userData.dir > 0 ? 0 : Math.PI; v.position.z = v.userData.dir > 0 ? -1.3 : 0.1; }
    colLocal(g, -3.6, 2.4, 1.3);
    signFor(g, '씽씽 등굣길', '#d8603f', 1.2, 2.6).position.y = 3.2;
    ZONES.road = { g: g, clear: function (instant) { car.visible = false; exhaust.on = false; popIn(bus, 0.3, instant); popIn(bikes, 0.8, instant); colLocal(g, 3.4, 2.6, 0.9); },
      update: function (dt) { if (car.visible) drive(car, dt, 2.2); if (bus.visible) drive(bus, dt, 1.6); } };
  })();

  /* 마을마다 퀴즈 친구 + 뭉게 5개 */
  zonesMeta.forEach(function (z, zi) {
    var p = ZPOS[z.id], d = zoneDir(z.id);
    var fx = p[0] + d.x * 4.6, fz = p[1] + d.z * 4.6;
    var c = makeCritter(z.animal, z.color); c.root.position.set(fx, 0, fz); c.root.rotation.y = Math.atan2(d.x, d.z); scene.add(c.root);
    c.root.traverse(function (o) { o.castShadow = true; });
    var col = addCircle(fx, fz, 0.55);
    var t = addTarget({ id: z.id, type: 'friend', zone: z.id, name: z.friend, r: 2.6 }, c.root, 1.1, 1.0);
    t.pos = c.root.position; t.critter = c;
    t.label = addLabel('<b>' + z.friend + '</b><small>' + z.topic + ' 퀴즈</small><i class="stamp">✓</i>', c.root, 2.25, 'friend');
    ZONES[z.id].friend = t;
    ZONES[z.id].smogs = [];
    for (var k = 0; k < 5; k++) {
      var a = (k / 5) * Math.PI * 2 + zi, r = 1.6 + (k % 2) * 1.2;
      ZONES[z.id].smogs.push(makeSmog(p[0] + Math.cos(a) * r, 5.2 + (k % 3) * 0.7, p[1] + Math.sin(a) * r));
    }
  });

  /* ---------------- 플레이어 · 얼음이 ---------------- */
  var player = { pos: new THREE.Vector3(0, 0, 7.5), vel: new THREE.Vector3(), heading: Math.PI, rig: null, radius: 0.42 };
  var playerObj = new THREE.Group(); scene.add(playerObj);
  var hatKind = 'none';
  function setAvatar(look) {
    if (player.rig) playerObj.remove(player.rig.root);
    player.rig = makePerson(look); playerObj.add(player.rig.root);
    setHat(hatKind);
  }

  /* 꾸미기 모자 (별을 모으면 열림) */
  function buildHat(kind) {
    var g = new THREE.Group();
    var m = function (geo, c, x, y, z) { var o = new THREE.Mesh(geo, pm(c, 0.2)); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    if (kind === 'sprout') {
      var bd = m(new THREE.TorusGeometry(0.43, 0.03, 6, 24), '#ffd166', 0, 0.62, 0); bd.rotation.x = Math.PI / 2;
      m(new THREE.CylinderGeometry(0.025, 0.03, 0.26, 6), '#4f9f52', 0, 0.92, 0);
      [-1, 1].forEach(function (s) { var l = m(new THREE.SphereGeometry(0.11, 12, 8), '#7ccb6a', s * 0.11, 1.06, 0); l.scale.set(1.5, 0.45, 0.8); l.rotation.z = s * 0.5; });
    } else if (kind === 'bear') {
      m(new THREE.TorusGeometry(0.44, 0.04, 6, 24, Math.PI), '#f4f4f0', 0, 0.36, 0); // 머리 위를 가로지르는 머리띠
      [-1, 1].forEach(function (s) { m(new THREE.SphereGeometry(0.15, 14, 10), '#fbfbf8', s * 0.32, 0.78, -0.02); var inner = m(new THREE.SphereGeometry(0.075, 10, 8), '#f7b7c3', s * 0.32, 0.79, 0.08); inner.scale.z = 0.5; });
    } else if (kind === 'flower') {
      var FC = ['#ff8fab', '#ffd166', '#b8a1ff', '#8fd3ff', '#ff9f68', '#ffffff', '#7ccb6a'];
      for (var i = 0; i < 9; i++) { var a = (i / 9) * Math.PI * 2; m(new THREE.SphereGeometry(i % 2 ? 0.07 : 0.1, 10, 8), FC[i % FC.length], Math.cos(a) * 0.4, 0.64 + Math.sin(i * 1.7) * 0.02, Math.sin(a) * 0.38); }
    } else if (kind === 'earth') {
      m(new THREE.SphereGeometry(0.47, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), '#58b4ea', 0, 0.38, 0);
      [[0.2, 0.75, 0.15, 0.13], [-0.18, 0.72, -0.18, 0.11], [0.05, 0.82, -0.25, 0.09]].forEach(function (p) { var s = m(new THREE.SphereGeometry(p[3], 10, 8), '#7ccb6a', p[0], p[1], p[2]); s.scale.y = 0.5; });
      m(new THREE.SphereGeometry(0.07, 8, 6), '#ffffff', 0, 0.86, 0);
    } else if (kind === 'crown') {
      m(new THREE.CylinderGeometry(0.3, 0.33, 0.18, 18, 1, true), '#ffc933', 0, 0.84, 0).material.side = THREE.DoubleSide;
      for (var k = 0; k < 6; k++) { var b = (k / 6) * Math.PI * 2; m(new THREE.ConeGeometry(0.06, 0.16, 6), '#ffc933', Math.cos(b) * 0.3, 1.0, Math.sin(b) * 0.3); m(new THREE.SphereGeometry(0.035, 8, 6), k % 2 ? '#ff6b8b' : '#47b4ff', Math.cos(b) * 0.32, 0.84, Math.sin(b) * 0.32); }
    }
    return g;
  }
  function setHat(kind) {
    hatKind = kind || 'none';
    if (!player.rig) return;
    if (player.rig.hat) { player.rig.head.remove(player.rig.hat); player.rig.hat = null; }
    if (hatKind !== 'none') { player.rig.hat = buildHat(hatKind); player.rig.head.add(player.rig.hat); }
  }
  setAvatar({});
  var bear = makeCritter('bear', '#4aa3df');
  bear.root.position.set(-1.2, 0, 8.6); scene.add(bear.root);
  var bearPos = bear.root.position, bearHead = Math.PI, bearCol = addCircle(0, 0, 0.42); bearCol.off = true;
  var bearT = addTarget({ id: 'mascot', type: 'mascot', name: '얼음이', r: 2.2 }, bear.root, 0.9, 0.9); bearT.pos = bearPos;
  addLabel('<b>얼음이</b><small>눌러서 같이 놀자!</small>', bear.root, 2.05, 'mascot');

  /* ---------------- 반짝 씨앗 12개 (가까이 가면 저절로 주움) ---------------- */
  var SEED_POS = [[-5, 8.2], [6, 7], [-10.5, 2], [10.5, 1.5], [-17.5, -3], [17.5, -2.5], [-4.5, -12.5], [5.5, -13.5], [-20, 7.5], [20, 8.5], [1, 17.5], [-8.5, 18]];
  var seeds = [];
  SEED_POS.forEach(function (p, i) {
    var g = new THREE.Group(); g.position.set(p[0], 0, p[1]); scene.add(g);
    var body = new THREE.Group(); body.position.y = 0.95; g.add(body);
    var nut = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), pm('#d99a4e', 0.35)); nut.scale.set(1, 1.2, 1); body.add(nut);
    var capM = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), pm('#8a5a35', 0.2)); capM.position.y = 0.08; body.add(capM);
    var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6), pm('#7ccb6a', 0.4)); leaf.position.set(0.08, 0.32, 0); leaf.scale.set(1.4, 0.4, 0.8); leaf.rotation.z = -0.5; body.add(leaf);
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 28), new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.55, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    seeds.push({ id: 's' + i, g: g, body: body, ring: ring, taken: false, seed: i * 0.7 });
  });
  function takeSeed(s, instant) {
    if (s.taken) return; s.taken = true;
    if (instant) { scene.remove(s.g); return; }
    burst(s.g.position.x, 1, s.g.position.z, ['#ffe27a', '#7ccb6a', '#ffffff'], 16);
    tween(0.35, function (k) { s.body.position.y = 0.95 + k * 1.2; s.body.scale.setScalar(Math.max(0.01, 1 - k)); s.ring.material.opacity = 0.55 * (1 - k); }, function () { scene.remove(s.g); });
  }

  /* ---------------- 길 안내 화살표 ---------------- */
  var guide = new THREE.Group(); scene.add(guide); guide.visible = false;
  var gMat = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.9, depthWrite: false });
  var gArrow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.75, 3), gMat); gArrow.rotation.x = Math.PI / 2; gArrow.position.set(0, 0.12, 1.7); gArrow.scale.set(1, 1, 0.25); guide.add(gArrow);
  [1.05, 0.7].forEach(function (z, i) { var d = new THREE.Mesh(new THREE.CircleGeometry(0.09 - i * 0.02, 12), gMat); d.rotation.x = -Math.PI / 2; d.position.set(0, 0.08, z); guide.add(d); });
  var guideTarget = null;

  /* ---------------- 춤 · 하트 ---------------- */
  var danceT = 0, danceBeat = 0;

  /* ---------------- 입력 ---------------- */
  var keys = {}, paused = false, moveTarget = null, pendingTalk = null, near = null;
  addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    keys[e.code] = true;
    if (paused) return;
    if ((e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') && near) { e.preventDefault(); opts.onTalk && opts.onTalk(near); }
    else if (e.code === 'Space') { e.preventDefault(); jump(); }
  });
  function jump() { if (player.rig && player.rig.jump <= 0) { player.rig.jump = 0.55; opts.onJump && opts.onJump(); } if (bear.jump <= 0) setTimeout(function () { bear.jump = 0.6; }, 120); }
  addEventListener('keyup', function (e) { keys[e.code] = false; });
  addEventListener('blur', function () { keys = {}; });
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), gp = new THREE.Vector3();
  var down = null;
  canvas.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY, t: performance.now() }; opts.onUserGesture && opts.onUserGesture(); });
  canvas.addEventListener('pointerup', function (e) {
    if (!down || paused) { down = null; return; }
    var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved > 12) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    var hits = ray.intersectObjects(targets.map(function (t) { return t.hit; }), false);
    if (hits.length) {
      var t = hits[0].object.userData.target;
      if (dist2(player.pos, t.pos) < t.r) { opts.onTalk && opts.onTalk(t); return; }
      pendingTalk = t; moveTarget = { x: t.pos.x, z: t.pos.z, stopR: t.r * 0.85 }; return;
    }
    if (ray.ray.intersectPlane(groundPlane, gp)) {
      var l = Math.hypot(gp.x, gp.z); if (l > ISLAND_R - 0.5) { gp.x *= (ISLAND_R - 0.5) / l; gp.z *= (ISLAND_R - 0.5) / l; }
      moveTarget = { x: gp.x, z: gp.z, stopR: 0.3 }; pendingTalk = null; ping(gp.x, gp.z);
    }
  });
  function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  var pingM = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
  pingM.rotation.x = -Math.PI / 2; pingM.visible = false; scene.add(pingM);
  var pingT = 0;
  function ping(x, z) { pingM.position.set(x, 0.08, z); pingM.visible = true; pingT = 0.6; }

  function readInput() {
    var ix = 0, iz = 0;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1; if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (keys.KeyW || keys.ArrowUp) iz -= 1; if (keys.KeyS || keys.ArrowDown) iz += 1;
    var mag = Math.hypot(ix, iz);
    if (mag > 0.05) { moveTarget = null; pendingTalk = null; ix /= mag; iz /= mag; mag = 1; }
    else if (moveTarget) {
      var dx = moveTarget.x - player.pos.x, dz = moveTarget.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d < moveTarget.stopR) { moveTarget = null; ix = iz = mag = 0; }
      else { mag = Math.min(1, d / 1.2); ix = dx / d * mag; iz = dz / d * mag; }
    } else mag = 0;
    return { ix: ix, iz: iz, mag: mag, run: !!(keys.ShiftLeft || keys.ShiftRight) };
  }

  /* ---------------- 카메라 ---------------- */
  var camLook = new THREE.Vector3(0, 1, 4), focusPos = null;
  var OFF = new THREE.Vector3(0, 10.5, 13.5);
  function updateCamera(dt) {
    var portrait = innerHeight > innerWidth * 1.1;
    var want = focusPos ? focusPos.clone() : player.pos.clone().add(new THREE.Vector3(0, 1, -1.5));
    camLook.lerp(want, 1 - Math.exp(-4 * dt));
    var k = (portrait ? 1.45 : 1) * (focusPos ? 0.78 : 1);
    var desired = camLook.clone().add(OFF.clone().multiplyScalar(k));
    camera.position.lerp(desired, 1 - Math.exp(-3.5 * dt));
    camera.lookAt(camLook);
  }

  /* ---------------- 지구 열 · 맑아짐 ---------------- */
  var clean = 0, cleanTarget = 0, stage = -1, celebrateOn = false;
  function applyClean() {
    var k = clean;
    scene.background.lerpColors(SKY_DIRTY, SKY_CLEAN, k); scene.fog.color.copy(scene.background);
    scene.fog.near = lerp(30, 80, k); scene.fog.far = lerp(100, 220, k);
    hemi.intensity = lerp(0.9, 1.15, k); sun.intensity = lerp(1.55, 2.3, k);
    grassMat.color.lerpColors(GRASS_DIRTY, GRASS_CLEAN, k);
    var fcnt = Math.floor(FLOWER_N * clamp((k - 0.15) / 0.85, 0, 1)); stemIM.count = fcnt; headIM.count = fcnt;
    iceN.scale.set(lerp(0.45, 1.15, k), lerp(0.45, 1.15, k), 0.32); iceS.scale.set(lerp(0.5, 1.1, k), lerp(0.5, 1.1, k), 0.3);
    column.scale.y = lerp(1, 0.1, k);
    liqMat.color.lerpColors(LIQ_HOT, LIQ_COOL, k); liqMat.emissive.copy(liqMat.color);
    smogMat.opacity = smogDark.opacity = 0.96;
    var s = k >= 0.999 ? 3 : k >= 0.62 ? 2 : k >= 0.3 ? 1 : 0;
    if (s !== stage) { stage = s; setFace(s); }
  }
  function setFace(s) {
    frown.visible = s === 0; ohMouth.visible = s === 1; smile.visible = s === 2; grin.visible = s === 3;
    sweat.forEach(function (d, i) { d.visible = s === 0 || (s === 1 && i === 0); });
    eCheeks.forEach(function (c) { c.material.color.set(s <= 1 ? '#ff6b6b' : '#ffb0b8'); c.scale.setScalar(s === 0 ? 1.25 : s === 1 ? 1.1 : 0.95); });
    eEyes.forEach(function (e) { e.userData.sy = s === 0 ? 0.7 : s === 1 ? 0.95 : 1.15; e.scale.y = e.userData.sy; });
    spark.forEach(function (p) { p.visible = s >= 2; });
    packTarget = s <= 1 ? 1 : 0; // 얼음주머니는 frame()에서 목표값으로 천천히 움직임
  }
  var packTarget = 1, packK = 1;
  function updatePack(dt) {
    packK = reduce ? packTarget : lerp(packK, packTarget, 1 - Math.exp(-5 * dt));
    if (Math.abs(packK - packTarget) < 0.01) packK = packTarget;
    icePack.visible = packK > 0.02;
    icePack.scale.setScalar(Math.max(0.01, packK));
    icePack.position.y = 1.72 + (1 - packK) * 1.2;
  }

  /* ---------------- 공개 API 동작 ---------------- */
  function popSmog(zoneId) {
    var Z = ZONES[zoneId]; if (!Z) return;
    var s = Z.smogs.find(function (m) { return m.alive; }); if (!s) return;
    s.alive = false;
    var p = s.g.position.clone();
    tween(0.5, function (k) { var sc = k < 0.35 ? 1 + k * 0.8 : Math.max(0.01, (1 - k) * 1.8); s.g.scale.setScalar(sc); }, function () { scene.remove(s.g); });
    setTimeout(function () { burst(p.x, p.y, p.z, ['#ffffff', '#c9f0ff', '#ffe9a8'], 14); spawnButterfly(p.x, p.y, p.z, new THREE.Vector3(ZPOS[zoneId][0], 0, ZPOS[zoneId][1])); }, reduce ? 0 : 180);
  }
  function removeSmogInstant(zoneId, n) {
    var Z = ZONES[zoneId]; var c = 0;
    Z.smogs.forEach(function (s) { if (s.alive && c < n) { s.alive = false; scene.remove(s.g); c++; spawnButterfly(s.g.position.x, 2, s.g.position.z, new THREE.Vector3(ZPOS[zoneId][0], 0, ZPOS[zoneId][1])); } });
  }
  var clearedZones = {};
  function clearZone(zoneId, instant) {
    if (clearedZones[zoneId]) return; clearedZones[zoneId] = true;
    var Z = ZONES[zoneId];
    removeSmogInstant(zoneId, 5);
    Z.clear(instant);
    Z.friend.label.el.classList.add('done');
    if (!instant) { var p = ZPOS[zoneId]; burst(p[0], 3, p[1], ['#7fcd6b', '#ffd166', '#a4d97a', '#ff8fab'], 26, { leaf: true, life: 2.2 }); }
  }
  function celebrate() {
    celebrateOn = true;
    rainbow.visible = true;
    tween(2.2, function (k) { rainbow.scale.setScalar(Math.max(0.001, easeInOut(k))); });
    for (var i = 0; i < 4; i++) (function (i) { setTimeout(function () { burst(rand(-6, 6), rand(4, 7), rand(-6, 4), ['#ff8fab', '#ffd166', '#8fd3ff', '#b8a1ff', '#7fcd6b'], 30, { leaf: true, life: 2.6 }); }, i * 450); })(i);
    cheer();
  }
  function cheer() { if (player.rig) player.rig.jump = 0.55; bear.jump = 0.6; }

  /* ---------------- 루프 ---------------- */
  var clock = new THREE.Clock();
  var bearPhase = 0, idleHop = 2;
  function frame() {
    var dt = Math.min(0.05, clock.getDelta()); T += dt;
    updateTweens(dt);

    // 플레이어
    var inp = paused ? { ix: 0, iz: 0, mag: 0 } : readInput();
    var top = inp.run ? 7.6 : 5.0, kk = 1 - Math.exp(-(inp.mag > 0.05 ? 11 : 15) * dt);
    player.vel.x += (inp.ix * top - player.vel.x) * kk; player.vel.z += (inp.iz * top - player.vel.z) * kk;
    player.pos.x += player.vel.x * dt; player.pos.z += player.vel.z * dt;
    resolve(player.pos, player.radius);
    var sp = Math.hypot(player.vel.x, player.vel.z);
    if (sp > 0.3) player.heading = angLerp(player.heading, Math.atan2(player.vel.x, player.vel.z), 1 - Math.exp(-14 * dt));
    if (danceT > 0) { // 같이 춤추기: 빙글빙글 + 통통
      danceT -= dt; danceBeat -= dt; player.heading += dt * 5.5;
      if (danceBeat <= 0) { danceBeat = 0.55; if (player.rig) player.rig.jump = 0.5; bear.jump = 0.55; burst(player.pos.x + rand(-0.6, 0.6), 2.4, player.pos.z + rand(-0.6, 0.6), ['#b8a1ff', '#ff8fab', '#ffd166', '#8fd3ff'], 4); }
    }
    playerObj.position.copy(player.pos); playerObj.rotation.y = player.heading;
    if (player.rig) animPerson(player.rig, sp, dt);

    // 반짝 씨앗: 빙글빙글 떠 있다가 가까이 가면 줍기
    seeds.forEach(function (s) {
      if (s.taken) return;
      s.body.rotation.y += dt * 1.6; s.body.position.y = 0.95 + Math.sin(T * 2.2 + s.seed) * 0.12;
      s.ring.scale.setScalar(1 + Math.sin(T * 3 + s.seed) * 0.08);
      if (dist2(player.pos, s.g.position) < 1.3) { takeSeed(s); opts.onSeed && opts.onSeed(s.id); }
    });

    // 길 안내 화살표
    if (guideTarget) {
      var gd = dist2(player.pos, guideTarget);
      guide.visible = gd > 4.5 && !paused;
      if (guide.visible) { guide.position.set(player.pos.x, 0, player.pos.z); guide.rotation.y = Math.atan2(guideTarget.x - player.pos.x, guideTarget.z - player.pos.z); gArrow.position.z = 1.7 + Math.sin(T * 5) * 0.15; }
    } else guide.visible = false;
    if (pendingTalk && dist2(player.pos, pendingTalk.pos) < pendingTalk.r) {
      var t = pendingTalk; pendingTalk = null; moveTarget = null; player.vel.set(0, 0, 0);
      player.heading = Math.atan2(t.pos.x - player.pos.x, t.pos.z - player.pos.z);
      opts.onTalk && opts.onTalk(t);
    }

    // 얼음이 따라다니기
    var off = new THREE.Vector3(-1.1, 0, -1.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.heading);
    var bt = player.pos.clone().add(off);
    var bd = dist2(bearPos, bt), bmove = false;
    if (bd > 14) { bearPos.copy(bt); }
    else if (bd > 0.5) {
      var bs = Math.min(bd * 2.2, bd > 5 ? 8 : 5.4);
      var dx = (bt.x - bearPos.x) / bd, dz = (bt.z - bearPos.z) / bd;
      bearPos.x += dx * bs * dt; bearPos.z += dz * bs * dt; bearHead = angLerp(bearHead, Math.atan2(dx, dz), 1 - Math.exp(-10 * dt)); bmove = true;
    } else { bearHead = angLerp(bearHead, Math.atan2(player.pos.x - bearPos.x, player.pos.z - bearPos.z), 1 - Math.exp(-4 * dt)); idleHop -= dt; if (idleHop < 0) { idleHop = rand(3, 7); if (Math.random() < 0.5) bear.jump = 0.6; } }
    resolve(bearPos, 0.4, bearCol);
    bear.root.rotation.y = bearHead;
    animCritter(bear, bmove, dt);

    // 퀴즈 친구들: 가까이 오면 바라보고 손 흔들기
    targets.forEach(function (t) {
      if (t.type !== 'friend') return;
      var d = dist2(player.pos, t.pos);
      var face = Math.atan2(player.pos.x - t.pos.x, player.pos.z - t.pos.z);
      if (d < 7) { t.obj.rotation.y = angLerp(t.obj.rotation.y, face, 1 - Math.exp(-5 * dt)); if (!t.waved && d < 4.5) { t.critter.wave = 1.2; t.waved = true; } }
      if (d > 8) t.waved = false;
      animCritter(t.critter, false, dt);
    });

    // 가까운 대상
    var best = null, bestD = 1e9;
    targets.forEach(function (t) { if (t.type === 'mascot') return; var d = dist2(player.pos, t.pos); if (d < t.r && d < bestD) { best = t; bestD = d; } });
    if (best !== near) { near = best; opts.onNear && opts.onNear(near); }

    // 지구
    clean = lerp(clean, cleanTarget, 1 - Math.exp(-1.6 * dt)); if (Math.abs(clean - cleanTarget) < 0.001) clean = cleanTarget;
    applyClean(); updatePack(dt);
    ball.position.y = 2.75 + Math.sin(T * 2) * 0.07 + (celebrateOn ? Math.abs(Math.sin(T * 4)) * 0.25 : 0);
    lands.rotation.y = Math.sin(T * 0.35) * 0.18;
    sweat.forEach(function (d, i) { if (!d.visible) return; var k = (T * 0.6 + i * 0.5) % 1; d.position.y = d.userData.y0 - k * 0.8; d.scale.setScalar(1 - k * 0.6); d.scale.y *= 1.3; });
    eArms.forEach(function (a, i) { var s = i ? 1 : -1; a.rotation.z = s * (stage >= 3 ? 1.9 + Math.sin(T * 9 + i) * 0.4 : stage === 2 ? 0.7 + Math.sin(T * 2 + i) * 0.1 : 0.35); });
    if (rainbow.visible) rainbow.rotation.z = Math.sin(T * 0.3) * 0.01;

    // 뭉게 · 마을 · 구름
    Object.keys(ZONES).forEach(function (id) {
      var Z = ZONES[id]; Z.update && Z.update(dt);
      Z.smogs && Z.smogs.forEach(function (s) { if (!s.alive) return; s.g.position.y = s.base + Math.sin(T * 1.4 + s.seed) * 0.25; s.body.rotation.z = Math.sin(T * 1.1 + s.seed) * 0.08; s.g.rotation.y = Math.atan2(camera.position.x - s.g.position.x, camera.position.z - s.g.position.z); });
    });
    clouds.forEach(function (c) { c.a += c.sp * dt; c.g.position.x = Math.cos(c.a) * c.r; c.g.position.z = Math.sin(c.a) * c.r; });
    updateButterflies(dt); updateParts(dt); updateSmoke(dt);
    if (pingT > 0) { pingT -= dt; pingM.scale.setScalar(1 + (0.6 - pingT) * 1.6); pingM.material.opacity = Math.max(0, pingT / 0.6); if (pingT <= 0) pingM.visible = false; }

    updateCamera(dt);
    renderer.render(scene, camera);
    updateLabels();
    requestAnimationFrame(frame);
  }
  function onResize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); }
  addEventListener('resize', onResize);
  requestAnimationFrame(frame);

  return {
    setAvatar: setAvatar,
    setHat: setHat,
    jump: jump,
    dance: function (sec) { danceT = sec || 4; danceBeat = 0; },
    hearts: function () { burst(bearPos.x, 1.9, bearPos.z, ['#ff8fab', '#ff6b8b', '#ffc2d1', '#ffffff'], 18); bear.jump = 0.6; bear.wave = 1.2; },
    seedsTaken: function (map) { seeds.forEach(function (s) { if (map && map[s.id]) takeSeed(s, true); }); },
    seedCount: function () { return seeds.length; },
    nextSeed: function () { // 가장 가까운 남은 씨앗 위치
      var best = null, bd = 1e9; seeds.forEach(function (s) { if (s.taken) return; var d = dist2(player.pos, s.g.position); if (d < bd) { bd = d; best = s; } });
      return best ? { x: best.g.position.x, z: best.g.position.z } : null;
    },
    setGuide: function (t) {
      if (!t) { guideTarget = null; return; }
      if (typeof t === 'string') { var tg = targets.find(function (x) { return x.id === t; }); guideTarget = tg ? tg.pos : null; }
      else guideTarget = new THREE.Vector3(t.x, 0, t.z);
    },
    walkToPos: function (p) { if (!p) return; pendingTalk = null; moveTarget = { x: p.x, z: p.z, stopR: 0.4 }; },
    snapshot: function () { renderer.render(scene, camera); try { return canvas.toDataURL('image/jpeg', 0.92); } catch (e) { return ''; } },
    setClean: function (k, instant) { cleanTarget = clamp(k, 0, 1); if (instant) { clean = cleanTarget; applyClean(); } },
    popSmog: popSmog,
    removeSmog: removeSmogInstant,
    clearZone: clearZone,
    celebrate: celebrate,
    cheer: cheer,
    pause: function (b) { paused = !!b; if (paused) { moveTarget = null; pendingTalk = null; keys = {}; } },
    focus: function (id) {
      if (!id) { focusPos = null; return; }
      var t = targets.find(function (x) { return x.id === id; });
      // 대화창이 화면 아래쪽을 덮으므로, 카메라가 캐릭터보다 아래·앞쪽을 보게 해서 캐릭터가 화면 위쪽에 보이게 함
      focusPos = t ? new THREE.Vector3(t.pos.x * 0.7 + player.pos.x * 0.3, t.type === 'earth' ? 0.2 : -1.0, t.pos.z * 0.7 + player.pos.z * 0.3 + 1.6) : null;
    },
    talkNear: function () { if (near && !paused) opts.onTalk && opts.onTalk(near); },
    near: function () { return near; },
    smogLeft: function (zoneId) { return ZONES[zoneId] ? ZONES[zoneId].smogs.filter(function (s) { return s.alive; }).length : 0; },
    walkTo: function (id) { var t = targets.find(function (x) { return x.id === id; }); if (t) { pendingTalk = t; moveTarget = { x: t.pos.x, z: t.pos.z, stopR: t.r * 0.85 }; } }
  };
}

window.GQWorld = { create: create };
})();
