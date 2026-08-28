/**
 * **기능이 실제 문서에 얼마나 나오나.**
 *
 * 무엇을 먼저 만들지 정하려면 이게 있어야 한다. 안 나오는 것을 만들 이유는 없다.
 *
 * ## 요소가 있는 것과 쓰이는 것은 다르다
 *
 * 처음엔 `<hp:pageBorderFill` 이 있으면 "쪽 테두리를 쓴다" 로 셌다.
 * **159편(99%)** 이 나왔다. 그런데 그 요소는 구역마다 늘 있고,
 * 실제로 테두리를 가리키는 것은 **474곳 가운데 10곳뿐**이었다 (그마저 한 편이다).
 * 그래서 그런 것은 **가리키는 값까지** 본다.
 *
 *   node 검증/쓰임세기.mjs
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
const 뿌리 = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;
const { HwpxContainer } = await import(B('hwpx'));

const 목록 = fs.readFileSync(path.join(os.tmpdir(), 'hwpx-훑기목록.txt'), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean).filter((p) => fs.existsSync(p));

/** 무엇을 어떤 표시로 찾나 (본문 XML 에서) */
const 볼것 = [
  ['머리말·꼬리말 내용', /<hp:header[ >]|<hp:footer[ >]/],
  // 요소는 늘 있다. **0/1 이 아닌 테두리를 가리킬 때만** 진짜 쓰는 것이다.
  ['쪽 테두리·배경', /<hp:pageBorderFill[^>]*borderFillIDRef="(?![01]")/],
  ['다단', /<hp:colPr[^>]*colCount="[2-9]/],
  ['구역 나누기', /<hp:secPr[ >]/g, 2],   // 두 개 이상이면 구역을 나눈 것
  ['바탕쪽', /<hp:masterPage[ >]/],
  ['탭', /<hp:tab[ >]/],
  ['개요 번호(자동 번호)', /<hp:autoNum[ >]|<hh:heading[^>]*type="OUTLINE"/],
  ['문단 테두리·배경', /<hh:paraPr[^>]*borderFillIDRef="(?!0")/],
  ['취소선', /<hh:strikeout[ >]/],
  ['위·아래 첨자', /<hh:(sub|sup)script[ >]/],
  ['강조점', /symMark="(?!NONE)/],
  ['셀 병합', /<hp:cellSpan[^>]*(colSpan="[2-9]|rowSpan="[2-9])/],
  ['표 캡션', /<hp:caption[ >]/],
  ['도형·글상자', /<hp:rect[ >]|<hp:ellipse[ >]|<hp:polygon[ >]|<hp:container[ >]|<hp:line[ >]/],
  ['수식', /<hp:equation[ >]/],
  ['각주·미주', /<hp:footNote[ >]|<hp:endNote[ >]/],
  ['하이퍼링크', /<hp:fieldBegin[^>]*type="HYPERLINK"|hyperlink/i],
  ['책갈피', /<hp:bookmark[ >]|type="BOOKMARK"/],
  ['메모', /<hp:memo[ >]|<hp:memoGroup[ >]/],
];

const 셈 = new Map(볼것.map(([이름]) => [이름, 0]));
let 본문서 = 0;
for (const f of 목록) {
  let c;
  try { c = HwpxContainer.open(fs.readFileSync(f)); } catch { continue; }
  본문서++;
  let 글 = '';
  try {
    for (const n of c.sectionNames()) 글 += c.readText(n);
  } catch { continue; }
  for (const [이름, 무늬, 몇개 = 1] of 볼것) {
    const 맞은것 = 글.match(new RegExp(무늬.source, 무늬.flags.includes('g') ? 무늬.flags : 무늬.flags + 'g'));
    if (맞은것 && 맞은것.length >= 몇개) 셈.set(이름, 셈.get(이름) + 1);
  }
}

console.log(`문서 ${본문서}편에서 — 아직 없는 기능이 몇 편에 나오나\n`);
const 줄 = [...셈].sort((a, b) => b[1] - a[1]);
for (const [이름, n] of 줄) {
  const 비율 = n / 본문서;
  const 막대 = '█'.repeat(Math.round(비율 * 30)).padEnd(30, '·');
  console.log(`  ${이름.padEnd(20)} ${막대} ${String(n).padStart(3)}편 (${(비율 * 100).toFixed(0)}%)`);
}
