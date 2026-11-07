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
  /* 배경음악: 잔잔한 패드 화음 + 오르골 같은 음 + 가끔 새소리 (C–Am–F–G, 한 마디 4.8초) */
  var bgmOn = false, bgmTimer = 0, bgmBus = null, nextBar = 0, bar = 0, BAR = 4.8;
  var PROG = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]];
  function bus() { if (bgmBus) return bgmBus; var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; var g = ctx.createGain(); g.gain.value = 0.9; lp.connect(g).connect(master); bgmBus = lp; return lp; }
  function pad(fq, t, dur) { var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = fq; o2.frequency.value = fq * 1.003; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.016, t + 1.5); g.gain.linearRampToValueAtTime(0.012, t + dur - 1.2); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6); o.connect(g); o2.connect(g); g.connect(bus()); o.start(t); o2.start(t); o.stop(t + dur + 0.8); o2.stop(t + dur + 0.8); }
  function pluck(fq, t, v) { var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = fq; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.026, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8); o.connect(g).connect(bus()); o.start(t); o.stop(t + 1.9); }
  function chirp(t) { [0, 0.16].forEach(function (d) { var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(2600, t + d); o.frequency.exponentialRampToValueAtTime(3600, t + d + 0.07); g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.006, t + d + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.09); o.connect(g).connect(master); o.start(t + d); o.stop(t + d + 0.12); }); }
  function bgmTick() { if (!bgmOn || !ctx || muted || document.hidden) { if (ctx) nextBar = Math.max(nextBar, ctx.currentTime + 0.2); return; } if (nextBar < ctx.currentTime) nextBar = ctx.currentTime + 0.1; while (nextBar < ctx.currentTime + 1.2) { var c = PROG[bar % PROG.length], t = nextBar; c.forEach(function (fq) { pad(fq / 2, t, BAR); }); for (var k = 0; k < 4; k++) if (k === 0 || Math.random() < 0.7) pluck(c[Math.floor(Math.random() * 3)] * (Math.random() < 0.3 ? 4 : 2), t + k * BAR / 4 + Math.random() * 0.05, k === 0 ? 0.03 : 0.02); if (Math.random() < 0.18) chirp(t + 1 + Math.random() * 2.5); bar++; nextBar += BAR; } }
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
    /* 자연 소리: 소리 파일 없이 브라우저에서 만들어요 (빗소리·숲·파도·모닥불) */
    nature: function (kind) {
      if (!ctx) return; var N = this._n || (this._n = { nodes: [], timers: [] }); N.nodes.forEach(function (n) { try { n.stop ? n.stop() : 0; } catch (e) {} try { n.disconnect(); } catch (e) {} }); N.timers.forEach(clearInterval); N.nodes = []; N.timers = []; if (!kind || kind === 'none') return;
      if (!this._buf) { var len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), dd = b.getChannelData(0); for (var i = 0; i < len; i++) dd[i] = Math.random() * 2 - 1; this._buf = b; }
      var buf = this._buf, out = ctx.createGain(); out.gain.value = 0; out.connect(master); out.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5); N.nodes.push(out);
      function noise(type, freq, q, vol) { var s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; var g = ctx.createGain(); g.gain.value = vol; s.connect(f).connect(g).connect(out); s.start(); N.nodes.push(s, f, g); return g; }
      function burst(type, freq, vol, dur) { if (muted || document.hidden) return; var s = ctx.createBufferSource(); s.buffer = buf; var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; var g = ctx.createGain(), t = ctx.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 1.5, dur + 0.05); }
      function chirp() { if (muted || document.hidden) return; var t = ctx.currentTime, f0 = 2200 + Math.random() * 1600; [0, 0.13, 0.26].slice(0, 1 + Math.floor(Math.random() * 3)).forEach(function (d) { var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t + d); o.frequency.exponentialRampToValueAtTime(f0 * 1.35, t + d + 0.07); g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.012, t + d + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.1); o.connect(g).connect(out); o.start(t + d); o.stop(t + d + 0.12); }); }
      if (kind === 'rain') { noise('lowpass', 5200, 0, 0.11); noise('highpass', 1800, 0, 0.035); N.timers.push(setInterval(function () { if (Math.random() < 0.7) burst('bandpass', 2500 + Math.random() * 2500, 0.05, 0.05); }, 90)); }
      if (kind === 'forest') { var wind = noise('bandpass', 420, 0.6, 0.06); var up = true; N.timers.push(setInterval(function () { var t = ctx.currentTime; wind.gain.cancelScheduledValues(t); wind.gain.linearRampToValueAtTime(up ? 0.11 : 0.04, t + 4); up = !up; }, 4200)); N.timers.push(setInterval(function () { if (Math.random() < 0.45) chirp(); }, 1400)); }
      if (kind === 'waves') { var sea = noise('lowpass', 650, 0, 0.02); var hi = true; var swell = function () { var t = ctx.currentTime; sea.gain.cancelScheduledValues(t); sea.gain.setValueAtTime(sea.gain.value, t); sea.gain.linearRampToValueAtTime(hi ? 0.2 : 0.025, t + (hi ? 2.6 : 4.4)); hi = !hi; }; swell(); N.timers.push(setInterval(swell, 3500)); }
      if (kind === 'fire') { noise('lowpass', 900, 0, 0.07); N.timers.push(setInterval(function () { if (Math.random() < 0.55) burst('highpass', 1800 + Math.random() * 3000, 0.07 + Math.random() * 0.05, 0.03 + Math.random() * 0.04); }, 110)); }
    },
    bgm: function (v) { if (v === undefined) return bgmOn; bgmOn = !!v; clearInterval(bgmTimer); if (bgmOn) { if (ctx) nextBar = ctx.currentTime + 0.1; bgmTick(); bgmTimer = setInterval(bgmTick, 400); } },
    muted: function () { return muted; },
    setMuted: function (m) { muted = m; setPref('gq.mute', m ? '1' : '0'); if (master) master.gain.value = m ? 0 : 0.5; }
  };
})();
var TTS = {
  on: pref('gq.tts2', '0') === '1', voice: null,
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
  var n = spotsDone(), cs = co2Sum(); $('#feverSub').textContent = n ? (cs.year > 0 ? '🧮 내가 체험으로 줄인 탄소 1년 ' + fmtKg(cs.year) + ' · 소나무 ' + treesOf(cs.year) + '그루 몫' : '✅ 실천 ' + n + '개 → ☁️ 걱정 구름 ' + cloudsGone() + '개 사라짐') : '친구들과 직접 체험하면 내려가요';
  if (world) world.setClean(k, instant); updateQuest();
}
/* 실천 → 지구 효과 (체험 하나를 마칠 때마다 "그래서 지구는?"을 눈에 보이게) */
var fxT = 0;
function chainHTML(chain) { return '<div class="chain">' + (chain || []).map(function (c, i) { return (i ? '<i>→</i>' : '') + '<span class="ch">' + esc(c) + '</span>'; }).join('') + '</div>'; }
function spotsDone() { return ZONES.reduce(function (s, z) { return s + missionDoneCount(z.id); }, 0); }
function cloudsGone() { return ZONES.reduce(function (s, z) { var st = state.zones[z.id]; return s + (st.cleared ? 5 : Math.min(5, st.partial || 0)); }, 0); }
/* 체험마다 줄인 탄소: 팩의 spot.co2 = { kg(이번 한 번), times(1년 횟수), per, basis(계산식) } */
var TREE_KG = 6.6;
function treesOf(kg) { var t = kg / ((P && P.calc && P.calc.factors && P.calc.factors.tree) || TREE_KG); return t >= 10 ? Math.round(t) : Math.round(t * 10) / 10; }
function fmtKg(kg) { return kg >= 100 ? Math.round(kg).toLocaleString() + 'kg' : kg >= 1 ? (Math.round(kg * 10) / 10) + 'kg' : Math.round(kg * 1000) + 'g'; }
function co2Sum() {
  var now = 0, year = 0, list = [];
  ZONES.forEach(function (z) { var d = state.zones[z.id].spots || {}; z.mission.spots.forEach(function (s) { if (d[s.id] && s.co2) { now += s.co2.kg; year += s.co2.kg * s.co2.times; list.push({ z: z, s: s }); } }); });
  return { now: now, year: year, list: list };
}
function co2Line(d) {
  var c = d.co2; if (!c) return '';
  if (!c.kg) return '<div class="fx-co2"><b>🧮 탄소 계산</b><span>' + esc(c.basis) + '</span></div>';
  var y = c.kg * c.times, all = co2Sum();
  return '<div class="fx-co2"><b>🧮 이 체험으로 줄인 탄소 ' + fmtKg(c.kg) + '</b>' + (c.times > 1 ? '<span>' + esc(c.per) + ' 기준 · 1년 내내 하면 <b>' + fmtKg(y) + '</b> (소나무 ' + treesOf(y) + '그루 몫)</span>' : '<span>소나무 ' + treesOf(y) + '그루 몫</span>') +
    '<small>계산: ' + esc(c.basis) + '</small><em>지금까지 체험으로 줄인 탄소 · 1년 ' + fmtKg(all.year) + '</em></div>';
}
function showEffect(zone, d, delta) {
  var z = ZMAP[zone], M = z.mission, el = $('#effect');
  el.innerHTML = '<div class="fx-head"><span>' + M.icon + '</span><b>' + esc(d.act ? d.act.replace(/^\S+\s/, '') : d.label) + '</b> 완료 → 그래서 지구는?</div>' + chainHTML(M.chain) +
    (d.effect ? '<p class="fx-text">' + esc(d.effect) + '</p>' : '') + co2Line(d) +
    '<div class="fx-meter">🌡️ ' + esc(P.hub.meter) + ' <b>' + (delta > 0 ? '−' + delta + '%' : '곧 내려가요') + '</b> · ☁️ 걱정 구름 ' + cloudsGone() + '개 사라짐 · ✅ 실천 ' + spotsDone() + '개</div>';
  el.hidden = false; var hb = 0; ['#hud .hud-left', '#stamps'].forEach(function (q) { var r = $(q) && $(q).getBoundingClientRect(); if (r && r.left < 420) hb = Math.max(hb, r.bottom); });
  el.style.top = Math.round(hb + 8) + 'px'; el.style.maxHeight = Math.max(160, innerHeight - hb - 150) + 'px';
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); clearTimeout(fxT); fxT = setTimeout(function () { el.hidden = true; }, 10000);
  if (delta > 0) { var fd = $('#feverDelta'); fd.textContent = '−' + delta + '%'; fd.hidden = false; fd.classList.remove('pop'); void fd.offsetWidth; fd.classList.add('pop'); setTimeout(function () { fd.hidden = true; }, 2600); }
}
$('#effect').addEventListener('click', function () { this.hidden = true; });
function impactHTML() {
  var n = spotsDone(); if (!n) return '';
  var heat = Math.round((1 - cleanLevel()) * 100), cs = co2Sum();
  var zoneYear = function (z) { return cs.list.filter(function (x) { return x.z === z; }).reduce(function (s, x) { return s + x.s.co2.kg * x.s.co2.times; }, 0); };
  return '<div class="impact"><b>📊 네 체험이 만든 변화</b><div class="impact-nums"><span>✅ 실천 <b>' + n + '</b>개</span>' + (cs.year > 0 ? '<span>🧮 줄인 탄소 1년 <b>' + fmtKg(cs.year) + '</b></span><span>🌲 소나무 <b>' + treesOf(cs.year) + '</b>그루 몫</span>' : '') + '<span>🌡️ ' + esc(P.hub.meter) + ' 100% → <b>' + heat + '%</b></span></div><ul>' +
    ZONES.filter(function (z) { return missionDoneCount(z.id) > 0; }).map(function (z) { var M = z.mission, zy = zoneYear(z); return '<li style="--zc:' + z.color + '"><span>' + M.icon + '</span><div><b>' + esc(M.title) + ' ' + missionDoneCount(z.id) + '/' + missionTotal(z.id) + (zy > 0 ? ' · 1년 −' + fmtKg(zy) : '') + '</b>' + chainHTML(M.chain) + '</div></li>'; }).join('') + '</ul>' +
    (cs.year > 0 ? '<details class="evsmall"><summary>🧮 탄소 계산 근거 보기</summary><ul>' + cs.list.filter(function (x) { return x.s.co2.kg > 0; }).map(function (x) { return '<li><b>' + esc(x.s.label) + '</b> ' + fmtKg(x.s.co2.kg) + ' × ' + x.s.co2.times + '번 = ' + fmtKg(x.s.co2.kg * x.s.co2.times) + ' · ' + esc(x.s.co2.basis) + '</li>'; }).join('') + '</ul></details>' : '') + '<button class="ghost card-btn" data-act="card">🏅 내 실천 인증 카드 만들기</button></div>';
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
      state.activeMission = zone; save(); if (world) world.missionOn(zone); grpShare('start', zone, '');
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
  grpShare('spot', zone, id);
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
    '<div class="sowhat"><b>🌍 그래서 지구는?</b>' + chainHTML(M.chain) + (function () { var y = M.spots.reduce(function (t, x) { return t + (x.co2 ? x.co2.kg * x.co2.times : 0); }, 0); return y > 0 ? '<p class="fx-co2"><b>🧮 이 체험을 1년 동안 하면 탄소 −' + fmtKg(y) + '</b><span>소나무 ' + treesOf(y) + '그루가 1년 동안 빨아들이는 양이에요</span></p>' : ''; })() + '</div>' +
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
    if (!w.ai) aiReexplain(it, chosen, fb);
  }
}
function lvInfo() { return PK.LEVELS.find(function (l) { return l.id === level(); }) || PK.LEVELS[0]; }
function aiReexplain(it, chosen, fb) {
  if (!window.GQAI || !GQAI.ready()) return;
  var card = CARD[it.ev]; if (!card) return; var p = fb.querySelector('.bear-say p'); if (!p) return;
  var cur = Q && Q.cur, L = lvInfo();
  var pick = it.type === 'ox' ? chosen : it.options[chosen], right = it.type === 'ox' ? it.answer : it.options[it.answer];
  var note = document.createElement('small'); note.className = 'aimark'; note.textContent = '✨ AI 선생님이 네 답에 맞춰 다시 설명하는 중…'; p.parentNode.appendChild(note);
  GQAI.chat([{ role: 'system', content: '너는 환경교육 마스코트 "' + P.mascot.name + '"야. 대상: ' + L.label + ' (' + L.desc + ')\n학생이 문제를 틀렸어. 학생이 고른 답을 먼저 이해해 주고("그렇게 생각할 수도 있어"), [근거 카드] 내용만으로 왜 정답이 맞는지 2~3문장으로 쉽게 다시 설명해. 카드에 없는 사실·숫자 금지, 겁주는 말 금지, 이모지·인사 금지.' },
    { role: 'user', content: '문제: ' + it.q + (it.type === 'choice' ? '\n보기: ' + it.options.join(' / ') : '') + '\n학생이 고른 답: ' + pick + '\n정답: ' + right + '\n[근거 카드] ' + card.title + ': ' + card.text }], { maxTokens: 300 })
    .then(function (t) {
      if (!Q || Q.cur !== cur) return;
      var v = GQAI.verify(t, { maxLen: 260, ground: card.text, numbers: card.text + ' ' + it.q + ' ' + (it.options || []).join(' ') });
      if (!v.ok) { note.textContent = '📗 기본 설명을 보여 줘요 (AI 설명이 검증에서 걸러짐: ' + v.why + ')'; return; }
      p.textContent = v.text; note.textContent = '✨ AI 선생님이 네가 고른 답에 맞춰 다시 설명했어요 · 근거: ' + card.title; TTS.speak(v.text, 'bear');
    }, function () { note.textContent = '📗 기본 설명을 보여 줘요'; });
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
  var aiOn = window.GQAI && GQAI.ready();
  openModal('<div class="who" style="--zc:#8fd3ff"><span class="ava">📚</span><div><b>' + (aiOn ? '✨ AI 배움터' : '배움터') + '</b><small>' + madeBy + '</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<div class="lab">' + (P.calc ? '<button class="pick-big lab-calc" data-act="calc"><span>' + P.calc.icon + '</span><b>' + esc(P.calc.title) + '</b><small>내 하루 이산화탄소를 계산하고' + (aiOn ? ' AI 코치가' : '') + ' 줄이는 방법을 알려 줘요</small></button>' : '') +
    '<button class="pick-big lab-ask" data-act="ask"><span>💬</span><b>' + (aiOn ? 'AI 선생님 ' : '') + esc(P.mascot.name) + '에게 묻기</b><small>' + (aiOn ? '궁금한 걸 물으면 근거 카드 안에서 AI가 대답해요' : '이야기 카드에서 찾아서 대답해요') + '</small></button>' +
    '<button class="pick-big lab-learn" data-act="learn"><span>📖</span><b>배우기</b><small>주제를 고르면 ' + esc(GRADES[state.grade].label) + ' 눈높이 짧은 수업 + 확인 문제</small></button>' +
    '<button class="pick-big lab-quiz" data-act="quiz"><span>📝</span><b>문제 풀기</b><small>틀리면 ' + (aiOn ? 'AI가 네 답에 맞춰' : '') + ' 다시 설명해 줘요</small></button></div>', { cls: 'menu lab-card' });
  mcard.onclick = function (e) {
    if (e.target.closest('[data-act="calc"]')) { SFX.click(); openCalc(); return; }
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
/* ------------------------------------------------------------
   🧮 내 탄소 재기 — 계산은 정해진 계수로(팩의 calc), AI는 코칭만 (숫자 대조 검증)
   ------------------------------------------------------------ */
function r2(x) { return Math.round(x * 100) / 100; }
function calcItems(ans) {
  var C = P.calc, km = 1;
  C.questions.forEach(function (q) { if (q.km && ans[q.id] != null) km = q.options[ans[q.id]].v; });
  var kgOf = function (o) { return o.kg != null ? o.kg : (o.perKm || 0) * km * 2; };
  return C.questions.filter(function (q) { return !q.km && ans[q.id] != null; }).map(function (q) {
    var o = q.options[ans[q.id]], kg = kgOf(o), best = q.bestIdx != null ? q.options[q.bestIdx] : q.options.slice().sort(function (a, b) { return kgOf(a) - kgOf(b); })[0], bk = kgOf(best);
    return { q: q, opt: o, kg: r2(kg), save: r2(Math.max(0, kg - bk)), days: q.days || 365 };
  });
}
function openCalcChoice() {
  openModal('<div class="who" style="--zc:#7fcd6b"><span class="ava">🧮</span><div><b>내 탄소 재기</b><small>오늘 내가 내보낸 탄소를 재고, 줄이는 방법을 찾아요</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<div class="lab"><button class="pick-big lab-calc" data-act="diary"><span>🗣️</span><b>오늘 하루를 말로 (AI)</b><small>"엄마 차로 5km, 에어컨 22도 3시간"처럼 쓰면 AI가 행동을 찾아 계산해요</small></button>' +
    '<button class="pick-big lab-learn" data-act="buttons"><span>👆</span><b>버튼으로 골라 재기</b><small>등교·에어컨·플러그·불 다섯 가지를 골라요</small></button></div>', { cls: 'menu' });
  mcard.onclick = function (e) { var a = e.target.closest('[data-act]'); if (!a) return; SFX.click(); if (a.dataset.act === 'close') closeModal(); if (a.dataset.act === 'diary') openDiary(); if (a.dataset.act === 'buttons') openCalc(true); };
}
function openCalc(direct) {
  if (!direct && window.GQAI && GQAI.ready()) { openCalcChoice(); return; }
  var C = P.calc; if (!C) return; var ans = {}, i = 0, qs = C.questions;
  function needKm() { var g = qs.find(function (q) { return q.id === 'go'; }); return !g || ans.go == null || g.options[ans.go].perKm; }
  function steps() { return qs.filter(function (q) { return !q.km || needKm(); }); }
  function ask() {
    var list = steps(), q = list[i];
    openModal('<div class="who" style="--zc:#7fcd6b"><span class="ava">' + C.icon + '</span><div><b>' + esc(C.title) + ' · ' + (i + 1) + '/' + list.length + '</b><small>' + esc(C.intro) + '</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
      '<div class="slide-dots">' + list.map(function (_, k) { return '<i class="' + (k <= i ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
      '<h3 class="calc-q">' + esc(q.q) + '</h3><div class="calc-opts">' + q.options.map(function (o, k) { return '<button class="calc-opt' + (ans[q.id] === k ? ' on' : '') + '" data-k="' + k + '">' + esc(o.t) + '</button>'; }).join('') + '</div>' +
      '<div class="btns">' + (i > 0 ? '<button class="ghost" data-act="prev">◀ 이전</button>' : '') + '</div>', { cls: 'calc' });
    TTS.speak(q.q, 'bear');
    mcard.onclick = function (e) {
      var b = e.target.closest('[data-k]'); if (b) { SFX.click(); ans[q.id] = +b.dataset.k; var l2 = steps(); if (i < l2.length - 1) { i++; ask(); } else result(); return; }
      var a = e.target.closest('[data-act]'); if (!a) return; if (a.dataset.act === 'close') closeModal(); if (a.dataset.act === 'prev') { i = Math.max(0, i - 1); ask(); }
    };
  }
  function result() {
    var items = calcItems(ans), day = r2(items.reduce(function (s, x) { return s + x.kg; }, 0)), year = Math.round(items.reduce(function (s, x) { return s + x.kg * x.days; }, 0)), tree = C.factors.tree, trees = Math.round(year / tree * 10) / 10;
    var chg = items.filter(function (x) { return x.save >= 0.01; }).sort(function (a, b) { return b.save * b.days - a.save * a.days; }).slice(0, 3).map(function (x) { var y = Math.round(x.save * x.days); return Object.assign(x, { year: y, trees: Math.round(y / tree * 10) / 10 }); });
    var maxKg = Math.max.apply(null, items.map(function (x) { return x.kg; }).concat([0.01]));
    state.carbon = { day: day, year: year, date: today() }; save();
    var evs = items.map(function (x) { return x.q.ev; }).concat([C.treeEv]).filter(function (id, k, a) { return id && CARD[id] && a.indexOf(id) === k; });
    var aiOn = window.GQAI && GQAI.ready();
    var fallback = chg.length ? '가장 크게 줄일 수 있는 건 "' + chg[0].q.best + '"이야. ' + chg[0].q.bestWhy + ' 이것만 바꿔도 1년에 약 ' + chg[0].year + 'kg을 줄일 수 있어. 오늘 하나만 골라서 해 볼래?' : '와, 이미 지구를 아끼는 생활을 하고 있구나! 지금 습관을 친구와 가족에게도 알려 주자.';
    openModal('<div class="who" style="--zc:#7fcd6b"><span class="ava">' + C.icon + '</span><div><b>' + esc(C.title) + ' 결과</b><small>' + esc(lvInfo().label) + ' · 오늘 고른 생활 기준</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
      '<div class="calc-total"><div><small>내 하루 이산화탄소</small><b>' + day.toFixed(2) + '<i>kg</i></b></div><div><small>1년으로 치면</small><b>' + year + '<i>kg</i></b></div><div><small>소나무가 1년 동안 빨아들이는 양으로</small><b>' + trees + '<i>그루</i></b></div></div>' +
      '<ul class="calc-bars">' + items.map(function (x) { return '<li><span>' + esc(x.q.q.replace(/\s*\(.*\)$/, '')) + '</span><div class="bar"><i style="width:' + Math.max(2, Math.round(x.kg / maxKg * 100)) + '%"></i></div><b>' + x.kg.toFixed(2) + 'kg</b></li>'; }).join('') + '</ul>' +
      (chg.length ? '<div class="calc-chg"><b>🌱 이렇게 바꾸면</b>' + chg.map(function (x, k) { return '<label class="chg"><input type="radio" name="pledge" value="' + k + '"' + (k === 0 ? ' checked' : '') + '><span><b>' + esc(x.q.best) + '</b><small>1년 −' + x.year + 'kg · 소나무 ' + x.trees + '그루 몫</small></span></label>'; }).join('') + '</div>' : '') +
      '<div class="coach"><span class="ava">' + AE[P.mascot.animal] + '</span><div><p id="coachText">' + esc(aiOn ? 'AI 탄소 코치가 네 결과를 보고 있어…' : fallback) + '</p><small class="aimark" id="coachNote">' + (aiOn ? '✨ AI 탄소 코치' : '📗 기본 코칭') + '</small></div></div>' +
      '<details class="evsmall"><summary>📄 계산 근거 보기</summary><p>' + esc(C.note) + '</p><ul>' + evs.map(function (id) { return '<li><b>' + esc(CARD[id].title) + '</b> ' + esc(CARD[id].text) + '</li>'; }).join('') + '</ul></details>' +
      '<div class="btns">' + (chg.length ? '<button class="primary big" data-act="pledge" data-autofocus>이 실천 약속하기 🌱</button>' : '') + '<button class="ghost" data-act="card">🏅 인증 카드</button><button class="ghost" data-act="again">다시 재기</button><button class="ghost" data-act="close">닫기</button></div>', { cls: 'calc' });
    SFX.fanfare(); if (world) world.cheer();
    if (aiOn) {
      var shown = '하루 ' + day.toFixed(2) + 'kg, 1년 ' + year + 'kg, 소나무 ' + trees + '그루 ' + items.map(function (x) { return x.kg.toFixed(2); }).join(' ') + ' ' + chg.map(function (x) { return x.year + 'kg ' + x.trees + '그루'; }).join(' ');
      var facts = evs.map(function (id) { return CARD[id].title + ': ' + CARD[id].text; }).join('\n'), L = lvInfo();
      GQAI.chat([{ role: 'system', content: '너는 탄소중립 체험실의 AI 탄소 코치 "' + P.mascot.name + '"야. 대상: ' + L.label + ' (' + L.desc + ')\n학생의 하루 생활로 계산한 결과를 보고 3~4문장으로 코칭해. ① 잘하고 있는 점 하나 칭찬 ② 가장 효과 큰 바꾸기 하나와 그 이유(근거 사실로) ③ 바꾸면 줄어드는 양을 아래 숫자 그대로 ④ 오늘 해 볼 한 가지 약속 제안. 아래에 없는 숫자는 절대 쓰지 마. 다정한 반말, 겁주는 말·이모지 금지.' },
        { role: 'user', content: '[학생의 선택]\n' + items.map(function (x) { return '- ' + x.q.q + ' → ' + x.opt.t.replace(/^\W+\s*/, '') + ' (하루 ' + x.kg.toFixed(2) + 'kg)'; }).join('\n') + '\n[합계] 하루 ' + day.toFixed(2) + 'kg, 1년 ' + year + 'kg, 소나무 ' + trees + '그루가 1년 동안 빨아들이는 양\n[바꾸면 줄어드는 양]\n' + (chg.length ? chg.map(function (x) { return '- ' + x.q.best + ': 1년 ' + x.year + 'kg (소나무 ' + x.trees + '그루 몫)'; }).join('\n') : '- 이미 가장 좋은 선택을 했어요') + '\n[근거 사실]\n' + facts }], { maxTokens: 420 })
        .then(function (t) {
          var el = $('#coachText'), nt = $('#coachNote'); if (!el) return; var v = GQAI.verify(t, { maxLen: 380, numbers: shown + ' ' + facts });
          if (v.ok) { el.textContent = v.text; nt.textContent = '✨ AI 탄소 코치 · 숫자는 계산 결과와 대조해 확인했어요'; TTS.speak(v.text, 'bear'); }
          else { el.textContent = fallback; nt.textContent = '📗 기본 코칭 (AI 답이 검증에서 걸러짐: ' + v.why + ')'; }
        }, function () { var el = $('#coachText'); if (el) { el.textContent = fallback; $('#coachNote').textContent = '📗 기본 코칭 (AI 연결 안 됨)'; } });
    } else TTS.speak(fallback, 'bear');
    mcard.onclick = function (e) {
      var a = e.target.closest('[data-act]'); if (!a) return; var act = a.dataset.act;
      if (act === 'close') closeModal(); if (act === 'card') openCard(); if (act === 'again') { ans = {}; i = 0; ask(); }
      if (act === 'pledge') { var r = mcard.querySelector('input[name="pledge"]:checked'), x = chg[r ? +r.value : 0]; state.homework = { text: x.q.best + ' (1년 −' + x.year + 'kg)', why: x.q.bestWhy, ev: x.q.ev, date: today(), done: false }; save(); SFX.fanfare(); confetti(30); toast('🌱 약속했어요! 다음에 오면 "해 봤어?" 하고 물어볼게요', 3600); closeModal(); }
    };
  }
  ask();
}

/* ------------------------------------------------------------
   🗣️ AI 하루 탄소 일기 — AI는 문장에서 행동만 뽑고(근거 문구 대조), 숫자는 계수로 계산
   ------------------------------------------------------------ */
var KWH = 0.4781;
var DIARY = {
  car_km: { name: '승용차 이동', unit: 'km', f: 0.21, max: 300, ev: 'T9', how: '승용차 0.21kg/km' },
  bus_km: { name: '버스·지하철', unit: 'km', f: 0.05, max: 300, ev: 'T11', how: '대중교통 0.05kg/km(대략)' },
  walk_km: { name: '걷기·자전거', unit: 'km', f: 0, max: 60, ev: 'T2', good: true, how: '배출 0 · 자동차 대신이면 0.21kg/km 절약' },
  ac_hours: { name: '에어컨', unit: '시간', ac: true, max: 24, ev: 'H13', how: '1시간 약 1kWh(26℃ 기준, 1℃ 낮출 때 +7%) × 0.4781' },
  fan_hours: { name: '선풍기', unit: '시간', f: 0.05 * KWH, max: 24, ev: 'H3', how: '1시간 0.05kWh × 0.4781' },
  device_hours: { name: 'TV·게임·컴퓨터', unit: '시간', f: 0.1 * KWH, max: 20, ev: 'H1', how: '1시간 약 0.1kWh × 0.4781(대략)' },
  light_hours: { name: '빈 방 불 켜 둠', unit: '시간', f: 0.04 * KWH, max: 24, ev: 'H5', how: '형광등 40W 1시간 0.04kWh × 0.4781' },
  plug_left: { name: '안 쓰는 플러그 꽂아 둠', unit: '일', f: 0.6 * KWH, max: 1, ev: 'H14', how: '집 대기전력 하루 0.6kWh × 0.4781' },
  food_waste_g: { name: '남긴 음식', unit: 'g', f: 0.00165, max: 3000, ev: 'R7', how: '음식물 쓰레기 1.65kg/kg(환경부 LCA)' },
  cup: { name: '일회용 컵·페트병', unit: '개', f: 0.086, max: 30, ev: 'R5', how: '일회용품 0.086kg/개' },
  paper: { name: '종이 사용', unit: '장', f: 0.00525, max: 1000, ev: 'F5', how: '종이 0.00525kg/장' },
  recycle_kg: { name: '분리배출', unit: 'kg', f: -1.5, max: 30, ev: 'R1', good: true, how: '고품질 분리배출 1.5kg/kg 절감' },
  tumbler: { name: '텀블러·장바구니 사용', unit: '번', f: -0.086, max: 30, ev: 'R5', good: true, how: '일회용품 1개 0.086kg 절감' }
};
function acKwh(temp) { var t = +temp || 24; return Math.max(0.6, Math.min(1.8, 1 + 0.07 * (26 - t))); }
function diaryKg(it) { var d = DIARY[it.type]; if (d.ac) return it.amount * acKwh(it.temp) * KWH; return it.amount * d.f; }
function diaryAlt(it) { // 바꾸면 줄어드는 양 (하루)
  var a = it.amount, kg = diaryKg(it);
  switch (it.type) {
    case 'car_km': return a <= 3 ? { text: '가까운 길(' + a + 'km)은 걷거나 자전거로', save: kg, ev: 'T2' } : { text: '승용차 대신 버스·지하철(' + a + 'km)', save: a * (0.21 - 0.05), ev: 'T3' };
    case 'bus_km': return a <= 2 ? { text: '가까운 길(' + a + 'km)은 걷기', save: kg, ev: 'T2' } : null;
    case 'ac_hours': return (+it.temp || 24) < 26 ? { text: '에어컨을 26℃로(' + a + '시간)', save: kg - a * acKwh(26) * KWH, ev: 'H10' } : (a > 2 ? { text: '에어컨 1시간 덜 켜기', save: acKwh(it.temp) * KWH, ev: 'H3' } : null);
    case 'device_hours': return a >= 1 ? { text: 'TV·게임 1시간 줄이기', save: 0.1 * KWH, ev: 'H1' } : null;
    case 'light_hours': return { text: '나올 때 불 끄기', save: kg, ev: 'H5' };
    case 'plug_left': return { text: '안 쓰는 플러그 뽑기', save: kg, ev: 'H11' };
    case 'food_waste_g': return { text: '먹을 만큼만 담고 남기지 않기', save: kg, ev: 'R7' };
    case 'cup': return { text: '일회용 컵 대신 텀블러(' + a + '개)', save: kg, ev: 'R5' };
    case 'paper': return a >= 4 ? { text: '종이 양면 쓰기', save: kg / 2, ev: 'F5' } : null;
  }
  return null;
}
function normTxt(s) { return String(s || '').replace(/\s+/g, '').replace(/[.,!?~·"'“”‘’]/g, ''); }
function openDiary() {
  var ex = ['아침에 엄마 차 타고 학교 갔어. 5km쯤 돼. 점심은 조금 남겼고, 집에 와서 에어컨 22도로 3시간 켰어.', '버스로 4km 통학했고 편의점에서 페트병 음료 2개 샀어. 저녁엔 게임 2시간 하고 방 불 켜 놓고 나왔어.', '오늘은 자전거로 2km 학교 가고 급식 다 먹었어. 텀블러 들고 다녔고 우유팩 분리배출했어.'];
  openModal('<div class="who" style="--zc:#7fcd6b"><span class="ava">🗣️</span><div><b>AI 하루 탄소 일기</b><small>오늘 한 일을 말하듯 쓰면 AI가 행동을 찾고, 탄소는 공식 계수로 계산해요</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<label class="lbl">오늘 하루를 적어 봐요 (이름·학교·주소는 쓰지 않기)<textarea id="diaryIn" maxlength="300" rows="4" placeholder="예: 엄마 차로 5km 등교, 점심 조금 남김, 에어컨 22도로 3시간"></textarea></label>' +
    '<div class="chips">' + ex.map(function (t, i) { return '<button class="chip" data-ex="' + i + '">예시 ' + (i + 1) + '</button>'; }).join('') + '</div>' +
    '<p class="fine" id="diaryMsg">🔒 쓴 글은 저장하지 않아요. 개인정보는 AI로 보내기 전에 ○○로 가려요.</p>' +
    '<div class="btns"><button class="primary big" data-act="run" data-autofocus>✨ AI로 계산하기</button><button class="ghost" data-act="buttons">👆 버튼으로 재기</button></div>', { cls: 'calc' });
  setTimeout(function () { var t = $('#diaryIn'); if (t && !('ontouchstart' in window)) t.focus(); }, 60);
  mcard.onclick = function (e) {
    var x = e.target.closest('[data-ex]'); if (x) { $('#diaryIn').value = ex[+x.dataset.ex]; return; }
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'close') closeModal();
    if (a.dataset.act === 'buttons') openCalc(true);
    if (a.dataset.act === 'run') runDiary();
  };
}
function runDiary() {
  var raw = ($('#diaryIn').value || '').trim(); if (raw.length < 6) { $('#diaryMsg').textContent = '조금만 더 자세히 적어 줄래요? (예: 무엇을 타고, 몇 km, 에어컨 몇 도)'; return; }
  var m = window.GQSafety.maskPII(raw), c = window.GQSafety.checkInput(m.text);
  if (!c.ok) { $('#diaryMsg').textContent = c.reply; return; }
  var text = m.text, L = lvInfo();
  $('#diaryMsg').textContent = (m.found.length ? '🔒 ' + m.found.join('·') + '을(를) ○○로 가렸어요 · ' : '') + '✨ AI가 네 하루를 읽고 있어요…';
  mcard.querySelector('[data-act="run"]').disabled = true;
  var types = Object.keys(DIARY).map(function (k) { return '- ' + k + ': ' + DIARY[k].name + ' (단위 ' + DIARY[k].unit + ')'; }).join('\n');
  GQAI.chat([{ role: 'system', content: '너는 학생의 하루 글에서 탄소와 관련된 행동만 찾아 표로 바꾸는 도우미야. 계산은 하지 마.\n찾을 수 있는 type 목록:\n' + types + '\n규칙:\n- 글에 실제로 나온 행동만. 없는 행동을 지어내지 마.\n- amount는 숫자. 글에 숫자가 없으면 상식적으로 짐작하고 assumed를 true로(거리 모르면 3, 음식 "조금" 100g·"많이" 300g·"다 먹음"은 넣지 않음, 플러그는 1).\n- ac_hours는 temp(설정 온도 ℃)도 넣어. 모르면 24, assumed true.\n- quote에는 그 행동이 나온 글의 구절을 글자 그대로 옮겨(5~25자).\n- 목록에 없는 행동은 unclear에 짧게.\nJSON 객체 하나만 출력: {"items":[{"type":"car_km","amount":5,"quote":"엄마 차 타고","assumed":false}],"unclear":["..."]}' },
    { role: 'user', content: text }], { maxTokens: 500, temperature: 0 })
    .then(function (t) {
      var o = null; try { var s = t.indexOf('{'), en = t.lastIndexOf('}'); o = JSON.parse(t.slice(s, en + 1)); } catch (er) {}
      if (!o || !Array.isArray(o.items)) throw new Error('읽지 못함');
      var ok = [], dropped = [], src = normTxt(text);
      o.items.forEach(function (it) {
        var d = DIARY[it && it.type]; var amt = +it.amount, q = String(it.quote || '').trim();
        if (!d) { dropped.push((q || it.type) + ' — 계산할 수 없는 항목'); return; }
        if (!(amt > 0) || amt > d.max) { dropped.push(d.name + ' — 양이 이상해요(' + it.amount + ')'); return; }
        if (!q || src.indexOf(normTxt(q)) < 0) { dropped.push(d.name + ' — 글에서 근거 구절을 찾지 못함(지어냈을 수 있어 뺐어요)'); return; }
        var row = { type: it.type, amount: amt, quote: q, assumed: !!it.assumed }; if (d.ac) row.temp = Math.max(16, Math.min(30, +it.temp || 24));
        ok.push(row);
      });
      showDiary(text, ok, dropped, (o.unclear || []).slice(0, 4));
    }).catch(function () { var b = mcard.querySelector('[data-act="run"]'); if (b) b.disabled = false; $('#diaryMsg').textContent = 'AI가 지금 대답하지 못했어요. 잠시 뒤 다시 하거나 "버튼으로 재기"를 써 주세요.'; });
}
function showDiary(text, rows, dropped, unclear) {
  var tree = (P.calc && P.calc.factors && P.calc.factors.tree) || 6.6;
  rows.forEach(function (r) { r.kg = diaryKg(r); r.alt = DIARY[r.type].good ? null : diaryAlt(r); if (r.type === 'walk_km') r.avoid = r.amount * 0.21; });
  var emit = rows.filter(function (r) { return r.kg > 0; }).reduce(function (s, r) { return s + r.kg; }, 0), good = rows.reduce(function (s, r) { return s + (r.kg < 0 ? -r.kg : 0) + (r.avoid || 0); }, 0);
  var chg = rows.filter(function (r) { return r.alt && r.alt.save > 0.005; }).map(function (r) { return Object.assign({ row: r }, r.alt); }).sort(function (a, b) { return b.save - a.save; }).slice(0, 3);
  var year = Math.round(emit * 365);
  state.diary = { kg: r2(emit), good: r2(good), date: today() }; save();
  var line = function (r) { var d = DIARY[r.type]; return '<tr><td>“' + esc(r.quote) + '”' + (r.assumed ? ' <em class="assume">짐작</em>' : '') + '</td><td>' + esc(d.name) + ' ' + r.amount + d.unit + (d.ac ? ' · ' + r.temp + '℃' : '') + '</td><td class="num ' + (r.kg < 0 || r.avoid ? 'good' : '') + '">' + (r.kg < 0 ? '−' + fmtKg(-r.kg) : r.avoid ? '0 (자동차 대신 −' + fmtKg(r.avoid) + ')' : fmtKg(r.kg)) + '</td></tr>'; };
  var fallback = chg.length ? '오늘 가장 크게 줄일 수 있는 건 "' + chg[0].text + '"이야. 이것만 바꿔도 하루 ' + fmtKg(chg[0].save) + ' 줄어. 내일 하나만 해 볼래?' : (rows.length ? '오늘은 탄소를 아끼는 하루였네! 이 습관을 계속 이어 가자.' : '글에서 탄소와 관련된 행동을 찾지 못했어. 무엇을 타고 다녔는지, 에어컨·음식은 어땠는지 적어 줄래?');
  var aiOn = window.GQAI && GQAI.ready();
  openModal('<div class="who" style="--zc:#7fcd6b"><span class="ava">🗣️</span><div><b>AI 하루 탄소 일기 결과</b><small>AI는 행동만 찾고, 탄소는 공식 계수로 계산했어요</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<div class="calc-total"><div><small>오늘 내보낸 탄소</small><b>' + fmtKg(emit).replace(/(kg|g)$/, '<i>$1</i>') + '</b></div><div><small>오늘 아낀 탄소</small><b>' + fmtKg(good).replace(/(kg|g)$/, '<i>$1</i>') + '</b></div><div><small>이런 날이 1년이면</small><b>' + year + '<i>kg</i></b></div></div>' +
    (rows.length ? '<div class="tbl-wrap"><table class="diary"><thead><tr><th>내가 쓴 말</th><th>AI가 찾은 행동</th><th>탄소</th></tr></thead><tbody>' + rows.map(line).join('') + '</tbody></table></div>' : '') +
    (dropped.length || unclear.length ? '<details class="evsmall"><summary>🔍 검증에서 뺀 것 ' + (dropped.length + unclear.length) + '개</summary><ul>' + dropped.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + unclear.map(function (u) { return '<li>' + esc(String(u)) + ' — 계산 목록에 없는 행동</li>'; }).join('') + '</ul></details>' : '') +
    (chg.length ? '<div class="calc-chg"><b>🌱 내일 이렇게 바꾸면</b>' + chg.map(function (x, k) { var y = Math.round(x.save * 365); return '<label class="chg"><input type="radio" name="pledge" value="' + k + '"' + (k === 0 ? ' checked' : '') + '><span><b>' + esc(x.text) + '</b><small>하루 −' + fmtKg(x.save) + ' · 1년이면 −' + y + 'kg (소나무 ' + treesOf(y) + '그루 몫)</small></span></label>'; }).join('') + '</div>' : '') +
    '<div class="coach"><span class="ava">' + AE[P.mascot.animal] + '</span><div><p id="coachText">' + esc(aiOn && rows.length ? 'AI 탄소 코치가 네 하루를 보고 있어…' : fallback) + '</p><small class="aimark" id="coachNote">' + (aiOn && rows.length ? '✨ AI 탄소 코치' : '📗 기본 코칭') + '</small></div></div>' +
    '<details class="evsmall"><summary>📄 계산 방법 보기</summary><ul>' + rows.map(function (r) { var d = DIARY[r.type]; return '<li><b>' + esc(d.name) + '</b> ' + esc(d.how) + '</li>'; }).join('') + '<li>소나무 1그루는 1년에 약 ' + tree + 'kg을 흡수해요(산림청).</li></ul></details>' +
    '<div class="btns">' + (chg.length ? '<button class="primary big" data-act="pledge" data-autofocus>이 실천 약속하기 🌱</button>' : '') + '<button class="ghost" data-act="card">🏅 인증 카드</button><button class="ghost" data-act="again">다시 쓰기</button></div>', { cls: 'calc' });
  SFX.fanfare(); if (world) world.cheer();
  if (aiOn && rows.length) {
    var shown = fmtKg(emit) + ' ' + fmtKg(good) + ' ' + year + 'kg ' + rows.map(function (r) { return r.amount + ' ' + fmtKg(Math.abs(r.kg)) + (r.temp ? ' ' + r.temp : '') + (r.avoid ? ' ' + fmtKg(r.avoid) : ''); }).join(' ') + ' ' + chg.map(function (x) { var y = Math.round(x.save * 365); return fmtKg(x.save) + ' ' + y + 'kg ' + treesOf(y); }).join(' ') + ' 26 7';
    var L = lvInfo();
    GQAI.chat([{ role: 'system', content: '너는 탄소중립 체험실의 AI 탄소 코치 "' + P.mascot.name + '"야. 대상: ' + L.label + ' (' + L.desc + ')\n학생의 하루를 계산한 결과를 보고 3문장으로 코칭해. ① 오늘 잘한 점 하나 ② 내일 가장 효과 큰 바꾸기와 이유 ③ 줄어드는 양(아래 숫자 그대로). 아래에 없는 숫자는 쓰지 마. 다정한 반말, 겁주는 말·이모지 금지.' },
      { role: 'user', content: '[하루 계산]\n' + rows.map(function (r) { var d = DIARY[r.type]; return '- ' + d.name + ' ' + r.amount + d.unit + (r.temp ? ' ' + r.temp + '℃' : '') + ': ' + (r.kg < 0 ? '절약 ' + fmtKg(-r.kg) : r.avoid ? '배출 0, 자동차 대신 절약 ' + fmtKg(r.avoid) : '배출 ' + fmtKg(r.kg)); }).join('\n') + '\n[합계] 내보낸 탄소 ' + fmtKg(emit) + ', 아낀 탄소 ' + fmtKg(good) + ', 1년이면 ' + year + 'kg\n[바꾸면]\n' + (chg.length ? chg.map(function (x) { var y = Math.round(x.save * 365); return '- ' + x.text + ': 하루 ' + fmtKg(x.save) + ', 1년 ' + y + 'kg'; }).join('\n') : '- 없음') }], { maxTokens: 360 })
      .then(function (t) { var el = $('#coachText'), nt = $('#coachNote'); if (!el) return; var v = GQAI.verify(t, { maxLen: 320, numbers: shown }); if (v.ok) { el.textContent = v.text; nt.textContent = '✨ AI 탄소 코치 · 숫자는 계산 결과와 대조해 확인했어요'; TTS.speak(v.text, 'bear'); } else { el.textContent = fallback; nt.textContent = '📗 기본 코칭 (AI 답이 검증에서 걸러짐: ' + v.why + ')'; } },
        function () { var el = $('#coachText'); if (el) { el.textContent = fallback; $('#coachNote').textContent = '📗 기본 코칭'; } });
  } else TTS.speak(fallback, 'bear');
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return; var act = a.dataset.act;
    if (act === 'close') closeModal(); if (act === 'again') openDiary(); if (act === 'card') openCard();
    if (act === 'pledge') { var r = mcard.querySelector('input[name="pledge"]:checked'), x = chg[r ? +r.value : 0]; state.homework = { text: x.text + ' (하루 −' + fmtKg(x.save) + ')', why: '내 하루 탄소 일기에서 가장 효과가 큰 실천이에요.', ev: x.ev, date: today(), done: false }; save(); SFX.fanfare(); confetti(30); toast('🌱 약속했어요! 다음에 오면 "해 봤어?" 하고 물어볼게요', 3600); closeModal(); }
  };
}

/* ------------------------------------------------------------
   🏅 내 실천 인증 카드 — 캐릭터 · 줄인 탄소 · 소나무 · QR (이 기기에서 그려 저장)
   ------------------------------------------------------------ */
function appLink() { return window.GQ_APP_URL ? String(window.GQ_APP_URL).replace(/index\.html$/, '') : (location.origin && location.origin !== 'null' ? location.origin + location.pathname.replace(/[^/]*$/, '') : 'https://cabon-edu.vercel.app/'); }
function cardTitle(y) { return y >= 300 ? '지구 지킴 히어로' : y >= 150 ? '탄소 다이어트 고수' : y >= 50 ? '초록 실천가' : y > 0 ? '새싹 실천가' : '탄소중립 탐험가'; }
function drawCard(nick) {
  return new Promise(function (resolve) {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; var g = cv.getContext('2d');
    var cs = co2Sum(), yr = cs.year, tr = treesOf(yr), G = GRADES[state.grade], title = cardTitle(yr);
    var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#dff3ff'); bg.addColorStop(0.55, '#f3fbe9'); bg.addColorStop(1, '#cfeec0'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.85)'; roundRect(g, 60, 60, W - 120, H - 120, 48); g.fill();
    g.fillStyle = '#2f86c4'; g.font = '700 40px Jua, "Malgun Gothic", sans-serif'; g.textAlign = 'center'; g.fillText('✨ AI 탄소중립 체험실', W / 2, 140);
    g.fillStyle = '#5d7480'; g.font = '30px "Malgun Gothic", sans-serif'; g.fillText(P.title + ' · 실천 인증 카드', W / 2, 190);
    var img = new Image(); img.onload = function () {
      g.drawImage(img, W / 2 - 170, 220, 340, 400);
      g.fillStyle = '#e0a21c'; roundRect(g, W / 2 - 230, 640, 460, 70, 35); g.fill();
      g.fillStyle = '#fff'; g.font = '700 40px Jua, "Malgun Gothic", sans-serif'; g.fillText('🏅 ' + title, W / 2, 690);
      g.fillStyle = '#24414a'; g.font = '700 44px "Malgun Gothic", sans-serif'; g.fillText((nick || '탄소중립 탐험대원') + ' · ' + G.label, W / 2, 780);
      g.fillStyle = '#5d7480'; g.font = '32px "Malgun Gothic", sans-serif'; g.fillText('체험으로 줄인 탄소 (1년 동안 이어 가면)', W / 2, 850);
      g.fillStyle = '#2f7d5b'; g.font = '700 120px Jua, "Malgun Gothic", sans-serif'; g.fillText(Math.round(yr) + 'kg', W / 2, 970);
      g.fillStyle = '#24414a'; g.font = '36px "Malgun Gothic", sans-serif'; g.fillText('🌲 소나무 ' + tr + '그루가 1년 동안 빨아들이는 양', W / 2, 1030);
      var extra = []; if (state.diary) extra.push('🗣️ 하루 탄소 일기 ' + fmtKg(state.diary.kg)); if (state.homework) extra.push('🌱 약속: ' + state.homework.text.replace(/\s*\(.*\)$/, '')); extra.push('✅ 실천 ' + spotsDone() + '개 · ⭐ ' + totalStars());
      g.font = '30px "Malgun Gothic", sans-serif'; g.fillStyle = '#5d7480'; g.textAlign = 'left'; extra.slice(0, 3).forEach(function (t, i) { g.fillText(t.length > 24 ? t.slice(0, 24) + '…' : t, 120, 1115 + i * 46); });
      var d = new Date(); g.textAlign = 'left'; g.font = '26px "Malgun Gothic", sans-serif'; g.fillStyle = '#7d8f97'; g.fillText(d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate() + (P.org ? ' · ' + P.org : ''), 120, 1270);
      var qrBox = document.createElement('div'); try { new QRCode(qrBox, { text: appLink(), width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M }); } catch (er) {}
      setTimeout(function () { var q = qrBox.querySelector('canvas'); if (q) { g.fillStyle = '#fff'; g.fillRect(W - 300, 1068, 190, 190); g.drawImage(q, W - 290, 1078, 170, 170); g.textAlign = 'center'; g.fillStyle = '#5d7480'; g.font = '22px "Malgun Gothic", sans-serif'; g.fillText('QR로 나도 해 보기', W - 205, 1282); } resolve(cv); }, 60);
    };
    img.onerror = function () { resolve(cv); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(lookSVG(state.look).replace('<svg ', '<svg width="340" height="400" '));
  });
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function openCard() {
  var nick = state.name || '';
  function render() {
    openModal('<div class="who" style="--zc:#f2b93b"><span class="ava">🏅</span><div><b>내 실천 인증 카드</b><small>이 기기에서 그려요 · 별명은 어디에도 보내지 않아요</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
      '<label class="lbl">카드에 적을 별명 (빈칸도 괜찮아요)<input id="cardNick" maxlength="12" value="' + esc(nick) + '" placeholder="예: 초록별 탐험대원"></label>' +
      '<div class="card-prev" id="cardPrev"><p class="fine">카드를 그리는 중…</p></div>' +
      '<div class="btns"><button class="primary big" data-act="save" data-autofocus>카드 저장하기 💾</button><button class="ghost" data-act="redraw">별명 바꿔 다시 그리기</button></div><p class="fine" id="cardMsg">반 친구들과 나누거나 교실 게시판에 붙여 봐요. QR을 찍으면 체험실이 열려요.</p>', { cls: 'menu card-modal' });
    var url = '';
    drawCard(nick).then(function (cv) { url = cv.toDataURL('image/png'); var p = $('#cardPrev'); if (p) p.innerHTML = '<img src="' + url + '" alt="내 실천 인증 카드">'; });
    mcard.onclick = function (e) {
      var a = e.target.closest('[data-act]'); if (!a) return; var act = a.dataset.act;
      if (act === 'close') closeModal();
      if (act === 'redraw') { nick = ($('#cardNick').value || '').trim().slice(0, 12); state.name = nick; save(); render(); }
      if (act === 'save' && url) saveCard(url);
    };
  }
  render();
}
function saveCard(url) {
  var name = '실천인증카드_' + today() + '.png';
  var viaLink = function () { var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast('💾 카드를 저장했어요'); };
  if (window.claude && window.claude.use) {
    window.claude.use('downloads').then(function (dl) {
      if (!dl) { $('#cardMsg').textContent = '이 화면에서는 저장이 막혀 있어요. 카드 그림을 길게 누르거나 오른쪽 클릭해 저장해 주세요.'; return; }
      fetch(url).then(function (r) { return r.blob(); }).then(function (b) { return dl.save({ filename: name, data: b }); }).then(function () { toast('💾 카드를 저장했어요'); }, function (er) { if (er && er.code !== 'declined') $('#cardMsg').textContent = '저장하지 못했어요. 카드 그림을 길게 누르거나 오른쪽 클릭해 저장해 주세요.'; });
    }, viaLink);
  } else viaLink();
}

/* ------------------------------------------------------------
   🌿 멍 때리기 — 화면 글자는 숨기고 카메라가 천천히 마을을 돌아요. 화면을 누르면 돌아와요
   ------------------------------------------------------------ */
var MUNG = null;
function openMung() {
  var modes = [['orbit', '🌏', '마을 한 바퀴', '하늘 위에서 초록별 마을을 천천히 돌아봐요'], ['near', '🌳', '광장 산책', '동글이와 친구들 곁을 느릿느릿 돌아요'], ['sky', '☁️', '하늘멍', '누워서 구름과 하늘을 올려다봐요'], ['breathe', '🫧', '숨 고르기', '원을 따라 천천히 들이쉬고 내쉬어요']];
  var pick = { mode: pref('gq.mungMode', 'orbit'), min: +pref('gq.mungMin', '5'), scene: pref('gq.mungScene', 'sunset'), sound: pref('gq.mungSound', 'forest'), music: pref('gq.mungMusic', '1') === '1' }, total = Math.round((state.mungSec || 0) / 60);
  var SCENES = [['day', '☀️ 맑은 낮'], ['sunset', '🌇 노을'], ['night', '🌙 밤하늘'], ['rain', '🌧️ 비 오는 날']], SOUNDS = [['none', '🔇 조용히'], ['forest', '🐦 숲속'], ['rain', '🌧️ 빗소리'], ['waves', '🌊 파도'], ['fire', '🔥 모닥불']];
  function render() {
    openModal('<div class="who" style="--zc:#8fd3ff"><span class="ava">🌿</span><div><b>멍 때리기</b><small>화면 글자 없이 잔잔한 음악과 마을만 · 화면을 누르면 돌아와요' + (total ? ' · 지금까지 ' + total + '분' : '') + '</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
      '<div class="mung-modes">' + modes.map(function (m) { return '<button class="mung-mode ' + (pick.mode === m[0] ? 'on' : '') + '" data-m="' + m[0] + '"><span>' + m[1] + '</span><b>' + m[2] + '</b><small>' + m[3] + '</small></button>'; }).join('') + '</div>' +
      '<div class="set-sec"><h3>장면 <small>눈이 편한 색으로 바뀌어요</small></h3><div class="pick">' + SCENES.map(function (t) { return '<button class="pk ' + (pick.scene === t[0] ? 'on' : '') + '" data-sc="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="set-sec"><h3>소리</h3><div class="pick">' + SOUNDS.map(function (t) { return '<button class="pk ' + (pick.sound === t[0] ? 'on' : '') + '" data-so="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><label class="tg" style="margin-top:6px"><input type="checkbox" id="mungMusic" ' + (pick.music ? 'checked' : '') + '> 잔잔한 음악도 같이</label></div>' +
      '<div class="set-sec"><h3>얼마나</h3><div class="pick">' + [[3, '3분'], [5, '5분'], [10, '10분'], [0, '계속']].map(function (t) { return '<button class="pk ' + (pick.min === t[0] ? 'on' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div></div>' +
      ((state.thanks || []).length ? '<div class="thanks-list"><b>💛 지난번 고마웠던 일</b>' + state.thanks.slice(-2).reverse().map(function (t) { return '<p>' + esc(t.m) + '<small>' + esc(t.d) + '</small></p>'; }).join('') + '</div>' : '') +
      '<p class="fine">💡 쉬는 시간이나 수업 시작 전에 켜 두기 좋아요. 가끔 탄소중립 상식이 한 줄씩 지나가요.</p><div class="btns"><button class="primary big" data-act="go" data-autofocus>멍 때리기 시작 🌿</button></div>', { cls: 'menu' });
    mcard.onclick = function (e) {
      var m = e.target.closest('[data-m]'); if (m) { pick.mode = m.dataset.m; SFX.click(); render(); return; }
      var t = e.target.closest('[data-t]'); if (t) { pick.min = +t.dataset.t; SFX.click(); render(); return; }
      var sc = e.target.closest('[data-sc]'); if (sc) { pick.scene = sc.dataset.sc; SFX.click(); render(); return; }
      var so = e.target.closest('[data-so]'); if (so) { pick.sound = so.dataset.so; SFX.init(); SFX.nature(so.dataset.so); clearTimeout(pick._pv); pick._pv = setTimeout(function () { if (!MUNG) SFX.nature('none'); }, 2500); render(); return; }
      if (e.target.id === 'mungMusic') { pick.music = e.target.checked; return; }
      var a = e.target.closest('[data-act]'); if (!a) return; if (a.dataset.act === 'close') closeModal(); if (a.dataset.act === 'go') { setPref('gq.mungMode', pick.mode); setPref('gq.mungMin', String(pick.min)); setPref('gq.mungScene', pick.scene); setPref('gq.mungSound', pick.sound); setPref('gq.mungMusic', pick.music ? '1' : '0'); closeModal(); startMung(pick.mode, pick.min, pick); }
    };
  }
  render();
}
function startMung(mode, min, opt) {
  opt = opt || {}; if (!world) return; SFX.init(); SFX.bgm(opt.music !== false); SFX.nature(opt.sound || 'none'); world.mood(opt.scene && opt.scene !== 'day' ? opt.scene : null);
  var facts = P.cards.map(function (c) { return TX.sentences(c.text)[0]; }).filter(function (s) { return s && s.length < 70; });
  var ov = document.createElement('div'); ov.id = 'mung'; ov.className = 'mung' + (mode === 'breathe' ? ' breathe' : '') + ' sc-' + (opt.scene || 'day');
  ov.innerHTML = '<div class="mung-top"><span id="mungTime"></span><span>화면을 누르면 돌아가요</span></div>' + (mode === 'breathe' ? '<div class="mung-breath"><i></i><b id="mungBreath">들이쉬기</b></div>' : '') + '<p class="mung-fact" id="mungFact"></p>';
  document.body.appendChild(ov); document.body.classList.add('mung-on');
  world.pause(true); world.ambient(mode === 'breathe' ? 'near' : mode); world.setClean(1);
  var lock = null; try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { lock = l; }, function () {}); } catch (e) {}
  var t0 = Date.now(), end = min ? t0 + min * 60000 : 0, fi = Math.floor(Math.random() * facts.length), lastFact = 0;
  function tick() {
    var now = Date.now(), el = $('#mungTime'); if (!el) return;
    if (end) { var left = Math.max(0, Math.round((end - now) / 1000)); el.textContent = '🌿 ' + Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2); if (!left) { stopMung(true); return; } } else { var up = Math.round((now - t0) / 1000); el.textContent = '🌿 ' + Math.floor(up / 60) + '분 ' + (up % 60) + '초'; }
    if (mode === 'breathe') { var ph = ((now - t0) / 1000) % 10, b = $('#mungBreath'); if (b) b.textContent = ph < 4 ? '들이쉬기' : ph < 6 ? '잠깐 멈추기' : '내쉬기'; }
    if (facts.length && now - lastFact > 45000) { lastFact = now; var f = $('#mungFact'); if (f) { f.classList.remove('show'); void f.offsetWidth; f.textContent = '🌱 ' + facts[fi++ % facts.length]; f.classList.add('show'); } }
  }
  MUNG = { t0: t0, timer: setInterval(tick, 500), lock: function () { return lock; } }; lastFact = Date.now() - 37000; tick();
  ov.addEventListener('click', function () { stopMung(false); });
  addEventListener('keydown', mungKey);
}
function openThanks() { // 쉬고 나서: 오늘 고마웠던 일 한 줄 (이 기기에만 저장)
  if (!modal.hidden) return;
  openModal('<div class="who" style="--zc:#f2b93b"><span class="ava">💛</span><div><b>잘 쉬었어요</b><small>쓰고 싶을 때만 · 이 기기에만 저장돼요</small></div></div><p class="say">오늘 고마웠던 일이나 좋았던 일을 한 줄로 남겨 볼까요?</p><label class="lbl">고마웠던 일 한 줄<input id="thanksIn" maxlength="40" placeholder="예: 친구가 같이 나무를 심어 줬어"></label><div class="btns"><button class="primary big" data-act="save" data-autofocus>남기기 💛</button><button class="ghost" data-act="close">괜찮아요</button></div>', { cls: 'menu' });
  mcard.onclick = function (e) { var a = e.target.closest('[data-act]'); if (!a) return; if (a.dataset.act === 'close') closeModal(); if (a.dataset.act === 'save') { var v = window.GQSafety.maskPII(($('#thanksIn').value || '').trim()).text.slice(0, 40); if (!v) { closeModal(); return; } state.thanks = (state.thanks || []).concat([{ m: v, d: today() }]).slice(-10); save(); SFX.seed(); closeModal(); toast('💛 마음에 남겼어요. 다음에 멍 때리기를 열면 다시 볼 수 있어요', 3200); } };
}
function mungKey(e) { if (MUNG && (e.key === 'Escape' || e.key === ' ')) stopMung(false); }
function stopMung(done) {
  if (!MUNG) return; var sec = Math.round((Date.now() - MUNG.t0) / 1000); clearInterval(MUNG.timer); try { var l = MUNG.lock(); if (l) l.release(); } catch (e) {} MUNG = null;
  removeEventListener('keydown', mungKey); var ov = $('#mung'); if (ov) ov.remove(); document.body.classList.remove('mung-on');
  state.mungSec = (state.mungSec || 0) + sec; save();
  if (world) { world.ambient(null); world.pause(false); world.mood(null); } SFX.nature('none'); SFX.bgm(pref('gq.bgm', '1') === '1'); updateHUD();
  if (sec >= 45) setTimeout(openThanks, 500);
  toast(done ? '🌿 멍 때리기 끝! 잘 쉬었어요 (' + Math.round(sec / 60) + '분)' : '🌿 ' + (sec >= 60 ? Math.round(sec / 60) + '분' : sec + '초') + ' 동안 쉬었어요', 3200);
}
/* 묻기: 이야기 카드 검색 (AI가 켜져 있으면 AI 선생님이 카드 안에서 대답) */
var chat = [];
function chatHTML() {
  var turns = chat.length ? chat.map(function (t) {
    if (t.role === 'user') return '<div class="msg me"><p>' + esc(t.content) + '</p>' + (t.masked && t.masked.length ? '<small class="mask">🔒 비밀 지킴: ' + esc(t.masked.join('·')) + ' → ○○로 가렸어요</small>' : '') + '</div>';
    var cites = (t.cites || []).map(function (id) { var c = CARD[id]; return c ? '<button class="cite" data-card="' + id + '">📄 ' + esc(c.title) + '</button>' : ''; }).join('');
    return '<div class="msg bear' + (t.pending ? ' pending' : '') + '"><span class="ava">' + AE[P.mascot.animal] + '</span><div><p>' + esc(t.content) + '</p>' + (t.note ? '<small class="aimark">' + esc(t.note) + '</small>' : '') + (cites && !t.pending ? '<div class="cites">' + cites + '</div>' : '') + '</div></div>';
  }).join('') : '<div class="msg bear"><span class="ava">' + AE[P.mascot.animal] + '</span><div><p>' + esc(P.mascot.hi) + '</p></div></div>';
  var aiOn = window.GQAI && GQAI.ready();
  return '<div class="who" style="--zc:' + P.mascot.color + '"><span class="ava">' + AE[P.mascot.animal] + '</span><div><b>' + (aiOn ? '✨ AI 선생님 ' : '') + esc(P.mascot.name) + '에게 묻기</b><small>' + (aiOn ? '근거 카드 ' + P.cards.length + '장 안에서만 AI가 ' + esc(lvInfo().label) + ' 눈높이로 대답해요' : '이야기 카드 ' + P.cards.length + '장에서 찾아서 대답해요') + '</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    '<div class="chat" id="chatLog">' + turns + '</div><div class="cardview" id="cardview" hidden></div>' +
    '<div class="chips">' + P.suggest.map(function (s) { return '<button class="chip" data-q="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div>' +
    '<form class="ask" id="askForm"><input id="askIn" maxlength="120" autocomplete="off" placeholder="궁금한 걸 적어 봐! (이름·학교·주소는 비밀)" aria-label="물어볼 말"><button class="primary">보내기</button></form>' +
    '<p class="fine">🔒 대화는 저장되지 않아요. 이름·전화·주소·학교는 AI에 보내기 전에 ○○로 가려요. 카드에 있는 내용으로만 대답하고, 카드와 맞지 않는 AI 답은 걸러요.</p>';
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
var aiBusy = false;
function aiAnswer(q) {
  var hits = TX.retrieve(CARD_IDX, q, 3);
  if (!hits.length) { chat.push({ role: 'assistant', content: '음… 그건 ' + P.mascot.name + '가 가진 이야기 카드에는 없는 내용이야. 탄소중립·에너지·재활용·숲·교통에 대해 물어봐 줄래?' }); renderChat(); return; }
  var L = lvInfo(), cards = hits.map(function (h) { return h.it; });
  var block = cards.map(function (c) { return '[' + c.id + '] ' + c.title + ': ' + c.text; }).join('\n');
  var history = chat.filter(function (t) { return t.role === 'user' || t.ai; }).slice(-6).map(function (t) { return { role: t.role, content: t.content }; });
  var msg = { role: 'assistant', content: '생각하는 중…', cites: cards.map(function (c) { return c.id; }), ai: true, pending: true }; chat.push(msg); renderChat(); aiBusy = true;
  GQAI.chat([{ role: 'system', content: '너는 "' + P.title + '" 체험실의 AI 선생님 "' + P.mascot.name + '"야. 대상: ' + L.label + ' (' + L.desc + ')\n규칙: 아래 [근거 카드] 내용으로만 2~4문장으로 답해. 카드에 없는 사실·숫자는 절대 말하지 말고, 카드에 없는 질문이면 "카드에는 없는 내용"이라고 말한 뒤 관련된 걸 물어보게 도와줘. 마지막 문장은 오늘 해 볼 작은 실천 하나. 다정한 반말, 겁주는 말·이모지·링크 금지.\n[근거 카드]\n' + block }].concat(history),
    { maxTokens: 420, onDelta: function (t) { if (!t) return; msg.content = t; var b = document.querySelector('#chatLog .msg.pending p'); if (b) b.textContent = t; } })
    .then(function (t) {
      var v = GQAI.verify(t, { ground: block, numbers: block + ' ' + q, min: 0.1 });
      if (v.ok) { msg.content = v.text; msg.note = '✨ AI 선생님 · 근거 카드 ' + cards.length + '장만 보고 답했어요'; }
      else { msg.content = P.mascot.name + '가 이야기 카드에서 찾아봤어! ' + cards[0].text; msg.note = '📗 AI 답이 검증(' + v.why + ')에서 걸러져 카드 원문을 보여 줘요'; msg.cites = [cards[0].id]; }
    }, function () { msg.content = P.mascot.name + '가 이야기 카드에서 찾아봤어! ' + cards[0].text; msg.note = '📗 AI 연결이 안 돼서 카드 원문을 보여 줘요'; })
    .then(function () { msg.pending = false; aiBusy = false; if (!modal.hidden && $('#chatLog')) renderChat(); TTS.speak(msg.content, 'bear'); });
}
function sendAsk(text) {
  if (aiBusy) { toast(P.mascot.name + '가 아직 대답하고 있어요'); return; }
  SFX.click(); var m = window.GQSafety.maskPII(text), c = window.GQSafety.checkInput(m.text);
  chat.push({ role: 'user', content: m.text, masked: m.found });
  var reply;
  if (!c.ok) reply = { content: c.reply };
  else if (window.GQAI && GQAI.ready()) { renderChat(); aiAnswer(c.text); return; }
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
    if (act === 'close') closeModal(); if (act === 'ask') openChat(); if (act === 'hw') openHomework(); if (act === 'cert') openCert(); if (act === 'card') openCard();
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
  mcard.onclick = function (e) { var a = e.target.closest('[data-act]'); if (!a) return; if (a.dataset.act === 'hw') openHomework(); if (a.dataset.act === 'cert') openCert(); if (a.dataset.act === 'card') openCard(); if (a.dataset.act === 'close') closeModal(); };
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
    '<div class="set-sec"><h3>소리</h3><label class="tg"><input type="checkbox" id="optTTS" ' + (TTS.on ? 'checked' : '') + '> 대사를 소리 내어 읽어 주기 <small>(브라우저 음성 · 기본 꺼짐)</small></label><label class="tg"><input type="checkbox" id="optBgm" ' + (pref('gq.bgm', '1') === '1' ? 'checked' : '') + '> 잔잔한 배경음악</label><label class="tg"><input type="checkbox" id="optMute" ' + (SFX.muted() ? 'checked' : '') + '> 모든 소리 끄기</label></div>' +
    aiSettingsHTML() +
    '<div class="set-sec"><h3>이 체험관</h3><p class="fine"><b>' + esc(P.title) + '</b>' + (P.subtitle ? ' · ' + esc(P.subtitle) : '') + (P.org ? ' · ' + esc(P.org) : '') + '<br>' + (P.meta.model ? '✨ AI 체험관 메이커로 생성(' + esc(P.meta.model) + ') · 담당자 승인 ' + (P.meta.approved ? '완료' : '전') : '📗 ' + esc(P.meta.note || '사람이 만든 기본 체험관')) + '</p><div class="btns left"><button class="ghost" data-act="packs">다른 체험관 열기</button><a class="ghost btnlike" href="maker.html">🛠️ 메이커 열기</a></div></div>' +
    '<div class="set-sec"><h3>보호자·선생님 안내</h3><ul class="fine list"><li>로그인이 없고, 이름·학교 같은 개인정보를 받지 않아요. 진행 기록은 이 기기 브라우저에만 저장돼요.</li><li>체험 화면에서는 AI가 실시간으로 말하지 않아요. 수업·문제·설명은 모두 메이커에서 미리 만들어 담당자가 확인한 글이에요.</li><li>내용은 체험용 예시이며 실제 운영 전 감수가 필요해요.</li></ul><div class="btns left"><button class="ghost danger" data-act="reset">처음부터 다시 하기</button></div></div>', { cls: 'menu' });
  $('#optTTS').onchange = function () { TTS.on = this.checked; setPref('gq.tts2', this.checked ? '1' : '0'); };
  $('#optMute').onchange = function () { SFX.setMuted(this.checked); if (this.checked) TTS.stop(); updateSoundBtn(); };
  $('#optBgm').onchange = function () { setPref('gq.bgm', this.checked ? '1' : '0'); SFX.init(); SFX.bgm(this.checked); };
  mcard.onclick = function (e) {
    var pk = e.target.closest('.pk'); if (pk) { state.grade = +pk.dataset.v; save(); mcard.querySelectorAll('[data-k="grade"] .pk').forEach(function (b) { b.classList.toggle('on', b === pk); }); toast(GRADES[state.grade].label + ' 눈높이로 보여 줄게요'); return; }
    var a = e.target.closest('[data-act]'); if (!a) return; var act = a.dataset.act;
    if (act === 'close') closeModal(); if (act === 'packs') openPacks(); if (act === 'ai') openAiSettings(); if (act === 'aioff') { GQAI.off(); toast('AI를 껐어요. 기본 자료로 진행해요'); openMenu(); }
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
var MAKER_URL = window.GQ_MAKER_URL || 'maker.html';
function aiSettingsHTML() {
  var on = window.GQAI && GQAI.ready();
  return '<div class="set-sec"><h3>✨ AI 연결 <small>선생님·보호자용</small></h3><p class="fine">' + (on ? '지금 <b>' + esc(GQAI.label()) + '</b>에 연결되어 AI 선생님·탄소 코치·맞춤 설명이 켜져 있어요. AI 답은 근거 카드·숫자 대조·안전 점검을 통과해야 화면에 나와요.' : 'AI가 꺼져 있어요. 기본 자료(검수된 카드·설명)로 진행해요. 기관 AI 서버(행정안전부 AI 공통기반 등)를 연결하면 켜져요.') + '</p><div class="btns left"><button class="ghost" data-act="ai">AI 연결 설정</button>' + (on && !(window.GQ_AI_DEFAULT && GQAI.cfg().provider === window.GQ_AI_DEFAULT.provider) ? '<button class="ghost" data-act="aioff">AI 끄기</button>' : '') + '</div>' +
    '<p class="fine">🏫 선생님·기관: 교육자료를 넣으면 AI가 새 체험 마을을 만들어 줘요 → <a href="' + esc(MAKER_URL) + '" target="_blank" rel="noopener">AI 체험 마을 메이커 열기</a></p></div>';
}
function openAiSettings() {
  var c = GQAI.cfg(), P0 = (window.GreenLLM.PRESETS || []).filter(function (p) { return p.provider !== 'webllm' && (p.id !== 'artifact' || (window.GQ_AI_DEFAULT && window.GQ_AI_DEFAULT.provider === 'claude-artifact')) && p.id !== 'gemini'; });
  openModal('<div class="who" style="--zc:#7d93a6"><span class="ava">✨</span><div><b>AI 연결 설정</b><small>선생님·보호자용 · 키는 이 기기 브라우저에만 둬요</small></div><button class="mini" data-act="back" aria-label="뒤로">←</button></div>' +
    '<label class="lbl">빠른 설정<select id="aiP"><option value="">직접 입력</option>' + P0.map(function (p) { return '<option value="' + p.id + '">' + esc(p.label) + '</option>'; }).join('') + '</select></label>' +
    '<label class="lbl">연결 방식<select id="aiV">' + ['openai', 'anthropic', 'claude-artifact'].map(function (v) { return '<option' + (c.provider === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select></label>' +
    '<label class="lbl">주소 (Base URL)<input id="aiU" value="' + esc(c.baseUrl || '') + '" placeholder="기관 AI 서버 주소 (OpenAI 호환)"></label>' +
    '<label class="lbl">모델 이름<input id="aiM" value="' + esc(c.model || '') + '"></label>' +
    '<label class="lbl">API 키 (필요할 때만)<input id="aiK" type="password" value="' + esc(c.apiKey || '') + '"></label>' +
    '<p class="fine">학생이 쓰는 화면이라 18세 미만 이용을 막는 서비스(예: 일부 무료 API)는 쓰지 마세요. 기관 서버를 권장해요.</p><p class="fine" id="aiOut"></p>' +
    '<div class="btns"><button class="ghost" data-act="test">연결 테스트</button><button class="primary" data-act="save">저장</button></div>', { cls: 'menu' });
  var form = function () { return Object.assign(GQAI.cfg(), { provider: $('#aiV').value, baseUrl: $('#aiU').value.trim(), model: $('#aiM').value.trim(), apiKey: $('#aiK').value.trim() }); };
  $('#aiP').onchange = function () { var p = P0.find(function (x) { return x.id === this.value; }, this); if (p) { $('#aiV').value = p.provider; $('#aiU').value = p.baseUrl; $('#aiM').value = p.model; } };
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return; var act = a.dataset.act;
    if (act === 'back') openMenu();
    if (act === 'test') { var f = form(); $('#aiOut').textContent = '연결하는 중…'; window.GreenLLM.chat(f, [{ role: 'user', content: '"준비 완료"라고만 답해.' }], { stream: false }).then(function (t) { $('#aiOut').textContent = '✅ 성공: ' + String(t).slice(0, 30); }, function (er) { $('#aiOut').textContent = '❌ 실패: ' + er.message; }); }
    if (act === 'save') { GQAI.save(form()); toast(GQAI.ready() ? '✨ AI를 연결했어요' : 'AI 설정을 저장했어요 (아직 연결 안 됨)'); openMenu(); }
  };
}
/* ------------------------------------------------------------
   📱 모바일: 떠다니는 조이스틱(mamo-ex2 방식) · 접히는 메뉴
   ------------------------------------------------------------ */
var IS_TOUCH = matchMedia('(pointer: coarse)').matches;
document.documentElement.classList.toggle('touch', IS_TOUCH);
(function () {
  var zone = $('#joyZone'), el = $('#joy'), knob = $('#knob'), id = null, c = { x: 0, y: 0 }, st = null, R = 46;
  function move(e) { var dx = e.clientX - c.x, dy = e.clientY - c.y, d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } var m = Math.min(1, d / R); if (world) world.setJoy(dx / R, dy / R, m); knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; el.classList.toggle('run', m > 0.92); document.documentElement.classList.toggle('moving', m > 0.15); }
  zone.addEventListener('pointerdown', function (e) {
    if (id !== null || !modal.hidden || !$('#start').hidden) return; id = e.pointerId; try { zone.setPointerCapture(e.pointerId); } catch (er) {} e.preventDefault(); SFX.init();
    var zr = zone.getBoundingClientRect(), cx = Math.max(zr.left + 58, Math.min(zr.right - 58, e.clientX)), cy = Math.max(zr.top + 58, Math.min(zr.bottom - 58, e.clientY));
    c = { x: cx, y: cy }; st = { x: e.clientX, y: e.clientY, t: performance.now() }; el.style.left = (cx - zr.left - 58) + 'px'; el.style.top = (cy - zr.top - 58) + 'px'; el.style.bottom = 'auto'; el.classList.remove('idle'); move(e);
  });
  zone.addEventListener('pointermove', function (e) { if (e.pointerId === id) move(e); });
  function end(e) {
    if (e.pointerId !== id) return; id = null; if (world) world.setJoy(0, 0, 0); knob.style.transform = ''; el.classList.remove('run'); el.style.left = el.style.top = el.style.bottom = ''; el.classList.add('idle'); document.documentElement.classList.remove('moving');
    if (st && e.type === 'pointerup' && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 10 && performance.now() - st.t < 300 && world) world.tap(e.clientX, e.clientY); st = null;
  }
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  var more = $('#fabMore');
  more.addEventListener('click', function (e) { e.stopPropagation(); SFX.init(); SFX.click(); var open = !document.documentElement.classList.contains('fabs-open'); document.documentElement.classList.toggle('fabs-open', open); more.setAttribute('aria-expanded', open); more.querySelector('span').textContent = open ? '✕' : '☰'; more.querySelector('small').textContent = open ? '닫기' : '메뉴'; });
  function closeFabs() { if (!document.documentElement.classList.contains('fabs-open')) return; document.documentElement.classList.remove('fabs-open'); more.setAttribute('aria-expanded', 'false'); more.querySelector('span').textContent = '☰'; more.querySelector('small').textContent = '메뉴'; }
  $('#fabs').addEventListener('click', function (e) { if (e.target.closest('.fab:not(.more)')) closeFabs(); });
  document.addEventListener('pointerdown', function (e) { if (!e.target.closest('#fabs')) closeFabs(); });
  if (IS_TOUCH) $('#hint').textContent = '👈 왼쪽 아래를 꾹 눌러 끌면 걸어요 · 친구나 땅을 톡 누르면 그리로 가요';
})();
/* ------------------------------------------------------------
   👥 같이 하기 — 같은 방 친구들이 보이고, Enter로 채팅, 친구를 눌러 같이 다니기
   (「푸른하늘 업무체험관」의 여럿이 함께·같이 다니기 방식을 가져왔어요)
   ------------------------------------------------------------ */
var RUDE = ['씨발', '씨바', '씨팔', '쓰발', 'ㅅㅂ', 'ㅆㅂ', 'ㅄ', '병신', '븅신', 'ㅂㅅ', '개새끼', '개색기', '개색끼', '좆', '존나', 'ㅈㄴ', '지랄', 'ㅈㄹ', '미친놈', '미친년', '닥쳐', '꺼져', '엠창', '느금', '애미', '애비'];
function isRude(s) { var t = String(s || '').toLowerCase().replace(/[\s\d.,!?~^*_\-+=()\[\]{}<>'"`|\\/:;@#$%&]/g, '').split('시발점').join(''); return RUDE.some(function (w) { return t.indexOf(w) >= 0; }) || /시발|개새/.test(String(s || '').split('시발점').join('')); }
var PRIV_RE = /(01[016789][\s.-]?\d{3,4}[\s.-]?\d{4})|([\w.+-]+@[\w-]+\.[\w.]+)|(\d{6}[\s-]?[1-4]\d{6})/;
function softMsg(s) { s = String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); return isRude(s) ? '♡♡♡' : s.replace(new RegExp(PRIV_RE.source, 'g'), '***'); }
function safeNick(s) { var n = String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 10); return !n || isRude(n) || PRIV_RE.test(n) ? '친구' : n; }
var MP = { on: false, peers: {}, seenChat: {}, seenEmo: {}, seenG: {}, nick: '', room: '', unread: 0, chatOpen: false, lastChat: 0, follow: '', followers: [], tick: 0 };
function mpStatusText() { var n = Object.keys(MP.peers).length; return MP.on ? (GQNet.status() === 'on' ? '👥 ' + (MP.room || '우리반') + ' · ' + (n + 1) + '명' : '👥 연결 중…') : ''; }
var NICK_A = ['초록', '하늘', '햇살', '바람', '새싹', '구름', '별빛', '푸른'], NICK_B = ['곰', '토끼', '다람쥐', '강아지', '고양이', '펭귄', '여우', '부엉이'];
function randomNick() { return NICK_A[Math.floor(Math.random() * NICK_A.length)] + NICK_B[Math.floor(Math.random() * NICK_B.length)] + (10 + Math.floor(Math.random() * 90)); }
function autoMp() { if (MP.on || pref('gq.mp', '1') === '0' || !window.GQNet) return; var n = pref('gq.nick', '') || randomNick(); setPref('gq.nick', n); mpStart(n, pref('gq.room', '모두') || '모두'); }
function openMp() {
  var nick = MP.nick || pref('gq.nick', '') || randomNick(), room = MP.room || pref('gq.room', '모두');
  openModal('<div class="who" style="--zc:#8fd3ff"><span class="ava">👥</span><div><b>친구들과 같이 하기 · 채팅</b><small>같은 방 이름을 쓴 친구들이 마을에 함께 보이고 채팅할 수 있어요</small></div><button class="mini" data-act="close" aria-label="닫기">✕</button></div>' +
    (MP.on ? '<p class="say">지금 <b>' + esc(MP.room) + '</b> 방에서 <b>' + esc(MP.nick) + '</b>(으)로 함께하고 있어요. 친구 ' + Object.keys(MP.peers).length + '명이 같이 보여요.</p><ul class="tips"><li><span>⌨️</span><b>Enter</b>를 누르거나 💬를 누르면 채팅해요</li><li><span>👆</span>친구 <b>이름표</b>를 누르면 손 흔들기·하트·<b>같이 다니기</b></li><li><span>🏫</span>우리 반끼리만 보려면 아래에서 <b>방 이름</b>을 바꿔요</li></ul>' +
      '<label class="lbl">내 별명<input id="mpNick" maxlength="10" value="' + esc(MP.nick) + '"></label><label class="lbl">방 이름 (같은 이름끼리 만나요 · 기본은 모두)<input id="mpRoom" maxlength="20" value="' + esc(MP.room) + '"></label><div class="btns"><button class="ghost danger" data-act="off">혼자 하기</button><button class="primary" data-act="re">바꾸기</button></div>'
      : '<label class="lbl">내 별명 (실명 말고 별명으로)<input id="mpNick" maxlength="10" value="' + esc(nick) + '" placeholder="예: 초록곰"></label><label class="lbl">방 이름 (선생님이 알려 준 이름 · 같은 이름끼리 만나요)<input id="mpRoom" maxlength="20" value="' + esc(room) + '" placeholder="예: 3학년2반"></label>' +
        '<p class="fine">🔒 위치·캐릭터·별명·채팅만 같은 방 친구에게 전해지고 저장하지 않아요. 욕설과 전화번호·이메일은 걸러요. ' + (window.claude && window.claude.use ? '(claude.ai에서 이 링크를 연 사람끼리)' : '(공개 중계 서버를 거쳐 전달 · 시연용)') + '</p><div class="btns"><button class="primary big" data-act="go" data-autofocus>들어가서 채팅하기 💬</button></div>'), { cls: 'menu' });
  mcard.onclick = function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return; var act = a.dataset.act;
    if (act === 'close') closeModal();
    if (act === 'off') { setPref('gq.mp', '0'); mpStop(); closeModal(); toast('👥 혼자 하기로 바꿨어요 · 👥 버튼으로 다시 함께할 수 있어요'); }
    if (act === 're') { var n2 = safeNick($('#mpNick').value), r2 = String($('#mpRoom').value || '모두').replace(/[^\w가-힣-]/g, '').slice(0, 20) || '모두'; setPref('gq.nick', n2); setPref('gq.room', r2); closeModal(); if (r2 !== MP.room) { mpStop(); mpStart(n2, r2); } else { MP.nick = n2; mpSend(true); toast('별명을 ' + n2 + '(으)로 바꿨어요'); } }
    if (act === 'go') { setPref('gq.mp', '1'); var n = safeNick($('#mpNick').value), r = String($('#mpRoom').value || '모두').replace(/[^\w가-힣-]/g, '').slice(0, 20) || '우리반'; setPref('gq.nick', n); setPref('gq.room', r); closeModal(); mpStart(n, r); }
  };
}
function mpStart(nick, room) {
  if (!window.GQNet || MP.on) return; MP.on = true; MP.nick = nick; MP.room = room; MP.peers = {};
  GQNet.start({ room: room, pack: P.id, onStatus: function () { mpHud(); }, onPeers: mpPeers });
  mpSend(true); clearInterval(MP.tick); MP.tick = setInterval(function () { mpSend(false); mpFollowTick(); }, 200);
  sysChat('👥 ' + nick + '(으)로 ' + (room === '모두' ? '다 같이' : room + ' 방에') + ' 들어왔어요 · Enter로 채팅 · 친구 이름표를 누르면 같이 다녀요'); mpHud();
  if (!IS_TOUCH) { $('#chatBar').hidden = false; $('#chatBar').classList.add('dock'); document.body.classList.add('mp-dock'); }
  if (MP.chatAfter) { MP.chatAfter = false; setTimeout(openChatBar, 300); }
}
function mpStop() { if (!MP.on) return; $('#chatBar').classList.remove('dock'); document.body.classList.remove('mp-dock'); MP.on = false; clearInterval(MP.tick); GQNet.stop(); Object.keys(MP.peers).forEach(function (id) { if (world) world.peerRemove(id); }); MP.peers = {}; MP.follow = ''; closeChat(); renderGrp(); mpHud(); }
function mpSend(force) { if (!MP.on || !world) return; var p = world.pos(); GQNet.update({ n: MP.nick, x: +p.x.toFixed(2), z: +p.z.toFixed(2), h: +world.heading().toFixed(2), l: state.look, f: MP.follow || '' }); }
function mpHud() { var el = $('#feverSub'); if (!el) return; if (MP.on) el.textContent = mpStatusText(); else updateHUD(); }
function mpPeers(map) {
  var me = GQNet.id();
  Object.keys(MP.peers).forEach(function (id) { if (!map[id]) { if (world) world.peerRemove(id); sysChat(MP.peers[id].n + ' 님이 나갔어요'); if (MP.follow === id) { MP.follow = ''; toast('따라가던 친구가 나가서 같이 다니기를 마쳤어요'); } } });
  Object.keys(map).forEach(function (id) {
    var d = map[id], nm = safeNick(d.n), old = MP.peers[id];
    if (!old) { sysChat(nm + ' 님이 들어왔어요'); SFX.pop(); }
    var sub = d.f && d.f === me ? '🚂 나를 따라와요' : d.f && map[d.f] ? '🚂 ' + safeNick(map[d.f].n) + ' 따라가는 중' : '';
    if (world) world.peerSet(id, { look: d.l, x: d.x, z: d.z, h: d.h, name: nm, sub: sub });
    if (d.c && d.c.t && d.c.t !== MP.seenChat[id]) { var first = !(id in MP.seenChat); MP.seenChat[id] = d.c.t; if (!first || Date.now() - d.c.t < 8000) { var msg = softMsg(d.c.m); if (msg) { if (world) world.peerSay(id, msg); addChatLog(nm, msg); SFX.pop(); if (!MP.chatOpen) { MP.unread++; badge(); } } } }
    if (d.e && d.e.t && d.e.t !== MP.seenEmo[id]) { var f2 = !(id in MP.seenEmo); MP.seenEmo[id] = d.e.t; if (!f2 || Date.now() - d.e.t < 5000) { if (d.e.k === 'wave' && world) world.peerWave(id); if (d.e.to === me) { if (d.e.k === 'wave') toast('👋 ' + nm + ' 님이 손을 흔들어요'); if (d.e.k === 'heart') { toast('❤️ ' + nm + ' 님이 하트를 보냈어요'); if (world) world.hearts(); } } } }
    if (id === MP.follow && d.g && d.g.t && d.g.t !== MP.seenG[id]) { var fg = !(id in MP.seenG); MP.seenG[id] = d.g.t; if (!fg || Date.now() - d.g.t < 6000) grpApply(d.g, nm); }
    MP.peers[id] = { n: nm, f: d.f };
  });
  MP.followers = Object.keys(map).filter(function (id) { return map[id].f && map[id].f === me; });
  renderGrp(); mpHud();
}
function renderGrp() {
  var el = $('#grpCard'); if (!MP.on || (!MP.follow && !MP.followers.length)) { el.hidden = true; return; }
  var h = MP.follow && MP.peers[MP.follow] ? '<b>🚂 ' + esc(MP.peers[MP.follow].n) + ' 님을 따라가는 중</b><small>직접 움직이면 잠깐 멈췄다가 다시 따라가요</small><button class="mini-btn" data-g="x">그만</button>'
    : '<b>🚂 ' + MP.followers.length + '명이 나를 따라와요</b><small>' + esc(MP.followers.map(function (id) { return MP.peers[id] ? MP.peers[id].n : '친구'; }).join(', ')) + '</small>';
  if (el._h !== h) { el._h = h; el.innerHTML = h; } el.hidden = false;
}
$('#grpCard').addEventListener('click', function (e) { if (e.target.closest('[data-g]')) { MP.follow = ''; mpSend(true); renderGrp(); toast('같이 다니기를 멈췄어요'); } });
function grpShare(k, zone, spot) { if (!MP.on || !window.GQNet || !MP.followers.length) return; GQNet.update({ g: { t: Date.now(), k: k, z: zone, s: spot } }); }
function grpApply(g, who) { // 앞장선 친구와 같이 체험: 시작하면 같이 시작, 한 일은 나도 한 것으로
  var z = ZMAP[g.z]; if (!z) return; var st = state.zones[g.z];
  if (g.k === 'start') { if (st.cleared) { toast('🚂 ' + who + ' 님이 「' + z.mission.title + '」 체험을 다시 해요'); return; } if (state.activeMission !== g.z) { state.activeMission = g.z; save(); if (world) world.missionOn(g.z); updateHUD(); } toast('🚂 ' + who + ' 님과 「' + z.mission.title + '」 체험을 같이 시작해요!', 3200); grpShare('start', g.z, ''); return; }
  if (g.k === 'spot') {
    var d = z.mission.spots.find(function (s) { return s.id === g.s; }); if (!d || st.spots[g.s]) return;
    if (state.activeMission !== g.z && !st.cleared) { state.activeMission = g.z; save(); if (world) world.missionOn(g.z); }
    if (z.template === 'ride' && world) { if (g.s === z.mission.spots[0].id) world.bike(true); if (g.s === z.mission.spots[z.mission.spots.length - 1].id) world.bike(false); }
    if (z.template === 'sort' && carrying === g.s) { carrying = null; if (world) world.carry(null); }
    completeSpot(g.z, g.s); toast('🚂 ' + who + ' 님과 같이 「' + (d.act ? d.act.replace(/^\S+\s/, '') : d.label) + '」 했어요!', 2600);
  }
}
function mpFollowTick() { if (!MP.follow || !world || !modal.hidden) return; var p = world.peerPos(MP.follow); if (!p) return; var me = world.pos(), d = Math.hypot(p.x - me.x, p.z - me.z); if (d > 2.3 && world.idleFor() > 1.2) world.walkToPos(p, 1.7); }
function openPeer(id) {
  var p = MP.peers[id]; if (!p) return; var el = $('#peerCard'), fol = MP.follow === id;
  el.innerHTML = '<div class="pc-h"><b>' + esc(p.n) + ' 님과 함께하기</b><button type="button" data-pk="x" aria-label="닫기">✕</button></div>' +
    '<button type="button" class="pc-wide' + (fol ? ' out' : '') + '" data-pk="grp"><span>🚂</span><b>' + (fol ? '같이 다니기 그만' : '같이 다니기') + '</b><small>' + (fol ? '지금 따라가는 중이에요' : '이 친구 뒤를 줄줄이 따라가요') + '</small></button>' +
    '<div class="pc-g"><button type="button" data-pk="wave"><span>👋</span>손 흔들기</button><button type="button" data-pk="heart"><span>❤️</span>하트</button><button type="button" data-pk="go"><span>🏃</span>곁으로 가기</button></div>';
  el.hidden = false; SFX.click(); clearTimeout(el._t); el._t = setTimeout(function () { el.hidden = true; }, 9000);
  el.onclick = function (e) {
    var b = e.target.closest('[data-pk]'); if (!b) return; var k = b.dataset.pk; el.hidden = true; if (k === 'x') return;
    if (k === 'grp') { if (fol) { MP.follow = ''; toast('같이 다니기를 멈췄어요'); } else { MP.follow = id; toast('🚂 ' + p.n + ' 님을 따라가요! 직접 움직이면 잠깐 멈췄다가 다시 따라가요'); } mpSend(true); renderGrp(); }
    if (k === 'wave' || k === 'heart') { GQNet.update({ e: { t: Date.now(), k: k, to: id } }); if (k === 'wave' && world) world.wave(); toast(k === 'wave' ? '👋 ' + p.n + ' 님에게 손을 흔들었어요' : '❤️ ' + p.n + ' 님에게 하트를 보냈어요', 1800); }
    if (k === 'go') { var pp = world && world.peerPos(id); if (pp) world.walkToPos(pp, 1.6); }
  };
}
/* 채팅 */
function badge() { var b = $('#btnChat .badge'); b.hidden = MP.unread === 0; b.textContent = MP.unread > 9 ? '9+' : String(MP.unread); }
function openChatBar() { if (!MP.on || !modal.hidden || !$('#start').hidden) return; MP.chatOpen = true; $('#chatBar').hidden = false; $('#chatBar').classList.add('focus'); document.body.classList.add('chatting'); MP.unread = 0; badge(); setTimeout(function () { $('#chatIn').focus({ preventScroll: true }); }, 0); }
function closeChat() { MP.chatOpen = false; $('#chatBar').classList.remove('focus'); $('#chatBar').hidden = !$('#chatBar').classList.contains('dock'); document.body.classList.remove('chatting'); $('#chatIn').blur(); }
function addChatLog(name, msg, sys) { var log = $('#chatLogMp'), d = document.createElement('div'); if (sys) { d.className = 'sys'; d.textContent = msg; } else { var b = document.createElement('b'); b.textContent = name; d.append(b, document.createTextNode(' ' + msg)); } log.appendChild(d); while (log.children.length > 5) log.firstChild.remove(); setTimeout(function () { d.classList.add('fade'); }, 9000); setTimeout(function () { d.remove(); }, 9700); }
function sysChat(msg) { addChatLog('', msg, true); }
function sendMpChat(text) {
  var msg = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 60); if (!msg) return true;
  if (isRude(msg)) { toast('고운 말로 이야기해 주세요 🙂 욕설은 보낼 수 없어요'); SFX.wrong(); return false; }
  if (PRIV_RE.test(msg)) { toast('전화번호·이메일 같은 개인정보는 보낼 수 없어요'); SFX.wrong(); return false; }
  if (Date.now() - MP.lastChat < 1200) { toast('메시지를 조금 천천히 보내 주세요'); return false; }
  MP.lastChat = Date.now(); GQNet.update({ c: { t: MP.lastChat, m: msg } }); if (world) world.selfSay(msg); addChatLog(MP.nick || '나', msg); SFX.click(); return true;
}
$('#chatBar').addEventListener('submit', function (e) { e.preventDefault(); if (sendMpChat($('#chatIn').value)) { $('#chatIn').value = ''; if (!IS_TOUCH) closeChat(); } });
$('#chatIn').addEventListener('focus', function () { MP.chatOpen = true; MP.unread = 0; badge(); $('#chatBar').classList.add('focus'); });
$('#chatIn').addEventListener('blur', function () { if ($('#chatBar').classList.contains('dock')) { MP.chatOpen = false; $('#chatBar').classList.remove('focus'); } });
$('#chatClose').addEventListener('click', closeChat);
$('#chatWave').addEventListener('click', function () { if (world) world.wave(); GQNet.update({ e: { t: Date.now(), k: 'wave', to: '' } }); });
$('#btnChat').addEventListener('click', function () { SFX.init(); if (!MP.on) { MP.chatAfter = true; openMp(); return; } if (MP.chatOpen) closeChat(); else openChatBar(); });
$('#fabMp').addEventListener('click', function () { SFX.init(); SFX.click(); openMp(); });
addEventListener('keydown', function (e) {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) { if (e.key === 'Escape' && e.target.id === 'chatIn') closeChat(); return; }
  if (e.key === 'Enter' && modal.hidden && $('#start').hidden) { e.preventDefault(); if (MP.on) openChatBar(); else { MP.chatAfter = true; openMp(); } }
});
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
  style: [['short', '크롭 앞머리'], ['side', '가르마'], ['spiky', '뾰족 머리'], ['undercut', '투블럭'], ['waves', '웨이브'], ['curly', '곱슬'], ['bob', '단발'], ['long', '긴 머리'], ['pony', '포니테일'], ['twin', '양갈래'], ['bun', '똥머리'], ['cap', '야구모자'], ['beanie', '비니']],
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
var STYLE_BY = { m: ['short', 'side', 'spiky', 'undercut', 'waves', 'curly', 'cap', 'beanie'], f: ['long', 'bob', 'pony', 'twin', 'bun', 'waves', 'curly', 'cap', 'beanie'] };
function genderFix(L) { // 남녀가 또렷하게 보이도록 성별에 맞지 않는 머리·치마·리본은 바꿈
  var b = L.body === 'f' ? 'f' : 'm';
  if (STYLE_BY[b].indexOf(L.style) < 0) L.style = b === 'f' ? 'long' : 'short';
  if (b === 'm' && L.bottom === 'skirt') L.bottom = 'pants';
  if (b === 'm' && L.acc === 'bow') L.acc = 'none';
  return L;
}
function optsFor(key, list, d) { if (key === 'style') return list.filter(function (o) { return STYLE_BY[d.body === 'f' ? 'f' : 'm'].indexOf(o[0]) >= 0; }); if (d.body !== 'f' && (key === 'bottom' || key === 'acc')) return list.filter(function (o) { return o[0] !== 'skirt' && o[0] !== 'bow'; }); return list; }
function okLook(o) { // 저장된 값은 허용 목록 안에서만
  var L = {}; o = o || {};
  AV_KEYS.forEach(function (k) { var vals = AV[k].map(function (x) { return Array.isArray(x) ? x[0] : x; }); L[k] = vals.indexOf(o[k]) >= 0 ? o[k] : PRESETS[2][1][k]; });
  return genderFix(L);
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
  if (L.style === 'pony' || (f && (L.style === 'cap' || L.style === 'beanie'))) s += '<rect x="' + (50 + R - 6) + '" y="' + (cy - R + 2) + '" width="10" height="26" rx="5" fill="' + L.hair + '" transform="rotate(-25 ' + (50 + R - 1) + ' ' + (cy - R + 2) + ')"/>';
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
  else if (L.style === 'undercut') {
    var stb = shadeHex(L.hair, 1.9); s += '<path d="M' + hx0 + ' ' + (cy - 1) + ' A' + Rh + ' ' + Rh + ' 0 0 1 ' + hx1 + ' ' + (cy - 1) + ' L' + hx1 + ' ' + (cy + 1) + ' Q50 ' + (cy - 4) + ' ' + hx0 + ' ' + (cy + 1) + 'z" fill="' + stb + '" opacity=".75"/><path d="M' + (hx0 + 3) + ' ' + (cy - 8) + ' Q50 ' + (cy - Rh - 10) + ' ' + (hx1 - 2) + ' ' + (cy - 9) + ' Q' + (50 + 6) + ' ' + (cy - 12) + ' ' + (50 - 4) + ' ' + (cy - 6) + ' Q' + (hx0 + 8) + ' ' + (cy - 6) + ' ' + (hx0 + 3) + ' ' + (cy - 8) + 'z" fill="' + L.hair + '"/><path d="M' + (50 - 6) + ' ' + (cy - Rh + 4) + ' q8 -3 14 2" stroke="' + shadeHex(L.hair, 1.3) + '" stroke-width="2" fill="none" stroke-linecap="round"/>';
  }
  else {
    s += '<path d="M' + hx0 + ' ' + (cy - 4) + ' A' + Rh + ' ' + Rh + ' 0 0 1 ' + hx1 + ' ' + (cy - 4) + ' L' + hx1 + ' ' + (cy - 1) + ' Q50 ' + (cy + 3) + ' ' + hx0 + ' ' + (cy - 1) + 'z" fill="' + L.hair + '"/>';
    var hl2 = shadeHex(L.hair, 1.25);
    if (L.style === 'short' && !f) { s += '<path d="M' + (50 - Rh) + ' ' + (cy - 2) + ' Q50 ' + (cy - Rh - 6) + ' ' + (50 + Rh) + ' ' + (cy - 2) + ' L' + (50 + Rh - 3) + ' ' + (cy - 5) + ' l-3 3 -4 -3 -4 3 -4 -3 -4 3 -4 -3 -4 3 -4 -3 -4 3 -3 -3z" fill="' + L.hair + '"/>'; }
    if (L.style === 'side' && !f) { s += '<ellipse cx="' + (50 - R * 0.28) + '" cy="' + (cy - R + 6) + '" rx="' + (R * 0.62) + '" ry="' + (R * 0.28) + '" fill="' + L.hair + '" transform="rotate(-16 ' + (50 - R * 0.28) + ' ' + (cy - R + 6) + ')"/><circle cx="' + (50 - R + 3) + '" cy="' + (cy - 5) + '" r="5" fill="' + L.hair + '"/><path d="M' + (50 + R * 0.3) + ' ' + (cy - R - 1) + ' l3 7" stroke="' + shadeHex(L.hair, 0.7) + '" stroke-width="1.2"/><path d="M' + (50 - 2) + ' ' + (cy - R - 2) + ' l-3 -5 l5 3" fill="' + L.hair + '"/>'; }
    if (L.style === 'spiky') { for (var sk = -3; sk <= 3; sk++) { var sx = 50 + sk * R * 0.3; s += '<path d="M' + (sx - 5) + ' ' + (cy - R + 7 + Math.abs(sk)) + ' L' + (sx + sk * 1.5) + ' ' + (cy - R - 9 + Math.abs(sk) * 2.2) + ' L' + (sx + 5) + ' ' + (cy - R + 7 + Math.abs(sk)) + 'z" fill="' + (sk % 2 ? L.hair : hl2) + '"/>'; } [-1, 1].forEach(function (d) { s += '<path d="M' + (50 + d * Rh - d * 2) + ' ' + (cy - 8) + ' l' + (d * 6) + ' -2 l' + (-d * 3) + ' 6z" fill="' + L.hair + '"/>'; }); s += '<path d="M44 ' + (cy - 7) + ' l3 5 l3 -5 l3 5 l3 -5z" fill="' + L.hair + '"/>'; }
    if (L.style === 'waves') { for (var wv = 0; wv < 9; wv++) { var wa = Math.PI * 1.05 + (wv / 8) * Math.PI * 0.9; s += '<circle cx="' + (50 + Math.cos(wa) * (Rh + 1)).toFixed(1) + '" cy="' + (cy - 3 + Math.sin(wa) * (Rh + 1)).toFixed(1) + '" r="7" fill="' + (wv % 3 ? L.hair : hl2) + '"/>'; } s += '<circle cx="43" cy="' + (cy - 7) + '" r="4.5" fill="' + L.hair + '"/><circle cx="52" cy="' + (cy - 8) + '" r="4.5" fill="' + L.hair + '"/>'; }
    if (L.style === 'curly') { for (var k = 0; k < 11; k++) { var a = Math.PI * 1.02 + (k / 10) * Math.PI * 0.96; s += '<circle cx="' + (50 + Math.cos(a) * Rh).toFixed(1) + '" cy="' + (cy - 2 + Math.sin(a) * Rh).toFixed(1) + '" r="4.6" fill="' + (k % 3 ? L.hair : hl2) + '"/>'; } for (var k4 = -2; k4 <= 2; k4++) s += '<circle cx="' + (50 + k4 * 4.5) + '" cy="' + (cy - 7 + Math.abs(k4)) + '" r="3" fill="' + L.hair + '"/>'; }
  }
  [-1, 1].forEach(function (d, i) {
    var x = 50 + d * 8, y = cy + 1, kind = L.eye === 'wink' ? (i === 0 ? 'smile' : 'round') : L.eye;
    if (kind === 'smile') s += '<path d="M' + (x - 3.5) + ' ' + (y + 1) + ' q3.5 -5 7 0" fill="none" stroke="' + INK + '" stroke-width="1.8" stroke-linecap="round"/>';
    else if (kind === 'sleepy') s += '<ellipse cx="' + x + '" cy="' + (y + 0.5) + '" rx="3" ry="1.5" fill="' + INK + '"/>';
    else { var big = kind === 'sparkle'; s += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (big ? 3.3 : 2.6) + '" ry="' + (big ? 4.2 : 3.4) + '" fill="' + INK + '"/><circle cx="' + (x + 1.2) + '" cy="' + (y - 1.5) + '" r="' + (big ? 1.3 : 0.9) + '" fill="#fff"/>'; }
  });
  [-1, 1].forEach(function (d, i) { var x = 50 + d * 8, wink = L.eye === 'wink' && i === 0;
    if (f) { s += '<path d="M' + (x - 4) + ' ' + (cy - 5) + ' q4 -3.2 8 0" fill="none" stroke="' + shadeHex(L.hair, 0.85) + '" stroke-width="1.3" stroke-linecap="round"/>'; if (!(L.eye === 'smile' || L.eye === 'sleepy' || wink)) s += '<path d="M' + (x + d * 2.6) + ' ' + (cy - 1.8) + ' l' + (d * 2.4) + ' -1.8 M' + (x + d * 3.2) + ' ' + (cy) + ' l' + (d * 2.4) + ' -0.6" stroke="#1d1d22" stroke-width="1.1" stroke-linecap="round"/>'; }
    else s += '<path d="M' + (x - 4.5) + ' ' + (cy - 6 + d * 0.4) + ' L' + (x + 4.5) + ' ' + (cy - 6 - d * 0.4) + '" stroke="' + shadeHex(L.hair, 0.8) + '" stroke-width="2.6" stroke-linecap="round"/>';
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
      var kind = g[0], key = g[1], label = g[2], list = kind === 'c' ? optsFor(g[1], g[3], draft) : g[3];
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
    var v = e.target.closest('[data-v]'), g = v && v.closest('[data-key]'); if (g) { draft[g.dataset.key] = v.dataset.v; genderFix(draft); changed(); }
  });
  render();
  return { random: function () { AV_KEYS.forEach(function (k) { var pick = AV[k][Math.floor(Math.random() * AV[k].length)]; draft[k] = Array.isArray(pick) ? pick[0] : pick; }); var sl = STYLE_BY[draft.body === 'f' ? 'f' : 'm']; draft.style = sl[Math.floor(Math.random() * sl.length)]; genderFix(draft); changed(); } };
}
function renderStart() {
  $('#stTitle').textContent = P.title; $('#stSub').textContent = P.subtitle; $('#stLead').textContent = P.lead; document.title = 'AI 탄소중립 체험실 · ' + P.title;
  var ai = window.GQAI && GQAI.ready();
  $('#stMade').innerHTML = (ai ? '<b>✨ AI 연결됨 (' + esc(GQAI.label()) + ')</b> · AI 선생님 · AI 탄소 코치 · AI 맞춤 설명' : '<b>AI 선생님 · AI 탄소 코치 · AI 맞춤 설명</b> · AI를 연결하면 켜져요 (⚙️ 설정)') + '<br>' + esc(P.org || '') + (P.meta.model ? ' · 이 마을은 AI(' + esc(P.meta.model) + ')로 만들고 담당자가 승인했어요' : '');
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
  setTimeout(autoMp, 900);
});
$('#fabLearn').addEventListener('click', function () { SFX.init(); SFX.click(); openLearnHub(); });
$('#fabMung').addEventListener('click', function () { SFX.init(); SFX.click(); openMung(); });
$('#fabCalc').addEventListener('click', function () { SFX.init(); SFX.click(); if (P.calc) openCalc(); else openLearnHub(); });
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
      onUserGesture: function () { SFX.init(); }, onPeer: function (id) { openPeer(id); }, onSeed: function (id) { onSeed(id); }, onJump: function () { SFX.boing(); } });
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
