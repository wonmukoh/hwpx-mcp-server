/**
 * 표 기하.
 *
 * 실측(표 1292개 / 셀 21411개)으로 정한 규칙을 시험으로 굳힌다.
 * 규칙은 [`자료/실측.md`](../../../자료/실측.md) 7항에 있다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HwpxContainer } from '@hwpx/container';
import {
  parseXml, serializeXml, findFirst, findAll, childrenNamed, firstChildNamed,
  getAttr, hwp, appendChild, 복제하기, type ElementNode,
} from '@hwpx/owpml';
import { 문서, 표, 셀, 표자식넣기, 표자식순서, 꺼내기 } from '../src/index.js';
import { createElement } from '@hwpx/owpml';

const 뿌리 = path.resolve(__dirname, '../../..');
const 기준파일 = path.join(뿌리, '자료', '기준파일');

function 표읽기(파일: string) {
  const c = HwpxContainer.open(fs.readFileSync(path.join(기준파일, 파일)));
  const 구역 = c.sectionNames()[0]!;
  const xml = c.readText(구역);
  const doc = parseXml(xml);
  const el = findFirst(doc.root, 'hp:tbl');
  if (!el) throw new Error(`${파일} 에 표가 없다`);
  // **source 를 물려준다.** 없으면 줄·칸을 복제할 때 빈 것이 나온다
  return { xml, doc, t: new 표(el, xml) };
}

describe('표를 읽는다', () => {
  it('줄·칸 수와 셀 개수가 맞는다', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    expect(t.줄수).toBeGreaterThanOrEqual(2);
    expect(t.칸수).toBeGreaterThanOrEqual(2);
    expect(t.셀들.length).toBe(t.줄수 * t.칸수);
  });

  it('셀은 자식 다섯을 다 갖고 있다 (실측 21411/21411)', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    for (const c of t.셀들) {
      for (const 이름 of ['hp:subList', 'hp:cellAddr', 'hp:cellSpan', 'hp:cellSz', 'hp:cellMargin']) {
        expect(firstChildNamed(c.el, 이름), 이름).toBeDefined();
      }
    }
  });

  it('합친 셀은 **덮인 칸으로도** 찾아진다', () => {
    const { t } = 표읽기('ref-table-merge.hwpx');
    const 합친것 = t.셀들.find((c) => c.자리.colSpan > 1 || c.자리.rowSpan > 1);
    expect(합친것, '합친 셀이 있는 기준 파일이어야 한다').toBeDefined();
    const a = 합친것!.자리;
    // 시작 칸이 아닌 덮인 칸으로 찾아도 같은 셀이 나와야 한다
    const 덮인칸 = a.colSpan > 1 ? [a.row, a.col + 1] : [a.row + 1, a.col];
    expect(t.셀(덮인칸[0]!, 덮인칸[1]!)?.el).toBe(합친것!.el);
    // 시작셀 로 찾으면 안 나온다
    expect(t.시작셀(덮인칸[0]!, 덮인칸[1]!)?.el).not.toBe(합친것!.el);
  });

  it('기준 파일의 표는 검사에 안 걸린다', () => {
    for (const f of ['ref-table-basic.hwpx', 'ref-table-merge.hwpx', 'ref-table-border.hwpx']) {
      const { t } = 표읽기(f);
      expect(t.탈만, f).toEqual([]);
    }
  });
});

describe('열 폭 — 덮은 칸 셀은 열 폭의 합이다', () => {
  it('폭을 주면 홀로 선 셀과 합친 셀이 다 맞는다', () => {
    const { t } = 표읽기('ref-table-merge.hwpx');
    const 폭들 = new Array(t.칸수).fill(0).map((_, i) => 5000 + i * 1000);
    const r = 꺼내기(t.열폭주기(폭들));
    expect(r.바뀐수).toBeGreaterThan(0);

    for (const c of t.셀들) {
      const a = c.자리;
      let 합 = 0;
      for (let i = a.col; i < a.col + a.colSpan; i++) 합 += 폭들[i]!;
      expect(c.너비, `(${a.row},${a.col}) span${a.colSpan}`).toBe(합);
    }
    expect(t.탈만).toEqual([]);
  });

  it('표 전체 폭도 같이 맞춘다', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    const 폭들 = new Array(t.칸수).fill(4000);
    꺼내기(t.열폭주기(폭들));
    expect(getAttr(firstChildNamed(t.el, 'hp:sz')!, 'width')).toBe(String(4000 * t.칸수));
  });

  it('개수가 안 맞으면 **못 한다고 한다** (조용히 넘어가지 않는다)', () => {
    const { xml, doc, t } = 표읽기('ref-table-basic.hwpx');
    const r = t.열폭주기([1000]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain(String(t.칸수));
    expect(r.어떻게).toContain(String(t.칸수));
    // 실패했으면 문서를 안 건드렸어야 한다
    expect(serializeXml(doc)).toBe(xml);
  });

  it('0이나 음수 폭은 막는다', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    expect(t.열폭주기(new Array(t.칸수).fill(0)).ok).toBe(false);
    expect(t.열폭주기(new Array(t.칸수).fill(-1)).ok).toBe(false);
  });
});

describe('표 높이 — 우리가 만든 표는 맞춰 준다', () => {
  it('줄 높이의 합으로 맞춘다', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    // 줄마다 높이를 새로 준다
    for (const c of t.셀들) c.크기주기(undefined, 1000);
    꺼내기(t.높이맞추기());
    expect(getAttr(firstChildNamed(t.el, 'hp:sz')!, 'height')).toBe(String(1000 * t.줄수));
  });

  it('이미 맞으면 0건이라고 말한다 (거짓으로 "했다" 안 한다)', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    꺼내기(t.높이맞추기());
    expect(꺼내기(t.높이맞추기()).바뀐수).toBe(0);
  });
});

describe('셀 안쪽 여백 — hasMargin 을 같이 켠다', () => {
  it('여백을 주면 hasMargin 이 1 이 된다', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    const c = t.셀(0, 0)!;
    expect(c.표여백따르나).toBe(true);

    c.안여백주기({ left: hwp(2000), right: hwp(2000) });

    expect(getAttr(c.el, 'hasMargin')).toBe('1');
    expect(c.표여백따르나).toBe(false);
    expect(c.안여백.left).toBe(2000);
    expect(c.안여백.right).toBe(2000);
    // 안 준 쪽은 그대로다
    expect(c.안여백.top).toBe(141);
  });

  it('표 안여백은 따로 준다', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    t.안여백주기({ left: hwp(800) });
    expect(getAttr(firstChildNamed(t.el, 'hp:inMargin')!, 'left')).toBe('800');
  });
});

describe('세로 정렬은 subList 에 있다', () => {
  it('셀 세로 정렬을 바꾼다', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    const c = t.셀(0, 0)!;
    c.세로정렬주기('TOP');
    expect(c.세로정렬).toBe('TOP');
    expect(getAttr(c.subList, 'vertAlign')).toBe('TOP');
    // hp:tc 에 쓰면 안 된다
    expect(getAttr(c.el, 'vertAlign')).toBeUndefined();
  });
});

describe('머리행 반복', () => {
  it('표 속성과 첫 줄 셀의 header 를 같이 켠다', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    t.머리행반복주기(true);
    expect(t.머리행반복).toBe(true);
    for (const tc of childrenNamed(t.줄들[0]!, 'hp:tc')) {
      expect(getAttr(tc, 'header')).toBe('1');
    }
    // 둘째 줄은 안 켜진다
    for (const tc of childrenNamed(t.줄들[1]!, 'hp:tc')) {
      expect(getAttr(tc, 'header')).toBe('0');
    }
  });
});

describe('표 자식 순서 — 캡션은 outMargin 과 inMargin 사이', () => {
  it('캡션을 넣으면 규격 자리에 들어간다', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    표자식넣기(t.el, createElement('hp:caption', { side: 'TOP' }));

    const 이름들 = t.el.children.filter((c) => c.kind === 'element').map((c) => (c as { name: string }).name);
    const i = 이름들.indexOf('hp:caption');
    expect(i).toBe(3);
    expect(이름들.slice(0, 4)).toEqual(['hp:sz', 'hp:pos', 'hp:outMargin', 'hp:caption']);
    expect(이름들[4]).toBe('hp:inMargin');
  });

  it('순서 목록이 실측한 그대로다', () => {
    expect([...표자식순서]).toEqual([
      'hp:sz', 'hp:pos', 'hp:outMargin', 'hp:caption', 'hp:inMargin',
      'hp:cellzoneList', 'hp:tr', 'hp:label',
    ]);
  });
});

describe('검사는 탈과 주의를 나눈다', () => {
  it('격자에 구멍이 나면 탈이다', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    // 셀 하나를 지운다 → 그 칸을 덮는 셀이 없어진다
    const tr = t.줄들[0]!;
    const tc = childrenNamed(tr, 'hp:tc')[0]!;
    tr.children.splice(tr.children.indexOf(tc), 1);

    const 탈 = t.검사();
    expect(탈.some((x) => x.급 === '탈' && x.말.includes('덮는 셀이 없다'))).toBe(true);
  });

  it('폭 합이 안 맞는 것은 주의다 (한글은 읽는다)', () => {
    const { t } = 표읽기('ref-table-merge.hwpx');
    const 합친것 = t.셀들.find((c) => c.자리.colSpan > 1)!;
    합친것.크기주기(합친것.너비 + 500);

    const 탈 = t.검사();
    expect(탈.some((x) => x.급 === '주의' && x.말.includes('열 폭의 합'))).toBe(true);
    expect(t.탈만).toEqual([]);
  });

  it('검사가 헛돌지 않는다 — 멀쩡한 표는 안 걸린다', () => {
    const { t } = 표읽기('ref-table-merge.hwpx');
    expect(t.검사()).toEqual([]);
  });
});

describe('칸을 합친다', () => {
  /** 3x3 을 만들어 놓고 합쳐 본다 */
  function 표셋(): 표 {
    const c = HwpxContainer.open(fs.readFileSync(path.join(기준파일, 'ref-table-basic.hwpx')));
    const d = 문서.열기(c.save());
    return new 표(d.구역들[0]!.표들[0]!);
  }

  it('가로로 합치면 **덮인 셀이 사라지고 너비가 합쳐진다**', () => {
    const t = 표셋();
    const 앞폭 = t.열폭;
    const 앞셀수 = t.셀들.length;
    const r = 꺼내기(t.합치기(0, 0, 1, 2));

    expect(r.지운수).toBe(1);
    expect(t.셀들.length).toBe(앞셀수 - 1);
    const 합친것 = t.시작셀(0, 0)!;
    expect(합친것.자리.colSpan).toBe(2);
    // 실측 규칙: 합친 셀 너비 = 덮는 열 폭의 합. 안 맞추면 표 밖으로 삐져나온다
    expect(합친것.너비).toBe(앞폭[0]! + 앞폭[1]!);
    expect(t.탈만).toEqual([]);
  });

  it('세로로도 합쳐진다', () => {
    const t = 표셋();
    const r = 꺼내기(t.합치기(0, 0, 2, 1));
    expect(r.지운수).toBe(1);
    expect(t.시작셀(0, 0)!.자리.rowSpan).toBe(2);
    expect(t.탈만).toEqual([]);
  });

  it('네모로 합쳐진다 (2x2 면 셋이 사라진다)', () => {
    const t = 표셋();
    expect(꺼내기(t.합치기(0, 0, 2, 2)).지운수).toBe(3);
    expect(t.탈만).toEqual([]);
  });

  it('합친 뒤에도 **덮인 칸을 물으면 합친 셀을 준다**', () => {
    const t = 표셋();
    t.합치기(0, 0, 1, 2);
    expect(t.셀(0, 1)!.el).toBe(t.시작셀(0, 0)!.el);
    expect(t.시작셀(0, 1)).toBeUndefined();
  });

  it('표 밖으로 나가면 거절하고 **범위를 알려 준다**', () => {
    const r = 표셋().합치기(2, 2, 2, 2);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.어떻게).toContain('0~2');
  });

  it('합칠 것이 없으면 거절한다 (1x1)', () => {
    expect(표셋().합치기(0, 0, 1, 1).ok).toBe(false);
  });

  it('**이미 합쳐진 자리에 겹쳐 합치지 않는다**', () => {
    const t = 표셋();
    꺼내기(t.합치기(0, 0, 1, 2));
    // (0,1) 은 이제 덮인 칸이다 — 거기서 시작할 수 없다
    const r = t.합치기(0, 1, 1, 2);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain('이미 합쳐진');
  });

  it('범위 밖까지 덮는 셀이 끼면 손대지 않는다', () => {
    const t = 표셋();
    꺼내기(t.합치기(1, 0, 1, 3));      // 둘째 줄을 통째로 합친다
    const r = t.합치기(0, 0, 2, 2);   // 그 위를 2x2 로 덮으려 한다
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.어떻게).toContain('넓혀라');
    expect(t.탈만).toEqual([]);        // 거절했으니 표는 멀쩡해야 한다
  });

  it('합친 표를 저장했다 다시 열어도 그대로다', () => {
    const c = HwpxContainer.open(fs.readFileSync(path.join(기준파일, 'ref-table-basic.hwpx')));
    const d = 문서.열기(c.save());
    꺼내기(new 표(d.구역들[0]!.표들[0]!).합치기(0, 0, 1, 2));
    const 뒤 = 문서.열기(d.저장());
    const t = new 표(뒤.구역들[0]!.표들[0]!);
    expect(t.시작셀(0, 0)!.자리.colSpan).toBe(2);
    expect(t.탈만).toEqual([]);
  });
});

describe('줄을 넣는다', () => {
  /**
   * Draftsmith 지침이 못박은 것: "줄이 모자라면 줄을 넣는다. 표를 새로 만들지 않는다."
   * 양식의 표를 새로 만들면 테두리·열 폭·서식이 다 날아간다.
   */
  function 표셋(): 표 {
    const c = HwpxContainer.open(fs.readFileSync(path.join(기준파일, 'ref-table-basic.hwpx')));
    const d = 문서.열기(c.save());
    const s = d.구역들[0]!;
    return new 표(s.표들[0]!, s.source);
  }

  it('줄이 는다', () => {
    const t = 표셋();
    const 앞 = t.줄수;
    expect(꺼내기(t.줄넣기(앞, 2)).넣은수).toBe(2);
    expect(t.줄수).toBe(앞 + 2);
    expect(t.탈만).toEqual([]);
  });

  it('**열 폭이 그대로다** (본뜬 줄에서 딸려 온다)', () => {
    const t = 표셋();
    const 앞폭 = t.열폭;
    꺼내기(t.줄넣기(t.줄수, 1));
    expect(t.열폭).toEqual(앞폭);
  });

  it('**넣은 줄은 비어 있다** (본뜬 줄의 글이 딸려 오면 안 된다)', () => {
    const c = HwpxContainer.open(fs.readFileSync(path.join(기준파일, 'ref-table-basic.hwpx')));
    const d = 문서.열기(c.save());
    const s = d.구역들[0]!;
    const t = new 표(s.표들[0]!, s.source);
    // 본뜰 줄에 글을 넣어 둔다
    const 첫칸 = t.시작셀(0, 0)!;
    for (const x of findAll(첫칸.subList, 'hp:t')) (x as never as { children: unknown[] }).children = [];
    꺼내기(t.줄넣기(1, 1));
    const 새칸 = t.시작셀(1, 0)!;
    const 글 = findAll(새칸.subList, 'hp:t').map((x) => (x.children[0] as { raw?: string } | undefined)?.raw ?? '').join('');
    expect(글).toBe('');
  });

  it('맨 앞에도 넣을 수 있다', () => {
    const t = 표셋();
    const 앞 = t.줄수;
    꺼내기(t.줄넣기(0, 1));
    expect(t.줄수).toBe(앞 + 1);
    expect(t.탈만).toEqual([]);
  });

  it('줄 주소를 다시 매긴다 (안 하면 표 검사에 걸린다)', () => {
    const t = 표셋();
    꺼내기(t.줄넣기(1, 1));
    for (const [r, tr] of childrenNamed(t.el, 'hp:tr').entries()) {
      for (const tc of childrenNamed(tr, 'hp:tc')) {
        expect(getAttr(firstChildNamed(tc, 'hp:cellAddr')!, 'rowAddr')).toBe(String(r));
      }
    }
  });

  it('rowCnt 도 같이 오른다', () => {
    const t = 표셋();
    꺼내기(t.줄넣기(t.줄수, 3));
    expect(Number(getAttr(t.el, 'rowCnt'))).toBe(t.줄수);
  });

  it('표 밖 자리는 거절하고 **범위를 알려 준다**', () => {
    const r = 표셋().줄넣기(99, 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.어떻게).toContain('0~');
  });

  it('**세로로 합쳐진 셀을 가로지르면 손대지 않는다**', () => {
    const t = 표셋();
    꺼내기(t.합치기(0, 0, 3, 1));   // 첫 열을 세로로 셋 합친다
    const r = t.줄넣기(1, 1);       // 그 사이를 가로지르는 자리
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.어떻게).toContain('합침');
    expect(t.탈만).toEqual([]);      // 거절했으니 표는 멀쩡해야 한다
  });

  it('저장했다 다시 열어도 늘어난 채다', () => {
    const c = HwpxContainer.open(fs.readFileSync(path.join(기준파일, 'ref-table-basic.hwpx')));
    const d = 문서.열기(c.save());
    const s = d.구역들[0]!;
    const 앞 = new 표(s.표들[0]!).줄수;
    꺼내기(new 표(s.표들[0]!, s.source).줄넣기(앞, 2));
    const 뒤 = 문서.열기(d.저장());
    const t = new 표(뒤.구역들[0]!.표들[0]!);
    expect(t.줄수).toBe(앞 + 2);
    expect(t.탈만).toEqual([]);
  });
});

describe('안쪽 표를 안 건드린다', () => {
  /**
   * 학교 가정통신문은 **바깥 표(2x3) 의 한 칸에 회신서(3x7)** 가 들어 있다.
   *
   * 바깥 표에 줄을 넣을 때 안쪽 표를 건드리면 안 된다. 실제로 그랬다 —
   * `findAll(새줄, 'hp:cellSpan')` 이 안쪽 표까지 훑어 그 합침을 풀어 버렸고,
   * 저장 길목이 "(1,6) 칸을 덮는 셀이 없다" 로 잡았다.
   */
  function 겹친표(): { 바깥: 표; 안쪽: ElementNode } {
    const c = HwpxContainer.open(fs.readFileSync(path.join(기준파일, 'ref-table-basic.hwpx')));
    const d = 문서.열기(c.save());
    const s = d.구역들[0]!;
    const 바깥 = new 표(s.표들[0]!, s.source);

    // **마지막 줄**의 칸에 표를 하나 더 넣는다.
    // 줄넣기는 바로 위 줄을 본뜨므로, 첫 줄에 넣으면 본뜨는 줄에 안 걸려
    // 이 시험이 아무것도 안 본다. 실제로 그랬다 —
    // 고장을 냈는데 시험 40개가 다 통과했다.
    const 칸 = 바깥.시작셀(바깥.줄수 - 1, 0)!;
    const 안쪽 = 복제하기(s.표들[0]!, s.source);
    const 문단 = findAll(칸.subList, 'hp:p')[0]!;
    const 런 = childrenNamed(문단, 'hp:run')[0]!;
    appendChild(런, 안쪽);

    // **안쪽 표에 합친 칸을 만들어 둔다.**
    // 안 그러면 이 시험이 헛돈다 — 풀 합침이 없으니 무엇을 해도 통과한다.
    // 실제로 그랬다: `findAll` 로 훑게 고장 냈는데 시험 40개가 다 통과했다.
    꺼내기(new 표(안쪽).합치기(0, 0, 2, 1));
    return { 바깥, 안쪽 };
  }

  it('바깥 표에 줄을 넣어도 **안쪽 표의 합침이 안 풀린다**', () => {
    const { 바깥, 안쪽 } = 겹친표();
    const 안앞 = new 표(안쪽);
    expect(안앞.시작셀(0, 0)!.자리.rowSpan, '합쳐 둬야 이 시험이 뜻이 있다').toBe(2);

    꺼내기(바깥.줄넣기(바깥.줄수, 1));

    const 안뒤 = new 표(안쪽);
    expect(안뒤.시작셀(0, 0)!.자리.rowSpan, '안쪽 표의 합침을 풀면 안 된다').toBe(2);
    expect(안뒤.줄수).toBe(안앞.줄수);
    expect(안뒤.탈만, '안쪽 표가 어긋나면 안 된다').toEqual([]);
    expect(바깥.탈만).toEqual([]);
  });

  it('**넣은 줄에 안쪽 표가 딸려 오지 않는다**', () => {
    const { 바깥 } = 겹친표();
    const 앞표수 = findAll(바깥.el, 'hp:tbl').length;
    꺼내기(바깥.줄넣기(바깥.줄수, 1));
    expect(findAll(바깥.el, 'hp:tbl').length, '표가 복제되면 안 된다').toBe(앞표수);
  });

  it('안쪽 표의 줄 주소를 바깥 기준으로 덮어쓰지 않는다', () => {
    const { 바깥, 안쪽 } = 겹친표();
    꺼내기(바깥.줄넣기(0, 1));
    for (const [r, tr] of childrenNamed(안쪽, 'hp:tr').entries()) {
      for (const tc of childrenNamed(tr, 'hp:tc')) {
        expect(getAttr(firstChildNamed(tc, 'hp:cellAddr')!, 'rowAddr')).toBe(String(r));
      }
    }
  });
});

/**
 * **칸(열)을 넣고 뺀다.**
 *
 * 줄은 넣고 뺄 수 있는데 칸은 아무것도 없었다 — 짝이 반쪽이었다.
 * 여기서 제일 조심할 것은 **`colAddr` 이 절대 열 번호**라는 것이다.
 * 0,1,2… 로 다시 매기면 세로로 덮인 자리에서 어긋난다.
 */
describe('칸을 넣고 뺀다', () => {
  /** 줄마다 셀들의 `colAddr` 을 읽는다 */
  function 칸주소들(t: 표): number[][] {
    return childrenNamed(t.el, 'hp:tr').map((tr) =>
      childrenNamed(tr, 'hp:tc').map((tc) =>
        Number(getAttr(firstChildNamed(tc, 'hp:cellAddr')!, 'colAddr'))));
  }

  const 총폭 = (t: 표): number => t.열폭.reduce<number>((a, b) => a + (b ?? 0), 0);

  it('칸을 넣으면 **칸 수가 늘고 격자가 성하다**', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    const 앞칸 = t.칸수;
    const 앞줄 = t.줄수;
    꺼내기(t.칸넣기(1, 1));
    expect(t.칸수).toBe(앞칸 + 1);
    expect(t.줄수, '줄 수는 그대로여야 한다').toBe(앞줄);
    expect(t.셀들.length).toBe(앞줄 * (앞칸 + 1));
    expect(t.탈만).toEqual([]);
    // 줄마다 0,1,2,… 로 빠짐없이 이어져야 한다
    for (const 줄 of 칸주소들(t)) {
      expect(줄).toEqual([...줄.keys()]);
    }
  });

  /**
   * **표가 쪽 밖으로 나가면 안 된다.**
   *
   * 새 칸에 이웃 폭을 그대로 주면 표가 그만큼 넓어진다. 양식은 폭이 정해진 것이라
   * 있던 폭을 줄여 자리를 낸다.
   */
  it('**칸을 넣어도 표 전체 폭은 그대로다**', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    const 앞 = 총폭(t);
    expect(앞, '폭을 못 읽으면 이 시험은 아무것도 안 본다').toBeGreaterThan(0);
    꺼내기(t.칸넣기(0, 2));
    expect(총폭(t)).toBe(앞);
  });

  it('칸을 지우면 **칸 수가 줄고 폭은 그대로다**', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    const 앞칸 = t.칸수;
    const 앞폭 = 총폭(t);
    // 기준 파일에는 글이 들어 있어 기본으로는 막힌다
    const 막힘 = t.칸지우기(0, 1);
    expect(막힘.ok, '글이 든 칸을 그냥 지우면 안 된다').toBe(false);

    꺼내기(t.칸지우기(0, 1, false));
    expect(t.칸수).toBe(앞칸 - 1);
    expect(총폭(t)).toBe(앞폭);
    expect(t.탈만).toEqual([]);
    for (const 줄 of 칸주소들(t)) expect(줄).toEqual([...줄.keys()]);
  });

  it('**합친 칸을 가로지르는 자리에는 못 넣는다**', () => {
    const { t } = 표읽기('ref-table-merge.hwpx');
    const 합친것 = t.셀들.find((c) => c.자리.colSpan > 1);
    expect(합친것, '가로로 합친 셀이 없으면 이 시험은 아무것도 안 본다').toBeDefined();
    const a = 합친것!.자리;
    const r = t.칸넣기(a.col + 1, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.이유).toContain('가로지른다');
  });

  it('**합친 칸을 반만 지우려 하면 막는다**', () => {
    const { t } = 표읽기('ref-table-merge.hwpx');
    const a = t.셀들.find((c) => c.자리.colSpan > 1)!.자리;
    const r = t.칸지우기(a.col, 1, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.이유).toContain('반만');
  });

  it('**칸을 다 지우려 하면 막는다** (칸 없는 표는 한글이 안 연다)', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    const r = t.칸지우기(0, t.칸수, false);
    expect(r.ok).toBe(false);
  });

  /**
   * **여기가 이 갈래의 핵심이다.**
   *
   * `colAddr` 은 절대 열 번호이고, 위 줄에서 세로로 덮은 자리는 **건너뛴다.**
   * 실측 — 줄4 가 `col1 col5 col6` 만 갖고 0·2·3·4 는 위가 덮은 자리였다.
   * 0,1,2… 로 다시 매기면 그 줄이 통째로 왼쪽으로 밀린다.
   */
  it('**세로로 덮인 자리를 건너뛰고 주소를 매긴다**', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    // 세로 합침을 만들어 둔다 — 기준 파일에는 가로 합침만 있다
    꺼내기(t.합치기(0, 0, 2, 1));
    expect(t.시작셀(0, 0)!.자리.rowSpan, '합쳐 둬야 이 시험이 뜻이 있다').toBe(2);

    꺼내기(t.칸넣기(2, 1));
    expect(t.탈만).toEqual([]);

    const 주소 = 칸주소들(t);
    // 0째 줄은 합친 셀(0)과 나머지가 다 있다
    expect(주소[0]).toEqual([0, 1, 2, 3]);
    // **1째 줄은 0 이 위에서 덮여 1 부터 시작해야 한다**
    expect(주소[1], '덮인 자리를 건너뛰지 않으면 여기서 0 부터 나온다').toEqual([1, 2, 3]);
    expect(주소[2]).toEqual([0, 1, 2, 3]);
  });

  it('합친 칸을 **도로 푼다**', () => {
    const { t } = 표읽기('ref-table-merge.hwpx');
    const a = t.셀들.find((c) => c.자리.colSpan > 1 || c.자리.rowSpan > 1)!.자리;
    const 덮는수 = a.rowSpan * a.colSpan;
    const 앞셀수 = t.셀들.length;

    const r = t.합침풀기(a.row, a.col);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.세운수).toBe(덮는수 - 1);
    expect(t.셀들.length).toBe(앞셀수 + 덮는수 - 1);
    expect(t.시작셀(a.row, a.col)!.자리.colSpan).toBe(1);
    expect(t.시작셀(a.row, a.col)!.자리.rowSpan).toBe(1);
    expect(t.탈만).toEqual([]);
    for (const 줄 of 칸주소들(t)) expect(줄).toEqual([...줄.keys()]);
  });

  it('합쳐지지 않은 칸은 **풀 것이 없다고 말한다**', () => {
    const { t } = 표읽기('ref-table-basic.hwpx');
    const r = t.합침풀기(1, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.이유).toContain('1×1');
  });

  it('덮인 자리를 가리키면 **왼쪽 위를 가리키라고 한다**', () => {
    const { t } = 표읽기('ref-table-merge.hwpx');
    const a = t.셀들.find((c) => c.자리.colSpan > 1)!.자리;
    const r = t.합침풀기(a.row, a.col + 1);   // 덮인 자리
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.어떻게).toContain('왼쪽 위');
  });
});
