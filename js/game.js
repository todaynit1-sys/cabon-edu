/*! 체험관 — 게임 진행 · 화면 (팩으로 꾸며지고, 학생 체험 화면에서는 AI를 쓰지 않습니다)
 *
 *  흐름: 시작(학년·캐릭터·체험관 고르기) → 3D 마을 → 친구에게 가서 '체험하기' → 노란 화살표를 따라 직접 해 보기
 *        → 마을이 깨끗해짐 → 네 마을을 다 마치면 무지개 + 숙제 + 수료증 → 다음에 "숙제 해 봤어?"
 *  배움터(📚): 팩에 미리 담긴(메이커에서 AI가 만들고 담당자가 승인한) 수업·문제·오답 설명을 읽기만 합니다.
 */
(function () {
'use strict';

var $ = function (s, r) { return (r || document).querySelector(s); };
var TX = window.GQText, esc = TX.esc, josa = TX.josa;
var PK = window.GQPack, GRADES = PK.GRADES, AE = PK.ANIMAL_EMOJI;
var P = null, ZONES = [], ZMAP = {}, CARD = {}, BANK = [], ACTIONS = [], CARD_IDX = null;
var world = null, state = null, SAVE_KEY = 'gq.state';

/* ------------------------------------------------------------
   저장
   ------------------------------------------------------------ */
function freshState() {
  var z = {}; ZONES.forEach(function (x) { z[x.id] = { partial: 0, cleared: false, stars: 0, plays: 0, spots: {} }; });
  return { grade: 1, look: null, zones: z, seen: {}, homework: null, sprouts: 0, finale: false, name: '', seeds: {}, games: {}, hat: 'none', unlocked: {}, tips: false, learned: {}, activeMission: null };
}
function loadState() {
  state = freshState();
  try { var saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (saved && saved.zones) state = Object.assign(freshState(), saved); } catch (e) {}
  ['seeds', 'games', 'unlocked', 'learned', 'seen'].forEach(function (k) { if (!state[k] || typeof state[k] !== 'object') state[k] = {}; });
  ZONES.forEach(function (z) { if (!state.zones[z.id]) state.zones[z.id] = { partial: 0, cleared: false, stars: 0, plays: 0, spots: {} }; if (!state.zones[z.id].spots) state.zones[z.id].spots = {}; });
  var g = +localStorage.getItem('gq.grade'); if (g >= 0 && g <= 3) state.grade = g;
  try { var lk = JSON.parse(localStorage.getItem('gq.look') || 'null'); if (lk && typeof lk === 'object') state.look = lk; } catch (e) {}
  state.look = okLook(state.look || PRESETS[2][1]);
}
function save() { var keys = Object.keys(state.seen); if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(function (k) { delete state.seen[k]; }); try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); localStorage.setItem('gq.grade', state.grade); localStorage.setItem('gq.look', JSON.stringify(state.look)); } catch (e) {} }
function pref(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
function setPref(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function level() { return GRADES[state.grade].level; }

/* ------------------------------------------------------------
   소리 · 읽어 주기
   ------------------------------------------------------------ */
var SFX = (function () {
  var ctx = null, master = null, muted = pref('gq.mute', '0') === '1';
  function init() { if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; } var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination); }
  function tone(f, o) { if (!ctx || muted) return; o = o || {}; var t = ctx.currentTime + (o.delay || 0), osc = ctx.createOscillator(), g = ctx.createGain(); osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t); osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2 || f), t + (o.dur || 0.12)); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.12)); osc.connect(g).connect(master); osc.start(t); osc.stop(t + (o.dur || 0.12) + 0.05); }
  var bgmOn = false, bgmTimer = 0, step = 0, CH = [[523, 659, 784], [440, 523, 659], [349, 440, 523], [392, 494, 587]], MEL = [784, 659, 784, 880, 784, 659, 587, 659, 523, 587, 659, 784, 698, 659, 587, 523];
  function bgmTick() { if (!bgmOn || !ctx || muted || document.hidden) return; var c = CH[Math.floor(step / 8) % CH.length]; if (step % 8 === 0) c.forEach(function (f) { tone(f / 2, { dur: 2.2, type: 'sine', vol: 0.018 }); }); if (step % 2 === 0) tone(MEL[(step / 2) % MEL.length], { dur: 0.5, type: 'triangle', vol: 0.028 }); step++; }
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
    bgm: function (v) { if (v === undefined) return bgmOn; bgmOn = !!v; clearInterval(bgmTimer); if (bgmOn) bgmTimer = setInterval(bgmTick, 330); },
    muted: function () { return muted; },
    setMuted: function (m) { muted = m; setPref('gq.mute', m ? '1' : '0'); if (master) master.gain.value = m ? 0 : 0.5; }
  };
})();
var TTS = {
  on: pref('gq.tts', '1') === '1', voice: null,
  pick: function () { if (!('speechSynthesis' in window)) return; var vs = speechSynthesis.getVoices(); this.voice = vs.find(function (v) { return /ko/i.test(v.lang) && /Google|SunHi|Heami|Yuna|InJoon/i.test(v.name); }) || vs.find(function (v) { return /ko/i.test(v.lang); }) || null; },
  speak: function (text, who) {
    if (!this.on || !('speechSynthesis' in window) || SFX.muted()) return;
    var t = String(text || '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/○○/g, '동그라미').trim(); if (!t) return;
    speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(t); u.lang = 'ko-KR'; if (this.voice) u.voice = this.voice; u.rate = state.grade === 0 ? 0.92 : 1.0; u.pitch = who === 'bear' ? 1.35 : who === 'friend' ? 1.22 : 1.1; speechSynthesis.speak(u);
  },
  stop: function () { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
};
if ('speechSynthesis' in window) { TTS.pick(); speechSynthesis.onvoiceschanged = function () { TTS.pick(); }; }

/* ------------------------------------------------------------
   모달 · 토스트 · 말풍선
   ------------------------------------------------------------ */
var modal = $('#modal'), mcard = $('#mcard'), modalClose = null;
function openModal(html, o) {
  o = o || {}; mcard.className = 'mcard ' + (o.cls || ''); mcard.innerHTML = html; modal.hidden = false; modalClose = o.onClose || null;
  if (world) world.pause(true); $('#btnTalk').hidden = true;
  requestAnimationFrame(function () { var b = mcard.querySelector('[data-autofocus]') || mcard.querySelector('button.primary, button'); if (b) b.focus({ preventScroll: true }); });
}
function closeModal() { modal.hidden = true; mcard.innerHTML = ''; TTS.stop(); if (world) { world.pause(false); world.focus(null); } var f = modalClose; modalClose = null; if (f) f(); refreshTalk(); }
modal.addEventListener('click', function (e) { if (e.target === modal && !mcard.classList.contains('locked')) closeModal(); });
addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden && !mcard.classList.contains('locked')) closeModal(); });
var toastT = 0;
function toast(msg, ms) { var t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, ms || 2800); }
var sayT = 0;
function showSay(zone, text, ms) {
  var z = ZMAP[zone], el = $('#say');
  el.innerHTML = '<span class="ava" style="--zc:' + (z ? z.color : P.mascot.color) + '">' + (z ? AE[z.animal] : AE[P.mascot.animal]) + '</span><div><b>' + esc(z ? z.friend : P.mascot.name) + '</b><p>' + esc(text) + '</p></div>';
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); clearTimeout(sayT); sayT = setTimeout(function () { el.hidden = true; }, ms || 7000); TTS.speak(text, 'friend');
}
$('#say').addEventListener('click', function () { this.hidden = true; });
function confetti(n) {
  var box = document.createElement('div'); box.className = 'confetti'; document.body.appendChild(box); var C = ['#ff8fab', '#ffd166', '#8fd3ff', '#7fcd6b', '#b8a1ff'];
  for (var i = 0; i < n; i++) { var p = document.createElement('i'); p.style.left = (Math.random() * 100) + '%'; p.style.background = C[i % C.length]; p.style.animationDelay = (Math.random() * 0.25) + 's'; p.style.animationDuration = (0.9 + Math.random() * 0.8) + 's'; p.style.setProperty('--dx', ((Math.random() - 0.5) * 160) + 'px'); p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg'); box.appendChild(p); }
  setTimeout(function () { box.remove(); }, 2000);
}

/* ------------------------------------------------------------
   별 · 씨앗 · 꾸미기
   ------------------------------------------------------------ */
function missionStars() { return ZONES.reduce(function (s, z) { return s + (state.zones[z.id].cleared ? 3 : 0); }, 0); }
function quizStars() { return ZONES.reduce(function (s, z) { return s + (state.zones[z.id].stars || 0); }, 0); }
function gameStars() { return ZONES.reduce(function (s, z) { return s + ((state.games[z.id] || {}).stars || 0); }, 0); }
function totalStars() { return missionStars() + quizStars() + gameStars(); }
function seedCount() { return Object.keys(state.seeds || {}).length; }
var SEED_TOTAL = 12;
var HATS = [{ id: 'none', icon: '🙂', name: '모자 없음', need: 0 }, { id: 'sprout', icon: '🌱', name: '새싹 머리띠', need: 3 }, { id: 'bear', icon: '🐻‍❄️', name: '북극곰 귀', need: 8 }, { id: 'flower', icon: '🌼', name: '꽃 화관', need: 14 }, { id: 'earth', icon: '🌏', name: '아기 지구 모자', need: 20 }, { id: 'crown', icon: '👑', name: '반짝 별 왕관', seeds: SEED_TOTAL }];
function hatOpen(h) { return h.seeds ? seedCount() >= h.seeds : totalStars() >= h.need; }
function checkUnlocks() { var fresh = HATS.filter(function (h) { return h.id !== 'none' && hatOpen(h) && !state.unlocked[h.id]; }); fresh.forEach(function (h) { state.unlocked[h.id] = 1; }); if (fresh.length) { save(); setTimeout(function () { SFX.fanfare(); toast('🎁 새 꾸미기가 열렸어요: ' + fresh.map(function (h) { return h.icon + ' ' + h.name; }).join(', ') + ' — 👕 꾸미기에서 써 봐요!', 4200); }, 900); } }
function onSeed(id) {
  if (state.seeds[id]) return; state.seeds[id] = 1; save();
  var n = seedCount(), c = CARD[P.seeds[(n - 1) % P.seeds.length]]; SFX.seed();
  if (n >= SEED_TOTAL) { toast('🌰 반짝 씨앗을 모두 모았어요! 👑 반짝 별 왕관이 열렸어요!', 4500); SFX.fanfare(); if (world) world.cheer(); }
  else toast('🌰 반짝 씨앗 ' + n + '/' + SEED_TOTAL + ' · 알고 있니? ' + (c ? TX.sentences(c.text)[0] : ''), 4200);
  updateHUD(); checkUnlocks();
}

/* ------------------------------------------------------------
   HUD · 다음 할 일
   ------------------------------------------------------------ */
function cleanLevel() { var s = 0; ZONES.forEach(function (z) { var st = state.zones[z.id]; s += st.cleared ? 1 : (missionDoneCount(z.id) / Math.max(1, missionTotal(z.id))) * 0.8; }); return s / ZONES.length; }
function feverInfo(k) { var S = P.hub.states; if (k >= 0.999) return { face: '🥰', text: S.cool, cls: 'cool' }; if (k >= 0.62) return { face: '🙂', text: S.mild, cls: 'mild' }; if (k >= 0.3) return { face: '😓', text: S.warm, cls: 'warm' }; return { face: '🥵', text: S.hot, cls: 'hot' }; }
function updateHUD(instant) {
  var k = cleanLevel(), f = feverInfo(k);
  $('#feverFace').textContent = f.face; $('#feverText').textContent = f.text; $('#meterName').textContent = P.hub.meter; $('#feverBar').style.width = Math.round((1 - k) * 100) + '%'; $('#hud .fever').className = 'fever card ' + f.cls;
  $('#stamps').innerHTML = ZONES.map(function (z) { var st = state.zones[z.id]; return '<button class="stamp-slot ' + (st.cleared ? 'done' : '') + '" data-walk="' + z.id + '" style="--zc:' + z.color + '" title="' + esc(z.name) + '"><span>' + z.icon + '</span><small>' + esc(z.short) + '</small>' + (st.cleared ? '<i>✓</i>' : '') + '</button>'; }).join('') +
    '<span class="counter" title="모은 별">⭐<b>' + totalStars() + '</b></span><span class="counter" title="반짝 씨앗">🌰<b>' + seedCount() + '/' + SEED_TOTAL + '</b></span>' + (state.sprouts ? '<span class="counter" title="실천 새싹">🌱<b>' + state.sprouts + '</b></span>' : '');
  var n = spotsDone(); $('#feverSub').textContent = n ? '✅ 실천 ' + n + '개 → ☁️ 걱정 구름 ' + cloudsGone() + '개 사라짐' : '친구들과 직접 체험하면 내려가요';
  if (world) world.setClean(k, instant); updateQuest();
}
/* 실천 → 지구 효과 (체험 하나를 마칠 때마다 "그래서 지구는?"을 눈에 보이게) */
var fxT = 0;
function chainHTML(chain) { return '<div class="chain">' + (chain || []).map(function (c, i) { return (i ? '<i>→</i>' : '') + '<span class="ch">' + esc(c) + '</span>'; }).join('') + '</div>'; }
function spotsDone() { return ZONES.reduce(function (s, z) { return s + missionDoneCount(z.id); }, 0); }
function cloudsGone() { return ZONES.reduce(function (s, z) { var st = state.zones[z.id]; return s + (st.cleared ? 5 : Math.min(5, st.partial || 0)); }, 0); }
function showEffect(zone, d, delta) {
  var z = ZMAP[zone], M = z.mission, el = $('#effect');
  el.innerHTML = '<div class="fx-head"><span>' + M.icon + '</span><b>' + esc(d.act ? d.act.replace(/^\S+\s/, '') : d.label) + '</b> 완료 → 그래서 지구는?</div>' + chainHTML(M.chain) +
    (d.effect ? '<p class="fx-text">' + esc(d.effect) + '</p>' : '') +
    '<div class="fx-meter">🌡️ ' + esc(P.hub.meter) + ' <b>' + (delta > 0 ? '−' + delta + '%' : '곧 내려가요') + '</b> · ☁️ 걱정 구름 ' + cloudsGone() + '개 사라짐 · ✅ 실천 ' + spotsDone() + '개</div>';
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); clearTimeout(fxT); fxT = setTimeout(function () { el.hidden = true; }, 9000);
  if (delta > 0) { var fd = $('#feverDelta'); fd.textContent = '−' + delta + '%'; fd.hidden = false; fd.classList.remove('pop'); void fd.offsetWidth; fd.classList.add('pop'); setTimeout(function () { fd.hidden = true; }, 2600); }
}
$('#effect').addEventListener('click', function () { this.hidden = true; });
function impactHTML() {
  var n = spotsDone(); if (!n) return '';
  var heat = Math.round((1 - cleanLevel()) * 100);
  return '<div class="impact"><b>📊 네 실천이 만든 변화</b><div class="impact-nums"><span>✅ 실천 <b>' + n + '</b>개</span><span>☁️ 걱정 구름 <b>' + cloudsGone() + '</b>개 사라짐</span><span>🌡️ ' + esc(P.hub.meter) + ' 100% → <b>' + heat + '%</b></span></div><ul>' +
    ZONES.filter(function (z) { return missionDoneCount(z.id) > 0; }).map(function (z) { var M = z.mission; return '<li style="--zc:' + z.color + '"><span>' + M.icon + '</span><div><b>' + esc(M.title) + ' ' + missionDoneCount(z.id) + '/' + missionTotal(z.id) + '</b>' + chainHTML(M.chain) + '</div></li>'; }).join('') + '</ul></div>';
}
var QUEST = null;
function computeQuest() {
  var am = state.activeMission;
  if (am && ZMAP[am] && !state.zones[am].cleared) {
    var z = ZMAP[am], M = z.mission, dn = missionDoneCount(am), tot = missionTotal(am), tpl = z.template;
    var hint = tpl === 'sort' ? (carrying ? '분리수거함으로 가져가기' : '떨어진 물건 줍기') : tpl === 'ride' ? ((state.zones[am].spots[M.spots[0].id]) ? '노란 고리 지나가기' : M.vehicle + ' 타기') : '반짝이는 화살표 찾아가기';
    return { ico: M.icon, txt: M.title + ' ' + dn + '/' + tot + ' · ' + hint, target: 'spot', go: '길 안내' };
  }
  var next = ZONES.find(function (z) { return !state.zones[z.id].cleared; });
  if (next) return { ico: next.mission.icon, txt: next.friend + '와 ' + next.mission.title + ' 체험하기', target: next.id, go: '데려다줘' };
  if (!state.finale) return { ico: '🌏', txt: P.hub.name + '에게 가 보기', target: 'earth', go: '데려다줘' };
  if (seedCount() < SEED_TOTAL) return { ico: '🌰', txt: '반짝 씨앗 찾기 ' + seedCount() + '/' + SEED_TOTAL, target: 'seed', go: '가까운 씨앗' };
  var g = ZONES.find(function (z) { return !(state.games[z.id] || {}).stars || state.games[z.id].stars < 3; });
  if (g) return { ico: '🎮', txt: g.friend + '네 놀이에서 별 3개 받기', target: g.id, go: '데려다줘' };
  return { ico: '🏆', txt: '모두 해냈어요! 친구들과 또 놀아요', target: null, go: '' };
}
function updateQuest() {
  QUEST = computeQuest(); $('#questIco').textContent = QUEST.ico; $('#questTxt').textContent = QUEST.txt; $('#questGo').textContent = QUEST.go ? QUEST.go + ' ▶' : ''; $('#questGo').hidden = !QUEST.go;
  if (world) world.setGuide(QUEST.target === 'seed' ? world.nextSeed() : QUEST.target === 'spot' ? world.nextSpot(state.activeMission) : QUEST.target);
}
$('#quest').addEventListener('click', function () {
  if (!QUEST || !world || !QUEST.target) return; SFX.click();
  if (QUEST.target === 'spot') { var sp = world.nextSpot(state.activeMission); if (sp) { world.walkToPos(sp, 1.2); world.setGuide(sp); } return; }
  if (QUEST.target === 'seed') { var p = world.nextSeed(); if (p) { world.walkToPos(p); world.setGuide(p); toast('🌰 반짝 씨앗을 찾으러 가요!'); } return; }
  world.walkTo(QUEST.target);
});
$('#stamps').addEventListener('click', function (e) { var b = e.target.closest('[data-walk]'); if (!b || !world) return; SFX.click(); world.walkTo(b.dataset.walk); toast(ZMAP[b.dataset.walk].friend + '에게 걸어가요!'); });

/* ------------------------------------------------------------
   말 걸기 버튼
   ------------------------------------------------------------ */
var nearT = null;
function refreshTalk() {
  var b = $('#btnTalk'); if (!nearT || !modal.hidden || !$('#start').hidden) { b.hidden = true; return; } b.hidden = false;
  if (nearT.type === 'spot') { var d = spotDef(nearT.id); $('#talkLabel').textContent = nearT.kind === 'bins' ? '♻️ 칸에 넣기' : (d && d.act) || '해 보기'; b.classList.add('act'); }
  else { $('#talkLabel').textContent = nearT.name + '와 이야기하기'; b.classList.remove('act'); }
}
$('#btnTalk').addEventListener('click', function () { SFX.click(); if (nearT) onTalk(nearT); });
function onTalk(t) { SFX.init(); SFX.click(); if (t.type === 'friend') openFriend(t.zone); else if (t.type === 'earth') openEarth(); else if (t.type === 'mascot') openBear(); else if (t.type === 'spot') handleSpot(t); }

/* ------------------------------------------------------------
   마을 체험
   ------------------------------------------------------------ */
var carrying = null;
function missionTotal(zone) { return ZMAP[zone].mission.spots.length; }
function missionDoneCount(zone) { var d = state.zones[zone].spots || {}; return ZMAP[zone].mission.spots.filter(function (s) { return d[s.id]; }).length; }
function spotDef(id) { var f = null; ZONES.forEach(function (z) { z.mission.spots.forEach(function (s) { if (s.id === id) f = Object.assign({ zone: z.id }, s); }); }); return f; }
function binName(zone, id) { var b = (ZMAP[zone].mission.bins || []).find(function (x) { return x.id === id; }); return b ? b.name : id; }
function friendHead(z) { return '<div class="who" style="--zc:' + z.color + '"><span class="ava">' + AE[z.animal] + '</span><div><b>' + esc(z.friend) + '</b><small>' + esc(z.name) + '</small></div></div>'; }
function openFriend(zone) {
  var z = ZMAP[zone], st = state.zones[zone], M = z.mission, cleared = st.cleared, G = window.GQGames.meta(z), gs = state.games[zone] || {}, doing = state.activeMission === zone, dn = missionDoneCount(zone);
  if (world) world.focus(zone);
  var line = cleared ? '고마워! 덕분에 우리 마을이 깨끗해졌어. 놀이도 하고, 배운 걸 문제로 확인해 볼래?' : doing ? M.title + ' 체험 중이야! 지금 ' + dn + '/' + missionTotal(zone) + '개 했어. 노란 화살표를 따라가 봐!' : z.greet + ' 우리 마을에서 ' + M.title + ' 체험을 해 볼래?';
  var stars = function (n) { return '<em class="minis">' + [0, 1, 2].map(function (i) { return i < n ? '★' : '☆'; }).join('') + '</em>'; };
  openModal(friendHead(z) + '<p class="say">' + esc(line) + '</p>' +
    '<button class="pick-big mission' + (cleared ? ' done' : '') + '" data-act="mission" data-autofocus><span>' + M.icon + '</span><b>' + (cleared ? '체험 완료 ✓ ' + esc(M.title) : doing ? '계속 체험하기: ' + esc(M.title) : '체험하기: ' + esc(M.title)) + '</b><small>' + (cleared ? '마을이 깨끗해졌어요' : '직접 해 보면 마을이 깨끗해지고 ' + esc(P.hub.meter) + '이 내려가요') + '</small></button>' +
    '<div class="choice2"><button class="pick-big play" data-act="game"><span>' + G.icon + '</span><b>놀이: ' + esc(G.title) + '</b><small>' + (gs.best ? '최고 ' + gs.best + '점 ' + stars(gs.stars || 0) : '30초 동안 신나게!') + '</small></button>' +
    '<button class="pick-big quiz" data-act="quiz"><span>📝</span><b>문제 풀기</b><small>' + (st.stars ? '지난번 별 ' + st.stars + '개' : '배운 걸 확인해요') + '</small></button></div>' +
    '<div class="btns"><button class="ghost" data-act="close">나중에 할래</button></div>', { cls: 'friend' });
  TTS.speak(line, 'friend');
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return; var act = a.dataset.act;
    if (act === 'close') closeModal();
    if (act === 'mission') { SFX.click(); if (cleared) { toast(M.icon + ' 이미 체험을 마쳤어요! 놀이나 문제 풀기를 해 봐요'); return; } if (doing) { closeModal(); updateQuest(); showSay(zone, '노란 화살표를 따라가 봐! ' + dn + '/' + missionTotal(zone) + '개 했어.'); } else startMission(zone); }
    if (act === 'quiz') { SFX.click(); startQuiz(zone); }
    if (act === 'game') { SFX.click(); openGame(zone); }
  };
}
function startMission(zone) {
  var z = ZMAP[zone], M = z.mission;
  openModal(friendHead(z) + '<div class="mission-head"><span>' + M.icon + '</span><b>' + esc(M.title) + ' 체험</b></div><p class="say">' + esc(M.intro) + '</p>' +
    '<ol class="mission-steps">' + M.spots.filter(function (s, i) { return !s.ring || i === M.spots.length - 1; }).map(function (s) { return '<li>' + esc(s.act ? s.act.replace(/^\S+\s/, '') : s.label) + '</li>'; }).join('') + '</ol>' +
    '<div class="btns"><button class="primary big" data-act="go" data-autofocus>체험 시작! ▶</button><button class="ghost" data-act="close">나중에</button></div>', { cls: 'friend' });
  TTS.speak(M.intro, 'friend');
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'close') closeModal();
    if (a.dataset.act === 'go') {
      SFX.click(); closeModal();
      if (carrying && state.activeMission && state.activeMission !== zone && world) { world.dropCarried(carrying); carrying = null; }
      if (state.activeMission && ZMAP[state.activeMission] && ZMAP[state.activeMission].template === 'ride' && zone !== state.activeMission && world) world.bike(false);
      state.activeMission = zone; save(); if (world) world.missionOn(zone);
      if (z.template === 'ride' && state.zones[zone].spots[M.spots[0].id] && world) world.bike(true);
      updateHUD();
      showSay(zone, z.template === 'sort' ? '바닥에 떨어진 물건을 찾아 가까이 가 봐! 노란 화살표가 알려 줄 거야.' : z.template === 'ride' ? '정류장 옆에 있는 ' + M.vehicle + josa(M.vehicle, '으로', '로') + ' 가 봐!' : '노란 화살표가 떠 있는 곳으로 가면 아래에 버튼이 생겨. 눌러서 직접 해 봐!');
    }
  };
}
function handleSpot(t) {
  var d = spotDef(t.id), zone = t.zone, z = ZMAP[zone];
  if (t.kind === 'trash') { if (carrying) { if (carrying !== t.id) showSay(zone, '손에 든 걸 먼저 칸에 넣고 오자!', 3500); return; } carrying = t.id; if (world) world.carry(t.id); SFX.pop(); showSay(zone, d.label + josa(d.label, '을', '를') + ' 주웠어! 분리수거함으로 가져가서 알맞은 칸에 넣어 줘.', 4500); updateQuest(); return; }
  if (t.kind === 'bins') { if (carrying) openSort(zone); else showSay(zone, '먼저 떨어진 물건을 주워 와!', 3000); return; }
  if (d && d.ask) { openAsk(zone, d); return; }
  if (t.kind === 'bike') { if (world) world.bike(true); SFX.boing(); }
  completeSpot(zone, t.id);
  if (z.template === 'ride' && t.id === z.mission.spots[z.mission.spots.length - 1].id && world) world.bike(false);
}
function completeSpot(zone, id) {
  var st = state.zones[zone]; if (st.spots[id]) return; var k0 = cleanLevel(); st.spots[id] = 1;
  var d = spotDef(id); if (world) world.spotDone(id);
  if (!st.cleared) { var before = st.partial; st.partial = Math.min(5, Math.max(st.partial, Math.round(missionDoneCount(zone) / missionTotal(zone) * 5))); for (var k = before; k < st.partial; k++) if (world) world.popSmog(zone); }
  save(); SFX.correct(); if (world) world.cheer(); showSay(zone, d.say, 8000); updateHUD(); showEffect(zone, d, Math.round((cleanLevel() - k0) * 100));
  if (missionDoneCount(zone) >= missionTotal(zone) && !st.cleared) setTimeout(function () { missionComplete(zone); }, 2600);
}
function openAsk(zone, d) {
  var A = d.ask;
  openModal('<div class="who" style="--zc:' + ZMAP[zone].color + '"><span class="ava">' + (d.act ? d.act.split(' ')[0] : '❓') + '</span><div><b>' + esc(d.label) + '</b><small>' + esc(d.act || '골라 보기') + '</small></div></div>' +
    '<p class="say">' + esc(A.q) + '</p><div class="temps" style="grid-template-columns:repeat(' + Math.min(4, A.options.length) + ',1fr)">' + A.options.map(function (o, i) { return '<button class="pk temp" data-i="' + i + '">' + esc(o) + '</button>'; }).join('') + '</div><p class="fine" id="askMsg"></p>', { cls: 'friend' });
  TTS.speak(A.q, 'friend');
  mcard.onclick = function (e) {
    var b = e.target.closest('[data-i]'); if (!b) return; var i = +b.dataset.i;
    if (i === +A.answer) { SFX.correct(); closeModal(); completeSpot(zone, d.id); }
    else { SFX.wrong(); b.classList.add('shake'); setTimeout(function () { b.classList.remove('shake'); }, 400); $('#askMsg').textContent = (i < +A.answer && A.low) || (i > +A.answer && A.high) || A.wrong || '음… 다시 골라 볼까?'; }
  };
}
function openSort(zone) {
  var d = spotDef(carrying), B = ZMAP[zone].mission.bins;
  openModal('<div class="who" style="--zc:' + ZMAP[zone].color + '"><span class="ava">♻️</span><div><b>' + esc(d.label) + josa(d.label, '은', '는') + ' 어디에?</b><small>알맞은 칸을 눌러 넣어요</small></div></div>' +
    '<div class="sortbins" style="grid-template-columns:repeat(' + B.length + ',1fr)">' + B.map(function (b, i) { return '<button class="bin bin-' + (i % 6) + '" data-b="' + esc(b.id) + '"><span>' + b.icon + '</span><small>' + esc(b.name) + '</small></button>'; }).join('') + '</div><p class="fine" id="sortMsg"></p><div class="btns"><button class="ghost" data-act="close">조금 이따가</button></div>', { cls: 'friend' });
  TTS.speak(d.label + josa(d.label, '은', '는') + ' 어디에 넣을까?', 'friend');
  mcard.onclick = function (e) {
    if (e.target.closest('[data-act="close"]')) { closeModal(); return; }
    var b = e.target.closest('[data-b]'); if (!b) return;
    if (b.dataset.b === d.bin) { var id = carrying; carrying = null; if (world) { world.carry(null); world.binsBurst(zone); } closeModal(); completeSpot(zone, id); }
    else { SFX.wrong(); b.classList.add('shake'); setTimeout(function () { b.classList.remove('shake'); }, 400); var c = CARD[d.ev]; $('#sortMsg').textContent = d.label + josa(d.label, '은', '는') + ' ' + binName(zone, b.dataset.b) + ' 칸이 아니야. 다시 골라 볼래?' + (c ? ' (힌트: ' + c.title + ')' : ''); }
  };
}
function missionComplete(zone) {
  var z = ZMAP[zone], M = z.mission, st = state.zones[zone], first = !st.cleared;
  st.cleared = true; st.partial = 5; state.activeMission = null; save(); if (world) world.missionOn(null);
  SFX.fanfare(); confetti(40);
  var G = window.GQGames.meta(z), next = '';
  var learned = M.spots.map(function (s) { var ss = TX.sentences(s.say).filter(function (x) { return x.replace(/[^가-힣]/g, '').length >= 8; }); return ss[0] || s.say; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).slice(0, 5);
  openModal('<div class="clear-top" style="--zc:' + z.color + '"><div class="big-stamp">' + M.icon + '<i>✓</i></div><h2>' + esc(M.title) + ' 체험 완료!</h2><div class="stars"><i>★</i><i>★</i><i>★</i></div></div><p class="say">' + esc(z.cleared) + '</p>' +
    '<div class="learned"><b>📒 오늘 체험하며 배운 것</b><ul>' + learned.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>' +
    '<div class="sowhat"><b>🌍 그래서 지구는?</b>' + chainHTML(M.chain) + '</div>' +
    '<div class="btns"><button class="primary big" data-act="close" data-autofocus>마을 구경하기 👀</button><button class="ghost" data-act="quiz">📝 문제로 확인하기</button><button class="ghost" data-act="game">' + G.icon + ' 놀이</button></div>', {
    cls: 'clear', onClose: function () {
      if (world) world.clearZone(zone); updateHUD(); checkUnlocks();
      if (next === 'quiz') { setTimeout(function () { startQuiz(zone); }, 350); return; }
      if (next === 'game') { setTimeout(function () { openGame(zone); }, 350); return; }
      if (first && ZONES.every(function (x) { return state.zones[x.id].cleared; }) && !state.finale) setTimeout(openFinale, 2600);
      else if (first) toast('다음 마을 친구에게 가 볼까요? 왼쪽 위 "다음 할 일"을 누르면 데려다줘요!', 3600);
    }
  });
  TTS.speak(M.title + ' 체험 완료! ' + z.cleared, 'friend');
  mcard.onclick = function (e) { var a = e.target.closest('[data-act]'); if (!a) return; next = a.dataset.act === 'close' ? '' : a.dataset.act; closeModal(); };
}

/* ------------------------------------------------------------
   놀이
   ------------------------------------------------------------ */
var stopGame = null;
function openGame(zone) {
  var z = ZMAP[zone];
  openModal('', { cls: 'mg locked', onClose: function () { if (stopGame) { stopGame(); stopGame = null; } } });
  stopGame = window.GQGames.start(z, mcard, { sfx: SFX, hub: P.hub, best: (state.games[zone] || {}).best || 0, speak: function (t) { TTS.speak(t, 'friend'); },
    onEnd: function (r) { var g = state.games[zone] || { best: 0, stars: 0, plays: 0 }; g.plays = (g.plays || 0) + 1; g.best = Math.max(g.best || 0, r.score); g.stars = Math.max(g.stars || 0, r.stars); state.games[zone] = g; save(); updateHUD(); checkUnlocks(); if (world) world.cheer(); },
    onQuit: function () { stopGame = null; closeModal(); toast(z.friend + ': 또 놀자! ' + window.GQGames.meta(z).icon); } });
}

/* ------------------------------------------------------------
   문제 풀기 (팩에 담긴 문제 · 오답 설명)
   ------------------------------------------------------------ */
var Q = null;
function pickQuestions(zone, n, avoid) {
  var lv = level(); avoid = avoid || {};
  var pool = BANK.filter(function (b) { return b.zone === zone && !avoid[b.id]; });
  var score = function (b) { var s = Math.random(); if (b.level === lv) s += 2; else if (Math.abs(b.level - lv) === 1) s += 1; if (state.grade === 0 && b.type === 'ox') s += 1.2; if (!state.seen[b.id]) s += 3; return s; };
  var picked = pool.map(function (b) { return { b: b, s: score(b) }; }).sort(function (a, b) { return b.s - a.s; }).slice(0, n).map(function (x) { return x.b; });
  var ox = picked.filter(function (i) { return i.type === 'ox'; }), ch = picked.filter(function (i) { return i.type !== 'ox'; }), out = [];
  while (ox.length || ch.length) { if (ox.length) out.push(ox.shift()); if (ch.length) out.push(ch.shift()); }
  return out;
}
function startQuiz(zone) {
  var items = pickQuestions(zone, 5);
  if (!items.length) { toast('이 마을에는 아직 문제가 없어요'); return; }
  if (world) world.focus(zone);
  openModal('', { cls: 'friend locked' });
  Q = { zone: zone, items: items, i: 0, correct: 0, cur: null, streak: 0 }; state.zones[zone].plays++;
  renderQ(items[0]);
}
function dots() { return '<div class="dots">' + Q.items.map(function (_, i) { return '<i class="' + (i < Q.i ? 'done' : i === Q.i ? 'now' : '') + '"></i>'; }).join('') + '</div>'; }
function evBox(it) { var c = CARD[it.ev]; if (!c) return ''; return '<div class="evbox" hidden><b>📄 어디서 나온 말이야? — ' + esc(c.title) + '</b><p>' + esc(c.text) + '</p><small>' + (P.meta.model ? '✨ 메이커에서 AI가 만들고 담당자가 승인한 문제' : '📗 담당자가 검수한 문제') + ' · 근거 카드 ' + esc(c.id) + '</small></div>'; }
function renderQ(it) {
  Q.cur = it; var z = ZMAP[Q.zone];
  var opts = it.type === 'ox' ? '<div class="ox"><button class="opt o" data-a="O"><span>O</span>맞아요</button><button class="opt x" data-a="X"><span>X</span>아니에요</button></div>'
    : '<div class="choices">' + it.options.map(function (o, i) { return '<button class="opt c" data-a="' + i + '"><span>' + (i + 1) + '</span>' + esc(o) + '</button>'; }).join('') + '</div>';
  mcard.innerHTML = '<div class="qtop">' + friendHead(z) + dots() + '<button class="mini" data-act="quit" aria-label="그만하기">✕</button></div>' + (it.retry ? '<div class="retry-tag">🔁 비슷한 문제 한 번 더!</div>' : '') +
    '<div class="qbox"><p class="q">' + esc(it.q) + '</p><button class="mini speak" data-act="read" aria-label="문제 다시 듣기">🔊</button></div>' + opts + '<div class="qfoot"><button class="src bank" data-act="ev">📄 근거 보기</button></div>' + evBox(it) + '<div class="fb" hidden></div>';
  readQ(it); mcard.onclick = onQuizClick;
}
function readQ(it) { TTS.speak(it.q + (it.type === 'choice' ? ' ' + it.options.map(function (o, i) { return (i + 1) + '번, ' + o; }).join('. ') : ' 맞으면 오, 아니면 엑스!'), 'friend'); }
function onQuizClick(e) {
  var a = e.target.closest('[data-act],[data-a]'); if (!a) return;
  if (a.dataset.a != null && !a.disabled) { answer(a.dataset.a); return; }
  var act = a.dataset.act;
  if (act === 'read') readQ(Q.cur);
  if (act === 'ev') { var b = mcard.querySelector('.evbox'); if (b) b.hidden = !b.hidden; }
  if (act === 'quit') { if (confirm('문제 풀기를 그만할까요?')) { Q = null; closeModal(); } }
  if (act === 'next') next();
  if (act === 'retry') retry();
}
function wrongText(it, chosen) {
  var key = it.type === 'ox' ? chosen : String(chosen);
  var w = it.wrong && (it.wrong[key] || it.wrong[chosen]);
  if (w) return { text: w, ai: true };
  return { text: (it.hint ? it.hint + ' ' : '') + (it.explain || (CARD[it.ev] || {}).text || ''), ai: false };
}
function answer(raw) {
  var it = Q.cur, chosen = it.type === 'ox' ? raw : parseInt(raw, 10), ok = chosen === it.answer;
  mcard.querySelectorAll('.opt').forEach(function (b) { b.disabled = true; var v = it.type === 'ox' ? b.dataset.a : parseInt(b.dataset.a, 10); if (v === it.answer) b.classList.add('right'); else if (v === chosen) b.classList.add('wrong'); });
  state.seen[it.id] = 1;
  var fb = mcard.querySelector('.fb'); fb.hidden = false;
  if (ok) {
    SFX.correct(); Q.correct++; Q.streak++; confetti(Q.streak >= 3 ? 36 : 18); save(); if (world) world.cheer();
    fb.className = 'fb good'; fb.innerHTML = '<b class="big">딩동댕! 🎉' + (Q.streak >= 2 ? ' <span class="combo">🔥 ' + Q.streak + '연속 정답!</span>' : '') + '</b><p>' + esc(it.explain) + '</p><div class="btns"><button class="primary big" data-act="next" data-autofocus>' + (isLast() ? '결과 보기 ⭐' : '다음 문제 ▶') + '</button></div>';
    TTS.speak('딩동댕! ' + it.explain, 'friend'); fb.querySelector('button').focus();
  } else {
    SFX.wrong(); Q.streak = 0; var w = wrongText(it, chosen), canRetry = !it.retry && BANK.some(function (b) { return b.zone === Q.zone && b.ev === it.ev && b.id !== it.id; });
    fb.className = 'fb oops'; fb.innerHTML = '<b class="big">앗, 아쉬워! 괜찮아 😊</b><div class="bear-say"><span class="ava">' + AE[P.mascot.animal] + '</span><div><p>' + esc(w.text) + '</p>' + (w.ai ? '<small class="aimark">✨ 이 설명은 메이커에서 AI가 네가 고른 답에 맞춰 미리 써 두고, 담당자가 확인한 거예요</small>' : '') + '</div></div>' +
      '<div class="btns">' + (canRetry ? '<button class="primary big" data-act="retry" data-autofocus>비슷한 문제 한 번 더! 🔁</button>' : '') + '<button class="' + (canRetry ? 'ghost' : 'primary big') + '" data-act="next">' + (isLast() ? '결과 보기 ⭐' : '다음 문제 ▶') + '</button></div>';
    TTS.speak(w.text, 'bear'); fb.querySelector('button').focus();
  }
}
function isLast() { return Q.i >= Q.items.length - 1; }
function retry() { var it = Q.cur, avoid = {}; Q.items.forEach(function (x) { avoid[x.id] = 1; }); var same = BANK.filter(function (b) { return b.zone === Q.zone && b.ev === it.ev && !avoid[b.id]; }); if (!same.length) { next(); return; } renderQ(Object.assign({}, same[Math.floor(Math.random() * same.length)], { retry: true })); }
function next() { Q.i++; if (Q.i >= Q.items.length) { finishQuiz(); return; } renderQ(Q.items[Q.i]); }
function finishQuiz() {
  var zone = Q.zone, z = ZMAP[zone], st = state.zones[zone], stars = Math.max(1, Math.min(5, Q.correct)), total = Q.items.length, correct = Q.correct, best = stars > (st.stars || 0);
  st.stars = Math.max(st.stars || 0, stars); save(); Q = null; SFX.fanfare(); mcard.classList.remove('locked');
  var M = z.mission, nextAct = '';
  openModal('<div class="clear-top" style="--zc:' + z.color + '"><div class="big-stamp">📝<i>✓</i></div><h2>문제 다 풀었어요!</h2><div class="stars">' + '★★★★★'.slice(0, stars).split('').map(function () { return '<i>★</i>'; }).join('') + '<span class="dim">' + '★★★★★'.slice(stars) + '</span></div></div>' +
    '<p class="say">' + total + '문제 중 ' + correct + '개를 맞혔어요!' + (best ? ' 최고 기록이에요 🎉' : '') + (st.cleared ? '' : ' 이제 ' + M.title + ' 체험으로 직접 해 보면 마을이 깨끗해져요!') + '</p>' +
    '<div class="btns">' + (st.cleared ? '<button class="primary big" data-act="close" data-autofocus>좋아요 👍</button>' : '<button class="primary big" data-act="mission" data-autofocus>' + M.icon + ' 체험하러 가기</button><button class="ghost" data-act="close">닫기</button>') + '</div>', {
    cls: 'clear', onClose: function () { updateHUD(); checkUnlocks(); if (nextAct === 'mission') setTimeout(function () { startMission(zone); }, 350); }
  });
  TTS.speak(total + '문제 중 ' + correct + '개를 맞혔어요!', 'friend');
  mcard.onclick = function (e) { var a = e.target.closest('[data-act]'); if (!a) return; nextAct = a.dataset.act === 'mission' ? 'mission' : ''; closeModal(); };
}

/* ------------------------------------------------------------
   📚 배움터 — 배우기 · 문제 풀기 · 묻기 (모두 팩에서)
   ------------------------------------------------------------ */
function hasAiLessons() { var lv = level(); return Object.keys(P.lessons).some(function (k) { return P.lessons[k][lv] || P.lessons[k][String(lv)]; }); }
function openLearnHub() {
  var madeBy = P.meta.model ? '✨ 이 체험관의 수업·문제는 메이커에서 AI(' + esc(P.meta.model) + ')가 만들고 ' + esc(P.org || '담당자') + '가 승인했어요' : '📗 이 체험관의 수업·문제는 담당자가 검수한 자료예요 · 메이커로 다른 주제도 만들 수 있어요';
  openModal('<div class="who" style="--zc:#8fd3ff"><span class="ava">📚</span><div><b>배움터</b><small>' + madeBy + '</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<div class="lab"><button class="pick-big lab-learn" data-act="learn"><span>📖</span><b>배우기</b><small>주제를 고르면 ' + esc(GRADES[state.grade].label) + ' 눈높이 짧은 수업 + 확인 문제</small></button>' +
    '<button class="pick-big lab-quiz" data-act="quiz"><span>📝</span><b>문제 풀기</b><small>마을을 고르면 문제를 내고, 틀리면 다시 설명해 줘요</small></button>' +
    '<button class="pick-big lab-ask" data-act="ask"><span>💬</span><b>' + esc(P.mascot.name) + '에게 묻기</b><small>이야기 카드에서 찾아서 대답해요</small></button></div>', { cls: 'menu lab-card' });
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return; SFX.click(); var act = a.dataset.act;
    if (act === 'close') closeModal(); if (act === 'learn') openLearn(); if (act === 'ask') openChat();
    if (act === 'quiz') {
      openModal('<div class="who" style="--zc:#8fd3ff"><span class="ava">📝</span><div><b>문제 풀기</b><small>어느 마을 문제를 풀어 볼까요?</small></div><button class="mini" data-act="back" aria-label="뒤로">←</button></div><div class="zone-list">' + ZONES.map(function (z) { var st = state.zones[z.id]; return '<button class="zl" data-z="' + z.id + '" style="--zc:' + z.color + '"><span>' + z.icon + '</span><b>' + esc(z.topic) + '</b><small>' + esc(z.friend) + (st.stars ? ' · 별 ' + st.stars + '개' : '') + '</small></button>'; }).join('') + '</div>', { cls: 'menu' });
      mcard.onclick = function (ev) { var zb = ev.target.closest('[data-z]'); if (zb) { startQuiz(zb.dataset.z); return; } if (ev.target.closest('[data-act="back"]')) openLearnHub(); };
    }
  };
}
function openLearn() {
  var groups = [{ id: 'earth', name: '전체 이야기', icon: '🌏' }].concat(ZONES.map(function (z) { return { id: z.id, name: z.topic, icon: z.icon }; }));
  openModal('<div class="who" style="--zc:#8fd3ff"><span class="ava">📖</span><div><b>배우기</b><small>배우고 싶은 주제를 골라요 · 배운 주제 ' + Object.keys(state.learned).length + '/' + P.cards.length + '</small></div><button class="mini" data-act="back" aria-label="뒤로">←</button></div>' +
    groups.map(function (gr) { var cs = P.cards.filter(function (c) { return c.zone === gr.id; }); if (!cs.length) return ''; return '<h3 class="qh">' + gr.icon + ' ' + esc(gr.name) + '</h3><div class="topics">' + cs.map(function (c) { return '<button class="topic ' + (state.learned[c.id] ? 'done' : '') + '" data-c="' + c.id + '">' + esc(c.title) + (state.learned[c.id] ? ' ✓' : '') + '</button>'; }).join('') + '</div>'; }).join(''), { cls: 'menu learn' });
  mcard.onclick = function (e) { var c = e.target.closest('[data-c]'); if (c) { SFX.click(); openLesson(c.dataset.c); return; } if (e.target.closest('[data-act="back"]')) openLearnHub(); };
}
function lessonFor(cardId) {
  var card = CARD[cardId], lv = level(), L = P.lessons[cardId] && (P.lessons[cardId][lv] || P.lessons[cardId][String(lv)]);
  if (L && L.intro) return Object.assign({ mode: 'ai' }, L);
  var s = TX.sentences(card.text), b = BANK.filter(function (x) { return x.ev === cardId; })[0], act = ACTIONS.filter(function (a) { return a.ev === cardId; })[0];
  return { mode: 'card', intro: s[0] || card.text, example: (s[1] || '') + (b ? (s[1] ? ' ' : '') + b.explain : ''), tryIt: act ? act.text + '. ' + act.why : '오늘 배운 "' + card.title + '" 이야기를 가족에게 들려주기' };
}
function openLesson(cardId) {
  var card = CARD[cardId], L = lessonFor(cardId), check = BANK.filter(function (b) { return b.ev === cardId; })[0], i = 0;
  var steps = [{ ico: '💡', h: '이게 뭐야?', t: L.intro }, { ico: '🏠', h: '이런 장면 본 적 있니?', t: L.example }, { ico: '🌱', h: '오늘 해 볼 일', t: L.tryIt }];
  openModal('', { cls: 'lesson' });
  function render() {
    var s = steps[i];
    mcard.innerHTML = '<div class="who" style="--zc:#8fd3ff"><span class="ava">' + AE[P.mascot.animal] + '</span><div><b>' + esc(card.title) + '</b><small>' + (L.mode === 'ai' ? '✨ 메이커에서 AI가 ' + esc(GRADES[state.grade].label) + ' 눈높이로 만들고 담당자가 승인한 수업' : '📗 이야기 카드로 배우기') + '</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
      '<div class="slide-dots">' + steps.map(function (_, k) { return '<i class="' + (k <= i ? 'on' : '') + '"></i>'; }).join('') + (check ? '<i></i>' : '') + '</div><div class="slide"><span class="slide-ico">' + s.ico + '</span><h3>' + esc(s.h) + '</h3><p>' + esc(s.t) + '</p></div>' +
      '<details class="evsmall"><summary>📄 근거 카드 보기</summary><p>' + esc(card.text) + '</p></details>' +
      '<div class="btns">' + (i > 0 ? '<button class="ghost" data-act="prev">◀ 이전</button>' : '') + '<button class="primary big" data-act="next" data-autofocus>' + (i < steps.length - 1 ? '다음 ▶' : check ? '확인 문제 풀기 ✏️' : '다 배웠어요! ✓') + '</button></div>';
    TTS.speak(s.h + '. ' + s.t, 'bear');
  }
  function renderCheck() {
    var it = check, opts = it.type === 'ox' ? '<div class="ox"><button class="opt o" data-a="O"><span>O</span>맞아요</button><button class="opt x" data-a="X"><span>X</span>아니에요</button></div>' : '<div class="choices">' + it.options.map(function (o, k) { return '<button class="opt c" data-a="' + k + '"><span>' + (k + 1) + '</span>' + esc(o) + '</button>'; }).join('') + '</div>';
    mcard.innerHTML = '<div class="who" style="--zc:#8fd3ff"><span class="ava">✏️</span><div><b>확인 문제</b><small>' + esc(card.title) + '</small></div></div><div class="qbox"><p class="q">' + esc(it.q) + '</p></div>' + opts + '<div class="fb" hidden></div>';
    TTS.speak(it.q, 'bear');
    mcard.onclick = function (e) {
      var b = e.target.closest('[data-a]');
      if (b && !b.disabled) {
        var ch = it.type === 'ox' ? b.dataset.a : +b.dataset.a, ok = ch === it.answer;
        mcard.querySelectorAll('.opt').forEach(function (x) { x.disabled = true; var v = it.type === 'ox' ? x.dataset.a : +x.dataset.a; if (v === it.answer) x.classList.add('right'); else if (v === ch) x.classList.add('wrong'); });
        var fb = mcard.querySelector('.fb'); fb.hidden = false; state.learned[cardId] = 1; save();
        if (ok) { SFX.correct(); confetti(18); fb.className = 'fb good'; fb.innerHTML = '<p>딩동댕! 🎉 ' + esc(it.explain) + '</p>'; TTS.speak('딩동댕! ' + it.explain, 'bear'); }
        else { SFX.wrong(); var w = wrongText(it, ch); fb.className = 'fb oops'; fb.innerHTML = '<p>' + esc(w.text) + '</p>'; TTS.speak(w.text, 'bear'); }
        fb.innerHTML += '<p class="smogmsg">📚 "' + esc(card.title) + '" 배우기 완료! (배운 주제 ' + Object.keys(state.learned).length + '개)</p><div class="btns"><button class="primary big" data-act="more">다른 주제 배우기 📚</button><button class="ghost" data-act="close">닫기</button></div>';
        return;
      }
      if (e.target.closest('[data-act="close"]')) closeModal(); if (e.target.closest('[data-act="more"]')) openLearn();
    };
  }
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'close') { closeModal(); return; } if (a.dataset.act === 'prev') { i = Math.max(0, i - 1); render(); return; }
    if (a.dataset.act === 'next') { SFX.click(); if (i < steps.length - 1) { i++; render(); return; } if (check) { renderCheck(); return; } state.learned[cardId] = 1; save(); toast('📚 "' + card.title + '" 배우기 완료!'); openLearn(); }
  };
  render();
}
/* 묻기: 이야기 카드 검색 (AI 없음) */
var chat = [];
function chatHTML() {
  var turns = chat.length ? chat.map(function (t) {
    if (t.role === 'user') return '<div class="msg me"><p>' + esc(t.content) + '</p>' + (t.masked && t.masked.length ? '<small class="mask">🔒 비밀 지킴: ' + esc(t.masked.join('·')) + ' → ○○로 가렸어요</small>' : '') + '</div>';
    var cites = (t.cites || []).map(function (id) { var c = CARD[id]; return c ? '<button class="cite" data-card="' + id + '">📄 ' + esc(c.title) + '</button>' : ''; }).join('');
    return '<div class="msg bear"><span class="ava">' + AE[P.mascot.animal] + '</span><div><p>' + esc(t.content) + '</p>' + (cites ? '<div class="cites">' + cites + '</div>' : '') + '</div></div>';
  }).join('') : '<div class="msg bear"><span class="ava">' + AE[P.mascot.animal] + '</span><div><p>' + esc(P.mascot.hi) + '</p></div></div>';
  return '<div class="who" style="--zc:' + P.mascot.color + '"><span class="ava">' + AE[P.mascot.animal] + '</span><div><b>' + esc(P.mascot.name) + '에게 묻기</b><small>이야기 카드 ' + P.cards.length + '장에서 찾아서 대답해요</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<div class="chat" id="chatLog">' + turns + '</div><div class="cardview" id="cardview" hidden></div>' +
    '<div class="chips">' + P.suggest.map(function (s) { return '<button class="chip" data-q="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div>' +
    '<form class="ask" id="askForm"><input id="askIn" maxlength="120" autocomplete="off" placeholder="궁금한 걸 적어 봐! (이름·학교·주소는 비밀)" aria-label="물어볼 말"><button class="primary">보내기</button></form>' +
    '<p class="fine">🔒 대화는 저장되지 않고 어디로도 보내지 않아요. 카드에 있는 내용으로만 대답해요.</p>';
}
function openChat() { openModal(chatHTML(), { cls: 'chatwin' }); bindChat(); if (!chat.length) TTS.speak(P.mascot.hi, 'bear'); }
function renderChat() { mcard.innerHTML = chatHTML(); bindChat(); var log = $('#chatLog'); if (log) log.scrollTop = log.scrollHeight; }
function bindChat() {
  var log = $('#chatLog'); if (log) log.scrollTop = log.scrollHeight;
  $('#askForm').onsubmit = function (e) { e.preventDefault(); var v = $('#askIn').value.trim(); if (v) { $('#askIn').value = ''; sendAsk(v); } };
  mcard.onclick = function (e) {
    var c = e.target.closest('[data-q]'); if (c) { sendAsk(c.dataset.q); return; }
    var cd = e.target.closest('[data-card]'); if (cd) { var card = CARD[cd.dataset.card], v = $('#cardview'); v.innerHTML = '<b>📄 ' + esc(card.title) + '</b><p>' + esc(card.text) + '</p><small>이야기 카드 ' + card.id + '</small>'; v.hidden = false; return; }
    if (e.target.closest('[data-act="close"]')) closeModal();
  };
  setTimeout(function () { var i = $('#askIn'); if (i && !('ontouchstart' in window)) i.focus(); }, 50);
}
function sendAsk(text) {
  SFX.click(); var m = window.GQSafety.maskPII(text), c = window.GQSafety.checkInput(m.text);
  chat.push({ role: 'user', content: m.text, masked: m.found });
  var reply;
  if (!c.ok) reply = { content: c.reply };
  else { var hits = TX.retrieve(CARD_IDX, c.text, 2); if (!hits.length) reply = { content: '음… 그건 ' + P.mascot.name + '가 가진 이야기 카드에는 없는 내용이야. 아래 질문 중에 골라 볼래?' }; else reply = { content: P.mascot.name + '가 이야기 카드에서 찾아봤어! ' + hits[0].it.text, cites: hits.map(function (h) { return h.it.id; }) }; }
  chat.push(Object.assign({ role: 'assistant' }, reply)); if (chat.length > 30) chat = chat.slice(-30); renderChat(); TTS.speak(reply.content, 'bear');
}

/* ------------------------------------------------------------
   광장(hub) · 마스코트 · 마지막 · 숙제 · 수료증 · 옷장 · 사진
   ------------------------------------------------------------ */
function openEarth() {
  if (world) world.focus('earth');
  var left = ZONES.filter(function (z) { return !state.zones[z.id].cleared; }), allDone = !left.length, H = P.hub;
  var line = allDone ? H.introDone : left.length === ZONES.length ? H.intro0 : H.introMid.replace('{n}', left.length);
  var tips = !state.tips; if (tips) { state.tips = true; save(); }
  openModal('<div class="who" style="--zc:#58b4ea"><span class="ava">🌏</span><div><b>' + esc(H.title) + '</b><small>' + esc(H.place) + '</small></div></div><p class="say">' + esc(line) + '</p>' + impactHTML() +
    (tips ? '<ul class="tips"><li><span>👆</span>땅을 누르면 그곳으로 걸어가요 <small>(키보드: 방향키 · 스페이스 점프)</small></li><li><span>🛠️</span>친구에게 가면 <b>체험</b>을 시작해요. 노란 화살표를 따라가서 직접 해 봐요</li><li><span>📚</span>오른쪽 아래 <b>배움터</b>에서 배우고 문제도 풀어요</li><li><span>🌰</span>섬 곳곳의 <b>반짝 씨앗</b>을 모아 보세요 · ⭐ 별을 모으면 <b>👕 꾸미기</b>가 열려요</li></ul>' : '') +
    (allDone ? '<div class="btns"><button class="primary big" data-act="hw" data-autofocus>' + esc(H.homework) + ' 받기 📮</button><button class="ghost" data-act="cert">수료증 만들기 🏅</button></div>'
      : '<div class="zone-list">' + ZONES.map(function (z) { var st = state.zones[z.id]; return '<button class="zl ' + (st.cleared ? 'done' : '') + '" data-walk="' + z.id + '" style="--zc:' + z.color + '"><span>' + z.icon + '</span><b>' + esc(z.name) + '</b><small>' + (st.cleared ? '깨끗해요 ✓' : esc(z.friend) + '에게 데려다줘') + '</small></button>'; }).join('') + '</div>') +
    '<div class="btns"><button class="ghost" data-act="ask">' + AE[P.mascot.animal] + ' ' + esc(P.mascot.name) + '에게 묻기</button><button class="' + (tips ? 'primary big' : 'ghost') + '" data-act="close">' + (tips ? '알겠어, 출발! 🚀' : '닫기') + '</button></div>', { cls: 'earth' });
  TTS.speak(line);
  mcard.onclick = function (e) {
    var w = e.target.closest('[data-walk]'); if (w) { var zid = w.dataset.walk; closeModal(); if (world) world.walkTo(zid); return; }
    var a = e.target.closest('[data-act]'); if (!a) return; var act = a.dataset.act;
    if (act === 'close') closeModal(); if (act === 'ask') openChat(); if (act === 'hw') openHomework(); if (act === 'cert') openCert();
  };
}
function openBear() {
  if (world) world.focus('mascot');
  var line = P.mascot.lines[Math.floor(Math.random() * P.mascot.lines.length)];
  openModal('<div class="who" style="--zc:' + P.mascot.color + '"><span class="ava">' + AE[P.mascot.animal] + '</span><div><b>' + esc(P.mascot.name) + '</b><small>마스코트</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div><p class="say">' + esc(line) + '</p>' +
    '<div class="choice3"><button class="pick-big" data-act="ask"><span>💬</span><b>궁금한 거 묻기</b><small>이야기 카드로 대답해요</small></button><button class="pick-big" data-act="dance"><span>💃</span><b>같이 춤추기</b><small>빙글빙글 통통!</small></button><button class="pick-big" data-act="pet"><span>💕</span><b>쓰다듬기</b><small>' + esc(P.mascot.name) + '가 좋아해요</small></button></div>', { cls: 'bear' });
  TTS.speak(line, 'bear');
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return; var act = a.dataset.act;
    if (act === 'close') closeModal(); if (act === 'ask') openChat();
    if (act === 'dance') { closeModal(); if (world) world.dance(5); SFX.dance(); toast('💃 ' + P.mascot.name + '랑 빙글빙글 통통!'); }
    if (act === 'pet') { closeModal(); if (world) world.hearts(); SFX.seed(); var say = ['헤헤, 간지러워!', '기분 최고야! 고마워', '나도 네가 좋아!'][Math.floor(Math.random() * 3)]; toast('💕 ' + P.mascot.name + ': ' + say); TTS.speak(say, 'bear'); }
  };
}
function openFinale() {
  state.finale = true; save(); if (world) world.celebrate(); SFX.fanfare();
  openModal('<div class="finale"><div class="rain">🌈</div><h2>' + esc(P.hub.finaleTitle) + '</h2><p class="say">' + esc(P.hub.finaleText) + '</p><div class="stars total">⭐ 모은 별 <b>' + totalStars() + '</b>개</div></div>' + impactHTML() +
    '<div class="btns"><button class="primary big" data-act="hw" data-autofocus>' + esc(P.hub.homework) + ' 받기 📮</button><button class="ghost" data-act="cert">수료증 만들기 🏅</button><button class="ghost" data-act="close">마을 구경하기</button></div>', { cls: 'finale-card' });
  TTS.speak(P.hub.finaleTitle + ' ' + P.hub.finaleText);
  mcard.onclick = function (e) { var a = e.target.closest('[data-act]'); if (!a) return; if (a.dataset.act === 'hw') openHomework(); if (a.dataset.act === 'cert') openCert(); if (a.dataset.act === 'close') closeModal(); };
}
function openHomework() {
  var pick = { liked: '' };
  var form = function () { return '<div class="who" style="--zc:#7fcd6b"><span class="ava">📮</span><div><b>' + esc(P.hub.homework) + '</b><small>집에서 해 볼 실천 1가지를 정해 줄게요</small></div></div><h3 class="qh">오늘 가장 재미있었던 마을은?</h3><div class="pick" data-k="liked">' + ZONES.map(function (z) { return '<button class="pk ' + (pick.liked === z.id ? 'on' : '') + '" data-v="' + z.id + '">' + z.icon + ' ' + esc(z.short) + '</button>'; }).join('') + '</div><div class="btns"><button class="primary big" data-act="make" ' + (pick.liked ? '' : 'disabled') + '>숙제 받기 📮</button><button class="ghost" data-act="close">닫기</button></div>'; };
  openModal(form(), { cls: 'hw' });
  mcard.onclick = function (e) {
    var b = e.target.closest('.pk'); if (b) { pick.liked = b.dataset.v; SFX.click(); mcard.innerHTML = form(); return; }
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'close') closeModal();
    if (a.dataset.act === 'make' && !a.disabled) {
      var pool = ACTIONS.filter(function (x) { return x.zone === pick.liked; }); if (!pool.length) pool = ACTIONS;
      var h = pool[Math.floor(Math.random() * pool.length)] || { text: '오늘 배운 걸 가족에게 들려주기', why: '말로 하면 더 잘 기억나니까요.', ev: '' };
      state.homework = { text: h.text, why: h.why, ev: h.ev, date: today(), done: false }; save(); var c = CARD[h.ev];
      mcard.innerHTML = '<div class="hwcard"><small>' + esc(P.hub.homework) + '</small><p class="hwt">' + esc(h.text) + '</p><p class="why">왜냐하면? ' + esc(h.why) + '</p>' + (c ? '<small class="src-line">📄 근거 카드: ' + esc(c.title) + '</small>' : '') + '</div><p class="fine">다 해 보고 다음에 놀러 오면 "해 봤어?" 하고 물어볼게. 해 봤으면 실천 새싹 🌱을 줄게!</p><div class="btns"><button class="primary big" data-act="cert">수료증 만들기 🏅</button><button class="ghost" data-act="print">숙제 카드 인쇄</button><button class="ghost" data-act="close">닫기</button></div>';
      TTS.speak(P.hub.homework + '! ' + h.text + '. 왜냐하면, ' + h.why, 'bear');
    }
    if (a.dataset.act === 'cert') openCert(); if (a.dataset.act === 'print') printHW();
  };
}
function printHW() { var h = state.homework; if (!h) return; $('#printArea').innerHTML = '<div class="print-hw"><h1>📮 ' + esc(P.hub.homework) + '</h1><p class="t">' + esc(h.text) + '</p><p>왜냐하면? ' + esc(h.why) + '</p><div class="check">□ 해 봤어요!　　날짜: ________</div><small>' + esc(P.title) + (P.org ? ' · ' + esc(P.org) : '') + '</small></div>'; window.print(); }
function openCert() {
  openModal('<div class="who" style="--zc:#f2b93b"><span class="ava">🏅</span><div><b>' + esc(P.hub.cert) + '</b><small>이름은 이 기기에서만 쓰고 어디에도 보내지 않아요</small></div></div><label class="lbl">수료증에 적을 이름 (빈칸도 괜찮아요)<input id="certName" maxlength="12" value="' + esc(state.name || '') + '" placeholder="예: 초록별 탐험대원"></label><div class="btns"><button class="primary big" data-act="print" data-autofocus>수료증 인쇄하기 🖨️</button><button class="ghost" data-act="close">닫기</button></div>', { cls: 'cert' });
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return; if (a.dataset.act === 'close') closeModal();
    if (a.dataset.act === 'print') {
      var n = $('#certName').value.trim().slice(0, 12); state.name = n; save(); var d = new Date();
      var body = P.hub.certBody.replace('{title}', P.title).replace('{zones}', ZONES.map(function (z) { return z.mission.title; }).join('·')).replace('{hub}', P.hub.name);
      $('#printArea').innerHTML = '<div class="print-cert"><div class="pc-in"><div class="pc-badge">🌏</div><h1>' + esc(P.hub.cert) + '</h1><p class="pc-name">' + esc(n || '탐험대원') + '</p><p class="pc-body">' + esc(body) + '</p><p class="pc-stars">모은 별 ⭐ ' + totalStars() + '개' + (state.sprouts ? ' · 실천 새싹 🌱 ' + state.sprouts + '개' : '') + '</p><p class="pc-date">' + d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일</p><p class="pc-from">' + esc(P.org ? P.org + ' · ' : '') + esc(P.title) + '</p></div></div>'; window.print();
    }
  };
}
function checkHomework() {
  var h = state.homework; if (!h || h.done || h.date === today()) return false;
  openModal('<div class="who" style="--zc:#7fcd6b"><span class="ava">' + AE[P.mascot.animal] + '</span><div><b>' + esc(P.mascot.name) + '</b><small>지난번 ' + esc(P.hub.homework) + '</small></div></div><p class="say">또 왔구나! 지난번 숙제 기억나? <b>“' + esc(h.text) + '”</b> 해 봤어?</p><div class="btns"><button class="primary big" data-act="yes" data-autofocus>해 봤어! 🌱</button><button class="ghost" data-act="no">아직이야</button></div>', { cls: 'hwcheck' });
  TTS.speak('또 왔구나! 지난번 숙제, ' + h.text + ', 해 봤어?', 'bear');
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'yes') { h.done = true; state.sprouts++; save(); updateHUD(); SFX.fanfare(); if (world) world.cheer(); mcard.innerHTML = '<div class="finale"><div class="rain">🌱</div><h2>실천 새싹 +1</h2><p class="say">정말 멋져! 밖에서도 해냈구나. 실천 새싹이 ' + state.sprouts + '개가 됐어!</p></div><div class="btns"><button class="primary big" data-act="close" data-autofocus>고마워!</button></div>'; TTS.speak('정말 멋져! 밖에서도 해냈구나.', 'bear'); return; }
    if (a.dataset.act === 'no') { h.date = today(); save(); mcard.innerHTML = '<p class="say">괜찮아! 오늘 꼭 한 번 해 보자. 응원할게! 💙</p><div class="btns"><button class="primary big" data-act="close" data-autofocus>알겠어!</button></div>'; TTS.speak('괜찮아! 오늘 꼭 한 번 해 보자.', 'bear'); return; }
    if (a.dataset.act === 'close') closeModal();
  };
  return true;
}
function openWardrobe(tab) {
  tab = tab || 'look';
  var ts = totalStars(), sc = seedCount();
  var head = '<div class="who" style="--zc:#f2b93b"><span class="ava">👕</span><div><b>꾸미기</b><small>⭐ 별 ' + ts + '개 · 🌰 씨앗 ' + sc + '/' + SEED_TOTAL + '</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<div class="wtabs"><button class="wtab ' + (tab === 'look' ? 'on' : '') + '" data-tab="look">🧑 내 캐릭터</button><button class="wtab ' + (tab === 'hat' ? 'on' : '') + '" data-tab="hat">🎩 모자 · 별로 열려요</button></div>';
  if (tab === 'hat') {
    openModal(head + '<p class="fine">체험·놀이·문제에서 별을 모으면 새 모자가 열려요. 별 왕관은 반짝 씨앗 12개를 모두 모으면 열려요!</p>' +
      '<div class="wardrobe">' + HATS.map(function (h) { var open = hatOpen(h), on = state.hat === h.id, need = h.seeds ? '🌰 씨앗 ' + sc + '/' + h.seeds : '⭐ ' + Math.min(ts, h.need) + '/' + h.need; return '<button class="hat ' + (open ? '' : 'locked ') + (on ? 'on' : '') + '" data-hat="' + h.id + '"><span>' + (open ? h.icon : '🔒') + '</span><b>' + esc(h.name) + '</b><small>' + (on ? '쓰고 있어요' : open ? '써 보기' : need) + '</small></button>'; }).join('') + '</div>' +
      '<div class="btns"><button class="primary" data-act="close">다 됐어요</button></div>', { cls: 'menu wear' });
    mcard.onclick = function (e) {
      var tb = e.target.closest('[data-tab]'); if (tb) { SFX.click(); openWardrobe(tb.dataset.tab); return; }
      var hb = e.target.closest('[data-hat]');
      if (hb) { var h = HATS.find(function (x) { return x.id === hb.dataset.hat; }); if (!hatOpen(h)) { SFX.wrong(); toast(h.seeds ? '🌰 반짝 씨앗을 모두 모으면 열려요!' : '⭐ 별 ' + h.need + '개를 모으면 열려요! (지금 ' + ts + '개)'); return; } state.hat = h.id; save(); if (world) { world.setHat(h.id); world.cheer(); } SFX.pop(); openWardrobe('hat'); return; }
      if (e.target.closest('[data-act="close"]')) closeModal();
    };
    return;
  }
  var draft = Object.assign({}, state.look), saved = false;
  openModal(head + '<div id="czBox"></div><div class="btns"><button class="ghost" data-act="rand">🎲 무작위</button><button class="primary big" data-act="save" data-autofocus>이 모습으로 할래요 ✓</button></div>',
    { cls: 'menu wear', onClose: function () { if (world) { if (!saved) world.setAvatar(state.look); world.focus(null); } } });
  if (world) world.focus('me');
  var cz = mountCreator($('#czBox'), draft, function () { if (world) world.setAvatar(draft); });
  mcard.onclick = function (e) {
    var tb = e.target.closest('[data-tab]'); if (tb) { SFX.click(); closeModal(); openWardrobe(tb.dataset.tab); return; }
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'close') closeModal();
    if (a.dataset.act === 'rand') cz.random();
    if (a.dataset.act === 'save') { state.look = okLook(draft); saved = true; save(); closeModal(); if (world) { world.setAvatar(state.look); world.cheer(); } SFX.pop(); toast('🧑 새 모습으로 바뀌었어요!'); if (!$('#start').hidden) renderStart(); }
  };
}
function openPhoto() {
  if (!world) return; var shot = world.snapshot(); if (!shot) { toast('이 브라우저에서는 사진을 찍을 수 없어요'); return; } SFX.click();
  var img = new Image();
  img.onload = function () {
    var W = 1200, H = Math.round(W * img.height / img.width), pad = 34, foot = 96, cv = document.createElement('canvas'); cv.width = W + pad * 2; cv.height = H + pad * 2 + foot; var g = cv.getContext('2d');
    g.fillStyle = '#fffdf6'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, pad, pad, W, H);
    g.fillStyle = '#2f7d5b'; g.font = '800 40px Jua, "Malgun Gothic", sans-serif'; g.textBaseline = 'middle'; g.fillText('🌏 ' + P.title, pad, H + pad + foot / 2);
    var d = new Date(); g.fillStyle = '#5d7480'; g.font = '600 26px "Malgun Gothic", sans-serif'; g.textAlign = 'right'; g.fillText('⭐ ' + totalStars() + '  🌰 ' + seedCount() + '  ·  ' + d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate(), cv.width - pad, H + pad + foot / 2);
    var url = cv.toDataURL('image/jpeg', 0.9);
    openModal('<div class="who" style="--zc:#ff8fab"><span class="ava">📸</span><div><b>찰칵! 사진이 찍혔어요</b><small>이 기기에만 저장돼요</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div><img class="photo" src="' + url + '" alt="체험관 사진"><div class="btns"><a class="primary big btnlike" href="' + url + '" download="' + esc(P.title) + '_' + d.getFullYear() + (d.getMonth() + 1) + d.getDate() + '.jpg">사진 저장하기 💾</a><button class="ghost" data-act="close">닫기</button></div>', { cls: 'photo-card' });
    mcard.onclick = function (e) { if (e.target.closest('[data-act="close"]')) closeModal(); };
  };
  img.src = shot; var fl = document.createElement('div'); fl.className = 'flash'; document.body.appendChild(fl); setTimeout(function () { fl.remove(); }, 500);
}

/* ------------------------------------------------------------
   설정 · 체험관 고르기
   ------------------------------------------------------------ */
function openMenu() {
  openModal('<div class="who" style="--zc:#7d93a6"><span class="ava">⚙️</span><div><b>설정</b><small>보호자·선생님용</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<div class="set-sec"><h3>학년</h3><div class="pick" data-k="grade">' + GRADES.map(function (g) { return '<button class="pk ' + (state.grade === g.id ? 'on' : '') + '" data-v="' + g.id + '">' + g.label + '</button>'; }).join('') + '</div></div>' +
    '<div class="set-sec"><h3>소리</h3><label class="tg"><input type="checkbox" id="optTTS" ' + (TTS.on ? 'checked' : '') + '> 대사를 소리 내어 읽어 주기</label><label class="tg"><input type="checkbox" id="optBgm" ' + (pref('gq.bgm', '1') === '1' ? 'checked' : '') + '> 잔잔한 배경음악</label><label class="tg"><input type="checkbox" id="optMute" ' + (SFX.muted() ? 'checked' : '') + '> 모든 소리 끄기</label></div>' +
    '<div class="set-sec"><h3>이 체험관</h3><p class="fine"><b>' + esc(P.title) + '</b>' + (P.subtitle ? ' · ' + esc(P.subtitle) : '') + (P.org ? ' · ' + esc(P.org) : '') + '<br>' + (P.meta.model ? '✨ AI 체험관 메이커로 생성(' + esc(P.meta.model) + ') · 담당자 승인 ' + (P.meta.approved ? '완료' : '전') : '📗 ' + esc(P.meta.note || '사람이 만든 기본 체험관')) + '</p><div class="btns left"><button class="ghost" data-act="packs">다른 체험관 열기</button><a class="ghost btnlike" href="maker.html">🛠️ 메이커 열기</a></div></div>' +
    '<div class="set-sec"><h3>보호자·선생님 안내</h3><ul class="fine list"><li>로그인이 없고, 이름·학교 같은 개인정보를 받지 않아요. 진행 기록은 이 기기 브라우저에만 저장돼요.</li><li>체험 화면에서는 AI가 실시간으로 말하지 않아요. 수업·문제·설명은 모두 메이커에서 미리 만들어 담당자가 확인한 글이에요.</li><li>내용은 체험용 예시이며 실제 운영 전 감수가 필요해요.</li></ul><div class="btns left"><button class="ghost danger" data-act="reset">처음부터 다시 하기</button></div></div>', { cls: 'menu' });
  $('#optTTS').onchange = function () { TTS.on = this.checked; setPref('gq.tts', this.checked ? '1' : '0'); };
  $('#optMute').onchange = function () { SFX.setMuted(this.checked); if (this.checked) TTS.stop(); updateSoundBtn(); };
  $('#optBgm').onchange = function () { setPref('gq.bgm', this.checked ? '1' : '0'); SFX.init(); SFX.bgm(this.checked); };
  mcard.onclick = function (e) {
    var pk = e.target.closest('.pk'); if (pk) { state.grade = +pk.dataset.v; save(); mcard.querySelectorAll('[data-k="grade"] .pk').forEach(function (b) { b.classList.toggle('on', b === pk); }); toast(GRADES[state.grade].label + ' 눈높이로 보여 줄게요'); return; }
    var a = e.target.closest('[data-act]'); if (!a) return; var act = a.dataset.act;
    if (act === 'close') closeModal(); if (act === 'packs') openPacks();
    if (act === 'reset') { if (confirm('지금까지의 진행(도장·별·숙제)을 모두 지우고 처음부터 할까요?')) { localStorage.removeItem(SAVE_KEY); location.reload(); } }
  };
}
function openPacks() {
  var local = PK.list();
  var rows = [{ id: PK.DEFAULT_ID, title: (PK.defaultPack() || {}).title, subtitle: (PK.defaultPack() || {}).subtitle, org: (PK.defaultPack() || {}).org, builtin: true }].concat(local.filter(function (p) { return p.id !== PK.DEFAULT_ID; }));
  openModal('<div class="who" style="--zc:#8fd3ff"><span class="ava">🗂️</span><div><b>다른 체험관 열기</b><small>이 기기에 저장된 체험관 · 파일 · 링크</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<div class="packlist">' + rows.map(function (p) { return '<button class="pk-row ' + (p.id === P.id ? 'on' : '') + '" data-open="' + esc(p.id) + '"><b>' + esc(p.title || p.id) + '</b><small>' + esc([p.subtitle, p.org, p.builtin ? '기본' : (p.made || '')].filter(Boolean).join(' · ')) + '</small>' + (p.id === P.id ? '<em>지금</em>' : '') + '</button>'; }).join('') + '</div>' +
    '<div class="btns left"><label class="ghost btnlike">📂 팩 파일(JSON) 열기<input type="file" id="packFile" accept="application/json,.json" hidden></label><button class="ghost" data-act="url">🔗 주소로 열기</button></div><p class="fine">메이커에서 "발행"한 팩을 이 기기에서 바로 열거나, 내보낸 JSON 파일·링크로 다른 기기에서도 열 수 있어요.</p>', { cls: 'menu' });
  $('#packFile').onchange = function () { var f = this.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { try { var p = PK.normalize(JSON.parse(r.result)); PK.save(p); location.href = location.pathname + '?pack=' + encodeURIComponent(p.id); } catch (e) { toast('팩 파일을 읽지 못했어요: ' + e.message); } }; r.readAsText(f); };
  mcard.onclick = function (e) {
    var o = e.target.closest('[data-open]'); if (o) { location.href = location.pathname + (o.dataset.open === PK.DEFAULT_ID ? '' : '?pack=' + encodeURIComponent(o.dataset.open)); return; }
    var a = e.target.closest('[data-act]'); if (!a) return; if (a.dataset.act === 'close') closeModal();
    if (a.dataset.act === 'url') { var u = prompt('팩 JSON 주소(https://…) 또는 메이커 링크를 붙여 넣으세요'); if (!u) return; if (/#p=/.test(u)) location.href = u; else location.href = location.pathname + '?pack=' + encodeURIComponent(u.trim()); }
  };
}
function updateSoundBtn() { $('#btnSound').textContent = SFX.muted() ? '🔇' : '🔊'; }

/* ------------------------------------------------------------
   시작 화면 · 부팅
   ------------------------------------------------------------ */
/* 캐릭터 꾸미기 — 추천 조합 + 나이·성별·피부·눈·입·볼·머리·옷·소품 (world.js makePerson과 같은 키) */
var AV = {
  age: [['kid', '꼬마'], ['student', '초등'], ['teen', '중·고등']],
  body: [['m', '남자'], ['f', '여자']],
  skin: ['#fbe3cc', '#f6d2b0', '#e9b48e', '#d19a6b', '#a9744f', '#7a5035'],
  eye: [['round', '동글눈'], ['sparkle', '반짝눈'], ['smile', '웃는 눈'], ['sleepy', '졸린 눈'], ['wink', '윙크']],
  mouth: [['smile', '미소'], ['grin', '활짝'], ['cat', '고양이 입'], ['o', '동그란 입'], ['flat', '시크']],
  cheek: [['pink', '볼터치'], ['freckle', '주근깨'], ['none', '없음']],
  style: [['short', '짧은 머리'], ['curly', '곱슬'], ['bob', '단발'], ['long', '긴 머리'], ['pony', '포니테일'], ['twin', '양갈래'], ['bun', '똥머리'], ['cap', '야구모자'], ['beanie', '비니']],
  hair: ['#2a221d', '#5a3d2b', '#8a6a4a', '#c9a15a', '#6b6f78', '#a8452f', '#e6d3a3', '#4a6fa5'],
  top: [['tee', '반팔 티'], ['long', '긴팔 티'], ['hoodie', '후드티'], ['shirt', '셔츠·넥타이'], ['uniform', '교복'], ['vest', '조끼']],
  shirt: ['#5cb85c', '#3b82c4', '#f2c14e', '#f39aa5', '#8e6bbf', '#e4572e', '#2b3a67', '#f3f3f3', '#2b2f36', '#7fc8f8', '#a3d977', '#ff9f68'],
  bottom: [['pants', '긴바지'], ['shorts', '반바지'], ['skirt', '치마']],
  pants: ['#3d5a80', '#2f3e46', '#5c5552', '#47506b', '#c9b48a', '#2b2f36', '#7a5c8e', '#f3f3f3'],
  acc: [['none', '없음'], ['glasses', '안경'], ['sunglasses', '선글라스'], ['headphones', '헤드폰'], ['backpack', '책가방'], ['bow', '리본핀']]
};
var AV_KEYS = Object.keys(AV);
var PRESETS = [
  ['🧒 꼬마 탐험가', { age: 'kid', body: 'm', skin: '#f6d2b0', eye: 'sparkle', mouth: 'grin', cheek: 'pink', style: 'short', hair: '#2a221d', top: 'tee', shirt: '#5cb85c', bottom: 'shorts', pants: '#3d5a80', acc: 'none' }],
  ['👧 꼬마 모험가', { age: 'kid', body: 'f', skin: '#fbe3cc', eye: 'sparkle', mouth: 'smile', cheek: 'pink', style: 'twin', hair: '#5a3d2b', top: 'hoodie', shirt: '#f2c14e', bottom: 'skirt', pants: '#7a5c8e', acc: 'none' }],
  ['⚽ 초등 축구왕', { age: 'student', body: 'm', skin: '#e9b48e', eye: 'smile', mouth: 'grin', cheek: 'pink', style: 'cap', hair: '#2a221d', top: 'tee', shirt: '#3b82c4', bottom: 'shorts', pants: '#2f3e46', acc: 'none' }],
  ['📚 초등 책벌레', { age: 'student', body: 'f', skin: '#f6d2b0', eye: 'round', mouth: 'smile', cheek: 'freckle', style: 'bob', hair: '#8a6a4a', top: 'long', shirt: '#8e6bbf', bottom: 'pants', pants: '#47506b', acc: 'glasses' }],
  ['🏫 중학생 교복', { age: 'teen', body: 'm', skin: '#f6d2b0', eye: 'round', mouth: 'smile', cheek: 'none', style: 'short', hair: '#2a221d', top: 'uniform', shirt: '#2b3a67', bottom: 'pants', pants: '#2b2f36', acc: 'backpack' }],
  ['🎀 중학생 교복', { age: 'teen', body: 'f', skin: '#fbe3cc', eye: 'sparkle', mouth: 'smile', cheek: 'pink', style: 'pony', hair: '#2a221d', top: 'uniform', shirt: '#2b3a67', bottom: 'skirt', pants: '#2b2f36', acc: 'none' }],
  ['🎧 고등학생 후드', { age: 'teen', body: 'm', skin: '#d19a6b', eye: 'sleepy', mouth: 'flat', cheek: 'none', style: 'curly', hair: '#2a221d', top: 'hoodie', shirt: '#2b2f36', bottom: 'pants', pants: '#3d5a80', acc: 'headphones' }],
  ['🎒 고등학생 캐주얼', { age: 'teen', body: 'f', skin: '#e9b48e', eye: 'smile', mouth: 'cat', cheek: 'pink', style: 'long', hair: '#a8452f', top: 'long', shirt: '#f39aa5', bottom: 'pants', pants: '#c9b48a', acc: 'backpack' }]
];
function okLook(o) { // 저장된 값은 허용 목록 안에서만
  var L = {}; o = o || {};
  AV_KEYS.forEach(function (k) { var vals = AV[k].map(function (x) { return Array.isArray(x) ? x[0] : x; }); L[k] = vals.indexOf(o[k]) >= 0 ? o[k] : PRESETS[2][1][k]; });
  return L;
}
function sameLook(a, b) { return AV_KEYS.every(function (k) { return a[k] === b[k]; }); }
function shadeHex(hex, k) { var n = parseInt(hex.slice(1), 16), r = Math.min(255, Math.round(((n >> 16) & 255) * k)), g = Math.min(255, Math.round(((n >> 8) & 255) * k)), b = Math.min(255, Math.round((n & 255) * k)); return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); }
/* 2D 미리보기(SVG) — 시작 화면 추천 카드와 꾸미기 창에서 즉시 보여 줌 */
function lookSVG(L, cls) {
  L = okLook(L);
  var kid = L.age === 'kid', teen = L.age === 'teen', f = L.body === 'f';
  var R = kid ? 25 : teen ? 20 : 22, cy = R + 10, INK = '#1d1d22', MC = f ? '#c95b6b' : '#9b4a45';
  var bw = (f ? 28 : 32) + (kid ? 2 : 0), bh = kid ? 22 : teen ? 34 : 28, bt = cy + R - 3, lt = bt + bh - 3, legH = L.bottom === 'pants' ? 18 : 7, H = lt + 26;
  var s = '', hx0 = 50 - R - 1, hx1 = 50 + R + 1, Rh = R + 1;
  if (L.style === 'long') s += '<rect x="' + hx0 + '" y="' + cy + '" width="' + (2 * Rh) + '" height="' + (R + 24) + '" rx="10" fill="' + L.hair + '"/>';
  if (L.style === 'bob') s += '<rect x="' + hx0 + '" y="' + cy + '" width="' + (2 * Rh) + '" height="' + (R + 8) + '" rx="9" fill="' + L.hair + '"/>';
  if (L.style === 'twin') [-1, 1].forEach(function (d) { s += '<rect x="' + (50 + d * (R + 5) - 5) + '" y="' + (cy - 2) + '" width="10" height="26" rx="5" fill="' + L.hair + '"/><circle cx="' + (50 + d * (R + 1)) + '" cy="' + (cy - 2) + '" r="3" fill="#ff8fab"/>'; });
  if (L.style === 'pony') s += '<rect x="' + (50 + R - 6) + '" y="' + (cy - R + 2) + '" width="10" height="26" rx="5" fill="' + L.hair + '" transform="rotate(-25 ' + (50 + R - 1) + ' ' + (cy - R + 2) + ')"/>';
  if (L.style === 'bun') s += '<circle cx="50" cy="' + (cy - R - 2) + '" r="8" fill="' + L.hair + '"/>';
  if (L.acc === 'headphones') s += '<path d="M' + (hx0 - 2) + ' ' + cy + ' A' + (Rh + 2) + ' ' + (Rh + 2) + ' 0 0 1 ' + (hx1 + 2) + ' ' + cy + '" fill="none" stroke="#2b2f36" stroke-width="4"/>';
  if (L.bottom === 'skirt') s += '<path d="M' + (50 - bw / 2) + ' ' + lt + ' L' + (50 - bw / 2 - 6) + ' ' + (lt + 13) + ' L' + (50 + bw / 2 + 6) + ' ' + (lt + 13) + ' L' + (50 + bw / 2) + ' ' + lt + 'z" fill="' + L.pants + '"/>';
  [-1, 1].forEach(function (d) { var x = 50 + d * 7 - 4; s += '<rect x="' + x + '" y="' + lt + '" width="8" height="21" rx="4" fill="' + L.skin + '"/>' + (L.bottom === 'skirt' ? '' : '<rect x="' + x + '" y="' + lt + '" width="8" height="' + legH + '" rx="4" fill="' + L.pants + '"/>') + '<ellipse cx="' + (x + 4) + '" cy="' + (lt + 22) + '" rx="6" ry="3" fill="#3a3f46"/>'; });
  [-1, 1].forEach(function (d) { var x = 50 + d * (bw / 2 + 4) - 3.5, sleeve = (L.top === 'tee' || L.top === 'vest') ? 9 : bh - 4; s += '<rect x="' + x + '" y="' + (bt + 2) + '" width="7" height="' + (bh - 2) + '" rx="3.5" fill="' + L.skin + '"/><rect x="' + x + '" y="' + (bt + 2) + '" width="7" height="' + sleeve + '" rx="3.5" fill="' + L.shirt + '"/>'; });
  s += '<rect x="' + (50 - bw / 2) + '" y="' + bt + '" width="' + bw + '" height="' + bh + '" rx="8" fill="' + (L.top === 'vest' ? '#ffb703' : L.shirt) + '"/>';
  if (L.top === 'vest') s += '<rect x="' + (50 - bw / 2 + 2) + '" y="' + (bt + bh * 0.55) + '" width="' + (bw - 4) + '" height="3" fill="#e9e9e9"/>';
  if (L.top === 'hoodie') s += '<path d="M40 ' + (bt + 2) + ' q10 8 20 0" fill="none" stroke="' + shadeHex(L.shirt, 0.8) + '" stroke-width="4" stroke-linecap="round"/><rect x="41" y="' + (bt + bh - 10) + '" width="18" height="6" rx="2" fill="' + shadeHex(L.shirt, 0.8) + '"/>';
  if (L.top === 'shirt' || L.top === 'uniform') { var cc = L.top === 'uniform' ? '#ffffff' : shadeHex(L.shirt, 1.25); s += '<path d="M43 ' + bt + ' l7 7 l7 -7z" fill="' + cc + '"/>'; if (f && L.top === 'uniform') s += '<ellipse cx="46" cy="' + (bt + 7) + '" rx="4" ry="2.4" fill="#d9534f"/><ellipse cx="54" cy="' + (bt + 7) + '" rx="4" ry="2.4" fill="#d9534f"/><circle cx="50" cy="' + (bt + 7) + '" r="1.8" fill="#b03a3a"/>'; else s += '<path d="M48 ' + (bt + 5) + ' h4 l1 12 l-3 4 l-3 -4z" fill="' + (L.top === 'uniform' ? '#c0392b' : '#2b3a67') + '"/>'; }
  if (L.acc === 'backpack') [-1, 1].forEach(function (d) { s += '<rect x="' + (50 + d * 8 - 2) + '" y="' + bt + '" width="4" height="' + (bh - 6) + '" rx="2" fill="#e76f51"/>'; });
  s += '<circle cx="50" cy="' + cy + '" r="' + R + '" fill="' + L.skin + '"/>';
  if (L.style === 'cap') s += '<path d="M' + hx0 + ' ' + (cy - 1) + ' A' + Rh + ' ' + Rh + ' 0 0 1 ' + hx1 + ' ' + (cy - 1) + 'z" fill="' + L.shirt + '"/><rect x="44" y="' + (cy - 5) + '" width="' + (R + 9) + '" height="5" rx="2.5" fill="' + L.shirt + '"/>';
  else if (L.style === 'beanie') s += '<path d="M' + hx0 + ' ' + (cy - 1) + ' A' + Rh + ' ' + Rh + ' 0 0 1 ' + hx1 + ' ' + (cy - 1) + 'z" fill="' + L.pants + '"/><rect x="' + (hx0 - 1) + '" y="' + (cy - 6) + '" width="' + (2 * Rh + 2) + '" height="6" rx="3" fill="' + L.pants + '"/><circle cx="50" cy="' + (cy - Rh - 2) + '" r="4" fill="#fff"/>';
  else {
    s += '<path d="M' + hx0 + ' ' + (cy - 4) + ' A' + Rh + ' ' + Rh + ' 0 0 1 ' + hx1 + ' ' + (cy - 4) + ' L' + hx1 + ' ' + (cy - 1) + ' Q50 ' + (cy + 3) + ' ' + hx0 + ' ' + (cy - 1) + 'z" fill="' + L.hair + '"/>';
    if (L.style === 'curly') for (var k = 0; k < 7; k++) { var a = Math.PI + (k / 6) * Math.PI; s += '<circle cx="' + (50 + Math.cos(a) * Rh).toFixed(1) + '" cy="' + (cy - 2 + Math.sin(a) * Rh).toFixed(1) + '" r="5" fill="' + L.hair + '"/>'; }
  }
  [-1, 1].forEach(function (d, i) {
    var x = 50 + d * 8, y = cy + 1, kind = L.eye === 'wink' ? (i === 0 ? 'smile' : 'round') : L.eye;
    if (kind === 'smile') s += '<path d="M' + (x - 3.5) + ' ' + (y + 1) + ' q3.5 -5 7 0" fill="none" stroke="' + INK + '" stroke-width="1.8" stroke-linecap="round"/>';
    else if (kind === 'sleepy') s += '<ellipse cx="' + x + '" cy="' + (y + 0.5) + '" rx="3" ry="1.5" fill="' + INK + '"/>';
    else { var big = kind === 'sparkle'; s += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (big ? 3.3 : 2.6) + '" ry="' + (big ? 4.2 : 3.4) + '" fill="' + INK + '"/><circle cx="' + (x + 1.2) + '" cy="' + (y - 1.5) + '" r="' + (big ? 1.3 : 0.9) + '" fill="#fff"/>'; }
  });
  if (L.cheek === 'pink') s += '<circle cx="37" cy="' + (cy + 6) + '" r="3.2" fill="#f5a3a3" opacity=".85"/><circle cx="63" cy="' + (cy + 6) + '" r="3.2" fill="#f5a3a3" opacity=".85"/>';
  else if (L.cheek === 'freckle') [-1, 1].forEach(function (d) { s += '<circle cx="' + (50 + d * 13) + '" cy="' + (cy + 6) + '" r=".9" fill="#c98a6b"/><circle cx="' + (50 + d * 15.5) + '" cy="' + (cy + 4.5) + '" r=".9" fill="#c98a6b"/><circle cx="' + (50 + d * 10.5) + '" cy="' + (cy + 4.8) + '" r=".9" fill="#c98a6b"/>'; });
  var my = cy + 9;
  if (L.mouth === 'grin') s += '<path d="M45 ' + (my - 1) + ' a5 5 0 0 0 10 0z" fill="#7a2f33"/>';
  else if (L.mouth === 'o') s += '<circle cx="50" cy="' + my + '" r="2.3" fill="#7a2f33"/>';
  else if (L.mouth === 'cat') s += '<path d="M45 ' + (my - 1) + ' q2.5 3.5 5 0 q2.5 3.5 5 0" fill="none" stroke="' + MC + '" stroke-width="1.5" stroke-linecap="round"/>';
  else if (L.mouth === 'flat') s += '<path d="M46 ' + my + ' h8" stroke="' + MC + '" stroke-width="1.6" stroke-linecap="round"/>';
  else s += '<path d="M46 ' + (my - 1) + ' q4 4 8 0" fill="none" stroke="' + MC + '" stroke-width="1.6" stroke-linecap="round"/>';
  if (L.acc === 'glasses') s += '<circle cx="42" cy="' + (cy + 1) + '" r="6" fill="none" stroke="#333740" stroke-width="1.5"/><circle cx="58" cy="' + (cy + 1) + '" r="6" fill="none" stroke="#333740" stroke-width="1.5"/><path d="M48 ' + (cy + 1) + ' h4" stroke="#333740" stroke-width="1.5"/>';
  if (L.acc === 'sunglasses') s += '<circle cx="42" cy="' + (cy + 1) + '" r="6" fill="#1a1a1f"/><circle cx="58" cy="' + (cy + 1) + '" r="6" fill="#1a1a1f"/><path d="M48 ' + (cy + 1) + ' h4" stroke="#1a1a1f" stroke-width="1.5"/>';
  if (L.acc === 'headphones') s += '<rect x="' + (hx0 - 6) + '" y="' + (cy - 5) + '" width="6" height="11" rx="3" fill="#2b2f36"/><rect x="' + hx1 + '" y="' + (cy - 5) + '" width="6" height="11" rx="3" fill="#2b2f36"/>';
  if (L.acc === 'bow') { var bx = 50 + R * 0.55, by = cy - R * 0.7; s += '<ellipse cx="' + (bx - 4) + '" cy="' + by + '" rx="4" ry="2.6" fill="#ff6b8b"/><ellipse cx="' + (bx + 4) + '" cy="' + by + '" rx="4" ry="2.6" fill="#ff6b8b"/><circle cx="' + bx + '" cy="' + by + '" r="1.8" fill="#e0476d"/>'; }
  return '<svg class="' + (cls || '') + '" viewBox="0 0 100 ' + H + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + s + '</svg>';
}
var CZ_TABS = [
  ['base', '기본', [['p', '추천 조합'], ['c', 'age', '나이', AV.age], ['c', 'body', '성별', AV.body], ['s', 'skin', '피부', AV.skin]]],
  ['face', '얼굴', [['c', 'eye', '눈', AV.eye], ['c', 'mouth', '입', AV.mouth], ['c', 'cheek', '볼', AV.cheek]]],
  ['hair', '머리', [['c', 'style', '머리 모양', AV.style], ['s', 'hair', '머리 색', AV.hair]]],
  ['wear', '옷', [['c', 'top', '윗옷', AV.top], ['s', 'shirt', '윗옷 색', AV.shirt], ['c', 'bottom', '아래옷', AV.bottom], ['s', 'pants', '아래옷 색', AV.pants]]],
  ['acc', '소품', [['c', 'acc', '소품', AV.acc]]]
];
function mountCreator(box, draft, onChange) {
  var tab = 'base';
  box.innerHTML = '<div class="cz"><div class="cz-prev" id="czPrev"></div><div class="cz-side"><div class="cz-tabs" role="tablist">' + CZ_TABS.map(function (t) { return '<button type="button" class="cz-tab" data-cztab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><div class="cz-panel"></div></div></div>';
  var panel = box.querySelector('.cz-panel'), prev = box.querySelector('#czPrev');
  function render() {
    var groups = CZ_TABS.find(function (t) { return t[0] === tab; })[2];
    panel.innerHTML = groups.map(function (g) {
      if (g[0] === 'p') return '<div class="field"><span>' + g[1] + '</span><div class="mopts">' + PRESETS.map(function (p, i) { return '<button type="button" class="chip ' + (sameLook(draft, p[1]) ? 'on' : '') + '" data-p="' + i + '">' + esc(p[0]) + '</button>'; }).join('') + '</div></div>';
      var kind = g[0], key = g[1], label = g[2], list = g[3];
      if (kind === 's') return '<div class="field"><span>' + label + '</span><div class="swatches" data-key="' + key + '">' + list.map(function (c) { return '<button type="button" class="sw ' + (draft[key] === c ? 'on' : '') + '" data-v="' + c + '" style="background:' + c + '" aria-label="' + label + ' ' + c + '" aria-pressed="' + (draft[key] === c) + '"></button>'; }).join('') + '</div></div>';
      return '<div class="field"><span>' + label + '</span><div class="mopts" data-key="' + key + '">' + list.map(function (o) { return '<button type="button" class="chip ' + (draft[key] === o[0] ? 'on' : '') + '" data-v="' + o[0] + '" aria-pressed="' + (draft[key] === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
    }).join('');
    box.querySelectorAll('.cz-tab').forEach(function (b) { b.classList.toggle('on', b.dataset.cztab === tab); });
    prev.innerHTML = lookSVG(draft, 'cz-svg');
  }
  function changed() { render(); SFX.click(); if (onChange) onChange(draft); }
  box.addEventListener('click', function (e) {
    var t = e.target.closest('[data-cztab]'); if (t) { tab = t.dataset.cztab; render(); return; }
    var p = e.target.closest('[data-p]'); if (p) { Object.assign(draft, PRESETS[+p.dataset.p][1]); changed(); return; }
    var v = e.target.closest('[data-v]'), g = v && v.closest('[data-key]'); if (g) { draft[g.dataset.key] = v.dataset.v; changed(); }
  });
  render();
  return { random: function () { AV_KEYS.forEach(function (k) { var pick = AV[k][Math.floor(Math.random() * AV[k].length)]; draft[k] = Array.isArray(pick) ? pick[0] : pick; }); changed(); } };
}
function renderStart() {
  $('#stTitle').textContent = P.title; $('#stSub').textContent = P.subtitle; $('#stLead').textContent = P.lead; document.title = P.title + ' — 체험관';
  $('#stMade').innerHTML = '<b>✨ AI 체험관 메이커</b> · 교육자료 넣기 → AI 생성 → 근거 검증 → 담당자 승인 → 발행' + (P.meta.model ? '<br>이 체험관은 AI(' + esc(P.meta.model) + ')가 만들고 ' + esc(P.org || '담당자') + '가 승인했어요' : (P.org ? '<br>' + esc(P.org) : ''));
  $('#grades').innerHTML = GRADES.map(function (g) { return '<button class="grade ' + (state.grade === g.id ? 'on' : '') + '" data-g="' + g.id + '"><b>' + g.label + '</b><small>' + g.sub + '</small></button>'; }).join('');
  var mine = !PRESETS.some(function (p) { return sameLook(state.look, p[1]); });
  $('#avatars').innerHTML = PRESETS.map(function (p, i) { return '<button class="preset ' + (sameLook(state.look, p[1]) ? 'on' : '') + '" data-av="' + i + '" aria-label="' + esc(p[0]) + '">' + lookSVG(p[1], 'pv') + '<small>' + esc(p[0]) + '</small></button>'; }).join('') +
    (mine ? '<button class="preset on" data-av="mine" aria-label="내가 꾸민 캐릭터">' + lookSVG(state.look, 'pv') + '<small>✏️ 내가 꾸민</small></button>' : '');
  $('#fabBearName').textContent = P.mascot.name;
}
$('#grades').addEventListener('click', function (e) { var b = e.target.closest('[data-g]'); if (!b) return; SFX.init(); SFX.click(); state.grade = +b.dataset.g; save(); renderStart(); });
$('#avatars').addEventListener('click', function (e) { var b = e.target.closest('[data-av]'); if (!b || b.dataset.av === 'mine') return; SFX.init(); SFX.click(); state.look = okLook(PRESETS[+b.dataset.av][1]); save(); renderStart(); if (world) world.setAvatar(state.look); });
$('#btnCustom').addEventListener('click', function () { SFX.init(); SFX.click(); openWardrobe('look'); });
$('#btnPacks').addEventListener('click', function () { openPacks(); });
$('#btnStart').addEventListener('click', function () {
  SFX.init(); SFX.click(); TTS.pick();
  $('#start').hidden = true; $('#hud').hidden = false; $('#fabs').hidden = false;
  if (world) world.setAvatar(state.look); if (pref('gq.bgm', '1') === '1') SFX.bgm(true);
  updateHUD(); checkUnlocks();
  if (!checkHomework()) { var anyDone = ZONES.some(function (z) { return state.zones[z.id].cleared; }); setTimeout(function () { if (modal.hidden) { if (!anyDone && !state.tips) openEarth(); else toast('어서 와! 친구들이 기다리고 있어요'); } }, 700); }
  var h = $('#hint'); h.hidden = false; setTimeout(function () { h.hidden = true; }, 9000); refreshTalk();
});
$('#fabLearn').addEventListener('click', function () { SFX.init(); SFX.click(); openLearnHub(); });
$('#fabBear').addEventListener('click', function () { SFX.init(); SFX.click(); openBear(); });
$('#fabWear').addEventListener('click', function () { SFX.init(); SFX.click(); openWardrobe(); });
$('#fabPhoto').addEventListener('click', function () { SFX.init(); openPhoto(); });
$('#fabJump').addEventListener('click', function () { SFX.init(); if (world) world.jump(); });
$('#btnMenu').addEventListener('click', function () { SFX.init(); openMenu(); });
$('#btnSound').addEventListener('click', function () { SFX.init(); SFX.setMuted(!SFX.muted()); if (SFX.muted()) TTS.stop(); updateSoundBtn(); });
updateSoundBtn();

var packReady = false, threeReady = !!window.THREE;
PK.load().then(function (r) {
  P = r.pack; ZONES = P.zones; ZMAP = {}; ZONES.forEach(function (z) { ZMAP[z.id] = z; });
  P.cards.forEach(function (c) { CARD[c.id] = c; }); BANK = P.bank; ACTIONS = P.actions;
  CARD_IDX = TX.buildIndex(P.cards, function (c) { return c.title + ' ' + c.title + ' ' + (c.keys || '') + ' ' + (c.keys || '') + ' ' + c.text; });
  SAVE_KEY = 'gq.state.' + P.id; loadState(); renderStart();
  if (r.error) setTimeout(function () { toast(r.error, 4500); }, 400);
  packReady = true; if (threeReady) boot();
});
function boot() {
  if (!packReady || !window.THREE || world) return;
  try {
    world = window.GQWorld.create($('#c'), { pack: P,
      onNear: function (t) { nearT = t; refreshTalk(); },
      onTalk: function (t) { if (!modal.hidden || !$('#start').hidden) return; onTalk(t); },
      onSpot: function (t) { if (!modal.hidden || !$('#start').hidden) return; handleSpot(t); },
      onUserGesture: function () { SFX.init(); }, onSeed: function (id) { onSeed(id); }, onJump: function () { SFX.boing(); } });
  } catch (e) { var n = $('#nogl'); n.textContent = '이 브라우저에서는 3D 화면을 열 수 없어요. 최신 크롬·엣지·사파리에서 열어 주세요. (' + e.message + ')'; n.hidden = false; return; }
  window.__gqWorld = world;
  world.setHat(state.hat || 'none'); world.setAvatar(state.look); world.seedsTaken(state.seeds);
  ZONES.forEach(function (z) { var st = state.zones[z.id]; if (st.cleared) world.clearZone(z.id, true); else if (st.partial) world.removeSmog(z.id, st.partial); Object.keys(st.spots || {}).forEach(function (id) { world.spotDone(id, true); }); });
  if (state.activeMission && ZMAP[state.activeMission] && !state.zones[state.activeMission].cleared) { world.missionOn(state.activeMission); var am = ZMAP[state.activeMission]; if (am.template === 'ride' && state.zones[am.id].spots[am.mission.spots[0].id]) world.bike(true); } else state.activeMission = null;
  setInterval(function () { if (QUEST && QUEST.target === 'seed') world.setGuide(world.nextSeed()); else if (QUEST && QUEST.target === 'spot') world.setGuide(world.nextSpot(state.activeMission)); }, 1500);
  updateHUD(true); if (state.finale) world.celebrate();
}
addEventListener('three-ready', function () { threeReady = true; boot(); }, { once: true });
})();
