/*! 초록별 퀴즈 마을 — LLM 연결 계층 (모델 비종속)
 *  ※ AI 환경비서(2026 세션1 출품작)의 연결 계층을 그대로 가져와 이름만 바꿨습니다.
 *
 * 앱은 이 파일의 GreenLLM.chat() 하나만 호출합니다.
 * 연결 방식은 두 가지뿐이라 대부분의 모델을 코드 수정 없이 바꿔 쓸 수 있습니다.
 *
 *   1) openai  : OpenAI 호환 Chat Completions API (/v1/chat/completions)
 *                Ollama · vLLM · LM Studio · 행정안전부 AI 공통기반(OpenAI 호환 게이트웨이 가정)
 *                · OpenAI · Google Gemini(OpenAI 호환 엔드포인트) 등
 *   2) anthropic : Anthropic Messages API (Claude)
 *
 * 새 연결 방식이 필요하면 ADAPTERS에 같은 모양의 객체를 하나 추가하면 됩니다.
 */
(function () {
'use strict';

/* 화면의 '빠른 설정' 목록. 값은 예시이며 설정 화면에서 자유롭게 고칠 수 있습니다. */
var PRESETS = [
  { id: 'ollama',    label: 'Ollama (내 PC · 무료)',          provider: 'openai',    baseUrl: 'http://localhost:11434/v1', model: 'gemma3:12b',   needsKey: false,
    note: 'PC에 Ollama를 설치하고 모델을 받아 두면 인터넷·API 키 없이 동작합니다. 예: gemma3:12b, exaone3.5:7.8b, gpt-oss:20b' },
  { id: 'gov',       label: '공통기반 · 기관 서버 (OpenAI 호환)', provider: 'openai',    baseUrl: '',                           model: '',             needsKey: true,
    note: '행정안전부 AI 공통기반 또는 기관 내부 vLLM 서버처럼 OpenAI 호환 주소를 제공하는 경우입니다. 주소·모델명·키를 기관 안내에 맞게 입력하세요.' },
  { id: 'lmstudio',  label: 'LM Studio (내 PC)',              provider: 'openai',    baseUrl: 'http://localhost:1234/v1',  model: '',             needsKey: false,
    note: 'LM Studio의 Local Server를 켠 뒤 불러온 모델 이름을 입력하세요.' },
  { id: 'openai',    label: 'OpenAI',                         provider: 'openai',    baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', needsKey: true, note: '' },
  { id: 'gemini',    label: 'Google Gemini',                  provider: 'openai',    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', needsKey: true, note: '' },
  { id: 'artifact',  label: 'Claude (claude.ai 공개 페이지 내장)', provider: 'claude-artifact', baseUrl: 'claude.ai', model: 'Claude', needsKey: false,
    note: 'claude.ai에 게시한 공개 시연 페이지에서만 동작합니다. 보는 사람의 Claude 계정으로 답변하며 처음 한 번 사용 동의를 묻습니다.' },
  { id: 'anthropic', label: 'Anthropic Claude',               provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5', needsKey: true, note: '' }
];

function trimSlash(u) { return String(u || '').replace(/\/+$/, ''); }

/* SSE(서버 전송 이벤트) 스트림을 한 줄씩 읽어 data: 페이로드를 넘겨줍니다 */
function readSSE(res, onData) {
  var reader = res.body.getReader();
  var dec = new TextDecoder('utf-8');
  var buf = '';
  function pump() {
    return reader.read().then(function (r) {
      if (r.done) { if (buf.trim()) handle(buf); return; }
      buf += dec.decode(r.value, { stream: true });
      var parts = buf.split(/\r?\n/);
      buf = parts.pop();
      parts.forEach(handle);
      return pump();
    });
  }
  function handle(line) {
    line = line.trim();
    if (line.indexOf('data:') !== 0) return;
    var p = line.slice(5).trim();
    if (!p || p === '[DONE]') return;
    try { onData(JSON.parse(p)); } catch (e) { /* 깨진 조각은 건너뜀 */ }
  }
  return pump();
}

function httpError(res) {
  return res.text().then(function (t) {
    var msg = t;
    try { var j = JSON.parse(t); msg = (j.error && (j.error.message || j.error)) || j.message || t; } catch (e) {}
    var err = new Error('HTTP ' + res.status + ' · ' + String(msg).slice(0, 300));
    err.status = res.status;
    throw err;
  });
}

var ADAPTERS = {
  /* claude.ai Artifact 안에서만: 페이지에 내장된 sample 기능 사용 (주소·키 불필요) */
  'claude-artifact': {
    chat: function (cfg, messages, opts) {
      if (!window.claude || !window.claude.use) return Promise.reject(new Error('claude.ai 공개 페이지에서만 쓸 수 있는 연결입니다.'));
      return window.claude.use('sample').then(function (sample) {
        if (!sample) throw new Error('이 화면에서는 Claude 내장 연결을 쓸 수 없습니다.');
        /* system 역할이 없으므로 맨 앞 user 턴에 지침을 넣습니다 */
        var sys = messages.filter(function (m) { return m.role === 'system'; }).map(function (m) { return m.content; }).join('\n\n');
        var turns = messages.filter(function (m) { return m.role !== 'system'; });
        if (sys) {
          if (turns.length && turns[0].role === 'user') turns = [{ role: 'user', content: sys + '\n\n' + turns[0].content }].concat(turns.slice(1));
          else turns = [{ role: 'user', content: sys }].concat(turns);
        }
        return sample(turns, {
          cache: false, signal: opts.signal,
          onText: function (u) { opts.onDelta && opts.onDelta(u.delta, u.text); }
        }).then(function (r) { return r.text; }, function (e) {
          if (e && e.code === 'cancelled') { var ab = new Error('cancelled'); ab.name = 'AbortError'; throw ab; }
          var map = { not_granted: '사용 동의가 거부되었습니다.', rate_limited: '요청이 많습니다. 잠시 후 다시 시도하세요.', session_expired: 'claude.ai에 다시 로그인하세요.' };
          throw new Error((e && map[e.code]) || ('Claude 응답 오류 (' + ((e && e.code) || 'unknown') + ')'));
        });
      });
    }
  },
  openai: {
    chat: function (cfg, messages, opts) {
      var headers = { 'Content-Type': 'application/json' };
      if (cfg.apiKey) headers.Authorization = 'Bearer ' + cfg.apiKey;
      var body = { model: cfg.model, messages: messages, temperature: cfg.temperature, stream: !!opts.stream };
      if (cfg.maxTokens) body.max_tokens = cfg.maxTokens;
      if (opts.json) body.response_format = { type: 'json_object' }; // JSON만 내도록 강제 (Ollama·vLLM·OpenAI·Gemini 지원)
      return fetch(trimSlash(cfg.baseUrl) + '/chat/completions', {
        method: 'POST', headers: headers, body: JSON.stringify(body), signal: opts.signal
      }).then(function (res) {
        if (!res.ok) return httpError(res);
        var ct = res.headers.get('content-type') || '';
        if (opts.stream && res.body && ct.indexOf('json') < 0) {
          var full = '';
          return readSSE(res, function (j) {
            var d = j.choices && j.choices[0] && (j.choices[0].delta || j.choices[0].message);
            var piece = d && d.content;
            if (piece) { full += piece; opts.onDelta && opts.onDelta(piece, full); }
          }).then(function () { return full; });
        }
        return res.json().then(function (j) {
          var t = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
          opts.onDelta && opts.onDelta(t, t);
          return t;
        });
      });
    }
  },
  anthropic: {
    chat: function (cfg, messages, opts) {
      var system = messages.filter(function (m) { return m.role === 'system'; }).map(function (m) { return m.content; }).join('\n\n');
      var rest = messages.filter(function (m) { return m.role !== 'system'; });
      var body = { model: cfg.model, max_tokens: cfg.maxTokens || 2048, temperature: cfg.temperature,
        system: system, messages: rest, stream: !!opts.stream };
      return fetch(trimSlash(cfg.baseUrl) + '/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey || '',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(body), signal: opts.signal
      }).then(function (res) {
        if (!res.ok) return httpError(res);
        if (opts.stream && res.body) {
          var full = '';
          return readSSE(res, function (j) {
            if (j.type === 'content_block_delta' && j.delta && j.delta.text) {
              full += j.delta.text; opts.onDelta && opts.onDelta(j.delta.text, full);
            }
          }).then(function () { return full; });
        }
        return res.json().then(function (j) {
          var t = (j.content || []).map(function (c) { return c.text || ''; }).join('');
          opts.onDelta && opts.onDelta(t, t);
          return t;
        });
      });
    }
  }
};

/* 추론형 모델이 내보내는 <think>…</think> 구간은 화면에서 숨깁니다 */
function stripThinking(t) {
  return String(t || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^\s+/, '');
}

window.GreenLLM = {
  PRESETS: PRESETS,
  providers: Object.keys(ADAPTERS),
  isReady: function (cfg) { return !!(cfg && cfg.baseUrl && cfg.model && ADAPTERS[cfg.provider]); },
  /**
   * @param cfg      { provider, baseUrl, model, apiKey, temperature, maxTokens }
   * @param messages [{ role: 'system'|'user'|'assistant', content }]
   * @param opts     { stream, signal, json, onDelta(piece, fullText) }  json: JSON 객체만 받기 (OpenAI 호환 연결에서만 강제)
   * @returns Promise<string> 최종 답변
   */
  chat: function (cfg, messages, opts) {
    var a = ADAPTERS[cfg.provider];
    if (!a) return Promise.reject(new Error('지원하지 않는 연결 방식: ' + cfg.provider));
    return a.chat(cfg, messages, opts || {});
  },
  stripThinking: stripThinking
};
})();
