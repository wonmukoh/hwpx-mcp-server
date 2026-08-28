/**
 * **내놓을 채비가 됐나** — `npm publish` 하기 전에 걸리는 것들.
 *
 * 저장소 안에서는 다 멀쩡해 보이는데 짜서 올리면 깨지는 것들이 있다.
 *
 *   - README 가 가리키는 문서가 **짠 것에 안 담겨** npm 페이지에서 링크가 다 깨진다.
 *     실제로 그랬다 — 여덟 개가 빠져 있었다.
 *   - `license` 가 없으면 npm 이 경고를 내고, 쓰는 쪽은 **써도 되는지 알 수 없다.**
 *   - `bin` 이 가리키는 파일이 짠 것에 없으면 `npx hwpx-mcp` 가 죽는다.
 *
 * `꾸러미시험.mjs` 는 **짜서 깔아 돌려 보는** 것이고, 이쪽은 **내놓기 전 서류**를 본다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
process.chdir(뿌리);

const 꾸러미 = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const 탈 = [];
const 알림 = [];   // 막지는 않되 알려는 주는 것

/**
 * 짤 때 담기는 파일들.
 *
 * `--json` 을 쓴다. 사람이 읽는 목록은 **stderr 로 나가서** 그냥 받으면 빈손이 된다 —
 * 처음에 그렇게 짰다가 「담기는 파일 0개」 를 보고 알았다.
 */
function 담길것() {
  const 글 = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--dry-run', '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: true });
  const 목 = JSON.parse(글)[0];
  return {
    것들: new Set((목.files ?? []).map((f) => String(f.path).split('\\').join('/'))),
    바이트: 목.unpackedSize ?? 0,
  };
}

const { 것들: 담긴것, 바이트: 푼크기 } = 담길것();
console.log(`짠 것에 담기는 파일 ${담긴것.size}개`);
if (담긴것.size === 0) 탈.push('짠 것에 담기는 파일이 하나도 없다 — 재는 법이 틀렸나 보라');

// ── 1) README 가 가리키는 문서가 다 담기나 ──────────────────────────────
{
  const 글 = fs.readFileSync('README.md', 'utf8');
  const 가리킨것 = [...new Set(
    [...글.matchAll(/\]\(([^)#]+\.md)\)/g)].map((m) => m[1]),
  )].filter((p) => !p.startsWith('http'));
  const 빠진것 = 가리킨것.filter((p) => !담긴것.has(p));
  console.log(`  README 가 가리키는 문서 ${가리킨것.length}개 · 안 담긴 것 ${빠진것.length}개`);
  for (const p of 빠진것) 탈.push(`README 가 가리키는 ${p} 가 짠 것에 없다 — 깐 사람이 못 연다`);

  // **꾸러미에 담긴 것과 npm 페이지에서 눌리는 것은 다르다.**
  // npm 은 상대 링크를 `repository` 기준으로 푼다. 없으면
  // `npmjs.com/package/기획/06-계획.md` 같은 없는 주소가 된다.
  // 실제로 0.4.0 을 올리고 나서야 페이지에서 13개가 죽어 있는 걸 봤다.
  if (가리킨것.length && !꾸러미.repository) {
    알림.push(`README 에 상대 링크 ${가리킨것.length}개가 있는데 repository 가 없다`
      + ' — 파일은 꾸러미에 담기지만 **npm 페이지에서는 죽은 링크**가 된다');
  }
}

// ── 2) 서류가 다 있나 ───────────────────────────────────────────────────
//
// **없으면 못 내놓는 것**과 **없어도 되는 것**을 가른다.
// 둘을 섞어 다 막으면, 막힌 사람이 검사를 통째로 꺼 버린다.
for (const [키, 왜, 막나] of [
  ['name', '이름이 없으면 못 올린다', true],
  ['version', '판 번호가 없으면 못 올린다', true],
  ['description', 'npm 목록에 한 줄도 안 뜬다', true],
  // 이것만은 막는다 — 라이선스가 없으면 **남이 써도 되는지 알 수가 없다.**
  // npm 은 경고만 하고 올려 준다. 그래서 여기서 막는다.
  ['license', '쓰는 쪽이 **써도 되는지 알 수 없다**', true],
  ['author', '누가 만든 것인지 안 적힌다', false],
  ['repository', '소스를 어디서 보는지 안 적힌다', false],
]) {
  const v = 꾸러미[키];
  if (v !== undefined && v !== null && v !== '') continue;
  (막나 ? 탈 : 알림).push(`package.json 에 ${키} 가 없다 — ${왜}`);
}

// ── 3) bin 이 가리키는 것이 담기나 ─────────────────────────────────────
for (const [이름, 길] of Object.entries(꾸러미.bin ?? {})) {
  const 상대 = String(길).replace(/^\.\//, '');
  if (!담긴것.has(상대)) 탈.push(`bin '${이름}' 이 가리키는 ${상대} 가 짠 것에 없다 — npx 가 죽는다`);
  else if (!fs.existsSync(상대)) 탈.push(`bin '${이름}' 이 가리키는 ${상대} 가 아예 없다`);
}

// ── 4) 짠 것 크기 — 시험 자료가 딸려 들어가면 여기서 부푼다 ────────────
{
  const KB = Math.round(푼크기 / 1024);
  console.log(`  푼 크기 ${KB}KB`);
  // 표본 문서(4.9MB)나 기준파일(431KB)이 딸려 들어가면 바로 넘는다
  if (KB > 1024) 탈.push(`푼 크기가 ${KB}KB 다 — 시험 자료가 딸려 들어갔나 보라`);
}

console.log('');
for (const a of 알림) console.log(`  · ${a}`);
if (알림.length) console.log('');

if (탈.length === 0) {
  console.log(`탈 없음 — ${꾸러미.name}@${꾸러미.version} 내놓을 채비가 됐다`);
  process.exit(0);
}
console.log(`탈 ${탈.length}건`);
for (const t of 탈) console.log(`  ✗ ${t}`);
process.exit(1);
