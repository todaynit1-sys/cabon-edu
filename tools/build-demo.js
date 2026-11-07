/*! 메이커 공개시연판 만들기 — maker.html과 CSS·JS를 한 파일로 묶습니다.
 *  claude.ai에 게시하면 보는 사람의 Claude(내장 연결)로 생성하므로 API 키가 필요 없습니다.
 *  사용: node tools/build-demo.js <출력 경로.html> [체험관 주소]
 *        체험관 주소 기본값: https://cabon-edu.vercel.app/index.html
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2]; if (!OUT) { console.error('usage: node tools/build-demo.js <out.html> [appUrl]'); process.exit(1); }
const APP = process.argv[3] || 'https://cabon-edu.vercel.app/index.html';
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const safeJs = (s) => s.replace(/<\/(script)/gi, '<\\/$1');

let html = read('maker.html');
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));

// 외부 스크립트(cdnjs)는 그대로, 우리 스크립트는 안에 넣기
const scripts = [...body.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
let markup = body.replace(/<script src="[^"]+"><\/script>\s*/g, '');
markup = markup.replace('href="index.html" target="_blank"', 'href="' + APP + '" target="_blank" rel="noopener"');

const css = read('css/maker.css') + `
/* 공개시연판: 한 가지 밝은 화면 · 휴대폰 안전 영역 */
:root { color-scheme: light; }
body { background: #f4f1ea; padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px); }
.top { top: env(safe-area-inset-top, 0px); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: #fff; }
#btnExport, #btnSaveLog, .opts:has(#inReplay) { display: none !important; } /* 시연판 화면에서는 파일 내려받기가 막혀 있어 숨김 */
.demo-note { margin: 0 0 12px; padding: 10px 14px; border-radius: 12px; background: #effae9; border: 1px solid #b8e3a8; color: #24414a; font-size: 14px; }
`;
markup = markup.replace('<section class="card" id="s1">', '<p class="demo-note">✨ 이 공개시연판은 <b>여러분의 Claude</b>로 생성해서 API 키가 필요 없어요. 처음 만들 때 한 번 사용 동의를 물어봐요. 다 만든 체험관은 새 탭(' + APP.replace(/^https?:\/\//, '').replace(/\/index\.html$/, '') + ')에서 3D로 열려요.</p>\n<section class="card" id="s1">');

let js = '<script>window.GQ_AI_DEFAULT = { provider: "claude-artifact", preset: "artifact", baseUrl: "claude.ai", model: "Claude", tier: "quick", timeoutSec: 300 };\nwindow.GQ_APP_URL = ' + JSON.stringify(APP) + ';</script>\n';
scripts.forEach((src) => {
  if (/^https?:/.test(src)) js += '<script src="' + src + '"></script>\n';
  else js += '<script>/* ' + src + ' */\n' + safeJs(read(src)) + '\n</script>\n';
});

const out = '<title>AI 체험 마을 메이커</title>\n<meta name="description" content="교육자료를 넣으면 AI가 학생용 3D 체험관을 만들고, 담당자가 검토·승인해 발행하는 도구">\n<style>\n' + css + '\n</style>\n' + markup.trim() + '\n' + js;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log('wrote', OUT, (out.length / 1024).toFixed(0) + 'KB', 'scripts:', scripts.length);
