/*! 마을 놀이 (미니게임 4종) — 체험 템플릿마다 하나씩, 팩의 이름·물건으로 꾸며집니다
 *   switch → 도깨비 잡기 (켜진 것을 재빨리 끄기)      sort  → 착착 분류 (알맞은 칸에 넣기)
 *   plant  → 걱정 구름 잡기 (구름을 눌러 나무에게)     ride  → 씽씽 달리기 (좋은 것 모으고 나쁜 것 피하기)
 *  모두 30초, 실패 없이 별 1~3개. GQGames.start(zone, el, { sfx, speak, best, hub, onEnd({score, stars}), onQuit() })
 */
(function () {
'use strict';
var T = window.GQText, esc = T.esc, josa = T.josa;
var rand = function (a, b) { return a + Math.random() * (b - a); }, pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };

var DEF = {
  switch: { title: '도깨비 잡기', icon: '💡', dur: 30, stars: [10, 18], how: '도깨비가 물건을 몽땅 켜 놓고 다녀요! 반짝 켜진 것을 재빨리 눌러서 꺼 주세요.', emojis: ['💡', '📺', '🔌', '🖥️', '❄️', '🧊', '🎮', '🌀', '🔊'] },
  sort: { title: '착착 분류', icon: '♻️', dur: 30, stars: [8, 14], how: '컨베이어에 실려 온 물건을 알맞은 칸에 쏙! 헷갈리면 친구가 알려 줘요.' },
  plant: { title: '걱정 구름 잡기', icon: '🌳', dur: 30, stars: [9, 16], how: '회색 걱정 구름이 올라와요! 하늘로 날아가기 전에 눌러서 나무에게 보내 주세요.' },
  ride: { title: '씽씽 달리기', icon: '🚲', dur: 30, stars: [8, 15], how: '좋은 것은 모으고, 나쁜 것은 피하세요. 화면 왼쪽·오른쪽을 누르거나 방향키로 움직여요.', goods: ['🍃', '🍃', '🌿', '🌸'], bads: ['💨', '🚗'], badMsg: { '🚗': '빵빵! 조심해요', '💨': '콜록! 나쁜 연기예요' } }
};
function meta(zone) {
  var d = DEF[zone.template] || DEF.switch, g = zone.game || {}, M = zone.mission;
  var m = Object.assign({}, d, g);
  if (!g.title) m.title = M.title + ' 놀이';
  if (!g.fact) { var s = M.spots.find(function (x) { return x.say; }); m.fact = s ? s.say : zone.greet; }
  if (!g.how) m.how = d.how;
  return m;
}

function start(zone, el, ctx) {
  var M = meta(zone); ctx = ctx || {};
  var sfx = ctx.sfx || {}, raf = 0, stopped = false, ended = false, score = 0, elapsed = 0;
  var play = function (n) { try { sfx[n] && sfx[n](); } catch (e) {} };
  function intro() {
    el.innerHTML = '<div class="mg-intro"><div class="mg-icon">' + M.icon + '</div><h2>' + esc(M.title) + '</h2><p>' + esc(M.how) + '</p>' + (ctx.best ? '<p class="mg-best">내 최고 기록: <b>' + ctx.best + '</b></p>' : '') +
      '<div class="btns"><button class="primary big" data-mg="go" data-autofocus>시작! ▶</button><button class="ghost" data-mg="quit">나중에</button></div></div>';
    ctx.speak && ctx.speak(M.title + '! ' + M.how); var b = el.querySelector('[data-mg="go"]'); if (b) b.focus();
  }
  function countdown(done) {
    var n = 3; el.innerHTML = '<div class="mg-count"><b id="mgCount">3</b><p>준비~</p></div>'; play('click');
    var t = setInterval(function () { if (stopped) { clearInterval(t); return; } n--; var c = el.querySelector('#mgCount'); if (n > 0) { if (c) c.textContent = n; play('click'); } else { clearInterval(t); play('pop'); done(); } }, 650);
  }
  function frame(area, title) {
    el.innerHTML = '<div class="mg-top"><b>' + esc(M.icon + ' ' + M.title) + '</b><span class="mg-score">⭐ <i id="mgScore">0</i></span><span class="mg-time"><i id="mgTime"></i></span><button class="mini" data-mg="quit" aria-label="그만하기">✕</button></div>' +
      '<div class="mg-area mg-' + zone.template + '" id="mgArea">' + area + '</div><p class="mg-msg" id="mgMsg">' + esc(title || '') + '</p>';
    return el.querySelector('#mgArea');
  }
  function setScore(v) { score = Math.max(0, v); var s = el.querySelector('#mgScore'); if (s) { s.textContent = score; s.parentNode.classList.remove('bump'); void s.parentNode.offsetWidth; s.parentNode.classList.add('bump'); } }
  function msg(t, cls) { var m = el.querySelector('#mgMsg'); if (m) { m.textContent = t; m.className = 'mg-msg ' + (cls || ''); } }
  function loop(step) { var last = performance.now(); function f(now) { if (stopped || ended) return; var dt = Math.min(0.05, (now - last) / 1000); last = now; elapsed += dt; var tb = el.querySelector('#mgTime'); if (tb) tb.style.width = Math.max(0, 100 - elapsed / M.dur * 100) + '%'; step(dt); if (elapsed >= M.dur) { finish(); return; } raf = requestAnimationFrame(f); } raf = requestAnimationFrame(f); }
  function finish() {
    if (ended) return; ended = true; cancelAnimationFrame(raf);
    var stars = score >= M.stars[1] ? 3 : score >= M.stars[0] ? 2 : 1, isBest = !ctx.best || score > ctx.best; play('fanfare');
    el.innerHTML = '<div class="mg-end"><div class="mg-icon">' + M.icon + '</div><h2>참 잘했어요!</h2><div class="stars big">' + [0, 1, 2].map(function (i) { return '<i class="' + (i < stars ? '' : 'dim') + '">★</i>'; }).join('') + '</div>' +
      '<p class="mg-final">점수 <b>' + score + '</b>' + (isBest && score > 0 ? ' <span class="newbest">최고 기록!</span>' : '') + '</p><div class="mg-fact"><b>💡 알고 있니?</b><p>' + esc(M.fact) + '</p></div>' +
      '<div class="btns"><button class="primary big" data-mg="again" data-autofocus>한 번 더! 🔁</button><button class="ghost" data-mg="quit">마을로 돌아가기</button></div></div>';
    ctx.speak && ctx.speak('참 잘했어요! 별 ' + stars + '개! ' + M.fact); ctx.onEnd && ctx.onEnd({ score: score, stars: stars }); if (isBest) ctx.best = score;
  }
  var G = { frame: frame, setScore: setScore, getScore: function () { return score; }, msg: msg, loop: loop, play: play, elapsed: function () { return elapsed; }, M: M, zone: zone, hub: ctx.hub || {} };
  function begin() { score = 0; elapsed = 0; ended = false; countdown(function () { GAMES[zone.template](G); }); }
  el.onclick = function (e) { var b = e.target.closest('[data-mg]'); if (!b) return; if (b.dataset.mg === 'go' || b.dataset.mg === 'again') begin(); if (b.dataset.mg === 'quit') { stop(); ctx.onQuit && ctx.onQuit(); } };
  function onKey(e) { if (G.key) G.key(e); }
  addEventListener('keydown', onKey);
  function stop() { stopped = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey); G.key = null; }
  intro(); return stop;
}

var GAMES = {};
GAMES.switch = function (g) {
  var M = g.M, items = (M.items || []).slice();
  if (!items.length) { var spots = g.zone.mission.spots; for (var i = 0; i < 9; i++) { var sp = spots[i % spots.length]; items.push([M.emojis[i % M.emojis.length], sp ? sp.label : '']); } }
  items = items.slice(0, 9); while (items.length < 9) items.push([M.emojis[items.length], '']);
  var area = g.frame('<div class="grid9">' + items.map(function (it, i) { return '<button class="cell" data-i="' + i + '"><span class="emo">' + it[0] + '</span><small>' + esc(it[1]) + '</small><i class="imp">👾</i></button>'; }).join('') + '</div>', '반짝 켜진 걸 눌러서 꺼 주세요!');
  var cells = [].slice.call(area.querySelectorAll('.cell')), on = cells.map(function () { return 0; }), spawn = 0.4, wasted = 0;
  area.onpointerdown = function (e) { var c = e.target.closest('.cell'); if (!c) return; var i = +c.dataset.i; if (on[i] > 0) { on[i] = 0; c.classList.remove('on'); c.classList.add('off'); setTimeout(function () { c.classList.remove('off'); }, 250); g.play('pop'); g.setScore(g.getScore() + 1); g.msg(pick(['딸깍! 잘했어!', '성공!', '도깨비 도망간다!', '멋져!']), 'good'); } };
  g.loop(function (dt) {
    var t = g.elapsed(); spawn -= dt; var live = on.filter(function (v) { return v > 0; }).length;
    if (spawn <= 0 && live < (t < 10 ? 2 : t < 20 ? 3 : 4)) { var free = on.map(function (v, i) { return v > 0 ? -1 : i; }).filter(function (i) { return i >= 0; }); var i = pick(free); on[i] = Math.max(1.1, 2.3 - t * 0.035); cells[i].classList.add('on'); spawn = Math.max(0.42, 1.0 - t * 0.02); }
    on.forEach(function (v, i) { if (v <= 0) return; on[i] = v - dt; if (on[i] <= 0) { on[i] = 0; cells[i].classList.remove('on'); wasted++; g.msg('앗, 놓쳤어요 ⚡ ' + wasted, 'warn'); } });
  });
};
GAMES.sort = function (g) {
  var Mi = g.zone.mission, BINS = Mi.bins, BN = {}; BINS.forEach(function (b) { BN[b.id] = b.name; });
  var ITEMS = (g.M.items && g.M.items.length ? g.M.items : Mi.spots.map(function (s) { return ['📦', s.label, s.bin, s.say]; })).filter(function (it) { return BN[it[2]]; });
  if (!ITEMS.length) ITEMS = [['📦', '물건', BINS[0].id]];
  var area = g.frame('<div class="belt"><div class="item" id="rcItem"></div></div><div class="bins">' + BINS.map(function (b, i) { return '<button class="bin bin-' + (i % 6) + '" data-b="' + esc(b.id) + '"><span>' + b.icon + '</span><small>' + esc(b.name) + '</small></button>'; }).join('') + '</div>', '알맞은 칸을 눌러요!');
  area.querySelector('.bins').style.gridTemplateColumns = 'repeat(' + BINS.length + ', 1fr)';
  var itemEl = area.querySelector('#rcItem'), cur = null, lastName = '', lock = false, combo = 0;
  function next() { var c; var tries = 0; do { c = pick(ITEMS); tries++; } while (c[1] === lastName && ITEMS.length > 1 && tries < 10); cur = c; lastName = c[1]; itemEl.className = 'item in'; itemEl.innerHTML = '<span>' + c[0] + '</span><b>' + esc(c[1]) + '</b>'; lock = false; }
  area.onpointerdown = function (e) {
    var b = e.target.closest('.bin'); if (!b || lock || !cur) return;
    if (b.dataset.b === cur[2]) { lock = true; combo++; g.play('pop'); g.setScore(g.getScore() + 1); g.msg(combo >= 3 ? '착착착! ' + combo + '연속 🔥' : pick(['딩동댕! 착!', '정확해요!', '분류 박사!']), 'good'); itemEl.className = 'item fly'; b.classList.add('gulp'); setTimeout(function () { b.classList.remove('gulp'); }, 300); setTimeout(next, 260); }
    else { combo = 0; g.play('wrong'); b.classList.add('shake'); setTimeout(function () { b.classList.remove('shake'); }, 400); g.msg(cur[3] ? T.clip(cur[3], 60) : (cur[1] + josa(cur[1], '은', '는') + ' ' + BN[cur[2]] + ' 칸이에요!'), 'warn'); }
  };
  next(); g.loop(function () {});
};
GAMES.plant = function (g) {
  var cloudName = g.hub.cloud || '걱정 구름';
  var area = g.frame('<div class="sky-top">☀️</div><div class="factory">🏭</div><div class="trees"><span class="tr">🌳</span><span class="tr">🌲</span><span class="tr">🌳</span></div>', cloudName + '이 하늘로 가기 전에 눌러요!');
  var trees = [].slice.call(area.querySelectorAll('.tr')), grow = [1, 1, 1], clouds = [], spawn = 0.3, escaped = 0;
  function addCloud() { var d = document.createElement('button'); d.className = 'cloud'; d.innerHTML = '<span>☁️</span><i>• •</i>'; var c = { el: d, x: rand(0.12, 0.88), y: 1.02, sp: rand(0.11, 0.16) + g.elapsed() * 0.004, ph: rand(0, 6) }; d.onpointerdown = function (e) { e.stopPropagation(); catchCloud(c); }; area.appendChild(d); clouds.push(c); }
  function catchCloud(c) { if (c.dead) return; c.dead = true; g.play('pop'); g.setScore(g.getScore() + 1); var ti = Math.min(2, Math.max(0, Math.floor(c.x * 3))); grow[ti] = Math.min(2.1, grow[ti] + 0.07); trees[ti].style.transform = 'scale(' + grow[ti].toFixed(2) + ')'; c.el.classList.add('caught'); c.el.innerHTML = '<span>🍃</span>'; c.el.style.left = (ti * 33.3 + 16) + '%'; c.el.style.top = '82%'; setTimeout(function () { c.el.remove(); }, 450); g.msg(pick(['나무가 냠냠! 🌳', cloudName + '을 나무에게 쏙!', '숲이 쑥쑥 자라요!']), 'good'); }
  g.loop(function (dt) {
    spawn -= dt; if (spawn <= 0) { addCloud(); spawn = Math.max(0.38, 0.95 - g.elapsed() * 0.02); }
    clouds.forEach(function (c) { if (c.dead) return; c.y -= c.sp * dt; c.ph += dt * 2; c.el.style.left = (c.x * 100 + Math.sin(c.ph) * 3) + '%'; c.el.style.top = (c.y * 100) + '%'; if (c.y < 0.04) { c.dead = true; c.el.classList.add('gone'); setTimeout(function () { c.el.remove(); }, 400); escaped++; g.msg('구름 하나가 하늘로 갔어요 ☁️ ' + escaped, 'warn'); } });
    clouds = clouds.filter(function (c) { return !c.dead || c.el.isConnected; });
  });
};
GAMES.ride = function (g) {
  var M = g.M, V = g.zone.mission.vehicle || '자전거', vEmoji = /버스/.test(V) ? '🚌' : /배|보트/.test(V) ? '🚤' : /차/.test(V) ? '🚗' : '🚲';
  var area = g.frame('<div class="lanes"><i></i><i></i></div><div class="school">🏁</div><div class="rider" id="rider">' + vEmoji + '</div><div class="pad"><button class="padbtn" data-dir="-1" aria-label="왼쪽">◀</button><button class="padbtn" data-dir="1" aria-label="오른쪽">▶</button></div>', '좋은 것은 모으고, 나쁜 것은 피해요!');
  var rider = area.querySelector('#rider'), lane = 1, objs = [], spawn = 0.4, hitT = 0;
  function setLane(l) { lane = Math.max(0, Math.min(2, l)); rider.style.left = (lane * 33.33 + 16.67) + '%'; } setLane(1);
  area.onpointerdown = function (e) { var b = e.target.closest('.padbtn'); if (b) { setLane(lane + (+b.dataset.dir)); g.play('click'); return; } var r = area.getBoundingClientRect(); setLane(lane + (e.clientX - r.left < r.width / 2 ? -1 : 1)); g.play('click'); };
  g.key = function (e) { if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); setLane(lane - 1); } if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); setLane(lane + 1); } };
  g.loop(function (dt) {
    spawn -= dt; hitT = Math.max(0, hitT - dt); rider.classList.toggle('hit', hitT > 0);
    if (spawn <= 0) { var bad = Math.random() < Math.min(0.42, 0.22 + g.elapsed() * 0.008); var d = document.createElement('div'); d.className = 'obj ' + (bad ? 'bad' : 'good'); d.textContent = pick(bad ? M.bads : M.goods); var o = { el: d, lane: Math.floor(Math.random() * 3), y: -0.08, bad: bad, sp: 0.42 + g.elapsed() * 0.012 }; d.style.left = (o.lane * 33.33 + 16.67) + '%'; area.appendChild(d); objs.push(o); spawn = Math.max(0.36, 0.8 - g.elapsed() * 0.012); }
    objs.forEach(function (o) {
      if (o.done) return; o.y += o.sp * dt; o.el.style.top = (o.y * 100) + '%';
      if (o.y > 0.74 && o.y < 0.9 && o.lane === lane) { o.done = true; if (o.bad) { hitT = 0.6; g.play('wrong'); g.setScore(g.getScore() - 1); g.msg((M.badMsg || {})[o.el.textContent] || '앗, 피해야 해요!', 'warn'); o.el.classList.add('hitfx'); } else { g.play('pop'); g.setScore(g.getScore() + 1); g.msg(pick(['쏙! 모았어요', '씽씽!', '상쾌해요!']), 'good'); o.el.classList.add('got'); } setTimeout(function () { o.el.remove(); }, 300); }
      else if (o.y > 1.05) { o.done = true; o.el.remove(); }
    });
    objs = objs.filter(function (o) { return !o.done; });
  });
};

window.GQGames = { DEF: DEF, meta: meta, start: start };
})();
