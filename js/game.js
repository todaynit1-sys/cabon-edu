/*! 초록별 퀴즈 마을 — 게임 진행 · 화면
 *
 * 흐름: 시작 화면(학년·캐릭터) → 3D 마을 → 친구에게 말 걸기 → 퀴즈 5문제(AI 맞춤 출제 또는 기본 문제)
 *       → 맞히면 뭉게가 나비로, 틀리면 얼음이가 다시 설명 + 비슷한 문제 → 마을 깨끗해짐
 *       → 네 마을 모두 끝나면 무지개 + 오늘의 지구 숙제 + 수료증
 *       → 다음에 들어오면 "어제 숙제 해 봤어?" 확인 (게임 밖 실천으로 잇기)
 */
(function () {
'use strict';

var $ = function (s, r) { return (r || document).querySelector(s); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var ZONES = window.GQ_ZONES, GRADES = window.GQ_GRADES, AI = window.GQAI;
var ZMAP = {}; ZONES.forEach(function (z) { ZMAP[z.id] = z; });
var ANIMAL_EMOJI = { rabbit: '🐰', raccoon: '🦝', squirrel: '🐿️', puppy: '🐶' };

/* ------------------------------------------------------------
   저장
   ------------------------------------------------------------ */
var SAVE_KEY = 'gq.state.v1';
function freshState() {
  var z = {}; ZONES.forEach(function (x) { z[x.id] = { partial: 0, cleared: false, stars: 0, plays: 0 }; });
  return { grade: 1, avatar: 0, zones: z, seen: {}, homework: null, sprouts: 0, finale: false, name: '' };
}
var state = freshState();
try { var saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (saved && saved.zones) state = Object.assign(freshState(), saved); } catch (e) {}
function save() {
  var keys = Object.keys(state.seen); if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(function (k) { delete state.seen[k]; });
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
}
function pref(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
function setPref(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

/* ------------------------------------------------------------
   소리 · 읽어 주기
   ------------------------------------------------------------ */
var SFX = (function () {
  var ctx = null, master = null, muted = pref('gq.mute', '0') === '1';
  function init() { if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; } var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination); }
  function tone(f, o) {
    if (!ctx || muted) return; o = o || {};
    var t = ctx.currentTime + (o.delay || 0), osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t); osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2 || f), t + (o.dur || 0.12));
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.12));
    osc.connect(g).connect(master); osc.start(t); osc.stop(t + (o.dur || 0.12) + 0.05);
  }
  return {
    init: init,
    click: function () { tone(700, { dur: 0.06, vol: 0.07, type: 'triangle' }); },
    pop: function () { tone(480, { f2: 1300, dur: 0.14, vol: 0.12 }); },
    correct: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, { dur: 0.2, delay: i * 0.08, type: 'triangle', vol: 0.13 }); }); },
    wrong: function () { tone(392, { f2: 320, dur: 0.22, vol: 0.1 }); tone(330, { f2: 262, dur: 0.3, delay: 0.14, vol: 0.1 }); },
    fanfare: function () { [523, 659, 784, 659, 784, 1047].forEach(function (f, i) { tone(f, { dur: 0.26, delay: i * 0.13, type: 'triangle', vol: 0.13 }); }); },
    muted: function () { return muted; },
    setMuted: function (m) { muted = m; setPref('gq.mute', m ? '1' : '0'); if (master) master.gain.value = m ? 0 : 0.5; }
  };
})();

var TTS = {
  on: pref('gq.tts', '1') === '1', voice: null,
  pick: function () {
    if (!('speechSynthesis' in window)) return;
    var vs = speechSynthesis.getVoices();
    this.voice = vs.find(function (v) { return /ko/i.test(v.lang) && /Google|SunHi|Heami|Yuna|InJoon/i.test(v.name); }) || vs.find(function (v) { return /ko/i.test(v.lang); }) || null;
  },
  speak: function (text, who) {
    if (!this.on || !('speechSynthesis' in window) || SFX.muted()) return;
    var t = String(text || '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\[[A-Z]\d+\]/g, '').replace(/○○/g, '동그라미').trim();
    if (!t) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(t); u.lang = 'ko-KR'; if (this.voice) u.voice = this.voice;
    u.rate = state.grade === 0 ? 0.92 : 1.0; u.pitch = who === 'bear' ? 1.35 : who === 'friend' ? 1.22 : 1.1;
    speechSynthesis.speak(u);
  },
  stop: function () { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
};
if ('speechSynthesis' in window) { TTS.pick(); speechSynthesis.onvoiceschanged = function () { TTS.pick(); }; }

/* ------------------------------------------------------------
   모달 · 토스트
   ------------------------------------------------------------ */
var world = null;
var modal = $('#modal'), mcard = $('#mcard');
var modalClose = null;
function openModal(html, o) {
  o = o || {};
  mcard.className = 'mcard ' + (o.cls || '');
  mcard.innerHTML = html;
  modal.hidden = false;
  modalClose = o.onClose || null;
  if (world) world.pause(true);
  $('#btnTalk').hidden = true;
  requestAnimationFrame(function () { var b = mcard.querySelector('[data-autofocus]') || mcard.querySelector('button.primary, button'); if (b) b.focus({ preventScroll: true }); });
}
function closeModal() {
  modal.hidden = true; mcard.innerHTML = ''; TTS.stop();
  if (world) { world.pause(false); world.focus(null); }
  var f = modalClose; modalClose = null; if (f) f();
  refreshTalk();
}
modal.addEventListener('click', function (e) { if (e.target === modal && !mcard.classList.contains('locked')) closeModal(); });
addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden && !mcard.classList.contains('locked')) closeModal(); });
var toastT = 0;
function toast(msg, ms) { var t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, ms || 2800); }

/* ------------------------------------------------------------
   지구 열 · 도장
   ------------------------------------------------------------ */
function cleanLevel() {
  var s = 0; ZONES.forEach(function (z) { var st = state.zones[z.id]; s += st.cleared ? 1 : Math.min(5, st.partial) / 5 * 0.8; }); return s / ZONES.length;
}
function feverInfo(k) {
  if (k >= 0.999) return { face: '🥰', text: '건강해졌어요!', cls: 'cool' };
  if (k >= 0.62) return { face: '🙂', text: '시원해지고 있어요', cls: 'mild' };
  if (k >= 0.3) return { face: '😓', text: '아직 뜨거워요', cls: 'warm' };
  return { face: '🥵', text: '아주 뜨거워요', cls: 'hot' };
}
function updateHUD(instant) {
  var k = cleanLevel(), f = feverInfo(k);
  $('#feverFace').textContent = f.face; $('#feverText').textContent = f.text;
  $('#feverBar').style.width = Math.round((1 - k) * 100) + '%';
  $('#hud .fever').className = 'fever card ' + f.cls;
  $('#stamps').innerHTML = ZONES.map(function (z) {
    var st = state.zones[z.id];
    return '<button class="stamp-slot ' + (st.cleared ? 'done' : '') + '" data-walk="' + z.id + '" style="--zc:' + z.color + '" title="' + esc(z.name) + '"><span>' + z.icon + '</span><small>' + esc(z.short) + '</small>' + (st.cleared ? '<i>✓</i>' : '') + '</button>';
  }).join('') + (state.sprouts ? '<span class="sprouts" title="실천 새싹">🌱<b>' + state.sprouts + '</b></span>' : '');
  if (world) world.setClean(k, instant);
}
$('#stamps').addEventListener('click', function (e) {
  var b = e.target.closest('[data-walk]'); if (!b || !world) return;
  SFX.click(); world.walkTo(b.dataset.walk); toast(ZMAP[b.dataset.walk].friend + '에게 걸어가요!');
});

/* ------------------------------------------------------------
   말 걸기 버튼
   ------------------------------------------------------------ */
var nearT = null;
function refreshTalk() {
  var b = $('#btnTalk');
  if (!nearT || !modal.hidden || !$('#start').hidden) { b.hidden = true; return; }
  b.hidden = false;
  $('#talkLabel').textContent = nearT.name + '와 이야기하기';
}
$('#btnTalk').addEventListener('click', function () { SFX.click(); if (nearT) onTalk(nearT); });
function onTalk(t) {
  SFX.init(); SFX.click();
  if (t.type === 'friend') openFriend(t.zone);
  else if (t.type === 'earth') openEarth();
  else if (t.type === 'mascot') openChat();
}

/* ------------------------------------------------------------
   친구 → 퀴즈
   ------------------------------------------------------------ */
var Q = null;
function friendHead(z) { return '<div class="who" style="--zc:' + z.color + '"><span class="ava">' + ANIMAL_EMOJI[z.animal] + '</span><div><b>' + esc(z.friend) + '</b><small>' + esc(z.name) + '</small></div></div>'; }
function aiBadge() {
  var c = AI.loadCfg();
  return AI.ready() ? '<span class="ai-on">✨ AI 맞춤 출제 켜짐 · ' + esc(c.model || c.provider) + '</span>' : '<span class="ai-off">📗 기본 문제로 풀어요 (AI 연결 안 됨)</span>';
}
function openFriend(zone) {
  var z = ZMAP[zone], st = state.zones[zone];
  if (world) world.focus(zone);
  var again = st.cleared;
  var line = again ? '또 왔구나! 이번엔 새로운 문제로 도전해 볼래? 지난번엔 별 ' + st.stars + '개를 받았어!' : z.greet;
  openModal(friendHead(z) +
    '<p class="say">' + esc(line) + '</p>' +
    '<div class="meta">' + aiBadge() + '</div>' +
    '<div class="btns"><button class="primary big" data-act="start" data-autofocus>' + (again ? '다시 도전!' : '퀴즈 시작!') + ' ▶</button><button class="ghost" data-act="close">나중에 할래</button></div>', { cls: 'friend' });
  TTS.speak(line, 'friend');
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'close') closeModal();
    if (a.dataset.act === 'start') { SFX.click(); prepareQuiz(zone); }
  };
}
function prepareQuiz(zone) {
  var z = ZMAP[zone], g = GRADES[state.grade];
  var ctrl = new AbortController(), done = false, t0 = Date.now();
  var go = function (res) { if (done) return; done = true; clearInterval(tick); startQuiz(zone, res); };
  if (!AI.ready()) { go({ items: AI.pickBank(zone, state.grade, 5, state.seen), source: 'bank', report: { reason: 'AI 미연결' } }); return; }
  mcard.classList.add('locked');
  mcard.innerHTML = friendHead(z) +
    '<div class="making"><div class="bounce">' + ANIMAL_EMOJI[z.animal] + '</div>' +
    '<p><b>' + esc(z.friend) + '</b>가 <b>' + esc(g.label) + '</b>에 꼭 맞는 문제를 만들고 있어요</p>' +
    '<ol class="pipeline"><li class="on">✨ AI가 근거 카드로 문제 만들기</li><li>🔎 근거 문장 대조하기</li><li>🧐 AI 교차 검토</li></ol>' +
    '<p class="sec"><span id="sec">0</span>초</p></div>' +
    '<div class="btns"><button class="ghost" data-act="skip">기다리기 싫어요! 기본 문제로 바로 풀기</button></div>';
  var tick = setInterval(function () {
    var s = Math.floor((Date.now() - t0) / 1000), el = $('#sec'); if (el) el.textContent = s;
    var li = mcard.querySelectorAll('.pipeline li'); if (li.length) { li[1].classList.toggle('on', s >= 4); li[2].classList.toggle('on', s >= 8); }
  }, 500);
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'skip') { ctrl.abort(); go({ items: AI.pickBank(zone, state.grade, 5, state.seen), source: 'bank', report: { reason: '아이가 기본 문제 선택' } }); }
  };
  AI.makeQuiz(zone, state.grade, 5, state.seen, ctrl.signal).then(go);
}
function startQuiz(zone, res) {
  mcard.classList.add('locked');
  Q = { zone: zone, items: res.items, i: 0, correct: 0, source: res.source, report: res.report, cur: null, retried: false };
  state.zones[zone].plays++;
  if (res.source !== 'bank') toast(res.source === 'ai' ? '✨ AI가 만든 새 문제 5개! 모두 근거 확인을 통과했어요' : '✨ AI 문제 ' + res.report.passed + '개 + 기본 문제로 준비했어요');
  renderQ(Q.items[0]);
}
function dots() {
  return '<div class="dots">' + Q.items.map(function (_, i) { return '<i class="' + (i < Q.i ? 'done' : i === Q.i ? 'now' : '') + '"></i>'; }).join('') + '</div>';
}
function srcBadge(it) {
  if (it.source === 'ai') return '<button class="src ai" data-act="ev">✨ AI가 만든 문제 · 근거 확인 ✓</button>';
  return '<button class="src bank" data-act="ev">📗 기본 문제 · 근거 보기</button>';
}
function evBox(it) {
  var c = AI.card(it.ev); if (!c) return '';
  return '<div class="evbox" hidden><b>📄 어디서 나온 말이야? — ' + esc(c.title) + '</b><p>' + esc(c.text) + '</p>' +
    (it.quote ? '<p class="quote">AI가 짚은 근거 문장: “' + esc(it.quote) + '”</p>' : '') +
    '<small>' + esc((it.check && it.check.by) || '') + ' · 근거 카드 ' + esc(c.id) + '</small></div>';
}
function renderQ(it) {
  Q.cur = it; var z = ZMAP[Q.zone];
  var opts = it.type === 'ox'
    ? '<div class="ox"><button class="opt o" data-a="O"><span>O</span>맞아요</button><button class="opt x" data-a="X"><span>X</span>아니에요</button></div>'
    : '<div class="choices">' + it.options.map(function (o, i) { return '<button class="opt c" data-a="' + i + '"><span>' + (i + 1) + '</span>' + esc(o) + '</button>'; }).join('') + '</div>';
  mcard.innerHTML = '<div class="qtop">' + friendHead(z) + dots() + '<button class="mini" data-act="quit" aria-label="그만하기">✕</button></div>' +
    (it.retry ? '<div class="retry-tag">🔁 비슷한 문제 한 번 더!</div>' : '') +
    '<div class="qbox"><p class="q">' + esc(it.q) + '</p><button class="mini speak" data-act="read" aria-label="문제 다시 듣기">🔊</button></div>' +
    opts + '<div class="qfoot">' + srcBadge(it) + '</div>' + evBox(it) + '<div class="fb" hidden></div>';
  readQ(it);
  mcard.onclick = onQuizClick;
}
function readQ(it) { TTS.speak(it.q + (it.type === 'choice' ? ' ' + it.options.map(function (o, i) { return (i + 1) + '번, ' + o; }).join('. ') : ' 맞으면 오, 아니면 엑스!'), 'friend'); }
function onQuizClick(e) {
  var a = e.target.closest('[data-act],[data-a]'); if (!a) return;
  if (a.dataset.a != null && !a.disabled) { answer(a.dataset.a); return; }
  var act = a.dataset.act;
  if (act === 'read') readQ(Q.cur);
  if (act === 'ev') { var b = mcard.querySelector('.evbox'); if (b) b.hidden = !b.hidden; }
  if (act === 'quit') { if (confirm('퀴즈를 그만할까요? 지금까지 맞힌 건 남아 있어요.')) { Q = null; closeModal(); } }
  if (act === 'next') next();
  if (act === 'retry') retry();
}
function markSeen(it) { if (it.id) state.seen[it.id] = 1; state.seen['q:' + it.q] = 1; }
function answer(raw) {
  var it = Q.cur, z = ZMAP[Q.zone];
  var chosen = it.type === 'ox' ? raw : parseInt(raw, 10);
  var ok = chosen === it.answer;
  mcard.querySelectorAll('.opt').forEach(function (b) {
    b.disabled = true;
    var v = it.type === 'ox' ? b.dataset.a : parseInt(b.dataset.a, 10);
    if (v === it.answer) b.classList.add('right');
    else if (v === chosen) b.classList.add('wrong');
  });
  markSeen(it);
  var fb = mcard.querySelector('.fb'); fb.hidden = false;
  if (ok) {
    SFX.correct(); Q.correct++;
    var st = state.zones[Q.zone]; if (!st.cleared) st.partial = Math.min(5, st.partial + 1);
    save(); if (world) { world.popSmog(Q.zone); world.cheer(); } updateHUD();
    fb.className = 'fb good';
    fb.innerHTML = '<b class="big">딩동댕! 🎉</b><p>' + esc(it.explain) + '</p><p class="smogmsg">뭉게 하나가 나비가 되어 날아갔어요 🦋</p>' +
      '<div class="btns"><button class="primary big" data-act="next" data-autofocus>' + (isLast() ? '결과 보기 ⭐' : '다음 문제 ▶') + '</button></div>';
    TTS.speak('딩동댕! ' + it.explain, 'friend');
    fb.querySelector('button').focus();
  } else {
    SFX.wrong();
    fb.className = 'fb oops';
    fb.innerHTML = '<b class="big">앗, 아쉬워! 괜찮아 😊</b><div class="bear-say"><span class="ava">🐻‍❄️</span><p class="thinking">얼음이가 다시 알려 줄게… <i class="dots3"><b></b><b></b><b></b></i></p></div>';
    AI.reExplain(it, chosen, state.grade).then(function (r) {
      if (!Q || Q.cur !== it) return;
      var canRetry = !it.retry;
      fb.innerHTML = '<b class="big">앗, 아쉬워! 괜찮아 😊</b>' +
        '<div class="bear-say"><span class="ava">🐻‍❄️</span><div><p>' + esc(r.text) + '</p>' + (r.mode === 'ai' ? '<small class="aimark">✨ AI 얼음이가 네 답에 맞춰 설명했어요</small>' : '') + '</div></div>' +
        '<div class="btns">' + (canRetry ? '<button class="primary big" data-act="retry" data-autofocus>비슷한 문제 한 번 더! 🔁</button>' : '') +
        '<button class="' + (canRetry ? 'ghost' : 'primary big') + '" data-act="next">' + (isLast() ? '결과 보기 ⭐' : '다음 문제 ▶') + '</button></div>';
      TTS.speak(r.text, 'bear');
      var b = fb.querySelector('button'); if (b) b.focus();
    });
  }
}
function isLast() { return Q.i >= Q.items.length - 1; }
function retry() {
  var it = Q.cur;
  var fb = mcard.querySelector('.fb');
  fb.innerHTML = '<div class="bear-say"><span class="ava">🐻‍❄️</span><p class="thinking">얼음이가 비슷한 문제를 찾고 있어… <i class="dots3"><b></b><b></b><b></b></i></p></div>';
  AI.similar(it, state.grade, state.seen).then(function (alt) {
    if (!Q || Q.cur !== it) return;
    if (!alt) { next(); return; }
    renderQ(alt);
  });
}
function next() {
  Q.i++;
  if (Q.i >= Q.items.length) { finishStation(); return; }
  renderQ(Q.items[Q.i]);
}
function finishStation() {
  var zone = Q.zone, z = ZMAP[zone], st = state.zones[zone];
  var stars = Math.max(1, Math.min(5, Q.correct));
  var first = !st.cleared;
  st.stars = Math.max(st.stars, stars); st.cleared = true; st.partial = 5;
  var rep = Q.report || {}, src = Q.source;
  save(); Q = null;
  SFX.fanfare();
  mcard.classList.remove('locked');
  var aiLine = src === 'bank' ? '' : '<p class="airep">✨ 이번 문제는 AI가 ' + esc(GRADES[state.grade].label) + ' 눈높이로 만들었어요. 근거 카드와 대조해서 통과한 문제만 냈어요' +
    (rep.dropped && rep.dropped.length ? ' (확인에서 걸러진 문제 ' + rep.dropped.length + '개)' : '') + '.</p>';
  openModal('<div class="clear-top" style="--zc:' + z.color + '"><div class="big-stamp">' + z.icon + '<i>✓</i></div><h2>' + esc(z.name) + ' 깨끗!</h2>' +
    '<div class="stars">' + '★★★★★'.slice(0, stars).split('').map(function () { return '<i>★</i>'; }).join('') + '<span class="dim">' + '★★★★★'.slice(stars) + '</span></div></div>' +
    '<p class="say">' + esc(z.cleared) + '</p>' + aiLine +
    '<div class="btns"><button class="primary big" data-act="close" data-autofocus>마을 구경하기 👀</button></div>', {
    cls: 'clear',
    onClose: function () {
      if (world) world.clearZone(zone);
      updateHUD();
      if (first && ZONES.every(function (x) { return state.zones[x.id].cleared; }) && !state.finale) setTimeout(openFinale, 2600);
      else if (first) toast('다음 마을 친구에게 가 볼까요? 위쪽 도장을 누르면 데려다줘요!', 3600);
    }
  });
  TTS.speak(z.name + ' 깨끗! ' + z.cleared, 'friend');
  mcard.onclick = function (e) { if (e.target.closest('[data-act="close"]')) closeModal(); };
}

/* ------------------------------------------------------------
   동글이 (광장 지구)
   ------------------------------------------------------------ */
function openEarth() {
  if (world) world.focus('earth');
  var left = ZONES.filter(function (z) { return !state.zones[z.id].cleared; });
  var allDone = !left.length;
  var line = allDone ? '고마워! 네 덕분에 열이 다 내렸어. 이제 하나도 안 뜨거워! 오늘 배운 걸 집에서도 해 볼래?'
    : left.length === ZONES.length ? '헥헥… 동글이는 온실가스 담요 때문에 너무 더워. 마을 친구들 퀴즈를 풀어서 열을 내려 줄래?'
    : '조금 시원해졌어! 남은 마을은 ' + left.length + '곳이야. 조금만 더 힘내 줘!';
  openModal('<div class="who" style="--zc:#58b4ea"><span class="ava">🌏</span><div><b>아기 지구 동글이</b><small>초록별 마을 광장</small></div></div>' +
    '<p class="say">' + esc(line) + '</p>' +
    (allDone ? '<div class="btns"><button class="primary big" data-act="hw" data-autofocus>오늘의 지구 숙제 받기 📮</button><button class="ghost" data-act="cert">수료증 만들기 🏅</button></div>'
      : '<div class="zone-list">' + ZONES.map(function (z) { var st = state.zones[z.id]; return '<button class="zl ' + (st.cleared ? 'done' : '') + '" data-walk="' + z.id + '" style="--zc:' + z.color + '"><span>' + z.icon + '</span><b>' + esc(z.name) + '</b><small>' + (st.cleared ? '깨끗해요 ✓' : esc(z.friend) + '에게 데려다줘') + '</small></button>'; }).join('') + '</div>') +
    '<div class="btns"><button class="ghost" data-act="ask">🐻‍❄️ 얼음이에게 묻기</button><button class="ghost" data-act="close">닫기</button></div>', { cls: 'earth' });
  TTS.speak(line);
  mcard.onclick = function (e) {
    var w = e.target.closest('[data-walk]'); if (w) { var zid = w.dataset.walk; closeModal(); if (world) world.walkTo(zid); return; }
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'close') closeModal();
    if (a.dataset.act === 'ask') openChat();
    if (a.dataset.act === 'hw') openHomework();
    if (a.dataset.act === 'cert') openCert();
  };
}

/* ------------------------------------------------------------
   얼음이 대화
   ------------------------------------------------------------ */
var chat = [];   // {role:'user'|'assistant', content, mode, cites, masked}
var chatBusy = false, lastAsk = 0;
function chatHTML() {
  var turns = chat.length ? chat.map(function (t) {
    if (t.role === 'user') return '<div class="msg me"><p>' + esc(t.content) + '</p>' + (t.masked && t.masked.length ? '<small class="mask">🔒 비밀 지킴: ' + esc(t.masked.join('·')) + ' → ○○로 가려서 보냈어요</small>' : '') + '</div>';
    var cites = (t.cites || []).map(function (id) { var c = AI.card(id); return c ? '<button class="cite" data-card="' + id + '">📄 ' + esc(c.title) + '</button>' : ''; }).join('');
    var tag = t.mode === 'ai' ? '<small class="aimark">✨ AI 얼음이 · 근거 카드로만 대답</small>' : t.mode === 'search' ? '<small class="aimark off">📗 카드에서 찾은 내용 (AI 연결 전)</small>' : '';
    return '<div class="msg bear"><span class="ava">🐻‍❄️</span><div><p>' + esc(t.content) + '</p>' + (cites ? '<div class="cites">' + cites + '</div>' : '') + tag + '</div></div>';
  }).join('') : '<div class="msg bear"><span class="ava">🐻‍❄️</span><div><p>안녕! 나는 아기 북극곰 얼음이야. 지구랑 환경에 대해 궁금한 걸 물어봐!</p></div></div>';
  return '<div class="who" style="--zc:#4aa3df"><span class="ava">🐻‍❄️</span><div><b>얼음이에게 묻기</b><small>지구 이야기 카드 ' + window.GQ_CARDS.length + '장에서 찾아서 대답해요</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<div class="chat" id="chatLog">' + turns + (chatBusy ? '<div class="msg bear"><span class="ava">🐻‍❄️</span><p class="thinking">음… 생각 중 <i class="dots3"><b></b><b></b><b></b></i></p></div>' : '') + '</div>' +
    '<div class="cardview" id="cardview" hidden></div>' +
    '<div class="chips">' + AI.SUGGEST.map(function (s) { return '<button class="chip" data-q="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div>' +
    '<form class="ask" id="askForm"><input id="askIn" maxlength="120" autocomplete="off" placeholder="궁금한 걸 적어 봐! (이름·학교·주소는 비밀)" aria-label="얼음이에게 물어볼 말"><button class="primary" ' + (chatBusy ? 'disabled' : '') + '>보내기</button></form>' +
    '<p class="fine">🔒 얼음이는 대화를 저장하지 않아요. 이름·전화번호·주소·학교를 적으면 보내기 전에 ○○로 가려요.</p>';
}
function openChat() {
  if (!modal.hidden && mcard.classList.contains('chatwin')) return;
  openModal(chatHTML(), { cls: 'chatwin' });
  bindChat();
  if (!chat.length) TTS.speak('안녕! 나는 아기 북극곰 얼음이야. 지구랑 환경에 대해 궁금한 걸 물어봐!', 'bear');
}
function renderChat() { var keep = $('#askIn') ? $('#askIn').value : ''; mcard.innerHTML = chatHTML(); bindChat(); var i = $('#askIn'); if (i) { i.value = keep; } var log = $('#chatLog'); if (log) log.scrollTop = log.scrollHeight; }
function bindChat() {
  var log = $('#chatLog'); if (log) log.scrollTop = log.scrollHeight;
  $('#askForm').onsubmit = function (e) { e.preventDefault(); var v = $('#askIn').value.trim(); if (v) { $('#askIn').value = ''; sendAsk(v); } };
  mcard.onclick = function (e) {
    var c = e.target.closest('[data-q]'); if (c) { sendAsk(c.dataset.q); return; }
    var cd = e.target.closest('[data-card]'); if (cd) { var card = AI.card(cd.dataset.card), v = $('#cardview'); v.innerHTML = '<b>📄 ' + esc(card.title) + '</b><p>' + esc(card.text) + '</p><small>근거 카드 ' + card.id + '</small>'; v.hidden = false; return; }
    if (e.target.closest('[data-act="close"]')) closeModal();
  };
  setTimeout(function () { var i = $('#askIn'); if (i && !('ontouchstart' in window)) i.focus(); }, 50);
}
function sendAsk(text) {
  if (chatBusy) return;
  if (Date.now() - lastAsk < 1500) { toast('천천히 물어봐 줘! 얼음이가 생각하고 있어'); return; }
  lastAsk = Date.now(); SFX.click();
  var hist = chat.filter(function (t) { return t.mode !== 'guard'; }).map(function (t) { return { role: t.role, content: t.role === 'user' ? (t.sent || t.content) : t.content }; });
  var turn = { role: 'user', content: text };
  chat.push(turn); chatBusy = true; renderChat();
  AI.ask(text, state.grade, hist).then(function (r) {
    turn.masked = r.masked; turn.sent = r.sent;
    if (r.masked && r.masked.length) turn.content = window.GQSafety.maskPII(text).text;
    chat.push({ role: 'assistant', content: r.text, mode: r.mode, cites: r.cites });
    if (chat.length > 30) chat = chat.slice(-30);
    chatBusy = false;
    if (!modal.hidden && mcard.classList.contains('chatwin')) renderChat();
    TTS.speak(r.text, 'bear');
  });
}

/* ------------------------------------------------------------
   마지막: 무지개 · 오늘의 지구 숙제 · 수료증
   ------------------------------------------------------------ */
function openFinale() {
  state.finale = true; save();
  if (world) world.celebrate();
  SFX.fanfare();
  var total = ZONES.reduce(function (s, z) { return s + state.zones[z.id].stars; }, 0);
  openModal('<div class="finale"><div class="rain">🌈</div><h2>지구 열이 다 내려갔어요!</h2><p class="say">동글이가 다시 건강해졌어요. 북극 얼음도 다시 커지고 있대요! 얼음이 가족이 정말 고마워해요.</p>' +
    '<div class="stars total">⭐ 모은 별 <b>' + total + '</b>개</div></div>' +
    '<div class="btns"><button class="primary big" data-act="hw" data-autofocus>오늘의 지구 숙제 받기 📮</button><button class="ghost" data-act="cert">수료증 만들기 🏅</button><button class="ghost" data-act="close">마을 구경하기</button></div>', { cls: 'finale-card' });
  TTS.speak('지구 열이 다 내려갔어요! 동글이가 다시 건강해졌어요.');
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'hw') openHomework();
    if (a.dataset.act === 'cert') openCert();
    if (a.dataset.act === 'close') closeModal();
  };
}
function openHomework() {
  var pick = { home: '', liked: '' };
  var form = function () {
    return '<div class="who" style="--zc:#7fcd6b"><span class="ava">📮</span><div><b>오늘의 지구 숙제</b><small>집에서 해 볼 실천 1가지를 정해 줄게요</small></div></div>' +
      '<h3 class="qh">어디에 살아요?</h3><div class="pick" data-k="home">' + ['아파트', '주택', '그 밖에'].map(function (v) { return '<button class="pk ' + (pick.home === v ? 'on' : '') + '" data-v="' + v + '">' + v + '</button>'; }).join('') + '</div>' +
      '<h3 class="qh">오늘 가장 재미있었던 마을은?</h3><div class="pick" data-k="liked">' + ZONES.map(function (z) { return '<button class="pk ' + (pick.liked === z.id ? 'on' : '') + '" data-v="' + z.id + '">' + z.icon + ' ' + esc(z.short) + '</button>'; }).join('') + '</div>' +
      '<div class="btns"><button class="primary big" data-act="make" ' + (pick.home && pick.liked ? '' : 'disabled') + '>숙제 받기 ✨</button><button class="ghost" data-act="close">닫기</button></div>';
  };
  openModal(form(), { cls: 'hw' });
  mcard.onclick = function (e) {
    var b = e.target.closest('.pk'); if (b) { pick[b.parentNode.dataset.k] = b.dataset.v; SFX.click(); mcard.innerHTML = form(); return; }
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'close') closeModal();
    if (a.dataset.act === 'make' && !a.disabled) {
      mcard.innerHTML = '<div class="making"><div class="bounce">🐻‍❄️</div><p>얼음이가 너에게 꼭 맞는 숙제를 고르고 있어요…</p></div>';
      AI.homework({ home: pick.home, liked: pick.liked, grade: state.grade }).then(function (h) {
        state.homework = { text: h.text, why: h.why, ev: h.ev, date: today(), done: false }; save();
        var c = AI.card(h.ev);
        mcard.innerHTML = '<div class="hwcard"><small>오늘의 지구 숙제</small><p class="hwt">' + esc(h.text) + '</p><p class="why">왜냐하면? ' + esc(h.why) + '</p>' +
          (c ? '<small class="src-line">📄 근거 카드: ' + esc(c.title) + (h.mode === 'ai' ? ' · ✨ AI가 너의 상황에 맞춰 골랐어요' : '') + '</small>' : '') + '</div>' +
          '<p class="fine">다 해 보고 다음에 놀러 오면 얼음이가 "해 봤어?" 하고 물어볼게. 해 봤으면 실천 새싹 🌱을 줄게!</p>' +
          '<div class="btns"><button class="primary big" data-act="cert">수료증 만들기 🏅</button><button class="ghost" data-act="print">숙제 카드 인쇄</button><button class="ghost" data-act="close">닫기</button></div>';
        TTS.speak('오늘의 지구 숙제! ' + h.text + '. 왜냐하면, ' + h.why, 'bear');
      });
    }
    if (a.dataset.act === 'cert') openCert();
    if (a.dataset.act === 'print') printHW();
  };
}
function printHW() {
  var h = state.homework; if (!h) return;
  $('#printArea').innerHTML = '<div class="print-hw"><h1>🌏 오늘의 지구 숙제</h1><p class="t">' + esc(h.text) + '</p><p>왜냐하면? ' + esc(h.why) + '</p><div class="check">□ 해 봤어요!　　날짜: ________</div><small>초록별 퀴즈 마을</small></div>';
  window.print();
}
function openCert() {
  openModal('<div class="who" style="--zc:#f2b93b"><span class="ava">🏅</span><div><b>지구 지킴이 수료증</b><small>이름은 이 기기에서만 쓰고 어디에도 보내지 않아요</small></div></div>' +
    '<label class="lbl">수료증에 적을 이름 (빈칸도 괜찮아요)<input id="certName" maxlength="12" value="' + esc(state.name || '') + '" placeholder="예: 초록별 탐험대원"></label>' +
    '<div class="btns"><button class="primary big" data-act="print" data-autofocus>수료증 인쇄하기 🖨️</button><button class="ghost" data-act="close">닫기</button></div>', { cls: 'cert' });
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'close') closeModal();
    if (a.dataset.act === 'print') {
      var n = $('#certName').value.trim().slice(0, 12); state.name = n; save();
      var total = ZONES.reduce(function (s, z) { return s + state.zones[z.id].stars; }, 0);
      var d = new Date();
      $('#printArea').innerHTML = '<div class="print-cert"><div class="pc-in"><div class="pc-badge">🌏</div><h1>지구 지킴이 수료증</h1><p class="pc-name">' + esc(n || '초록별 탐험대원') + '</p>' +
        '<p class="pc-body">위 어린이는 초록별 퀴즈 마을에서 에너지·재활용·숲·등굣길 퀴즈를 모두 풀어<br>아기 지구 동글이의 열을 내려 주었기에 이 수료증을 드립니다.</p>' +
        '<p class="pc-stars">모은 별 ⭐ ' + total + '개' + (state.sprouts ? ' · 실천 새싹 🌱 ' + state.sprouts + '개' : '') + '</p>' +
        '<p class="pc-date">' + d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일</p><p class="pc-from">초록별 퀴즈 마을 · 아기 북극곰 얼음이</p></div></div>';
      window.print();
    }
  };
}

/* 어제 숙제 확인 */
function checkHomework() {
  var h = state.homework;
  if (!h || h.done || h.date === today()) return false;
  openModal('<div class="who" style="--zc:#7fcd6b"><span class="ava">🐻‍❄️</span><div><b>얼음이</b><small>지난번 지구 숙제</small></div></div>' +
    '<p class="say">또 왔구나! 지난번 숙제 기억나? <b>“' + esc(h.text) + '”</b> 해 봤어?</p>' +
    '<div class="btns"><button class="primary big" data-act="yes" data-autofocus>해 봤어! 🌱</button><button class="ghost" data-act="no">아직이야</button></div>', { cls: 'hwcheck' });
  TTS.speak('또 왔구나! 지난번 숙제, ' + h.text + ', 해 봤어?', 'bear');
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'yes') { h.done = true; state.sprouts++; save(); updateHUD(); SFX.fanfare(); if (world) world.cheer(); mcard.innerHTML = '<div class="finale"><div class="rain">🌱</div><h2>실천 새싹 +1</h2><p class="say">정말 멋져! 게임 밖에서도 지구를 지켰구나. 실천 새싹이 ' + state.sprouts + '개가 됐어!</p></div><div class="btns"><button class="primary big" data-act="close" data-autofocus>고마워!</button></div>'; TTS.speak('정말 멋져! 게임 밖에서도 지구를 지켰구나.', 'bear'); return; }
    if (a.dataset.act === 'no') { h.date = today(); save(); mcard.innerHTML = '<p class="say">괜찮아! 오늘 꼭 한 번 해 보자. 얼음이가 응원할게! 💙</p><div class="btns"><button class="primary big" data-act="close" data-autofocus>알겠어!</button></div>'; TTS.speak('괜찮아! 오늘 꼭 한 번 해 보자.', 'bear'); return; }
    if (a.dataset.act === 'close') closeModal();
  };
  return true;
}

/* ------------------------------------------------------------
   설정 · AI 연결 · AI 기록
   ------------------------------------------------------------ */
function openMenu() {
  var c = AI.loadCfg();
  var presets = window.GreenLLM.PRESETS;
  openModal('<div class="who" style="--zc:#7d93a6"><span class="ava">⚙️</span><div><b>설정</b><small>보호자·선생님용</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<div class="set-sec"><h3>학년</h3><div class="pick" data-k="grade">' + GRADES.map(function (g) { return '<button class="pk ' + (state.grade === g.id ? 'on' : '') + '" data-v="' + g.id + '">' + g.label + '</button>'; }).join('') + '</div></div>' +
    '<div class="set-sec"><h3>소리</h3><label class="tg"><input type="checkbox" id="optTTS" ' + (TTS.on ? 'checked' : '') + '> 문제와 대답을 소리 내어 읽어 주기</label><label class="tg"><input type="checkbox" id="optMute" ' + (SFX.muted() ? 'checked' : '') + '> 모든 소리 끄기</label></div>' +
    '<div class="set-sec"><h3>AI 모델 연결 <small>(모델 비종속 · 주소와 모델명만 바꾸면 교체)</small></h3>' +
    '<label class="tg"><input type="checkbox" id="aiOn" ' + (c.enabled ? 'checked' : '') + '> AI 기능 쓰기 (끄면 기본 문제은행으로만 진행)</label>' +
    '<label class="lbl">빠른 설정<select id="aiPreset"><option value="">직접 입력</option>' + presets.map(function (p) { return '<option value="' + p.id + '">' + esc(p.label) + '</option>'; }).join('') + '</select></label>' +
    '<p class="fine" id="presetNote"></p>' +
    '<label class="lbl">연결 방식<select id="aiProv">' + ['openai', 'anthropic', 'claude-artifact'].map(function (p) { return '<option ' + (c.provider === p ? 'selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label>' +
    '<label class="lbl">주소 (Base URL)<input id="aiUrl" value="' + esc(c.baseUrl) + '" placeholder="http://localhost:11434/v1"></label>' +
    '<label class="lbl">모델 이름<input id="aiModel" value="' + esc(c.model) + '" placeholder="gemma3:12b"></label>' +
    '<label class="lbl">API 키 (필요할 때만)<input id="aiKey" type="password" value="' + esc(c.apiKey || '') + '" placeholder="로컬 모델은 비워 두세요"></label>' +
    '<label class="tg"><input type="checkbox" id="aiKeep" ' + (c.keepKey ? 'checked' : '') + '> 이 기기에 키 저장 (공용 PC에서는 끄세요)</label>' +
    '<label class="tg"><input type="checkbox" id="aiCross" ' + (c.crossCheck ? 'checked' : '') + '> AI가 만든 문제를 AI로 한 번 더 교차 검토 (조금 느려져요)</label>' +
    '<div class="btns left"><button class="ghost" data-act="test">연결 테스트</button><button class="primary" data-act="saveai">저장하고 사용</button></div><p class="fine" id="testOut"></p></div>' +
    '<div class="set-sec"><h3>AI 활동 기록</h3><p class="fine">AI가 문제를 몇 개 만들었고, 근거 대조와 교차 검토에서 몇 개를 걸렀는지 볼 수 있어요.</p><div class="btns left"><button class="ghost" data-act="log">AI 기록 보기</button></div></div>' +
    '<div class="set-sec"><h3>보호자·선생님 안내</h3><ul class="fine list"><li>로그인이 없고, 이름·학교 같은 개인정보를 받지 않아요. 진행 기록은 이 기기 브라우저에만 저장돼요.</li><li>AI에게 보내는 내용은 아이 질문(개인정보는 ○○로 가림)과 근거 카드뿐이며, 위에서 설정한 모델 주소로만 보내요. 로컬 모델(Ollama 등)을 쓰면 PC 밖으로 나가지 않아요.</li><li>AI가 만든 문제는 근거 카드와 자동 대조하고, 통과한 것만 아이에게 보여요. 수치·내용은 체험용 예시이며 실제 운영 전 감수가 필요해요.</li></ul>' +
    '<div class="btns left"><button class="ghost danger" data-act="reset">처음부터 다시 하기</button></div></div>', { cls: 'menu' });
  var notePreset = function () { var p = presets.find(function (x) { return x.id === $('#aiPreset').value; }); $('#presetNote').textContent = p ? p.note : ''; };
  $('#aiPreset').onchange = function () { var p = presets.find(function (x) { return x.id === this.value; }, this); if (p) { $('#aiProv').value = p.provider; $('#aiUrl').value = p.baseUrl; $('#aiModel').value = p.model; } notePreset(); };
  var form = function () { return Object.assign(AI.loadCfg(), { enabled: $('#aiOn').checked, provider: $('#aiProv').value, baseUrl: $('#aiUrl').value.trim(), model: $('#aiModel').value.trim(), apiKey: $('#aiKey').value.trim(), keepKey: $('#aiKeep').checked, crossCheck: $('#aiCross').checked }); };
  $('#optTTS').onchange = function () { TTS.on = this.checked; setPref('gq.tts', this.checked ? '1' : '0'); };
  $('#optMute').onchange = function () { SFX.setMuted(this.checked); if (this.checked) TTS.stop(); updateSoundBtn(); };
  mcard.onclick = function (e) {
    var pk = e.target.closest('.pk'); if (pk) { state.grade = +pk.dataset.v; save(); mcard.querySelectorAll('[data-k="grade"] .pk').forEach(function (b) { b.classList.toggle('on', b === pk); }); toast(GRADES[state.grade].label + ' 눈높이로 문제를 낼게요'); return; }
    var a = e.target.closest('[data-act]'); if (!a) return;
    var act = a.dataset.act;
    if (act === 'close') closeModal();
    if (act === 'test') { var out = $('#testOut'); out.textContent = '연결하는 중…'; AI.test(form()).then(function (t) { out.textContent = '✅ 연결 성공: ' + t; }, function (err) { out.textContent = '❌ 연결 실패: ' + err.message; }); }
    if (act === 'saveai') { AI.saveCfg(form()); AI.probe().then(function () { updateAiPill(); toast(AI.ready() ? '✨ AI 연결을 저장했어요' : 'AI 없이 기본 문제로 진행해요' + (AI.status().msg ? ' (' + AI.status().msg + ')' : '')); }); }
    if (act === 'log') openLog();
    if (act === 'reset') { if (confirm('지금까지의 진행(도장·별·숙제)을 모두 지우고 처음부터 할까요?')) { localStorage.removeItem(SAVE_KEY); location.reload(); } }
  };
}
function fmtTime(t) { var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function openLog() {
  var L = AI.LOG();
  var rows = L.length ? L.map(function (r) {
    var d = r.detail || {}, body = '';
    if (r.kind === '출제') {
      body = esc(ZMAP[d.zone] ? ZMAP[d.zone].name : d.zone) + ' · ' + esc(d.grade) + ' — 요청 ' + d.asked + '개 → <b>통과 ' + d.passed + '개</b> · ' + esc(d.cross) + ' · ' + ((d.ms || 0) / 1000).toFixed(1) + '초';
      if (d.dropped && d.dropped.length) body += '<ul>' + d.dropped.map(function (x) { return '<li>걸러짐: “' + esc(String(x.q).slice(0, 40)) + '” — ' + esc(x.reason) + '</li>'; }).join('') + '</ul>';
    } else body = esc(Object.keys(d).map(function (k) { var v = d[k]; return k + ': ' + (typeof v === 'object' ? JSON.stringify(v) : v); }).join(' · ').slice(0, 160));
    return '<li><span class="lt">' + fmtTime(r.t) + '</span><b>' + esc(r.kind) + '</b> <small>' + esc(r.model) + '</small><div>' + body + '</div></li>';
  }).join('') : '<li>아직 기록이 없어요. AI를 연결하고 퀴즈를 풀어 보세요.</li>';
  openModal('<div class="who" style="--zc:#7d93a6"><span class="ava">📋</span><div><b>AI 활동 기록</b><small>최근 ' + L.length + '건 · 이 기기에만 저장</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<ul class="log">' + rows + '</ul><div class="btns left"><button class="ghost" data-act="back">설정으로</button><button class="ghost danger" data-act="clear">기록 지우기</button></div>', { cls: 'menu' });
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'close') closeModal();
    if (a.dataset.act === 'back') openMenu();
    if (a.dataset.act === 'clear') { AI.clearLog(); openLog(); }
  };
}
function updateAiPill() {
  var c = AI.loadCfg(), p = $('#aiPill'), st = AI.status();
  if (!p) return;
  if (st.state === 'checking') p.innerHTML = '🔌 AI 모델 확인 중… (' + esc(c.model || c.provider) + ')';
  else if (AI.ready()) p.innerHTML = '✨ AI 연결: <b>' + esc(c.model || c.provider) + '</b> · 바꾸기';
  else p.innerHTML = '📗 AI 연결 안 됨' + (st.msg ? ' (' + esc(st.msg) + ')' : '') + ' · 기본 문제로 플레이 · <u>연결하기</u>';
  p.classList.toggle('on', AI.ready() && st.state !== 'checking');
}
function reprobe() { AI.probe().then(updateAiPill); updateAiPill(); }
function updateSoundBtn() { $('#btnSound').textContent = SFX.muted() ? '🔇' : '🔊'; }

/* ------------------------------------------------------------
   시작 화면
   ------------------------------------------------------------ */
var AVATARS = [
  { label: '초록 모자', shirt: '#5cb85c', pants: '#3d5a80', hair: '#2a221d', skin: '#f6d2b0', style: 'cap', body: 'm', top: 'tee', bottom: 'shorts', eye: 'sparkle', mouth: 'grin' },
  { label: '노란 후드', shirt: '#f2c14e', pants: '#5b6c8f', hair: '#3b2a20', skin: '#f1c8a4', style: 'pony', body: 'f', top: 'hoodie', bottom: 'skirt', eye: 'round', mouth: 'smile' },
  { label: '하늘 곱슬', shirt: '#6fb7e9', pants: '#47506b', hair: '#5a3a24', skin: '#e9b48e', style: 'curly', body: 'm', top: 'hoodie', bottom: 'pants', eye: 'smile', mouth: 'grin' },
  { label: '분홍 단발', shirt: '#f39aa5', pants: '#7a5c8e', hair: '#1f1a17', skin: '#fbe0c8', style: 'bob', body: 'f', top: 'tee', bottom: 'skirt', eye: 'sparkle', mouth: 'smile' }
];
function renderStart() {
  $('#grades').innerHTML = GRADES.map(function (g) { return '<button class="grade ' + (state.grade === g.id ? 'on' : '') + '" data-g="' + g.id + '"><b>' + g.label + '</b><small>' + g.sub + '</small></button>'; }).join('');
  $('#avatars').innerHTML = AVATARS.map(function (a, i) {
    return '<button class="avatar ' + (state.avatar === i ? 'on' : '') + '" data-av="' + i + '" aria-label="' + a.label + '"><span class="face" style="--hair:' + a.hair + ';--skin:' + a.skin + ';--shirt:' + a.shirt + '"><i></i></span><small>' + a.label + '</small></button>';
  }).join('');
  updateAiPill();
}
$('#grades').addEventListener('click', function (e) { var b = e.target.closest('[data-g]'); if (!b) return; SFX.init(); SFX.click(); state.grade = +b.dataset.g; save(); renderStart(); });
$('#avatars').addEventListener('click', function (e) { var b = e.target.closest('[data-av]'); if (!b) return; SFX.init(); SFX.click(); state.avatar = +b.dataset.av; save(); renderStart(); if (world) world.setAvatar(AVATARS[state.avatar]); });
$('#aiPill').addEventListener('click', function () { openMenu(); });
$('#btnStart').addEventListener('click', function () {
  SFX.init(); SFX.click(); TTS.pick();
  $('#start').hidden = true; $('#hud').hidden = false;
  if (world) world.setAvatar(AVATARS[state.avatar]);
  updateHUD();
  if (!checkHomework()) {
    var anyDone = ZONES.some(function (z) { return state.zones[z.id].cleared; });
    setTimeout(function () { if (modal.hidden) { if (!anyDone) openEarth(); else toast('어서 와! 남은 마을 친구들이 기다리고 있어요'); } }, 700);
  }
  var h = $('#hint'); h.hidden = false; setTimeout(function () { h.hidden = true; }, 9000);
  refreshTalk();
});
$('#btnAsk').addEventListener('click', function () { SFX.init(); openChat(); });
$('#btnMenu').addEventListener('click', function () { SFX.init(); openMenu(); });
$('#btnSound').addEventListener('click', function () { SFX.init(); SFX.setMuted(!SFX.muted()); if (SFX.muted()) TTS.stop(); updateSoundBtn(); });
updateSoundBtn();
renderStart();
reprobe();

/* ------------------------------------------------------------
   3D 시작
   ------------------------------------------------------------ */
function boot() {
  try {
    world = window.GQWorld.create($('#c'), {
      onNear: function (t) { nearT = t; refreshTalk(); },
      onTalk: function (t) { if (!modal.hidden || !$('#start').hidden) return; onTalk(t); },
      onUserGesture: function () { SFX.init(); }
    });
  } catch (e) {
    var n = $('#nogl'); n.textContent = '이 브라우저에서는 3D 화면을 열 수 없어요. 최신 크롬·엣지·사파리에서 열어 주세요. (' + e.message + ')'; n.hidden = false; return;
  }
  window.__gqWorld = world;
  world.setAvatar(AVATARS[state.avatar]);
  ZONES.forEach(function (z) { var st = state.zones[z.id]; if (st.cleared) world.clearZone(z.id, true); else if (st.partial) world.removeSmog(z.id, st.partial); });
  updateHUD(true);
  if (state.finale) world.celebrate();
}
if (window.THREE) boot(); else addEventListener('three-ready', boot, { once: true });
})();
