/*! AI 체험관 메이커 — 생성 파이프라인 (담당자용 · 학생 체험 화면에서는 쓰지 않음)
 *
 *  교육자료(글) → A 근거 카드 추출 → B 마을·친구 설계 → C 마을별 체험 미션 → D 학년별 문제 → E 오답별 설명
 *               → F 학년별 수업 → G 실천 카드 → 팩(JSON)
 *  단계마다 AI 결과를 원문·근거 카드와 자동 대조하고(지어낸 문장, 뜻 뒤집힘, 겁주는 표현, 형식 오류),
 *  걸러진 항목은 이유와 함께 담당자에게 보여 줍니다. 담당자가 검토·승인한 팩만 발행됩니다.
 *
 *  모든 AI 호출은 GreenLLM.chat() 하나로 나가며(모델 비종속), 호출 기록을 남겨 AI 없이 '기록 재생'으로 같은 과정을 보여 줄 수 있습니다.
 */
(function () {
'use strict';
var LLM = window.GreenLLM, S = window.GQSafety, TX = window.GQText, PK = window.GQPack;
var norm = TX.norm, dice = TX.dice, coverage = TX.coverage, sentences = TX.sentences;

/* ---------------- 설정 ---------------- */
var CFG_KEY = 'gqm.ai', memKey = '';
function loadCfg() {
  var c = {}; try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch (e) { c = {}; }
  var out = Object.assign({ provider: 'openai', baseUrl: '', model: '', apiKey: '', temperature: 0.5, maxTokens: 2200, keepKey: false, timeoutSec: 90 }, c);
  if (!out.keepKey) out.apiKey = memKey || out.apiKey || '';
  return out;
}
function saveCfg(c) { memKey = c.apiKey || ''; var copy = Object.assign({}, c); if (!copy.keepKey) delete copy.apiKey; try { localStorage.setItem(CFG_KEY, JSON.stringify(copy)); } catch (e) {} }
function ready() { var c = loadCfg(); return !!(LLM && LLM.isReady(c)); }
function test(cfg) { return LLM.chat(Object.assign({}, cfg, { maxTokens: 30, temperature: 0 }), [{ role: 'user', content: '"준비 완료"라고만 답해.' }], { stream: false }).then(function (t) { return LLM.stripThinking(t).slice(0, 40); }); }

/* ---------------- 호출 · 기록 · 재생 ---------------- */
var LOG = [], REPLAY = null, aborter = null;
function parseJSON(text, want) {
  var t = String(text || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/```(?:json)?/gi, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  var open = want === 'array' ? '[' : '{', close = want === 'array' ? ']' : '}';
  var a = t.indexOf(open), b = t.lastIndexOf(close);
  if (a < 0 || b <= a) { if (want !== 'array') { var arr = parseJSONArr(t); return arr ? { items: arr } : null; } return null; }
  try { return JSON.parse(t.slice(a, b + 1).replace(/,\s*([\]}])/g, '$1')); } catch (e) { return null; }
}
function parseJSONArr(t) { var a = t.indexOf('['), b = t.lastIndexOf(']'); if (a < 0 || b <= a) return null; try { return JSON.parse(t.slice(a, b + 1).replace(/,\s*([\]}])/g, '$1')); } catch (e) { return null; } }
function call(stage, messages, o) {
  o = o || {};
  if (REPLAY) {
    var q = REPLAY.byStage[stage] || []; var rec = q.shift();
    if (!rec) return Promise.reject(new Error('기록에 ' + stage + ' 단계 결과가 더 없어요'));
    return new Promise(function (res) { setTimeout(function () { res(rec.out); }, REPLAY.delay == null ? 350 : REPLAY.delay); });
  }
  var c = loadCfg(), cfg = Object.assign({}, c, { temperature: o.temperature != null ? o.temperature : c.temperature, maxTokens: o.maxTokens || c.maxTokens });
  var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, (c.timeoutSec || 90) * 1000 * (c.provider === 'webllm' ? 2.5 : 1));
  if (aborter) aborter.signal.addEventListener('abort', function () { ctrl.abort(); });
  var t0 = Date.now();
  return LLM.chat(cfg, messages, { stream: false, signal: ctrl.signal, json: !!o.json, schema: o.schema }).then(function (t) {
    clearTimeout(timer); t = LLM.stripThinking(t); LOG.push({ stage: stage, ms: Date.now() - t0, out: t }); return t;
  }, function (e) { clearTimeout(timer); if (e && e.name === 'AbortError') { var x = new Error(aborter && aborter.signal.aborted ? '중단함' : '시간 초과'); x.timeout = true; throw x; } throw e; });
}

/* ---------------- 검사 도구 ---------------- */
var S_STR = { type: 'string' };
function unsafe(t) { var r = S.checkOutput(t, 9999); return !r.ok || r.text.length < String(t).replace(/[*_#>`]/g, '').trim().length * 0.7; }
var SCARY = /죽|멸망|재앙|끔찍|무서|공포|지옥/;
var NEG = /(안 |않|못 |없|아니|말고|금지)/g;
var ANT = [[/켜|켠|켭/, /끄|꺼|끈|끕/], [/꽂/, /뽑/], [/늘어|늘려|늘리/, /줄어|줄여|줄이/], [/많이|많은|많아|많게/, /적게|적은|적어/], [/좋아|좋은|좋게|좋다/, /나쁘|나빠|나쁜/], [/열어|열면|열고|연다/, /닫/], [/남기|남겨|남긴/, /남김없이|다 먹/], [/버리|버려|버린/, /아껴|아끼/], [/같이|함께|섞어/, /따로|분리/]];
function flipped(a, b) { a = String(a); b = String(b); if (((a.match(NEG) || []).length % 2) !== ((b.match(NEG) || []).length % 2)) return true; return ANT.some(function (p) { var a0 = p[0].test(a), a1 = p[1].test(a), b0 = p[0].test(b), b1 = p[1].test(b); return (a0 && !a1 && b1 && !b0) || (a1 && !a0 && b0 && !b1); }); }
function oxStatement(q) { return !/(무엇|뭐|어떤|어떻게|어디|언제|누가|누구|몇|왜|어느)/.test(String(q)); }
function kidTone(t) { return !/(습니다|입니다)/.test(String(t)); }
function grounded(text, src, min) { var best = 0; sentences(src).forEach(function (s) { best = Math.max(best, coverage(text, s + ' ' + src)); }); return Math.max(best, coverage(text, src)) >= min; }
function quoteIn(quote, src) { var q = norm(quote); if (q.length < 6) return false; if (norm(src).indexOf(q) >= 0) return true; var best = 0; sentences(src).forEach(function (s) { best = Math.max(best, dice(quote, s)); }); return best >= 0.55; }
var LEVEL_DESC = {}, MAXLEN = { 1: 52, 2: 70, 3: 86, 4: 100 };
PK.LEVELS.forEach(function (l) { LEVEL_DESC[l.id] = l.label + '. ' + l.desc; });
function cardsBlock(cards) { return cards.map(function (c) { return c.id + ' (' + c.title + '): ' + c.text; }).join('\n'); }
function chunk(text, size) { var paras = String(text).split(/\n{2,}|\r\n\r\n/), out = [], cur = ''; paras.forEach(function (p) { if (cur && (cur.length + p.length) > size) { out.push(cur); cur = ''; } cur += (cur ? '\n\n' : '') + p; }); if (cur) out.push(cur); return out.map(function (c) { return c.length > size * 1.8 ? c.slice(0, size * 1.8) : c; }); }

/* ---------------- A. 근거 카드 ---------------- */
var SCH_CARDS = { type: 'object', properties: { cards: { type: 'array', items: { type: 'object', properties: { title: S_STR, text: S_STR, keys: S_STR, quote: S_STR }, required: ['title', 'text', 'keys', 'quote'] } } }, required: ['cards'] };
function stageCards(src, opt, rep) {
  var chunks = chunk(src, 2600), all = [], dropped = [], per = Math.max(6, Math.ceil((opt.cardMax || 28) / chunks.length));
  var seq = Promise.resolve();
  chunks.forEach(function (ch, ci) {
    seq = seq.then(function () {
      rep('cards', 'start', { note: '자료 ' + (ci + 1) + '/' + chunks.length + ' 읽는 중' });
      var msgs = [
        { role: 'system', content: '너는 공공기관 교육자료를 학생 눈높이 "근거 카드"로 정리하는 교육 전문가야.\n규칙:\n- 자료에 실제로 있는 사실만 카드로 만들어. 자료에 없는 사실·숫자·이름은 절대 보태지 마.\n- 카드 하나는 사실 하나. title은 10자 이내, text는 학생에게 말하듯 "~요" 체 2~3문장(120자 이내), keys는 학생이 물어볼 때 쓸 검색 낱말 6~10개(띄어쓰기로 구분).\n- quote에는 그 카드의 근거가 되는 원문 구절을 글자 그대로 옮겨 적어(15~40자).\n- 겁주는 표현 금지. 밝고 다정하게.\n- 카드는 최대 ' + per + '개.\nJSON 객체만 출력: {"cards":[{"title":"...","text":"...","keys":"...","quote":"..."}]}' },
        { role: 'user', content: '[자료]\n' + ch }
      ];
      return call('cards', msgs, { json: true, schema: SCH_CARDS, temperature: 0.3 }).then(function (t) {
        var o = parseJSON(t), arr = (o && (o.cards || o.items)) || [];
        if (!Array.isArray(arr)) throw new Error('카드 결과를 읽지 못함');
        arr.forEach(function (c) {
          if (!c || !c.text) return;
          var text = String(c.text).trim(), title = String(c.title || '').trim().slice(0, 14), quote = String(c.quote || '').trim();
          if (text.length > 200) text = sentences(text).slice(0, 3).join(' ');
          if (!title) { dropped.push({ what: text.slice(0, 40), reason: '제목 없음' }); return; }
          if (!quoteIn(quote, ch) && !grounded(text, ch, 0.35)) { dropped.push({ what: title + ': ' + text.slice(0, 50), reason: '원문에 없는 내용(근거 구절을 찾지 못함)' }); return; }
          if (unsafe(text) || unsafe(title) || SCARY.test(text)) { dropped.push({ what: title, reason: '학생에게 맞지 않거나 겁주는 표현' }); return; }
          if (!kidTone(text)) text = text.replace(/습니다/g, '어요').replace(/입니다/g, '이에요');
          if (all.some(function (x) { return dice(x.text, text) > 0.8 || x.title === title; })) { dropped.push({ what: title, reason: '이미 있는 카드와 거의 같음' }); return; }
          all.push({ id: 'C' + (all.length + 1), zone: 'earth', title: title, keys: String(c.keys || '').replace(/[,·]/g, ' ').trim(), text: text, quote: quote });
        });
      });
    });
  });
  return seq.then(function () { if (all.length < 4) throw new Error('근거 카드가 4장보다 적어요 (' + all.length + '장). 자료가 너무 짧거나 교육 내용이 아닐 수 있어요.'); return { cards: all.slice(0, opt.cardMax || 28), dropped: dropped }; });
}

/* ---------------- B. 마을 · 친구 설계 ---------------- */
var SCH_DESIGN = { type: 'object', properties: { hub: { type: 'object' }, mascot: { type: 'object' }, suggest: { type: 'array', items: S_STR }, zones: { type: 'array', items: { type: 'object', properties: { name: S_STR, short: S_STR, friend: S_STR, animal: S_STR, icon: S_STR, topic: S_STR, greet: S_STR, cleared: S_STR, template: S_STR, cardIds: { type: 'array', items: S_STR } }, required: ['name', 'short', 'friend', 'animal', 'icon', 'topic', 'greet', 'cleared', 'template', 'cardIds'] } } }, required: ['hub', 'mascot', 'suggest', 'zones'] };
function stageDesign(cards, meta, rep) {
  rep('design', 'start');
  var TI = PK.TPL_INFO;
  var msgs = [
    { role: 'system', content: '너는 어린이용 3D 체험 마을을 설계하는 교육 게임 기획자야. 주제: "' + meta.topic + '"' + (meta.org ? ' (기관: ' + meta.org + ')' : '') + '\n아래 [근거 카드]를 네 마을에 나누어 담고, 마을마다 체험 템플릿을 하나씩 정해.\n템플릿(각각 꼭 한 번씩):\n' + PK.TPL_ORDER.map(function (t) { return '- ' + t + ': ' + TI[t].desc; }).join('\n') + '\n출력 규칙:\n- hub: 광장의 주인공(아기 지구처럼 힘들어하다가 아이가 도우면 나아지는 캐릭터). {name(2~3자), title, place, meter(상태 이름, 예: 지구 열), cloud(마을 위 걱정 구름 이름 2~3자), states:{hot,warm,mild,cool}(각 6~10자), intro0, introMid("{n}곳" 포함), introDone, finaleTitle, finaleText, homework(숙제 이름), cert(수료증 이름)}\n- mascot: 따라다니는 친구 {name(2~3자), animal(bear/rabbit/raccoon/squirrel/puppy 중 하나), hi(인사 한 문장), lines(짧은 말 4개)}\n- suggest: 아이가 마스코트에게 물어볼 만한 질문 6개(각 15자 이내, 카드 내용에 답이 있는 것만)\n- zones: 4개. {name(마을 이름, 의성어/의태어 느낌 6~9자), short(3~5자), friend(친구 이름 2~3자), animal(rabbit/raccoon/squirrel/puppy 중 서로 다르게), icon(이모지 1개), topic(주제 4~8자), greet(인사 1~2문장), cleared(체험을 마쳤을 때 마을이 어떻게 좋아졌는지 1문장), template, cardIds(이 마을에 어울리는 카드 id 목록, 모든 카드를 한 번씩 빠짐없이 나누기)}\n- 모든 말투는 학생에게 말하듯 다정한 반말/"~요". 겁주는 말 금지.\nJSON 객체만 출력.' },
    { role: 'user', content: '[근거 카드]\n' + cardsBlock(cards) }
  ];
  return call('design', msgs, { json: true, schema: SCH_DESIGN, temperature: 0.7, maxTokens: 2600 }).then(function (t) {
    var o = parseJSON(t); if (!o || !Array.isArray(o.zones)) throw new Error('설계 결과를 읽지 못함');
    var dropped = [], used = {}, ids = {}; cards.forEach(function (c) { ids[c.id] = 1; });
    var zones = o.zones.slice(0, 4).map(function (z, i) {
      var tpl = TI[z.template] && !used[z.template] ? z.template : null; if (tpl) used[tpl] = 1;
      var cids = (z.cardIds || []).filter(function (id) { return ids[id]; });
      return { id: 'z' + (i + 1), name: String(z.name || '').slice(0, 12) || ('마을 ' + (i + 1)), short: String(z.short || z.name || '').slice(0, 6), friend: String(z.friend || '').slice(0, 5) || '친구', animal: z.animal, icon: String(z.icon || '').slice(0, 2), topic: String(z.topic || '').slice(0, 12), greet: String(z.greet || ''), cleared: String(z.cleared || ''), template: tpl, cardIds: cids };
    });
    while (zones.length < 4) zones.push({ id: 'z' + (zones.length + 1), name: '마을 ' + (zones.length + 1), short: '마을', friend: '친구', animal: 'rabbit', icon: '🏠', topic: meta.topic, greet: '안녕!', cleared: '마을이 깨끗해졌어!', template: null, cardIds: [] });
    zones.forEach(function (z) { if (!z.template) { z.template = PK.TPL_ORDER.filter(function (t) { return !used[t]; })[0]; used[z.template] = 1; dropped.push({ what: z.name, reason: '템플릿이 빠지거나 겹쳐서 자동 배정(' + z.template + ')' }); } z.color = TI[z.template].colors[0]; if (!z.icon) z.icon = TI[z.template].icon; });
    var seen = {}; zones.forEach(function (z) { z.cardIds = z.cardIds.filter(function (id) { if (seen[id]) return false; seen[id] = 1; return true; }); });
    var left = cards.filter(function (c) { return !seen[c.id]; }); // 안 나눠진 카드는 적은 마을부터 채움
    left.forEach(function (c) { var zz = zones.slice().sort(function (a, b) { return a.cardIds.length - b.cardIds.length; })[0]; zz.cardIds.push(c.id); seen[c.id] = 1; });
    zones.forEach(function (z) { ['greet', 'cleared'].forEach(function (k) { if (!z[k] || unsafe(z[k]) || SCARY.test(z[k])) { dropped.push({ what: z.name + ' ' + k, reason: '비었거나 맞지 않는 표현 → 기본 문장' }); z[k] = ''; } }); });
    var animals = ['rabbit', 'raccoon', 'squirrel', 'puppy'], ua = {}; zones.forEach(function (z, i) { if (animals.indexOf(z.animal) < 0 || ua[z.animal]) z.animal = animals.filter(function (a) { return !ua[a]; })[0] || animals[i % 4]; ua[z.animal] = 1; });
    var hub = o.hub && typeof o.hub === 'object' ? o.hub : {}, mascot = o.mascot && typeof o.mascot === 'object' ? o.mascot : {};
    ['intro0', 'introMid', 'introDone', 'finaleText', 'finaleTitle'].forEach(function (k) { if (hub[k] && (unsafe(hub[k]) || SCARY.test(hub[k]))) { dropped.push({ what: 'hub.' + k, reason: '맞지 않는 표현 → 기본 문장' }); delete hub[k]; } });
    if (hub.introMid && hub.introMid.indexOf('{n}') < 0) hub.introMid = hub.introMid.replace(/\d+\s*곳/, '{n}곳');
    if (PK.ANIMALS.indexOf(mascot.animal) < 0) mascot.animal = 'bear';
    if (mascot.lines && !Array.isArray(mascot.lines)) delete mascot.lines;
    var suggest = (Array.isArray(o.suggest) ? o.suggest : []).map(function (s) { return String(s).trim(); }).filter(function (s) { return s && s.length <= 24 && !unsafe(s); }).slice(0, 6);
    var cardsOut = cards.map(function (c) { var z = zones.find(function (zz) { return zz.cardIds.indexOf(c.id) >= 0; }); return Object.assign({}, c, { zone: z ? z.id : 'earth' }); });
    return { hub: hub, mascot: mascot, suggest: suggest, zones: zones, cards: cardsOut, dropped: dropped };
  });
}

/* ---------------- C. 체험 미션 ---------------- */
var SCH_MISSION = { type: 'object', properties: { title: S_STR, icon: S_STR, unit: S_STR, intro: S_STR, chain: { type: 'array', items: S_STR }, vehicle: S_STR, goal: S_STR, bins: { type: 'array', items: { type: 'object', properties: { id: S_STR, icon: S_STR, name: S_STR }, required: ['id', 'icon', 'name'] } }, spots: { type: 'array', items: { type: 'object', properties: { label: S_STR, act: S_STR, say: S_STR, effect: S_STR, ev: S_STR, quote: S_STR, bin: S_STR, ask: { type: 'object', properties: { q: S_STR, options: { type: 'array', items: S_STR }, answer: { type: 'integer' }, wrong: S_STR }, required: ['q', 'options', 'answer'] } }, required: ['label', 'say', 'ev', 'quote'] } } }, required: ['title', 'icon', 'unit', 'intro', 'spots'] };
var TPL_RULES = {
  switch: '템플릿 switch(바로잡기): 마당 거실 같은 곳에 잘못 켜져 있거나 열려 있거나 잘못 맞춰진 물건 4~5개. 각 spot: label(물건 이름 2~8자), act("이모지 동사" 형태, 예: "💡 전등 끄기"), say(해 본 뒤 친구가 들려주는 이유 1~2문장). 하나는 값을 고르는 ask를 넣어도 좋아: {q, options(3~4개), answer(정답 번호 0부터), wrong(틀렸을 때 한마디)}.',
  sort: '템플릿 sort(줍고 분류하기): bins(분류 칸 3~5개: {id(영문 소문자), icon(이모지), name(2~4자)})와 섬에 떨어진 물건 spots 4~5개. 각 spot: label(물건 이름), bin(그 물건이 들어갈 칸 id), say(넣은 뒤 들려주는 이유 1~2문장). act는 쓰지 마.',
  plant: '템플릿 plant(심고 가꾸기): 빈자리 4~5곳에 심거나 놓는 체험. 각 spot: label(예: "빈 흙더미"), act(예: "🌱 묘목 심기"), say(심은 뒤 들려주는 이유 1~2문장). 모두 같은 act여도 돼.',
  ride: '템플릿 ride(타고 가기): vehicle(탈것 이름), goal(목적지 이름 2~6자), spots는 첫째가 탈것 타기(label=탈것, act="🚲 타기" 형태), 다음 3~4개는 지나가는 체크포인트(label="첫 번째 고리"처럼, act 없음), 마지막은 목적지 도착(label=목적지). 각 say는 지나가며 들려주는 이유 1~2문장.'
};
function stageMission(zone, cards, meta, rep) {
  rep('mission', 'start', { note: zone.name });
  var zc = cards.filter(function (c) { return c.zone === zone.id; }); if (!zc.length) zc = cards.slice(0, 4);
  var msgs = [
    { role: 'system', content: '너는 학생용 3D 체험 마을의 미션을 쓰는 기획자야. 마을: "' + zone.name + '" (주제: ' + zone.topic + ', 친구: ' + zone.friend + ')\n' + TPL_RULES[zone.template] + '\n공통 규칙:\n- say는 반드시 [근거 카드] 내용으로만, 카드에 없는 사실·숫자는 보태지 마. ev에 근거 카드 id, quote에 그 카드에서 글자 그대로 옮긴 구절(10~30자)을 넣어.\n- effect: 이 행동을 하면 무엇이 얼마나 좋아지는지 한 문장(카드에 수치가 있으면 그 수치를 그대로, 없으면 수치 없이). 카드에 없는 숫자 금지.\n- chain: 이 체험이 어떻게 좋은 변화로 이어지는지 3단계(각 4~12자, 이모지 1개로 시작): 행동 → 바로 생기는 변화 → 최종 효과. 근거 카드에 있는 내용으로.\n- 말투는 친구가 학생에게 말하듯 다정한 반말. 겁주는 말 금지. say는 100자 이내.\n- title(체험 이름 4~8자), icon(이모지 1개), unit(할 일을 부르는 말 2~5자, 예: 바로잡기), intro(친구가 체험을 소개하는 2~3문장, 무엇을 어떻게 하는지).\nJSON 객체만 출력: {"title":"...","icon":"...","unit":"...","intro":"...","chain":["...","...","..."],"vehicle":"...","goal":"...","bins":[...],"spots":[{"label":"...","act":"...","say":"...","effect":"...","ev":"C1","quote":"...","bin":"...","ask":{...}}]}' },
    { role: 'user', content: '[근거 카드]\n' + cardsBlock(zc) }
  ];
  return call('mission', msgs, { json: true, schema: SCH_MISSION, temperature: 0.7, maxTokens: 1800 }).then(function (t) {
    var o = parseJSON(t); if (!o || !Array.isArray(o.spots)) throw new Error('미션 결과를 읽지 못함');
    var dropped = [], CARD = {}; zc.forEach(function (c) { CARD[c.id] = c; });
    var bins = zone.template === 'sort' ? (o.bins || []).map(function (b) { return { id: String(b.id || b.name || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '').slice(0, 12), icon: String(b.icon || '📦').slice(0, 2), name: String(b.name || '').slice(0, 6) }; }).filter(function (b) { return b.id && b.name; }).slice(0, 5) : null;
    var spots = [], k = 0;
    o.spots.forEach(function (s, idx) {
      var say = String(s.say || '').trim(), ev = String(s.ev || '').toUpperCase().trim(), card = CARD[ev], label = String(s.label || '').trim().slice(0, 14);
      if (!label) { dropped.push({ what: zone.name + ' 할 일 ' + (idx + 1), reason: '이름 없음' }); return; }
      if (!card) { card = zc.find(function (c) { return grounded(say, c.text, 0.25); }); if (!card) { dropped.push({ what: label, reason: '근거 카드 번호가 없거나 다른 마을 카드(' + (s.ev || '없음') + ')' }); return; } ev = card.id; }
      if (!say) { dropped.push({ what: label, reason: '설명(say)이 없음' }); return; }
      if (!quoteIn(String(s.quote || ''), card.text) && !grounded(say, card.text, 0.22)) { dropped.push({ what: label + ': ' + say.slice(0, 40), reason: '설명이 근거 카드에 없는 내용(지어냈을 수 있음)' }); return; }
      if (unsafe(say) || SCARY.test(say) || unsafe(label)) { dropped.push({ what: label, reason: '학생에게 맞지 않거나 겁주는 표현' }); return; }
      if (say.length > 140) say = sentences(say).slice(0, 2).join(' ');
      var sp = { id: zone.id + '-' + (++k), label: label, say: say, ev: ev };
      var eff = String(s.effect || '').trim();
      if (eff) { if (eff.length <= 120 && !unsafe(eff) && !SCARY.test(eff) && (coverage(eff, card.text) >= 0.18 || coverage(eff, say) >= 0.3)) sp.effect = eff; else dropped.push({ what: label + ' 효과: ' + eff.slice(0, 40), reason: '효과 문장이 근거 카드에 없는 내용 → 생략' }); }
      if (zone.template === 'sort') { var bid = String(s.bin || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, ''); if (!bins.some(function (b) { return b.id === bid; })) { dropped.push({ what: label, reason: '들어갈 칸(bin)이 목록에 없음' }); return; } sp.bin = bid; }
      else if (zone.template === 'ride') { if (idx === 0) sp.act = String(s.act || '🚲 타기').slice(0, 12); else sp.ring = true; }
      else { sp.act = String(s.act || '').trim().slice(0, 14) || (zone.template === 'plant' ? '🌱 심기' : '✓ 바로잡기'); }
      if (s.ask && s.ask.q && Array.isArray(s.ask.options) && s.ask.options.length >= 3 && s.ask.answer >= 0 && s.ask.answer < s.ask.options.length && zone.template === 'switch') {
        var ask = { q: String(s.ask.q).slice(0, 60), options: s.ask.options.slice(0, 4).map(function (x) { return String(x).slice(0, 10); }), answer: +s.ask.answer, wrong: String(s.ask.wrong || '음… 다시 골라 볼까?').slice(0, 60) };
        if (!unsafe(ask.q)) sp.ask = ask;
      }
      spots.push(sp);
    });
    if (zone.template === 'sort' && (!bins || bins.length < 2)) { dropped.push({ what: zone.name, reason: '분류 칸이 2개보다 적어 기본 칸으로' }); bins = [{ id: 'a', icon: '📦', name: '가' }, { id: 'b', icon: '🧺', name: '나' }]; spots.forEach(function (s, i) { s.bin = bins[i % 2].id; }); }
    while (spots.length < 4) { var c = zc[spots.length % zc.length]; if (!c) break; var fill = { id: zone.id + '-' + (++k), label: c.title, say: sentences(c.text).slice(0, 2).join(' '), ev: c.id }; if (zone.template === 'sort') fill.bin = bins[0].id; else if (zone.template === 'ride') { if (!spots.length) fill.act = '🚲 타기'; else fill.ring = true; } else fill.act = zone.template === 'plant' ? '🌱 심기' : '✓ 바로잡기'; spots.push(fill); dropped.push({ what: fill.label, reason: '할 일이 모자라 카드로 채움(확인 필요)' }); }
    if (zone.template === 'ride') { spots = spots.slice(0, 6); spots.forEach(function (s, i) { s.ring = i > 0; if (i === 0) { delete s.ring; s.act = s.act || '🚲 타기'; } else delete s.act; }); }
    var mission = { title: String(o.title || '').slice(0, 12) || (PK.TPL_INFO[zone.template].name + ' 체험'), icon: String(o.icon || zone.icon).slice(0, 2), unit: String(o.unit || PK.TPL_INFO[zone.template].name).slice(0, 6), intro: String(o.intro || '').slice(0, 200), spots: spots.slice(0, 6) };
    if (unsafe(mission.intro) || SCARY.test(mission.intro)) { dropped.push({ what: zone.name + ' 소개', reason: '맞지 않는 표현 → 기본 문장' }); mission.intro = ''; }
    if (bins) mission.bins = bins; if (zone.template === 'ride') { mission.vehicle = String(o.vehicle || '자전거').slice(0, 6); mission.goal = String(o.goal || '목적지').slice(0, 8); }
    var chain = (Array.isArray(o.chain) ? o.chain : []).map(function (s) { return String(s || '').trim().slice(0, 18); }).filter(function (s) { return s && !unsafe(s) && !SCARY.test(s); }).slice(0, 3);
    if (chain.length >= 2) mission.chain = chain; else dropped.push({ what: zone.name + ' 효과 사슬', reason: '3단계 사슬이 없어 템플릿 기본 사슬 사용' });
    return { mission: mission, dropped: dropped };
  });
}

/* ---------------- D. 문제 ---------------- */
var SCH_QUIZ = { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['ox', 'choice'] }, q: S_STR, options: { type: 'array', items: S_STR }, answer: S_STR, explain: S_STR, hint: S_STR, ev: S_STR, quote: S_STR }, required: ['type', 'q', 'answer', 'explain', 'hint', 'ev', 'quote'] } } }, required: ['questions'] };
function normOX(a) { var s = String(a == null ? '' : a).trim().toLowerCase(); if (/^(o|○|◯|맞|true|yes|참|예)/.test(s)) return 'O'; if (/^(x|×|✕|틀|false|no|거짓|아니)/.test(s)) return 'X'; return ''; }
function verifyItem(raw, cards, lv, others) {
  var CARD = {}; cards.forEach(function (c) { CARD[c.id] = c; });
  var it = {}, maxLen = MAXLEN[lv];
  if (!raw || typeof raw !== 'object') return { ok: false, reason: '형식이 아님' };
  var nOpts = Array.isArray(raw.options) ? raw.options.filter(function (o) { return String(o || '').trim(); }).length : 0;
  it.type = nOpts >= 3 ? 'choice' : (normOX(raw.answer) ? 'ox' : (/choice|객관|보기/.test(String(raw.type || '')) ? 'choice' : 'ox'));
  it.q = String(raw.q || raw.question || '').trim(); if (!it.q) return { ok: false, reason: '문제 문장 없음' };
  if (it.q.length > maxLen) return { ok: false, reason: '학년에 비해 문장이 너무 김(' + it.q.length + '자)' };
  if (it.type === 'ox') { it.answer = normOX(raw.answer); if (!it.answer) return { ok: false, reason: 'OX 정답 표시가 이상함' }; if (!oxStatement(it.q)) return { ok: false, reason: 'OX인데 맞다/아니다로 답할 수 없는 질문' }; }
  else {
    var opts = (raw.options || []).map(function (o) { return String(o || '').replace(/^\s*[①②③④1-4][.)]\s*/, '').trim(); }).filter(Boolean);
    if (opts.length < 3) return { ok: false, reason: '보기가 3개보다 적음' }; opts = opts.slice(0, 3);
    if (opts.filter(function (o, i) { return opts.indexOf(o) === i; }).length < 3) return { ok: false, reason: '보기가 겹침' };
    var a = raw.answer; if (typeof a === 'string' && !/^\d$/.test(a.trim())) a = opts.indexOf(a.trim()); a = parseInt(a, 10);
    if (!(a >= 0 && a <= 2)) return { ok: false, reason: '정답 번호가 이상함' }; it.options = opts; it.answer = a;
  }
  it.ev = String(raw.ev || '').toUpperCase().trim(); var card = CARD[it.ev];
  if (!card) return { ok: false, reason: '근거 카드 번호가 없거나 다른 마을 카드(' + (raw.ev || '없음') + ')' };
  var quote = String(raw.quote || '').trim(); if (!quote) return { ok: false, reason: '근거 문장을 적지 않음' };
  if (!quoteIn(quote, card.text)) return { ok: false, reason: '근거 문장이 카드에 없음(지어냈을 수 있음)' };
  if (coverage(it.q + ' ' + (it.type === 'choice' ? it.options[it.answer] : ''), card.text) < 0.15) return { ok: false, reason: '문제와 근거 카드의 관련이 약함' };
  it.explain = String(raw.explain || '').trim() || card.text; it.hint = String(raw.hint || '').trim();
  var all = [it.q, it.explain, it.hint].concat(it.options || []); for (var i = 0; i < all.length; i++) if (all[i] && unsafe(all[i])) return { ok: false, reason: '학생에게 맞지 않는 표현' };
  if (SCARY.test(it.q + it.explain)) return { ok: false, reason: '겁주는 표현' };
  if (!kidTone(it.q)) return { ok: false, reason: '"~요" 말투가 아님' };
  for (var j = 0; j < others.length; j++) if (dice(it.q, others[j]) > 0.82) return { ok: false, reason: '이미 낸 문제와 거의 같음' };
  it.quote = quote; return { ok: true, item: it };
}
function stageQuiz(zone, cards, lv, n, others, rep) {
  rep('quiz', 'start', { note: zone.name + ' · ' + PK.LEVELS.find(function (l) { return l.id === lv; }).label });
  var zc = cards.filter(function (c) { return c.zone === zone.id; }); if (!zc.length) zc = cards.slice(0, 4);
  var msgs = [
    { role: 'system', content: '너는 학생 교육 퀴즈를 만드는 다정한 선생님이야.\n반드시 [근거 카드]에 적힌 사실만으로 문제를 만들어. 카드에 없는 사실·숫자·이름은 절대 지어내지 마.\n대상: ' + LEVEL_DESC[lv] + '\n규칙:\n- 문제 ' + n + '개. OX 문제와 3지선다 문제를 섞어.' + (lv === 1 ? ' (어리니까 OX를 더 많이)' : '') + '\n- 문제 문장은 ' + (MAXLEN[lv] - 10) + '자 이내, 학생에게 말하듯 "~요" 체. OX 문제는 "~요."로 끝나는 설명 문장(묻는 말 금지).\n- 문제마다 서로 다른 근거 카드를 써서 골고루 내.\n- 겁주는 표현 금지. 3지선다 오답은 그럴듯하되 위험한 행동을 권하지 마. 정답 위치를 골고루 섞어.\n- 각 문제마다 근거 카드 번호(ev)와 그 카드에서 글자 그대로 옮겨 적은 짧은 근거 구절(quote, 10~30자)을 넣어.\n- OX 문제는 options를 비워 두고 answer에 "O" 또는 "X". 3지선다는 options에 보기 3개, answer에 정답 번호(0,1,2).\n- explain: 정답 해설 1~2문장. hint: 틀렸을 때 생각을 돕는 한 문장(정답을 바로 말하지 말 것).\n- 카드 문장을 그대로 문제로 쓰지 말고, 학생 생활 장면으로 바꿔서 물어봐.\nJSON 객체만 출력: {"questions":[{"type":"ox","q":"...","answer":"O","explain":"...","hint":"...","ev":"C1","quote":"..."},{"type":"choice","q":"...","options":["...","...","..."],"answer":1,"explain":"...","hint":"...","ev":"C2","quote":"..."}]}' },
    { role: 'user', content: '[근거 카드]\n' + cardsBlock(zc) + '\n\n문제 ' + n + '개를 JSON으로 만들어 줘.' }
  ];
  return call('quiz', msgs, { json: true, schema: SCH_QUIZ, temperature: 0.6, maxTokens: 1800 }).then(function (t) {
    var o = parseJSON(t), arr = (o && (o.questions || o.items)) || []; if (!Array.isArray(arr)) throw new Error('문제 결과를 읽지 못함');
    var ok = [], dropped = [], qs = others.slice();
    arr.forEach(function (raw) { var v = verifyItem(raw, zc, lv, qs); if (v.ok) { ok.push(v.item); qs.push(v.item.q); } else dropped.push({ what: String((raw && (raw.q || raw.question)) || '(빈 문제)').slice(0, 50), reason: v.reason }); });
    return { items: ok.map(function (it, i) { return Object.assign(it, { zone: zone.id, level: lv }); }), dropped: dropped };
  });
}
var SCH_CHECK = { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, ok: { type: 'boolean' }, why: S_STR }, required: ['n', 'ok', 'why'] } } }, required: ['results'] };
function stageCross(items, cards, rep) {
  if (!items.length) return Promise.resolve({ items: items, dropped: [] });
  rep('cross', 'start', { note: items.length + '문제' });
  var CARD = {}; cards.forEach(function (c) { CARD[c.id] = c; });
  var lines = items.map(function (it, i) { return (i + 1) + '. 문제: ' + it.q + '\n   정답: ' + (it.type === 'ox' ? it.answer : it.options[it.answer] + ' (보기: ' + it.options.join(' / ') + ')') + '\n   근거 카드: ' + CARD[it.ev].text; }).join('\n');
  var msgs = [{ role: 'system', content: '너는 학생 교육 퀴즈 검수자야. 각 문제마다 ① 정답이 근거 카드 내용으로 뒷받침되는지 ② 정답이 하나뿐인지 ③ 학생에게 안전하고 다정한 표현인지 판단해. 하나라도 아니면 ok는 false. 모든 번호에 대해 답해. JSON 객체 하나만 출력: {"results":[{"n":1,"ok":true,"why":"짧은 이유"}]}' }, { role: 'user', content: lines }];
  return call('cross', msgs, { json: true, schema: SCH_CHECK, temperature: 0, maxTokens: 900 }).then(function (t) {
    var o = parseJSON(t), arr = (o && (o.results || o.items)) || []; if (!Array.isArray(arr)) return { items: items, dropped: [], note: '검토 결과를 읽지 못해 1차 검사만 적용' };
    var bad = {}, seen = {}; arr.forEach(function (r) { if (!r) return; var k = (r.n | 0) - 1; seen[k] = 1; if (r.ok === false || r.ok === 'false') bad[k] = String(r.why || '검토에서 탈락'); });
    var keep = [], dropped = []; items.forEach(function (it, i) { if (bad[i] != null) dropped.push({ what: it.q, reason: 'AI 교차 검토: ' + bad[i] }); else if (!seen[i]) dropped.push({ what: it.q, reason: 'AI 교차 검토 결과가 빠짐' }); else keep.push(it); });
    return { items: keep, dropped: dropped };
  }, function (e) { return { items: items, dropped: [], note: '교차 검토 생략(' + e.message + ')' }; });
}

/* ---------------- E. 오답 설명 ---------------- */
var SCH_WRONG = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, wrong: { type: 'object' } }, required: ['n', 'wrong'] } } }, required: ['items'] };
function stageWrong(zone, items, cards, rep) {
  if (!items.length) return Promise.resolve({ dropped: [] });
  rep('wrong', 'start', { note: zone.name + ' · ' + items.length + '문제' });
  var CARD = {}; cards.forEach(function (c) { CARD[c.id] = c; });
  var lines = items.map(function (it, i) { var ws = it.type === 'ox' ? [it.answer === 'O' ? 'X' : 'O'] : [0, 1, 2].filter(function (k) { return k !== it.answer; }); return (i + 1) + '. 문제: ' + it.q + (it.options ? ' / 보기: ' + it.options.map(function (o, k) { return k + ')' + o; }).join(' ') : '') + ' / 정답: ' + (it.type === 'ox' ? it.answer : it.answer) + ' / 설명이 필요한 오답: ' + ws.join(', ') + ' / 근거: ' + CARD[it.ev].text; }).join('\n');
  var msgs = [{ role: 'system', content: '너는 학생이 틀린 이유에 맞춰 다시 설명해 주는 다정한 선생님(마스코트)이야. 각 문제의 오답마다, 학생이 그 답을 고른 마음을 먼저 인정하고("그렇게 생각할 수도 있어!") 근거 내용으로 2문장 안에 쉽게 다시 설명해. 다정한 반말, 근거에 없는 사실 금지, 겁주는 말 금지, 이모지·호칭 금지.\nJSON 객체만 출력: {"items":[{"n":1,"wrong":{"X":"...","O":"..."}},{"n":2,"wrong":{"0":"...","2":"..."}}]} (키는 오답 표시: OX면 "O"/"X", 3지선다면 보기 번호 "0","1","2")' }, { role: 'user', content: lines }];
  return call('wrong', msgs, { json: true, schema: SCH_WRONG, temperature: 0.5, maxTokens: 2200 }).then(function (t) {
    var o = parseJSON(t), arr = (o && o.items) || []; var dropped = [];
    if (!Array.isArray(arr)) return { dropped: [{ what: zone.name, reason: '오답 설명 결과를 읽지 못함 → 기본 힌트 사용' }] };
    arr.forEach(function (r) {
      var it = items[(r.n | 0) - 1]; if (!it || !r.wrong || typeof r.wrong !== 'object') return;
      Object.keys(r.wrong).forEach(function (k) {
        var txt = String(r.wrong[k] || '').trim(), key = it.type === 'ox' ? normOX(k) : String(parseInt(k, 10));
        if (!key || key === 'NaN') return; if (it.type === 'ox' ? key === it.answer : +key === it.answer) return;
        var rr = S.checkOutput(txt, 230);
        if (!rr.ok || !kidTone(rr.text) || SCARY.test(rr.text) || coverage(rr.text, CARD[it.ev].text + ' ' + it.explain + ' ' + it.q) < 0.15 || flipped(it.explain, rr.text)) { dropped.push({ what: it.q.slice(0, 30) + ' 오답 ' + key, reason: !rr.ok ? '맞지 않는 표현' : '근거와 멀거나 뜻이 어긋남 → 기본 힌트' }); return; }
        it.wrong = it.wrong || {}; it.wrong[key] = rr.text;
      });
    });
    return { dropped: dropped };
  }, function (e) { return { dropped: [{ what: zone.name, reason: '오답 설명 생략(' + e.message + ') → 기본 힌트' }] }; });
}

/* ---------------- F. 수업 ---------------- */
var SCH_LESSONS = { type: 'object', properties: { lessons: { type: 'array', items: { type: 'object', properties: { ev: S_STR, intro: S_STR, example: S_STR, tryIt: S_STR }, required: ['ev', 'intro', 'example', 'tryIt'] } } }, required: ['lessons'] };
function stageLessons(zone, cards, lv, mascot, rep) {
  var zc = cards.filter(function (c) { return c.zone === zone.id; }); if (!zc.length) return Promise.resolve({ lessons: {}, dropped: [] });
  rep('lessons', 'start', { note: zone.name + ' · ' + PK.LEVELS.find(function (l) { return l.id === lv; }).label });
  var msgs = [{ role: 'system', content: '너는 학생용 체험관의 마스코트 "' + (mascot.name || '친구') + '"야. 다정한 반말로 학생에게 짧은 수업을 해 줘.\n대상: ' + LEVEL_DESC[lv] + '\n[근거 카드]마다 수업 하나: intro(이게 무엇인지 쉬운 말로 2문장), example(학생이 집·학교에서 겪을 만한 장면으로 예 2문장), tryIt(오늘 집에서 해 볼 작은 실천 1가지 + 이유 1문장. 밖이나 전기 기구를 다루면 "보호자와 함께"). 카드에 없는 사실·숫자는 보태지 마. 인사말·호칭·이모지 금지.\nJSON 객체만 출력: {"lessons":[{"ev":"C1","intro":"...","example":"...","tryIt":"..."}]}' }, { role: 'user', content: '[근거 카드]\n' + cardsBlock(zc) }];
  return call('lessons', msgs, { json: true, schema: SCH_LESSONS, temperature: 0.6, maxTokens: 2600 }).then(function (t) {
    var o = parseJSON(t), arr = (o && (o.lessons || o.items)) || []; var out = {}, dropped = []; if (!Array.isArray(arr)) return { lessons: out, dropped: [{ what: zone.name, reason: '수업 결과를 읽지 못함 → 카드로 배우기' }] };
    var CARD = {}; zc.forEach(function (c) { CARD[c.id] = c; });
    arr.forEach(function (L) {
      var card = CARD[String(L.ev || '').toUpperCase()]; if (!card) return; var ok = {}, n = 0;
      [['intro', 0.3], ['example', 0.15], ['tryIt', 0.12]].forEach(function (p) { var r = S.checkOutput(L[p[0]] || '', 220); if (r.ok && kidTone(r.text) && !SCARY.test(r.text) && coverage(r.text, card.text + ' ' + card.title) >= p[1]) { ok[p[0]] = r.text; n++; } else dropped.push({ what: card.title + ' ' + p[0], reason: !r.ok ? '맞지 않는 표현' : '근거 카드와 멀어서 카드 문장으로' }); });
      if (n) out[card.id] = ok;
    });
    return { lessons: out, dropped: dropped };
  }, function (e) { return { lessons: {}, dropped: [{ what: zone.name, reason: '수업 생략(' + e.message + ')' }] }; });
}

/* ---------------- G. 실천 카드 ---------------- */
var SCH_ACTIONS = { type: 'object', properties: { actions: { type: 'array', items: { type: 'object', properties: { ev: S_STR, text: S_STR, why: S_STR }, required: ['ev', 'text', 'why'] } } }, required: ['actions'] };
function stageActions(cards, rep) {
  rep('actions', 'start');
  var msgs = [{ role: 'system', content: '학생이 오늘 집에서 혼자(또는 보호자와 함께) 안전하게 할 수 있는 작은 실천 카드를 8~12개 만들어. 반드시 [근거 카드] 내용에 맞는 실천이어야 해. text는 40자 이내 실천 문장("~해 보기"), why는 왜 좋은지 한 문장("~니까요"). ev에 근거 카드 id. 겁주는 말 금지.\nJSON 객체만 출력: {"actions":[{"ev":"C1","text":"...","why":"..."}]}' }, { role: 'user', content: '[근거 카드]\n' + cardsBlock(cards) }];
  return call('actions', msgs, { json: true, schema: SCH_ACTIONS, temperature: 0.7, maxTokens: 1400 }).then(function (t) {
    var o = parseJSON(t), arr = (o && (o.actions || o.items)) || []; var out = [], dropped = []; var CARD = {}; cards.forEach(function (c) { CARD[c.id] = c; });
    (Array.isArray(arr) ? arr : []).forEach(function (a) {
      var card = CARD[String(a.ev || '').toUpperCase()], text = String(a.text || '').trim(), why = String(a.why || '').trim();
      if (!card || !text) { dropped.push({ what: text.slice(0, 30), reason: '근거 카드 번호가 없음' }); return; }
      if (text.length > 60 || unsafe(text) || unsafe(why) || SCARY.test(text + why)) { dropped.push({ what: text.slice(0, 30), reason: '너무 길거나 맞지 않는 표현' }); return; }
      if (coverage(text + ' ' + why, card.text) < 0.12) { dropped.push({ what: text.slice(0, 30), reason: '근거 카드와 관련이 약함' }); return; }
      out.push({ ev: card.id, zone: card.zone, text: text, why: why });
    });
    return { actions: out.slice(0, 12), dropped: dropped };
  }, function (e) { return { actions: [], dropped: [{ what: '실천 카드', reason: '생략(' + e.message + ')' }] }; });
}

/* ---------------- 전체 실행 ---------------- */
var STAGES = [['cards', 'A. 근거 카드 추출'], ['design', 'B. 마을·친구 설계'], ['mission', 'C. 체험 미션'], ['quiz', 'D. 학년별 문제'], ['cross', 'D-2. AI 교차 검토'], ['wrong', 'E. 오답별 다시 설명'], ['lessons', 'F. 학년별 수업'], ['actions', 'G. 실천 카드']];
function run(opt, onProgress) {
  opt = Object.assign({ levels: [1, 2, 3, 4], perZone: 6, cross: true, wrong: true, lessons: true, cardMax: 28 }, opt || {});
  if (!REPLAY && !ready()) return Promise.reject(new Error('AI 모델이 연결되어 있지 않아요. 설정에서 연결하거나 "기록 재생"을 쓰세요.'));
  LOG = []; aborter = new AbortController();
  var report = { stages: {}, started: Date.now() }, cur = null;
  function rep(stage, status, detail) {
    var r = report.stages[stage] = report.stages[stage] || { asked: 0, passed: 0, dropped: [], calls: 0, ms: 0, note: '' };
    if (status === 'start') { cur = { stage: stage, t0: Date.now() }; r.calls++; }
    if (status === 'done' && cur && cur.stage === stage) { r.ms += Date.now() - cur.t0; }
    if (detail && detail.note && status === 'start') r.note = detail.note;
    onProgress && onProgress({ stage: stage, status: status, detail: detail, report: report });
  }
  function tally(stage, passed, dropped, asked) { var r = report.stages[stage]; r.passed += passed; r.asked += asked != null ? asked : passed + dropped.length; r.dropped = r.dropped.concat(dropped); rep(stage, 'done'); }
  var pack = { v: 1, title: opt.title || opt.topic || '체험관', subtitle: opt.subtitle || '', org: opt.org || '', topic: opt.topic || opt.title || '', zones: [], cards: [], bank: [], lessons: {}, actions: [], seeds: [], meta: { made: new Date().toISOString().slice(0, 10), by: 'maker', model: REPLAY ? (REPLAY.model || '기록 재생') : (loadCfg().model || loadCfg().provider), approved: false, source: { title: opt.title, chars: (opt.source || '').length }, levels: opt.levels } };
  var cards, zones;
  return stageCards(opt.source, opt, rep).then(function (r) {
    cards = r.cards; tally('cards', cards.length, r.dropped);
    return stageDesign(cards, { topic: pack.topic, org: pack.org }, rep);
  }).then(function (d) {
    cards = d.cards; zones = d.zones; pack.cards = cards; pack.hub = d.hub; pack.mascot = d.mascot; pack.suggest = d.suggest; tally('design', 4, d.dropped, 4);
    pack.lead = (d.hub.name || '주인공') + '가 힘들어해요! 마을 친구들과 직접 체험하며 도와주세요.';
    var seq = Promise.resolve();
    zones.forEach(function (z) { seq = seq.then(function () { return stageMission(z, cards, pack, rep).then(function (m) { z.mission = m.mission; tally('mission', m.mission.spots.length, m.dropped); }); }); });
    return seq;
  }).then(function () {
    pack.zones = zones.map(function (z) { var o = Object.assign({}, z); delete o.cardIds; return o; });
    var seq = Promise.resolve(), all = [];
    zones.forEach(function (z) { opt.levels.forEach(function (lv) { seq = seq.then(function () { return stageQuiz(z, cards, lv, opt.perZone, all.map(function (q) { return q.q; }), rep).then(function (q) { all = all.concat(q.items); tally('quiz', q.items.length, q.dropped); }); }); }); });
    return seq.then(function () { return all; });
  }).then(function (all) {
    if (!opt.cross || !all.length) return all;
    var seq = Promise.resolve(), kept = [];
    zones.forEach(function (z) { var mine = all.filter(function (q) { return q.zone === z.id; }); if (!mine.length) return; seq = seq.then(function () { return stageCross(mine, cards, rep).then(function (r) { kept = kept.concat(r.items); tally('cross', r.items.length, r.dropped); if (r.note) report.stages.cross.note = r.note; }); }); });
    return seq.then(function () { return kept; });
  }).then(function (all) {
    all.forEach(function (q, i) { q.id = 'q' + (i + 1); }); pack.bank = all;
    if (!opt.wrong) return;
    var seq = Promise.resolve();
    zones.forEach(function (z) { var mine = all.filter(function (q) { return q.zone === z.id; }); seq = seq.then(function () { return stageWrong(z, mine, cards, rep).then(function (r) { tally('wrong', mine.reduce(function (s, q) { return s + Object.keys(q.wrong || {}).length; }, 0), r.dropped); }); }); });
    return seq;
  }).then(function () {
    if (!opt.lessons) return;
    var seq = Promise.resolve();
    zones.forEach(function (z) { opt.levels.forEach(function (lv) { seq = seq.then(function () { return stageLessons(z, cards, lv, pack.mascot, rep).then(function (r) { Object.keys(r.lessons).forEach(function (cid) { pack.lessons[cid] = pack.lessons[cid] || {}; pack.lessons[cid][lv] = r.lessons[cid]; }); tally('lessons', Object.keys(r.lessons).length, r.dropped); }); }); }); });
    return seq;
  }).then(function () {
    return stageActions(cards, rep).then(function (r) { pack.actions = r.actions; tally('actions', r.actions.length, r.dropped); });
  }).then(function () {
    // 씨앗 상식: 마을마다 골고루
    var seeds = [], byZone = {}; cards.forEach(function (c) { (byZone[c.zone] = byZone[c.zone] || []).push(c.id); });
    for (var i = 0; seeds.length < 12 && i < 12; i++) Object.keys(byZone).forEach(function (zid) { if (byZone[zid][i] && seeds.length < 12) seeds.push(byZone[zid][i]); });
    pack.seeds = seeds;
    pack.zones.forEach(function (z) { var sp = z.mission.spots.find(function (s) { return s.say; }); z.game = { title: z.mission.title + ' 놀이', fact: sp ? sp.say : z.greet }; });
    report.ms = Date.now() - report.started; report.calls = LOG.length;
    var p = PK.normalize(pack); p.meta = pack.meta; p.meta.approved = false;
    return { pack: p, report: report, log: { v: 1, model: pack.meta.model, made: pack.meta.made, title: pack.title, opt: { levels: opt.levels, perZone: opt.perZone, cross: opt.cross, wrong: opt.wrong, lessons: opt.lessons }, source: opt.source, entries: LOG } };
  });
}
function replay(log, opt, onProgress) {
  var by = {}; (log.entries || []).forEach(function (e) { (by[e.stage] = by[e.stage] || []).push(e); });
  REPLAY = { byStage: by, model: log.model, delay: opt && opt.delay };
  var o = Object.assign({}, log.opt || {}, opt || {}, { source: log.source });
  return run(o, onProgress).then(function (r) { REPLAY = null; r.replayed = true; return r; }, function (e) { REPLAY = null; throw e; });
}
function abort() { if (aborter) aborter.abort(); }

window.GQGen = { loadCfg: loadCfg, saveCfg: saveCfg, ready: ready, test: test, run: run, replay: replay, abort: abort, STAGES: STAGES, LOG: function () { return LOG; }, _v: { verifyItem: verifyItem, flipped: flipped, grounded: grounded, quoteIn: quoteIn } };
})();
