/**
 * 검증을 한 번에 돌린다.
 *
 *   node 검증/전부.mjs            시험 + 넓은 훑기 (한글 없이 돈다)
 *   node 검증/전부.mjs --한글      한글 수용 시험까지 (한글이 깔려 있어야 한다)
 *
 * 통과 못 한 것이 하나라도 있으면 0이 아닌 값으로 끝난다.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
process.chdir(뿌리);

const 한글까지 = process.argv.includes('--한글');

// ── 훑을 문서 목록을 그때그때 만든다 (묵은 목록을 쓰면 조용히 0편이 된다) ──
const 문서폴더 = [
  path.join(뿌리, '자료', '기준파일'),
  path.join(뿌리, '자료', '표본', '공개'),
  path.join(뿌리, '자료', '표본', '로컬'),
  path.join(os.homedir(), 'OneDrive', '문서'),
  path.join(os.homedir(), 'OneDrive', '바탕 화면'),
];
function 긁기(d, 깊이 = 3) {
  if (깊이 < 0 || !fs.existsSync(d)) return [];
  let 나온것 = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) 나온것 = 나온것.concat(긁기(p, 깊이 - 1));
    else if (e.name.toLowerCase().endsWith('.hwpx')) 나온것.push(p);
  }
  return 나온것;
}
const 문서들 = [...new Set(문서폴더.flatMap((d) => 긁기(d)))];
const 목록파일 = path.join(os.tmpdir(), 'hwpx-훑기목록.txt');
fs.writeFileSync(목록파일, 문서들.join('\n'), 'utf8');
console.log(`훑을 문서 ${문서들.length}편을 모았다\n`);

const 할일 = [
  ['꾸러미 굽기', process.execPath, [path.join('검증', '빌드.mjs')]],
  // **배포용(dist)도 여기서 굽는다.** 안 그러면 검증이 다 통과해도 dist 가 묵는다 —
  // `꾸러미시험` 은 dist 를 짜서 파일이 있나만 보지 **언제 구운 것인지는 안 본다.**
  // 실제로 겪었다: 도구 셋을 고치고 검증을 다 돌렸는데,
  // dist 를 물고 있던 쪽은 옛 동작을 그대로 보고 있었다.
  ['배포용 굽기 (dist)', process.execPath, [path.join('검증', '빌드.mjs'), '--배포']],
  ['시험 (vitest)', 'npx', ['vitest', 'run', '--reporter=basic']],
  ['XML 왕복 넓게', process.execPath, [path.join('검증', '왕복훑기.mjs'), 목록파일]],
  ['컨테이너 넓게', process.execPath, [path.join('검증', '컨테이너훑기.mjs'), 목록파일]],
  ['표 검사 넓게', process.execPath, [path.join('검증', '표훑기.mjs'), 목록파일]],
  // 시험이 **돌긴 도는데 아무것도 안 재는** 꼴인지 본다.
  // 고장내보기보다 먼저 — 헛도는 시험은 고장을 내도 안 잡힌다.
  ['헛도는 시험 훑기', process.execPath, [path.join('검증', '헛도는시험.mjs')]],
  // 시험이 정말 무언가를 보고 있나 — 일부러 고장 내서 확인한다
  ['고장 내보기', process.execPath, [path.join('검증', '고장내보기.mjs')]],
  // 진입점이 **순수 node 로** 떠서 stdio 로 말하는가 (Draftsmith 가 그렇게 띄운다)
  ['서버 (순수 node + stdio)', process.execPath, [path.join('검증', '서버시험.mjs')]],
];
// 기능 감사 — **무동작 1건이면 빌드가 깨진다**. 한글이 없어도 돈다.
할일.push(['기능 감사 (무동작)', process.execPath, [path.join('검증', '기능감사.mjs')]]);
// 기능표 — 우리가 지금 무엇을 할 수 있나. **없는 기능은 탈이 아니다.**
// 도구가 "됐다" 했는데 파일에 안 들어간 것만 빌드를 깬다.
할일.push(['기능표 (도구로 직접 해 보기)', process.execPath, [path.join('검증', '기능표.mjs')]]);
// 짜서 남의 폴더에 깔았을 때도 도나. 저장소 안 시험이 못 잡는 것을 잡는다.
할일.push(['꾸러미 (짜서 깔아 보기)', process.execPath, [path.join('검증', '꾸러미시험.mjs')]]);
// 세 클라이언트가 각자 두드리는 대로 두드려 본다. 하나에서만 도는 서버는 못 쓴다.
할일.push(['세 클라이언트', process.execPath, [path.join('검증', '세클라이언트.mjs')]]);

// 내놓기 전에 걸리는 것 — 짠 것에 안 담긴 문서, 없는 라이선스, 죽는 bin.
// `prepublishOnly` 에도 박혀 있다. 여기서는 **미리** 알려 준다.
할일.push(['내놓을 채비', process.execPath, [path.join('검증', '내놓을채비.mjs')]]);
if (한글까지) {
  할일.push(['한글이 받아들이나 (규격·컨테이너)', process.execPath, [path.join('검증', '한글수용시험.mjs')]]);
  할일.push(['한글이 받아들이나 (문서 계층)', process.execPath, [path.join('검증', '문서층수용시험.mjs')]]);
  할일.push(['문단 여백 단위', process.execPath, [path.join('검증', '문단여백단위.mjs')]]);
  할일.push(['셀 여백 단위', process.execPath, [path.join('검증', '셀여백단위.mjs')]]);
  // 조판은 규격·왕복·시각 세 겹을 한 번에 본다
  할일.push(['조판 (한글 + 눈으로)', process.execPath, [path.join('검증', '조판수용시험.mjs')]]);
  // 4단계 합격 기준 — 진짜 정부 문서 한 쪽을 compose 한 번으로 재현하고 자로 댄다
  할일.push(['교육부 6쪽 재현', process.execPath, [path.join('검증', '교육부6쪽.mjs')]]);
  // 남이 준 양식을 열어 고쳤을 때 양식이 빠그라지나 — **픽셀로** 본다.
  // 여기가 실무에서 훨씬 자주 겪는 쪽이다. 조판보다 이쪽이 먼저 안 깨져야 한다.
  할일.push(['양식 채우기 (픽셀 대조)', process.execPath, [path.join('검증', '양식채우기.mjs')]]);
  // **도구만으로** 양식을 채운다 — 모델이 걷는 길. 문서 층을 직접 부르는 시험은
  // 문서 층만 지킨다. 고치는 도구가 통째로 없던 것을 그래서 못 잡았다.
  할일.push(['양식 채우기 (도구만)', process.execPath, [path.join('검증', '양식도구.mjs')]]);
}

const 결과 = [];
for (const [이름, cmd, args] of 할일) {
  console.log(`── ${이름} ${'─'.repeat(Math.max(0, 50 - 이름.length))}`);
  // shell 은 npx 처럼 .cmd 인 것에만 쓴다.
  // node.exe 경로에 공백이 있으면(C:/Program Files/…) shell 이 그걸 끊어 먹는다.
  const 셸필요 = process.platform === 'win32' && !cmd.endsWith('.exe');
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: 셸필요 });
  결과.push([이름, r.status === 0]);
  console.log();
}

console.log('═'.repeat(56));
for (const [이름, 됨] of 결과) console.log(`  ${됨 ? '○' : '✗'} ${이름}`);
if (!한글까지) console.log('  · 한글 수용 시험은 건너뛰었다 (--한글 로 켠다)');

const 망한것 = 결과.filter(([, 됨]) => !됨).length;
process.exit(망한것 ? 1 : 0);
