/**
 * **돌긴 도는데 아무것도 안 재는 시험**을 찾는다.
 *
 * 시험이 통과했다는 것과 무언가를 봤다는 것은 다르다. 실제로 겪었다 —
 *
 *   - `if (문단수 < 2) return;`  문단 둘인 칸을 문단 하나뿐인 파일에서 찾아
 *     늘 건너뛰었다. 「시험 4개 추가, 다 통과」로 끝날 뻔했다.
 *   - `if (!fs.existsSync(길)) return;`  저장소 **밖** 파일을 가리켜,
 *     그 파일이 없는 기계에서는 아무것도 안 재고 통과했다.
 *
 * 잡는 것 셋:
 *   1. 앞에 `expect` 가 없는 `if (…) return;`  — 조용한 건너뛰기
 *   2. 저장소 밖 절대 경로에 기대는 시험
 *   3. `expect` 가 하나도 없는 `it(...)`
 *
 * `if (r.ok) return;` 처럼 **앞 줄에서 이미 못 박은 것**은 타입 좁히기라 넘어간다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const 슬래시 = (p) => p.split(path.sep).join('/');

function 시험파일들(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : 시험파일들(p);
    return e.name.endsWith('.test.ts') ? [p] : [];
  });
}

/** 시험 안에서 쓰는 **저장소 밖** 절대 경로. 그런 건 없는 기계에서 헛돈다. */
const 절대경로 = /(?:'|"|`)([A-Za-z]:[\\/][^'"`]+|\/(?:home|Users)\/[^'"`]+)(?:'|"|`)/;

const 탈 = [];
const 파일들 = 시험파일들(path.join(뿌리, 'packages'));

for (const f of 파일들) {
  const 줄들 = fs.readFileSync(f, 'utf8').split('\n');
  const 이름 = 슬래시(path.relative(뿌리, f));

  for (const [i, l] of 줄들.entries()) {
    // 1) 앞에 못 박은 것 없이 건너뛴다
    if (/^\s*if \(.*\)\s*return;\s*$/.test(l)) {
      const 앞 = 줄들.slice(Math.max(0, i - 3), i).join(' ');
      if (!앞.includes('expect')) {
        탈.push([이름, i + 1, '앞에 expect 없이 건너뛴다 — 그 갈래에서는 아무것도 안 본다', l.trim()]);
      }
    }

    // 2) 저장소 밖 절대 경로 가운데 **이 기계에 실제로 있는 것**.
    //
    //    「일부러 없는 경로」를 주는 시험이 있다 — `C:\없는곳\없다.png` 같은 것.
    //    그건 없어야 뜻이 있으니 잡으면 안 된다.
    //    잡아야 할 것은 **여기 있어서 통과하고, 남의 기계엔 없어서 헛도는** 것이다.
    const m = 절대경로.exec(l);
    if (m) {
      const 길 = 슬래시(m[1]);
      const 밖 = !길.toLowerCase().startsWith(슬래시(뿌리).toLowerCase());
      if (밖 && fs.existsSync(길)) {
        탈.push([이름, i + 1, '저장소 밖 파일에 기댄다 — 여기 있어서 통과할 뿐이다', l.trim()]);
      }
    }
  }

  // 3) expect 가 하나도 없는 it
  for (const 조각 of 줄들.join('\n').split(/\n  it\(/).slice(1)) {
    const 끝 = 조각.indexOf('\n  });');
    const 몸 = 끝 >= 0 ? 조각.slice(0, 끝) : 조각;
    if (!몸.includes('expect')) {
      const 제목 = /^(?:'|"|`)([^'"`]*)/.exec(조각)?.[1] ?? '(이름 못 읽음)';
      탈.push([이름, 0, 'expect 가 하나도 없는 it', 제목]);
    }
  }
}

console.log(`시험 파일 ${파일들.length}개를 훑었다`);
if (탈.length === 0) {
  console.log('\n탈 없음 — 헛도는 시험이 없다');
  process.exit(0);
}
console.log(`\n탈 ${탈.length}건`);
for (const [f, n, 왜, 무엇] of 탈) {
  console.log(`  ✗ ${f}${n ? ':' + n : ''}`);
  console.log(`     ${왜}`);
  console.log(`     ${무엇}`);
}
process.exit(1);
