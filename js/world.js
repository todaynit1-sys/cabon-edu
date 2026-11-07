/*! 체험관 3D 마을 — 팩(JSON)으로 꾸며지는 떠 있는 섬
 *
 *  가운데 광장에 '아기 지구'(팩의 hub)와 온도계가 있고, 마을 4곳은 체험 템플릿으로 지어집니다.
 *   · switch 바로잡기   : 집 + 마당 거실의 물건들 (끄기·뽑기·닫기·맞추기)
 *   · sort   줍고 분류  : 공장 + 분리수거함, 섬에 떨어진 물건
 *   · plant  심고 가꾸기: 숲 + 빈 흙더미
 *   · ride   타고 가기  : 길 + 정류장 + 탈것 + 체크포인트 고리 + 목적지 건물
 *  이름·대사·물건 이름은 모두 팩에서 옵니다. 기본 팩(초록별 마을)은 손으로 만든 소품을, 생성된 팩은 표준 소품을 씁니다.
 *
 *  캐릭터 모양·걸음은 「푸른하늘 업무체험관」(수도권대기환경청, 2026) 코드를 바탕으로 했습니다. three.js 0.160.0 (MIT).
 */
(function () {
'use strict';

function create(canvas, opts) {
  opts = opts || {};
  var P = opts.pack;
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
  var hemi = new THREE.HemisphereLight('#fff8ec', '#7a9a5e', 0.95); scene.add(hemi);
  var sun = new THREE.DirectionalLight('#fff1d6', 1.7); sun.position.set(16, 30, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
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
  function shade(hex, k) { var c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }

  /* ---------------- 충돌 ---------------- */
  var circles = [], ISLAND_R = 25.2;
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
  function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  /* ---------------- 트윈 · 파티클 ---------------- */
  var tweens = [];
  function tween(dur, fn, done) { tweens.push({ t: 0, dur: dur, fn: fn, done: done }); if (reduce) fn(1); }
  function updateTweens(dt) { for (var i = tweens.length - 1; i >= 0; i--) { var tw = tweens[i]; tw.t += dt; var k = Math.min(1, tw.t / tw.dur); tw.fn(k); if (k >= 1) { tweens.splice(i, 1); tw.done && tw.done(); } } }
  var easeOutBack = function (k) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  var easeInOut = function (k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; };
  var parts = [], partGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16), leafGeo = new THREE.BoxGeometry(0.22, 0.03, 0.14);
  function burst(x, y, z, colors, n, opt) {
    opt = opt || {};
    for (var i = 0; i < n; i++) {
      var m = new THREE.Mesh(opt.leaf ? leafGeo : partGeo, pm(colors[i % colors.length], 0.3)); m.position.set(x, y, z); scene.add(m);
      var a = rand(0, Math.PI * 2), sp = rand(1.5, opt.leaf ? 3.5 : 5);
      parts.push({ m: m, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rand(3, opt.leaf ? 6 : 7.5), life: opt.life || rand(0.8, 1.3), age: 0, spin: rand(-8, 8), leaf: !!opt.leaf });
    }
  }
  function updateParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]; p.age += dt; if (p.age > p.life) { scene.remove(p.m); parts.splice(i, 1); continue; }
      p.vy -= (p.leaf ? 4 : 11) * dt; if (p.leaf) { p.vx *= 0.98; p.vz *= 0.98; p.vy = Math.max(p.vy, -1.4); }
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt; p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * 0.7 * dt;
      var s = 1 - Math.max(0, (p.age - p.life * 0.6) / (p.life * 0.4)); p.m.scale.setScalar(Math.max(0.01, s));
    }
  }
  var puffGeo = new THREE.SphereGeometry(0.4, 10, 8), puffs = [], emitters = [], tmpV = new THREE.Vector3();
  for (var pi = 0; pi < 46; pi++) { var pmesh = new THREE.Mesh(puffGeo, new THREE.MeshLambertMaterial({ color: '#8f8b85', transparent: true, opacity: 0, depthWrite: false })); pmesh.visible = false; scene.add(pmesh); puffs.push({ m: pmesh, age: 9, life: 2.4 }); }
  function addEmitter(getPos, rate, size) { var e = { getPos: getPos, rate: rate, size: size || 1, acc: 0, on: true }; emitters.push(e); return e; }
  function updateSmoke(dt) {
    emitters.forEach(function (e) { if (!e.on) return; e.acc += dt * e.rate; while (e.acc > 1) { e.acc -= 1; var p = puffs.find(function (q) { return q.age >= q.life; }); if (!p) break; e.getPos(tmpV); p.m.position.copy(tmpV); p.age = 0; p.life = rand(2, 2.8); p.size = e.size; p.vx = rand(-0.25, 0.25); p.vz = rand(-0.25, 0.25); p.m.visible = true; } });
    puffs.forEach(function (p) { if (p.age >= p.life) return; p.age += dt; var k = p.age / p.life; p.m.position.y += dt * 1.1; p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt; p.m.scale.setScalar((0.45 + k * 1.1) * p.size); p.m.material.opacity = 0.5 * (1 - k); if (p.age >= p.life) p.m.visible = false; });
  }

  /* ---------------- 섬 ---------------- */
  var GRASS_DIRTY = new THREE.Color('#a3b27f'), GRASS_CLEAN = new THREE.Color('#7fcd6b');
  var grassMat = new THREE.MeshLambertMaterial({ color: GRASS_DIRTY.clone() });
  var islandTop = new THREE.Mesh(new THREE.CylinderGeometry(28, 28.6, 1.2, 64), grassMat); islandTop.position.y = -0.6; islandTop.receiveShadow = true; scene.add(islandTop);
  var dirt = new THREE.Mesh(new THREE.CylinderGeometry(28.55, 8, 13, 48), mat('#c99863')); dirt.position.y = -7.7; scene.add(dirt);
  var band = new THREE.Mesh(new THREE.CylinderGeometry(28.62, 28.4, 1.1, 64), mat('#a97a4c')); band.position.y = -1.7; scene.add(band);
  for (var ri = 0; ri < 9; ri++) { var ra = (ri / 9) * Math.PI * 2 + 0.3, rrad = rand(9, 22); var rk = cone(rand(1.5, 3), rand(4, 8), ri % 2 ? '#b58654' : '#9c7045', Math.cos(ra) * rrad, -12 - rand(0, 3), Math.sin(ra) * rrad, null, 6); rk.rotation.x = Math.PI; rk.castShadow = false; }
  cyl(7, 7, 0.14, '#f4ebd7', 0, 0.07, 0, null, 56).castShadow = false;
  cyl(7.35, 7.35, 0.1, '#e2d3b1', 0, 0.05, 0, null, 56).castShadow = false;

  /* 마을 자리: 템플릿 → 섬 위치 */
  var SLOT = { switch: [-13, -10.5], sort: [13, -10.5], plant: [-13, 11], ride: [13, 11] };
  var zonesMeta = P.zones;
  var ZPOS = {}; zonesMeta.forEach(function (z) { ZPOS[z.id] = SLOT[z.template]; });
  function zoneDir(id) { var p = ZPOS[id], l = Math.hypot(p[0], p[1]); return { x: -p[0] / l, z: -p[1] / l }; }
  Object.keys(ZPOS).forEach(function (id) { var p = ZPOS[id], l = Math.hypot(p[0], p[1]), len = l - 7.2, mid = 7 + len / 2; var path = box(len, 0.1, 2.4, '#ecdcb8', (p[0] / l) * mid, 0.05, (p[1] / l) * mid, null, false); path.rotation.y = -Math.atan2(p[1], p[0]); });

  /* 나무 · 꽃 · 구름 · 무지개 */
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
  for (var ti = 0; ti < 34; ti++) { var ta = rand(0, Math.PI * 2), tr = rand(20.5, 24.5), tx = Math.cos(ta) * tr, tz = Math.sin(ta) * tr; if (nearZone(tx, tz, 7.5) || (tz > 14 && Math.abs(tx) < 6) || (tx < -5 && tz > 15)) continue; tree(tx, tz, rand(0.8, 1.25), Math.random() < 0.4 ? 1 : 0); }
  [[-8.5, 3.5], [8.5, 3.5], [-6, -8.5], [6, -8.5]].forEach(function (p, i) { tree(p[0], p[1], 0.9, i % 2); });
  var FLOWER_N = 90, FCOL = ['#ff8fab', '#ffd166', '#ffffff', '#b8a1ff', '#ff9f68', '#8fd3ff'];
  var stemIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 4), mat('#4f9f52'), FLOWER_N);
  var headIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshLambertMaterial({ color: '#ffffff' }), FLOWER_N);
  var mtx = new THREE.Matrix4(), fc = new THREE.Color(), fk = 0;
  while (fk < FLOWER_N) { var fa = rand(0, Math.PI * 2), fr = rand(8, 24), fx = Math.cos(fa) * fr, fz = Math.sin(fa) * fr; if (nearZone(fx, fz, 5.2)) continue; mtx.makeTranslation(fx, 0.17, fz); stemIM.setMatrixAt(fk, mtx); mtx.makeTranslation(fx, 0.38, fz); headIM.setMatrixAt(fk, mtx); headIM.setColorAt(fk, fc.set(FCOL[fk % FCOL.length])); fk++; }
  stemIM.count = 0; headIM.count = 0; scene.add(stemIM, headIM);
  var cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.3 }), clouds = [];
  for (var ci = 0; ci < 10; ci++) { var cg = new THREE.Group(), cn = 3 + (ci % 3); for (var cj = 0; cj < cn; cj++) { var cm = new THREE.Mesh(new THREE.SphereGeometry(rand(1.2, 2), 12, 9), cloudMat); cm.position.set((cj - cn / 2) * 1.6, rand(-0.3, 0.4), rand(-0.6, 0.6)); cg.add(cm); } var cr = rand(32, 50), ca = (ci / 10) * Math.PI * 2; cg.position.set(Math.cos(ca) * cr, rand(-2, 9), Math.sin(ca) * cr); scene.add(cg); clouds.push({ g: cg, a: ca, r: cr, sp: rand(0.008, 0.02) }); }
  var rainbow = new THREE.Group(); rainbow.position.set(0, -1, -15); rainbow.scale.setScalar(0.001); rainbow.visible = false; scene.add(rainbow);
  ['#ff8a8a', '#ffb870', '#ffe377', '#8fe08a', '#7cc8ff', '#b39cff'].forEach(function (c, i) { rainbow.add(new THREE.Mesh(new THREE.TorusGeometry(12.4 - i * 0.42, 0.21, 8, 64, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 }))); });

  /* 걱정 구름(뭉게) · 나비 */
  var smogMat = new THREE.MeshLambertMaterial({ color: '#8e8a84', transparent: true, opacity: 0.96 }), smogDark = new THREE.MeshLambertMaterial({ color: '#77736d', transparent: true, opacity: 0.96 });
  function makeSmog(x, y, z) {
    var g = new THREE.Group(); g.position.set(x, y, z); scene.add(g); var body = new THREE.Group(); g.add(body);
    [[0, 0, 0, 0.62], [0.55, -0.08, 0.05, 0.45], [-0.55, -0.06, 0.02, 0.48], [0.18, 0.32, -0.05, 0.42]].forEach(function (s, i) { var m = new THREE.Mesh(new THREE.SphereGeometry(s[3], 12, 9), i === 3 ? smogDark : smogMat); m.position.set(s[0], s[1], s[2]); m.castShadow = true; body.add(m); });
    [-0.17, 0.17].forEach(function (ex) { var e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat('#2b2b30')); e.position.set(ex, 0.05, 0.58); body.add(e); });
    var mo = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 10, Math.PI), mat('#2b2b30')); mo.position.set(0, -0.12, 0.6); body.add(mo);
    return { g: g, body: body, base: y, seed: rand(0, 9), alive: true };
  }
  var butterflies = [], wingGeo = new THREE.CircleGeometry(0.22, 10), BCOL = ['#ff8fab', '#ffd166', '#b8a1ff', '#ff9f68', '#8fd3ff'];
  function spawnButterfly(x, y, z, home) {
    var g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    var wm = new THREE.MeshBasicMaterial({ color: BCOL[Math.floor(Math.random() * BCOL.length)], side: THREE.DoubleSide });
    var L = new THREE.Mesh(wingGeo, wm), R = new THREE.Mesh(wingGeo, wm); L.position.x = -0.2; R.position.x = 0.2;
    var lp = new THREE.Group(), rp = new THREE.Group(); lp.add(L); rp.add(R); g.add(lp, rp);
    var bodyM = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.18, 3, 6), mat('#3b3b40')); bodyM.rotation.x = Math.PI / 2; g.add(bodyM); g.rotation.x = -Math.PI / 2.6;
    butterflies.push({ g: g, lp: lp, rp: rp, home: home ? home.clone() : new THREE.Vector3(x, 0, z), seed: rand(0, 9) });
    if (butterflies.length > 16) scene.remove(butterflies.shift().g);
  }
  function updateButterflies(dt) { butterflies.forEach(function (b) { var s = b.seed, tx = b.home.x + Math.sin(T * 0.6 + s) * 3, tz = b.home.z + Math.cos(T * 0.45 + s * 1.3) * 3, ty = 1.4 + Math.sin(T * 1.3 + s) * 0.5; b.g.position.x = lerp(b.g.position.x, tx, dt * 0.8); b.g.position.z = lerp(b.g.position.z, tz, dt * 0.8); b.g.position.y = lerp(b.g.position.y, ty, dt * 0.8); var f = Math.sin(T * 18 + s) * 0.9; b.lp.rotation.y = f; b.rp.rotation.y = -f; }); }

  /* ---------------- 캐릭터: 사람 ---------------- */
  /* 선택지(게임의 캐릭터 꾸미기와 같은 키): age(kid·student·teen) body(m·f) skin eye(round·sparkle·smile·sleepy·wink)
     mouth(smile·grin·cat·o·flat) cheek(pink·freckle·none) style(short·curly·bob·long·pony·twin·bun·cap·beanie) hair(색)
     top(tee·long·hoodie·shirt·uniform·vest) shirt(색) bottom(pants·shorts·skirt) pants(색) acc(none·glasses·sunglasses·headphones·backpack·bow) */
  function makePerson(o) {
    o = Object.assign({ shirt: '#5cb85c', pants: '#3d5a80', hair: '#2a221d', skin: '#f6d2b0', style: 'short', body: 'm', age: 'student', top: 'tee', bottom: 'pants', eye: 'round', mouth: 'smile', cheek: 'pink', acc: 'none' }, o || {});
    var root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    var mk = function (geo, c, x, y, z, parent) { var m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); m.castShadow = true; (parent || body).add(m); return m; };
    var cap = function (r, len) { return new THREE.CapsuleGeometry(r, len, 4, 10); };
    var f = o.body === 'f', kid = o.age === 'kid', teen = o.age === 'teen', TR = (f ? 0.26 : 0.29) + (kid ? 0.01 : teen ? -0.01 : 0), SZ = 0.82;
    root.scale.setScalar(kid ? 0.84 : teen ? 1.1 : 1);
    var shortSleeve = o.top === 'tee' || o.top === 'vest';
    var legs = [-0.12, 0.12].map(function (x) { var p = new THREE.Group(); p.position.set(x, 0.5, 0); body.add(p); if (o.bottom === 'pants') mk(cap(0.1, 0.24), o.pants, 0, -0.2, 0, p); else { mk(cap(0.1, 0.06), o.bottom === 'shorts' ? o.pants : o.skin, 0, -0.1, 0, p); mk(cap(0.085, 0.18), o.skin, 0, -0.27, 0, p); } var shoe = mk(new THREE.SphereGeometry(0.12, 12, 8), '#3a3f46', 0, -0.44, 0.045, p); shoe.scale.set(1, 0.62, 1.35); return p; });
    if (o.bottom === 'skirt') mk(new THREE.CylinderGeometry(TR * 0.95, TR * 1.5, 0.3, 14), o.pants, 0, 0.56, 0);
    var torso = mk(cap(TR, 0.1), o.top === 'vest' ? '#ffb703' : o.shirt, 0, 0.84, 0); torso.scale.set(1.1, 1, SZ);
    if (o.top === 'hoodie') { var hd = mk(new THREE.SphereGeometry(1, 12, 8), shade(o.shirt, 0.85), 0, 1.1, -TR * SZ + 0.02); hd.scale.set(0.22, 0.12, 0.12); mk(new THREE.BoxGeometry(0.3, 0.12, 0.02), shade(o.shirt, 0.85), 0, 0.72, TR * SZ); }
    if (o.top === 'vest') { var st = mk(new THREE.BoxGeometry(TR * 2.1, 0.05, 0.02), '#e9e9e9', 0, 0.8, TR * SZ + 0.02); st.castShadow = false; }
    if (o.top === 'shirt' || o.top === 'uniform') {
      var colC = o.top === 'uniform' ? '#ffffff' : shade(o.shirt, 1.3);
      [-1, 1].forEach(function (s) { var c = mk(new THREE.BoxGeometry(0.15, 0.09, 0.03), colC, s * 0.095, 1.0, TR * SZ - 0.005); c.rotation.z = s * 0.55; c.castShadow = false; });
      if (f && o.top === 'uniform') { [-1, 1].forEach(function (s) { var w = mk(new THREE.SphereGeometry(0.06, 8, 6), '#d9534f', s * 0.08, 0.95, TR * SZ + 0.01); w.scale.set(1.2, 0.6, 0.5); w.castShadow = false; }); mk(new THREE.SphereGeometry(0.035, 8, 6), '#b03a3a', 0, 0.95, TR * SZ + 0.03).castShadow = false; }
      else { var tie = mk(new THREE.BoxGeometry(0.07, 0.3, 0.02), o.top === 'uniform' ? '#c0392b' : '#2b3a67', 0, 0.83, TR * SZ + 0.015); tie.castShadow = false; }
      if (o.top === 'uniform') { var seam = mk(new THREE.BoxGeometry(0.02, 0.34, 0.015), shade(o.shirt, 0.7), 0, 0.76, TR * SZ + 0.008); seam.castShadow = false; }
    }
    var AX = TR * 1.1 + 0.07;
    var arms = [-AX, AX].map(function (x) { var p = new THREE.Group(); p.position.set(x, 1.04, 0); body.add(p); if (shortSleeve) { mk(cap(0.082, 0.05), o.shirt, 0, -0.07, 0, p); mk(cap(0.068, 0.16), o.skin, 0, -0.23, 0, p); } else mk(cap(0.075, 0.24), o.shirt, 0, -0.17, 0, p); mk(new THREE.SphereGeometry(0.085, 10, 8), o.skin, 0, -0.38, 0, p); return p; });
    if (o.acc === 'backpack') { var bp = mk(new THREE.BoxGeometry(0.38, 0.42, 0.2), '#f4a261', 0, 0.86, -TR * SZ - 0.1); bp.geometry = new THREE.BoxGeometry(0.38, 0.42, 0.2); mk(new THREE.BoxGeometry(0.3, 0.14, 0.06), '#e76f51', 0, 0.72, -TR * SZ - 0.22); [-1, 1].forEach(function (s) { var sb = mk(new THREE.BoxGeometry(0.06, 0.34, 0.04), '#e76f51', s * 0.13, 0.9, TR * SZ - 0.02); sb.castShadow = false; }); }
    var head = new THREE.Group(); head.position.set(0, 1.2, 0); body.add(head);
    var HR = kid ? 0.46 : teen ? 0.4 : 0.42, HY = 0.36;
    var face = mk(new THREE.SphereGeometry(HR, 20, 16), o.skin, 0, HY, 0, head); face.scale.set(1.04, 0.96, 1);
    var sph2 = function (r, c, x, y, z, ps, pl, ts, tl) { return mk(new THREE.SphereGeometry(r, 18, 12, ps || 0, pl == null ? Math.PI * 2 : pl, ts || 0, tl == null ? Math.PI : tl), c, x, y, z, head); };
    if (o.style === 'cap') { sph2(HR + 0.035, o.shirt, 0, HY + 0.02, 0, 0, Math.PI * 2, 0, Math.PI * 0.5); var bill = mk(new THREE.BoxGeometry(0.5, 0.04, 0.3), o.shirt, 0, HY + 0.03, HR + 0.02, head); bill.rotation.x = 0.12; sph2(HR + 0.012, o.hair, 0, HY, 0, Math.PI, Math.PI, Math.PI * 0.42, Math.PI * 0.3); }
    else if (o.style === 'beanie') { var bc = o.pants; sph2(HR + 0.04, bc, 0, HY + 0.03, 0, 0, Math.PI * 2, 0, Math.PI * 0.5); var rim = mk(new THREE.TorusGeometry(HR + 0.03, 0.05, 8, 20), bc, 0, HY + 0.03, 0, head); rim.rotation.x = Math.PI / 2; sph2(0.09, '#ffffff', 0, HY + HR + 0.1, 0); sph2(HR + 0.012, o.hair, 0, HY, 0, Math.PI, Math.PI, Math.PI * 0.42, Math.PI * 0.3); }
    else {
      var front = sph2(HR + 0.02, o.hair, 0, HY + 0.01, 0, 0, Math.PI * 2, 0, Math.PI * 0.44); front.rotation.x = -0.16;
      sph2(HR + 0.015, o.hair, 0, HY, 0, Math.PI, Math.PI, 0, Math.PI * (o.style === 'bob' || o.style === 'long' ? 0.86 : 0.7));
      if (o.style === 'bob') [-1, 1].forEach(function (s) { var sd = mk(cap(0.1, 0.18), o.hair, s * (HR - 0.03), HY - 0.12, 0.02, head); sd.scale.z = 0.8; });
      if (o.style === 'long') { var lb = mk(cap(0.27, 0.3), o.hair, 0, HY - 0.35, -0.16, head); lb.scale.set(1.15, 1, 0.55); [-1, 1].forEach(function (s) { var sd = mk(cap(0.09, 0.3), o.hair, s * (HR - 0.02), HY - 0.25, 0.0, head); sd.scale.z = 0.8; }); }
      if (o.style === 'pony') { var tl = mk(cap(0.11, 0.34), o.hair, 0, HY - 0.05, -(HR + 0.08), head); tl.rotation.x = 0.55; mk(new THREE.TorusGeometry(0.1, 0.03, 6, 12), '#ffd166', 0, HY + 0.12, -HR, head).rotation.x = 1.1; }
      if (o.style === 'twin') [-1, 1].forEach(function (s) { var tt = mk(cap(0.1, 0.3), o.hair, s * (HR + 0.05), HY - 0.2, -0.06, head); tt.rotation.z = s * 0.2; mk(new THREE.TorusGeometry(0.08, 0.025, 6, 12), '#ff8fab', s * (HR + 0.02), HY + 0.02, -0.04, head).rotation.y = Math.PI / 2; });
      if (o.style === 'bun') sph2(0.17, o.hair, 0, HY + HR + 0.03, -0.12);
      if (o.style === 'curly') for (var k = 0; k < 11; k++) { var a = (k / 11) * Math.PI * 2; sph2(0.13, o.hair, Math.cos(a) * (HR - 0.08), HY + HR * 0.67 + Math.sin(k * 1.7) * 0.05, Math.sin(a) * (HR - 0.12) - 0.05); }
    }
    var EZ = HR - 0.035, INK = '#1d1d22';
    var eyes = [-0.15, 0.15].map(function (x, i) {
      var kind = o.eye === 'wink' ? (i === 0 ? 'smile' : 'round') : o.eye;
      if (kind === 'smile') { var se = mk(new THREE.TorusGeometry(0.05, 0.017, 6, 12, Math.PI), INK, x, HY - 0.005, EZ + 0.022, head); se.userData.sy = 1; return se; }
      var big = kind === 'sparkle', sy = kind === 'sleepy' ? 0.5 : 1.18; var e = mk(new THREE.SphereGeometry(big ? 0.077 : 0.062, 12, 10), INK, x, HY + 0.02, EZ, head); e.scale.set(0.85, sy, 0.55); e.userData.sy = sy;
      if (kind !== 'sleepy') mk(new THREE.SphereGeometry(big ? 0.027 : 0.02, 6, 6), '#ffffff', x + 0.022, HY + 0.06, EZ + 0.032, head); return e;
    });
    if (o.cheek === 'pink') [-1, 1].forEach(function (s) { var b = mk(new THREE.CircleGeometry(0.065, 14), '#f5a3a3', s * 0.25, HY - 0.08, HR - 0.07, head); b.rotation.y = s * 0.6; b.castShadow = false; });
    else if (o.cheek === 'freckle') [-1, 1].forEach(function (s) { [[0, 0], [0.05, 0.03], [-0.04, 0.035]].forEach(function (d) { var fr = mk(new THREE.CircleGeometry(0.012, 6), '#c98a6b', s * (0.24 + d[0]), HY - 0.07 + d[1], HR - 0.06, head); fr.rotation.y = s * 0.6; fr.castShadow = false; }); });
    var MY = HY - 0.12, MZ = HR - 0.025, MC = f ? '#c95b6b' : '#9b4a45';
    if (o.mouth === 'grin') { var gm = mk(new THREE.CircleGeometry(0.062, 16, Math.PI, Math.PI), '#7a2f33', 0, MY + 0.02, MZ + 0.004, head); gm.castShadow = false; }
    else if (o.mouth === 'o') { var om = mk(new THREE.CircleGeometry(0.03, 14), '#7a2f33', 0, MY, MZ + 0.004, head); om.castShadow = false; }
    else if (o.mouth === 'cat') [-1, 1].forEach(function (s) { var cm = mk(new THREE.TorusGeometry(0.028, 0.011, 6, 10, Math.PI), MC, s * 0.03, MY, MZ, head); cm.rotation.z = Math.PI; cm.castShadow = false; });
    else if (o.mouth === 'flat') { var fm = mk(new THREE.BoxGeometry(0.09, 0.016, 0.01), MC, 0, MY - 0.01, MZ + 0.004, head); fm.castShadow = false; }
    else { var sm = mk(new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI), MC, 0, MY, MZ, head); sm.rotation.z = Math.PI; sm.castShadow = false; }
    if (o.acc === 'glasses' || o.acc === 'sunglasses') { var dark = o.acc === 'sunglasses'; [-0.15, 0.15].forEach(function (x) { if (dark) { var lens = mk(new THREE.CircleGeometry(0.085, 14), '#1a1a1f', x, HY + 0.02, EZ + 0.04, head); lens.castShadow = false; } var rim2 = mk(new THREE.TorusGeometry(0.085, 0.012, 6, 16), dark ? '#1a1a1f' : '#333740', x, HY + 0.02, EZ + 0.045, head); rim2.castShadow = false; }); var br = mk(new THREE.BoxGeometry(0.06, 0.014, 0.014), '#333740', 0, HY + 0.03, EZ + 0.045, head); br.castShadow = false; [-1, 1].forEach(function (s) { var tp = mk(new THREE.BoxGeometry(0.014, 0.014, HR * 0.9), '#333740', s * (HR - 0.02), HY + 0.03, EZ - HR * 0.45, head); tp.castShadow = false; }); }
    if (o.acc === 'headphones') { var band = mk(new THREE.TorusGeometry(HR + 0.05, 0.03, 8, 24, Math.PI), '#2b2f36', 0, HY + 0.02, 0, head); band.castShadow = false; [-1, 1].forEach(function (s) { var cup = mk(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 14), '#2b2f36', s * (HR + 0.03), HY, 0, head); cup.rotation.z = Math.PI / 2; var pad = mk(new THREE.CylinderGeometry(0.08, 0.08, 0.09, 14), '#ff6b8b', s * (HR + 0.02), HY, 0, head); pad.rotation.z = Math.PI / 2; }); }
    if (o.acc === 'bow') { [-1, 1].forEach(function (s) { var w = mk(new THREE.SphereGeometry(0.075, 8, 6), '#ff6b8b', HR * 0.62 + s * 0.07, HY + HR * 0.78, 0.12, head); w.scale.set(1.2, 0.7, 0.6); }); mk(new THREE.SphereGeometry(0.035, 8, 6), '#e0476d', HR * 0.62, HY + HR * 0.78, 0.16, head); }
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
    var jy = 0; if (jumping) { rig.jump -= dt; var k = 1 - rig.jump / 0.55; jy = Math.max(0, 2 * k * (1 - k)); if (rig.jump <= 0) rig.land = 0.18; }
    rig.body.position.y = bounce * 0.075 * (a / 0.8) + jy;
    var idle = 1 - a, breath = Math.sin(T * 2.3 + rig.seed) * 0.018 * idle; rig.land = Math.max(0, rig.land - dt);
    var squash = (1 - bounce) * 0.07 * a + (rig.land > 0 ? rig.land * 0.6 : 0);
    rig.body.scale.set(1 + squash * 0.6, 1 - squash + breath, 1 + squash * 0.6);
    rig.body.rotation.z = lerp(rig.body.rotation.z, sn * 0.07 * a + Math.sin(T * 1.2 + rig.seed) * 0.03 * idle, 0.25);
    rig.head.rotation.z = lerp(rig.head.rotation.z, -sn * 0.06 * a + Math.sin(T * 0.9 + rig.seed) * 0.04 * idle, 0.2);
    rig.blink -= dt; var shut = rig.blink < 0.12; rig.eyes.forEach(function (e) { e.scale.y = shut ? 0.12 : (e.userData.sy || 1); }); if (rig.blink < 0) rig.blink = rand(2, 5.5);
  }

  /* ---------------- 캐릭터: 동물 친구 ---------------- */
  function makeCritter(kind, accent) {
    var PAL = { bear: { body: '#fbfbf8', light: '#ffffff', muzzle: '#fff7ec', dark: '#24242a', inner: '#f7b7c3' }, rabbit: { body: '#fbf3ea', light: '#ffffff', muzzle: '#ffffff', dark: '#3a2f2f', inner: '#f7b7c3' }, raccoon: { body: '#a6aab0', light: '#eef0f2', muzzle: '#eef0f2', dark: '#4a4e55', inner: '#d9a0aa' }, squirrel: { body: '#d38f53', light: '#f8dec2', muzzle: '#f8dec2', dark: '#6b4224', inner: '#f2b49a' }, puppy: { body: '#f2d4a4', light: '#fff4e2', muzzle: '#fff4e2', dark: '#94643c', inner: '#f2a0a0' } }[kind] || { body: '#fbfbf8', light: '#ffffff', muzzle: '#fff7ec', dark: '#24242a', inner: '#f7b7c3' };
    var root = new THREE.Group(); root.rotation.order = 'YXZ'; var bod = new THREE.Group(); root.add(bod);
    var mk = function (geo, c, x, y, z, p) { var m = new THREE.Mesh(geo, pm(c)); m.position.set(x, y, z); m.castShadow = true; (p || bod).add(m); return m; };
    var soft = function (r, sx, sy, sz, c, x, y, z, p) { var m = mk(new THREE.SphereGeometry(r, 16, 12), c, x, y, z, p); m.scale.set(sx, sy, sz); return m; };
    var capg = function (r, l) { return new THREE.CapsuleGeometry(r, l, 6, 12); };
    mk(capg(0.37, 0.32), PAL.body, 0, 0.64, 0).scale.set(1, 1, 0.86); soft(0.27, 1, 1.1, 0.5, PAL.light, 0, 0.6, 0.25);
    var head = new THREE.Group(); head.position.set(0, 1.28, 0); bod.add(head);
    soft(0.42, 1.04, 0.95, 0.96, PAL.body, 0, 0, 0, head); soft(0.16, 1.25, 0.85, 0.72, PAL.muzzle, 0, -0.1, 0.34, head); soft(0.055, 1.2, 0.85, 0.8, PAL.dark, 0, -0.05, 0.46, head);
    var eyes = [];
    [-1, 1].forEach(function (s) { var e = soft(0.055, 0.85, 1.2, 0.55, '#1d1d22', s * 0.15, 0.07, 0.37, head); e.userData.sy = 1.2; eyes.push(e); soft(0.018, 1, 1, 1, '#ffffff', s * 0.15 + 0.02, 0.1, 0.4, head); var ch = mk(new THREE.CircleGeometry(0.06, 14), '#f7a8b2', s * 0.26, -0.06, 0.33, head); ch.rotation.y = s * 0.6; ch.castShadow = false; });
    var mouth = mk(new THREE.TorusGeometry(0.04, 0.011, 6, 12, Math.PI), '#7a2f33', 0, -0.17, 0.43, head); mouth.rotation.z = Math.PI; mouth.castShadow = false;
    var arms = [-1, 1].map(function (s) { var p = new THREE.Group(); p.position.set(s * 0.36, 0.86, 0.04); p.rotation.z = s * 0.55; bod.add(p); mk(capg(0.095, 0.16), PAL.body, 0, -0.13, 0, p); return p; });
    var legs = [-1, 1].map(function (s) { var p = new THREE.Group(); p.position.set(s * 0.16, 0.3, 0.03); bod.add(p); mk(capg(0.11, 0.08), PAL.body, 0, -0.12, 0.03, p); return p; });
    if (kind === 'bear') { [-1, 1].forEach(function (s) { soft(0.12, 1, 1, 0.7, PAL.body, s * 0.28, 0.32, -0.02, head); soft(0.06, 1, 1, 0.5, PAL.inner, s * 0.28, 0.32, 0.05, head); }); soft(0.09, 1, 1, 1, PAL.body, 0, 0.4, -0.33); }
    else if (kind === 'rabbit') { [-1, 1].forEach(function (s) { var e = mk(capg(0.09, 0.42), PAL.body, s * 0.15, 0.55, -0.03, head); e.rotation.z = s * -0.18; var ie = mk(capg(0.045, 0.32), PAL.inner, s * 0.15, 0.55, 0.035, head); ie.rotation.z = s * -0.18; ie.scale.z = 0.4; }); soft(0.13, 1, 1, 1, '#ffffff', 0, 0.42, -0.36); }
    else if (kind === 'raccoon') { soft(0.2, 2.0, 0.55, 0.5, PAL.dark, 0, 0.06, 0.3, head); [-1, 1].forEach(function (s) { soft(0.12, 1, 1, 0.6, PAL.dark, s * 0.27, 0.32, -0.02, head); }); for (var k = 0; k < 4; k++) soft(0.14 - k * 0.012, 1, 1, 1, k % 2 ? PAL.light : PAL.dark, 0, 0.45 + k * 0.17, -0.42 - k * 0.07); }
    else if (kind === 'squirrel') { [-1, 1].forEach(function (s) { var e = mk(new THREE.ConeGeometry(0.09, 0.2, 8), PAL.body, s * 0.22, 0.4, -0.02, head); e.rotation.z = s * -0.25; }); [[0, 0.5, -0.42, 0.2], [0, 0.8, -0.55, 0.24], [0, 1.15, -0.5, 0.25], [0, 1.42, -0.32, 0.2]].forEach(function (t, i) { soft(t[3], 1, 1, 1, i % 2 ? PAL.light : PAL.body, t[0], t[1], t[2]); }); soft(0.09, 1, 1.15, 1, '#a0642f', 0.33, 0.62, 0.22); soft(0.08, 1, 0.5, 1, '#6b4224', 0.33, 0.71, 0.22); }
    else if (kind === 'puppy') { [-1, 1].forEach(function (s) { var e = mk(capg(0.1, 0.22), PAL.dark, s * 0.4, -0.02, 0, head); e.rotation.z = s * 0.25; e.scale.z = 0.55; }); soft(0.1, 1, 1, 0.5, PAL.dark, 0.17, 0.1, 0.34, head); mk(capg(0.06, 0.2), PAL.body, 0, 0.55, -0.36).rotation.x = -0.8; }
    if (accent) { var sc = mk(new THREE.TorusGeometry(0.3, 0.07, 8, 18), accent, 0, 0.98, 0); sc.rotation.x = Math.PI / 2; sc.scale.set(1, 0.86, 1); soft(0.09, 1, 1, 0.7, accent, 0.12, 0.9, 0.28); }
    root.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return { root: root, bod: bod, head: head, eyes: eyes, arms: arms, legs: legs, blink: rand(1, 4), seed: rand(0, 9), jump: 0, wave: 0 };
  }
  function animCritter(c, moving, dt) {
    c.blink -= dt; var shut = c.blink < 0.12; c.eyes.forEach(function (e) { e.scale.y = shut ? 0.15 : e.userData.sy; }); if (c.blink < 0) c.blink = rand(2, 5);
    var ph = T * (moving ? 11 : 2.2) + c.seed, hop = moving ? Math.abs(Math.sin(ph)) * 0.18 : Math.abs(Math.sin(ph * 0.5)) * 0.02;
    if (c.jump > 0) { c.jump -= dt; var k = 1 - c.jump / 0.6; hop += Math.max(0, 2.4 * k * (1 - k)); }
    c.bod.position.y = hop; c.legs[0].rotation.x = moving ? Math.sin(ph) * 0.6 : 0; c.legs[1].rotation.x = moving ? -Math.sin(ph) * 0.6 : 0;
    if (c.wave > 0) { c.wave -= dt; c.arms[1].rotation.z = -1.9 + Math.sin(c.wave * 14) * 0.4; } else c.arms[1].rotation.z = lerp(c.arms[1].rotation.z, 0.55 + Math.sin(T * 2 + c.seed) * 0.08, 0.15);
    c.arms[0].rotation.z = lerp(c.arms[0].rotation.z, -0.55 - Math.sin(T * 2 + c.seed) * 0.08 - (c.jump > 0 ? 1.4 : 0), 0.2);
    c.bod.rotation.z = Math.sin(T * 1.6 + c.seed) * 0.05;
  }

  /* ---------------- 이름표 · 상호작용 대상 ---------------- */
  var labelsEl = document.getElementById('labels'), labels = [], lv = new THREE.Vector3();
  function addLabel(html, obj, dy, cls) { var el = document.createElement('div'); el.className = 'tag ' + (cls || ''); el.innerHTML = html; labelsEl.appendChild(el); var L = { el: el, obj: obj, dy: dy || 2.2 }; labels.push(L); return L; }
  function updateLabels() { var w = innerWidth, h = innerHeight; labels.forEach(function (L) { L.obj.getWorldPosition(lv); lv.y += L.dy; lv.project(camera); var vis = lv.z < 1 && lv.x > -1.2 && lv.x < 1.2 && lv.y > -1.2 && lv.y < 1.2 && !L.hide; L.el.style.display = vis ? '' : 'none'; if (vis) L.el.style.transform = 'translate(-50%,-100%) translate(' + ((lv.x * 0.5 + 0.5) * w).toFixed(1) + 'px,' + ((-lv.y * 0.5 + 0.5) * h).toFixed(1) + 'px)'; }); }
  var targets = [], hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  function addTarget(t, obj, r, y) { var hit = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), hitMat); hit.position.y = y; hit.userData.target = t; obj.add(hit); t.obj = obj; t.hit = hit; targets.push(t); return t; }

  /* ---------------- 광장: 아기 지구 (hub) · 온도계 · 입구 표지판 ---------------- */
  var earth = new THREE.Group(); earth.position.set(0, 0, -2.4); scene.add(earth);
  cyl(1.95, 2.25, 0.7, '#f4ecda', 0, 0.35, 0, earth, 28); cyl(2.02, 2.02, 0.12, '#7fcd6b', 0, 0.74, 0, earth, 28); addCircle(0, -2.4, 2.35);
  var ball = new THREE.Group(); ball.position.y = 2.75; earth.add(ball);
  var ocean = new THREE.Mesh(new THREE.SphereGeometry(1.75, 32, 24), new THREE.MeshLambertMaterial({ color: '#58b4ea', emissive: '#1f6ea6', emissiveIntensity: 0.16 })); ocean.castShadow = true; ball.add(ocean);
  var lands = new THREE.Group(); ball.add(lands); var Z1 = new THREE.Vector3(0, 0, 1);
  function blob(theta, phi, r, flat, c, parent) { var dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)); var m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), pm(c, 0.12)); m.position.copy(dir).multiplyScalar(1.66); m.quaternion.setFromUnitVectors(Z1, dir); m.scale.set(1, 1, flat); (parent || lands).add(m); return m; }
  [[0.15, 1.35, 0.62], [2.95, 1.45, 0.7], [3.7, 1.15, 0.6], [4.5, 1.65, 0.75], [5.35, 1.05, 0.55], [5.9, 1.9, 0.5], [0.5, 2.05, 0.45], [2.6, 2.1, 0.5], [1.57, 2.62, 0.42]].forEach(function (b, i) { blob(b[0], b[1], b[2], 0.3, i % 3 ? '#7ccb6a' : '#a4d97a'); });
  var iceN = blob(0, 0.001, 0.95, 0.32, '#ffffff', ball); iceN.position.set(0, 1.6, 0);
  var iceS = blob(0, Math.PI - 0.001, 0.75, 0.3, '#ffffff', ball); iceS.position.set(0, -1.62, 0);
  var faceG = new THREE.Group(); ball.add(faceG); var ER = 1.75;
  var surfZ = function (x, y, lift) { return Math.sqrt(Math.max(0.01, ER * ER - x * x - y * y)) + (lift || 0); };
  var fmk = function (geo, c, x, y, lift) { var m = new THREE.Mesh(geo, pm(c, 0.1)); m.position.set(x, y, surfZ(x, y, lift)); faceG.add(m); return m; };
  var onFace = function (m, x, y, lift) { m.position.set(x, y, surfZ(x, y, lift)); var n = new THREE.Vector3(x, y, surfZ(x, y, 0)).normalize(); m.quaternion.setFromUnitVectors(Z1, n); faceG.add(m); return m; };
  var eEyes = [-1, 1].map(function (s) { var e = fmk(new THREE.SphereGeometry(0.19, 16, 12), '#1d1d22', s * 0.5, 0.3, 0.02); e.scale.set(0.82, 1.15, 0.55); e.userData.sy = 1.15; return e; });
  [-1, 1].forEach(function (s) { fmk(new THREE.SphereGeometry(0.06, 8, 6), '#ffffff', s * 0.5 + 0.06, 0.4, 0.12); });
  var spark = [-1, 1].map(function (s) { return fmk(new THREE.SphereGeometry(0.035, 8, 6), '#ffffff', s * 0.5 - 0.05, 0.2, 0.12); });
  var eCheeks = [-1, 1].map(function (s) { return onFace(new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), new THREE.MeshBasicMaterial({ color: '#ff6b6b', transparent: true, opacity: 0.85 })), s * 0.92, -0.08, 0.02); });
  var frown = onFace(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.055, 8, 18, Math.PI), pm('#7a2f33', 0.1)), 0, -0.5, 0.02);
  var smile = onFace(new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.055, 8, 18, Math.PI), pm('#7a2f33', 0.1)), 0, -0.3, 0.02); smile.rotateZ(Math.PI);
  var grin = onFace(new THREE.Mesh(new THREE.CircleGeometry(0.32, 20, Math.PI, Math.PI), new THREE.MeshBasicMaterial({ color: '#c6424a' })), 0, -0.26, 0.03);
  var ohMouth = fmk(new THREE.SphereGeometry(0.12, 12, 8), '#7a2f33', 0, -0.45, 0); ohMouth.scale.set(1, 0.8, 0.4);
  var sweat = [0, 1].map(function (i) { var d = fmk(new THREE.SphereGeometry(0.11, 10, 8), '#9fdcff', i ? -1.2 : 1.22, 0.7, 0.05); d.scale.set(0.8, 1.3, 0.8); d.userData.y0 = 0.7 - i * 0.3; return d; });
  var icePack = new THREE.Group(); icePack.position.set(0.15, 1.72, 0.25); icePack.rotation.z = -0.22; ball.add(icePack);
  icePack.add(new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.32, 0.95), pm('#bfe9ff', 0.3)));
  var ipc = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.12, 0.3), pm('#ffffff', 0.4)); ipc.position.y = 0.12; icePack.add(ipc);
  var eArms = [-1, 1].map(function (s) { var p = new THREE.Group(); p.position.set(s * 1.65, -0.25, 0.2); ball.add(p); var a = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 6, 10), pm('#58b4ea', 0.16)); a.position.y = -0.3; p.add(a); p.rotation.z = s * 0.5; return p; });
  var earthT = addTarget({ id: 'earth', type: 'earth', name: P.hub.name, r: 3.6 }, earth, 2.2, 2.6); earthT.pos = earth.position;
  addLabel('<b>' + P.hub.title + '</b><small>말 걸어 보기</small>', ball, 2.55, 'earth');
  var thermo = new THREE.Group(); thermo.position.set(3.2, 0, -2.4); scene.add(thermo); addCircle(3.2, -2.4, 0.75);
  cyl(0.55, 0.65, 0.35, '#e8dcc4', 0, 0.18, 0, thermo, 16);
  var tube = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 3.4, 16), new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 })); tube.position.y = 2.55; thermo.add(tube);
  var liqMat = new THREE.MeshLambertMaterial({ color: '#ff5a4f', emissive: '#ff5a4f', emissiveIntensity: 0.35 });
  var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 12), liqMat); bulb.position.y = 0.78; bulb.castShadow = true; thermo.add(bulb);
  var colGeo = new THREE.CylinderGeometry(0.16, 0.16, 3.0, 12); colGeo.translate(0, 1.5, 0); var column = new THREE.Mesh(colGeo, liqMat); column.position.y = 1.05; thermo.add(column);
  for (var tk = 0; tk < 6; tk++) box(0.16, 0.035, 0.04, '#7a6a55', 0.32, 1.4 + tk * 0.5, 0, thermo, false);
  var thermoLbl = textPlane(P.hub.meter, { w: 1.8, h: 0.55, bg: '#e8735a' }); thermoLbl.position.set(0, 4.65, 0); thermo.add(thermoLbl);
  var LIQ_HOT = new THREE.Color('#ff5a4f'), LIQ_COOL = new THREE.Color('#47b4ff');
  var sign = new THREE.Group(); sign.position.set(-3.6, 0, 9.2); scene.add(sign);
  cyl(0.12, 0.14, 2.2, '#8a5a35', -1.4, 1.1, 0, sign, 8); cyl(0.12, 0.14, 2.2, '#8a5a35', 1.4, 1.1, 0, sign, 8); box(3.4, 1.1, 0.16, '#f6e7c8', 0, 1.9, 0, sign);
  var sgt = textPlane(P.title, { w: 3.1, h: 0.85, bg: null, fg: '#2f7d5b' }); sgt.position.set(0, 1.9, 0.09); sign.add(sgt); addCircle(-3.6, 9.2, 0.6);

  /* ---------------- 체험 물건(스팟) ---------------- */
  var spots = [], spotHits = [], activeZone = null;
  var markerMat = new THREE.MeshBasicMaterial({ color: '#ffd166' }), ringMarkMat = new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.6, depthWrite: false });
  function addSpot(o) {
    var s = Object.assign({ done: false, r: 2.0, auto: false, h: 1.6 }, o); s.pos = new THREE.Vector3(o.x, 0, o.z);
    s.marker = new THREE.Group(); s.marker.position.set(o.x, s.h + 0.9, o.z); scene.add(s.marker);
    var arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), markerMat); arrow.rotation.x = Math.PI; s.marker.add(arrow);
    s.ringMark = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.86, 28), ringMarkMat); s.ringMark.rotation.x = -Math.PI / 2; s.ringMark.position.set(o.x, 0.06, o.z); scene.add(s.ringMark);
    s.marker.visible = false; s.ringMark.visible = false;
    var hit = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), hitMat); hit.position.set(o.x, 0.8, o.z); scene.add(hit); hit.userData.spot = s; spotHits.push(hit);
    s.target = { id: s.id, type: 'spot', zone: s.zone, kind: s.kind, pos: s.pos, r: s.r, auto: s.auto };
    spots.push(s); return s;
  }
  function zoneSpots(z) { return spots.filter(function (s) { return s.zone === z; }); }
  function currentSpots() {
    if (!activeZone) return [];
    var list = zoneSpots(activeZone).filter(function (s) { return !s.done && !s.carried; });
    if (Z[activeZone].tpl === 'ride') { var bike = list.find(function (s) { return s.kind === 'bike'; }); if (bike) return [bike]; var r = list.find(function (s) { return s.kind === 'ring'; }); return r ? [r] : []; }
    return list;
  }
  var labelSign = function (text, color) { return textPlane(text, { w: 1.6, h: 0.42, bg: color || '#2f7d5b', size: 0.6 }); };

  /* ---------------- 마을 템플릿 ---------------- */
  var Z = {};
  function zoneGroup(zone) { var p = ZPOS[zone.id], d = zoneDir(zone.id); var g = new THREE.Group(); g.position.set(p[0] - d.x * 1.6, 0, p[1] - d.z * 1.6); g.rotation.y = Math.atan2(d.x, d.z); scene.add(g); return g; }
  function local(g, x, z) { var v = new THREE.Vector3(x, 0, z).applyMatrix4(new THREE.Matrix4().makeRotationY(g.rotation.y)); return { x: g.position.x + v.x, z: g.position.z + v.z }; }
  function colLocal(g, x, z, r) { var w = local(g, x, z); return addCircle(w.x, w.z, r); }
  function signFor(g, text, color, x, z, y) { var s = textPlane(text, { w: 3.6, h: 0.75, bg: color }); s.position.set(x || 0, y || 4.1, z || 2.6); g.add(s); return s; }
  function popIn(obj, delay, instant) { obj.visible = true; if (instant || reduce) { obj.scale.setScalar(1); return; } obj.scale.setScalar(0.001); setTimeout(function () { tween(0.7, function (k) { obj.scale.setScalar(Math.max(0.001, easeOutBack(k))); }); }, (delay || 0) * 1000); }
  var on = function (m, glow) { m.emissiveIntensity = glow; };

  /* 표준 소품: 바로잡을 물건 (생성된 팩용) */
  function genericDevice(label, color) {
    var g = new THREE.Group(); cyl(0.3, 0.36, 0.5, '#8f99a5', 0, 0.25, 0, g, 12);
    var glow = new THREE.MeshLambertMaterial({ color: '#fff0b0', emissive: '#ffc93c', emissiveIntensity: 0.95 });
    var panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.1), glow); panel.position.y = 1.0; panel.castShadow = true; g.add(panel);
    var L = labelSign(label, color); L.position.set(0, 1.62, 0); g.add(L);
    return { g: g, off: function () { on(glow, 0.03); glow.color.set('#bfc7cf'); } };
  }
  /* 표준 소품: 주울 물건 */
  var TRASH_KINDS = ['paper', 'pack', 'plastic', 'can', 'glass'];
  function makeTrash(kind, parent, label, color) {
    var g2 = new THREE.Group(); (parent || scene).add(g2);
    if (kind === 'paper') { var p = box(0.6, 0.06, 0.45, '#e9e4d8', 0, 0.05, 0, g2); p.rotation.y = 0.3; box(0.5, 0.065, 0.06, '#9aa3ad', 0, 0.06, -0.1, g2); box(0.5, 0.065, 0.06, '#9aa3ad', 0, 0.06, 0.08, g2); }
    else if (kind === 'pack') { box(0.3, 0.42, 0.3, '#ffffff', 0, 0.21, 0, g2); box(0.31, 0.1, 0.31, '#5fa8e8', 0, 0.3, 0, g2); cone(0.24, 0.18, '#ffffff', 0, 0.5, 0, g2, 4).rotation.y = Math.PI / 4; }
    else if (kind === 'plastic') { var bt = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 12), new THREE.MeshLambertMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.8 })); bt.position.y = 0.25; g2.add(bt); cyl(0.05, 0.05, 0.08, '#4aa3df', 0, 0.54, 0, g2, 8); g2.rotation.z = Math.PI / 2; g2.position.y = 0.13; }
    else if (kind === 'can') { cyl(0.12, 0.12, 0.32, '#c9ccd1', 0, 0.16, 0, g2, 14); cyl(0.125, 0.125, 0.12, '#e5484d', 0, 0.17, 0, g2, 14); }
    else if (kind === 'glass') { cyl(0.13, 0.14, 0.36, '#5cb85c', 0, 0.18, 0, g2, 12); cyl(0.05, 0.08, 0.18, '#5cb85c', 0, 0.45, 0, g2, 10); }
    else { box(0.5, 0.42, 0.5, color || '#c58b55', 0, 0.21, 0, g2); box(0.52, 0.06, 0.52, '#8a5a35', 0, 0.44, 0, g2); if (label) { var L = labelSign(label, '#8a5a35'); L.position.set(0, 0.85, 0); g2.add(L); } }
    g2.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g2;
  }
  var BIN_COLORS = ['#3d8bd9', '#8fb8de', '#f2b93b', '#9aa3ad', '#5cb85c', '#b8a1ff'];

  /* switch: 집 + 마당 거실 */
  function buildSwitch(zone) {
    var g = zoneGroup(zone), M = zone.mission;
    box(4.6, 3, 4.2, '#fff1dc', 0, 1.5, 0, g); cone(3.75, 2.3, '#ef7d63', 0, 4.15, 0, g, 4).rotation.y = Math.PI / 4; box(0.5, 1.1, 0.5, '#c9654f', 1.3, 4.6, -0.6, g);
    box(1.0, 1.75, 0.12, '#a8693f', 0, 0.88, 2.12, g); sph(0.06, '#ffd166', 0.32, 0.9, 2.2, g);
    var lit = new THREE.MeshLambertMaterial({ color: '#fff0b0', emissive: '#ffc93c', emissiveIntensity: 0.95 });
    [[-1.4, 1.95, 2.12], [1.4, 1.95, 2.12], [2.32, 1.9, 0], [-2.32, 1.9, 0]].forEach(function (w, i) { var m = new THREE.Mesh(new THREE.BoxGeometry(i < 2 ? 0.95 : 0.12, 0.95, i < 2 ? 0.1 : 0.95), lit); m.position.set(w[0], w[1], w[2]); g.add(m); if (i < 2) box(1.08, 0.1, 0.16, '#ffffff', w[0], w[1] - 0.52, w[2], g, false); });
    var bulbL = new THREE.PointLight('#ffcf55', 1.4, 7); bulbL.position.set(0, 2.2, 2.6); g.add(bulbL);
    var panels = new THREE.Group(); panels.position.set(0, 4.05, 1.3); panels.rotation.x = 0.73; g.add(panels);
    [-0.85, 0.85].forEach(function (x) { box(1.5, 0.08, 1.05, '#2c5aa6', x, 0, 0, panels); box(1.56, 0.06, 0.06, '#dfe7ef', x, 0.03, 0.5, panels, false); }); panels.visible = false;
    var turbine = new THREE.Group(), tw = local(g, -3.4, 1.2); turbine.position.set(tw.x, 0, tw.z); scene.add(turbine); cyl(0.08, 0.13, 3.6, '#f4f4f0', 0, 1.8, 0, turbine, 8);
    var rotor = new THREE.Group(); rotor.position.set(0, 3.6, 0.15); turbine.add(rotor);
    for (var b = 0; b < 3; b++) { var bl = box(0.16, 1.3, 0.05, '#ffffff', 0, 0.65, 0, null); var piv = new THREE.Group(); piv.rotation.z = (b / 3) * Math.PI * 2; piv.add(bl); rotor.add(piv); }
    turbine.rotation.y = g.rotation.y; turbine.visible = false;
    [[-3.0, 3.8, '#ffd9a8'], [3.3, 3.5, '#cfe7f8']].forEach(function (r) { var rug = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.04, 28), mat(r[2])); rug.position.set(r[0], 0.02, r[1]); rug.receiveShadow = true; g.add(rug); });
    colLocal(g, 0, 0, 2.9); signFor(g, zone.name, zone.color, 0, 2.3);
    var POS = [[-3.9, 2.9], [-2.3, 4.7], [1.7, 5.0], [3.4, 4.3], [4.2, 2.5], [-0.3, 6.0]];
    var mk = function (lx, lz) { var o = new THREE.Group(); o.position.set(lx, 0, lz); g.add(o); return o; };
    M.spots.forEach(function (sp, k) {
      var p = POS[k] || POS[POS.length - 1], o = mk(p[0], p[1]), fx;
      if (sp.prop === 'lamp') { cyl(0.2, 0.26, 0.08, '#6b5d7a', 0, 0.04, 0, o, 12); cyl(0.035, 0.035, 1.5, '#6b5d7a', 0, 0.8, 0, o, 6); var lampMat = new THREE.MeshLambertMaterial({ color: '#fff3b0', emissive: '#ffd34d', emissiveIntensity: 1 }); var sh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 0.38, 14, 1, true), lampMat); sh.position.y = 1.6; sh.material.side = THREE.DoubleSide; o.add(sh); var lampL = new THREE.PointLight('#ffd34d', 1.2, 4); lampL.position.y = 1.5; o.add(lampL); fx = function () { on(lampMat, 0.05); lampL.intensity = 0; }; }
      else if (sp.prop === 'tv') { box(1.4, 0.5, 0.5, '#a8693f', 0, 0.25, 0, o); box(1.25, 0.78, 0.08, '#2b2b30', 0, 0.98, 0, o); var tvMat = new THREE.MeshLambertMaterial({ color: '#8fd3ff', emissive: '#5fb8ff', emissiveIntensity: 1 }); var scr = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.64), tvMat); scr.position.set(0, 0.98, 0.045); o.add(scr); fx = function () { on(tvMat, 0); tvMat.color.set('#1d1d22'); }; }
      else if (sp.prop === 'charger') { box(0.7, 0.45, 0.5, '#c58b55', 0, 0.22, 0, o); box(0.5, 0.07, 0.15, '#f4f4f0', 0, 0.48, 0, o); var plug = new THREE.Group(); plug.position.set(-0.12, 0.54, 0); o.add(plug); box(0.1, 0.1, 0.1, '#ffffff', 0, 0, 0, plug); cyl(0.015, 0.015, 0.4, '#2b2b30', 0.15, 0.02, 0, plug, 5).rotation.z = Math.PI / 2; var phMat = new THREE.MeshLambertMaterial({ color: '#c9f0ff', emissive: '#7fdcff', emissiveIntensity: 1 }); box(0.18, 0.03, 0.32, '#2b2b30', 0.2, 0.48, 0.05, o); var ph = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.26), phMat); ph.rotation.x = -Math.PI / 2; ph.position.set(0.2, 0.5, 0.05); o.add(ph); fx = function (inst) { on(phMat, 0); phMat.color.set('#2b2b30'); if (inst) { plug.position.set(-0.1, 0.9, 0.35); return; } tween(0.5, function (k) { plug.position.y = 0.54 + k * 0.36; plug.position.z = k * 0.35; }); }; }
      else if (sp.prop === 'ac') { cyl(0.05, 0.05, 1.6, '#7d93a6', -0.45, 0.8, 0, o, 6); cyl(0.05, 0.05, 1.6, '#7d93a6', 0.45, 0.8, 0, o, 6); box(1.1, 0.4, 0.3, '#ffffff', 0, 1.7, 0, o); var t18 = textPlane((sp.ask && sp.ask.options[0]) || '18℃', { w: 0.5, h: 0.22, bg: '#2f86c4' }); t18.position.set(0.28, 1.72, 0.16); o.add(t18); var t26 = textPlane((sp.ask && sp.ask.options[sp.ask.answer]) || '26℃', { w: 0.5, h: 0.22, bg: '#2f7d5b' }); t26.position.set(0.28, 1.72, 0.16); t26.visible = false; o.add(t26); var coldE = addEmitter(function (v) { var w = local(g, p[0], p[1] + 0.3); v.set(w.x, 1.35, w.z); }, 1.2, 0.25); fx = function () { t18.visible = false; t26.visible = true; coldE.on = false; }; }
      else if (sp.prop === 'fridge') { box(0.8, 1.6, 0.7, '#f4f4f0', 0, 0.8, 0, o); var frMat = new THREE.MeshLambertMaterial({ color: '#e9f7ff', emissive: '#bfe9ff', emissiveIntensity: 0.9 }); var inner = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.4), frMat); inner.position.set(0, 0.8, 0.352); o.add(inner); var hinge = new THREE.Group(); hinge.position.set(-0.4, 0, 0.36); o.add(hinge); box(0.8, 1.56, 0.07, '#ffffff', 0.4, 0.8, 0, hinge); box(0.04, 0.4, 0.06, '#9aa3ad', 0.72, 0.95, 0.06, hinge); hinge.rotation.y = -1.3; fx = function (inst) { on(frMat, 0); if (inst) { hinge.rotation.y = 0; return; } tween(0.5, function (k) { hinge.rotation.y = -1.3 * (1 - k); }); }; }
      else { var dv = genericDevice(sp.label, zone.color); o.add(dv.g); fx = dv.off; }
      var w = local(g, p[0], p[1]); addCircle(w.x, w.z, 0.45);
      addSpot({ id: sp.id, zone: zone.id, kind: 'device', x: w.x, z: w.z, r: 1.9, h: 1.7, fx: fx });
    });
    return { g: g, clear: function (instant) { if (instant || reduce) { lit.emissiveIntensity = 0.05; lit.color.set('#bfe3f5'); bulbL.intensity = 0; } else tween(1.2, function (k) { lit.emissiveIntensity = lerp(0.95, 0.05, k); lit.color.lerpColors(new THREE.Color('#fff0b0'), new THREE.Color('#bfe3f5'), k); bulbL.intensity = lerp(1.4, 0, k); }); popIn(panels, 0.6, instant); popIn(turbine, 1.1, instant); addCircle(tw.x, tw.z, 0.35); }, update: function (dt) { if (turbine.visible) rotor.rotation.z -= dt * 2.4; } };
  }
  /* sort: 공장 + 분리수거함 + 떨어진 물건 */
  function buildSort(zone) {
    var g = zoneGroup(zone), M = zone.mission;
    box(5.4, 3.2, 4.2, '#e4ecf2', 0, 1.6, 0, g); box(5.6, 0.3, 4.4, '#8fa9bb', 0, 3.35, 0, g);
    [-1.8, 0, 1.8].forEach(function (x) { box(1.7, 0.9, 4.2, '#a9c0d0', x, 3.75, 0, g).rotation.z = 0.45; });
    box(2.2, 2.0, 0.12, '#7d93a6', -1.0, 1.0, 2.12, g); for (var s = 0; s < 4; s++) box(2.2, 0.05, 0.14, '#6b8194', -1.0, 0.35 + s * 0.45, 2.15, g, false); box(0.9, 0.9, 0.1, '#bfe3f5', 1.6, 2.0, 2.12, g);
    cyl(0.45, 0.55, 3.4, '#bba998', 1.9, 4.9, -1.1, g, 12); cyl(0.47, 0.47, 0.35, '#e8735a', 1.9, 5.9, -1.1, g, 12);
    var smoke = addEmitter(function (v) { var w = local(g, 1.9, -1.1); v.set(w.x, 6.8, w.z); }, 2.4, 1.3);
    var bins = new THREE.Group(); g.add(bins); bins.position.set(1.6, 0, 3.3);
    var n = M.bins.length;
    M.bins.forEach(function (b, i) { var c = BIN_COLORS[i % BIN_COLORS.length], x = (i - (n - 1) / 2) * 0.86; box(0.74, 0.95, 0.74, c, x, 0.48, 0, bins); box(0.8, 0.12, 0.8, shade(c, 0.85), x, 1.0, 0, bins); var l = textPlane(b.name, { w: 0.64, h: 0.3, bg: '#ffffff', fg: '#33424a' }); l.position.set(x, 0.55, 0.38); bins.add(l); });
    var bw = local(g, 1.6, 3.3); addCircle(bw.x, bw.z, 1.3); colLocal(g, 0, 0, 3.1); signFor(g, zone.name, zone.color, -0.4, 2.3);
    var POS = [[-3.6, 5.4], [-5.4, 2.4], [5.2, 6.0], [2.6, 7.8], [-2.2, 8.2], [5.8, 3.0]];
    M.spots.forEach(function (sp, k) {
      var p = POS[k] || POS[POS.length - 1], w = local(g, p[0], p[1]);
      var m = makeTrash(TRASH_KINDS.indexOf(sp.bin) >= 0 ? sp.bin : 'other', null, TRASH_KINDS.indexOf(sp.bin) >= 0 ? '' : sp.label, zone.color); m.position.x = w.x; m.position.z = w.z; m.rotation.y = rand(0, 6);
      addSpot({ id: sp.id, zone: zone.id, kind: 'trash', bin: sp.bin, label: sp.label, x: w.x, z: w.z, r: 1.25, h: 0.6, auto: true, mesh: m });
    });
    var bq = local(g, 1.6, 4.6); addSpot({ id: zone.id + '-bins', zone: zone.id, kind: 'bins', x: bq.x, z: bq.z, r: 2.2, h: 1.4 });
    return { g: g, clear: function () { smoke.on = false; }, update: function () {} };
  }
  /* plant: 숲 + 빈 흙더미 */
  function buildPlant(zone) {
    var g = zoneGroup(zone), M = zone.mission;
    var patchMat = new THREE.MeshLambertMaterial({ color: '#b9a074' });
    var patch = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.06, 32), patchMat); patch.position.set(0, 0.03, -0.5); patch.receiveShadow = true; g.add(patch);
    tree(-2.6, -1.6, 1.15, 0, g, true); tree(2.4, -2.0, 1.0, 1, g, true); colLocal(g, -2.6, -1.6, 0.55); colLocal(g, 2.4, -2.0, 0.5);
    [[-1, 0.4], [1.2, 0.6], [0.2, -2.4]].forEach(function (s) { cyl(0.36, 0.42, 0.45, '#8a5a35', s[0], 0.22, s[1], g, 10); cyl(0.33, 0.33, 0.02, '#e0b57d', s[0], 0.46, s[1], g, 10); });
    var flowersG = new THREE.Group(); g.add(flowersG);
    for (var i = 0; i < 14; i++) { var a = rand(0, Math.PI * 2), r = rand(1, 4.2); cyl(0.03, 0.03, 0.3, '#4f9f52', Math.cos(a) * r, 0.15, Math.sin(a) * r - 0.5, flowersG, 4); sph(0.12, FCOL[i % FCOL.length], Math.cos(a) * r, 0.34, Math.sin(a) * r - 0.5, flowersG); }
    flowersG.visible = false;
    var post = new THREE.Group(); post.position.set(2.2, 0, 2.4); g.add(post); cyl(0.1, 0.12, 2.2, '#8a5a35', 0, 1.1, 0, post, 8);
    var ps = textPlane(zone.name, { w: 2.6, h: 0.7, bg: zone.color }); ps.position.set(0, 2.2, 0.12); post.add(ps);
    var POS = [[-0.6, -0.9, 1.2, 0], [1.6, 0.9, 0.95, 1], [-2.2, 1.4, 1.0, 0], [3.0, -0.4, 0.9, 1], [-3.4, -0.4, 0.85, 0], [0.6, -3.4, 1.0, 1]];
    M.spots.forEach(function (sp, k) {
      var t = POS[k] || POS[POS.length - 1];
      var mound = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#8a5a35')); mound.scale.y = 0.45; mound.position.set(t[0], 0, t[1]); mound.receiveShadow = true; g.add(mound);
      var sap = new THREE.Group(); sap.position.set(t[0], 0.2, t[1]); g.add(sap); cyl(0.03, 0.04, 0.4, '#6b4224', 0, 0.2, 0, sap, 6); sph(0.16, '#7ccb6a', 0, 0.45, 0, sap); sap.visible = false;
      var tr = tree(t[0], t[1], t[2], t[3], g, true); tr.visible = false;
      var w = local(g, t[0], t[1]);
      addSpot({ id: sp.id, zone: zone.id, kind: 'plant', x: w.x, z: w.z, r: 1.7, h: 1.0, fx: function (inst) {
        if (inst) { mound.scale.set(0.8, 0.25, 0.8); tr.visible = true; tr.scale.setScalar(1); addCircle(w.x, w.z, 0.45 * t[2]); return; }
        popIn(sap, 0, false);
        setTimeout(function () { burst(w.x, 1.6, w.z, ['#8fd3ff', '#47b4ff', '#ffffff'], 16); }, 500);
        setTimeout(function () { sap.visible = false; mound.scale.set(0.8, 0.25, 0.8); popIn(tr, 0, false); addCircle(w.x, w.z, 0.45 * t[2]); burst(w.x, 2.2, w.z, ['#7fcd6b', '#a4d97a', '#ffd166'], 14, { leaf: true, life: 1.6 }); }, 1300);
      } });
    });
    return { g: g, clear: function (instant) { popIn(flowersG, 0.6, instant); if (instant || reduce) patchMat.color.set('#79c867'); else tween(1.6, function (k) { patchMat.color.lerpColors(new THREE.Color('#b9a074'), new THREE.Color('#79c867'), k); }); }, update: function () {} };
  }
  /* ride: 길 + 정류장 + 탈것 + 고리 + 목적지 */
  function buildRide(zone) {
    var g = zoneGroup(zone), M = zone.mission;
    box(12, 0.06, 3.2, '#5d636b', 0, 0.05, -0.6, g, false);
    for (var i = -5; i <= 5; i += 1.6) box(0.8, 0.07, 0.14, '#ffffff', i, 0.07, -0.6, g, false);
    for (var j = 0; j < 5; j++) box(0.36, 0.075, 1.4, '#ffffff', -0.9 + j * 0.45, 0.075, 1.6, g, false);
    var shelter = new THREE.Group(); shelter.position.set(-3.6, 0, 2.6); g.add(shelter);
    [-1, 1].forEach(function (s) { cyl(0.07, 0.07, 2.4, '#7d93a6', s * 1.1, 1.2, -0.4, shelter, 6); }); box(2.6, 0.12, 1.3, '#7cc8ff', 0, 2.45, -0.2, shelter); box(2.0, 0.12, 0.5, '#c58b55', 0, 0.55, -0.2, shelter);
    var st = textPlane(zone.short + ' 정류장', { w: 2.2, h: 0.5, bg: zone.color }); st.position.set(0, 2.8, -0.2); shelter.add(st);
    var car = new THREE.Group(); g.add(car); box(1.9, 0.62, 1.0, '#e5484d', 0, 0.55, 0, car); box(1.0, 0.5, 0.92, '#f7f2ec', -0.1, 1.1, 0, car); box(1.02, 0.36, 0.94, '#9fd3f5', -0.1, 1.12, 0, car, false);
    [[-0.6, 0.5], [0.6, 0.5], [-0.6, -0.5], [0.6, -0.5]].forEach(function (w) { cyl(0.24, 0.24, 0.16, '#2f3437', w[0], 0.26, w[1], car, 12).rotation.x = Math.PI / 2; });
    var bus = new THREE.Group(); g.add(bus); box(3.6, 1.35, 1.35, '#4caf50', 0, 0.95, 0, bus); box(3.62, 0.12, 1.37, '#ffffff', 0, 0.7, 0, bus, false); box(3.0, 0.45, 1.37, '#bfe8ff', 0.1, 1.3, 0, bus, false);
    var bl = textPlane('전기버스', { w: 1.3, h: 0.32, bg: '#ffffff', fg: '#2e7d32' }); bl.position.set(0, 0.95, 0.69); bus.add(bl);
    [[-1.2, 0.62], [1.2, 0.62], [-1.2, -0.62], [1.2, -0.62]].forEach(function (w) { cyl(0.3, 0.3, 0.18, '#2f3437', w[0], 0.3, w[1], bus, 12).rotation.x = Math.PI / 2; }); bus.visible = false;
    var bikes = new THREE.Group(); bikes.position.set(3.4, 0, 2.6); g.add(bikes);
    [0, 0.8].forEach(function (z) { var b = new THREE.Group(); b.position.z = z - 0.4; bikes.add(b); [-0.45, 0.45].forEach(function (x) { var wh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 16), mat('#2f3437')); wh.position.set(x, 0.32, 0); b.add(wh); }); box(0.95, 0.07, 0.07, z ? '#ffd166' : '#ff8fab', 0, 0.55, 0, b).rotation.z = 0.15; box(0.07, 0.4, 0.07, '#555b61', 0.35, 0.72, 0, b); box(0.3, 0.06, 0.12, '#2f3437', -0.25, 0.75, 0, b); }); bikes.visible = false;
    var exhaust = addEmitter(function (v) { var w = local(g, car.position.x - car.userData.dir * 1.1, car.position.z); v.set(w.x, 0.45, w.z); }, 3, 0.7);
    car.userData.dir = 1; bus.userData.dir = 1;
    function drive(v, dt, sp) { v.position.x += v.userData.dir * dt * sp; if (Math.abs(v.position.x) > 4.4) { v.userData.dir *= -1; v.position.x = clamp(v.position.x, -4.4, 4.4); } v.rotation.y = v.userData.dir > 0 ? 0 : Math.PI; v.position.z = v.userData.dir > 0 ? -1.3 : 0.1; }
    colLocal(g, -3.6, 2.4, 1.3); signFor(g, zone.name, zone.color, 1.2, 2.6, 3.2);
    // 목적지 건물
    var goal = new THREE.Group(); goal.position.set(-9.5, 0, 20.2); goal.rotation.y = 0.35; scene.add(goal);
    box(3.6, 2.2, 2.2, '#fff7e6', 0, 1.1, 0, goal); var sroof = cone(2.4, 1.1, '#5cb85c', 0, 2.75, 0, goal, 4); sroof.rotation.y = Math.PI / 4; sroof.scale.set(1.1, 1, 0.75);
    box(0.8, 1.2, 0.1, '#a8693f', 0, 0.6, 1.12, goal); [-1.1, 1.1].forEach(function (x) { box(0.6, 0.55, 0.1, '#bfe3f5', x, 1.35, 1.12, goal); });
    cyl(0.04, 0.04, 2.6, '#9aa3ad', 2.2, 1.3, 0.6, goal, 6); box(0.6, 0.38, 0.03, '#ff8a7a', 2.5, 2.4, 0.6, goal);
    var gs = textPlane(M.goal, { w: 2.2, h: 0.55, bg: '#2f7d5b' }); gs.position.set(0, 3.6, 0.6); goal.add(gs); addCircle(-9.5, 20.2, 2.2);
    // 탈것 (정류장 옆)
    var bw = local(g, -3.6, 3.9);
    var parked = new THREE.Group(); parked.position.set(bw.x + 0.9, 0, bw.z); scene.add(parked);
    [-0.45, 0.45].forEach(function (x) { var wh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 16), mat('#2f3437')); wh.position.set(x, 0.32, 0); parked.add(wh); });
    box(0.95, 0.07, 0.07, '#7fcd6b', 0, 0.55, 0, parked).rotation.z = 0.15; box(0.07, 0.4, 0.07, '#555b61', 0.35, 0.72, 0, parked); box(0.3, 0.06, 0.12, '#2f3437', -0.25, 0.75, 0, parked);
    var vl = labelSign(M.vehicle, zone.color); vl.position.set(0, 1.5, 0); parked.add(vl);
    var sp0 = M.spots[0];
    addSpot({ id: sp0.id, zone: zone.id, kind: 'bike', x: bw.x, z: bw.z, r: 1.9, h: 1.2, fx: function () { parked.visible = false; } });
    var RING_POS = [[17.5, 3.5], [10.5, -1.5], [5.5, 12.5], [-2.5, 15.5]], LAST = [-8.2, 17.6];
    var rings = M.spots.slice(1), nR = rings.length;
    rings.forEach(function (sp, i) {
      var last = i === nR - 1, p = last ? LAST : RING_POS[Math.min(i, RING_POS.length - 1)];
      var nx = last ? [-9.5, 20.2] : (i + 1 === nR - 1 ? LAST : RING_POS[Math.min(i + 1, RING_POS.length - 1)]);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 8, 28), new THREE.MeshLambertMaterial({ color: last ? '#7fcd6b' : '#ffd166', emissive: last ? '#7fcd6b' : '#ffd166', emissiveIntensity: 0.5, transparent: true }));
      ring.position.set(p[0], 1.25, p[1]); ring.rotation.y = Math.atan2(nx[0] - p[0], nx[1] - p[1]); ring.visible = false; scene.add(ring);
      addSpot({ id: sp.id, zone: zone.id, kind: 'ring', x: p[0], z: p[1], r: 1.6, h: 2.0, auto: true, ring: ring });
    });
    return { g: g, clear: function (instant) { car.visible = false; exhaust.on = false; popIn(bus, 0.3, instant); popIn(bikes, 0.8, instant); colLocal(g, 3.4, 2.6, 0.9); }, update: function (dt) { if (car.visible) drive(car, dt, 2.2); if (bus.visible) drive(bus, dt, 1.6); } };
  }
  var BUILD = { switch: buildSwitch, sort: buildSort, plant: buildPlant, ride: buildRide };
  zonesMeta.forEach(function (zone) { var b = BUILD[zone.template](zone); Z[zone.id] = Object.assign({ id: zone.id, tpl: zone.template }, b); });

  /* 마을마다 친구 + 걱정 구름 5개 */
  var TPLI = window.GQPack.TPL_INFO;
  zonesMeta.forEach(function (z, zi) {
    var p = ZPOS[z.id], d = zoneDir(z.id), fx = p[0] + d.x * 4.6, fz = p[1] + d.z * 4.6;
    var c = makeCritter(z.animal, z.color); c.root.position.set(fx, 0, fz); c.root.rotation.y = Math.atan2(d.x, d.z); scene.add(c.root); addCircle(fx, fz, 0.55);
    var t = addTarget({ id: z.id, type: 'friend', zone: z.id, name: z.friend, r: 2.6 }, c.root, 1.1, 1.0); t.pos = c.root.position; t.critter = c;
    t.label = addLabel('<b>' + z.friend + '</b><small>' + z.mission.icon + ' ' + z.mission.title + ' 체험</small><i class="stamp">✓</i>', c.root, 2.25, 'friend');
    Z[z.id].friend = t; Z[z.id].smogs = [];
    for (var k = 0; k < 5; k++) { var a = (k / 5) * Math.PI * 2 + zi, r = 1.6 + (k % 2) * 1.2; Z[z.id].smogs.push(makeSmog(p[0] + Math.cos(a) * r, 5.2 + (k % 3) * 0.7, p[1] + Math.sin(a) * r)); }
  });

  /* 들고 다니는 물건 · 타는 탈것 */
  var carryG = new THREE.Group(); carryG.position.y = 2.25; var carryMesh = null;
  var rideG = new THREE.Group(); rideG.visible = false; var riding = false;
  [-0.42, 0.42].forEach(function (z) { var wh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 16), mat('#2f3437')); wh.rotation.y = Math.PI / 2; wh.position.set(0, 0.3, z); rideG.add(wh); });
  (function () { var f = box(0.07, 0.07, 0.9, '#7fcd6b', 0, 0.55, 0, rideG); f.rotation.x = -0.15; box(0.4, 0.06, 0.06, '#2f3437', 0, 0.85, 0.38, rideG); box(0.14, 0.05, 0.24, '#2f3437', 0, 0.68, -0.25, rideG); })();
  function spotFx(s, instant) {
    if (s.fx) s.fx(instant);
    if (s.kind === 'trash' && s.mesh && instant) scene.remove(s.mesh);
    if (s.kind === 'ring' && s.ring) { s.ring.material.color.set('#7fcd6b'); s.ring.material.emissive.set('#7fcd6b'); if (!instant) { burst(s.pos.x, 1.4, s.pos.z, ['#ffd166', '#7fcd6b', '#ffffff'], 16); tween(0.6, function (k) { s.ring.scale.setScalar(1 + k * 0.5); s.ring.material.opacity = 1 - k; }, function () { s.ring.visible = false; }); } else s.ring.visible = false; }
  }

  /* ---------------- 플레이어 · 모자 · 마스코트 ---------------- */
  var player = { pos: new THREE.Vector3(0, 0, 7.5), vel: new THREE.Vector3(), heading: Math.PI, rig: null, radius: 0.42 };
  var playerObj = new THREE.Group(); scene.add(playerObj); playerObj.add(carryG); playerObj.add(rideG);
  var hatKind = 'none';
  function buildHat(kind) {
    var g = new THREE.Group(); var m = function (geo, c, x, y, z) { var o = new THREE.Mesh(geo, pm(c, 0.2)); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    if (kind === 'sprout') { m(new THREE.TorusGeometry(0.43, 0.03, 6, 24), '#ffd166', 0, 0.62, 0).rotation.x = Math.PI / 2; m(new THREE.CylinderGeometry(0.025, 0.03, 0.26, 6), '#4f9f52', 0, 0.92, 0); [-1, 1].forEach(function (s) { var l = m(new THREE.SphereGeometry(0.11, 12, 8), '#7ccb6a', s * 0.11, 1.06, 0); l.scale.set(1.5, 0.45, 0.8); l.rotation.z = s * 0.5; }); }
    else if (kind === 'bear') { m(new THREE.TorusGeometry(0.44, 0.04, 6, 24, Math.PI), '#f4f4f0', 0, 0.36, 0); [-1, 1].forEach(function (s) { m(new THREE.SphereGeometry(0.15, 14, 10), '#fbfbf8', s * 0.32, 0.78, -0.02); m(new THREE.SphereGeometry(0.075, 10, 8), '#f7b7c3', s * 0.32, 0.79, 0.08).scale.z = 0.5; }); }
    else if (kind === 'flower') { var FC = ['#ff8fab', '#ffd166', '#b8a1ff', '#8fd3ff', '#ff9f68', '#ffffff', '#7ccb6a']; for (var i = 0; i < 9; i++) { var a = (i / 9) * Math.PI * 2; m(new THREE.SphereGeometry(i % 2 ? 0.07 : 0.1, 10, 8), FC[i % FC.length], Math.cos(a) * 0.4, 0.64 + Math.sin(i * 1.7) * 0.02, Math.sin(a) * 0.38); } }
    else if (kind === 'earth') { m(new THREE.SphereGeometry(0.47, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), '#58b4ea', 0, 0.38, 0); [[0.2, 0.75, 0.15, 0.13], [-0.18, 0.72, -0.18, 0.11], [0.05, 0.82, -0.25, 0.09]].forEach(function (p) { m(new THREE.SphereGeometry(p[3], 10, 8), '#7ccb6a', p[0], p[1], p[2]).scale.y = 0.5; }); m(new THREE.SphereGeometry(0.07, 8, 6), '#ffffff', 0, 0.86, 0); }
    else if (kind === 'crown') { m(new THREE.CylinderGeometry(0.3, 0.33, 0.18, 18, 1, true), '#ffc933', 0, 0.84, 0).material.side = THREE.DoubleSide; for (var k = 0; k < 6; k++) { var b = (k / 6) * Math.PI * 2; m(new THREE.ConeGeometry(0.06, 0.16, 6), '#ffc933', Math.cos(b) * 0.3, 1.0, Math.sin(b) * 0.3); m(new THREE.SphereGeometry(0.035, 8, 6), k % 2 ? '#ff6b8b' : '#47b4ff', Math.cos(b) * 0.32, 0.84, Math.sin(b) * 0.32); } }
    return g;
  }
  function setHat(kind) { hatKind = kind || 'none'; if (!player.rig) return; if (player.rig.hat) { player.rig.head.remove(player.rig.hat); player.rig.hat = null; } if (hatKind !== 'none') { player.rig.hat = buildHat(hatKind); player.rig.head.add(player.rig.hat); } }
  function setAvatar(look) { if (player.rig) playerObj.remove(player.rig.root); player.rig = makePerson(look); playerObj.add(player.rig.root); setHat(hatKind); }
  setAvatar({});
  var bear = makeCritter(P.mascot.animal, P.mascot.color); bear.root.position.set(-1.2, 0, 8.6); scene.add(bear.root);
  var bearPos = bear.root.position, bearHead = Math.PI, bearCol = addCircle(0, 0, 0.42); bearCol.off = true;
  var bearT = addTarget({ id: 'mascot', type: 'mascot', name: P.mascot.name, r: 2.2 }, bear.root, 0.9, 0.9); bearT.pos = bearPos;
  addLabel('<b>' + P.mascot.name + '</b><small>눌러서 같이 놀자!</small>', bear.root, 2.05, 'mascot');

  /* 반짝 씨앗 12개 */
  var SEED_POS = [[-5, 8.2], [6, 7], [-10.5, 2], [10.5, 1.5], [-17.5, -3], [17.5, -2.5], [-4.5, -12.5], [5.5, -13.5], [-20, 7.5], [20, 8.5], [1, 17.5], [-12.5, 15.5]];
  var seeds = [];
  SEED_POS.forEach(function (p, i) {
    var g = new THREE.Group(); g.position.set(p[0], 0, p[1]); scene.add(g); var body = new THREE.Group(); body.position.y = 0.95; g.add(body);
    var nut = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), pm('#d99a4e', 0.35)); nut.scale.set(1, 1.2, 1); body.add(nut);
    var capM = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), pm('#8a5a35', 0.2)); capM.position.y = 0.08; body.add(capM);
    var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6), pm('#7ccb6a', 0.4)); leaf.position.set(0.08, 0.32, 0); leaf.scale.set(1.4, 0.4, 0.8); leaf.rotation.z = -0.5; body.add(leaf);
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 28), new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.55, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    seeds.push({ id: 's' + i, g: g, body: body, ring: ring, taken: false, seed: i * 0.7 });
  });
  function takeSeed(s, instant) { if (s.taken) return; s.taken = true; if (instant) { scene.remove(s.g); return; } burst(s.g.position.x, 1, s.g.position.z, ['#ffe27a', '#7ccb6a', '#ffffff'], 16); tween(0.35, function (k) { s.body.position.y = 0.95 + k * 1.2; s.body.scale.setScalar(Math.max(0.01, 1 - k)); s.ring.material.opacity = 0.55 * (1 - k); }, function () { scene.remove(s.g); }); }

  /* 길 안내 화살표 · 춤 */
  var guide = new THREE.Group(); scene.add(guide); guide.visible = false;
  var gMat = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.9, depthWrite: false });
  var gArrow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.75, 3), gMat); gArrow.rotation.x = Math.PI / 2; gArrow.position.set(0, 0.12, 1.7); gArrow.scale.set(1, 1, 0.25); guide.add(gArrow);
  [1.05, 0.7].forEach(function (z, i) { var d = new THREE.Mesh(new THREE.CircleGeometry(0.09 - i * 0.02, 12), gMat); d.rotation.x = -Math.PI / 2; d.position.set(0, 0.08, z); guide.add(d); });
  var guideTarget = null, danceT = 0, danceBeat = 0;

  /* ---------------- 입력 ---------------- */
  var keys = {}, paused = false, moveTarget = null, pendingTalk = null, near = null;
  function jump() { if (player.rig && player.rig.jump <= 0) { player.rig.jump = 0.55; opts.onJump && opts.onJump(); } if (bear.jump <= 0) setTimeout(function () { bear.jump = 0.6; }, 120); }
  addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    keys[e.code] = true; if (paused) return;
    if ((e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') && near) { e.preventDefault(); opts.onTalk && opts.onTalk(near); }
    else if (e.code === 'Space') { e.preventDefault(); jump(); }
  });
  addEventListener('keyup', function (e) { keys[e.code] = false; }); addEventListener('blur', function () { keys = {}; });
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), gp = new THREE.Vector3(), down = null;
  canvas.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY }; opts.onUserGesture && opts.onUserGesture(); });
  canvas.addEventListener('pointerup', function (e) {
    if (!down || paused) { down = null; return; }
    var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null; if (moved > 12) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    var cur = currentSpots();
    var hits = ray.intersectObjects(targets.map(function (t) { return t.hit; }).concat(spotHits.filter(function (h) { return cur.indexOf(h.userData.spot) >= 0; })), false);
    if (hits.length) {
      var hs = hits[0].object.userData.spot, t = hs ? hs.target : hits[0].object.userData.target;
      if (hs && hs.auto) { moveTarget = { x: t.pos.x, z: t.pos.z, stopR: 0.3 }; pendingTalk = null; ping(t.pos.x, t.pos.z); return; }
      if (dist2(player.pos, t.pos) < t.r) { opts.onTalk && opts.onTalk(t); return; }
      pendingTalk = t; moveTarget = { x: t.pos.x, z: t.pos.z, stopR: t.r * 0.85 }; return;
    }
    if (ray.ray.intersectPlane(groundPlane, gp)) { var l = Math.hypot(gp.x, gp.z); if (l > ISLAND_R - 0.5) { gp.x *= (ISLAND_R - 0.5) / l; gp.z *= (ISLAND_R - 0.5) / l; } moveTarget = { x: gp.x, z: gp.z, stopR: 0.3 }; pendingTalk = null; ping(gp.x, gp.z); }
  });
  var pingM = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false })); pingM.rotation.x = -Math.PI / 2; pingM.visible = false; scene.add(pingM); var pingT = 0;
  function ping(x, z) { pingM.position.set(x, 0.08, z); pingM.visible = true; pingT = 0.6; }
  function readInput() {
    var ix = 0, iz = 0;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1; if (keys.KeyD || keys.ArrowRight) ix += 1; if (keys.KeyW || keys.ArrowUp) iz -= 1; if (keys.KeyS || keys.ArrowDown) iz += 1;
    var mag = Math.hypot(ix, iz);
    if (mag > 0.05) { moveTarget = null; pendingTalk = null; ix /= mag; iz /= mag; mag = 1; }
    else if (moveTarget) { var dx = moveTarget.x - player.pos.x, dz = moveTarget.z - player.pos.z, d = Math.hypot(dx, dz); if (d < moveTarget.stopR) { moveTarget = null; ix = iz = mag = 0; } else { mag = Math.min(1, d / 1.2); ix = dx / d * mag; iz = dz / d * mag; } }
    else mag = 0;
    return { ix: ix, iz: iz, mag: mag, run: !!(keys.ShiftLeft || keys.ShiftRight) };
  }

  /* ---------------- 카메라 ---------------- */
  var camLook = new THREE.Vector3(0, 1, 4), focusPos = null, OFF = new THREE.Vector3(0, 10.5, 13.5);
  function updateCamera(dt) {
    var portrait = innerHeight > innerWidth * 1.1;
    var want = focusPos ? focusPos.clone() : player.pos.clone().add(new THREE.Vector3(0, 1, -1.5));
    camLook.lerp(want, 1 - Math.exp(-4 * dt));
    var k = (portrait ? 1.45 : 1) * (focusPos ? 0.78 : 1);
    camera.position.lerp(camLook.clone().add(OFF.clone().multiplyScalar(k)), 1 - Math.exp(-3.5 * dt)); camera.lookAt(camLook);
  }

  /* ---------------- 맑아짐 · 표정 ---------------- */
  var clean = 0, cleanTarget = 0, stage = -1, celebrateOn = false, packTarget = 1, packK = 1;
  function applyClean() {
    var k = clean;
    scene.background.lerpColors(SKY_DIRTY, SKY_CLEAN, k); scene.fog.color.copy(scene.background); scene.fog.near = lerp(30, 80, k); scene.fog.far = lerp(100, 220, k);
    hemi.intensity = lerp(0.9, 1.15, k); sun.intensity = lerp(1.55, 2.3, k); grassMat.color.lerpColors(GRASS_DIRTY, GRASS_CLEAN, k);
    var fcnt = Math.floor(FLOWER_N * clamp((k - 0.15) / 0.85, 0, 1)); stemIM.count = fcnt; headIM.count = fcnt;
    iceN.scale.set(lerp(0.45, 1.15, k), lerp(0.45, 1.15, k), 0.32); iceS.scale.set(lerp(0.5, 1.1, k), lerp(0.5, 1.1, k), 0.3);
    column.scale.y = lerp(1, 0.1, k); liqMat.color.lerpColors(LIQ_HOT, LIQ_COOL, k); liqMat.emissive.copy(liqMat.color);
    var s = k >= 0.999 ? 3 : k >= 0.62 ? 2 : k >= 0.3 ? 1 : 0; if (s !== stage) { stage = s; setFace(s); }
  }
  function setFace(s) {
    frown.visible = s === 0; ohMouth.visible = s === 1; smile.visible = s === 2; grin.visible = s === 3;
    sweat.forEach(function (d, i) { d.visible = s === 0 || (s === 1 && i === 0); });
    eCheeks.forEach(function (c) { c.material.color.set(s <= 1 ? '#ff6b6b' : '#ffb0b8'); c.scale.setScalar(s === 0 ? 1.25 : s === 1 ? 1.1 : 0.95); });
    eEyes.forEach(function (e) { e.userData.sy = s === 0 ? 0.7 : s === 1 ? 0.95 : 1.15; e.scale.y = e.userData.sy; });
    spark.forEach(function (p) { p.visible = s >= 2; }); packTarget = s <= 1 ? 1 : 0;
  }
  function updatePack(dt) { packK = reduce ? packTarget : lerp(packK, packTarget, 1 - Math.exp(-5 * dt)); if (Math.abs(packK - packTarget) < 0.01) packK = packTarget; icePack.visible = packK > 0.02; icePack.scale.setScalar(Math.max(0.01, packK)); icePack.position.y = 1.72 + (1 - packK) * 1.2; }
  function popSmog(zoneId) {
    var zz = Z[zoneId]; if (!zz) return; var s = zz.smogs.find(function (m) { return m.alive; }); if (!s) return; s.alive = false; var p = s.g.position.clone();
    tween(0.5, function (k) { s.g.scale.setScalar(k < 0.35 ? 1 + k * 0.8 : Math.max(0.01, (1 - k) * 1.8)); }, function () { scene.remove(s.g); });
    setTimeout(function () { burst(p.x, p.y, p.z, ['#ffffff', '#c9f0ff', '#ffe9a8'], 14); spawnButterfly(p.x, p.y, p.z, new THREE.Vector3(ZPOS[zoneId][0], 0, ZPOS[zoneId][1])); }, reduce ? 0 : 180);
  }
  function removeSmogInstant(zoneId, n) { var zz = Z[zoneId], c = 0; zz.smogs.forEach(function (s) { if (s.alive && c < n) { s.alive = false; scene.remove(s.g); c++; spawnButterfly(s.g.position.x, 2, s.g.position.z, new THREE.Vector3(ZPOS[zoneId][0], 0, ZPOS[zoneId][1])); } }); }
  var clearedZones = {};
  function clearZone(zoneId, instant) { if (clearedZones[zoneId]) return; clearedZones[zoneId] = true; var zz = Z[zoneId]; removeSmogInstant(zoneId, 5); zz.clear(instant); zz.friend.label.el.classList.add('done'); if (!instant) { var p = ZPOS[zoneId]; burst(p[0], 3, p[1], ['#7fcd6b', '#ffd166', '#a4d97a', '#ff8fab'], 26, { leaf: true, life: 2.2 }); } }
  function celebrate() { celebrateOn = true; rainbow.visible = true; tween(2.2, function (k) { rainbow.scale.setScalar(Math.max(0.001, easeInOut(k))); }); for (var i = 0; i < 4; i++) (function (i) { setTimeout(function () { burst(rand(-6, 6), rand(4, 7), rand(-6, 4), ['#ff8fab', '#ffd166', '#8fd3ff', '#b8a1ff', '#7fcd6b'], 30, { leaf: true, life: 2.6 }); }, i * 450); })(i); cheer(); }
  function cheer() { if (player.rig) player.rig.jump = 0.55; bear.jump = 0.6; }

  /* ---------------- 루프 ---------------- */
  var clock = new THREE.Clock(), idleHop = 2, frameCount = 0, stuckT = 0;
  function frame() {
    var dt = Math.min(0.05, clock.getDelta()); T += dt; frameCount++; updateTweens(dt);
    var inp = paused ? { ix: 0, iz: 0, mag: 0 } : readInput();
    var top = (inp.run ? 7.6 : 5.0) * (riding ? 1.55 : 1), kk = 1 - Math.exp(-(inp.mag > 0.05 ? 11 : 15) * dt);
    player.vel.x += (inp.ix * top - player.vel.x) * kk; player.vel.z += (inp.iz * top - player.vel.z) * kk;
    var px = player.pos.x, pz = player.pos.z;
    player.pos.x += player.vel.x * dt; player.pos.z += player.vel.z * dt; resolve(player.pos, player.radius);
    var sp = Math.hypot(player.vel.x, player.vel.z), moved = Math.hypot(player.pos.x - px, player.pos.z - pz);
    if (moveTarget && inp.mag > 0.2 && moved < sp * dt * 0.15) { stuckT += dt; if (stuckT > 0.5) { moveTarget = null; stuckT = 0; } } else stuckT = 0; // 물건에 막히면 걷기를 멈춤
    if (sp > 0.3) player.heading = angLerp(player.heading, Math.atan2(player.vel.x, player.vel.z), 1 - Math.exp(-14 * dt));
    if (danceT > 0) { danceT -= dt; danceBeat -= dt; player.heading += dt * 5.5; if (danceBeat <= 0) { danceBeat = 0.55; if (player.rig) player.rig.jump = 0.5; bear.jump = 0.55; burst(player.pos.x + rand(-0.6, 0.6), 2.4, player.pos.z + rand(-0.6, 0.6), ['#b8a1ff', '#ff8fab', '#ffd166', '#8fd3ff'], 4); } }
    playerObj.position.copy(player.pos); playerObj.rotation.y = player.heading;
    if (player.rig) { animPerson(player.rig, sp, dt); player.rig.root.position.y = riding ? 0.3 : 0; }
    if (pendingTalk && dist2(player.pos, pendingTalk.pos) < pendingTalk.r) { var t = pendingTalk; pendingTalk = null; moveTarget = null; player.vel.set(0, 0, 0); player.heading = Math.atan2(t.pos.x - player.pos.x, t.pos.z - player.pos.z); opts.onTalk && opts.onTalk(t); }
    seeds.forEach(function (s) { if (s.taken) return; s.body.rotation.y += dt * 1.6; s.body.position.y = 0.95 + Math.sin(T * 2.2 + s.seed) * 0.12; s.ring.scale.setScalar(1 + Math.sin(T * 3 + s.seed) * 0.08); if (dist2(player.pos, s.g.position) < 1.3) { takeSeed(s); opts.onSeed && opts.onSeed(s.id); } });
    if (guideTarget) { var gd = dist2(player.pos, guideTarget); guide.visible = gd > 4.5 && !paused; if (guide.visible) { guide.position.set(player.pos.x, 0, player.pos.z); guide.rotation.y = Math.atan2(guideTarget.x - player.pos.x, guideTarget.z - player.pos.z); gArrow.position.z = 1.7 + Math.sin(T * 5) * 0.15; } } else guide.visible = false;
    // 마스코트 따라다니기
    var off = new THREE.Vector3(-1.1, 0, -1.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.heading), bt = player.pos.clone().add(off), bd = dist2(bearPos, bt), bmove = false;
    if (bd > 14) bearPos.copy(bt);
    else if (bd > 0.5) { var bs = Math.min(bd * 2.2, bd > 5 ? 8 : 5.4), dx = (bt.x - bearPos.x) / bd, dz = (bt.z - bearPos.z) / bd; bearPos.x += dx * bs * dt; bearPos.z += dz * bs * dt; bearHead = angLerp(bearHead, Math.atan2(dx, dz), 1 - Math.exp(-10 * dt)); bmove = true; }
    else { bearHead = angLerp(bearHead, Math.atan2(player.pos.x - bearPos.x, player.pos.z - bearPos.z), 1 - Math.exp(-4 * dt)); idleHop -= dt; if (idleHop < 0) { idleHop = rand(3, 7); if (Math.random() < 0.5) bear.jump = 0.6; } }
    resolve(bearPos, 0.4, bearCol); bear.root.rotation.y = bearHead; animCritter(bear, bmove, dt);
    targets.forEach(function (t) { if (t.type !== 'friend') return; var d = dist2(player.pos, t.pos), face = Math.atan2(player.pos.x - t.pos.x, player.pos.z - t.pos.z); if (d < 7) { t.obj.rotation.y = angLerp(t.obj.rotation.y, face, 1 - Math.exp(-5 * dt)); if (!t.waved && d < 4.5) { t.critter.wave = 1.2; t.waved = true; } } if (d > 8) t.waved = false; animCritter(t.critter, false, dt); });
    // 체험 물건
    var curS = currentSpots();
    spots.forEach(function (s) {
      var act = curS.indexOf(s) >= 0 && (s.kind !== 'bins' || !!carryMesh);
      s.marker.visible = act; s.ringMark.visible = act && s.kind !== 'ring'; if (s.kind === 'ring' && s.ring && !s.done) s.ring.visible = act;
      if (act) { s.marker.position.y = s.h + 0.9 + Math.sin(T * 4 + s.pos.x) * 0.15; s.marker.rotation.y += dt * 2; }
      if (act && s.auto) { var inR = dist2(player.pos, s.pos) < s.r; if (inR && !s.inside && !paused) { s.inside = true; opts.onSpot && opts.onSpot(s.target); } else if (!inR) s.inside = false; }
    });
    var best = null, bestD = 1e9;
    curS.forEach(function (s) { if (s.auto || (s.kind === 'bins' && !carryMesh)) return; var d = dist2(player.pos, s.pos); if (d < s.r && d < bestD) { best = s.target; bestD = d; } });
    if (!best) targets.forEach(function (t) { if (t.type === 'mascot') return; var d = dist2(player.pos, t.pos); if (d < t.r && d < bestD) { best = t; bestD = d; } });
    if (best !== near) { near = best; opts.onNear && opts.onNear(near); }
    clean = lerp(clean, cleanTarget, 1 - Math.exp(-1.6 * dt)); if (Math.abs(clean - cleanTarget) < 0.001) clean = cleanTarget; applyClean(); updatePack(dt);
    ball.position.y = 2.75 + Math.sin(T * 2) * 0.07 + (celebrateOn ? Math.abs(Math.sin(T * 4)) * 0.25 : 0); lands.rotation.y = Math.sin(T * 0.35) * 0.18;
    sweat.forEach(function (d, i) { if (!d.visible) return; var k = (T * 0.6 + i * 0.5) % 1; d.position.y = d.userData.y0 - k * 0.8; d.scale.setScalar(1 - k * 0.6); d.scale.y *= 1.3; });
    eArms.forEach(function (a, i) { var s = i ? 1 : -1; a.rotation.z = s * (stage >= 3 ? 1.9 + Math.sin(T * 9 + i) * 0.4 : stage === 2 ? 0.7 + Math.sin(T * 2 + i) * 0.1 : 0.35); });
    if (rainbow.visible) rainbow.rotation.z = Math.sin(T * 0.3) * 0.01;
    Object.keys(Z).forEach(function (id) { var zz = Z[id]; zz.update && zz.update(dt); zz.smogs && zz.smogs.forEach(function (s) { if (!s.alive) return; s.g.position.y = s.base + Math.sin(T * 1.4 + s.seed) * 0.25; s.body.rotation.z = Math.sin(T * 1.1 + s.seed) * 0.08; s.g.rotation.y = Math.atan2(camera.position.x - s.g.position.x, camera.position.z - s.g.position.z); }); });
    clouds.forEach(function (c) { c.a += c.sp * dt; c.g.position.x = Math.cos(c.a) * c.r; c.g.position.z = Math.sin(c.a) * c.r; });
    updateButterflies(dt); updateParts(dt); updateSmoke(dt);
    if (pingT > 0) { pingT -= dt; pingM.scale.setScalar(1 + (0.6 - pingT) * 1.6); pingM.material.opacity = Math.max(0, pingT / 0.6); if (pingT <= 0) pingM.visible = false; }
    updateCamera(dt); renderer.render(scene, camera); updateLabels(); nextFrame(frame);
  }
  /* 창이 가려지면 브라우저가 화면 갱신(rAF)을 멈추므로, 그때는 느린 타이머가 대신 이어 갑니다 */
  function nextFrame(cb) {
    var done = false, id = 0, to = 0;
    var go = function () { if (done) return; done = true; cancelAnimationFrame(id); clearTimeout(to); cb(performance.now()); };
    id = requestAnimationFrame(go); to = setTimeout(go, 120);
  }
  addEventListener('resize', function () { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });
  nextFrame(frame);

  return {
    setAvatar: setAvatar, setHat: setHat, jump: jump,
    dance: function (sec) { danceT = sec || 4; danceBeat = 0; },
    hearts: function () { burst(bearPos.x, 1.9, bearPos.z, ['#ff8fab', '#ff6b8b', '#ffc2d1', '#ffffff'], 18); bear.jump = 0.6; bear.wave = 1.2; },
    seedsTaken: function (map) { seeds.forEach(function (s) { if (map && map[s.id]) takeSeed(s, true); }); },
    nextSeed: function () { var best = null, bd = 1e9; seeds.forEach(function (s) { if (s.taken) return; var d = dist2(player.pos, s.g.position); if (d < bd) { bd = d; best = s; } }); return best ? { x: best.g.position.x, z: best.g.position.z } : null; },
    setGuide: function (t) { if (!t) { guideTarget = null; return; } if (typeof t === 'string') { var tg = targets.find(function (x) { return x.id === t; }); guideTarget = tg ? tg.pos : null; } else guideTarget = new THREE.Vector3(t.x, 0, t.z); },
    walkTo: function (id) { var t = targets.find(function (x) { return x.id === id; }); if (t) { pendingTalk = t; moveTarget = { x: t.pos.x, z: t.pos.z, stopR: t.r * 0.85 }; } },
    walkToPos: function (p, stopR) { if (!p) return; pendingTalk = null; moveTarget = { x: p.x, z: p.z, stopR: stopR || 0.4 }; },
    setClean: function (k, instant) { cleanTarget = clamp(k, 0, 1); if (instant) { clean = cleanTarget; applyClean(); } },
    popSmog: popSmog, removeSmog: removeSmogInstant, clearZone: clearZone, celebrate: celebrate, cheer: cheer,
    pause: function (b) { paused = !!b; if (paused) { moveTarget = null; pendingTalk = null; keys = {}; } },
    focus: function (id) { if (!id) { focusPos = null; return; } if (id === 'me') { focusPos = new THREE.Vector3(player.pos.x, -1.7, player.pos.z + 0.4); return; } var t = targets.find(function (x) { return x.id === id; }); focusPos = t ? new THREE.Vector3(t.pos.x * 0.7 + player.pos.x * 0.3, t.type === 'earth' ? 0.2 : -1.0, t.pos.z * 0.7 + player.pos.z * 0.3 + 1.6) : null; },
    near: function () { return near; },
    pos: function () { return { x: player.pos.x, z: player.pos.z }; },
    debug: function () { return { frames: frameCount, paused: paused, moveTarget: moveTarget, pendingTalk: pendingTalk ? pendingTalk.id : null, targets: targets.map(function (t) { return t.id; }) }; },
    missionOn: function (zone) { activeZone = zone || null; },
    spotDone: function (id, instant) { var s = spots.find(function (x) { return x.id === id; }); if (!s || s.done) return; s.done = true; spotFx(s, instant); },
    nextSpot: function (zone) {
      var z0 = activeZone; activeZone = zone; var list = currentSpots(); activeZone = z0;
      if (carryMesh && Z[zone] && Z[zone].tpl === 'sort') { var b = spots.find(function (s) { return s.zone === zone && s.kind === 'bins'; }); return b ? { x: b.pos.x, z: b.pos.z } : null; }
      list = list.filter(function (s) { return s.kind !== 'bins'; });
      var bs = null, bd = 1e9; list.forEach(function (s) { var d = dist2(player.pos, s.pos); if (d < bd) { bd = d; bs = s; } }); return bs ? { x: bs.pos.x, z: bs.pos.z } : null;
    },
    carry: function (id) { if (carryMesh) { carryG.remove(carryMesh); carryMesh = null; } if (!id) return; var s = spots.find(function (x) { return x.id === id; }); if (!s) return; if (s.mesh) s.mesh.visible = false; s.carried = true; carryMesh = makeTrash(TRASH_KINDS.indexOf(s.bin) >= 0 ? s.bin : 'other', carryG); carryMesh.scale.setScalar(1.3); },
    dropCarried: function (id) { var s = spots.find(function (x) { return x.id === id; }); if (s) { s.carried = false; if (s.mesh) s.mesh.visible = true; } if (carryMesh) { carryG.remove(carryMesh); carryMesh = null; } },
    bike: function (onB) { riding = !!onB; rideG.visible = riding; },
    binsBurst: function (zone) { var b = spots.find(function (s) { return s.zone === zone && s.kind === 'bins'; }); if (b) burst(b.pos.x, 1.4, b.pos.z, ['#7fcd6b', '#ffd166', '#8fd3ff'], 16); },
    snapshot: function () { renderer.render(scene, camera); try { return canvas.toDataURL('image/jpeg', 0.92); } catch (e) { return ''; } }
  };
}

window.GQWorld = { create: create };
})();
