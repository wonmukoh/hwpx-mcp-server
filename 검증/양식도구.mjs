/**
 * **양식을 MCP 도구만으로 채운다.**
 *
 * `검증/양식채우기.mjs` 와 무엇이 다른가: 그쪽은 **문서 층을 직접** 부른다
 * (`d.글바꾸기(…)`). 이쪽은 **도구만** 쓴다 — 모델이 실제로 걷는 길이다.
 *
 * ## 왜 따로 필요한가
 *
 * 57판 무탈이라고 보고해 놓고 나중에 알았다:
 * **열어 놓은 문서를 고치는 도구가 하나도 없었다.** 문서 층에는 다 있는데
 * 도구 표면에 입구가 없었다. 검증이 문서 층을 직접 부르니 그걸 못 잡았다.
 *
 * 같은 함정을 그날 세 번 밟았다 —
 * `image` 블록이 스키마에 자리가 없어 못 쓰였고,
 * `italic` 을 엉뚱한 중첩에 넣어 막이가 통과시켰고,
 * 이번엔 고치는 길이 통째로 없었다.
 * **문서 층을 부르는 시험은 문서 층만 지킨다.**
 *
 * ## 재는 것
 *
 * Draftsmith 작성 지침이 못박은 차례를 그대로 밟는다:
 *   1. 연다  2. 센다  3. 읽는다  4. 찾는다  5. 채운다  6. 저장한다
 *   7. **다시 세어 처음과 견준다** ← 이게 없으면 그 흐름이 성립하지 않는다
 *
 * 그리고 한글로 PDF 를 구워 **픽셀로** 본다 —
 * 한 곳만 고쳤으면 **그 자리만** 달라져야 한다.
 *
 *   node 검증/양식도구.mjs
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { 파이썬찾기 } from './쪽가르기.mjs';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;

const { 도구부르기, 문서방 } = await import(B('server'));

const 파이썬 = 파이썬찾기();
const 무대 = path.join(os.tmpdir(), 'hwpx-formtools');
fs.rmSync(무대, { recursive: true, force: true });
fs.mkdirSync(무대, { recursive: true });

/**
 * Draftsmith 가 싣고 다니는 기본 양식 셋.
 *
 * **모든 문서가 이 셋 중 하나에서 시작한다.** 이 셋이 안 되면 앱이 안 된다.
 * 없으면 그렇다고 말하고 건너뛴다 — 조용히 빼면 "다 됐다" 는 거짓말이 된다.
 */
const 양식칸 = 'C:/Users/owm21/gemini-studio/vendor/base-forms';
const 양식들 = ['newsletter.hwpx', 'plan.hwpx', 'report.hwpx']
  .map((f) => ({ 이름: f, 길: path.join(양식칸, f) }))
  .filter((x) => fs.existsSync(x.길));

if (양식들.length === 0) {
  console.log(`※ ${양식칸} 에 기본 양식이 없어 건너뛴다`);
  console.log('  (Draftsmith 가 안 깔린 기계다. 이건 실패가 아니다.)');
  process.exit(0);
}

const 탈 = [];
const 줄들 = [];

for (const [i, 양식] of 양식들.entries()) {
  const 원본 = path.join(무대, `f${i}-orig.hwpx`);
  const 고친것 = path.join(무대, `f${i}-edit.hwpx`);
  fs.copyFileSync(양식.길, 원본);
  fs.copyFileSync(양식.길, 고친것);

  줄들.push('');
  줄들.push(`■ ${양식.이름}`);
  const 적기 = (됐나, 말) => {
    줄들.push(`  ${됐나 ? '○' : '✗'} ${말}`);
    if (!됐나) 탈.push(`${양식.이름}: ${말}`);
  };

  const 방 = new 문서방();

  // 1) 연다
  const 열기 = await 도구부르기('open_document', { path: 고친것 }, 방);
  if (열기.isError) { 적기(false, `못 열었다: ${열기.content?.[0]?.text?.slice(0, 60)}`); continue; }
  const d = 열기.structuredContent.doc_id;
  const 처음 = { 문단: 열기.structuredContent.paragraphs, 표: 열기.structuredContent.tables };
  적기(true, `열었다 — 문단 ${처음.문단} · 표 ${처음.표}`);

  // 2~3) 센다 · 읽는다
  const 뼈대 = await 도구부르기('get_outline', { doc_id: d }, 방);
  적기(!뼈대.isError, `뼈대 ${(뼈대.structuredContent?.items ?? []).length}개`);

  // 4) 찾는다 — 바꿀 자리를 글로 찾는다
  const 찾을것 = 'OOO초등학교';
  const 찾기 = await 도구부르기('find', { doc_id: d, text: 찾을것 }, 방);
  const 맞은것 = 찾기.structuredContent?.matches ?? [];
  // 셀이든 문단이든 고칠 수 있다. 셀만 고집하면 양식마다 되고 안 되고가 갈린다 —
  // 실제로 plan·report 는 그 글이 셀이 아니라 문단에 있어서 헛되이 멈췄다.
  const 고칠수있는것 = 맞은것.filter((x) => x.kind === 'cell' || x.kind === 'paragraph');
  적기(고칠수있는것.length > 0,
    `'${찾을것}' 을 ${맞은것.length}곳에서 찾았다`
    + ` (고칠 수 있는 것 ${고칠수있는것.length}: ${[...new Set(고칠수있는것.map((x) => x.kind))].join('·')})`);
  if (고칠수있는것.length === 0) { 적기(false, '고칠 것을 못 찾아 여기서 멈춘다'); continue; }

  // 5) 채운다 — **한 곳만.** 나머지가 그대로인지 보려면 하나만 건드려야 한다
  const 고칠것 = 고칠수있는것[0].id;
  const 고치기 = await 도구부르기('edit', {
    doc_id: d,
    edits: [{ op: 'set_text', id: 고칠것, text: '한빛초등학교' }],
  }, 방);
  적기(!고치기.isError && 고치기.structuredContent?.done === 1,
    고치기.isError ? `못 고쳤다: ${고치기.content?.[0]?.text?.split('\n')[0]?.slice(0, 70)}` : `${고칠것} 한 곳을 고쳤다`);
  if (고치기.isError) continue;

  // 6) 저장한다
  const 저장 = await 도구부르기('save_document', { doc_id: d, path: 고친것, overwrite: true }, 방);
  적기(!저장.isError, 저장.isError ? `저장이 막혔다: ${저장.content?.[0]?.text?.slice(0, 70)}` : '저장했다');
  if (저장.isError) continue;

  // 7) **다시 세어 처음과 견준다** — Draftsmith 지침이 못박은 검산
  const 다시 = await 도구부르기('open_document', { path: 고친것 }, 방);
  const 나중 = { 문단: 다시.structuredContent?.paragraphs, 표: 다시.structuredContent?.tables };
  적기(나중.문단 === 처음.문단 && 나중.표 === 처음.표,
    `다시 세니 문단 ${나중.문단} · 표 ${나중.표}`
    + (나중.문단 === 처음.문단 && 나중.표 === 처음.표 ? ' (처음과 같다)' : ' ← **줄었다. 잘못 지웠다**'));

  // 바꾼 글이 진짜 들어갔나
  const 확인 = await 도구부르기('find', { doc_id: 다시.structuredContent.doc_id, text: '한빛초등학교' }, 방);
  적기((확인.structuredContent?.count ?? 0) > 0, `바꾼 글이 ${확인.structuredContent?.count ?? 0}곳에 보인다`);

  // 7의2) **회신서 표에 줄을 넣는다.**
  //
  // Draftsmith 가 짚어 준 자리다: 「가정통신문 회신서가 실제로 가장 자주 깨지던 곳이다.
  // 줄을 늘리면 절취선이 밀리거나 표가 다음 쪽으로 넘어간다. 여기가 되면 나머지는 대개 된다.」
  // 줄 수를 미리 알 수 없는 표가 이것 말고도 여럿이다 — 예산표·활동사진·세부일정.
  {
    const 표뼈대 = await 도구부르기('get_outline', { doc_id: d, in_tables: true }, 방);
    const 표들 = (표뼈대.structuredContent?.items ?? []).filter((x) => x.kind === 'table');
    if (표들.length === 0) {
      줄들.push('  · 표가 없어 줄 넣기는 건너뛴다');
    } else {
      // 마지막 표가 대개 회신서다 (절취선 아래)
      const 회신서 = 표들[표들.length - 1];
      const 앞쪽수 = 견줄쪽수(고친것);
      const r = await 도구부르기('edit', {
        doc_id: d, edits: [{ op: 'insert_row', id: 회신서.id, count: 2 }],
      }, 방);
      적기(!r.isError, r.isError
        ? `줄을 못 넣었다: ${(r.content?.[0]?.text ?? '').slice(0, 70)}`
        : `${회신서.id} 에 2줄 넣었다 (${회신서.rows}줄 → ${회신서.rows + 2}줄)`);

      if (!r.isError) {
        const s2 = await 도구부르기('save_document', { doc_id: d, path: 고친것, overwrite: true }, 방);
        적기(!s2.isError, s2.isError ? '줄 넣고 저장이 막혔다' : '줄 넣고 저장했다');
        // 줄을 늘렸으니 쪽이 늘 수는 있다. **표가 안 무너지는지**를 본다.
        //
        // **다시 열면 id 가 새로 매겨진다.** 앞의 id 를 그대로 쓰면 못 찾는다 —
        // 이 시험이 처음에 그 실수를 했다. 뼈대를 다시 받아 같은 자리 표를 찾는다.
        const 뒤2 = await 도구부르기('open_document', { path: 고친것 }, 방);
        const 뒤뼈대 = await 도구부르기('get_outline', {
          doc_id: 뒤2.structuredContent.doc_id, in_tables: true,
        }, 방);
        const 뒤표들 = (뒤뼈대.structuredContent?.items ?? []).filter((x) => x.kind === 'table');
        const 뒤회신서 = 뒤표들[뒤표들.length - 1];
        적기(뒤회신서 !== undefined && 뒤회신서.rows === 회신서.rows + 2,
          `다시 열어 보니 ${뒤회신서?.rows ?? '?'}줄`
          + (뒤회신서?.rows === 회신서.rows + 2 ? ' (2줄 늘었다)' : ' ← **줄 수가 안 맞다**'));
        void 앞쪽수;
      }
    }
  }

  // 8) 눈으로 — 줄까지 넣었으니 "한 곳만" 은 아니다. **표가 안 무너졌나**를 본다.
  if (!파이썬) { 줄들.push('  · python 이 없어 픽셀 대조는 건너뛴다'); continue; }
  const 견줌 = 한글로견주기(원본, 고친것, `f${i}`);
  if (견줌 === null) { 적기(false, '한글로 못 구웠다'); continue; }
  // 줄을 넣으면 쪽이 늘 수 있다. 그건 잘못이 아니다 — 두 쪽 넘게 늘면 이상하다.
  적기(견줌.쪽수[1] - 견줌.쪽수[0] <= 1, `쪽 수 ${견줌.쪽수[0]} → ${견줌.쪽수[1]}`);
  // 한 셀만 고쳤으니 1% 를 넘으면 뭔가 더 건드린 것이다
  // 줄을 늘렸으니 아래가 밀린다. 그래도 절반을 넘게 달라지면 뭔가 무너진 것이다.
  적기(견줌.최대비율 <= 0.5,
    `달라진 픽셀 ${(견줌.최대비율 * 100).toFixed(1)}%`
    + (견줌.최대비율 <= 0.5 ? '' : ' ← **너무 많이 달라졌다. 표가 무너졌다**'));
}

/** 쪽 수만 빨리 본다 (아직 안 쓰지만 자리를 남겨 둔다) */
function 견줄쪽수(_길) { return null; }

/** 둘을 한글로 굽고 픽셀로 견준다 */
function 한글로견주기(가, 나, 표) {
  const NL = String.fromCharCode(10);
  const 줄 = ["$ErrorActionPreference='Continue'",
    '$hwp = New-Object -ComObject HWPFrame.HwpObject',
    'try { $hwp.RegisterModule("FilePathCheckDLL","FilePathCheckerModule") | Out-Null } catch {}',
    'try {'];
  for (const [입력, 출력] of [[가, `${가.replace(/\.hwpx$/, '')}.pdf`], [나, `${나.replace(/\.hwpx$/, '')}.pdf`]]) {
    줄.push('  try {');
    줄.push(`    if ($hwp.Open('${입력}', "", "forceopen:true")) { $hwp.SaveAs('${출력}', "PDF", "") | Out-Null }`);
    줄.push('  } catch {}');
    줄.push('  try { $hwp.Clear(1) | Out-Null } catch {}');
  }
  줄.push('} finally { try { $hwp.Quit() | Out-Null } catch {} }');
  const 스크립트 = path.join(무대, `bake-${표}.ps1`);
  // PowerShell 5.1 은 .ps1 을 ANSI 로 읽는다 — BOM 을 붙여야 UTF-8 로 읽는다
  fs.writeFileSync(스크립트, '\uFEFF' + 줄.join(NL), 'utf8');
  try {
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 스크립트],
      { stdio: 'pipe', timeout: 600_000 });
  } catch { return null; }

  const A = `${가.replace(/\.hwpx$/, '')}.pdf`;
  const Bb = `${나.replace(/\.hwpx$/, '')}.pdf`;
  if (!fs.existsSync(A) || !fs.existsSync(Bb)) return null;

  const 낼곳 = path.join(무대, `diff-${표}.json`);
  const r = spawnSync(파이썬, [path.join(여기, '픽셀대조.py'), A, Bb, 낼곳, '100'],
    { encoding: 'utf8', timeout: 900_000 });
  if (r.status !== 0) return null;
  const 잰것 = JSON.parse(fs.readFileSync(낼곳, 'utf8'));
  return { 쪽수: 잰것.쪽수, 최대비율: 잰것.쪽.reduce((a, p) => Math.max(a, p.비율), 0) };
}

// ── 알림 ──────────────────────────────────────────────────────────────────
console.log('양식을 **MCP 도구만으로** 채운다 — 모델이 걷는 길 그대로');
console.log(줄들.join('\n'));
console.log(탈.length ? `\n탈 ${탈.length}건` : `\n탈 없음 — 양식 ${양식들.length}개를 도구만으로 채웠다`);
for (const t of 탈) console.log(`  ✗ ${t}`);
process.exit(탈.length ? 1 : 0);
