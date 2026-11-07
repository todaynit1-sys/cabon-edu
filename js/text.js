/*! 글자 도구 — 아이용 체험관과 메이커가 함께 씁니다
 *  근거 대조(두 글자 조각 겹침), 한글 2글자 색인 검색(BM25), 문장 나누기, 조사 붙이기
 */
(function () {
'use strict';

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function norm(s) { return String(s || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, ''); }
function bigrams(s) { s = norm(s); var o = []; for (var i = 0; i < s.length - 1; i++) o.push(s.substr(i, 2)); return o; }
/* 두 글의 닮은 정도 0~1 */
function dice(a, b) {
  var A = bigrams(a), B = bigrams(b); if (!A.length || !B.length) return 0;
  var m = {}; B.forEach(function (x) { m[x] = (m[x] || 0) + 1; });
  var hit = 0; A.forEach(function (x) { if (m[x]) { hit++; m[x]--; } });
  return (2 * hit) / (A.length + B.length);
}
/* a의 글자 조각이 b 안에 얼마나 들어 있나 0~1 (a가 b에 근거하는지) */
function coverage(a, b) {
  var A = bigrams(a), B = {}; bigrams(b).forEach(function (x) { B[x] = 1; });
  if (!A.length) return 0; var hit = 0; A.forEach(function (x) { if (B[x]) hit++; }); return hit / A.length;
}
function sentences(t) { return String(t || '').split(/(?<=[.!?。])\s+/).map(function (s) { return s.trim(); }).filter(Boolean); }
function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function josa(w, a, b) { var c = String(w).charCodeAt(String(w).length - 1); if (c < 0xac00 || c > 0xd7a3) return b; return (c - 0xac00) % 28 ? a : b; }
function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/* 검색 색인 (한글 2글자 조각 · BM25) */
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
function buildIndex(items, getText) {
  var docs = [], post = {}, total = 0;
  items.forEach(function (it, i) {
    var toks = tokenize(getText(it)), tf = {};
    toks.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
    Object.keys(tf).forEach(function (t) { (post[t] = post[t] || []).push(i); });
    docs.push({ it: it, tf: tf, len: toks.length }); total += toks.length;
  });
  return { docs: docs, post: post, N: docs.length, avg: docs.length ? total / docs.length : 1 };
}
function retrieve(idx, q, k) {
  var qt = tokenize(q), uniq = {}; qt.forEach(function (t) { uniq[t] = 1; });
  var scores = {}, matched = {};
  Object.keys(uniq).forEach(function (t) {
    var pl = idx.post[t]; if (!pl) return;
    var idf = Math.log(1 + (idx.N - pl.length + 0.5) / (pl.length + 0.5));
    pl.forEach(function (i) {
      var d = idx.docs[i], f = d.tf[t];
      scores[i] = (scores[i] || 0) + idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.len / idx.avg));
      matched[i] = (matched[i] || 0) + 1;
    });
  });
  return Object.keys(scores).map(function (i) { return { it: idx.docs[i].it, s: scores[i], m: matched[i] }; })
    .filter(function (h) { return h.m >= 2 || h.s >= 2.4; })
    .sort(function (a, b) { return b.s - a.s; })
    .slice(0, k || 3);
}

window.GQText = { esc: esc, norm: norm, bigrams: bigrams, dice: dice, coverage: coverage, sentences: sentences, shuffle: shuffle, josa: josa, clip: clip, tokenize: tokenize, buildIndex: buildIndex, retrieve: retrieve };
})();
