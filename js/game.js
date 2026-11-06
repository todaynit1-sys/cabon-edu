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
  return { grade: 1, avatar: 0, zones: z, seen: {}, homework: null, sprouts: 0, finale: false, name: '',
    seeds: {}, games: {}, hat: 'none', unlocked: {}, tips: false };
}
/* 별: 퀴즈 별(마을마다 최대 5) + 놀이 별(놀이마다 최고 3) */
function quizStars() { return ZONES.reduce(function (s, z) { return s + (state.zones[z.id].stars || 0); }, 0); }
function gameStars() { return ZONES.reduce(function (s, z) { return s + ((state.games[z.id] || {}).stars || 0); }, 0); }
function totalStars() { return quizStars() + gameStars(); }
function seedCount() { return Object.keys(state.seeds || {}).length; }
var SEED_TOTAL = 12;
/* 꾸미기 모자 — 별을 모으면 열려요 */
var HATS = [
  { id: 'none', icon: '🙂', name: '모자 없음', need: 0 },
  { id: 'sprout', icon: '🌱', name: '새싹 머리띠', need: 3 },
  { id: 'bear', icon: '🐻‍❄️', name: '북극곰 귀', need: 8 },
  { id: 'flower', icon: '🌼', name: '꽃 화관', need: 14 },
  { id: 'earth', icon: '🌏', name: '아기 지구 모자', need: 20 },
  { id: 'crown', icon: '👑', name: '반짝 별 왕관', seeds: SEED_TOTAL }
];
function hatOpen(h) { return h.seeds ? seedCount() >= h.seeds : totalStars() >= h.need; }
function checkUnlocks() {
  var fresh = HATS.filter(function (h) { return h.id !== 'none' && hatOpen(h) && !state.unlocked[h.id]; });
  fresh.forEach(function (h) { state.unlocked[h.id] = 1; });
  if (fresh.length) { save(); setTimeout(function () { SFX.fanfare(); toast('🎁 새 꾸미기가 열렸어요: ' + fresh.map(function (h) { return h.icon + ' ' + h.name; }).join(', ') + ' — 👕 꾸미기에서 써 봐요!', 4200); }, 900); }
}
var state = freshState();
try { var saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (saved && saved.zones) state = Object.assign(freshState(), saved); } catch (e) {}
['seeds', 'games', 'unlocked'].forEach(function (k) { if (!state[k] || typeof state[k] !== 'object') state[k] = {}; });
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
    boing: function () { tone(220, { f2: 520, dur: 0.18, type: 'sine', vol: 0.1 }); },
    seed: function () { [880, 1175, 1568].forEach(function (f, i) { tone(f, { dur: 0.12, delay: i * 0.06, type: 'triangle', vol: 0.1 }); }); },
    dance: function () { [523, 587, 659, 784, 659, 587, 523, 659, 784, 880, 784, 659].forEach(function (f, i) { tone(f, { dur: 0.18, delay: i * 0.18, type: 'square', vol: 0.05 }); }); },
    /* 잔잔한 오르골 배경음악 (음악 파일 없이 그때그때 만듦) */
    bgm: (function () {
      var on = false, timer = 0, step = 0;
      var CH = [[523, 659, 784], [440, 523, 659], [349, 440, 523], [392, 494, 587]];
      var MEL = [784, 659, 784, 880, 784, 659, 587, 659, 523, 587, 659, 784, 698, 659, 587, 523];
      function tick() {
        if (!on || !ctx || muted || document.hidden) return;
        var c = CH[Math.floor(step / 8) % CH.length];
        if (step % 8 === 0) c.forEach(function (f) { tone(f / 2, { dur: 2.2, type: 'sine', vol: 0.018 }); });
        if (step % 2 === 0) tone(MEL[(step / 2) % MEL.length], { dur: 0.5, type: 'triangle', vol: 0.028 });
        step++;
      }
      return function (v) { if (v === undefined) return on; on = !!v; clearInterval(timer); if (on) timer = setInterval(tick, 330); };
    })(),
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
  }).join('') + '<span class="counter" title="모은 별 (퀴즈 + 놀이)">⭐<b>' + totalStars() + '</b></span>' +
    '<span class="counter" title="반짝 씨앗">🌰<b>' + seedCount() + '/' + SEED_TOTAL + '</b></span>' +
    (state.sprouts ? '<span class="counter" title="실천 새싹">🌱<b>' + state.sprouts + '</b></span>' : '');
  if (world) world.setClean(k, instant);
  updateQuest();
}

/* ------------------------------------------------------------
   다음 할 일 안내 (+ 길 안내 화살표)
   ------------------------------------------------------------ */
var QUEST = null;
function computeQuest() {
  var next = ZONES.find(function (z) { return !state.zones[z.id].cleared; });
  if (next) {
    var st = state.zones[next.id];
    return { ico: next.icon, txt: next.friend + '에게 가서 ' + (st.partial ? '퀴즈 마저 풀기' : '퀴즈 풀기'), target: next.id, go: '데려다줘' };
  }
  if (!state.finale) return { ico: '🌏', txt: '동글이에게 가 보기', target: 'earth', go: '데려다줘' };
  if (seedCount() < SEED_TOTAL) return { ico: '🌰', txt: '반짝 씨앗 찾기 ' + seedCount() + '/' + SEED_TOTAL, target: 'seed', go: '가까운 씨앗' };
  var g = ZONES.find(function (z) { return !(state.games[z.id] || {}).stars || state.games[z.id].stars < 3; });
  if (g) return { ico: '🎮', txt: g.friend + '네 놀이에서 별 3개 받기', target: g.id, go: '데려다줘' };
  return { ico: '🏆', txt: '모두 해냈어요! 친구들과 또 놀아요', target: null, go: '' };
}
function updateQuest() {
  var el = $('#quest'); if (!el) return;
  QUEST = computeQuest();
  $('#questIco').textContent = QUEST.ico; $('#questTxt').textContent = QUEST.txt;
  $('#questGo').textContent = QUEST.go ? QUEST.go + ' ▶' : ''; $('#questGo').hidden = !QUEST.go;
  if (world) world.setGuide(QUEST.target === 'seed' ? world.nextSeed() : QUEST.target);
}
$('#quest').addEventListener('click', function () {
  if (!QUEST || !world || !QUEST.target) return;
  SFX.click();
  if (QUEST.target === 'seed') { var p = world.nextSeed(); if (p) { world.walkToPos(p); world.setGuide(p); toast('🌰 반짝 씨앗을 찾으러 가요!'); } return; }
  world.walkTo(QUEST.target);
});
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
  else if (t.type === 'mascot') openBear();
}

/* ------------------------------------------------------------
   얼음이와 놀기 (묻기 · 춤추기 · 쓰다듬기)
   ------------------------------------------------------------ */
function openBear() {
  if (world) world.focus('mascot');
  var lines = ['뭐 하고 놀까?', '오늘도 지구 지키러 왔구나!', '나랑 같이 춤출래?', '궁금한 거 있으면 물어봐!'];
  var line = lines[Math.floor(Math.random() * lines.length)];
  openModal('<div class="who" style="--zc:#4aa3df"><span class="ava">🐻‍❄️</span><div><b>얼음이</b><small>아기 북극곰</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<p class="say">' + esc(line) + '</p>' +
    '<div class="choice3"><button class="pick-big" data-act="ask"><span>💬</span><b>궁금한 거 묻기</b><small>지구 이야기 카드로 대답해요</small></button>' +
    '<button class="pick-big" data-act="dance"><span>💃</span><b>같이 춤추기</b><small>빙글빙글 통통!</small></button>' +
    '<button class="pick-big" data-act="pet"><span>💕</span><b>쓰다듬기</b><small>얼음이가 좋아해요</small></button></div>', { cls: 'bear' });
  TTS.speak(line, 'bear');
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    var act = a.dataset.act;
    if (act === 'close') closeModal();
    if (act === 'ask') openChat();
    if (act === 'dance') { closeModal(); if (world) world.dance(5); SFX.dance(); toast('💃 얼음이랑 빙글빙글 통통!'); }
    if (act === 'pet') { closeModal(); if (world) world.hearts(); SFX.seed(); var say = ['헤헤, 간지러워!', '기분 최고야! 고마워', '나도 네가 좋아!']; var s = say[Math.floor(Math.random() * say.length)]; toast('💕 얼음이: ' + s); TTS.speak(s, 'bear'); }
  };
}

/* ------------------------------------------------------------
   반짝 씨앗
   ------------------------------------------------------------ */
var SEED_FACTS = ['H2', 'R2', 'F1', 'T2', 'E3', 'H3', 'R3', 'F3', 'T3', 'E4', 'R7', 'F5'];
function onSeed(id) {
  if (state.seeds[id]) return;
  state.seeds[id] = 1; save();
  var n = seedCount(), c = AI.card(SEED_FACTS[(n - 1) % SEED_FACTS.length]);
  SFX.seed();
  if (n >= SEED_TOTAL) { toast('🌰 반짝 씨앗을 모두 모았어요! 👑 반짝 별 왕관이 열렸어요!', 4500); SFX.fanfare(); if (world) world.cheer(); }
  else toast('🌰 반짝 씨앗 ' + n + '/' + SEED_TOTAL + ' · 알고 있니? ' + (c ? c.text.split(/(?<=요\.)\s/)[0] : ''), 4200);
  updateHUD(); checkUnlocks();
}

/* ------------------------------------------------------------
   친구 → 퀴즈
   ------------------------------------------------------------ */
var Q = null;
function friendHead(z) { return '<div class="who" style="--zc:' + z.color + '"><span class="ava">' + ANIMAL_EMOJI[z.animal] + '</span><div><b>' + esc(z.friend) + '</b><small>' + esc(z.name) + '</small></div></div>'; }
function aiBadge() {
  var c = AI.loadCfg();
  if (AI.ready()) return '<span class="ai-on">✨ AI 맞춤 출제 켜짐 · ' + esc(c.provider === 'webllm' ? modelName(c.model) + ' (이 기기)' : (c.model || c.provider)) + '</span>';
  var s = aiStateText();
  return '<span class="ai-off">📗 기본 문제로 풀어요' + (s.cls === 'load' ? ' (무료 AI 준비 중)' : s.cls === 'need' ? ' · 무료 AI를 켜면 맞춤 문제를 만들어요' : '') + '</span>';
}
function openFriend(zone) {
  var z = ZMAP[zone], st = state.zones[zone];
  if (world) world.focus(zone);
  var again = st.cleared, G = window.GQGames.META[zone], gs = state.games[zone] || {};
  var line = again ? '또 왔구나! 퀴즈를 다시 풀어도 좋고, 나랑 ' + G.title + ' 놀이를 해도 좋아!' : z.greet + ' 퀴즈가 끝나면 ' + G.title + ' 놀이도 같이 하자!';
  var stars = function (n) { return '<em class="minis">' + [0, 1, 2].map(function (i) { return i < n ? '★' : '☆'; }).join('') + '</em>'; };
  openModal(friendHead(z) +
    '<p class="say">' + esc(line) + '</p>' +
    '<div class="choice2">' +
    '<button class="pick-big quiz" data-act="start" data-autofocus><span>📝</span><b>' + (again ? '퀴즈 다시 풀기' : '퀴즈 풀기') + '</b><small>' + (again ? '지난번 별 ' + st.stars + '개' : '맞히면 지구 열이 내려가요') + '</small></button>' +
    '<button class="pick-big play" data-act="game"><span>' + G.icon + '</span><b>놀이: ' + esc(G.title) + '</b><small>' + (gs.best ? '최고 ' + gs.best + '점 ' + stars(gs.stars || 0) : '30초 동안 신나게!') + '</small></button></div>' +
    '<div class="meta">' + aiBadge() + '</div>' +
    '<div class="btns"><button class="ghost" data-act="close">나중에 할래</button></div>', { cls: 'friend' });
  TTS.speak(line, 'friend');
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'close') closeModal();
    if (a.dataset.act === 'start') { SFX.click(); prepareQuiz(zone); }
    if (a.dataset.act === 'game') { SFX.click(); openGame(zone); }
  };
}

/* ------------------------------------------------------------
   마을 놀이 (미니게임)
   ------------------------------------------------------------ */
var stopGame = null;
function openGame(zone) {
  var z = ZMAP[zone];
  openModal('', { cls: 'mg locked', onClose: function () { if (stopGame) { stopGame(); stopGame = null; } } });
  stopGame = window.GQGames.start(zone, mcard, {
    sfx: SFX, best: (state.games[zone] || {}).best || 0,
    speak: function (t) { TTS.speak(t, 'friend'); },
    onEnd: function (r) {
      var g = state.games[zone] || { best: 0, stars: 0, plays: 0 };
      g.plays = (g.plays || 0) + 1; g.best = Math.max(g.best || 0, r.score); g.stars = Math.max(g.stars || 0, r.stars);
      state.games[zone] = g; save(); updateHUD(); checkUnlocks();
      if (world) world.cheer();
    },
    onQuit: function () { stopGame = null; closeModal(); toast(z.friend + ': 또 놀자! ' + window.GQGames.META[zone].icon); }
  });
}
/* ------------------------------------------------------------
   다음 마을 문제 미리 만들기 (AI가 느려도 아이가 기다리지 않게)
   — 한 번에 한 마을씩, 아이가 기다리는 요청이 오면 양보했다가 나중에 다시 만듭니다.
   ------------------------------------------------------------ */
var PF = {}, pfTries = {}, pfTimer = 0;
function schedulePrefetch(delay) {
  clearTimeout(pfTimer);
  pfTimer = setTimeout(prefetchNext, delay == null ? 1500 : delay);
}
function prefetchNext() {
  if (!AI.ready()) return;
  if (Object.keys(PF).some(function (k) { return !PF[k].res; })) return; // 이미 하나 만드는 중
  var next = ZONES.find(function (z) { return !state.zones[z.id].cleared && !PF[z.id] && (pfTries[z.id] || 0) < 3; });
  if (!next) return;
  var zone = next.id, entry = { grade: state.grade, res: null };
  PF[zone] = entry;
  entry.p = AI.makeQuiz(zone, state.grade, 5, state.seen, null, { background: true }).then(function (r) {
    if (PF[zone] !== entry) return r;
    if (r.source === 'bank') { // 실패하거나 아이 요청에 양보함 → 지우고 나중에 다시
      delete PF[zone];
      if (!r.report.interrupted) pfTries[zone] = (pfTries[zone] || 0) + 1;
      schedulePrefetch(r.report.interrupted ? 8000 : 3000);
    } else { entry.res = r; schedulePrefetch(1500); }
    refreshAiChip();
    return r;
  });
  refreshAiChip();
}
function takePrefetch(zone) {
  var e = PF[zone];
  if (!e || e.grade !== state.grade) { if (e) delete PF[zone]; return null; }
  return e;
}

function prepareQuiz(zone) {
  var z = ZMAP[zone], g = GRADES[state.grade];
  var ctrl = new AbortController(), done = false, t0 = Date.now();
  var go = function (res) { if (done) return; done = true; clearInterval(tick); delete PF[zone]; startQuiz(zone, res); schedulePrefetch(4000); };
  var tick = 0;
  var pre = takePrefetch(zone);
  if (pre && pre.res) { go(pre.res); return; } // 미리 만들어 둔 문제가 있으면 바로!
  if (!AI.ready()) { go({ items: AI.pickBank(zone, state.grade, 5, state.seen), source: 'bank', report: { reason: 'AI 미연결' } }); return; }
  mcard.classList.add('locked');
  mcard.innerHTML = friendHead(z) +
    '<div class="making"><div class="bounce">' + ANIMAL_EMOJI[z.animal] + '</div>' +
    '<p><b>' + esc(z.friend) + '</b>가 <b>' + esc(g.label) + '</b>에 꼭 맞는 문제를 만들고 있어요' + (pre ? ' (미리 만들던 문제를 마무리하는 중)' : '') + '</p>' +
    (AI.isWeb()
      ? '<ol class="pipeline"><li class="on">✨ AI가 검수된 문제를 ' + esc(g.label) + ' 생활 장면으로 다시 쓰기</li><li>🔎 정답이 바뀌지 않았는지 확인</li><li>🧐 AI 교차 검토</li></ol>'
      : '<ol class="pipeline"><li class="on">✨ AI가 근거 카드로 문제 만들기</li><li>🔎 근거 문장 대조하기</li><li>🧐 AI 교차 검토</li></ol>') +
    '<p class="sec"><span id="sec">0</span>초</p></div>' +
    '<div class="btns"><button class="ghost" data-act="skip">기다리기 싫어요! 기본 문제로 바로 풀기</button></div>';
  var slow = AI.isWeb() ? 3 : 1;
  tick = setInterval(function () {
    var s = Math.floor((Date.now() - t0) / 1000), el = $('#sec'); if (el) el.textContent = s;
    var li = mcard.querySelectorAll('.pipeline li'); if (li.length) { li[1].classList.toggle('on', s >= 4 * slow); li[2].classList.toggle('on', s >= 8 * slow); }
  }, 500);
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'skip') { ctrl.abort(); go({ items: AI.pickBank(zone, state.grade, 5, state.seen), source: 'bank', report: { reason: '아이가 기본 문제 선택' } }); }
  };
  if (pre) { pre.p.then(function (r) { if (r.source !== 'bank') go(r); else if (!done) AI.makeQuiz(zone, state.grade, 5, state.seen, ctrl.signal).then(go); }); return; }
  AI.makeQuiz(zone, state.grade, 5, state.seen, ctrl.signal).then(go);
}
function startQuiz(zone, res) {
  mcard.classList.add('locked');
  Q = { zone: zone, items: res.items, i: 0, correct: 0, source: res.source, report: res.report, cur: null, retried: false };
  state.zones[zone].plays++;
  var rw = res.report && res.report.mode === 'rewrite';
  if (res.source !== 'bank') toast(res.source === 'ai' ? (rw ? '✨ AI가 ' + GRADES[state.grade].label + ' 눈높이로 다시 쓴 문제 5개! 정답 확인을 통과했어요' : '✨ AI가 만든 새 문제 5개! 모두 근거 확인을 통과했어요')
    : '✨ AI ' + (rw ? '다시 쓴' : '') + ' 문제 ' + res.report.passed + '개 + 기본 문제로 준비했어요');
  renderQ(Q.items[0]);
}
function dots() {
  return '<div class="dots">' + Q.items.map(function (_, i) { return '<i class="' + (i < Q.i ? 'done' : i === Q.i ? 'now' : '') + '"></i>'; }).join('') + '</div>';
}
function srcBadge(it) {
  if (it.source === 'ai' && it.mode === 'rewrite') return '<button class="src ai" data-act="ev">✨ AI가 ' + esc(GRADES[state.grade].label) + ' 눈높이로 다시 쓴 문제 · 정답 확인 ✓</button>';
  if (it.source === 'ai') return '<button class="src ai" data-act="ev">✨ AI가 만든 문제 · 근거 확인 ✓</button>';
  return '<button class="src bank" data-act="ev">📗 기본 문제 · 근거 보기</button>';
}
function evBox(it) {
  var c = AI.card(it.ev); if (!c) return '';
  return '<div class="evbox" hidden><b>📄 어디서 나온 말이야? — ' + esc(c.title) + '</b><p>' + esc(c.text) + '</p>' +
    (it.quote ? '<p class="quote">AI가 짚은 근거 문장: “' + esc(it.quote) + '”</p>' : '') +
    (it.origQ ? '<p class="quote">사람이 검수한 원래 문제: “' + esc(it.origQ) + '”</p>' : '') +
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
    SFX.correct(); Q.correct++; Q.streak = (Q.streak || 0) + 1;
    confetti(Q.streak >= 3 ? 36 : 18);
    var st = state.zones[Q.zone]; if (!st.cleared) st.partial = Math.min(5, st.partial + 1);
    save(); if (world) { world.popSmog(Q.zone); world.cheer(); } updateHUD();
    fb.className = 'fb good';
    fb.innerHTML = '<b class="big">딩동댕! 🎉' + (Q.streak >= 2 ? ' <span class="combo">🔥 ' + Q.streak + '연속 정답!</span>' : '') + '</b><p>' + esc(it.explain) + '</p><p class="smogmsg">뭉게 하나가 나비가 되어 날아갔어요 🦋</p>' +
      '<div class="btns"><button class="primary big" data-act="next" data-autofocus>' + (isLast() ? '결과 보기 ⭐' : '다음 문제 ▶') + '</button></div>';
    TTS.speak('딩동댕! ' + it.explain, 'friend');
    fb.querySelector('button').focus();
  } else {
    SFX.wrong(); Q.streak = 0;
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
  var rw = rep.mode === 'rewrite';
  var aiLine = src === 'bank' ? '' : '<p class="airep">✨ 이번 문제는 AI가 ' + esc(GRADES[state.grade].label) + ' 눈높이로 ' + (rw ? '다시 썼어요. 정답이 바뀌지 않았는지 확인한 문제만 냈어요' : '만들었어요. 근거 카드와 대조해서 통과한 문제만 냈어요') +
    (rep.dropped && rep.dropped.length ? ' (확인에서 걸러진 문제 ' + rep.dropped.length + '개)' : '') + '.</p>';
  var G = window.GQGames.META[zone], goGame = false;
  openModal('<div class="clear-top" style="--zc:' + z.color + '"><div class="big-stamp">' + z.icon + '<i>✓</i></div><h2>' + esc(z.name) + ' 깨끗!</h2>' +
    '<div class="stars">' + '★★★★★'.slice(0, stars).split('').map(function () { return '<i>★</i>'; }).join('') + '<span class="dim">' + '★★★★★'.slice(stars) + '</span></div></div>' +
    '<p class="say">' + esc(z.cleared) + '</p>' + aiLine +
    '<div class="btns"><button class="primary big" data-act="close" data-autofocus>마을 구경하기 👀</button><button class="ghost" data-act="game">' + G.icon + ' ' + esc(G.title) + ' 놀이</button></div>', {
    cls: 'clear',
    onClose: function () {
      if (world) world.clearZone(zone);
      updateHUD(); checkUnlocks();
      if (goGame) { setTimeout(function () { openGame(zone); }, 400); return; }
      if (first && ZONES.every(function (x) { return state.zones[x.id].cleared; }) && !state.finale) setTimeout(openFinale, 2600);
      else if (first) toast('다음 마을 친구에게 가 볼까요? 왼쪽 위 "다음 할 일"을 누르면 데려다줘요!', 3600);
    }
  });
  TTS.speak(z.name + ' 깨끗! ' + z.cleared, 'friend');
  mcard.onclick = function (e) {
    if (e.target.closest('[data-act="close"]')) closeModal();
    if (e.target.closest('[data-act="game"]')) { goGame = true; closeModal(); }
  };
}

/* 정답 축하 꽃가루 (화면 위에서 톡톡) */
function confetti(n) {
  var box = document.createElement('div'); box.className = 'confetti'; document.body.appendChild(box);
  var C = ['#ff8fab', '#ffd166', '#8fd3ff', '#7fcd6b', '#b8a1ff'];
  for (var i = 0; i < n; i++) {
    var p = document.createElement('i');
    p.style.left = (Math.random() * 100) + '%'; p.style.background = C[i % C.length];
    p.style.animationDelay = (Math.random() * 0.25) + 's'; p.style.animationDuration = (0.9 + Math.random() * 0.8) + 's';
    p.style.setProperty('--dx', ((Math.random() - 0.5) * 160) + 'px'); p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    box.appendChild(p);
  }
  setTimeout(function () { box.remove(); }, 2000);
}

/* ------------------------------------------------------------
   꾸미기 옷장 · 사진 찍기
   ------------------------------------------------------------ */
function openWardrobe() {
  var ts = totalStars(), sc = seedCount();
  openModal('<div class="who" style="--zc:#f2b93b"><span class="ava">👕</span><div><b>꾸미기 옷장</b><small>⭐ 별 ' + ts + '개 · 🌰 씨앗 ' + sc + '/' + SEED_TOTAL + '</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<p class="fine">퀴즈와 놀이에서 별을 모으면 새 모자가 열려요. 별 왕관은 반짝 씨앗 12개를 모두 모으면 열려요!</p>' +
    '<div class="wardrobe">' + HATS.map(function (h) {
      var open = hatOpen(h), on = state.hat === h.id;
      var need = h.seeds ? '🌰 씨앗 ' + sc + '/' + h.seeds : '⭐ ' + Math.min(ts, h.need) + '/' + h.need;
      return '<button class="hat ' + (open ? '' : 'locked ') + (on ? 'on' : '') + '" data-hat="' + h.id + '"' + (open ? '' : ' aria-disabled="true"') + '><span>' + (open ? h.icon : '🔒') + '</span><b>' + esc(h.name) + '</b><small>' + (on ? '쓰고 있어요' : open ? '써 보기' : need) + '</small></button>';
    }).join('') + '</div>' +
    '<div class="btns"><button class="ghost" data-act="avatar">🧒 캐릭터 바꾸기</button><button class="primary" data-act="close">다 됐어요</button></div>', { cls: 'menu wear' });
  mcard.onclick = function (e) {
    var hb = e.target.closest('[data-hat]');
    if (hb) {
      var h = HATS.find(function (x) { return x.id === hb.dataset.hat; });
      if (!hatOpen(h)) { SFX.wrong(); toast(h.seeds ? '🌰 반짝 씨앗을 모두 모으면 열려요!' : '⭐ 별 ' + h.need + '개를 모으면 열려요! (지금 ' + ts + '개)'); return; }
      state.hat = h.id; save(); if (world) world.setHat(h.id); SFX.pop(); if (world) world.cheer(); openWardrobe(); return;
    }
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'close') closeModal();
    if (a.dataset.act === 'avatar') { state.avatar = (state.avatar + 1) % AVATARS.length; save(); if (world) world.setAvatar(AVATARS[state.avatar]); SFX.pop(); toast('🧒 ' + AVATARS[state.avatar].label + ' 캐릭터!'); }
  };
}
function openPhoto() {
  if (!world) return;
  var shot = world.snapshot(); if (!shot) { toast('이 브라우저에서는 사진을 찍을 수 없어요'); return; }
  SFX.click();
  var img = new Image();
  img.onload = function () {
    var W = 1200, H = Math.round(W * img.height / img.width), pad = 34, foot = 96;
    var cv = document.createElement('canvas'); cv.width = W + pad * 2; cv.height = H + pad * 2 + foot;
    var g = cv.getContext('2d');
    g.fillStyle = '#fffdf6'; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, pad, pad, W, H);
    g.fillStyle = '#2f7d5b'; g.font = '800 40px Jua, "Malgun Gothic", sans-serif'; g.textBaseline = 'middle';
    g.fillText('🌏 초록별 퀴즈 마을', pad, H + pad + foot / 2);
    var d = new Date(); g.fillStyle = '#5d7480'; g.font = '600 26px "Malgun Gothic", sans-serif'; g.textAlign = 'right';
    g.fillText('⭐ ' + totalStars() + '  🌰 ' + seedCount() + '  ·  ' + d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate(), cv.width - pad, H + pad + foot / 2);
    var url = cv.toDataURL('image/jpeg', 0.9);
    openModal('<div class="who" style="--zc:#ff8fab"><span class="ava">📸</span><div><b>찰칵! 사진이 찍혔어요</b><small>이 기기에만 저장돼요</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
      '<img class="photo" src="' + url + '" alt="초록별 퀴즈 마을 사진">' +
      '<div class="btns"><a class="primary big btnlike" href="' + url + '" download="초록별퀴즈마을_' + d.getFullYear() + (d.getMonth() + 1) + d.getDate() + '.jpg">사진 저장하기 💾</a><button class="ghost" data-act="close">닫기</button></div>', { cls: 'photo-card' });
    mcard.onclick = function (e) { if (e.target.closest('[data-act="close"]')) closeModal(); };
  };
  img.src = shot;
  var fl = document.createElement('div'); fl.className = 'flash'; document.body.appendChild(fl); setTimeout(function () { fl.remove(); }, 500);
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
  var tips = !state.tips; // 처음 온 아이에게만 놀이 방법 안내
  if (tips) { state.tips = true; save(); }
  openModal('<div class="who" style="--zc:#58b4ea"><span class="ava">🌏</span><div><b>아기 지구 동글이</b><small>초록별 마을 광장</small></div></div>' +
    '<p class="say">' + esc(line) + '</p>' +
    (tips ? '<ul class="tips"><li><span>👆</span>땅을 누르면 그곳으로 걸어가요 <small>(키보드: 방향키 · 스페이스 점프)</small></li><li><span>💬</span>친구에게 가면 <b>퀴즈</b>와 <b>놀이</b>를 할 수 있어요</li><li><span>🌰</span>섬 곳곳의 <b>반짝 씨앗</b>을 모아 보세요</li><li><span>⭐</span>별을 모으면 <b>👕 꾸미기</b>에서 새 모자가 열려요</li></ul>' : '') +
    (allDone ? '<div class="btns"><button class="primary big" data-act="hw" data-autofocus>오늘의 지구 숙제 받기 📮</button><button class="ghost" data-act="cert">수료증 만들기 🏅</button></div>'
      : '<div class="zone-list">' + ZONES.map(function (z) { var st = state.zones[z.id]; return '<button class="zl ' + (st.cleared ? 'done' : '') + '" data-walk="' + z.id + '" style="--zc:' + z.color + '"><span>' + z.icon + '</span><b>' + esc(z.name) + '</b><small>' + (st.cleared ? '깨끗해요 ✓' : esc(z.friend) + '에게 데려다줘') + '</small></button>'; }).join('') + '</div>') +
    '<div class="btns"><button class="ghost" data-act="ask">🐻‍❄️ 얼음이에게 묻기</button><button class="' + (tips ? 'primary big' : 'ghost') + '" data-act="close">' + (tips ? '알겠어, 출발! 🚀' : '닫기') + '</button></div>', { cls: 'earth' });
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
    '<div class="set-sec"><h3>소리</h3><label class="tg"><input type="checkbox" id="optTTS" ' + (TTS.on ? 'checked' : '') + '> 문제와 대답을 소리 내어 읽어 주기</label><label class="tg"><input type="checkbox" id="optBgm" ' + (pref('gq.bgm', '1') === '1' ? 'checked' : '') + '> 잔잔한 배경음악</label><label class="tg"><input type="checkbox" id="optMute" ' + (SFX.muted() ? 'checked' : '') + '> 모든 소리 끄기</label></div>' +
    '<div class="set-sec"><h3>AI <small>(모델 비종속 · 연결 방식만 바꾸면 교체)</small></h3>' +
    '<label class="tg"><input type="checkbox" id="aiOn" ' + (c.enabled ? 'checked' : '') + '> AI 기능 쓰기 (끄면 기본 문제은행으로만 진행)</label>' +
    '<p class="fine">지금 상태: <b>' + esc(aiStateText().long) + '</b></p>' +
    '<div class="btns left"><button class="primary" data-act="websetup">브라우저 안 무료 AI 설정</button></div>' +
    '<details class="adv"' + (c.provider !== 'webllm' ? ' open' : '') + '><summary>다른 AI 서버에 연결하기 (기관 공통기반 · Ollama 등)</summary>' +
    '<label class="lbl">빠른 설정<select id="aiPreset"><option value="">직접 입력</option>' + presets.map(function (p) { return '<option value="' + p.id + '">' + esc(p.label) + '</option>'; }).join('') + '</select></label>' +
    '<p class="fine" id="presetNote"></p>' +
    '<label class="lbl">연결 방식<select id="aiProv">' + ['webllm', 'openai', 'anthropic', 'claude-artifact'].map(function (p) { return '<option ' + (c.provider === p ? 'selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label>' +
    '<label class="lbl">주소 (Base URL)<input id="aiUrl" value="' + esc(c.baseUrl) + '" placeholder="http://localhost:11434/v1"></label>' +
    '<label class="lbl">모델 이름<input id="aiModel" value="' + esc(c.model) + '" placeholder="gemma3:12b"></label>' +
    '<label class="lbl">API 키 (필요할 때만)<input id="aiKey" type="password" value="' + esc(c.apiKey || '') + '" placeholder="로컬 모델은 비워 두세요"></label>' +
    '<label class="tg"><input type="checkbox" id="aiKeep" ' + (c.keepKey ? 'checked' : '') + '> 이 기기에 키 저장 (공용 PC에서는 끄세요)</label>' +
    '<div class="btns left"><button class="ghost" data-act="test">연결 테스트</button><button class="primary" data-act="saveai">저장하고 사용</button></div><p class="fine" id="testOut"></p></details>' +
    '<label class="tg"><input type="checkbox" id="aiCross" ' + (c.crossCheck ? 'checked' : '') + '> AI가 만든 문제를 AI로 한 번 더 교차 검토 (조금 느려져요)</label></div>' +
    '<div class="set-sec"><h3>AI 활동 기록</h3><p class="fine">AI가 문제를 몇 개 만들었고, 근거 대조와 교차 검토에서 몇 개를 걸렀는지 볼 수 있어요.</p><div class="btns left"><button class="ghost" data-act="log">AI 기록 보기</button></div></div>' +
    '<div class="set-sec"><h3>보호자·선생님 안내</h3><ul class="fine list"><li>로그인이 없고, 이름·학교 같은 개인정보를 받지 않아요. 진행 기록은 이 기기 브라우저에만 저장돼요.</li><li>기본 AI(브라우저 안 무료 AI)는 이 기기 안에서만 돌아가서 아이가 쓴 글이 밖으로 나가지 않아요. 다른 AI 서버를 연결하면 아이 질문(개인정보는 ○○로 가림)과 근거 카드만 그 주소로 보내요.</li><li>AI가 만든 문제는 근거 카드와 자동 대조하고, 통과한 것만 아이에게 보여요. 수치·내용은 체험용 예시이며 실제 운영 전 감수가 필요해요.</li></ul>' +
    '<div class="btns left"><button class="ghost danger" data-act="reset">처음부터 다시 하기</button></div></div>', { cls: 'menu' });
  var notePreset = function () { var p = presets.find(function (x) { return x.id === $('#aiPreset').value; }); $('#presetNote').textContent = p ? p.note : ''; };
  $('#aiPreset').onchange = function () { var p = presets.find(function (x) { return x.id === this.value; }, this); if (p) { $('#aiProv').value = p.provider; $('#aiUrl').value = p.baseUrl; $('#aiModel').value = p.model; } notePreset(); };
  var form = function () { return Object.assign(AI.loadCfg(), { enabled: $('#aiOn').checked, provider: $('#aiProv').value, baseUrl: $('#aiUrl').value.trim(), model: $('#aiModel').value.trim(), apiKey: $('#aiKey').value.trim(), keepKey: $('#aiKeep').checked, crossCheck: $('#aiCross').checked }); };
  $('#aiOn').onchange = function () { var cc = AI.loadCfg(); cc.enabled = this.checked; AI.saveCfg(cc); reprobe(); };
  $('#aiCross').onchange = function () { var cc = AI.loadCfg(); cc.crossCheck = this.checked; AI.saveCfg(cc); };
  $('#optTTS').onchange = function () { TTS.on = this.checked; setPref('gq.tts', this.checked ? '1' : '0'); };
  $('#optMute').onchange = function () { SFX.setMuted(this.checked); if (this.checked) TTS.stop(); updateSoundBtn(); };
  $('#optBgm').onchange = function () { setPref('gq.bgm', this.checked ? '1' : '0'); SFX.init(); SFX.bgm(this.checked); };
  mcard.onclick = function (e) {
    var pk = e.target.closest('.pk'); if (pk) { state.grade = +pk.dataset.v; save(); mcard.querySelectorAll('[data-k="grade"] .pk').forEach(function (b) { b.classList.toggle('on', b === pk); }); toast(GRADES[state.grade].label + ' 눈높이로 문제를 낼게요'); return; }
    var a = e.target.closest('[data-act]'); if (!a) return;
    var act = a.dataset.act;
    if (act === 'close') closeModal();
    if (act === 'test') { var out = $('#testOut'); out.textContent = '연결하는 중…'; AI.test(form()).then(function (t) { out.textContent = '✅ 연결 성공: ' + t; }, function (err) { out.textContent = '❌ 연결 실패: ' + err.message; }); }
    if (act === 'saveai') { AI.saveCfg(form()); AI.probe().then(function () { updateAiPill(); toast(AI.ready() ? '✨ AI 연결을 저장했어요' : 'AI 없이 기본 문제로 진행해요' + (AI.status().msg ? ' (' + AI.status().msg + ')' : '')); }); }
    if (act === 'log') openLog();
    if (act === 'websetup') openAiSetup();
    if (act === 'reset') { if (confirm('지금까지의 진행(도장·별·숙제)을 모두 지우고 처음부터 할까요?')) { localStorage.removeItem(SAVE_KEY); location.reload(); } }
  };
}
function fmtTime(t) { var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function openLog() {
  var L = AI.LOG();
  var rows = L.length ? L.map(function (r) {
    var d = r.detail || {}, body = '';
    if (r.kind === '출제') {
      body = esc(ZMAP[d.zone] ? ZMAP[d.zone].name : d.zone) + ' · ' + esc(d.grade) + (d.mode ? ' · ' + esc(d.mode) : '') + ' — 요청 ' + d.asked + '개 → <b>통과 ' + d.passed + '개</b> · ' + esc(d.cross) + ' · ' + ((d.ms || 0) / 1000).toFixed(1) + '초';
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
/* ------------------------------------------------------------
   AI 상태 표시 · 브라우저 안 무료 AI 켜기
   ------------------------------------------------------------ */
var WEB = window.GreenLLM.web;
function modelInfo(id) { return WEB.models.find(function (m) { return m.id === id; }) || { id: id, label: id, gb: '?' }; }
function modelName(id) { return modelInfo(id).label.split(' (')[0]; }
function aiStateText() {
  var c = AI.loadCfg(), st = AI.status();
  if (!c.enabled) return { cls: 'off', short: 'AI 꺼짐', long: 'AI 꺼짐 · 기본 문제로 플레이' };
  if (c.provider === 'webllm') {
    var w = WEB.state();
    if (st.state === 'fail') return { cls: 'off', short: '기본 문제', long: '이 기기에서는 무료 AI를 쓸 수 없어요 (' + st.msg + ') · 기본 문제로 플레이' };
    if (w.ready && w.model === c.model) return { cls: 'on', short: '✨ AI 켜짐', long: '✨ 무료 AI 켜짐 · ' + modelName(c.model) + ' (이 기기에서 실행)' };
    if (w.loading) return { cls: 'load', short: '⏳ AI ' + Math.round(w.progress * 100) + '%', long: '⏳ 무료 AI 준비 중 ' + Math.round(w.progress * 100) + '% · 그동안 기본 문제로 놀 수 있어요' };
    return { cls: 'need', short: '✨ AI 켜기', long: '✨ 무료 AI 켜기 · 이 기기에서 실행 (처음 한 번 약 ' + modelInfo(c.model).gb + 'GB 내려받기)' };
  }
  if (st.state === 'checking') return { cls: 'load', short: '🔌 확인 중', long: '🔌 AI 모델 확인 중… (' + (c.model || c.provider) + ')' };
  if (AI.ready()) return { cls: 'on', short: '✨ AI 켜짐', long: '✨ AI 연결: ' + (c.model || c.provider) };
  return { cls: 'off', short: '기본 문제', long: '📗 AI 연결 안 됨' + (st.msg ? ' (' + st.msg + ')' : '') + ' · 기본 문제로 플레이' };
}
function updateAiPill() {
  var p = $('#aiPill'); if (!p) return;
  var s = aiStateText();
  p.innerHTML = esc(s.long) + (s.cls === 'need' ? '' : s.cls === 'on' ? ' · <u>바꾸기</u>' : s.cls === 'off' ? ' · <u>설정</u>' : '');
  p.className = 'ai-pill ' + s.cls;
  refreshAiChip();
}
function refreshAiChip() {
  var b = $('#btnAI'); if (!b) return;
  var s = aiStateText(), pf = Object.keys(PF).filter(function (k) { return PF[k].res; }).length;
  var making = Object.keys(PF).some(function (k) { return !PF[k].res; });
  b.textContent = s.short + (s.cls === 'on' && making ? ' · 문제 준비 중' : s.cls === 'on' && pf ? ' · 준비 ' + pf : '');
  b.className = 'tool aichip ' + s.cls;
  b.hidden = !AI.loadCfg().enabled;
}
function reprobe() { AI.probe().then(updateAiPill); updateAiPill(); }
function onAiButton() { var c = AI.loadCfg(); if (c.provider === 'webllm' || !c.enabled) openAiSetup(); else openMenu(); }

var wasReady = false, lastWebPaint = 0;
WEB.on(function (w) {
  var now = Date.now();
  if (w.ready || !w.loading || now - lastWebPaint > 250) { lastWebPaint = now; updateAiPill(); paintWebSetup(); }
  var r = AI.ready();
  if (r && !wasReady) { toast('✨ 무료 AI 준비 완료! 이제 AI가 학년에 맞춰 문제를 만들어요', 3600); schedulePrefetch(1200); }
  wasReady = r;
});

function openAiSetup() {
  var c = AI.loadCfg();
  var sel = c.provider === 'webllm' ? c.model : WEB.models[0].id;
  var cached = {};
  openModal('<div class="who" style="--zc:#4aa3df"><span class="ava">✨</span><div><b>브라우저 안 무료 AI</b><small>보호자·선생님용 안내</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<ul class="fine list big">' +
    '<li><b>무료</b>예요. 가입·API 키·서버가 필요 없어요.</li>' +
    '<li>AI가 <b>이 기기의 브라우저 안에서</b> 돌아가서, 아이가 쓴 글이 기기 밖으로 나가지 않아요.</li>' +
    '<li>처음 한 번 모델을 내려받아 브라우저에 저장해요(와이파이 권장). 다음부터는 저장본을 바로 써요.</li>' +
    '<li>최신 크롬·엣지(WebGPU)가 필요해요. 기기에 따라 문제 5개를 만드는 데 30초~2분쯤 걸려서, 다음 마을 문제를 미리 만들어 둬요.</li></ul>' +
    '<h3 class="qh">모델 고르기</h3><div class="models" id="wlModels"></div>' +
    '<div class="wlprog" id="wlProg" hidden><div class="bar"><i id="wlBar"></i></div><p class="fine" id="wlText"></p></div>' +
    '<div class="btns" id="wlBtns"></div>', { cls: 'menu websetup' });
  function paintModels() {
    $('#wlModels').innerHTML = WEB.models.map(function (m) {
      return '<button class="mdl ' + (m.id === sel ? 'on' : '') + '" data-m="' + m.id + '"><b>' + esc(m.label) + '</b><small>' + esc(m.license) + (cached[m.id] ? ' · <em>이 기기에 저장됨</em>' : '') + '</small></button>';
    }).join('');
  }
  openAiSetup.sel = function () { return sel; };
  paintModels(); paintWebSetup();
  WEB.models.forEach(function (m) { WEB.cached(m.id).then(function (y) { cached[m.id] = y; if ($('#wlModels')) { paintModels(); paintWebSetup(); } openAiSetup.cached = cached; }); });
  openAiSetup.cached = cached;
  mcard.onclick = function (e) {
    var m = e.target.closest('[data-m]'); if (m) { sel = m.dataset.m; SFX.click(); paintModels(); paintWebSetup(); return; }
    var a = e.target.closest('[data-act]'); if (!a) return;
    var act = a.dataset.act;
    if (act === 'close' || act === 'hide') closeModal();
    if (act === 'menu') openMenu();
    if (act === 'load') {
      var cc = AI.loadCfg(); cc.enabled = true; cc.provider = 'webllm'; cc.model = sel; cc.baseUrl = ''; AI.saveCfg(cc);
      AI.probe().then(function (st) {
        if (st.state === 'fail') { $('#wlText').textContent = '이 기기에서는 쓸 수 없어요: ' + st.msg; $('#wlProg').hidden = false; updateAiPill(); return; }
        WEB.load(sel).then(function () { AI.probe().then(updateAiPill); }, function (err) { paintWebSetup(); toast('무료 AI를 켜지 못했어요: ' + String(err && err.message || err).slice(0, 60), 4200); });
        paintWebSetup(); updateAiPill();
      });
    }
    if (act === 'remove') {
      if (!confirm(modelName(sel) + ' 모델을 이 기기에서 지울까요? 다시 쓰려면 또 내려받아야 해요.')) return;
      WEB.remove(sel).then(function () { cached[sel] = false; AI.probe().then(updateAiPill); paintModels(); paintWebSetup(); toast('이 기기에서 지웠어요'); });
    }
  };
}
function paintWebSetup() {
  if (modal.hidden || !mcard.classList.contains('websetup') || !openAiSetup.sel) return;
  var sel = openAiSetup.sel(), w = WEB.state(), cached = openAiSetup.cached || {};
  var prog = $('#wlProg'), btns = $('#wlBtns'); if (!prog || !btns) return;
  var readyThis = w.ready && w.model === sel, loadingThis = w.loading && w.loadingModel === sel;
  prog.hidden = !(loadingThis || w.error);
  if (loadingThis) { $('#wlBar').style.width = Math.round(w.progress * 100) + '%'; $('#wlText').textContent = Math.round(w.progress * 100) + '% · ' + String(w.text || '').slice(0, 90); }
  else if (w.error) { $('#wlBar').style.width = '0%'; $('#wlText').textContent = '오류: ' + w.error.slice(0, 120); }
  if (readyThis) btns.innerHTML = '<span class="ai-on">✨ 켜져 있어요 · ' + esc(modelName(sel)) + '</span><button class="ghost" data-act="close">닫기</button><button class="ghost danger" data-act="remove">이 기기에서 지우기</button>';
  else if (loadingThis) btns.innerHTML = '<button class="primary big" data-act="hide">숨기고 계속 놀기 ▶</button>';
  else btns.innerHTML = '<button class="primary big" data-act="load" data-autofocus>' + (cached[sel] ? '바로 켜기 ✨' : '내려받고 켜기 (약 ' + modelInfo(sel).gb + 'GB)') + '</button><button class="ghost" data-act="close">나중에</button>' + (cached[sel] ? '<button class="ghost danger" data-act="remove">이 기기에서 지우기</button>' : '');
}
/* 이 기기에 모델이 이미 저장돼 있으면, 내려받기 없이 조용히 켭니다 */
function autoLoadWeb() {
  var c = AI.loadCfg();
  if (!c.enabled || c.provider !== 'webllm') return;
  WEB.supported().then(function (s) {
    if (!s.ok) return;
    WEB.cached(c.model).then(function (y) { if (y) WEB.load(c.model).then(function () { AI.probe().then(updateAiPill); }, function () {}); });
  });
}
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
$('#aiPill').addEventListener('click', function () { SFX.init(); onAiButton(); });
$('#btnAI').addEventListener('click', function () { SFX.init(); onAiButton(); });
$('#btnStart').addEventListener('click', function () {
  SFX.init(); SFX.click(); TTS.pick();
  $('#start').hidden = true; $('#hud').hidden = false; $('#fabs').hidden = false;
  if (world) world.setAvatar(AVATARS[state.avatar]);
  if (pref('gq.bgm', '1') === '1') SFX.bgm(true);
  updateHUD(); checkUnlocks();
  if (!checkHomework()) {
    var anyDone = ZONES.some(function (z) { return state.zones[z.id].cleared; });
    setTimeout(function () { if (modal.hidden) { if (!anyDone) openEarth(); else toast('어서 와! 남은 마을 친구들이 기다리고 있어요'); } }, 700);
  }
  var h = $('#hint'); h.hidden = false; setTimeout(function () { h.hidden = true; }, 9000);
  refreshTalk();
});
$('#fabBear').addEventListener('click', function () { SFX.init(); SFX.click(); openBear(); });
$('#fabWear').addEventListener('click', function () { SFX.init(); SFX.click(); openWardrobe(); });
$('#fabPhoto').addEventListener('click', function () { SFX.init(); openPhoto(); });
$('#fabJump').addEventListener('click', function () { SFX.init(); if (world) world.jump(); });
$('#btnMenu').addEventListener('click', function () { SFX.init(); openMenu(); });
$('#btnSound').addEventListener('click', function () { SFX.init(); SFX.setMuted(!SFX.muted()); if (SFX.muted()) TTS.stop(); updateSoundBtn(); });
updateSoundBtn();
renderStart();
reprobe();
autoLoadWeb();

/* ------------------------------------------------------------
   3D 시작
   ------------------------------------------------------------ */
function boot() {
  try {
    world = window.GQWorld.create($('#c'), {
      onNear: function (t) { nearT = t; refreshTalk(); },
      onTalk: function (t) { if (!modal.hidden || !$('#start').hidden) return; onTalk(t); },
      onUserGesture: function () { SFX.init(); },
      onSeed: function (id) { onSeed(id); },
      onJump: function () { SFX.boing(); }
    });
  } catch (e) {
    var n = $('#nogl'); n.textContent = '이 브라우저에서는 3D 화면을 열 수 없어요. 최신 크롬·엣지·사파리에서 열어 주세요. (' + e.message + ')'; n.hidden = false; return;
  }
  window.__gqWorld = world;
  world.setHat(state.hat || 'none');
  world.setAvatar(AVATARS[state.avatar]);
  world.seedsTaken(state.seeds);
  setInterval(function () { if (QUEST && QUEST.target === 'seed') world.setGuide(world.nextSeed()); }, 1500); // 씨앗 안내는 가장 가까운 씨앗으로 계속 바꿈
  ZONES.forEach(function (z) { var st = state.zones[z.id]; if (st.cleared) world.clearZone(z.id, true); else if (st.partial) world.removeSmog(z.id, st.partial); });
  updateHUD(true);
  if (state.finale) world.celebrate();
}
if (window.THREE) boot(); else addEventListener('three-ready', boot, { once: true });
})();
