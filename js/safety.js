/*! 초록별 퀴즈 마을 — 어린이 AI 안전장치
 *
 *  1) 개인정보 가리기 : 아이가 적은 글에서 이름·전화번호·주소·학교·이메일 등을 찾아 AI로 보내기 전에 ○○로 바꿉니다.
 *  2) 입력 살피기     : 욕설·폭력·성적인 말은 AI로 보내지 않고 부드럽게 돌려 말합니다.
 *                      스스로를 해치려는 말에는 어른에게 알리도록 안내합니다.
 *  3) 답변 점검       : AI 답변에 링크·전화번호·금지어가 섞이거나 너무 길면 고치거나 막습니다.
 *
 * 규칙 기반이라 완벽하지 않습니다. 실제 운영 시에는 기관의 금칙어 목록과 함께 쓰세요.
 */
(function () {
'use strict';

var PII = [
  { kind: '주민등록번호', re: /\d{6}\s?-\s?[1-4]\d{6}/g },
  { kind: '전화번호', re: /01[016789][\s.\-]?\d{3,4}[\s.\-]?\d{4}/g },
  { kind: '전화번호', re: /0\d{1,2}[\s.\-]\d{3,4}[\s.\-]\d{4}/g },
  { kind: '이메일', re: /[\w.+\-]+@[\w\-]+(\.[\w\-]+)+/g },
  { kind: '주소', re: /[가-힣]{1,6}(특별시|광역시|특별자치시|특별자치도|시|도)\s?[가-힣]{1,6}(시|군|구)(\s?[가-힣0-9]{1,10}(동|읍|면|로|길))?(\s?\d{1,5}(-\d{1,5})?(번지|번길)?)?/g },
  { kind: '주소', re: /[가-힣0-9]{1,12}(아파트|빌라|맨션)\s?\d{0,4}\s?동?\s?\d{0,5}\s?호?/g },
  { kind: '주소', re: /\d{1,4}\s?동\s?\d{1,5}\s?호/g },
  { kind: '학교', re: /[가-힣]{1,12}(초등학교|중학교|고등학교|유치원|어린이집|초교)/g },
  { kind: '이름', re: /((내|제|우리\s?(엄마|아빠|형|누나|언니|오빠|동생|선생님))\s?)?이름은\s?[가-힣]{2,4}/g, keep: '이름은 ' },
  { kind: '이름', re: /나는\s?[가-힣]{2,4}(이야|야|이에요|예요|입니다)/g, keep: '나는 ' }
];

function maskPII(text) {
  var found = [];
  var out = String(text || '');
  PII.forEach(function (p) {
    out = out.replace(p.re, function (m) {
      if (p.kind === '이름' && /○○/.test(m)) return m;
      found.push(p.kind);
      return (p.keep || '') + '○○';
    });
  });
  var uniq = found.filter(function (k, i) { return found.indexOf(k) === i; });
  return { text: out, found: uniq };
}

/* 아이 입력에서 막을 말 (예시 목록 — 기관 금칙어로 바꿔 쓰세요) */
var BAD = ['씨발', '시발', 'ㅅㅂ', '병신', 'ㅂㅅ', '개새', '꺼져', '닥쳐', '섹스', '야동', '야한', '변태', '마약', '총으로', '칼로 찌', '때려죽', '죽여'];
var HURT = ['자살', '죽고 싶', '죽고싶', '사라지고 싶', '사라지고싶', '자해', '나를 때려', '맞았어', '학대'];

function checkInput(text) {
  var t = String(text || '').replace(/\s+/g, ' ');
  var low = t.toLowerCase();
  for (var i = 0; i < HURT.length; i++) {
    if (low.indexOf(HURT[i]) >= 0) {
      return { ok: false, kind: 'care',
        reply: '그런 마음이 들었구나. 얼음이는 네가 정말 소중해. 지금 곁에 있는 선생님이나 보호자께 꼭 이야기해 줘. 전화 1388에서도 언제든 도와줘.' };
    }
  }
  for (var j = 0; j < BAD.length; j++) {
    if (low.indexOf(BAD[j]) >= 0) {
      return { ok: false, kind: 'bad', reply: '앗, 그 말은 얼음이 귀가 깜짝 놀라는 말이야. 우리 고운 말로 지구 이야기 해 볼까?' };
    }
  }
  if (t.length > 200) return { ok: true, text: t.slice(0, 200), trimmed: true };
  return { ok: true, text: t };
}

/* AI 답변 점검 */
function checkOutput(text, maxLen) {
  var t = String(text || '');
  t = t.replace(/<think>[\s\S]*?(<\/think>|$)/g, '');
  t = t.replace(/```[\s\S]*?```/g, '').replace(/[*_#>`]/g, '');
  t = t.replace(/https?:\/\/\S+/g, '').replace(/www\.\S+/g, '');
  t = t.replace(/01[016789][\s.\-]?\d{3,4}[\s.\-]?\d{4}/g, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  var low = t.toLowerCase();
  for (var i = 0; i < BAD.length; i++) if (low.indexOf(BAD[i]) >= 0) return { ok: false, text: '' };
  if (!t) return { ok: false, text: '' };
  maxLen = maxLen || 260;
  if (t.length > maxLen) {
    var cut = t.slice(0, maxLen);
    var end = Math.max(cut.lastIndexOf('요.'), cut.lastIndexOf('야.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'), cut.lastIndexOf('다.'));
    t = end > maxLen * 0.5 ? cut.slice(0, end + 2).trim() : cut.trim() + '…';
  }
  return { ok: true, text: t };
}

window.GQSafety = { maskPII: maskPII, checkInput: checkInput, checkOutput: checkOutput };
})();
