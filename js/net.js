/*! AI 탄소중립 체험실 — 같이 하기(여럿이 함께) 통신 계층
 *
 *  모두 "내 상태(presence)"를 서로 나누는 방식 하나로 동작합니다: 위치·캐릭터·별명·마지막 채팅·따라가기.
 *   - claude.ai 공개시연판: 플랫폼의 room 기능 (서버·계정 없이, 같은 링크를 연 사람끼리)
 *   - 그 밖(Vercel·내 PC): 공개 MQTT 중계 서버(WebSocket) — 「푸른하늘 업무체험관」(mamo-ex2)과 같은 방식, 시연용
 *  개인정보는 보내지 않습니다(별명·채팅은 화면에서 거르고 보냄).
 */
(function () {
'use strict';
var MY = Math.random().toString(36).slice(2, 10);
var BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
var MQTT_URL = 'https://cdn.jsdelivr.net/npm/mqtt@5.15.2/dist/mqtt.esm.js';
var S = { on: false, mode: '', me: {}, peers: {}, o: null, client: null, bi: 0, timer: 0, lastSend: 0, lastKey: '', room: null, unsub: null, st: 'off' };

function status(st) { S.st = st; if (S.o && S.o.onStatus) S.o.onStatus(st); }
function emitPeers() { if (S.o && S.o.onPeers) S.o.onPeers(S.peers); }
function clean(p) { // 받은 상태는 모양만 확인 (내용은 화면에서 한 번 더 거름)
  if (!p || typeof p !== 'object') return null;
  var x = Number(p.x), z = Number(p.z); if (!isFinite(x) || !isFinite(z)) return null;
  return { n: String(p.n || '친구').slice(0, 10), x: Math.max(-40, Math.min(40, x)), z: Math.max(-40, Math.min(40, z)), h: Number(p.h) || 0, l: p.l && typeof p.l === 'object' ? p.l : {}, c: p.c && typeof p.c === 'object' ? { t: Number(p.c.t) || 0, m: String(p.c.m || '').slice(0, 60) } : null, e: p.e && typeof p.e === 'object' ? { t: Number(p.e.t) || 0, k: String(p.e.k || '').slice(0, 8), to: String(p.e.to || '').slice(0, 24) } : null, f: typeof p.f === 'string' ? p.f.slice(0, 24) : '', r: !!p.r, g: p.g && typeof p.g === 'object' ? { t: Number(p.g.t) || 0, k: String(p.g.k || '').slice(0, 8), z: String(p.g.z || '').slice(0, 24), s: String(p.g.s || '').slice(0, 32) } : null };
}

/* ---------- claude.ai room ---------- */
function roomStart(room) {
  S.mode = 'room';
  var go = function (r) {
    S.room = r;
    S.unsub = r.onPeers(function (ch) {
      var m = {}; (ch.peers || []).forEach(function (p) { if (p.sameTab) { S.myPeer = p.peer; return; } if (p.kind !== 'viewer') return; var c = clean(p.presence); if (c) { c.id = p.peer; m[p.peer] = c; } });
      S.peers = m; emitPeers(); status('on');
    }, function () { status('off'); });
    r.presence(S.me).catch(function () {});
    status('on');
  };
  var name = (S.o.room || '').trim();
  if (name && name !== 'lobby' && room.join) room.join(name.slice(0, 40)).then(go, function () { go(room); }); else go(room);
}

/* ---------- MQTT (mamo-ex2 방식) ---------- */
function topic() { return 'cabon-edu/v1/' + String(S.o.pack || 'pack').replace(/[^\w-]/g, '').slice(0, 24) + '/' + String(S.o.room || 'lobby').replace(/[^\w가-힣-]/g, '').slice(0, 24); }
function mqttStart() {
  S.mode = 'mqtt'; status('wait');
  import(MQTT_URL).then(function (mod) { var lib = mod.default || mod; S.lib = typeof lib.connect === 'function' ? lib : lib.default; if (!S.lib) throw new Error('no mqtt'); connect(); }, function () { status('off'); });
}
function connect() {
  if (!S.on) return;
  var url = BROKERS[S.bi % BROKERS.length], T = topic(), c;
  try { c = S.lib.connect(url, { clientId: 'gq_' + MY + '_' + S.bi, clean: true, keepalive: 30, reconnectPeriod: 0, connectTimeout: 7000, will: { topic: T + '/l', payload: JSON.stringify({ id: MY }), qos: 0, retain: false } }); } catch (e) { retry(false); return; }
  S.client = c; var ok = false;
  c.on('connect', function () { if (S.client !== c) return; ok = true; c.subscribe(T + '/#', { qos: 0 }); status('on'); send(true); try { c.publish(T + '/j', JSON.stringify({ id: MY })); } catch (e) {} });
  c.on('message', function (tp, buf) {
    var m; try { m = JSON.parse(new TextDecoder().decode(buf)); } catch (e) { return; }
    if (!m || typeof m.id !== 'string' || m.id === MY || m.id.length > 16) return;
    var type = tp.slice(T.length + 1);
    if (type === 's') { var cl = clean(m.p); if (!cl) return; cl.id = m.id; cl.seen = Date.now(); var isNew = !S.peers[m.id]; if (isNew && Object.keys(S.peers).length >= 24) return; S.peers[m.id] = cl; emitPeers(); }
    else if (type === 'l') { if (S.peers[m.id]) { delete S.peers[m.id]; emitPeers(); } }
    else if (type === 'j') { S.lastKey = ''; send(true); }
  });
  var fail = function () { if (S.client !== c) return; S.client = null; try { c.end(true); } catch (e) {} retry(ok); };
  c.on('close', fail); c.on('error', fail); c.on('offline', fail);
}
function retry(wasOk) { if (!S.on) return; S.bi++; status('wait'); setTimeout(function () { if (S.on && !S.client) connect(); }, wasOk ? 2500 : 900); }
function send(force) {
  if (S.mode === 'room') { if (S.room) S.room.presence(S.me).catch(function () {}); return; }
  var c = S.client; if (!c || !c.connected) return;
  var key = JSON.stringify(S.me), now = Date.now();
  if (!force && key === S.lastKey && now - S.lastSend < 2500) return;
  S.lastKey = key; S.lastSend = now;
  try { c.publish(topic() + '/s', JSON.stringify({ id: MY, p: S.me }), { qos: 0 }); } catch (e) {}
}
function sweep() { if (S.mode !== 'mqtt') return; var now = Date.now(), ch = false; Object.keys(S.peers).forEach(function (id) { if (now - (S.peers[id].seen || 0) > 9000) { delete S.peers[id]; ch = true; } }); if (ch) emitPeers(); }

/* ---------- 공개 함수 ---------- */
function start(o) {
  if (S.on) return; S.on = true; S.o = o || {}; S.peers = {}; status('wait');
  S.timer = setInterval(function () { send(false); sweep(); }, 250);
  if (window.claude && window.claude.use) window.claude.use('room').then(function (room) { if (room) roomStart(room); else mqttStart(); }, mqttStart);
  else mqttStart();
}
var lastRoomSend = 0, roomPending = 0;
function update(patch) {
  Object.assign(S.me, patch);
  if (S.mode === 'room' && S.room) { // room은 초당 횟수가 정해져 있어 위치는 0.2초에 한 번만
    var now = Date.now(); clearTimeout(roomPending);
    if (now - lastRoomSend > 200 || patch.c || patch.e || patch.g || 'f' in patch) { lastRoomSend = now; S.room.presence(patch).catch(function () {}); }
    else roomPending = setTimeout(function () { lastRoomSend = Date.now(); S.room.presence(S.me).catch(function () {}); }, 220);
  }
}
function stop() {
  if (!S.on) return; S.on = false; clearInterval(S.timer); clearTimeout(roomPending);
  if (S.mode === 'room') { try { if (S.unsub) S.unsub(); if (S.room && S.room.leave) S.room.leave(); else if (S.room) S.room.presence({ n: null, x: null, z: null }); } catch (e) {} }
  var c = S.client; S.client = null; if (c) { try { c.publish(topic() + '/l', JSON.stringify({ id: MY })); c.end(true); } catch (e) {} }
  S.peers = {}; emitPeers(); status('off');
}
addEventListener('pagehide', function () { if (S.on && S.client) { try { S.client.publish(topic() + '/l', JSON.stringify({ id: MY })); } catch (e) {} } });
window.GQNet = { start: start, update: update, stop: stop, id: function () { return S.mode === 'room' ? (S.myPeer || '') : MY; }, mode: function () { return S.mode; }, status: function () { return S.st; }, on: function () { return S.on; } };
})();
