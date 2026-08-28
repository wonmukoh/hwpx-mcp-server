/**
 * `hp:switch` 안의 `hp:case` / `hp:default` — **어느 쪽이 진짜인가.**
 *
 * paraPr 의 여백·줄간격은 두 갈래에 두 번 들어 있다.
 * 문서 161편을 세어 보니 `default = case × 2` 였다.
 * 하지만 어느 쪽이 진짜인지는 세어서 알 수 없다. 한글에게 물어야 한다.
 *
 * 여기서 하는 일:
 *   1. 일부러 짝이 안 맞는 값을 넣고 한글이 저장한 것을 본다  → 어느 쪽을 읽나
 *   2. 한글 API 에 여백을 물어본다                          → 어느 쪽 값을 말하나
 *   3. 옛 MCP 처럼 양쪽에 같은 값을 넣어 본다                 → 무슨 일이 나나
 *
 *   node 검증/문단여백단위.mjs
 *
 * 경로에 한글을 넣지 않는다 — PowerShell 이 경로를 깨뜨린다.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);

const { HwpxContainer } = await import(
  pathToFileURL(path.join(뿌리, '검증', '.빌드hwpx', 'index.js')).href
);
const { parseXml, serializeXml, findAll, childrenNamed, setAttr } = await import(
  pathToFileURL(path.join(뿌리, '검증', '.빌드', 'index.js')).href
);

const 무대 = path.join(os.tmpdir(), 'hwpx-unit');
fs.rmSync(무대, { recursive: true, force: true });
fs.mkdirSync(무대, { recursive: true });

const 원본 = path.join(뿌리, '자료', '기준파일', 'ref-blank.hwpx');

/** paraPr#0 의 왼쪽 여백을 두 갈래에 각각 넣어 파일을 만든다 */
function 만들기(파일이름, case값, default값) {
  const c = HwpxContainer.open(fs.readFileSync(원본));
  const doc = parseXml(c.readText('Contents/header.xml'));
  const p = findAll(doc.root, 'hh:paraPr').find((x) => x.attrs.find((a) => a.name === 'id')?.raw === '0');
  const sw = childrenNamed(p, 'hp:switch')[0];
  for (const [가지, v] of [['hp:case', case값], ['hp:default', default값]]) {
    const m = childrenNamed(childrenNamed(sw, 가지)[0], 'hh:margin')[0];
    setAttr(childrenNamed(m, 'hc:left')[0], 'value', String(v));
  }
  c.writeText('Contents/header.xml', serializeXml(doc));
  const 낸것 = path.join(무대, 파일이름);
  fs.writeFileSync(낸것, c.save());
  return 낸것;
}

/** 한글에게 열게 하고, API 가 말하는 여백과 다시 저장한 XML 을 본다 */
function 한글에게(파일) {
  const 저장본 = 파일.replace(/\.hwpx$/, '-saved.hwpx');
  const ps = [
    "$ErrorActionPreference='Continue'",
    '$hwp = New-Object -ComObject HWPFrame.HwpObject',
    'try { $hwp.RegisterModule("FilePathCheckDLL","FilePathCheckerModule") | Out-Null } catch {}',
    'try {',
    `  if (-not $hwp.Open('${파일}', "", "forceopen:true")) { throw "open fail" }`,
    '  $act = $hwp.CreateAction("ParagraphShape")',
    '  $set = $act.CreateSet()',
    '  $act.GetDefault($set) | Out-Null',
    '  Write-Output ("LeftMargin ||| " + $set.Item("LeftMargin"))',
    `  if (Test-Path '${저장본}') { Remove-Item '${저장본}' -Force }`,
    `  $hwp.SaveAs('${저장본}', "HWPX", "") | Out-Null`,
    '} catch { Write-Output ("THROW ||| " + $_.Exception.Message) }',
    'finally { try { $hwp.Clear(1) | Out-Null } catch {}; try { $hwp.Quit() | Out-Null } catch {} }',
  ].join('\n');
  const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    { encoding: 'buffer', timeout: 180_000 }).toString('utf8');

  const m = /LeftMargin \|\|\| (-?\d+)/.exec(out);
  const api = m ? Number(m[1]) : null;

  let 뒤 = null;
  if (fs.existsSync(저장본)) {
    const c = HwpxContainer.open(fs.readFileSync(저장본));
    const doc = parseXml(c.readText('Contents/header.xml'));
    const p = findAll(doc.root, 'hh:paraPr').find((x) => x.attrs.find((a) => a.name === 'id')?.raw === '0');
    const sw = childrenNamed(p, 'hp:switch')[0];
    const 값 = (가지) => {
      const mm = childrenNamed(childrenNamed(sw, 가지)[0], 'hh:margin')[0];
      return Number(childrenNamed(mm, 'hc:left')[0].attrs.find((a) => a.name === 'value')?.raw);
    };
    뒤 = { case: 값('hp:case'), default: 값('hp:default') };
  }
  return { api, 뒤 };
}

const 실험 = [
  ['case 만 크게',        9000, 1000],
  ['default 만 크게',     1000, 9000],
  ['옛 MCP 처럼 똑같이',  2835, 2835],
  ['case = default / 2',  2835, 5670],
];

console.log('넣은 값 → 한글이 말하는 여백 / 한글이 다시 쓴 값\n');
const 줄 = [];
for (const [이름, c값, d값] of 실험) {
  const 파일 = 만들기(`m-${실험.findIndex((x) => x[0] === 이름)}.hwpx`, c값, d값);
  const { api, 뒤 } = 한글에게(파일);
  줄.push([이름, c값, d값, api, 뒤]);
  console.log(`  ${이름}`);
  console.log(`    넣은 것        case=${c값}  default=${d값}`);
  console.log(`    한글 API 여백  ${api}`);
  console.log(`    한글이 다시 쓴 것  case=${뒤?.case}  default=${뒤?.default}\n`);
}

// ── 규칙이 맞는지 스스로 확인한다 ─────────────────────────────────────────
const 탈 = [];
for (const [이름, c값, , api, 뒤] of 줄) {
  if (api !== c값 * 2) 탈.push(`${이름}: API 가 case×2 (${c값 * 2}) 가 아니라 ${api} 라고 한다`);
  if (뒤 && 뒤.case !== c값) 탈.push(`${이름}: 한글이 case 를 ${c값} → ${뒤.case} 로 바꿨다`);
  if (뒤 && 뒤.default !== c값 * 2) 탈.push(`${이름}: 한글이 default 를 case×2 로 안 썼다 (${뒤.default})`);
}

console.log('═'.repeat(60));
if (탈.length) {
  console.log('규칙이 안 맞는다:');
  for (const t of 탈) console.log('  ✗ ' + t);
  process.exit(1);
}
console.log('규칙 확인:');
console.log('  · 한글은 **hp:case 를 읽는다.** default 는 case × 2 로 다시 쓴다');
console.log('  · 한글 API(HWPUNIT)가 말하는 값 = hp:default = hp:case × 2');
console.log('  → 여백 V HWPUNIT 를 주려면  hp:default = V,  hp:case = V / 2');
console.log('  → 양쪽에 같은 값을 넣으면 **두 배**가 된다 (옛 MCP 가 그랬다)');
