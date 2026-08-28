/**
 * `hp:tc/@hasMargin` — 셀 여백이 언제 살아나나.
 *
 * 실측에서 `hasMargin=0` 인 셀 18055개 가운데 5748개가 표 여백과 **다른**
 * `cellMargin` 을 갖고 있었다. 써 놓고 안 쓰이는 것인가, 쓰이는 것인가?
 * 세어서는 알 수 없다. 한글에게 물어야 한다.
 *
 * ## 어떻게 묻나
 *
 * 한글은 저장할 때 줄 조각(`hp:lineseg`)을 **다시 계산한다.**
 * `horzsize` 가 그 셀 안에서 글이 놓일 수 있는 너비다.
 *
 *   horzsize = 셀 너비 − 왼쪽 여백 − 오른쪽 여백
 *
 * 그러니 여백을 크게 주고 한글에게 저장시켜 `horzsize` 를 보면
 * **어느 여백이 쓰였는지** 그대로 드러난다.
 *
 *   node 검증/셀여백단위.mjs
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;

const { HwpxContainer } = await import(B('hwpx'));
const { parseXml, serializeXml, findAll, findFirst, childrenNamed, firstChildNamed, getAttr, setAttr } =
  await import(B('owpml'));

// 경로에 한글을 넣지 않는다
const 무대 = path.join(os.tmpdir(), 'hwpx-cellmargin');
fs.rmSync(무대, { recursive: true, force: true });
fs.mkdirSync(무대, { recursive: true });

const 원본 = path.join(뿌리, '자료', '기준파일', 'ref-table-basic.hwpx');
const 여백 = 2000;      // 표 기본값(510)보다 훨씬 크게

function 만들기(이름, hasMargin) {
  const c = HwpxContainer.open(fs.readFileSync(원본));
  const 구역 = c.sectionNames()[0];
  const doc = parseXml(c.readText(구역));
  const t = findFirst(doc.root, 'hp:tbl');
  const 첫셀 = childrenNamed(childrenNamed(t, 'hp:tr')[0], 'hp:tc')[0];

  const cm = firstChildNamed(첫셀, 'hp:cellMargin');
  setAttr(cm, 'left', String(여백));
  setAttr(cm, 'right', String(여백));
  setAttr(첫셀, 'hasMargin', hasMargin);

  c.writeText(구역, serializeXml(doc));
  const 낸것 = path.join(무대, 이름);
  fs.writeFileSync(낸것, c.save());
  return 낸것;
}

function 한글에게(파일) {
  const 저장본 = 파일.replace(/\.hwpx$/, '-saved.hwpx');
  const ps = [
    "$ErrorActionPreference='Continue'",
    '$hwp = New-Object -ComObject HWPFrame.HwpObject',
    'try { $hwp.RegisterModule("FilePathCheckDLL","FilePathCheckerModule") | Out-Null } catch {}',
    'try {',
    `  if (-not $hwp.Open('${파일}', "", "forceopen:true")) { throw "open fail" }`,
    `  if (Test-Path '${저장본}') { Remove-Item '${저장본}' -Force }`,
    `  $hwp.SaveAs('${저장본}', "HWPX", "") | Out-Null`,
    '  Write-Output "OK"',
    '} catch { Write-Output ("THROW ||| " + $_.Exception.Message) }',
    'finally { try { $hwp.Clear(1) | Out-Null } catch {}; try { $hwp.Quit() | Out-Null } catch {} }',
  ].join('\n');
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    { encoding: 'buffer', timeout: 180_000 });
  if (!fs.existsSync(저장본)) return null;

  const c = HwpxContainer.open(fs.readFileSync(저장본));
  const doc = parseXml(c.readText(c.sectionNames()[0]));
  const t = findFirst(doc.root, 'hp:tbl');
  const 첫셀 = childrenNamed(childrenNamed(t, 'hp:tr')[0], 'hp:tc')[0];
  const sz = firstChildNamed(첫셀, 'hp:cellSz');
  const cm = firstChildNamed(첫셀, 'hp:cellMargin');
  const seg = findAll(첫셀, 'hp:lineseg')[0];
  return {
    hasMargin: getAttr(첫셀, 'hasMargin'),
    셀너비: Number(getAttr(sz, 'width')),
    셀여백왼: Number(getAttr(cm, 'left')),
    셀여백오른: Number(getAttr(cm, 'right')),
    horzsize: seg ? Number(getAttr(seg, 'horzsize')) : null,
  };
}

// 표 자체의 안여백도 알아 둔다
const 밑 = HwpxContainer.open(fs.readFileSync(원본));
const 밑doc = parseXml(밑.readText(밑.sectionNames()[0]));
const 밑t = findFirst(밑doc.root, 'hp:tbl');
const 표안 = firstChildNamed(밑t, 'hp:inMargin');
const 표왼 = Number(getAttr(표안, 'left')), 표오른 = Number(getAttr(표안, 'right'));
console.log(`표의 안여백: 왼 ${표왼} / 오른 ${표오른}`);
console.log(`셀에 준 여백: 왼 ${여백} / 오른 ${여백}\n`);

const 탈 = [];
for (const hm of ['0', '1']) {
  const 파일 = 만들기(`hm${hm}.hwpx`, hm);
  const 뒤 = 한글에게(파일);
  if (!뒤) { 탈.push(`hasMargin=${hm}: 한글이 안 받았다`); continue; }

  const 셀여백썼을때 = 뒤.셀너비 - 여백 * 2;
  const 표여백썼을때 = 뒤.셀너비 - 표왼 - 표오른;
  const 판정 = 뒤.horzsize === 셀여백썼을때 ? '셀 여백을 썼다'
    : 뒤.horzsize === 표여백썼을때 ? '표 여백을 썼다'
      : '알 수 없다';

  console.log(`hasMargin=${hm}`);
  console.log(`  한글이 다시 쓴 hasMargin  ${뒤.hasMargin}`);
  console.log(`  셀 너비                  ${뒤.셀너비}`);
  console.log(`  한글이 다시 쓴 셀 여백    ${뒤.셀여백왼} / ${뒤.셀여백오른}`);
  console.log(`  글 놓일 너비(horzsize)   ${뒤.horzsize}`);
  console.log(`     셀 여백을 썼다면 ${셀여백썼을때} / 표 여백을 썼다면 ${표여백썼을때}`);
  console.log(`  → **${판정}**\n`);

  if (hm === '0' && 판정 !== '표 여백을 썼다') 탈.push('hasMargin=0 인데 셀 여백이 쓰였다');
  if (hm === '1' && 판정 !== '셀 여백을 썼다') 탈.push('hasMargin=1 인데 셀 여백이 안 쓰였다');
}

console.log('═'.repeat(60));
if (탈.length) {
  console.log('생각과 다르다:');
  for (const t of 탈) console.log('  ✗ ' + t);
  process.exit(1);
}
console.log('규칙 확인:');
console.log('  · `hasMargin=0` → 셀에 여백을 써 놔도 **표의 inMargin 이 쓰인다**');
console.log('  · `hasMargin=1` → 셀 여백이 쓰인다');
console.log('  → 셀 여백을 주려면 **hasMargin 을 1 로 같이 켜야 한다**');
