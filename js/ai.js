/*! AI 탄소중립 체험실 — 체험실 안의 AI (AI 선생님 · 내 탄소 재기 코칭 · 오답 다시 설명)
 *
 *  연결은 js/llm.js(GreenLLM, 모델 비종속)를 그대로 씁니다.
 *   - claude.ai 공개시연판: 보는 사람의 Claude(내장 연결) → 키 없음
 *   - 기관 운영: 행정안전부 AI 공통기반 · 기관 서버(OpenAI 호환) 등 → 설정에서 연결
 *  AI가 꺼져 있거나 실패하면 언제나 근거 카드·미리 만든 설명으로 바로 진행합니다.
 *  AI가 쓴 글은 화면에 내기 전에 안전 점검 · 근거 카드 대조 · 숫자 대조를 거칩니다.
 */
(function () {
'use strict';
var LLM = window.GreenLLM, KEY = 'gq.ai', memKey = '';
function stored() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
function cfg() {
  var c = Object.assign({ provider: '', baseUrl: '', model: '', apiKey: '', temperature: 0.4, maxTokens: 700, tier: 'quick' }, window.GQ_AI_DEFAULT || {}, stored());
  if (!c.keepKey) c.apiKey = memKey || c.apiKey || '';
  return c;
}
function save(c) { memKey = c.apiKey || ''; var copy = Object.assign({}, c); if (!copy.keepKey) delete copy.apiKey; try { localStorage.setItem(KEY, JSON.stringify(copy)); } catch (e) {} }
function off() { try { localStorage.setItem(KEY, JSON.stringify({ provider: 'off' })); } catch (e) {} }
function ready() { var c = cfg(); return !!(LLM && c.provider && c.provider !== 'off' && LLM.isReady(c)); }
function label() { var c = cfg(); if (!ready()) return ''; return c.provider === 'claude-artifact' ? 'Claude' : (c.model || c.provider); }
function chat(messages, o) {
  o = o || {}; var c = cfg();
  var ctrl = new AbortController(), t = setTimeout(function () { ctrl.abort(); }, (o.timeout || (c.provider === 'claude-artifact' ? 240 : 90)) * 1000);
  return LLM.chat(Object.assign({}, c, { maxTokens: o.maxTokens || c.maxTokens, temperature: o.temperature != null ? o.temperature : c.temperature }), messages, {
    stream: false, signal: ctrl.signal, onDelta: o.onDelta ? function (d, full) { o.onDelta(LLM.stripThinking(full || '')); } : null
  }).then(function (x) { clearTimeout(t); return LLM.stripThinking(x || '').trim(); }, function (e) { clearTimeout(t); throw e; });
}
/* 검증: 안전 · 길이 · 숫자 대조(허용한 숫자만) · 근거 관련성 */
function numbersOk(text, allowed) {
  var nums = String(text).replace(/,/g, '').match(/\d+(\.\d+)?/g) || [];
  var ok = String(allowed).replace(/,/g, '');
  return nums.every(function (n) { return ok.indexOf(n) >= 0 || +n <= 3; });
}
function verify(text, o) {
  o = o || {};
  var r = window.GQSafety.checkOutput(text, o.maxLen || 420);
  if (!r.ok || !r.text) return { ok: false, why: '안전 점검' };
  if (/(습니다|입니다)\s*$/.test(r.text) && o.tone) return { ok: false, why: '말투' };
  if (o.numbers != null && !numbersOk(r.text, o.numbers)) return { ok: false, why: '근거에 없는 숫자' };
  if (o.ground && window.GQText.coverage(r.text, o.ground) < (o.min || 0.12)) return { ok: false, why: '근거와 관련이 약함' };
  return { ok: true, text: r.text };
}
window.GQAI = { cfg: cfg, save: save, off: off, ready: ready, label: label, chat: chat, verify: verify };
})();
