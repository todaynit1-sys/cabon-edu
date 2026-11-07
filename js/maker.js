/*! AI 체험관 메이커 — 화면 (자료 넣기 → AI 생성 → 검토·승인 → 발행) */
(function () {
'use strict';
var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
var TX = window.GQText, esc = TX.esc, PK = window.GQPack, G = window.GQGen, LLM = window.GreenLLM;
var pack = null, report = null, genLog = null, approved = {}, curTab = 'design';
var TABS = [['design', '마을·주인공'], ['cards', '근거 카드'], ['mission', '체험 미션'], ['bank', '문제'], ['lessons', '수업'], ['actions', '실천 카드'], ['dropped', '걸러진 항목']];

function toast(m, ms) { var t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, ms || 2800); }
function step(n) { $$('#steps li').forEach(function (li) { var k = +li.dataset.step; li.classList.toggle('on', k === n); li.classList.toggle('done', k < n); }); ['s1', 's2', 's3', 's4'].forEach(function (id, i) { $('#' + id).hidden = i + 1 > n; }); window.scrollTo({ top: $('#s' + n).offsetTop - 70, behavior: 'smooth' }); }
function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
function setPath(o, p, v) { var ks = p.split('.'), last = ks.pop(), t = ks.reduce(function (a, k) { return a[k] == null ? (a[k] = {}) : a[k]; }, o); t[last] = v; }

/* ---------------- AI 연결 ---------------- */
function aiText() { var c = G.loadCfg(); if (!LLM.isReady(c)) return { cls: 'off', txt: '⚠️ AI 연결 안 됨 · 눌러서 설정' }; return { cls: 'on', txt: '✨ AI: ' + (c.model || c.provider) + (c.provider === 'webllm' ? ' (브라우저)' : '') }; }
function updatePill() { var a = aiText(); $('#aiPill').textContent = a.txt; $('#aiPill').className = 'pill ' + a.cls; }
function openAi(thenRun) {
  var c = G.loadCfg(), presets = LLM.PRESETS.filter(function (p) { return p.id !== 'artifact'; }), fresh = !c.baseUrl && !c.model;
  $('#mcard').innerHTML = '<h3>AI 모델 연결 <span class="badge">모델 비종속</span></h3><p class="fine">담당자가 쓰는 메이커에서만 AI를 씁니다. 학생용 체험관은 AI 없이 동작해요.' + (fresh ? ' <b>AI 환경비서에 쓰는 Gemini 무료 키를 아래 "API 키"에 붙여 넣고 저장하면 끝이에요.</b>' : '') + '</p>' +
    '<label>빠른 설정<select id="aiPreset"><option value="">직접 입력</option>' + presets.map(function (p) { return '<option value="' + p.id + '">' + esc(p.label) + '</option>'; }).join('') + '</select></label><p class="fine" id="presetNote"></p>' +
    '<label>연결 방식<select id="aiProv">' + ['openai', 'anthropic', 'webllm'].map(function (p) { return '<option ' + (c.provider === p ? 'selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label>' +
    '<label>주소 (Base URL)<input id="aiUrl" value="' + esc(c.baseUrl) + '" placeholder="http://localhost:11434/v1 또는 기관 게이트웨이 주소"></label>' +
    '<label>모델 이름<input id="aiModel" value="' + esc(c.model) + '" placeholder="예: gemma3:12b, gpt-4.1-mini, claude-sonnet-4-5"></label>' +
    '<label>API 키 (필요할 때만)<input id="aiKey" type="password" value="' + esc(c.apiKey || '') + '"></label>' +
    '<label class="chk"><input type="checkbox" id="aiKeep" ' + (c.keepKey || fresh ? 'checked' : '') + '> 이 기기에 키 저장 (다음에 다시 안 넣어도 돼요 · 공용 PC에서는 끄세요)</label>' +
    '<p class="fine">webllm(브라우저 안 무료 AI)은 키 없이 시연할 때만 권장해요. 작은 모델이라 생성 품질이 낮고 느립니다.</p>' +
    '<div class="row"><button class="btn ghost" id="aiTest">연결 테스트</button><button class="btn primary" id="aiSave">저장</button><button class="btn ghost" id="aiClose">닫기</button><span class="fine" id="aiOut"></span></div>';
  $('#modal').hidden = false;
  var form = function () { return Object.assign(G.loadCfg(), { provider: $('#aiProv').value, baseUrl: $('#aiUrl').value.trim(), model: $('#aiModel').value.trim(), apiKey: $('#aiKey').value.trim(), keepKey: $('#aiKeep').checked }); };
  $('#aiPreset').onchange = function () { var p = presets.find(function (x) { return x.id === this.value; }, this); if (p) { $('#aiProv').value = p.provider; $('#aiUrl').value = p.baseUrl; $('#aiModel').value = p.model; } $('#presetNote').textContent = p ? p.note : ''; };
  $('#aiTest').onclick = function () { var out = $('#aiOut'); out.textContent = '연결하는 중…'; var f = form(); if (f.provider === 'webllm') { out.textContent = '브라우저 AI는 저장 뒤 첫 생성 때 모델을 내려받아요 (약 1~3GB)'; return; } G.test(f).then(function (t) { out.textContent = '✅ 성공: ' + t; }, function (e) { out.textContent = '❌ 실패: ' + e.message; }); };
  $('#aiSave').onclick = function () { var f = form(); if (f.provider !== 'webllm' && !f.apiKey && /googleapis|openai\.com|anthropic/.test(f.baseUrl)) { $('#aiOut').textContent = 'API 키를 붙여 넣어 주세요'; $('#aiKey').focus(); return; } G.saveCfg(f); updatePill(); $('#modal').hidden = true; toast('AI 연결을 저장했어요'); if (thenRun && G.ready()) $('#btnRun').click(); };
  $('#aiClose').onclick = function () { $('#modal').hidden = true; };
  if (fresh) { $('#aiPreset').value = 'gemini'; $('#aiPreset').onchange(); setTimeout(function () { $('#aiKey').focus(); }, 50); }
}
$('#aiPill').onclick = openAi;
$('#modal').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });

/* ---------------- 1. 자료 넣기 ---------------- */
function fillSample(s) { $('#inTitle').value = s.title; $('#inSub').value = s.subtitle; $('#inOrg').value = s.org; $('#inTopic').value = s.topic; $('#inSrc').value = s.text; countSrc(); }
function countSrc() { $('#srcCount').textContent = $('#inSrc').value.length.toLocaleString() + '자'; }
$('#inSrc').addEventListener('input', countSrc);
$('#btnSampleCarbon').onclick = function () { fillSample(window.GQ_SAMPLES.carbon); };
$('#btnSampleWater').onclick = function () { fillSample(window.GQ_SAMPLES.water); };
$('#inFile').onchange = function () { var f = this.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { $('#inSrc').value = r.result; countSrc(); if (!$('#inTitle').value) $('#inTitle').value = f.name.replace(/\.[^.]+$/, ''); }; r.readAsText(f); };
function refreshLocal() { var sel = $('#selLocal'); sel.innerHTML = '<option value="">이 기기에 저장된 팩…</option>' + PK.list().map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.title) + ' (' + esc(p.made || '') + ')</option>'; }).join(''); }
$('#selLocal').onchange = function () { var p = PK.get(this.value); if (p) { loadPack(p, '이 기기에서 불러옴'); } this.value = ''; };
$('#inPack').onchange = function () { var f = this.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { try { loadPack(JSON.parse(r.result), '파일에서 불러옴'); } catch (e) { toast('팩 파일을 읽지 못했어요: ' + e.message); } }; r.readAsText(f); };
function options() {
  var levels = [1, 2, 3, 4].filter(function (l) { return $('#lv' + l).checked; }); if (!levels.length) levels = [1];
  return { title: $('#inTitle').value.trim(), subtitle: $('#inSub').value.trim(), org: $('#inOrg').value.trim(), topic: $('#inTopic').value.trim(), source: $('#inSrc').value, levels: levels, cross: $('#optCross').checked, wrong: $('#optWrong').checked, lessons: $('#optLessons').checked, perZone: Math.max(3, Math.min(10, +$('#optPer').value || 6)) };
}
$('#btnRun').onclick = function () {
  var o = options();
  if (o.source.replace(/\s/g, '').length < 300) { toast('교육자료가 너무 짧아요 (300자 이상)'); return; }
  if (!o.title) { toast('체험관 이름을 적어 주세요'); return; }
  if (!G.ready()) { openAi(true); toast('AI 키를 붙여 넣고 저장하면 바로 만들기 시작해요'); return; }
  startRun(function (prog) { return G.run(o, prog); }, '모델: ' + (G.loadCfg().model || G.loadCfg().provider));
};
$('#inReplay').onchange = function () {
  var f = this.files[0]; if (!f) return; var r = new FileReader();
  r.onload = function () { try { var log = JSON.parse(r.result); if (!log.entries) throw new Error('생성 기록 파일이 아니에요'); var o = options(); startRun(function (prog) { return G.replay(log, { title: o.title || log.title, subtitle: o.subtitle, org: o.org, topic: o.topic, delay: 250 }, prog); }, '🎞️ 기록 재생 (' + esc(log.model || '') + ' · ' + esc(log.made || '') + ') — AI를 부르지 않고 저장된 결과를 그대로 다시 보여 줘요'); } catch (e) { toast(e.message); } };
  r.readAsText(f);
};

/* ---------------- 2. 생성 진행 ---------------- */
var STATE = {};
function renderStages() {
  $('#stageTable tbody').innerHTML = G.STAGES.map(function (s) {
    var st = STATE[s[0]] || {}, r = (report && report.stages[s[0]]) || {};
    var cls = st.status === 'run' ? 'run' : st.status === 'ok' ? 'ok' : st.status === 'fail' ? 'fail' : st.status === 'skip' ? '' : '';
    var lbl = st.status === 'run' ? '진행 중' : st.status === 'ok' ? '완료' : st.status === 'fail' ? '실패' : st.status === 'skip' ? '생략' : '대기';
    return '<tr><td>' + esc(s[1]) + '</td><td><span class="st ' + cls + '">' + lbl + '</span></td><td>' + (r.asked ? (r.passed + ' / ' + r.asked) : '') + '</td><td>' + (r.dropped && r.dropped.length ? '<b>' + r.dropped.length + '</b>' : '') + '</td><td class="fine">' + esc(r.note || '') + (r.ms ? ' · ' + (r.ms / 1000).toFixed(1) + '초' : '') + '</td></tr>';
  }).join('');
}
function startRun(fn, meta) {
  STATE = {}; report = null; genLog = null; approved = {}; $('#dropFeed').innerHTML = ''; $('#btnSaveLog').hidden = true; $('#runNote').textContent = ''; $('#runMeta').textContent = meta;
  step(2); renderStages(); $('#btnAbort').disabled = false; $('#btnRun').disabled = true;
  var lastDropCount = {};
  fn(function (p) {
    report = p.report; if (p.status === 'start') STATE[p.stage] = { status: 'run' }; if (p.status === 'done') STATE[p.stage] = { status: 'ok' };
    var r = report.stages[p.stage]; if (r) { var n = lastDropCount[p.stage] || 0; r.dropped.slice(n).forEach(function (d) { var div = document.createElement('div'); div.textContent = '[' + G.STAGES.find(function (s) { return s[0] === p.stage; })[1] + '] ' + d.what + ' — ' + d.reason; $('#dropFeed').prepend(div); }); lastDropCount[p.stage] = r.dropped.length; }
    renderStages();
  }).then(function (r) {
    pack = r.pack; report = r.report; genLog = r.log;
    G.STAGES.forEach(function (s) { if (!STATE[s[0]]) STATE[s[0]] = { status: 'skip' }; else if (STATE[s[0]].status === 'run') STATE[s[0]] = { status: 'ok' }; });
    renderStages(); $('#btnAbort').disabled = true; $('#btnRun').disabled = false; $('#btnSaveLog').hidden = r.replayed;
    var totalDrop = Object.keys(report.stages).reduce(function (s, k) { return s + report.stages[k].dropped.length; }, 0);
    $('#runNote').textContent = '완료 · AI 호출 ' + report.calls + '번 · ' + (report.ms / 1000).toFixed(0) + '초 · 걸러진 항목 ' + totalDrop + '개 (이유는 검토 단계의 "걸러진 항목" 탭)';
    toast('✨ 체험관 초안이 만들어졌어요. 이제 검토해 주세요.'); openReview();
  }, function (e) {
    Object.keys(STATE).forEach(function (k) { if (STATE[k].status === 'run') STATE[k] = { status: 'fail' }; }); renderStages();
    $('#btnAbort').disabled = true; $('#btnRun').disabled = false; var div = document.createElement('div'); div.className = 'err'; div.textContent = '생성 중단: ' + e.message; $('#dropFeed').prepend(div); toast('생성이 멈췄어요: ' + e.message, 5000);
  });
}
$('#btnAbort').onclick = function () { G.abort(); };
$('#btnSaveLog').onclick = function () { if (!genLog) return; var blob = new Blob([JSON.stringify(genLog)], { type: 'application/json' }); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (pack.id || 'pack') + '.genlog.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); };

/* ---------------- 3. 검토·승인 ---------------- */
function loadPack(p, note) { pack = PK.normalize(p); report = null; genLog = null; approved = {}; $('#runMeta').textContent = note; STATE = {}; renderStages(); step(3); $('#s2').hidden = true; openReview(); }
function openReview() { step(3); $('#revMeta').textContent = pack.title + ' · 카드 ' + pack.cards.length + '장 · 문제 ' + pack.bank.length + '개 · 수업 ' + Object.keys(pack.lessons).length + '주제 · 실천 ' + pack.actions.length + '장'; curTab = 'design'; renderTabs(); }
function renderTabs() {
  $('#tabs').innerHTML = TABS.map(function (t) { return '<button data-tab="' + t[0] + '" class="' + (curTab === t[0] ? 'on ' : '') + (approved[t[0]] ? 'ok' : '') + '">' + esc(t[1]) + (t[0] === 'dropped' && report ? ' (' + Object.keys(report.stages).reduce(function (s, k) { return s + report.stages[k].dropped.length; }, 0) + ')' : '') + '</button>'; }).join('');
  $$('#tabs button').forEach(function (b) { b.onclick = function () { curTab = b.dataset.tab; renderTabs(); }; });
  var body = $('#tabBody'); body.innerHTML = RENDER[curTab]();
  bindFields(body);
  var need = TABS.filter(function (t) { return t[0] !== 'dropped'; }), n = need.filter(function (t) { return approved[t[0]]; }).length;
  $('#approveCount').textContent = '검토 완료 ' + n + '/' + need.length;
  $('#btnToPublish').disabled = false;
}
function F(path, label, opt) { opt = opt || {}; var v = getPath(pack, path); v = v == null ? '' : v; var inp = opt.sel ? '<select data-path="' + path + '">' + opt.sel.map(function (o) { var val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(val) + '" ' + (String(val) === String(v) ? 'selected' : '') + '>' + esc(lab) + '</option>'; }).join('') + '</select>' : opt.area ? '<textarea data-path="' + path + '">' + esc(v) + '</textarea>' : '<input data-path="' + path + '" value="' + esc(v) + '">'; return '<div class="f"><span>' + esc(label) + '</span>' + inp + '</div>'; }
function bindFields(root) {
  $$('[data-path]', root).forEach(function (el) { el.oninput = el.onchange = function () { var v = el.value; var cur = getPath(pack, el.dataset.path); if (typeof cur === 'number') v = +v; setPath(pack, el.dataset.path, v); }; });
  $$('[data-del]', root).forEach(function (b) { b.onclick = function () { var p = b.dataset.del.split('@'), arr = getPath(pack, p[0]); arr.splice(+p[1], 1); renderTabs(); }; });
  $$('[data-delkey]', root).forEach(function (b) { b.onclick = function () { var p = b.dataset.delkey.split('@'); delete getPath(pack, p[0])[p[1]]; renderTabs(); }; });
  var ap = $('#apv', root); if (ap) ap.onchange = function () { approved[curTab] = ap.checked; renderTabs(); };
}
function approveBox() { return '<label class="approve"><input type="checkbox" id="apv" ' + (approved[curTab] ? 'checked' : '') + '> 이 탭을 검토했어요</label>'; }
function cardOpts() { return pack.cards.map(function (c) { return [c.id, c.id + ' ' + c.title]; }); }
function zoneOpts() { return [['earth', '전체(광장)']].concat(pack.zones.map(function (z) { return [z.id, z.name]; })); }
var RENDER = {
  design: function () {
    var ANI = PK.ANIMALS.map(function (a) { return [a, PK.ANIMAL_EMOJI[a] + ' ' + a]; });
    return '<div class="blk"><h3>체험관</h3><div class="g3">' + F('title', '이름') + F('subtitle', '부제') + F('org', '기관') + '</div>' + F('lead', '시작 화면 소개', { area: true }) + '</div>' +
      '<div class="blk"><h3>광장 주인공 (hub)</h3><div class="g3">' + F('hub.name', '이름') + F('hub.title', '전체 호칭') + F('hub.meter', '상태 이름') + F('hub.cloud', '걱정 구름') + F('hub.place', '장소') + F('hub.homework', '숙제 이름') + '</div><div class="g3">' + F('hub.states.hot', '상태: 처음') + F('hub.states.warm', '상태: 조금') + F('hub.states.mild', '상태: 많이') + F('hub.states.cool', '상태: 완료') + '</div>' + F('hub.intro0', '처음 인사', { area: true }) + F('hub.introMid', '중간 인사 ({n}곳)', { area: true }) + F('hub.introDone', '완료 인사', { area: true }) + F('hub.finaleTitle', '마지막 제목') + F('hub.finaleText', '마지막 글', { area: true }) + F('hub.cert', '수료증 이름') + '</div>' +
      '<div class="blk"><h3>마스코트</h3><div class="g3">' + F('mascot.name', '이름') + F('mascot.animal', '동물', { sel: ANI }) + '</div>' + F('mascot.hi', '인사', { area: true }) + '<h4>물어볼 만한 질문</h4>' + (pack.suggest || []).map(function (s, i) { return F('suggest.' + i, '질문 ' + (i + 1)); }).join('') + '</div>' +
      pack.zones.map(function (z, i) { var b = 'zones.' + i + '.'; return '<div class="blk"><h3>' + esc(z.icon) + ' 마을 ' + (i + 1) + ' <span class="tag">' + esc(PK.TPL_INFO[z.template].name) + ' 템플릿</span></h3><div class="g3">' + F(b + 'name', '마을 이름') + F(b + 'short', '짧은 이름') + F(b + 'topic', '주제') + F(b + 'friend', '친구 이름') + F(b + 'animal', '동물', { sel: ANI.filter(function (a) { return a[0] !== 'bear'; }) }) + F(b + 'icon', '아이콘') + '</div>' + F(b + 'greet', '인사', { area: true }) + F(b + 'cleared', '체험 완료 문장', { area: true }) + '</div>'; }).join('') + approveBox();
  },
  cards: function () { return '<p class="fine">근거 카드는 AI가 쓸 수 있는 유일한 사실이에요. 원문과 다르면 여기서 고치세요.</p>' + pack.cards.map(function (c, i) { var b = 'cards.' + i + '.'; return '<div class="item"><button class="del" data-del="cards@' + i + '">삭제</button><div class="g3">' + F(b + 'id', 'id') + F(b + 'title', '제목') + F(b + 'zone', '마을', { sel: zoneOpts() }) + '</div>' + F(b + 'text', '내용', { area: true }) + F(b + 'keys', '검색 낱말') + (c.quote ? '<p class="fine">원문 구절: “' + esc(c.quote) + '”</p>' : '') + '</div>'; }).join('') + approveBox(); },
  mission: function () {
    return pack.zones.map(function (z, zi) {
      var b = 'zones.' + zi + '.mission.', M = z.mission;
      return '<div class="blk"><h3>' + esc(z.icon + ' ' + z.name) + ' <span class="tag">' + esc(PK.TPL_INFO[z.template].name) + '</span></h3><div class="g3">' + F(b + 'title', '체험 이름') + F(b + 'icon', '아이콘') + F(b + 'unit', '할 일 이름') + (z.template === 'ride' ? F(b + 'vehicle', '탈것') + F(b + 'goal', '목적지') : '') + '</div>' + F(b + 'intro', '소개', { area: true }) +
        '<h4>효과 사슬 (행동 → 변화 → 최종 효과 · 체험 뒤 "그래서 지구는?"에 보여요)</h4><div class="g3">' + [0, 1, 2].map(function (k) { return F(b + 'chain.' + k, (k + 1) + '단계'); }).join('') + '</div>' +
        (M.bins ? '<h4>분류 칸</h4>' + M.bins.map(function (bn, k) { return '<div class="g3">' + F(b + 'bins.' + k + '.id', 'id') + F(b + 'bins.' + k + '.icon', '아이콘') + F(b + 'bins.' + k + '.name', '이름') + '</div>'; }).join('') : '') +
        '<h4>할 일 (순서대로)</h4>' + M.spots.map(function (s, k) { var p = b + 'spots.' + k + '.'; return '<div class="item"><button class="del" data-del="' + b + 'spots@' + k + '">삭제</button><div class="g3">' + F(p + 'label', '이름') + (s.ring ? '<div class="f"><span>종류</span><input value="체크포인트 고리" disabled></div>' : F(p + 'act', '버튼 글')) + F(p + 'ev', '근거 카드', { sel: cardOpts() }) + (z.template === 'sort' ? F(p + 'bin', '들어갈 칸', { sel: M.bins.map(function (bn) { return [bn.id, bn.name]; }) }) : '') + '</div>' + F(p + 'say', '해 본 뒤 친구 말', { area: true }) + F(p + 'effect', '효과 (이렇게 하면 무엇이 얼마나 좋아지는지 · 비우면 사슬만 보여요)', { area: true }) + (s.ask ? '<div class="g3">' + F(p + 'ask.q', '고르기 질문') + F(p + 'ask.answer', '정답 번호(0부터)') + F(p + 'ask.wrong', '틀렸을 때') + '</div>' + s.ask.options.map(function (o, oi) { return F(p + 'ask.options.' + oi, '보기 ' + (oi + 1)); }).join('') : '') + '</div>'; }).join('') + '</div>';
    }).join('') + approveBox();
  },
  bank: function () {
    return pack.zones.map(function (z) { return '<div class="blk"><h3>' + esc(z.icon + ' ' + z.name) + '</h3>' + PK.LEVELS.map(function (L) { var qs = pack.bank.map(function (q, i) { return { q: q, i: i }; }).filter(function (x) { return x.q.zone === z.id && x.q.level === L.id; }); if (!qs.length) return ''; return '<h4>' + esc(L.label) + ' · ' + qs.length + '문제</h4>' + qs.map(function (x) { var q = x.q, b = 'bank.' + x.i + '.'; return '<div class="item"><button class="del" data-del="bank@' + x.i + '">삭제</button><div class="g3">' + F(b + 'type', '유형', { sel: [['ox', 'OX'], ['choice', '3지선다']] }) + F(b + 'answer', '정답' + (q.type === 'ox' ? ' (O/X)' : ' 번호(0~2)')) + F(b + 'ev', '근거 카드', { sel: cardOpts() }) + '</div>' + F(b + 'q', '문제', { area: true }) + (q.type === 'choice' ? '<div class="g3">' + [0, 1, 2].map(function (k) { return F(b + 'options.' + k, '보기 ' + (k + 1)); }).join('') + '</div>' : '') + F(b + 'explain', '해설', { area: true }) + F(b + 'hint', '힌트') + (q.wrong ? Object.keys(q.wrong).map(function (k) { return F(b + 'wrong.' + k, '오답 ' + k + ' 설명', { area: true }); }).join('') : '<p class="fine">오답별 설명 없음 → 힌트+해설을 보여 줘요</p>') + '</div>'; }).join(''); }).join('') + '</div>'; }).join('') + approveBox();
  },
  lessons: function () {
    var ids = Object.keys(pack.lessons); if (!ids.length) return '<p class="fine">수업이 없어요. 체험관에서는 근거 카드 문장으로 배우기를 보여 줍니다.</p>' + approveBox();
    return ids.map(function (cid) { var c = pack.cards.find(function (x) { return x.id === cid; }); if (!c) return ''; return '<div class="blk"><h3>' + esc(cid + ' ' + c.title) + '</h3>' + Object.keys(pack.lessons[cid]).map(function (lv) { var b = 'lessons.' + cid + '.' + lv + '.', L = PK.LEVELS.find(function (x) { return String(x.id) === String(lv); }); return '<div class="item"><button class="del" data-delkey="lessons.' + cid + '@' + lv + '">삭제</button><h4>' + esc(L ? L.label : lv) + '</h4>' + F(b + 'intro', '이게 뭐야?', { area: true }) + F(b + 'example', '이런 장면', { area: true }) + F(b + 'tryIt', '오늘 해 볼 일', { area: true }) + '</div>'; }).join('') + '</div>'; }).join('') + approveBox();
  },
  actions: function () { return pack.actions.map(function (a, i) { var b = 'actions.' + i + '.'; return '<div class="item"><button class="del" data-del="actions@' + i + '">삭제</button><div class="g3">' + F(b + 'ev', '근거 카드', { sel: cardOpts() }) + '</div>' + F(b + 'text', '실천', { area: true }) + F(b + 'why', '왜 좋은지', { area: true }) + '</div>'; }).join('') + approveBox(); },
  dropped: function () {
    if (!report) return '<p class="fine">생성 기록이 없어요 (불러온 팩).</p>';
    return G.STAGES.map(function (s) { var r = report.stages[s[0]]; if (!r || !r.dropped.length) return ''; return '<div class="blk"><h3>' + esc(s[1]) + ' <span class="tag">걸러짐 ' + r.dropped.length + '</span></h3><ul class="dropped">' + r.dropped.map(function (d) { return '<li>' + esc(d.what) + ' — <b>' + esc(d.reason) + '</b></li>'; }).join('') + '</ul></div>'; }).join('') || '<p class="fine">걸러진 항목이 없어요.</p>';
  }
};
$('#btnPreview').onclick = function () { var p = PK.normalize(pack); p.id = pack.id = pack.id || p.id; PK.save(p); window.open('index.html?pack=' + encodeURIComponent(p.id), '_blank'); toast('이 기기에 임시 저장하고 새 탭에서 열었어요'); };
$('#btnToPublish').onclick = function () {
  var need = TABS.filter(function (t) { return t[0] !== 'dropped' && !approved[t[0]]; });
  if (need.length && !confirm('아직 검토하지 않은 탭이 있어요: ' + need.map(function (t) { return t[1]; }).join(', ') + '\n그래도 발행 단계로 갈까요?')) return;
  var errs = PK.validate(pack); if (errs.length) { toast('고칠 것이 있어요: ' + errs.join(' / '), 5000); return; }
  pack.meta.approved = !need.length; $('#pubId').value = pack.id || ''; $('#pubTitle').value = pack.title; step(4); $('#qr').innerHTML = ''; $('#pubNote').textContent = '';
};

/* ---------------- 4. 발행 ---------------- */
function finalPack() { var p = PK.normalize(pack); p.id = PK.slug($('#pubId').value.trim() || p.id); p.title = $('#pubTitle').value.trim() || p.title; p.meta = Object.assign({}, pack.meta, { approved: pack.meta.approved, published: new Date().toISOString().slice(0, 10) }); return p; }
$('#btnPublish').onclick = function () { var p = finalPack(); if (!PK.save(p)) { toast('이 기기 저장 공간이 부족해요. JSON 내보내기를 쓰세요.'); return; } pack = p; refreshLocal(); window.open('index.html?pack=' + encodeURIComponent(p.id), '_blank'); $('#pubNote').textContent = '저장했어요. 체험관 주소: index.html?pack=' + p.id + ' (같은 기기에서 열림)'; toast('💾 저장하고 체험관을 열었어요'); };
$('#btnCopyLink').onclick = function () {
  var p = finalPack(), link = PK.encodeLink(p);
  navigator.clipboard.writeText(link).then(function () { toast('🔗 링크를 복사했어요 (' + link.length.toLocaleString() + '자). 다른 기기에서도 열려요.'); }, function () { prompt('링크를 복사하세요', link); });
  $('#qr').innerHTML = ''; if (link.length <= 2300 && window.QRCode) { new QRCode($('#qr'), { text: link, width: 160, height: 160 }); $('#pubNote').textContent = 'QR을 찍으면 체험관이 열려요.'; } else $('#pubNote').textContent = '팩이 커서 QR에는 담기지 않아요 (' + link.length.toLocaleString() + '자). 링크는 그대로 쓸 수 있고, 팩 JSON을 웹서버에 올리면 index.html?pack=<주소>로 짧은 링크·QR을 만들 수 있어요.';
};
$('#btnExport').onclick = function () { PK.download(finalPack()); };

updatePill(); refreshLocal();
})();
