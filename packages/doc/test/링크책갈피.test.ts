/**
 * **하이퍼링크와 책갈피.**
 *
 * 짜임은 `자료/실측.md` 31항에 있다. 둘 다 `hp:ctrl` 안에 들어가는데
 * 생김새가 아주 다르다 —
 *
 *   링크    fieldBegin ~ fieldEnd **쌍**. id 로 짝을 맺고 주소는 hp:parameters 에 있다
 *   책갈피  요소 **하나**. 짝도 값도 없다
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { childrenNamed, findAll, firstChildNamed, getAttr, textOf } from '@hwpx/owpml';
import { 문서 } from '../src/index.js';

const 기준파일 = path.join(path.resolve(__dirname, '../../..'), '자료', '기준파일');

function 열기(이름 = 'ref-text-basic.hwpx') {
  const d = 문서.열기(fs.readFileSync(path.join(기준파일, 이름)));
  d.ID매기기();
  return d;
}

/** 글이 든 첫 문단의 ID 와 그 글 */
function 글있는문단(d: 문서): { id: string; 글: string } {
  for (const p of d.구역들.flatMap((s) => s.문단들)) {
    const 글 = p.글.trim();
    // **이름만 「글있는문단」 이라 붙이지 않는다.** 실제로 글이 있나 본다.
    if (글.length >= 2) return { id: d.이름표.아이디(p.el), 글 };
  }
  throw new Error('글이 든 문단이 없다');
}

describe('하이퍼링크', () => {
  it('**런 셋이 되고 id 로 짝이 맺힌다**', () => {
    const d = 열기();
    const { id, 글 } = 글있는문단(d);
    const 어구 = 글.slice(0, 2);

    const r = d.링크걸기(id, 어구, 'https://www.moe.go.kr');
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);

    const 찾 = d.문단찾기(id);
    expect(찾.ok).toBe(true);
    if (!찾.ok) return;
    const 시작 = findAll(찾.value.el, 'hp:fieldBegin')[0];
    const 끝 = findAll(찾.value.el, 'hp:fieldEnd')[0];
    expect(시작, 'fieldBegin 이 없다').toBeDefined();
    expect(끝, 'fieldEnd 가 없다 — 짝이 없으면 링크가 문서 끝까지 이어진다').toBeDefined();

    expect(getAttr(시작!, 'type')).toBe('HYPERLINK');
    expect(getAttr(끝!, 'beginIDRef'), 'beginIDRef 가 fieldBegin 의 id 를 가리켜야 한다')
      .toBe(getAttr(시작!, 'id'));
    expect(getAttr(끝!, 'fieldid'), 'fieldid 끼리도 맞아야 한다')
      .toBe(getAttr(시작!, 'fieldid'));
  });

  it('**주소가 Command 와 Path 둘 다에 들어간다**', () => {
    // Command 만 넣으면 한글이 링크를 만들되 주소를 잃는다.
    const d = 열기();
    const { id, 글 } = 글있는문단(d);
    expect(d.링크걸기(id, 글.slice(0, 2), 'https://www.korea.kr').ok).toBe(true);

    const 시작 = findAll(d.구역들[0]!.root, 'hp:fieldBegin')[0]!;
    const 값들 = firstChildNamed(시작, 'hp:parameters')!;
    const 값 = (이름: string) => textOf(childrenNamed(값들, 'hp:stringParam')
      .find((x) => getAttr(x, 'name') === 이름)!);
    expect(값('Command')).toBe('https://www.korea.kr');
    expect(값('Path')).toBe('https://www.korea.kr');
    expect(getAttr(값들, 'cnt'), '실측한 문서가 여섯이다').toBe('6');
  });

  it('**글이 셋으로 갈리고 링크 글만 가운데 남는다**', () => {
    const d = 열기();
    const { id, 글 } = 글있는문단(d);
    const 어구 = 글.slice(0, 2);
    expect(d.링크걸기(id, 어구, 'https://x.kr').ok).toBe(true);

    const 찾 = d.문단찾기(id);
    if (!찾.ok) throw new Error('못 찾았다');
    expect(찾.value.글, '글이 통째로 그대로여야 한다 — 링크는 표시일 뿐이다').toBe(글);
    expect(d.링크들, '주소를 읽어 낼 수 있어야 한다').toContain('https://x.kr');
  });

  it('**이미 쓰인 id 보다 큰 것을 고른다**', () => {
    // 겹치면 한글이 fieldEnd 를 엉뚱한 fieldBegin 에 맺는다.
    // **아무 수나 뽑으면 이 시험이 아무것도 안 본다** — 20억 중 하나는 우연히도
    // 안 겹치니 막이가 있으나 없으나 통과한다. 그래서 「쓰인 것 다음 수」로 정하고,
    // 여기서 그것을 잰다.
    const 이미 = 열기('ref-link.hwpx');
    const 원래id = findAll(이미.구역들[0]!.root, 'hp:fieldBegin')
      .map((e) => Number(getAttr(e, 'id'))).filter((n) => Number.isFinite(n));
    expect(원래id.length, 'ref-link 에 링크가 하나 있어야 이 시험이 뭔가를 본다')
      .toBeGreaterThan(0);

    const 글있는 = 이미.구역들.flatMap((s) => s.문단들).find((p) => p.글.trim().length >= 2);
    expect(글있는, '글이 든 문단이 있어야 한다').toBeDefined();
    const r = 이미.링크걸기(이미.이름표.아이디(글있는!.el), 글있는!.글.trim().slice(0, 2), 'https://y.kr');
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);

    const 새id = findAll(이미.구역들[0]!.root, 'hp:fieldBegin')
      .map((e) => Number(getAttr(e, 'id')))
      .filter((n) => !원래id.includes(n));
    expect(새id.length, '새 링크가 하나 생겨야 한다').toBe(1);
    expect(새id[0]!, `이미 쓰인 ${Math.max(...원래id)} 보다 커야 겹칠 수 없다`)
      .toBeGreaterThan(Math.max(...원래id));

    const d = 열기();
    const 문단들 = d.구역들.flatMap((s) => s.문단들)
      .filter((p) => p.글.trim().length >= 2)
      .map((p) => d.이름표.아이디(p.el));
    expect(문단들.length, '문단이 둘 이상이라야 겹침을 잰다').toBeGreaterThan(1);

    for (const [i, pid] of 문단들.slice(0, 3).entries()) {
      const 찾 = d.문단찾기(pid);
      if (!찾.ok) continue;
      const 글 = 찾.value.글.trim();
      if (글.length < 2) continue;
      d.링크걸기(pid, 글.slice(0, 2), `https://x${i}.kr`);
    }

    const 아이디들 = d.구역들
      .flatMap((s) => findAll(s.root, 'hp:fieldBegin'))
      .map((e) => getAttr(e, 'id'));
    expect(아이디들.length, '링크가 여럿 걸려야 이 시험이 뭔가를 본다').toBeGreaterThan(1);
    expect(new Set(아이디들).size, `id 가 겹친다: ${아이디들.join(', ')}`).toBe(아이디들.length);
  });

  it('없는 글·빈 주소는 까닭을 말한다', () => {
    const d = 열기();
    const { id } = 글있는문단(d);
    const a = d.링크걸기(id, '있을 리 없는 어구', 'https://x.kr');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.어떻게).toContain('이 문단의 글');

    const b = d.링크걸기(id, '가', '   ');
    expect(b.ok).toBe(false);
  });
});

describe('책갈피', () => {
  it('**요소 하나로 달린다**', () => {
    const d = 열기();
    const { id } = 글있는문단(d);
    const r = d.책갈피달기(id, '가는곳');
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);

    const 것 = findAll(d.구역들[0]!.root, 'hp:bookmark');
    expect(것.length).toBe(1);
    expect(getAttr(것[0]!, 'name')).toBe('가는곳');
    expect(d.책갈피들).toContain('가는곳');
  });

  it('**같은 이름은 두 번 못 단다**', () => {
    // 겹치면 한글이 뒤엣것으로 간다 — 앞엣것을 가리키던 링크가 조용히 딴 데로 간다.
    const d = 열기();
    const 문단들 = d.구역들.flatMap((s) => s.문단들).map((p) => d.이름표.아이디(p.el));
    expect(d.책갈피달기(문단들[0]!, '한번만').ok).toBe(true);
    const 두번째 = d.책갈피달기(문단들[1] ?? 문단들[0]!, '한번만');
    expect(두번째.ok, '같은 이름이 두 번 달리면 안 된다').toBe(false);
    if (!두번째.ok) expect(두번째.어떻게).toContain('뒤엣것');
    expect(findAll(d.구역들[0]!.root, 'hp:bookmark').length).toBe(1);
  });

  it('**글은 안 건드린다**', () => {
    const d = 열기();
    const { id, 글 } = 글있는문단(d);
    expect(d.책갈피달기(id, '표시').ok).toBe(true);
    const 찾 = d.문단찾기(id);
    if (!찾.ok) throw new Error('못 찾았다');
    expect(찾.value.글, '책갈피는 자리 표시일 뿐 글이 아니다').toBe(글);
  });
});

describe('둘 다 문서를 안 깨뜨린다', () => {
  it('**저장하고 다시 열어도 살아 있다**', () => {
    const d = 열기();
    const { id, 글 } = 글있는문단(d);
    expect(d.링크걸기(id, 글.slice(0, 2), 'https://www.moe.go.kr').ok).toBe(true);
    expect(d.책갈피달기(id, '여기').ok).toBe(true);
    expect(d.검사(), '링크·책갈피를 달았더니 흠이 생겼다').toEqual([]);

    const 다시 = 문서.열기(d.저장());
    다시.ID매기기();
    expect(다시.링크들, '저장했다 열면 링크가 살아 있어야 한다')
      .toContain('https://www.moe.go.kr');
    expect(다시.책갈피들).toContain('여기');
  });
});
