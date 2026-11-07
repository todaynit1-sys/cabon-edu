/*! AI 탄소중립 체험실 공개시연판 만들기 — index.html과 CSS·JS·기본 팩을 한 파일로 묶습니다.
 *  claude.ai에 게시하면 보는 사람의 Claude(내장 연결)로 AI 선생님·탄소 코치·맞춤 설명이 켜집니다(API 키 없음).
 *  사용: node tools/build-lab.js <출력 경로.html> [메이커 주소]
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2]; if (!OUT) { console.error('usage: node tools/build-lab.js <out.html> [makerUrl]'); process.exit(1); }
const MAKER = process.argv[3] || 'https://cabon-edu.vercel.app/maker.html';
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const safeJs = (s) => s.replace(/<\/(script)/gi, '<\\/$1');

const html = read('index.html');
let body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
const local = [];
body = body.replace(/<script src="([^"]+)"><\/script>\s*/g, (m, src) => {
  if (/^https?:/.test(src)) return m;
  local.push(src); return '<!--@@' + src + '@@-->\n';
});
const cfg = '<script>window.GQ_AI_DEFAULT = { provider: "claude-artifact", baseUrl: "claude.ai", model: "Claude", tier: "quick" };\nwindow.GQ_MAKER_URL = ' + JSON.stringify(MAKER) + ';</script>\n';
let first = true;
body = body.replace(/<!--@@([^@]+)@@-->\n/g, (m, src) => { const pre = first ? cfg : ''; first = false; return pre + '<script>/* ' + src + ' */\n' + safeJs(read(src)) + '\n</script>\n'; });

const css = read('css/app.css') + '\n' + read('css/fun.css') + `
/* 공개시연판: 인쇄·파일 저장은 이 화면에서 막혀 있어 숨김 */
#fabPhoto, [data-act="print"], [data-act="cert"] { display: none !important; }
:root { color-scheme: light; }
`;
const out = '<title>AI 탄소중립 체험실</title>\n<meta name="description" content="3D 마을에서 직접 체험하고 AI 선생님·AI 탄소 코치와 내 탄소를 재고 줄이는 학생용 환경교육">\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&display=swap">\n<style>\n' + css + '\n</style>\n' + body.trim() + '\n';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log('wrote', OUT, (out.length / 1024).toFixed(0) + 'KB', 'inlined:', local.join(', '));
