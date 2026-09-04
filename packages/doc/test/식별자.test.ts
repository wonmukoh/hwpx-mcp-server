/**
 * **ID 가 어디까지 사나.**
 *
 * `문서.test.ts` 는 「삽입해도 ID 가 안 밀린다」 를 못 박는다. 그건 **연 문서
 * 안에서** 참이다. 여기서는 그 문장의 나머지 반을 못 박는다 —
 * **저장하고 다시 열면 밀린다.**
 *
 * 이 갈래가 없어서 아래로 쓰는 앱이 저장 전에 받아 둔 표 ID 로 다시 연 문서를
 * 가리키다 「못 찾았다」 로 자빠졌다. 그쪽이 재서 알려 주기 전까지
 * 우리 주석은 「안 밀린다」 고만 적혀 있었다.
 *
 * 규칙은 [`자료/실측.md`](../../../자료/실측.md) 27항에 있다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { 복제하기, insertAfter, type ElementNode } from '@hwpx/owpml';
import { 문서, 표 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');
const 기준파일 = path.join(뿌리, '자료', '기준파일');

/** 문서를 열어 ID 를 매기고, 표·문단 ID 를 훑은 차례대로 늘어놓는다 */
function 지도(바이트: Buffer) {
  const d = 문서.열기(바이트);
  d.ID매기기();
  return {
    d,
    표들: d.구역들.flatMap((s) => s.표들).map((t) => d.이름표.아이디(t)),
    문단들: d.구역들.flatMap((s) => [...s.모든문단들]).map((p) => d.이름표.아이디(p.el)),
  };
}

function 열기(이름 = 'ref-table-basic.hwpx') {
  return fs.readFileSync(path.join(기준파일, 이름));
}

/** 그 문서의 첫 표를 **source 를 물려** 꺼낸다. 안 물리면 복제가 빈 것이 나온다 */
function 첫표(d: 문서, 표아이디: string): 표 {
  const 찾 = d.찾기(표아이디);
  if (!찾.ok) throw new Error(`${표아이디} 를 못 찾았다: ${찾.이유}`);
  const 것 = 찾.value as { 표?: { el: unknown }; 구역: { source?: string } };
  if (!것.표) throw new Error(`${표아이디} 가 표가 아니다`);
  return new 표(것.표.el as never, 것.구역.source);
}

/**
 * 표가 **둘**인 문서를 만든다 — 표가 든 문단을 통째로 복제해 뒤에 끼운다.
 *
 * 기준파일에는 표가 둘인 문서가 없다. 「없으면 건너뛴다」 로 두면 그 시험은
 * 늘 초록이면서 아무것도 안 본다.
 */
function 표를늘린문서(): Buffer {
  const d = 문서.열기(열기());
  d.ID매기기();
  const 표el = d.구역들.flatMap((s) => s.표들)[0]!;
  const 구역 = d.구역들[0]!;

  // 표는 hp:p > hp:run > hp:tbl 로 들어 있다. 문단째로 복제해야 성한 것이 나온다.
  let 문단: ElementNode | undefined = 표el as ElementNode;
  while (문단 !== undefined && 문단.name !== 'hp:p') {
    문단 = 문단.parent as ElementNode | undefined;
  }
  if (문단 === undefined) throw new Error('표를 담은 문단을 못 찾았다');

  const 새것 = 복제하기(문단, 구역.source);
  if (!insertAfter(문단, 새것)) throw new Error('문단을 못 끼웠다');
  return d.저장();
}

describe('ID 는 연 문서 안에서만 산다', () => {
  it('손을 안 대고 저장하면 ID 가 그대로다', () => {
    const 바이트 = 열기();
    const 가 = 지도(바이트);
    const 나 = 지도(가.d.저장());
    expect(나.표들).toEqual(가.표들);
    expect(나.문단들).toEqual(가.문단들);
  });

  it('**글만 고치면 저장을 넘겨도 ID 가 산다**', () => {
    // set_text·replace 는 구조를 안 건드린다. 훑는 차례가 그대로라 번호도 그대로다.
    const 바이트 = 열기();
    const 가 = 지도(바이트);

    const d = 문서.열기(바이트);
    d.ID매기기();
    const r = d.글바꾸기(가.문단들[0]!, '바뀐 글');
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);

    const 다 = 지도(d.저장());
    expect(다.표들, '글만 고쳤는데 표 ID 가 밀리면 안 된다').toEqual(가.표들);
    expect(다.문단들).toEqual(가.문단들);
  });

  it('**줄을 넣고 저장하면 다시 열었을 때 표 ID 가 달라진다**', () => {
    // ID 값은 문서를 훑는 차례에서 나온다. 줄을 넣으면 칸마다 문단이 생겨
    // 그 차례가 밀린다. **연 채로는 그대로다** — 밀리는 것은 다시 열 때다.
    const 바이트 = 열기();
    const 가 = 지도(바이트);

    const d = 문서.열기(바이트);
    d.ID매기기();
    const 표아이디 = 지도(바이트).표들[0]!;
    const t = 첫표(d, 표아이디);
    const r = t.줄넣기(t.줄수);
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);

    // 연 채로는 그대로다
    expect(d.이름표.has(표아이디), '연 문서 안에서는 ID 가 살아 있어야 한다').toBe(true);
    expect(d.찾기(표아이디).ok).toBe(true);

    // 다시 열면 다르다
    const 라 = 지도(d.저장());
    expect(라.문단들.length, '줄을 넣었으니 문단이 늘어야 한다')
      .toBeGreaterThan(가.문단들.length);
    expect(라.표들[0], '저장했다 다시 열면 표 ID 가 달라진다').not.toBe(가.표들[0]);
  });

  it('**표 하나를 고쳐도 그 문서의 표 ID 가 전부 밀린다**', () => {
    // 표는 문단을 다 매긴 **다음에** 매긴다. 그래서 문단이 하나라도 늘면
    // 표 번호가 통째로 밀린다 — 고친 표만이 아니다.
    // 실측: 표 65개짜리 정부 문서에서 65개가 다 달라졌다.
    //
    // 기준파일에는 표가 둘인 문서가 없다. 없다고 건너뛰면 아무것도 안 보는
    // 시험이 되므로 **여기서 만든다** — 표가 든 문단을 복제해 뒤에 끼운다.
    const 표둘 = 표를늘린문서();
    const 가 = 지도(표둘);
    expect(가.표들.length, '표를 둘로 못 늘렸다').toBe(2);

    const d = 문서.열기(표둘);
    d.ID매기기();
    const t = 첫표(d, 가.표들[0]!);
    const r = t.줄넣기(t.줄수);
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);

    const 라 = 지도(d.저장());
    expect(라.표들.length).toBe(2);
    const 산것 = 가.표들.filter((x, i) => 라.표들[i] === x).length;
    expect(산것, '첫 표만 고쳤는데 **둘째 표** ID 가 살아 있으면 안 된다').toBe(0);
  });
});
