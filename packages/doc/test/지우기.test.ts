/**
 * **문단·표를 지운다.**
 *
 * 넣는 길만 있고 빼는 길이 없었다. 양식에 안 쓰는 항목이 남아도 걷어낼 수가
 * 없어 문서를 통째로 다시 짜야 했다 — 줄·칸에서 겪은 것과 같은 짝 안 맞음이다.
 *
 * 여기서 재는 것은 **막는 것들**이다. 지우는 것 자체보다 「지우면 안 될 때
 * 안 지우나」가 훨씬 중요하다. 되돌릴 길이 없기 때문이다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findAll, removeNode, 복제하기, insertAfter, childrenNamed }
  from '@hwpx/owpml';
import { 문서 } from '../src/index.js';

const 기준파일 = path.join(path.resolve(__dirname, '../../..'), '자료', '기준파일');

function 열기(이름 = 'ref-table-basic.hwpx') {
  const d = 문서.열기(fs.readFileSync(path.join(기준파일, 이름)));
  d.ID매기기();
  return d;
}

/**
  * 표를 담고 있으면서 **쪽 설정은 안 담은** 문단의 ID.
  *
  * 뼈대에는 안 나오는 자리라 여기서 찾는다. 그리고 구역의 **첫 문단**은
  * `hp:secPr` 를 담고 있어 **딴 막이에 먼저 걸린다** — 그러면 이 시험이
  * 재려던 「표 막이」를 안 재고 통과한다. 그런 문단은 건너뛴다.
  */
function 표담은문단(d: 문서): string | undefined {
  for (const 표el of d.구역들.flatMap((s) => s.표들)) {
    let n: unknown = 표el;
    while (n !== undefined && (n as { name?: string }).name !== 'hp:p') {
      n = (n as { parent?: unknown }).parent;
    }
    if (n === undefined) continue;
    if (findAll(n as never, 'hp:secPr').length > 0) continue;   // 쪽 설정 문단은 딴 막이
    return d.이름표.아이디(n as never);
  }
  return undefined;
}

/**
 * **쪽 설정을 안 담은 표 문단을 만든다.**
 *
 * 기준파일은 24편 다 표가 구역의 **첫 문단**에 있고, 첫 문단은 `hp:secPr` 를
 * 담는다. 그러면 「표 막이」를 재려 해도 **쪽 설정 막이에 먼저 걸려**
 * 재려던 것을 안 재고 통과한다. 그래서 표 문단을 복제해 `hp:secPr` 만 걷어낸다.
 *
 * (실측: 33편 가운데 쪽 설정 없는 표 문단을 가진 것은 큰 정부 문서 6편뿐이다.)
 */
function 표문단하나더(d: 문서): string {
  const 표el = d.구역들.flatMap((s) => s.표들)[0];
  if (표el === undefined) throw new Error('표가 없다');
  let 문단: unknown = 표el;
  while (문단 !== undefined && (문단 as { name?: string }).name !== 'hp:p') {
    문단 = (문단 as { parent?: unknown }).parent;
  }
  if (문단 === undefined) throw new Error('표를 담은 문단을 못 찾았다');

  const 구역 = d.구역들[0]!;
  const 새것 = 복제하기(문단 as never, 구역.source);
  // **쪽 설정은 구역에 하나여야 한다.** 복제본에 남기면 둘이 된다.
  for (const sp of findAll(새것, 'hp:secPr')) removeNode(sp);
  if (!insertAfter(문단 as never, 새것)) throw new Error('문단을 못 끼웠다');

  d.ID매기기();
  return d.이름표.아이디(새것);
}

describe('지우면 안 될 때 안 지운다', () => {
  it('**표가 든 문단은 force 를 켜도 못 지운다**', () => {
    // 문단만 지우는 줄 알고 불렀다가 표가 통째로 날아가면 되돌릴 길이 없다.
    const d = 열기();
    const 문단아이디 = 표담은문단(d) ?? 표문단하나더(d);
    const 표수 = () => d.구역들.flatMap((s) => s.표들).length;
    const 전 = 표수();
    expect(전, '표가 있어야 이 시험이 뭔가를 본다').toBeGreaterThan(0);

    for (const 힘 of [false, true]) {
      const r = d.문단지우기(문단아이디, !힘);
      expect(r.ok, `force=${힘} 인데 표가 든 문단이 지워졌다`).toBe(false);
      if (!r.ok) expect(r.이유).toContain('hp:tbl');
    }
    expect(표수(), '막혔는데 표가 줄면 안 된다').toBe(전);
  });

  it('**구역의 쪽 설정을 담은 문단은 force 를 켜도 못 지운다**', () => {
    // 구역의 첫 문단이 hp:secPr 를 담는다 — 용지 크기·여백·쪽 번호가 다 거기 있다.
    // 그 문단은 대개 글이 비어 있어 「빈 문단이니 지워도 되겠지」로 지워졌다.
    // 재 봤더니 실제로 지워졌고 **용지크기가 undefined 가 됐는데 검사()는 탈이
    // 없다고 했다.** 그래서 막이와 검사를 둘 다 놨다.
    const d = 열기('ref-text-basic.hwpx');
    const 첫 = d.구역들[0]!.문단들[0]!;
    const id = d.이름표.아이디(첫.el);
    expect(findAll(첫.el, 'hp:secPr').length, '첫 문단이 쪽 설정을 담고 있어야 한다')
      .toBeGreaterThan(0);

    for (const 힘 of [false, true]) {
      const r = d.문단지우기(id, !힘);
      expect(r.ok, `force=${힘} 인데 쪽 설정 문단이 지워졌다`).toBe(false);
      if (!r.ok) expect(r.이유).toContain('hp:secPr');
    }
    expect(d.구역들[0]!.용지크기, '막혔는데 용지 크기가 사라지면 안 된다').toBeDefined();
  });

  it('**쪽 설정이 없어지면 검사가 잡는다**', () => {
    // 문단지우기가 막지만 딴 길로도 사라질 수 있다. 마지막 그물이다.
    const d = 열기('ref-text-basic.hwpx');
    expect(d.검사(), '성한 문서인데 탈이 있다').toEqual([]);

    const sp = findAll(d.구역들[0]!.root, 'hp:secPr')[0]!;
    removeNode(sp);
    const 탈 = d.검사();
    expect(탈.some((x) => x.includes('hp:secPr')),
      `쪽 설정이 없는데 탈이 안 잡혔다: ${탈.join(' / ')}`).toBe(true);
  });

  it('**칸 안의 마지막 문단은 못 지운다**', () => {
    // 빈 칸도 문단 하나는 있어야 한다 — 없으면 한글이 표를 못 그린다.
    //
    // **여기서 재는 까닭:** 구역의 첫 문단은 이제 `hp:secPr` 막이에 먼저 걸려서
    // 「마지막 문단」 막이를 안 거친다. 칸 안 문단은 쪽 설정이 없으면서
    // 하나뿐이라, 이 막이만 콕 집어 잴 수 있는 유일한 자리다.
    const d = 열기();
    const 표el = d.구역들.flatMap((s) => s.표들)[0]!;
    const 표아이디 = d.이름표.아이디(표el);
    const 칸아이디 = d.셀아이디(표아이디, 0, 0);

    const 문단들 = d.칸문단들(칸아이디);
    expect(문단들.ok, 문단들.ok ? '' : 문단들.이유).toBe(true);
    if (!문단들.ok) return;
    expect(문단들.value.length, '칸에 문단이 하나뿐이라야 이 막이를 잰다').toBe(1);

    const id = d.이름표.아이디(문단들.value[0]!.el);
    expect(findAll(문단들.value[0]!.el, 'hp:secPr').length, '칸 문단에는 쪽 설정이 없다')
      .toBe(0);

    const r = d.문단지우기(id, false);
    expect(r.ok, '칸에 문단이 하나도 안 남으면 한글이 표를 못 그린다').toBe(false);
    if (!r.ok) expect(r.이유).toContain('마지막 문단');
  });

  it('**글이 든 표는 force 없이 못 지운다**', () => {
    const d = 열기();
    const 표아이디 = d.이름표.아이디(d.구역들.flatMap((s) => s.표들)[0]!);
    const 든글 = d.구역들.flatMap((s) => s.표들)
      .flatMap((t) => findAll(t, 'hp:t')).length;
    expect(든글, '글이 든 표라야 이 시험이 뭔가를 본다').toBeGreaterThan(0);

    const 막힘 = d.표지우기(표아이디);
    expect(막힘.ok, '글이 든 표가 그냥 지워지면 안 된다').toBe(false);
    expect(d.구역들.flatMap((s) => s.표들).length, '막혔으면 그대로여야 한다').toBe(1);

    const 됨 = d.표지우기(표아이디, false);
    expect(됨.ok, 됨.ok ? '' : 됨.이유).toBe(true);
    expect(d.구역들.flatMap((s) => s.표들).length).toBe(0);
  });

  it('**표 옆에 글이 있으면 문단을 안 걷는다**', () => {
    // 표는 `hp:p > hp:run > hp:tbl` 로 들어 있다. 표만 빼고 문단까지 걷으면
    // **빈 줄이 안 남아서 좋다** — 그런데 실제 한글 문서는 그 런에 `hp:t` 를
    // 같이 담고 문단에 런이 둘이다. 그때 문단을 걷으면 **옆의 글이 날아간다.**
    // 그래서 「런이 비었을 때만」 걷는다. 여기서 그 선을 못 박는다.
    const d = 열기();
    const 표el = d.구역들.flatMap((s) => s.표들)[0]!;
    const 런 = (표el as unknown as { parent: { children: unknown[] } }).parent;
    expect(런.children.length, '이 기준파일은 런에 표 말고도 뭔가 더 들어 있다')
      .toBeGreaterThan(1);

    const 표아이디 = d.이름표.아이디(표el);
    // **`모든문단들` 이 아니라 `문단들` 이다.** 앞의 것은 표 칸 안 문단까지 세서,
    // 표를 지우면 칸 문단 9개가 같이 빠져 11 → 2 가 된다. 여기서 볼 것은
    // 「표를 담았던 **바깥 문단**이 남았나」다.
    const 문단수 = () => d.구역들.flatMap((s) => s.문단들).length;
    const 전 = 문단수();

    const r = d.표지우기(표아이디, false);
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);
    if (r.ok) expect(r.value.빈문단도지웠나, '옆에 글이 있는데 문단을 걷으면 안 된다').toBe(false);
    expect(문단수(), '문단 수가 그대로여야 한다').toBe(전);
  });

  it('**남는 것이 빈 hp:t 뿐이면 문단까지 걷는다**', () => {
    // 실측(표본 33편) — 표가 든 런 271개 가운데
    //     253  표 말고 남는 것: hp:t   ← **빈** hp:t 다
    //       9  (없음)
    //       6  hp:ctrl · hp:line 등
    // 「런이 **완전히** 비면 걷는다」로 두면 271개 중 9개에만 걸린다.
    // 규칙은 맞는데 조건이 현실에서 거의 안 성립해, 있으면서 아무 일도 안 했다.
    const d = 열기();
    const 문단아이디 = 표문단하나더(d);
    const 찾 = d.찾기(문단아이디);
    expect(찾.ok, 찾.ok ? '' : 찾.이유).toBe(true);
    if (!찾.ok || 찾.value.갈래 !== '문단') throw new Error('문단이 아니다');

    // 표를 담은 런만 남긴다 — 그 런에는 빈 hp:t 가 딸려 있다
    const 문단el = 찾.value.문단.el;
    for (const r of [...childrenNamed(문단el, 'hp:run')]) {
      if (findAll(r, 'hp:tbl').length === 0) removeNode(r);
    }
    const 남은런 = childrenNamed(문단el, 'hp:run');
    expect(남은런.length, '표 런 하나만 남아야 한다').toBe(1);
    expect(findAll(남은런[0]!, 'hp:t').length, '표 옆에 빈 hp:t 가 있어야 이 시험이 뭔가를 본다')
      .toBeGreaterThan(0);

    const 표아이디 = d.이름표.아이디(findAll(문단el, 'hp:tbl')[0]!);
    const 문단수 = () => d.구역들.flatMap((s) => s.문단들).length;
    const 전 = 문단수();

    const r = d.표지우기(표아이디, false);
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);
    if (r.ok) {
      expect(r.value.빈문단도지웠나, '빈 hp:t 만 남았으면 문단까지 걷어야 한다').toBe(true);
    }
    expect(문단수(), '문단이 하나 줄어야 한다').toBe(전 - 1);
  });

  it('**지운 것의 ID 는 장부에서 빠진다**', () => {
    // 안 빼면 지워진 것을 가리키는 ID 가 살아 있어서,
    // 없는 것을 고치고도 「됐다」 고 답하게 된다.
    const d = 열기();
    const 지울것 = d.구역들.flatMap((s) => s.문단들)
      .map((p) => d.이름표.아이디(p.el))
      .find((id) => {
        const r = d.문단지우기(id, false);
        return r.ok;
      });
    expect(지울것, '지울 수 있는 문단이 하나는 있어야 한다').toBeDefined();
    expect(d.이름표.has(지울것!), '지운 ID 가 장부에 남아 있다').toBe(false);
    expect(d.찾기(지울것!).ok, '지운 ID 로 다시 찾아지면 안 된다').toBe(false);
  });

  it('없는 ID·딴 갈래 ID 는 무엇을 줘야 하는지 말해 준다', () => {
    const d = 열기();
    const 표아이디 = d.이름표.아이디(d.구역들.flatMap((s) => s.표들)[0]!);

    const a = d.문단지우기('p_없는것');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.이유).toContain('못 찾았다');

    const b = d.문단지우기(표아이디);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.어떻게).toContain('표지우기');
  });

  it('**지운 뒤 저장해도 한글이 열 수 있는 꼴이다**', () => {
    // 「지웠다」 는 말만 듣고 안 재면, 규격이 깨진 파일을 내놓고도 모른다.
    const d = 열기();
    const 표아이디 = d.이름표.아이디(d.구역들.flatMap((s) => s.표들)[0]!);
    expect(d.표지우기(표아이디, false).ok).toBe(true);

    const 탈 = d.검사();
    expect(탈, `표를 지웠더니 흠이 생겼다: ${탈.join(' / ')}`).toEqual([]);

    const 다시 = 문서.열기(d.저장());
    다시.ID매기기();
    expect(다시.구역들.flatMap((s) => s.표들).length, '저장했다 열면 표가 없어야 한다').toBe(0);
  });
});
