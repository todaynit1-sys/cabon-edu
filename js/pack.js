/*! 체험관 팩 — 불러오기 · 저장 · 검사
 *
 *  팩(JSON) 하나가 체험관 하나입니다. 메이커가 만들고, 아이용 체험관이 읽습니다.
 *  불러오는 순서: ?pack=<주소>(JSON 파일) → ?pack=<id>(이 기기에 저장된 팩) → #p=<압축 팩>(링크에 담긴 팩) → 기본 팩
 */
(function () {
'use strict';

var GRADES = [
  { id: 0, label: '초등 저학년', sub: '1~3학년', level: 1, maxLen: 44 },
  { id: 1, label: '초등 고학년', sub: '4~6학년', level: 2, maxLen: 60 },
  { id: 2, label: '중학생', sub: '1~3학년', level: 3, maxLen: 76 },
  { id: 3, label: '고등학생', sub: '1~3학년', level: 4, maxLen: 90 }
];
var LEVELS = [
  { id: 1, label: '초등 저학년', desc: '7~9살. 짧고 쉬운 문장, 생활 장면 중심, 어려운 한자어는 쉬운 말로.' },
  { id: 2, label: '초등 고학년', desc: '10~12살. 개념 낱말을 쉽게 풀어서, 예시와 이유를 함께.' },
  { id: 3, label: '중학생', desc: '13~15살. 원리와 이유, 자료에 있는 수치를 함께. 유치하지 않게.' },
  { id: 4, label: '고등학생', desc: '16~18살. 원리·수치·사회적 영향까지. 존중하는 말투("~해요"), 아이 취급 금지.' }
];
var TPL_ORDER = ['switch', 'sort', 'plant', 'ride'];
var TPL_INFO = {
  switch: { name: '바로잡기', icon: '💡', desc: '마당 거실 같은 곳에서 잘못 켜진·열린 것을 하나씩 바로잡아요 (끄기·뽑기·닫기·맞추기)', colors: ['#f2b93b', '#e0a21c'] },
  sort: { name: '줍고 분류하기', icon: '♻️', desc: '섬에 떨어진 물건을 주워 들고 와서 알맞은 칸에 넣어요', colors: ['#4aa3df', '#2f86c4'] },
  plant: { name: '심고 가꾸기', icon: '🌳', desc: '빈자리에 심거나 놓으면 자라나요', colors: ['#5cb85c', '#3e9b4f'] },
  ride: { name: '타고 가기', icon: '🚲', desc: '탈것을 타고 체크포인트를 지나 목적지까지 가요', colors: ['#e8735a', '#d8603f'] }
};
var ANIMALS = ['rabbit', 'raccoon', 'squirrel', 'puppy', 'bear'];
var ANIMAL_EMOJI = { rabbit: '🐰', raccoon: '🦝', squirrel: '🐿️', puppy: '🐶', bear: '🐻‍❄️' };
var LS_KEY = 'gq.packs';

function slug(s) { return String(s || 'pack').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pack'; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* 빠진 값 채우고 모양을 맞춤 (메이커 결과·오래된 팩 모두) */
function normalize(p) {
  p = JSON.parse(JSON.stringify(p || {}));
  p.v = 1; p.id = p.id || slug(p.title) + '-' + uid();
  p.title = p.title || '체험관'; p.subtitle = p.subtitle || ''; p.org = p.org || ''; p.topic = p.topic || p.title;
  p.lead = p.lead || (p.hub && p.hub.name ? p.hub.name + '가 힘들어해요! 마을 친구들과 직접 체험하며 도와주세요.' : '마을 친구들과 직접 체험하며 배워요.');
  var H = p.hub = Object.assign({ name: '동글이', title: '아기 지구 동글이', place: p.title + ' 광장', meter: '지구 열', cloud: '뭉게',
    states: { hot: '아주 뜨거워요', warm: '아직 뜨거워요', mild: '시원해지고 있어요', cool: '건강해졌어요!' },
    intro0: '친구들 마을에서 직접 체험하면 내가 건강해져! 도와줄래?', introMid: '조금 나아졌어! 남은 마을은 {n}곳이야. 조금만 더 힘내 줘!',
    introDone: '고마워! 네 덕분에 다 나았어! 오늘 배운 걸 집에서도 해 볼래?', finaleTitle: '다 나았어요!', finaleText: '마을이 깨끗해지고 모두가 웃어요.',
    homework: '오늘의 숙제', cert: '지킴이 수료증', certBody: '위 학생은 {title}에서 {zones} 체험을 모두 마쳤기에 이 수료증을 드립니다.' }, p.hub || {});
  H.states = Object.assign({ hot: '아주 뜨거워요', warm: '아직 뜨거워요', mild: '시원해지고 있어요', cool: '건강해졌어요!' }, H.states || {});
  p.mascot = Object.assign({ name: '얼음이', animal: 'bear', color: '#4aa3df', hi: '안녕! 궁금한 걸 물어봐!', lines: ['뭐 하고 놀까?', '궁금한 거 있으면 물어봐!'] }, p.mascot || {});
  if (ANIMALS.indexOf(p.mascot.animal) < 0) p.mascot.animal = 'bear';
  p.suggest = Array.isArray(p.suggest) ? p.suggest.slice(0, 8) : [];
  p.cards = (p.cards || []).map(function (c, i) { return { id: c.id || ('C' + (i + 1)), zone: c.zone || 'earth', title: c.title || ('카드 ' + (i + 1)), keys: c.keys || '', text: c.text || '' }; }).filter(function (c) { return c.text; });
  var cardIds = {}; p.cards.forEach(function (c) { cardIds[c.id] = 1; });
  var used = {};
  p.zones = (p.zones || []).slice(0, 4).map(function (z, i) {
    var tpl = TPL_INFO[z.template] ? z.template : TPL_ORDER.filter(function (t) { return !used[t]; })[0] || 'switch';
    if (used[tpl]) tpl = TPL_ORDER.filter(function (t) { return !used[t]; })[0] || tpl; used[tpl] = 1;
    var m = z.mission || {};
    var spots = (m.spots || []).map(function (s, k) {
      var o = { id: s.id || (z.id || 'z' + i) + '-' + (k + 1), label: s.label || ('할 일 ' + (k + 1)), say: s.say || '', ev: cardIds[s.ev] ? s.ev : '' };
      if (s.act) o.act = s.act; if (s.prop) o.prop = s.prop; if (s.bin) o.bin = s.bin; if (s.ring) o.ring = true; if (s.ask && s.ask.q && s.ask.options) o.ask = s.ask; if (s.effect) o.effect = s.effect; if (s.co2 && +s.co2.kg >= 0) o.co2 = { kg: +s.co2.kg || 0, times: +s.co2.times || 1, per: s.co2.per || "", basis: s.co2.basis || "" };
      return o;
    });
    if (tpl === 'ride') { // 탈것 1 + 고리 n (마지막은 목적지)
      if (!spots.length || !spots.some(function (s) { return !s.ring; })) spots.unshift({ id: (z.id || 'z' + i) + '-v', label: m.vehicle || '탈것', act: '🚲 타기', say: '출발!', ev: '' });
      spots = spots.slice(0, 6); spots.forEach(function (s, k) { s.ring = k > 0; delete s.act; if (k === 0) s.act = s.act || '🚲 타기'; });
    } else spots = spots.slice(0, 6);
    var mission = { title: m.title || (TPL_INFO[tpl].name + ' 체험'), icon: m.icon || TPL_INFO[tpl].icon, unit: m.unit || TPL_INFO[tpl].name, intro: m.intro || '노란 화살표를 따라가서 직접 해 봐!', spots: spots };
    if (tpl === 'sort') {
      mission.bins = (m.bins || []).map(function (b) { return typeof b === 'string' ? { id: b, icon: '📦', name: b } : (Array.isArray(b) ? { id: b[0], icon: b[1], name: b[2] } : { id: b.id || b.name, icon: b.icon || '📦', name: b.name || b.id }); }).slice(0, 6);
      if (!mission.bins.length) mission.bins = [{ id: 'a', icon: '📦', name: '가' }, { id: 'b', icon: '🧺', name: '나' }];
      spots.forEach(function (s) { if (!mission.bins.some(function (b) { return b.id === s.bin; })) s.bin = mission.bins[0].id; });
    }
    if (tpl === 'ride') { mission.vehicle = m.vehicle || '자전거'; mission.goal = m.goal || '목적지'; }
    // 효과 사슬: 행동 → 바로 생기는 변화 → 최종 효과 (체험 뒤 "그래서 지구는?"에 보여 줌)
    var chainDef = { switch: ['✅ 바로잡아요', '⚡ 에너지를 아껴요', '🌍 ' + H.meter + ' ↓'], sort: ['♻️ 알맞게 모아요', '🔁 다시 쓸 수 있어요', '🌍 ' + H.meter + ' ↓'], plant: ['🌱 심고 가꿔요', '🌿 자연이 되살아나요', '🌍 ' + H.meter + ' ↓'], ride: ['🚲 직접 움직여요', '💨 배출을 줄여요', '🌍 ' + H.meter + ' ↓'] }[tpl];
    mission.chain = (Array.isArray(m.chain) ? m.chain : []).map(function (s) { return String(s || '').trim().slice(0, 18); }).filter(Boolean).slice(0, 3);
    if (mission.chain.length < 2) mission.chain = chainDef;
    return { id: z.id || ('z' + (i + 1)), name: z.name || ('마을 ' + (i + 1)), short: z.short || (z.name || '마을').slice(0, 6), friend: z.friend || '친구', animal: ANIMALS.indexOf(z.animal) >= 0 ? z.animal : ANIMALS[i % 4],
      color: z.color || TPL_INFO[tpl].colors[0], icon: z.icon || TPL_INFO[tpl].icon, topic: z.topic || z.name || '', greet: z.greet || '안녕! 같이 해 볼래?', cleared: z.cleared || '우리 마을이 깨끗해졌어! 고마워!',
      template: tpl, mission: mission, game: z.game || null };
  });
  while (p.zones.length < 4) { var t = TPL_ORDER.filter(function (x) { return !used[x]; })[0]; used[t] = 1; p.zones.push(normalize({ zones: [{ id: 'z' + (p.zones.length + 1), template: t }] }).zones[0]); }
  var zoneIds = {}; p.zones.forEach(function (z) { zoneIds[z.id] = 1; });
  p.cards.forEach(function (c) { if (!zoneIds[c.zone] && c.zone !== 'earth') c.zone = 'earth'; });
  p.bank = (p.bank || []).map(function (b, i) {
    var o = { id: b.id || ('q' + (i + 1)), zone: zoneIds[b.zone] ? b.zone : (p.zones[0] || {}).id, level: [1, 2, 3, 4].indexOf(+b.level) >= 0 ? +b.level : 1, type: b.type === 'choice' ? 'choice' : 'ox', q: b.q || '', answer: b.answer, ev: cardIds[b.ev] ? b.ev : '', explain: b.explain || '', hint: b.hint || '' };
    if (o.type === 'choice') { o.options = (b.options || []).slice(0, 3); o.answer = +b.answer; } else o.answer = String(b.answer).toUpperCase() === 'X' ? 'X' : 'O';
    if (b.wrong && typeof b.wrong === 'object') o.wrong = b.wrong;
    return o;
  }).filter(function (b) { return b.q && (b.type === 'ox' || (b.options && b.options.length === 3 && b.answer >= 0 && b.answer <= 2)); });
  p.lessons = (p.lessons && typeof p.lessons === 'object') ? p.lessons : {};
  p.actions = (p.actions || []).map(function (a) { return { ev: cardIds[a.ev] ? a.ev : '', zone: a.zone || '', text: a.text || '', why: a.why || '' }; }).filter(function (a) { return a.text; });
  p.seeds = (p.seeds || []).filter(function (id) { return cardIds[id]; }).slice(0, 12);
  while (p.seeds.length < 12 && p.cards.length) { var c = p.cards[p.seeds.length % p.cards.length]; if (p.seeds.indexOf(c.id) < 0) p.seeds.push(c.id); else break; }
  p.meta = Object.assign({ made: new Date().toISOString().slice(0, 10), by: 'maker', model: null, approved: false }, p.meta || {});
  return p;
}
function validate(p) {
  var errs = [];
  if (!p || !p.zones || p.zones.length !== 4) errs.push('마을이 4곳이어야 해요');
  if (!p.cards || p.cards.length < 4) errs.push('근거 카드가 4장보다 적어요');
  (p.zones || []).forEach(function (z) { if (!z.mission || !z.mission.spots || z.mission.spots.length < 3) errs.push(z.name + ': 체험 할 일이 3개보다 적어요'); });
  if (!p.bank || p.bank.length < 4) errs.push('문제가 4개보다 적어요');
  return errs;
}

/* 이 기기에 저장된 팩 */
function readAll() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; } }
function writeAll(m) { try { localStorage.setItem(LS_KEY, JSON.stringify(m)); return true; } catch (e) { return false; } }
function save(p) { var m = readAll(); m[p.id] = p; return writeAll(m); }
function remove(id) { var m = readAll(); delete m[id]; writeAll(m); }
function get(id) { return readAll()[id] || null; }
function list() { var m = readAll(); return Object.keys(m).map(function (k) { var p = m[k]; return { id: k, title: p.title, subtitle: p.subtitle, org: p.org, made: p.meta && p.meta.made, zones: (p.zones || []).length, cards: (p.cards || []).length }; }); }

/* 링크에 팩 담기 (lz-string) */
function encodeLink(p, appUrl) {
  var base = appUrl || (location.origin + location.pathname.replace(/[^/]*$/, '') + 'index.html');
  if (!window.LZString) return base + '?pack=' + encodeURIComponent(p.id);
  return base + '#p=' + LZString.compressToEncodedURIComponent(JSON.stringify(p));
}
function decodeHash() {
  var m = location.hash.match(/#p=([^&]+)/); if (!m || !window.LZString) return null;
  try { return JSON.parse(LZString.decompressFromEncodedURIComponent(m[1])); } catch (e) { return null; }
}
function download(p) {
  var blob = new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (p.id || 'pack') + '.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
var DEFAULT_ID = 'green-carbon';
function defaultPack() { var ps = window.GQ_PACKS || {}; return ps[DEFAULT_ID] || ps[Object.keys(ps)[0]] || null; }

/* 아이용 체험관이 어떤 팩을 열지 정함 */
function load() {
  var q = new URLSearchParams(location.search).get('pack');
  var fromHash = decodeHash();
  if (fromHash) return Promise.resolve({ pack: normalize(fromHash), source: 'link' });
  if (q && /^https?:\/\//.test(q)) return fetch(q).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) { return { pack: normalize(j), source: 'url' }; }).catch(function (e) { return { pack: normalize(defaultPack()), source: 'default', error: '팩 주소를 열지 못해 기본 체험관을 열었어요 (' + e.message + ')' }; });
  if (q && q !== DEFAULT_ID) { var lp = get(q); if (lp) return Promise.resolve({ pack: normalize(lp), source: 'local' }); return Promise.resolve({ pack: normalize(defaultPack()), source: 'default', error: '이 기기에 저장된 팩이 아니에요: ' + q }); }
  return Promise.resolve({ pack: normalize(defaultPack()), source: 'default' });
}

window.GQPack = { GRADES: GRADES, LEVELS: LEVELS, TPL_ORDER: TPL_ORDER, TPL_INFO: TPL_INFO, ANIMALS: ANIMALS, ANIMAL_EMOJI: ANIMAL_EMOJI, DEFAULT_ID: DEFAULT_ID,
  normalize: normalize, validate: validate, save: save, remove: remove, get: get, list: list, load: load, defaultPack: defaultPack, encodeLink: encodeLink, download: download, slug: slug, uid: uid };
})();
