/*! 초록별 퀴즈 마을 — LLM 연결 계층 (모델 비종속)
 *  ※ AI 환경비서(2026 세션1 출품작)의 연결 계층을 그대로 가져와 이름만 바꿨습니다.
 *
 * 앱은 이 파일의 GreenLLM.chat() 하나만 호출합니다.
 * 연결 방식을 바꿔도 앱 코드는 그대로이며, 대부분의 모델을 코드 수정 없이 바꿔 쓸 수 있습니다.
 *
 *   0) webllm  : ★ 기본값. 브라우저 안에서 도는 무료 AI (WebLLM · WebGPU)
 *                서버·API 키·비용이 없고, 아이가 쓴 글이 기기 밖으로 나가지 않습니다.
 *                처음 켤 때 한 번 모델(약 1~1.5GB)을 내려받아 브라우저에 저장하고, 다음부터는 저장본을 씁니다.
 *   1) openai  : OpenAI 호환 Chat Completions API (/v1/chat/completions)
 *                Ollama · vLLM · LM Studio · 행정안전부 AI 공통기반(OpenAI 호환 게이트웨이 가정) · OpenAI 등
 *   2) anthropic : Anthropic Messages API (Claude)
 *
 * ※ Google Gemini API는 약관상 18세 미만이 쓸 가능성이 높은 서비스에 쓸 수 없어 빠른 설정에서 뺐습니다.
 * 새 연결 방식이 필요하면 ADAPTERS에 같은 모양의 객체를 하나 추가하면 됩니다.
 */
(function () {
'use strict';

/* 브라우저 안 무료 AI로 고를 수 있는 모델 (WebLLM 0.2.86 사전 빌드 모델 중 한국어가 되는 작은 모델)
 * 2026.11. 실제 시험: Gemma 4 E2B는 한국어가 자연스러움 / Qwen 3.5 2B는 가볍지만 한국어 문장이 자주 어색해 대부분 검증에서 걸러짐 */
var WEB_MODELS = [
  { id: 'gemma-4-E2B-it-q4f16_1-MLC', label: 'Gemma 4 · E2B (구글, 약 2.8GB · 추천 · 한국어 가장 자연스러움)', gb: 2.8, license: 'Apache-2.0' },
  { id: 'gemma-2-2b-it-q4f16_1-MLC', label: 'Gemma 2 · 2B (구글, 약 1.5GB · 가벼움)', gb: 1.5, license: 'Gemma Terms of Use' },
  { id: 'Qwen3.5-2B-q4f16_1-MLC', label: 'Qwen 3.5 · 2B (약 1.1GB · 가장 가벼움 · 한국어 품질 낮음)', gb: 1.1, license: 'Apache-2.0' }
];

/* 화면의 '빠른 설정' 목록. 값은 예시이며 설정 화면에서 자유롭게 고칠 수 있습니다. */
var PRESETS = [
  { id: 'browser',   label: '브라우저 안 무료 AI (설치·키·비용 없음)', provider: 'webllm', baseUrl: '', model: WEB_MODELS[0].id, needsKey: false,
    note: '이 기기의 크롬·엣지 안에서 AI가 직접 돌아갑니다(WebGPU 필요). 아이가 쓴 글이 밖으로 나가지 않아요. 처음 한 번 모델을 내려받습니다.' },
  { id: 'ollama',    label: 'Ollama (내 PC · 무료)',          provider: 'openai',    baseUrl: 'http://localhost:11434/v1', model: 'gemma3:12b',   needsKey: false,
    note: 'PC에 Ollama를 설치하고 모델을 받아 두면 인터넷·API 키 없이 동작합니다. 예: gemma3:12b, exaone3.5:7.8b, gpt-oss:20b' },
  { id: 'gov',       label: '공통기반 · 기관 서버 (OpenAI 호환)', provider: 'openai',    baseUrl: '',                           model: '',             needsKey: true,
    note: '행정안전부 AI 공통기반 또는 기관 내부 vLLM 서버처럼 OpenAI 호환 주소를 제공하는 경우입니다. 주소·모델명·키를 기관 안내에 맞게 입력하세요.' },
  { id: 'lmstudio',  label: 'LM Studio (내 PC)',              provider: 'openai',    baseUrl: 'http://localhost:1234/v1',  model: '',             needsKey: false,
    note: 'LM Studio의 Local Server를 켠 뒤 불러온 모델 이름을 입력하세요.' },
  { id: 'openai',    label: 'OpenAI',                         provider: 'openai',    baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', needsKey: true, note: '' },
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

/* ------------------------------------------------------------
   브라우저 안 무료 AI (WebLLM) — 엔진을 한 번만 띄우고 요청을 차례로 처리
   ------------------------------------------------------------ */
var WEBLLM_SRC = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/lib/index.js';
var WL = { mod: null, engine: null, model: '', loading: null, loadingModel: '', progress: 0, text: '', error: '', listeners: [] };
function wlEmit() { WL.listeners.forEach(function (f) { try { f(WL); } catch (e) {} }); }
function wlModule() { if (WL.mod) return Promise.resolve(WL.mod); return import(WEBLLM_SRC).then(function (m) { WL.mod = m; return m; }); }
function wlSupported() {
  if (!navigator.gpu) return Promise.resolve({ ok: false, why: '이 브라우저는 WebGPU를 지원하지 않아요 (최신 크롬·엣지 필요)' });
  return navigator.gpu.requestAdapter().then(function (a) {
    if (!a) return { ok: false, why: '이 기기의 그래픽 장치를 쓸 수 없어요' };
    return { ok: true, f16: a.features.has('shader-f16') };
  }, function () { return { ok: false, why: '그래픽 장치를 확인하지 못했어요' }; });
}
/** 모델을 불러옵니다(처음이면 내려받기). 이미 불러온 모델이면 그대로 돌려줍니다. */
function wlLoad(model) {
  if (WL.engine && WL.model === model) return Promise.resolve(WL.engine);
  if (WL.loading && WL.loadingModel === model) return WL.loading;
  WL.loadingModel = model; WL.progress = 0; WL.text = '준비 중'; WL.error = ''; wlEmit();
  WL.loading = wlModule().then(function (m) {
    if (WL.engine) { try { WL.engine.unload(); } catch (e) {} WL.engine = null; WL.model = ''; }
    return m.CreateMLCEngine(model, { initProgressCallback: function (r) { WL.progress = r.progress || 0; WL.text = r.text || ''; wlEmit(); } });
  }).then(function (eng) {
    WL.engine = eng; WL.model = model; WL.loading = null; WL.progress = 1; WL.text = '준비 완료'; wlEmit(); return eng;
  }, function (e) {
    WL.loading = null; WL.error = (e && e.message) || String(e); wlEmit(); throw e;
  });
  return WL.loading;
}
function wlCached(model) { return wlModule().then(function (m) { return m.hasModelInCache(model); }).catch(function () { return false; }); }
function wlRemove(model) {
  return wlModule().then(function (m) {
    if (WL.engine && WL.model === model) { try { WL.engine.unload(); } catch (e) {} WL.engine = null; WL.model = ''; wlEmit(); }
    return m.deleteModelAllInfoInCache(model);
  });
}
/* 요청은 하나씩 처리합니다. 아이가 기다리는 요청이 오면 미리 만들던(배경) 요청을 멈추고 먼저 처리해요. */
var wlQueue = Promise.resolve(), wlRunning = null;
function wlRun(job) {
  if (!job.background && wlRunning && wlRunning.background) { wlRunning.interrupted = true; try { WL.engine.interruptGenerate(); } catch (e) {} }
  var p = wlQueue.then(function () {
    if (job.cancelled) { var c = new Error('interrupted'); c.interrupted = true; throw c; } // 기다리는 동안 취소된 요청은 건너뜀
    wlRunning = job;
    return job.fn().then(function (r) {
      if (job.interrupted) { var e = new Error('interrupted'); e.interrupted = true; throw e; }
      return r;
    });
  });
  var done = function () { if (wlRunning === job) wlRunning = null; };
  p.then(done, done);
  wlQueue = p.catch(function () {});
  return p;
}

var ADAPTERS = {
  webllm: {
    chat: function (cfg, messages, opts) {
      if (!WL.engine || WL.model !== cfg.model) return Promise.reject(new Error('브라우저 AI가 아직 켜지지 않았어요'));
      var msgs = messages.map(function (m) { return { role: m.role, content: m.content }; });
      if (/qwen3/i.test(cfg.model)) { // Qwen 3 계열: 생각 과정 없이 바로 답하게 (속도)
        for (var i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'user') { msgs[i].content += ' /no_think'; break; }
      }
      var req = { messages: msgs, temperature: cfg.temperature, max_tokens: cfg.maxTokens || 1024, stream: false };
      // 스키마를 주면 그 모양의 JSON만 나오도록 글자 단위로 강제 (작은 모델도 형식을 틀리지 않음)
      if (opts.json && opts.schema) req.response_format = { type: 'json_object', schema: JSON.stringify(opts.schema) };
      var job = { background: !!opts.background, fn: function () {
        return WL.engine.chat.completions.create(req).then(function (r) { return (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || ''; });
      } };
      if (opts.signal) {
        if (opts.signal.aborted) { var ab0 = new Error('aborted'); ab0.name = 'AbortError'; return Promise.reject(ab0); }
        opts.signal.addEventListener('abort', function () { job.cancelled = true; if (wlRunning === job) { job.interrupted = true; try { WL.engine.interruptGenerate(); } catch (e) {} } });
      }
      return wlRun(job).then(function (t) {
        if (opts.signal && opts.signal.aborted) { var ab = new Error('aborted'); ab.name = 'AbortError'; throw ab; }
        opts.onDelta && opts.onDelta(t, t); return t;
      }, function (e) {
        if (opts.signal && opts.signal.aborted) { var ab = new Error('aborted'); ab.name = 'AbortError'; throw ab; }
        throw e;
      });
    }
  },
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
  /** 설정이 갖춰졌는지 (webllm·claude-artifact는 주소가 필요 없음) */
  isReady: function (cfg) { return !!(cfg && cfg.model && ADAPTERS[cfg.provider] && (cfg.baseUrl || cfg.provider === 'webllm' || cfg.provider === 'claude-artifact')); },
  /**
   * @param cfg      { provider, baseUrl, model, apiKey, temperature, maxTokens }
   * @param messages [{ role: 'system'|'user'|'assistant', content }]
   * @param opts     { stream, signal, json, background, onDelta(piece, fullText) }
   *                 json: JSON 객체만 받기 (OpenAI 호환·브라우저 AI에서 강제) · background: 미리 만들기(아이 요청이 오면 양보)
   * @returns Promise<string> 최종 답변
   */
  chat: function (cfg, messages, opts) {
    var a = ADAPTERS[cfg.provider];
    if (!a) return Promise.reject(new Error('지원하지 않는 연결 방식: ' + cfg.provider));
    return a.chat(cfg, messages, opts || {});
  },
  stripThinking: stripThinking,
  /* 브라우저 안 무료 AI 관리 */
  web: {
    models: WEB_MODELS,
    supported: wlSupported,
    load: wlLoad,
    cached: wlCached,
    remove: wlRemove,
    state: function () { return { ready: !!WL.engine, model: WL.model, loading: !!WL.loading, loadingModel: WL.loadingModel, progress: WL.progress, text: WL.text, error: WL.error }; },
    on: function (f) { WL.listeners.push(f); }
  }
};
})();
