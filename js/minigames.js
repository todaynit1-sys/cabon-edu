/*! 초록별 퀴즈 마을 — 마을 놀이 (미니게임 4종)
 *
 *  퀴즈와 따로, 몸으로 익히는 짧은 놀이입니다. 모두 30초, 실패 없이 별 1~3개를 받습니다.
 *   · 반짝 에너지 집  — 에너지 도깨비 잡기 : 켜진 전등·TV·충전기를 재빨리 꺼요 (대기전력)
 *   · 뚝딱 재활용 공장 — 분리배출 착착     : 물건을 알맞은 칸에 넣어요 (종이·종이팩·플라스틱·캔·유리)
 *   · 쑥쑥 숲         — 뭉게 구름 잡기     : 탄소 구름을 눌러 나무가 먹게 해요 (광합성)
 *   · 씽씽 등굣길      — 초록 등굣길        : 자전거로 나뭇잎을 모으고 매연을 피해요 (걷기·자전거)
 *
 *  GQGames.start(zone, el, { sfx, speak, best, onEnd({score, stars}), onQuit() })
 */
(function () {
'use strict';

var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var rand = function (a, b) { return a + Math.random() * (b - a); };
var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
function josa(word, a, b) { var c = String(word).charCodeAt(String(word).length - 1); if (c < 0xac00 || c > 0xd7a3) return b; return (c - 0xac00) % 28 ? a : b; }

var META = {
  home: { title: '에너지 도깨비 잡기', icon: '💡', dur: 30, stars: [10, 18],
    how: '집 안 곳곳에 에너지 도깨비가 불을 켜고 다녀요! 반짝 켜진 물건을 재빨리 눌러서 꺼 주세요.',
    fact: '전원을 꺼도 플러그가 꽂혀 있으면 전기가 조금씩 새어 나가요(대기전력). 안 쓰는 플러그는 뽑아요!' },
  recycle: { title: '분리배출 착착', icon: '♻️', dur: 30, stars: [8, 14],
    how: '컨베이어에 실려 온 물건을 알맞은 칸에 쏙! 우유팩은 일반 종이와 따로 모으는 거 잊지 마세요.',
    fact: '분리배출 4가지 약속: 비우고, 헹구고, 다른 재질은 분리하고, 섞지 않기!' },
  forest: { title: '뭉게 구름 잡기', icon: '🌳', dur: 30, stars: [9, 16],
    how: '공장에서 회색 탄소 구름이 올라와요! 하늘로 날아가기 전에 눌러서 나무에게 보내 주세요.',
    fact: '나무는 광합성을 하며 이산화탄소를 빨아들이고, 줄기와 뿌리에 탄소를 저장해요. 숲은 탄소 창고!' },
  road: { title: '초록 등굣길', icon: '🚲', dur: 30, stars: [8, 15],
    how: '자전거를 타고 학교에 가요! 나뭇잎을 모으고, 매연 구름과 자동차는 피하세요. 화면 왼쪽·오른쪽을 누르거나 방향키로 움직여요.',
    fact: '가까운 곳은 걷거나 자전거를 타면 온실가스가 나오지 않고 몸도 튼튼해져요.' }
};

function start(zone, el, ctx) {
  var M = META[zone]; if (!M) return function () {};
  ctx = ctx || {};
  var sfx = ctx.sfx || {}, raf = 0, stopped = false, ended = false;
  var play = function (n) { try { sfx[n] && sfx[n](); } catch (e) {} };

  function intro() {
    el.innerHTML = '<div class="mg-intro"><div class="mg-icon">' + M.icon + '</div><h2>' + esc(M.title) + '</h2><p>' + esc(M.how) + '</p>' +
      (ctx.best ? '<p class="mg-best">내 최고 기록: <b>' + ctx.best + '</b></p>' : '') +
      '<div class="btns"><button class="primary big" data-mg="go" data-autofocus>시작! ▶</button><button class="ghost" data-mg="quit">나중에</button></div></div>';
    ctx.speak && ctx.speak(M.title + '! ' + M.how);
    var b = el.querySelector('[data-mg="go"]'); if (b) b.focus();
  }
  function countdown(done) {
    var n = 3;
    el.innerHTML = '<div class="mg-count"><b id="mgCount">3</b><p>준비~</p></div>';
    play('click');
    var t = setInterval(function () {
      if (stopped) { clearInterval(t); return; }
      n--;
      var c = el.querySelector('#mgCount');
      if (n > 0) { if (c) c.textContent = n; play('click'); }
      else { clearInterval(t); play('pop'); done(); }
    }, 650);
  }
  function frame(area, title) {
    el.innerHTML = '<div class="mg-top"><b>' + esc(M.icon + ' ' + M.title) + '</b><span class="mg-score">⭐ <i id="mgScore">0</i></span><span class="mg-time"><i id="mgTime"></i></span><button class="mini" data-mg="quit" aria-label="그만하기">✕</button></div>' +
      '<div class="mg-area mg-' + zone + '" id="mgArea">' + area + '</div><p class="mg-msg" id="mgMsg">' + esc(title || '') + '</p>';
    return el.querySelector('#mgArea');
  }
  var score = 0, elapsed = 0;
  function setScore(v) { score = Math.max(0, v); var s = el.querySelector('#mgScore'); if (s) { s.textContent = score; s.parentNode.classList.remove('bump'); void s.parentNode.offsetWidth; s.parentNode.classList.add('bump'); } }
  function msg(t, cls) { var m = el.querySelector('#mgMsg'); if (m) { m.textContent = t; m.className = 'mg-msg ' + (cls || ''); } }
  function loop(step) {
    var last = performance.now();
    function f(now) {
      if (stopped || ended) return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now; elapsed += dt;
      var tb = el.querySelector('#mgTime'); if (tb) tb.style.width = Math.max(0, 100 - elapsed / M.dur * 100) + '%';
      step(dt);
      if (elapsed >= M.dur) { finish(); return; }
      raf = requestAnimationFrame(f);
    }
    raf = requestAnimationFrame(f);
  }
  function finish() {
    if (ended) return; ended = true; cancelAnimationFrame(raf);
    var stars = score >= M.stars[1] ? 3 : score >= M.stars[0] ? 2 : 1;
    var isBest = !ctx.best || score > ctx.best;
    play('fanfare');
    el.innerHTML = '<div class="mg-end"><div class="mg-icon">' + M.icon + '</div><h2>참 잘했어요!</h2>' +
      '<div class="stars big">' + [0, 1, 2].map(function (i) { return '<i class="' + (i < stars ? '' : 'dim') + '">★</i>'; }).join('') + '</div>' +
      '<p class="mg-final">점수 <b>' + score + '</b>' + (isBest && score > 0 ? ' <span class="newbest">최고 기록!</span>' : '') + '</p>' +
      '<div class="mg-fact"><b>💡 알고 있니?</b><p>' + esc(M.fact) + '</p></div>' +
      '<div class="btns"><button class="primary big" data-mg="again" data-autofocus>한 번 더! 🔁</button><button class="ghost" data-mg="quit">마을로 돌아가기</button></div></div>';
    ctx.speak && ctx.speak('참 잘했어요! 별 ' + stars + '개! ' + M.fact);
    ctx.onEnd && ctx.onEnd({ score: score, stars: stars });
    if (isBest) ctx.best = score;
  }
  function begin() {
    score = 0; elapsed = 0; ended = false;
    countdown(function () { GAMES[zone]({ frame: frame, setScore: setScore, getScore: function () { return score; }, msg: msg, loop: loop, play: play, elapsed: function () { return elapsed; } }); });
  }
  el.onclick = function (e) {
    var b = e.target.closest('[data-mg]'); if (!b) return;
    var a = b.dataset.mg;
    if (a === 'go' || a === 'again') begin();
    if (a === 'quit') { stop(); ctx.onQuit && ctx.onQuit(); }
  };
  function onKey(e) { if (GAMES[zone].key) GAMES[zone].key(e); }
  addEventListener('keydown', onKey);
  function stop() { stopped = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey); GAMES[zone].key = null; }
  intro();
  return stop;
}

var GAMES = {};

/* 1) 에너지 도깨비 잡기 */
GAMES.home = function (g) {
  var ITEMS = [['💡', '전등'], ['📺', 'TV'], ['🔌', '충전기'], ['🖥️', '컴퓨터'], ['❄️', '에어컨'], ['🧊', '냉장고 문'], ['🎮', '게임기'], ['🌀', '선풍기'], ['🔊', '스피커']];
  var area = g.frame('<div class="grid9">' + ITEMS.map(function (it, i) { return '<button class="cell" data-i="' + i + '"><span class="emo">' + it[0] + '</span><small>' + it[1] + '</small><i class="imp">👾</i></button>'; }).join('') + '</div>', '반짝 켜진 걸 눌러서 꺼 주세요!');
  var cells = [].slice.call(area.querySelectorAll('.cell'));
  var on = cells.map(function () { return 0; }), spawn = 0.4, wasted = 0;
  area.onpointerdown = function (e) {
    var c = e.target.closest('.cell'); if (!c) return;
    var i = +c.dataset.i;
    if (on[i] > 0) { on[i] = 0; c.classList.remove('on'); c.classList.add('off'); setTimeout(function () { c.classList.remove('off'); }, 250); g.play('pop'); g.setScore(g.getScore() + 1); g.msg(pick(['딸깍! 불 끄기 대장!', '전기 아끼기 성공!', '에너지 도깨비 도망간다!', '잘했어!']), 'good'); }
  };
  g.loop(function (dt) {
    var t = g.elapsed();
    spawn -= dt;
    var live = on.filter(function (v) { return v > 0; }).length;
    if (spawn <= 0 && live < (t < 10 ? 2 : t < 20 ? 3 : 4)) {
      var free = on.map(function (v, i) { return v > 0 ? -1 : i; }).filter(function (i) { return i >= 0; });
      var i = pick(free); on[i] = Math.max(1.1, 2.3 - t * 0.035); cells[i].classList.add('on');
      spawn = Math.max(0.42, 1.0 - t * 0.02);
    }
    on.forEach(function (v, i) {
      if (v <= 0) return; on[i] = v - dt;
      if (on[i] <= 0) { on[i] = 0; cells[i].classList.remove('on'); wasted++; g.msg('앗, 전기가 새어 나갔어요 ⚡ ' + wasted, 'warn'); }
    });
  });
};

/* 2) 분리배출 착착 */
GAMES.recycle = function (g) {
  var BINS = [['paper', '📦', '종이'], ['pack', '🥛', '종이팩'], ['plastic', '🧴', '플라스틱'], ['can', '🥫', '캔'], ['glass', '🍾', '유리']];
  var BIN_NAME = {}; BINS.forEach(function (b) { BIN_NAME[b[0]] = b[2]; });
  var ITEMS = [
    ['📰', '신문지', 'paper'], ['📦', '종이 상자', 'paper'], ['📒', '다 쓴 공책', 'paper'],
    ['🥛', '우유팩', 'pack', '우유팩은 일반 종이와 따로! 종이팩 칸이에요. 화장지로 다시 태어나요.'], ['🧃', '주스 팩', 'pack', '주스 팩도 종이팩이에요. 일반 종이와 따로 모아요.'],
    ['🧴', '샴푸 통', 'plastic'], ['🥤', '페트병', 'plastic', '페트병은 플라스틱! 투명 페트병은 라벨을 떼고 따로 모으면 더 좋아요.'], ['🧸', '플라스틱 장난감 통', 'plastic'],
    ['🥫', '참치 캔', 'can', '캔은 내용물을 비우고 헹궈서 캔 칸에!'], ['🥫', '통조림 캔', 'can'],
    ['🍾', '유리병', 'glass'], ['🫙', '잼 병', 'glass', '유리병은 뚜껑을 따로 빼고 유리 칸에!']
  ];
  var area = g.frame('<div class="belt"><div class="item" id="rcItem"></div></div><div class="bins">' + BINS.map(function (b) { return '<button class="bin bin-' + b[0] + '" data-b="' + b[0] + '"><span>' + b[1] + '</span><small>' + b[2] + '</small></button>'; }).join('') + '</div>', '알맞은 칸을 눌러요!');
  var itemEl = area.querySelector('#rcItem'), cur = null, lastName = '', lock = false, combo = 0;
  function next() {
    var c; do { c = pick(ITEMS); } while (c[1] === lastName); cur = c; lastName = c[1];
    itemEl.className = 'item in'; itemEl.innerHTML = '<span>' + c[0] + '</span><b>' + esc(c[1]) + '</b>';
    lock = false;
  }
  area.onpointerdown = function (e) {
    var b = e.target.closest('.bin'); if (!b || lock || !cur) return;
    if (b.dataset.b === cur[2]) {
      lock = true; combo++; g.play('pop'); g.setScore(g.getScore() + 1);
      g.msg(combo >= 3 ? '착착착! ' + combo + '연속 🔥' : pick(['딩동댕! 착!', '정확해요!', '분리배출 박사!']), 'good');
      itemEl.className = 'item fly fly-' + b.dataset.b; b.classList.add('gulp'); setTimeout(function () { b.classList.remove('gulp'); }, 300);
      setTimeout(next, 260);
    } else {
      combo = 0; g.play('wrong'); b.classList.add('shake'); setTimeout(function () { b.classList.remove('shake'); }, 400);
      g.msg(cur[3] || (cur[1] + josa(cur[1], '은', '는') + ' ' + BIN_NAME[cur[2]] + ' 칸이에요!'), 'warn');
    }
  };
  next();
  g.loop(function () {});
};

/* 3) 뭉게 구름 잡기 */
GAMES.forest = function (g) {
  var area = g.frame('<div class="sky-top">☀️</div><div class="factory">🏭</div><div class="trees"><span class="tr">🌳</span><span class="tr">🌲</span><span class="tr">🌳</span></div>', '구름이 하늘로 가기 전에 눌러요!');
  var trees = [].slice.call(area.querySelectorAll('.tr')), grow = [1, 1, 1];
  var clouds = [], spawn = 0.3, escaped = 0, W = area.clientWidth, H = area.clientHeight;
  function addCloud() {
    var d = document.createElement('button'); d.className = 'cloud'; d.innerHTML = '<span>☁️</span><i>• •</i>';
    var c = { el: d, x: rand(0.12, 0.88), y: 1.02, sp: rand(0.11, 0.16) + g.elapsed() * 0.004, ph: rand(0, 6) };
    d.onpointerdown = function (e) { e.stopPropagation(); catchCloud(c); };
    area.appendChild(d); clouds.push(c);
  }
  function catchCloud(c) {
    if (c.dead) return; c.dead = true; g.play('pop'); g.setScore(g.getScore() + 1);
    var ti = Math.min(2, Math.max(0, Math.floor(c.x * 3)));
    grow[ti] = Math.min(2.1, grow[ti] + 0.07); trees[ti].style.transform = 'scale(' + grow[ti].toFixed(2) + ')';
    c.el.classList.add('caught'); c.el.innerHTML = '<span>🍃</span>';
    c.el.style.left = (ti * 33.3 + 16) + '%'; c.el.style.top = '82%';
    setTimeout(function () { c.el.remove(); }, 450);
    g.msg(pick(['나무가 냠냠! 🌳', '탄소 구름을 나무에게 쏙!', '숲이 쑥쑥 자라요!']), 'good');
  }
  g.loop(function (dt) {
    W = area.clientWidth || W; H = area.clientHeight || H;
    spawn -= dt;
    if (spawn <= 0) { addCloud(); spawn = Math.max(0.38, 0.95 - g.elapsed() * 0.02); }
    clouds.forEach(function (c) {
      if (c.dead) return;
      c.y -= c.sp * dt; c.ph += dt * 2;
      c.el.style.left = (c.x * 100 + Math.sin(c.ph) * 3) + '%'; c.el.style.top = (c.y * 100) + '%';
      if (c.y < 0.04) { c.dead = true; c.el.classList.add('gone'); setTimeout(function () { c.el.remove(); }, 400); escaped++; g.msg('구름 하나가 하늘로 갔어요 ☁️ ' + escaped, 'warn'); }
    });
    clouds = clouds.filter(function (c) { return !c.dead || c.el.isConnected; });
  });
};

/* 4) 초록 등굣길 */
GAMES.road = function (g) {
  var area = g.frame('<div class="lanes"><i></i><i></i></div><div class="school">🏫</div><div class="rider" id="rider">🚲</div>' +
    '<div class="pad"><button class="padbtn" data-dir="-1" aria-label="왼쪽">◀</button><button class="padbtn" data-dir="1" aria-label="오른쪽">▶</button></div>', '나뭇잎은 모으고, 매연은 피해요!');
  var rider = area.querySelector('#rider'), lane = 1, objs = [], spawn = 0.4, hitT = 0;
  function setLane(l) { lane = Math.max(0, Math.min(2, l)); rider.style.left = (lane * 33.33 + 16.67) + '%'; }
  setLane(1);
  area.onpointerdown = function (e) {
    var b = e.target.closest('.padbtn');
    if (b) { setLane(lane + (+b.dataset.dir)); g.play('click'); return; }
    var r = area.getBoundingClientRect(); setLane(lane + (e.clientX - r.left < r.width / 2 ? -1 : 1)); g.play('click');
  };
  GAMES.road.key = function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); setLane(lane - 1); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); setLane(lane + 1); }
  };
  var GOOD = ['🍃', '🍃', '🌿', '🌸'], BAD = ['💨', '🚗'];
  g.loop(function (dt) {
    spawn -= dt; hitT = Math.max(0, hitT - dt);
    rider.classList.toggle('hit', hitT > 0);
    if (spawn <= 0) {
      var bad = Math.random() < Math.min(0.42, 0.22 + g.elapsed() * 0.008);
      var d = document.createElement('div'); d.className = 'obj ' + (bad ? 'bad' : 'good'); d.textContent = pick(bad ? BAD : GOOD);
      var o = { el: d, lane: Math.floor(Math.random() * 3), y: -0.08, bad: bad, sp: 0.42 + g.elapsed() * 0.012 };
      d.style.left = (o.lane * 33.33 + 16.67) + '%'; area.appendChild(d); objs.push(o);
      spawn = Math.max(0.36, 0.8 - g.elapsed() * 0.012);
    }
    objs.forEach(function (o) {
      if (o.done) return;
      o.y += o.sp * dt; o.el.style.top = (o.y * 100) + '%';
      if (o.y > 0.74 && o.y < 0.9 && o.lane === lane) {
        o.done = true;
        if (o.bad) { hitT = 0.6; g.play('wrong'); g.setScore(g.getScore() - 1); g.msg(o.el.textContent === '🚗' ? '빵빵! 자동차는 조심해요' : '콜록! 매연 구름이에요', 'warn'); o.el.classList.add('hitfx'); }
        else { g.play('pop'); g.setScore(g.getScore() + 1); g.msg(pick(['나뭇잎 쏙! 🍃', '씽씽 초록 등굣길!', '상쾌해요!']), 'good'); o.el.classList.add('got'); }
        setTimeout(function () { o.el.remove(); }, 300);
      } else if (o.y > 1.05) { o.done = true; o.el.remove(); }
    });
    objs = objs.filter(function (o) { return !o.done; });
  });
};

window.GQGames = { META: META, start: start };
})();
