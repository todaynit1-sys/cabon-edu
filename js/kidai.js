/*! 초록별 퀴즈 마을 — 어린이용 AI 기능
 *
 *  ① 맞춤 출제   makeQuiz()   : 아이 학년에 맞춰 그 마을의 근거 카드로만 새 문제를 만듭니다.
 *                               → [1차] 앱이 근거 문장·형식·안전을 자동 대조  → [2차] AI 교차 검토
 *                               → 통과한 문제만 내고, 모자라면 기본 문제은행으로 채웁니다.
 *  ② 다시 설명   reExplain()  : 아이가 고른 오답에 맞춰 왜 틀렸는지 쉬운 말로 다시 알려 줍니다.
 *  ③ 비슷한 문제 similar()    : 같은 근거 카드로 상황만 바꾼 문제를 한 번 더 냅니다.
 *  ④ 얼음이 대화 ask()        : 질문과 가까운 근거 카드를 먼저 찾고(BM25), 그 카드로만 대답합니다.
 *  ⑤ 지구 숙제   homework()   : 아이의 상황(집 형태·좋아한 마을·계절)에 맞는 오늘의 실천 1가지를 정합니다.
 *
 *  모든 AI 호출은 GreenLLM.chat() 하나로만 나가며, 모델은 설정 화면에서 바꿀 수 있습니다.
 *  AI가 없거나 실패하면 언제나 기본 자료로 이어서 진행합니다(아이 화면이 멈추지 않게).
 */
(function () {
'use strict';

var LLM = window.GreenLLM;
var S = window.GQSafety;
var CARDS = window.GQ_CARDS;
var BANK = window.GQ_BANK;
var GRADES = window.GQ_GRADES;
var CARD = {}; CARDS.forEach(function (c) { CARD[c.id] = c; });

/* ------------------------------------------------------------
   설정 (API 키는 기본적으로 메모리에만 둡니다)
   ------------------------------------------------------------ */
var CFG_KEY = 'gq.ai';
var DEF = window.GQ_AI_DEFAULT || {};
var memKey = '';
function loadCfg() {
  var c = {};
  try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch (e) { c = {}; }
  var out = Object.assign({ enabled: true, provider: 'openai', baseUrl: '', model: '', apiKey: '', temperature: 0.4, maxTokens: 1600, crossCheck: true, timeoutSec: 45, keepKey: false }, DEF, c);
  if (!out.keepKey) out.apiKey = memKey || out.apiKey || '';
  return out;
}
function saveCfg(c) {
  memKey = c.apiKey || '';
  var copy = Object.assign({}, c);
  if (!copy.keepKey) delete copy.apiKey;
  try { localStorage.setItem(CFG_KEY, JSON.stringify(copy)); } catch (e) {}
}
/* 모델 서버가 실제로 응답하는지 확인 (꺼져 있으면 기다리지 않고 바로 기본 문제로) */
var STATUS = { state: 'unknown', msg: '' };
var probeSeq = 0;
function probe() {
  var seq = ++probeSeq; // 늦게 끝난 예전 확인 결과가 새 설정의 결과를 덮어쓰지 않게
  var c = loadCfg();
  if (c.enabled && c.provider === 'openai' && LLM && LLM.isReady(c)) STATUS = { state: 'checking', msg: '' };
  return probeOnce(c).then(function (st) { if (seq === probeSeq) STATUS = st; return STATUS; });
}
function probeOnce(c) {
  if (!c.enabled || !LLM || !LLM.isReady(c)) return Promise.resolve({ state: 'off', msg: c.enabled ? '주소·모델명이 비어 있음' : 'AI 꺼짐' });
  if (c.provider === 'webllm') {
    return LLM.web.supported().then(function (sup) {
      if (!sup.ok) return { state: 'fail', msg: sup.why };
      var w = LLM.web.state();
      if (w.ready && w.model === c.model) return { state: 'ok', msg: '' };
      if (w.loading && w.loadingModel === c.model) return { state: 'loading', msg: '', progress: w.progress };
      return { state: 'off', msg: '무료 AI가 아직 꺼져 있음', needLoad: true };
    });
  }
  if (c.provider === 'claude-artifact') return Promise.resolve((window.claude && window.claude.use) ? { state: 'ok', msg: '' } : { state: 'fail', msg: 'claude.ai 공개 페이지에서만 동작' });
  if (c.provider !== 'openai') return Promise.resolve({ state: 'ok', msg: '' });
  var ctrl = new AbortController(), t = setTimeout(function () { ctrl.abort(); }, 3500);
  var headers = {}; if (c.apiKey) headers.Authorization = 'Bearer ' + c.apiKey;
  return fetch(String(c.baseUrl).replace(/\/+$/, '') + '/models', { headers: headers, signal: ctrl.signal }).then(function (res) {
    clearTimeout(t); return { state: 'ok', msg: res.ok ? '' : 'HTTP ' + res.status };
  }, function (e) {
    clearTimeout(t); return { state: 'fail', msg: e && e.name === 'AbortError' ? '모델 서버 응답 없음' : '모델 서버에 연결할 수 없음' };
  });
}
function ready() {
  var c = loadCfg();
  if (!(c.enabled && LLM && LLM.isReady(c))) return false;
  if (c.provider === 'webllm') { var w = LLM.web.state(); return w.ready && w.model === c.model; } // 브라우저 AI는 실제로 불러온 뒤에만
  return STATUS.state !== 'fail' && STATUS.state !== 'off' && STATUS.state !== 'loading';
}
/* 브라우저 AI 진행 상황이 바뀌면 상태도 바로 바꿈 */
if (LLM && LLM.web) LLM.web.on(function () {
  var c = loadCfg(); if (c.provider !== 'webllm') return;
  var w = LLM.web.state();
  if (w.ready && w.model === c.model) STATUS = { state: 'ok', msg: '' };
  else if (w.loading) STATUS = { state: 'loading', msg: '', progress: w.progress };
  else if (w.error) STATUS = { state: 'off', msg: '불러오기 실패: ' + w.error.slice(0, 80), needLoad: true };
});
function isWeb() { return loadCfg().provider === 'webllm'; }

/* ------------------------------------------------------------
   AI 활동 기록 (심사·운영자가 AI가 무엇을 했는지 볼 수 있게)
   ------------------------------------------------------------ */
var LOG_KEY = 'gq.ailog';
var LOG = [];
try { LOG = JSON.parse(localStorage.getItem(LOG_KEY) || '[]') || []; } catch (e) { LOG = []; }
function log(kind, detail) {
  var c = loadCfg();
  LOG.unshift({ t: Date.now(), kind: kind, model: c.enabled ? (c.model || c.provider) : '(AI 꺼짐)', detail: detail });
  if (LOG.length > 60) LOG.length = 60;
  try { localStorage.setItem(LOG_KEY, JSON.stringify(LOG)); } catch (e) {}
}

/* ------------------------------------------------------------
   글자 도구
   ------------------------------------------------------------ */
function norm(s) { return String(s || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, ''); }
function bigrams(s) { s = norm(s); var o = []; for (var i = 0; i < s.length - 1; i++) o.push(s.substr(i, 2)); return o; }
function dice(a, b) {
  var A = bigrams(a), B = bigrams(b); if (!A.length || !B.length) return 0;
  var m = {}; B.forEach(function (x) { m[x] = (m[x] || 0) + 1; });
  var hit = 0; A.forEach(function (x) { if (m[x]) { hit++; m[x]--; } });
  return (2 * hit) / (A.length + B.length);
}
function coverage(a, b) { // a의 낱말 조각이 b에 얼마나 들어 있나
  var A = bigrams(a), B = {}; bigrams(b).forEach(function (x) { B[x] = 1; });
  if (!A.length) return 0; var hit = 0; A.forEach(function (x) { if (B[x]) hit++; }); return hit / A.length;
}
function sentences(t) { return String(t).split(/(?<=[.!?。])\s+/).map(function (s) { return s.trim(); }).filter(Boolean); }
function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function grade(g) { return GRADES[Math.max(0, Math.min(GRADES.length - 1, g | 0))]; }
var GRADE_DESC = [
  '5~7살 유치원생. 한 문장 20자 안팎, 아주 쉬운 낱말만. OX 문제 위주.',
  '초등학교 1~2학년. 짧은 문장, 어려운 한자어는 쉬운 말로 바꾸기.',
  '초등학교 3~4학년. 생활 속 예시를 들어 쉽게.',
  '초등학교 5~6학년. 광합성·대기전력 같은 개념 낱말을 써도 되지만 뜻을 쉽게 풀어서.'
];
function seasonNow() { var m = new Date().getMonth() + 1; return m >= 3 && m <= 5 ? '봄' : m >= 6 && m <= 8 ? '여름' : m >= 9 && m <= 11 ? '가을' : '겨울'; }

/* JSON을 너그럽게 꺼내기 (작은 로컬 모델은 앞뒤에 말을 붙이거나 쉼표를 남기기도 함) */
function parseJSON(text, want) {
  var t = String(text || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/```(?:json)?/gi, '');
  t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  var open = want === 'object' ? '{' : '[', close = want === 'object' ? '}' : ']';
  var a = t.indexOf(open), b = t.lastIndexOf(close);
  if (want !== 'object' && (a < 0 || b <= a)) { // 배열 대신 객체로 감싸 준 경우
    var o = parseJSON(text, 'object');
    if (o) { var k = Object.keys(o).find(function (key) { return Array.isArray(o[key]); }); if (k) return o[k]; }
    return null;
  }
  if (a < 0 || b <= a) return null;
  var body = t.slice(a, b + 1).replace(/,\s*([\]}])/g, '$1');
  try { return JSON.parse(body); } catch (e) { return null; }
}

/* 시간 제한이 있는 AI 호출 */
function call(messages, opts) {
  opts = opts || {};
  var c = loadCfg();
  var cfg = Object.assign({}, c, { temperature: opts.temperature != null ? opts.temperature : c.temperature, maxTokens: opts.maxTokens || c.maxTokens });
  var ctrl = new AbortController();
  var ms = (opts.timeoutSec || c.timeoutSec || 45) * 1000 * (c.provider === 'webllm' ? 2.5 : 1); // 브라우저 AI는 더 느려서 넉넉히
  var timer = setTimeout(function () { ctrl.abort(); }, ms);
  if (opts.signal) opts.signal.addEventListener('abort', function () { ctrl.abort(); });
  return LLM.chat(cfg, messages, { stream: false, signal: ctrl.signal, json: !!opts.json, schema: opts.schema, background: !!opts.background }).then(function (t) {
    clearTimeout(timer); return LLM.stripThinking(t);
  }, function (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') { var x = new Error('시간 초과'); x.timeout = true; throw x; }
    if (e && e.name === 'TypeError' && c.provider !== 'webllm') STATUS = { state: 'fail', msg: '모델 서버에 연결할 수 없음' }; // 네트워크 오류: 다음부터는 바로 기본 자료로
    throw e;
  });
}

/* ------------------------------------------------------------
   근거 카드 검색 (BM25, 한글 2글자 조각 색인) — AI 환경비서의 검색 방식을 어린이용 카드에 맞춤
   ------------------------------------------------------------ */
var STOP = {};
'요해 해요 어요 아요 에요 이에 예요 니까 까요 는데 하면 있어 하는 하고 그리 리고 에서 으로 이야 거야 야요 이고 는지 을까 를까 할까 어떻 떻게 왜그 무엇 뭐야 알려 려줘 줘요 나요 인가 가요'.split(' ').forEach(function (w) { STOP[w] = 1; });
function tokenize(s) {
  var out = [];
  (String(s || '').toLowerCase().match(/[가-힣a-z0-9]+/g) || []).forEach(function (w) {
    if (/^[a-z0-9]+$/.test(w)) { if (w.length > 1) out.push(w); return; }
    if (w.length === 1) return;
    for (var i = 0; i < w.length - 1; i++) { var g = w.substr(i, 2); if (!STOP[g]) out.push(g); }
  });
  return out;
}
var IDX = (function () {
  var docs = [], post = {}, total = 0;
  CARDS.forEach(function (c, i) {
    var toks = tokenize(c.title + ' ' + c.title + ' ' + (c.keys || '') + ' ' + (c.keys || '') + ' ' + c.text), tf = {};
    toks.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
    Object.keys(tf).forEach(function (t) { (post[t] = post[t] || []).push(i); });
    docs.push({ c: c, tf: tf, len: toks.length }); total += toks.length;
  });
  return { docs: docs, post: post, N: docs.length, avg: total / docs.length };
})();
function retrieve(q, k) {
  var qt = tokenize(q), uniq = {}; qt.forEach(function (t) { uniq[t] = 1; });
  var scores = {}, matched = {};
  Object.keys(uniq).forEach(function (t) {
    var pl = IDX.post[t]; if (!pl) return;
    var idf = Math.log(1 + (IDX.N - pl.length + 0.5) / (pl.length + 0.5));
    pl.forEach(function (i) {
      var d = IDX.docs[i], f = d.tf[t];
      scores[i] = (scores[i] || 0) + idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.len / IDX.avg));
      matched[i] = (matched[i] || 0) + 1;
    });
  });
  return Object.keys(scores).map(function (i) { return { card: IDX.docs[i].c, s: scores[i], m: matched[i] }; })
    .filter(function (h) { return h.m >= 2 || h.s >= 2.4; })
    .sort(function (a, b) { return b.s - a.s; })
    .slice(0, k || 3);
}

/* ------------------------------------------------------------
   기본 문제은행에서 고르기
   ------------------------------------------------------------ */
function pickBank(zone, g, n, seen, avoidIds) {
  var lv = grade(g).level;
  seen = seen || {}; avoidIds = avoidIds || {};
  var pool = BANK.filter(function (b) { return b.zone === zone && !avoidIds[b.id]; });
  function score(b) {
    var s = Math.random();
    if (b.level === lv) s += 2; else if (Math.abs(b.level - lv) === 1) s += 1;
    if (g === 0 && b.type === 'ox') s += 1.2;
    if (!seen[b.id]) s += 3;
    return s;
  }
  var picked = pool.map(function (b) { return { b: b, s: score(b) }; }).sort(function (a, b) { return b.s - a.s; }).slice(0, n).map(function (x) { return x.b; });
  return shuffle(picked).map(function (b) { return Object.assign({ source: 'bank', check: { ok: true, by: '기본 문제(사람이 검수)' } }, b); });
}

/* ------------------------------------------------------------
   1차 검증: 근거 대조 · 형식 · 안전
   ------------------------------------------------------------ */
function normType(t) {
  t = String(t || '').toLowerCase();
  if (/ox|o\/x|참거짓|true|맞|틀/.test(t)) return 'ox';
  if (/choice|객관|선다|multiple|보기/.test(t)) return 'choice';
  return '';
}
function normOX(a) {
  var s = String(a == null ? '' : a).trim().toLowerCase();
  if (/^(o|○|◯|맞|true|yes|참|예)/.test(s)) return 'O';
  if (/^(x|×|✕|틀|false|no|거짓|아니)/.test(s)) return 'X';
  return '';
}
function normEv(e) { var m = String(e || '').toUpperCase().match(/[EHRFT]\d{1,2}/); return m ? m[0] : ''; }
function unsafe(t) { var r = S.checkOutput(t, 9999); return !r.ok || r.text.length < String(t).replace(/[*_#>`]/g, '').trim().length * 0.7; }

/* OX 문제는 "~요." 같은 설명 문장이어야 맞다/아니다로 답할 수 있음 ("무엇을 할까요?"는 OX가 될 수 없음) */
function oxStatement(q) {
  q = String(q || '').trim();
  return !/(무엇|뭐|어떤|어떻게|어디|언제|누가|누구|몇|왜|어느)/.test(q); // "~일까요?" 같은 예/아니오 질문은 괜찮음
}
/* 뜻이 뒤집혔는지 보는 간단한 검사: 부정어 수와 반대말 쌍 */
var NEG = /(안 |않|못 |없|아니|말고|금지)/g;
/* 반대말 쌍 (활용형까지) — "꺼 두는"이 "켜 두는"으로 바뀌면 정답이 뒤집힘 */
var ANTONYM = [
  [/켜|켠|켭/, /끄|꺼|끈|끕/], [/꽂/, /뽑/], [/늘어|늘려|늘리/, /줄어|줄여|줄이/], [/많이|많은|많아|많게/, /적게|적은|적어/],
  [/좋아|좋은|좋게|좋다/, /나쁘|나빠|나쁜/], [/열어|열면|열고|연다/, /닫/], [/남기|남겨|남긴/, /남김없이|다 먹/],
  [/버리|버려|버린/, /아껴|아끼/], [/걸어|걷/, /자동차|차를 타/], [/같이|함께|섞어/, /따로|분리/]
];
function flipped(a, b) {
  a = String(a); b = String(b);
  var na = (a.match(NEG) || []).length % 2, nb = (b.match(NEG) || []).length % 2;
  if (na !== nb) return true;
  return ANTONYM.some(function (p) {
    var a0 = p[0].test(a), a1 = p[1].test(a), b0 = p[0].test(b), b1 = p[1].test(b);
    return (a0 && !a1 && b1 && !b0) || (a1 && !a0 && b0 && !b1);
  });
}

function verifyItem(raw, allowed, g, others) {
  var it = {}; var maxLen = Math.round(grade(g).maxLen * 1.5);
  if (!raw || typeof raw !== 'object') return { ok: false, reason: '형식이 아님' };
  // 유형은 표시보다 내용으로 판단 (작은 모델은 OX 문제에 choice라고 적기도 함)
  var nOpts = Array.isArray(raw.options) ? raw.options.filter(function (o) { return String(o || '').trim(); }).length : 0;
  if (nOpts >= 3) it.type = 'choice';
  else if (normOX(raw.answer)) it.type = 'ox';
  else it.type = normType(raw.type) || 'ox';
  it.q = String(raw.q || raw.question || '').trim();
  if (!it.q) return { ok: false, reason: '문제 문장 없음' };
  if (it.q.length > maxLen) return { ok: false, reason: '학년에 비해 문장이 너무 김(' + it.q.length + '자)' };
  if (it.type === 'ox') {
    it.answer = normOX(raw.answer);
    if (!it.answer) return { ok: false, reason: 'OX 정답 표시가 이상함' };
    if (!oxStatement(it.q)) return { ok: false, reason: 'OX인데 맞다/아니다로 답할 수 없는 질문' };
  } else {
    var opts = (raw.options || raw.choices || []).map(function (o) { return String(o || '').replace(/^\s*[①②③④1-4][.)]\s*/, '').trim(); }).filter(Boolean);
    if (opts.length < 3) return { ok: false, reason: '보기가 3개보다 적음' };
    opts = opts.slice(0, 3);
    var uniq = opts.filter(function (o, i) { return opts.indexOf(o) === i; });
    if (uniq.length < 3) return { ok: false, reason: '보기가 겹침' };
    var a = raw.answer;
    if (typeof a === 'string' && !/^\d$/.test(a.trim())) a = opts.indexOf(a.trim());
    a = parseInt(a, 10);
    if (!(a >= 0 && a <= 2)) return { ok: false, reason: '정답 번호가 이상함' };
    it.options = opts; it.answer = a;
  }
  it.ev = normEv(raw.ev || raw.evidence || raw.card);
  var card = CARD[it.ev];
  if (!card || allowed.indexOf(it.ev) < 0) return { ok: false, reason: '근거 카드 번호가 없거나 다른 마을 카드(' + (raw.ev || '없음') + ')' };
  var quote = String(raw.quote || raw.근거문장 || '').trim();
  if (!quote) return { ok: false, reason: '근거 문장을 적지 않음' };
  var inCard = norm(card.text).indexOf(norm(quote)) >= 0 && norm(quote).length >= 6;
  var best = 0; sentences(card.text).forEach(function (s) { best = Math.max(best, dice(quote, s)); });
  if (!inCard && best < 0.55) return { ok: false, reason: '근거 문장이 카드에 없음(지어냈을 수 있음)' };
  var answerText = it.type === 'choice' ? it.options[it.answer] : '';
  var rel = coverage(it.q + ' ' + answerText, card.text);
  if (rel < 0.15) return { ok: false, reason: '문제와 근거 카드의 관련이 약함' };
  it.explain = String(raw.explain || '').trim() || card.text;
  it.hint = String(raw.hint || '').trim();
  var all = [it.q, it.explain, it.hint].concat(it.options || []);
  for (var i = 0; i < all.length; i++) if (all[i] && unsafe(all[i])) return { ok: false, reason: '어린이에게 맞지 않는 표현' };
  if (/죽|멸망|재앙|끔찍|무서/.test(it.q + it.explain)) return { ok: false, reason: '겁주는 표현' };
  for (var j = 0; j < others.length; j++) if (dice(it.q, others[j]) > 0.82) return { ok: false, reason: '이미 낸 문제와 거의 같음' };
  it.quote = quote;
  it.check = { ok: true, by: '근거 대조 통과', score: Math.round((inCard ? 1 : best) * 100) };
  return { ok: true, item: it };
}

/* JSON 모양 정의 — 브라우저 AI는 이 모양대로만 글자를 내도록 강제합니다 */
var S_STR = { type: 'string' };
var SCHEMA_QUIZ = { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: {
  type: { type: 'string', enum: ['ox', 'choice'] }, q: S_STR, options: { type: 'array', items: S_STR }, answer: S_STR,
  explain: S_STR, hint: S_STR, ev: S_STR, quote: S_STR }, required: ['type', 'q', 'answer', 'explain', 'hint', 'ev', 'quote'] } } }, required: ['questions'] };
var SCHEMA_CHECK = { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, ok: { type: 'boolean' }, why: S_STR }, required: ['n', 'ok', 'why'] } } }, required: ['results'] };
var SCHEMA_HW = { type: 'object', properties: { text: S_STR, why: S_STR, ev: S_STR }, required: ['text', 'why', 'ev'] };

/* ------------------------------------------------------------
   2차 검증: AI 교차 검토 (생성과 검토를 나눠서 한 번 더 확인)
   ------------------------------------------------------------ */
function crossCheck(items, bg) {
  var c = loadCfg();
  if (!c.crossCheck || !items.length) return Promise.resolve({ items: items, skipped: true });
  var lines = items.map(function (it, i) {
    var ans = it.type === 'ox' ? it.answer : (it.options[it.answer] + ' (보기: ' + it.options.join(' / ') + ')');
    return (i + 1) + '. 문제: ' + it.q + '\n   정답: ' + ans + '\n   근거 카드: ' + CARD[it.ev].text;
  }).join('\n');
  var msgs = [
    { role: 'system', content: '너는 어린이 환경교육 퀴즈 검수자야. 각 문제마다 ① 정답이 근거 카드 내용으로 뒷받침되는지 ② 정답이 하나뿐인지 ③ 어린이에게 안전하고 다정한 표현인지 판단해. 하나라도 아니면 ok는 false. JSON 객체 하나만 출력: {"results":[{"n":1,"ok":true,"why":"짧은 이유"}]}' },
    { role: 'user', content: lines }
  ];
  return call(msgs, { temperature: 0, maxTokens: 700, timeoutSec: Math.min(30, c.timeoutSec || 45), json: true, schema: SCHEMA_CHECK, background: bg }).then(function (t) {
    var arr = parseJSON(t);
    if (!Array.isArray(arr)) return { items: items, skipped: true, note: '검토 결과를 읽지 못해 1차 검증 결과만 사용' };
    var bad = {}, seen = {};
    arr.forEach(function (r) { if (!r) return; var k = (r.n | 0) - 1; seen[k] = 1; if (r.ok === false || r.ok === 'false') bad[k] = String(r.why || '검토에서 탈락'); });
    var keep = [], dropped = [];
    items.forEach(function (it, i) {
      if (bad[i] != null) dropped.push({ q: it.q, reason: 'AI 교차 검토: ' + bad[i] });
      else if (!seen[i]) dropped.push({ q: it.q, reason: 'AI 교차 검토 결과가 빠짐(확인 못 한 문제는 내지 않음)' });
      else { it.check.by = it.check.by.replace('통과', '') .trim() + ' + AI 교차 검토 통과'; keep.push(it); }
    });
    return { items: keep, dropped: dropped };
  }, function (e) {
    if (e && e.interrupted) throw e; // 미리 만들기가 아이 요청에 자리를 내준 경우: 결과를 쓰지 않음
    return { items: items, skipped: true, note: '교차 검토 생략(' + (e.timeout ? '시간 초과' : '연결 오류') + ')' };
  });
}

/* ------------------------------------------------------------
   ① 맞춤 출제
   ------------------------------------------------------------ */
function cardsBlock(list) { return list.map(function (c) { return c.id + ' (' + c.title + '): ' + c.text; }).join('\n'); }
function quizMessages(cards, g, n, avoid, extra, avoidMax) {
  var G = grade(g);
  var sys = [
    '너는 어린이 탄소중립 환경교육 퀴즈를 만드는 다정한 선생님이야.',
    '반드시 [근거 카드]에 적힌 사실만으로 문제를 만들어. 카드에 없는 사실·숫자·이름은 절대 지어내지 마.',
    '대상: ' + GRADE_DESC[G.id],
    '규칙:',
    '- 문제 ' + n + '개. OX 문제와 3지선다 문제를 섞어.' + (G.id === 0 ? ' (유치원이라 OX를 더 많이)' : ''),
    '- 문제 문장은 ' + G.maxLen + '자 이내, 아이에게 말하듯 "~요" 체.',
    '- 겁주는 표현(죽는다, 멸망, 재앙 등) 금지. 밝고 다정하게.',
    '- 3지선다 오답은 그럴듯하되 위험한 행동을 권하지 마. 정답 위치를 골고루 섞어.',
    '- 문제마다 서로 다른 근거 카드를 써서 골고루 내.',
    '- 각 문제마다 근거 카드 번호(ev)와 그 카드에서 글자 그대로 옮겨 적은 짧은 근거 구절(quote, 10~30자)을 넣어.',
    '- OX 문제는 options를 비워 두고 answer에 "O" 또는 "X". 3지선다는 options에 보기 3개, answer에 정답 번호.',
    '- explain: 정답 해설 1~2문장. hint: 틀렸을 때 생각을 돕는 한 문장(정답을 바로 말하지 말 것).',
    (avoidMax === 0 ? '- 카드 문장을 그대로 문제로 쓰지 말고, 아이 생활 장면으로 바꿔서 새롭게 물어봐.' : '- [이미 낸 문제]와 같은 문제는 피해.'),
    '출력은 JSON 객체 하나만. 다른 말은 쓰지 마. answer는 OX면 "O" 또는 "X", 3지선다면 정답 보기 번호(0,1,2 중 하나).',
    '형식 예: {"questions":[{"type":"ox","q":"...","answer":"O","explain":"...","hint":"...","ev":"H2","quote":"..."},{"type":"choice","q":"...","options":["...","...","..."],"answer":1,"explain":"...","hint":"...","ev":"H5","quote":"..."}]}'
  ].join('\n');
  // 작은 모델은 예시 문제를 그대로 베끼므로, avoidMax === 0이면 '이미 낸 문제' 목록을 주지 않고 앱이 나중에 중복을 거릅니다
  var avoidBlock = avoidMax === 0 ? '' : '\n\n[이미 낸 문제]\n' + (avoid.length ? shuffle(avoid).slice(0, avoidMax || 14).map(function (q) { return '- ' + q; }).join('\n') : '- 없음');
  var user = '[근거 카드]\n' + cardsBlock(cards) + avoidBlock +
    (extra ? '\n\n' + extra : '') + '\n\n문제 ' + n + '개를 {"questions":[...]} JSON으로 만들어 줘.';
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}

/* ------------------------------------------------------------
   ①-b 다시 쓰기 출제 (작은 브라우저 모델용)
   사람이 검수한 문제의 뜻·정답·보기는 그대로 두고, AI가 아이 학년과 생활 장면에 맞게 문장만 새로 씁니다.
   → 정답이 바뀌지 않았는지 앱이 확인(부정어·반대말·관련성) → AI 교차 검토 → 통과 못 한 문제는 원래 문제로.
   ------------------------------------------------------------ */
var SCHEMA_RW = { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: { id: S_STR, q: S_STR, explain: S_STR }, required: ['id', 'q', 'explain'] } } }, required: ['questions'] };
function rewriteMessages(base, g, scene) {
  var G = grade(g);
  var sys = [
    '너는 어린이 환경교육 퀴즈를 아이 눈높이로 다시 쓰는 다정한 선생님이야.',
    '대상: ' + GRADE_DESC[G.id],
    '규칙:',
    '- 정답과 보기는 그대로 두되, 문장은 반드시 새로 써. 원래 문장을 그대로 베끼면 안 돼.',
    '- ' + (scene || '문장마다 아이가 겪는 생활 장면(저녁 거실, 학교 가는 길, 급식 시간, 놀이터, 마트 등)을 한 가지 넣어') + ' 새 문장으로 바꿔.',
    '- 예) 원래: "아무도 없는 방의 불은 꺼 두는 게 좋아요." → 새 문장: "놀이를 마치고 방을 나올 때는 불을 끄고 나오는 게 좋아요."',
    '- 예) 원래: "일회용 컵 대신 쓰면 좋은 것은?" → 새 문장: "소풍 가서 음료수를 마실 때 일회용 컵 대신 챙겨 가면 좋은 것은?"',
    '- OX 문제는 "~요."로 끝나는 설명 문장으로 써. "무엇·어떤·몇" 같은 묻는 말을 쓰지 마.',
    '- 문제 문장은 ' + G.maxLen + '자 이내, "~요" 체. 겁주는 말 금지.',
    '- explain: 왜 그 답인지 근거에 맞게 1~2문장으로 쉽게.',
    '- 근거에 없는 사실이나 숫자를 보태지 마.',
    'JSON 객체 하나만 출력: {"questions":[{"id":"문제 id","q":"새 문제 문장","explain":"해설"}]}'
  ].join('\n');
  var user = base.map(function (b) {
    var ans = b.type === 'ox' ? (b.answer === 'O' ? 'O(맞아요)' : 'X(아니에요)') : b.options[b.answer];
    return 'id: ' + b.id + '\n유형: ' + (b.type === 'ox' ? 'OX' : '3지선다') + '\n원래 문제: ' + b.q + (b.options ? '\n보기: ' + b.options.join(' / ') : '') + '\n정답: ' + ans + '\n근거: ' + CARD[b.ev].text;
  }).join('\n\n') + '\n\n위 문제 ' + base.length + '개를 모두 다시 써서 JSON으로 줘.';
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}
function verifyRewrite(b, raw, g, others) {
  var maxLen = Math.round(grade(g).maxLen * 1.5);
  var q = String((raw && raw.q) || '').trim(), card = CARD[b.ev];
  if (!q) return { ok: false, reason: '새 문장이 비어 있음' };
  if (q.length > maxLen) return { ok: false, reason: '학년에 비해 문장이 너무 김(' + q.length + '자)' };
  if (dice(q, b.q) > 0.85) return { ok: false, reason: '원래 문제와 거의 같음(다시 쓰지 않음)' };
  if (/[?？]\s*요|요\.\s*요|\s{2,}|[a-zA-Z]{3,}/.test(q)) return { ok: false, reason: '문장이 어색함(맞춤법·문장 끝)' };
  if (/(습니다|입니다|니까\?)/.test(q)) return { ok: false, reason: '아이 말투(~요)가 아님' };
  if (b.type === 'ox' && !oxStatement(q)) return { ok: false, reason: 'OX인데 맞다/아니다로 답할 수 없는 질문' };
  if (b.type === 'choice' && !/([?？]$|무엇|어떤|어떻게|어디|언제|누가|몇|어느|것은|건\?)/.test(q)) return { ok: false, reason: '3지선다인데 질문 문장이 아님' };
  if (flipped(b.q, q)) return { ok: false, reason: '뜻이 뒤집혔을 수 있음(부정어·반대말이 바뀜)' };
  if (b.type === 'choice' && /아닌|않은|틀린/.test(b.q) !== /아닌|않은|틀린/.test(q)) return { ok: false, reason: '"아닌 것" 물음이 바뀜' };
  if (coverage(q, b.q + ' ' + card.text + ' ' + (b.options || []).join(' ')) < 0.22) return { ok: false, reason: '원래 문제·근거와 관련이 약함' };
  var ex = String((raw && raw.explain) || '').trim();
  if (!ex || coverage(ex, card.text + ' ' + b.explain) < 0.35 || /(습니다|입니다)/.test(ex) || flipped(b.explain, ex)) ex = b.explain; // 해설이 근거와 멀거나 말투가 다르면 사람이 쓴 해설 사용
  var all = [q, ex];
  for (var i = 0; i < all.length; i++) if (unsafe(all[i])) return { ok: false, reason: '어린이에게 맞지 않는 표현' };
  if (/죽|멸망|재앙|끔찍|무서/.test(q + ex)) return { ok: false, reason: '겁주는 표현' };
  for (var j = 0; j < others.length; j++) if (dice(q, others[j]) > 0.82) return { ok: false, reason: '이미 낸 문제와 거의 같음' };
  var it = Object.assign({}, b, { id: 'ai-rw-' + b.id + '-' + Date.now(), base: b.id, q: q, explain: ex, source: 'ai', mode: 'rewrite',
    quote: '', check: { ok: true, by: '검수 문제를 AI가 다시 씀 · 정답 보존 확인 통과' }, origQ: b.q });
  return { ok: true, item: it };
}
/* 모델이 id를 바꾸거나 순서를 섞어도, 내용이 가장 비슷한 원래 문제와 짝을 지음 (한 결과는 한 문제에만) */
function matchRewrites(base, arr) {
  var out = {}, used = {}, pairs = [];
  arr.forEach(function (r, j) {
    if (!r || !r.q) return;
    base.forEach(function (b) {
      var s = dice(r.q, b.q) + 0.6 * coverage(r.q, CARD[b.ev].text + ' ' + (b.options || []).join(' '));
      if (r.id === b.id) s += 0.5; else if (String(r.id || '').indexOf(b.id) >= 0) s += 0.2;
      pairs.push({ j: j, b: b.id, s: s });
    });
  });
  pairs.sort(function (x, y) { return y.s - x.s; });
  pairs.forEach(function (p) { if (p.s < 0.35 || used[p.j] || out[p.b]) return; out[p.b] = arr[p.j]; used[p.j] = 1; });
  return out;
}
function rewriteQuiz(zone, g, n, seen, signal, opt) {
  var t0 = Date.now();
  var base = pickBank(zone, g, n, seen).map(function (b) { var c = Object.assign({}, b); delete c.source; delete c.check; return c; });
  var report = { asked: base.length, passed: 0, dropped: [], cross: '', mode: 'rewrite' };
  return call(rewriteMessages(base, g), { signal: signal, json: true, schema: SCHEMA_RW, background: !!opt.background, maxTokens: 1000, temperature: 0.85 }).then(function (text) {
    var arr = parseJSON(text);
    if (!Array.isArray(arr)) throw new Error('AI 결과를 읽지 못함');
    var byId = matchRewrites(base, arr);
    var ok = [], others = Object.keys(seen).filter(function (k) { return k.indexOf('q:') === 0; }).map(function (k) { return k.slice(2); });
    base.forEach(function (b) {
      var v = verifyRewrite(b, byId[b.id], g, others);
      if (v.ok) { ok.push(v.item); others.push(v.item.q); } else report.dropped.push({ q: (byId[b.id] && byId[b.id].q) || b.q, reason: v.reason });
    });
    return crossCheck(ok, !!opt.background);
  }).then(function (r) {
    if (r.dropped) report.dropped = report.dropped.concat(r.dropped);
    report.cross = r.skipped ? (r.note || '교차 검토 꺼짐') : '교차 검토 완료';
    var pass = {}; r.items.forEach(function (it) { pass[it.base] = it; });
    var items = base.map(function (b) { return pass[b.id] || Object.assign({ source: 'bank', check: { ok: true, by: '기본 문제(사람이 검수)' } }, b); });
    report.passed = r.items.length; report.ms = Date.now() - t0;
    var source = report.passed >= n ? 'ai' : report.passed > 0 ? 'mixed' : 'bank';
    log('출제', { zone: zone, grade: grade(g).label, mode: 'AI 다시 쓰기', asked: report.asked, passed: report.passed, dropped: report.dropped, cross: report.cross, ms: report.ms });
    return { items: shuffleTypes(items), source: source, report: report };
  }).catch(function (e) {
    report.error = e.message || String(e);
    if (e && e.interrupted) { report.interrupted = true; return { items: shuffleTypes(base.map(function (b) { return Object.assign({ source: 'bank', check: { ok: true, by: '기본 문제(사람이 검수)' } }, b); })), source: 'bank', report: report }; }
    log('출제 실패 → 기본 문제', { zone: zone, mode: 'AI 다시 쓰기', error: report.error, ms: Date.now() - t0 });
    return { items: shuffleTypes(base.map(function (b) { return Object.assign({ source: 'bank', check: { ok: true, by: '기본 문제(사람이 검수)' } }, b); })), source: 'bank', report: report };
  });
}

/**
 * @returns Promise<{ items, source:'ai'|'mixed'|'bank', report }>
 *  작은 브라우저 모델 → 다시 쓰기 출제 / 서버 모델 → 근거 카드로 새로 출제
 */
function makeQuiz(zone, g, n, seen, signal, opt) {
  seen = seen || {}; opt = opt || {};
  var bankFill = function (k, avoid) { return pickBank(zone, g, k, seen, avoid); };
  if (!ready()) return Promise.resolve({ items: bankFill(n), source: 'bank', report: { reason: 'AI 미연결' } });
  var web = isWeb();
  if (web) return rewriteQuiz(zone, g, n, seen, signal, opt);
  var extra = web ? 1 : 2; // 브라우저 AI는 느리고 기억 창이 작아서 여유분을 줄임
  var cards = CARDS.filter(function (c) { return c.zone === zone; });
  var allowed = cards.map(function (c) { return c.id; });
  var avoid = BANK.filter(function (b) { return b.zone === zone; }).map(function (b) { return b.q; })
    .concat(Object.keys(seen).filter(function (k) { return k.indexOf('q:') === 0; }).map(function (k) { return k.slice(2); }));
  var t0 = Date.now();
  var report = { asked: n + extra, passed: 0, dropped: [], cross: '' };
  return call(quizMessages(cards, g, n + extra, avoid, '', web ? 0 : 14), { signal: signal, json: true, schema: SCHEMA_QUIZ, background: !!opt.background, maxTokens: web ? 1400 : undefined }).then(function (text) {
    var arr = parseJSON(text);
    if (!Array.isArray(arr)) throw new Error('AI 결과를 읽지 못함');
    var ok = [], qs = avoid.slice();
    arr.forEach(function (raw) {
      var v = verifyItem(raw, allowed, g, qs);
      if (v.ok) { ok.push(v.item); qs.push(v.item.q); }
      else report.dropped.push({ q: String((raw && (raw.q || raw.question)) || '(빈 문제)'), reason: v.reason });
    });
    return crossCheck(ok, !!opt.background);
  }).then(function (r) {
    if (r.dropped) report.dropped = report.dropped.concat(r.dropped);
    report.cross = r.skipped ? (r.note || '교차 검토 꺼짐') : '교차 검토 완료';
    var items = r.items.slice(0, n).map(function (it, i) { return Object.assign(it, { id: 'ai-' + Date.now() + '-' + i, zone: zone, source: 'ai' }); });
    report.passed = items.length;
    report.ms = Date.now() - t0;
    var need = n - items.length;
    if (need > 0) { // AI 문제와 겹치는 기본 문제는 빼고 채움
      var avoidB = {};
      BANK.forEach(function (b) { if (b.zone === zone && items.some(function (it) { return it.ev === b.ev || dice(it.q, b.q) > 0.45; })) avoidB[b.id] = 1; });
      var fill = bankFill(need, avoidB);
      if (fill.length < need) { var used = {}; fill.forEach(function (f) { used[f.id] = 1; }); fill = fill.concat(bankFill(need - fill.length, used)); } // 모자라면 겹침 조건을 풀고 채움
      items = items.concat(fill.slice(0, need));
    }
    var source = need <= 0 ? 'ai' : (need < n ? 'mixed' : 'bank');
    log('출제', { zone: zone, grade: grade(g).label, asked: report.asked, passed: report.passed, dropped: report.dropped, cross: report.cross, ms: report.ms });
    return { items: shuffleTypes(items), source: source, report: report };
  }).catch(function (e) {
    report.error = e.message || String(e);
    if (e && e.interrupted) { report.interrupted = true; return { items: bankFill(n), source: 'bank', report: report }; } // 미리 만들기 양보: 기록하지 않음
    log('출제 실패 → 기본 문제', { zone: zone, error: report.error, ms: Date.now() - t0 });
    return { items: bankFill(n), source: 'bank', report: report };
  });
}
function shuffleTypes(items) { // 같은 유형이 너무 몰리지 않게 살짝 섞기
  var ox = items.filter(function (i) { return i.type === 'ox'; }), ch = items.filter(function (i) { return i.type !== 'ox'; }), out = [];
  while (ox.length || ch.length) { if (ox.length) out.push(ox.shift()); if (ch.length) out.push(ch.shift()); }
  return out;
}

/* ------------------------------------------------------------
   ② 다시 설명 · ③ 비슷한 문제
   ------------------------------------------------------------ */
var PERSONA = '너는 어린이 환경교육 앱 "초록별 퀴즈 마을"의 아기 북극곰 "얼음이"야. 다정한 반말(~야, ~해)로 아주 쉽게 말해. 겁주는 말은 절대 하지 마. 인사말이나 "아가" 같은 호칭 없이 바로 본론을 말하고, 아이에게 되묻지 마. 이모지는 쓰지 마.';
function answerText(it, a) { return it.type === 'ox' ? (a === 'O' ? 'O (맞아요)' : 'X (아니에요)') : it.options[a]; }

function reExplain(it, chosen, g) {
  var card = CARD[it.ev];
  var fallback = (it.hint ? it.hint + ' ' : '') + (it.explain || (card && card.text) || '');
  if (!ready() || !card) return Promise.resolve({ text: fallback, mode: 'bank' });
  var msgs = [
    { role: 'system', content: PERSONA + '\n대상: ' + GRADE_DESC[grade(g).id] + '\n아이가 퀴즈를 틀렸어. 근거 카드 내용으로만 2~3문장(120자 안팎)으로 다시 설명해 줘. 먼저 아이가 그렇게 생각한 마음을 인정해 주고("그렇게 생각할 수도 있어!"), 쉬운 비유를 하나 써. 정답을 알려 줘도 돼. 마지막은 짧은 응원. 카드 번호나 기호는 쓰지 마.' },
    { role: 'user', content: '문제: ' + it.q + (it.options ? '\n보기: ' + it.options.join(' / ') : '') + '\n아이가 고른 답: ' + answerText(it, chosen) + '\n정답: ' + answerText(it, it.answer) + '\n근거 카드: ' + card.text }
  ];
  return call(msgs, { temperature: 0.5, maxTokens: isWeb() ? 220 : 400, timeoutSec: 25 }).then(function (t) {
    var r = S.checkOutput(t, 230);
    if (!r.ok || coverage(r.text, card.text + ' ' + it.q + ' ' + (it.options || []).join(' ')) < 0.12) { log('다시 설명 → 기본 설명', { reason: '점검 탈락' }); return { text: fallback, mode: 'bank' }; }
    log('다시 설명', { q: it.q });
    return { text: r.text, mode: 'ai' };
  }, function (e) { log('다시 설명 실패 → 기본 설명', { error: e.message }); return { text: fallback, mode: 'bank' }; });
}

function similar(it, g, seen) {
  var card = CARD[it.ev];
  var bankAlt = function () {
    var used = {}; used[it.id] = 1;
    var same = BANK.filter(function (b) { return b.ev === it.ev && b.id !== it.id; });
    var pick = same.length ? same[Math.floor(Math.random() * same.length)] : pickBank(it.zone, g, 1, seen, used)[0];
    return pick ? Object.assign({ source: 'bank', check: { ok: true, by: '기본 문제(사람이 검수)' } }, pick, { retry: true }) : null;
  };
  if (!ready() || !card) return Promise.resolve(bankAlt());
  if (isWeb()) { // 작은 모델: 같은 근거의 검수 문제를 다른 장면으로 다시 써서 냄
    var baseId = it.base || it.id;
    var pool = BANK.filter(function (b) { return b.ev === it.ev && b.id !== baseId; });
    var b0 = pool.length ? pool[Math.floor(Math.random() * pool.length)] : BANK.find(function (b) { return b.id === baseId; });
    if (!b0) return Promise.resolve(bankAlt());
    var b = Object.assign({}, b0);
    return call(rewriteMessages([b], g, '처음 문제와는 다른 생활 장면을 넣어'), { temperature: 0.8, maxTokens: 300, timeoutSec: 25, json: true, schema: SCHEMA_RW }).then(function (t) {
      var arr = parseJSON(t); var v = verifyRewrite(b, Array.isArray(arr) ? (matchRewrites([b], arr)[b.id] || arr[0]) : null, g, [it.q, it.origQ || '']);
      if (!v.ok) { log('비슷한 문제 → 기본 문제', { reason: v.reason }); return Object.assign({ source: 'bank', check: { ok: true, by: '기본 문제(사람이 검수)' } }, b, { retry: true }); }
      log('비슷한 문제', { q: v.item.q, mode: 'AI 다시 쓰기' });
      return Object.assign(v.item, { retry: true });
    }, function (e) { log('비슷한 문제 실패 → 기본 문제', { error: e.message }); return bankAlt(); });
  }
  var msgs = quizMessages([card], g, 1, [it.q], '[바꿔 낼 문제]\n' + it.q + '\n같은 근거 카드 내용으로, 상황이나 물어보는 방법을 바꾼 새 문제 1개를 만들어 줘.');
  return call(msgs, { temperature: 0.6, maxTokens: 500, timeoutSec: 25, json: true, schema: SCHEMA_QUIZ }).then(function (t) {
    var arr = parseJSON(t); var raw = Array.isArray(arr) ? arr[0] : null;
    var v = verifyItem(raw, [card.id], g, [it.q]);
    if (!v.ok) { log('비슷한 문제 → 기본 문제', { reason: v.reason }); return bankAlt(); }
    log('비슷한 문제', { q: v.item.q });
    return Object.assign(v.item, { id: 'ai-r-' + Date.now(), zone: it.zone, source: 'ai', retry: true });
  }, function (e) { log('비슷한 문제 실패 → 기본 문제', { error: e.message }); return bankAlt(); });
}

/* ------------------------------------------------------------
   ④ 얼음이 대화
   ------------------------------------------------------------ */
var SUGGEST = ['탄소중립이 뭐야?', '북극곰은 왜 힘들어?', '플러그는 왜 뽑아야 해?', '페트병 라벨은 왜 떼?', '나무는 어떻게 지구를 도와?', '걸어가면 왜 좋아?'];
function ask(text, g, history) {
  var m = S.maskPII(text);
  var c = S.checkInput(m.text);
  if (!c.ok) { log('대화 막음', { kind: c.kind }); return Promise.resolve({ mode: 'guard', text: c.reply, masked: m.found, sent: '' }); }
  var hits = retrieve(c.text, 3);
  if (!hits.length) {
    return Promise.resolve({ mode: 'guard', masked: m.found, sent: c.text, suggest: true,
      text: '음… 그건 얼음이가 가진 지구 이야기 카드에는 없는 내용이야. 얼음이는 지구랑 환경 이야기를 제일 잘 알아! 아래 질문 중에 골라 볼래?' });
  }
  if (!ready()) {
    var top = hits[0].card;
    return Promise.resolve({ mode: 'search', masked: m.found, sent: c.text, cites: [top.id], text: '얼음이가 지구 이야기 카드에서 찾아봤어! ' + top.text });
  }
  var G = grade(g);
  var sys = PERSONA + '\n대상: ' + GRADE_DESC[G.id] + '\n규칙:\n- 아래 [근거 카드] 내용으로만 대답해. 카드에 없는 내용이면 "그건 얼음이도 잘 모르겠어. 선생님이나 보호자께 같이 물어볼까?"라고 말해.\n- 2~3문장으로 짧게. 마지막에 아이가 할 수 있는 작은 실천을 하나 말해 주면 좋아.\n- 사실을 말한 문장 끝에 근거 카드 번호를 [H2]처럼 붙여.\n- 아이의 이름·학교·주소·전화번호 같은 개인정보는 절대 묻지 마.\n\n[근거 카드]\n' + cardsBlock(hits.map(function (h) { return h.card; }));
  var msgs = [{ role: 'system', content: sys }];
  (history || []).slice(-4).forEach(function (h) { msgs.push({ role: h.role, content: h.content }); });
  msgs.push({ role: 'user', content: c.text });
  return call(msgs, { temperature: 0.4, maxTokens: isWeb() ? 260 : 450, timeoutSec: 30 }).then(function (t) {
    var allowed = hits.map(function (h) { return h.card.id; });
    var cites = [];
    // 근거 표시는 화면에서 칩으로 보여 주고 본문에서는 지움. 주지 않은 카드 번호(지어낸 근거)는 버림
    t = String(t).replace(/\s*\[([A-Z]{1,2}\d{1,3})\]/gi, function (_, id) { id = id.toUpperCase(); if (allowed.indexOf(id) >= 0 && cites.indexOf(id) < 0) cites.push(id); return ''; });
    var r = S.checkOutput(t, 260);
    if (!r.ok) return { mode: 'guard', masked: m.found, sent: c.text, text: '얼음이가 대답을 다시 생각해 볼게. 다른 질문을 해 줄래?' };
    var grounded = coverage(r.text, hits.map(function (h) { return h.card.text; }).join(' '));
    if (!cites.length) cites = [hits[0].card.id];
    log('대화', { q: c.text, cites: cites, grounded: Math.round(grounded * 100) });
    return { mode: 'ai', masked: m.found, sent: c.text, text: r.text.replace(/\s+([.!?])/g, '$1'), cites: cites, grounded: grounded };
  }, function (e) {
    var top = hits[0].card;
    log('대화 실패 → 카드 검색', { error: e.message });
    return { mode: 'search', masked: m.found, sent: c.text, cites: [top.id], text: '얼음이가 지구 이야기 카드에서 찾아봤어! ' + top.text };
  });
}

/* ------------------------------------------------------------
   ⑤ 오늘의 지구 숙제
   ------------------------------------------------------------ */
function homework(opt) {
  opt = opt || {};
  var ACT = window.GQ_ACTIONS;
  var fall = function () {
    var pool = ACT.filter(function (a) { return !opt.liked || a.zone === opt.liked; });
    var a = (pool.length ? pool : ACT)[Math.floor(Math.random() * (pool.length || ACT.length))];
    return { text: a.text, why: a.why, ev: a.ev, mode: 'bank' };
  };
  if (!ready()) return Promise.resolve(fall());
  var pool = CARDS.filter(function (c) { return c.zone !== 'earth'; });
  var liked = (window.GQ_ZONES.find(function (z) { return z.id === opt.liked; }) || {}).name || '';
  var msgs = [
    { role: 'system', content: PERSONA + '\n대상: ' + GRADE_DESC[grade(opt.grade).id] + '\n아이가 오늘 집에서 직접 해 볼 수 있는 탄소중립 실천 1가지를 정해 줘. 반드시 [근거 카드] 내용에 맞는 실천이어야 해.\n- 아이 혼자 안전하게 할 수 있는 일. 밖에 나가거나 전기 기구를 만지는 일이면 "보호자와 함께"를 붙여.\n- text: 40자 이내의 실천 문장. why: 왜 좋은지 한 문장.\nJSON 객체만 출력: {"text":"...","why":"...","ev":"H2"}' },
    { role: 'user', content: '아이 상황: 사는 곳 ' + (opt.home || '모름') + ', 계절 ' + seasonNow() + ', 오늘 가장 재미있었던 마을 ' + (liked || '모름') + '\n\n[근거 카드]\n' + cardsBlock(pool) }
  ];
  return call(msgs, { temperature: 0.7, maxTokens: 300, timeoutSec: 25, json: true, schema: SCHEMA_HW }).then(function (t) {
    var o = parseJSON(t, 'object');
    var ev = o && normEv(o.ev);
    var ok = o && o.text && CARD[ev] && String(o.text).length <= 70;
    var r1 = ok && S.checkOutput(o.text, 80), r2 = ok && S.checkOutput(o.why || '', 120);
    if (!ok || !r1.ok || coverage(o.text + ' ' + (o.why || ''), CARD[ev].text) < 0.12) { log('지구 숙제 → 기본 카드', { reason: '점검 탈락' }); return fall(); }
    log('지구 숙제', { text: r1.text, ev: ev });
    return { text: r1.text, why: (r2 && r2.ok) ? r2.text : CARD[ev].text, ev: ev, mode: 'ai' };
  }, function (e) { log('지구 숙제 실패 → 기본 카드', { error: e.message }); return fall(); });
}

/* 연결 테스트 */
function test(cfg) {
  return LLM.chat(Object.assign({}, cfg, { maxTokens: 30, temperature: 0 }), [{ role: 'user', content: '"준비 완료"라고만 답해.' }], { stream: false })
    .then(function (t) { return LLM.stripThinking(t).slice(0, 40); });
}

window.GQAI = {
  loadCfg: loadCfg, saveCfg: saveCfg, ready: ready, test: test, probe: probe, status: function () { return STATUS; }, isWeb: isWeb,
  makeQuiz: makeQuiz, reExplain: reExplain, similar: similar, ask: ask, homework: homework,
  pickBank: pickBank, retrieve: retrieve, verifyItem: verifyItem, parseJSON: parseJSON,
  card: function (id) { return CARD[id]; }, SUGGEST: SUGGEST, LOG: function () { return LOG; },
  _check: { matchRewrites: matchRewrites, verifyRewrite: verifyRewrite, oxStatement: oxStatement, flipped: flipped }, // 검증 로직 점검용
  clearLog: function () { LOG = []; try { localStorage.removeItem(LOG_KEY); } catch (e) {} }
};
})();
