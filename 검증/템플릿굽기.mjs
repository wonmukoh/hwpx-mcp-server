/**
 * 빈 문서 템플릿을 **한글이 만든 파일에서 굽는다.**
 *
 * 손으로 쓴 템플릿은 쓰지 않는다. 지금 쓰는 MCP 가 그렇게 했다가
 * 규격을 어긴 곳이 있어 한글이 문서 뒷부분을 통째로 무시한 적이 있다.
 * 우리는 한글이 실제로 저장한 빈 문서를 그대로 심는다.
 *
 *   node 검증/템플릿굽기.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);

const { HwpxContainer } = await import(
  pathToFileURL(path.join(뿌리, '검증', '.빌드hwpx', 'index.js')).href
);

const 원본경로 = path.join(뿌리, '자료', '기준파일', 'ref-blank.hwpx');
const 바이트 = fs.readFileSync(원본경로);

// 굽기 전에 이게 정말 빈 문서인지 확인한다. 아니면 굽지 않는다.
const c = HwpxContainer.open(바이트);
const 문제 = c.검사();
if (문제.length) throw new Error('템플릿이 검사에 걸린다:\n' + 문제.join('\n'));
if (c.sectionNames().length !== 1) throw new Error('구역이 하나가 아니다');
if (!c.save().equals(바이트)) throw new Error('열고 저장했는데 바이트가 다르다');

const b64 = 바이트.toString('base64');
const 줄들 = [];
for (let i = 0; i < b64.length; i += 96) 줄들.push("  '" + b64.slice(i, i + 96) + "',");

const 글 = `/**
 * 빈 문서 템플릿. **한글이 저장한 파일 그대로다.**
 *
 * 이 파일은 손으로 고치지 않는다. \`node 검증/템플릿굽기.mjs\` 가 굽는다.
 * 원본: 자료/기준파일/ref-blank.hwpx (한글에서 새 문서를 만들어 그냥 저장한 것)
 *
 * 왜 한글이 만든 것을 쓰나:
 *   손으로 쓴 템플릿은 규격을 어기기 쉽다. 그런데 한글은 어긴 곳을 알려 주지 않고
 *   그냥 그 뒤를 무시한다. 지금 쓰는 MCP 가 그 병을 앓았다.
 *   추측하지 말고 한글이 실제로 뭘 하는지 보고 그대로 쓴다.
 *
 * 들어 있는 것 (실측):
 *   구역 1개 / 문단 1개 / 글꼴 ${14}벌 / 문단모양 ${20}개 / 글자모양 ${7}개 / 스타일 ${23}개
 */

const 템플릿b64 = [
${줄들.join('\n')}
].join('');

/** 빈 문서의 바이트. 부를 때마다 새 Buffer 를 준다 */
export function 빈문서바이트(): Buffer {
  return Buffer.from(템플릿b64, 'base64');
}
`;

const 낼곳 = path.join(뿌리, 'packages', 'hwpx', 'src', '빈문서.ts');
fs.writeFileSync(낼곳, 글, 'utf8');
console.log(`구웠다: ${path.relative(뿌리, 낼곳)}  (${바이트.length}바이트 → base64 ${b64.length}자)`);
