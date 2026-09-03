/**
 * HTML 로 엮기.
 *
 * 여기 있는 시험은 **거의 다 실제로 틀렸던 것**이다.
 * 한글이 구운 PDF 와 대 보고서야 알았고, 알고 나서 여기에 못 박았다.
 *
 *   - `hh:strikeout` 은 `type` 이 아니라 `shape` 다 → 문서 전체에 취소선이 그어졌다
 *   - `shape="3D"` 도 「안 그음」이다 → 업무계획 charPr 125개 중 124개가 그것이었다
 *   - `landscape="WIDELY"` 는 가로가 아니다 → A4 세로가 가로 PDF 로 나왔다
 *   - `hh:margin` 은 `hp:switch` 안에 있다 → 순진하게 찾으면 여백이 통째로 0 이 된다
 *   - `hp:container` 를 건너뛰면 **절 제목이 통째로 사라진다**
 *   - 뜬 개체가 문단 내어쓰기를 따라가면 쪽 밖으로 밀려 **글이 잘린다**
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { 문서 } from '@hwpx/doc';
import { parseXml, findAll, getAttr, firstChildNamed, type ElementNode } from '@hwpx/owpml';
import { 엮기, 서식장 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');
const 기준파일 = path.join(뿌리, '자료', '기준파일');
const 표본 = path.join(뿌리, '자료', '표본');

function 열기(곳: string, 이름: string): 문서 {
  return 문서.열기(fs.readFileSync(path.join(곳, 이름)));
}

function 엮은(이름: string, 설정?: Parameters<typeof 엮기>[1]) {
  return 엮기(열기(기준파일, 이름), 설정);
}

describe('글자 꾸밈 — 켜진 것만 켠다', () => {
  /**
   * **이것 하나로 문서 한 장이 못 쓰게 됐다.** 밑줄은 `type` 으로 끄는데
   * 취소선은 `shape` 로 끈다. `type` 을 보면 늘 `undefined` 라
   * 「있으니 켜진 것」 으로 읽혀 모든 글자에 줄이 그어졌다.
   */
  it('**`hh:strikeout shape="NONE"` 은 취소선이 아니다**', () => {
    const d = 열기(기준파일, 'ref-para-indent.hwpx');
    const 머리 = parseXml(d.머리.toXml()).root;
    const 것들 = findAll(머리, 'hh:strikeout');
    expect(것들.length, '취소선 요소가 없으면 이 시험은 아무것도 안 본다').toBeGreaterThan(0);
    // 요소는 다 있는데 값이 다 NONE 이다 — 「있으니 켜진 것」 으로 읽으면 안 된다
    expect(것들.every((s) => getAttr(s, 'shape') === 'NONE')).toBe(true);
    expect(엮기(d).html).not.toContain('line-through');
  });

  it('**정말 그은 것은 긋는다** — 안 그리면 반대로 틀린 것이다', () => {
    // ref-text-basic 은 밑줄(charPr 9)과 취소선(charPr 10~12)을 실제로 쓴다.
    // 「NONE 을 거른다」 를 세게 잡다가 진짜까지 지우면 여기서 걸린다.
    const d = 열기(기준파일, 'ref-text-basic.hwpx');
    const 머리 = parseXml(d.머리.toXml()).root;
    expect(findAll(머리, 'hh:underline').some((u) => getAttr(u, 'type') === 'BOTTOM')).toBe(true);
    expect(findAll(머리, 'hh:strikeout').some((s) => getAttr(s, 'shape') === 'SOLID')).toBe(true);
    const html = 엮기(d).html;
    expect(html).toContain('underline');
    expect(html).toContain('line-through');
  });

  it('**`shape="3D"` 도 취소선이 아니다**', () => {
    // 교육부 업무계획은 charPr 125개 가운데 124개가 3D 였다.
    // 발표된 정부 계획서 전체에 줄이 그어져 있을 리 없다.
    const d = 열기(path.join(표본, '공개'), '교육부-2026업무계획.hwpx');
    const 머리 = parseXml(d.머리.toXml()).root;
    const 삼디 = findAll(머리, 'hh:charPr').filter((c) => {
      const s = firstChildNamed(c, 'hh:strikeout');
      return s !== undefined && getAttr(s, 'shape') === '3D';
    });
    expect(삼디.length, '3D 인 charPr 이 없으면 이 시험은 아무것도 안 본다')
      .toBeGreaterThan(50);
    expect(엮기(d).html).not.toContain('line-through');
  });

  it('`hh:underline type="NONE"` 은 밑줄이 아니다', () => {
    const d = 열기(기준파일, 'ref-para-indent.hwpx');
    const 머리 = parseXml(d.머리.toXml()).root;
    const 것들 = findAll(머리, 'hh:underline');
    expect(것들.length, '밑줄 요소가 없으면 이 시험은 아무것도 안 본다').toBeGreaterThan(0);
    expect(것들.every((u) => getAttr(u, 'type') === 'NONE')).toBe(true);
    expect(엮기(d).html).not.toContain('underline');
  });

  it('굵게는 **속성 없이 있기만** 하면 켜진 것이다', () => {
    const d = 열기(기준파일, 'ref-text-basic.hwpx');
    const 머리 = parseXml(d.머리.toXml()).root;
    const 굵은것 = findAll(머리, 'hh:bold');
    expect(굵은것.length, '굵은 글자가 없으면 이 시험은 아무것도 안 본다')
      .toBeGreaterThan(0);
    // 값이 있어서 켜지는 게 아니다 — 요소가 있으면 켜진다
    expect(굵은것[0]!.attrs.length).toBe(0);
    expect(엮기(d).html).toContain('font-weight:bold');
  });

  it('글꼴 이름과 크기가 실린다', () => {
    const r = 엮은('ref-text-basic.hwpx');
    expect(r.html).toMatch(/font-family:'[^']+'/);
    expect(r.html).toMatch(/font-size:\d+(\.\d+)?pt/);
  });
});

describe('문단 모양 — `hp:switch` 안을 봐야 한다', () => {
  /**
   * `hh:margin` 은 `hh:paraPr` 의 직속 자식이 **아니다.**
   * `hp:switch > hp:default` 안에 있다. 표본 33편 2565개 paraPr 을
   * 직속으로 찾으니 **하나도 안 나왔다.**
   */
  it('**여백을 `hp:default` 에서 읽는다** (직속에 없다)', () => {
    const d = 열기(기준파일, 'ref-para-indent.hwpx');
    const 머리 = parseXml(d.머리.toXml()).root;

    /** `hp:switch > hp:default > hh:margin > hc:intent` 에 적힌 값 */
    const 적힌들여쓰기 = (pp: ElementNode): number => {
      const sw = firstChildNamed(pp, 'hp:switch');
      const def = sw === undefined ? undefined : firstChildNamed(sw, 'hp:default');
      const m = def === undefined ? undefined : firstChildNamed(def, 'hh:margin');
      const it = m === undefined ? undefined : firstChildNamed(m, 'hc:intent');
      return Number(it === undefined ? 0 : getAttr(it, 'value') ?? 0);
    };

    // **0 이 아닌 것을 골라야 시험이 뜻을 갖는다.** 대부분의 paraPr 은 0 이라,
    // 아무거나 집으면 못 읽어도 0 이 나와 그냥 통과한다.
    const pp = findAll(머리, 'hh:paraPr').find((x) => 적힌들여쓰기(x) !== 0);
    expect(pp, '들여쓰기를 준 paraPr 이 없으면 이 시험은 아무것도 안 본다').toBeDefined();
    // 직속에는 없다 — 여기서 못 박는다
    expect(firstChildNamed(pp!, 'hh:margin')).toBeUndefined();

    const 모양 = new 서식장(머리).문단모양(getAttr(pp!, 'id'));
    expect(모양).toBeDefined();
    // hp:default 값이 한글 API 가 말하는 HWPUNIT 이다 (자료/실측.md 1항)
    expect(모양!.들여쓰기).toBe(적힌들여쓰기(pp!));
    expect(모양!.들여쓰기, '들여쓰기가 0 이면 switch 를 못 읽은 것이다').not.toBe(0);
  });

  it('정렬이 CSS 로 옮겨진다', () => {
    const r = 엮은('ref-para-align.hwpx');
    expect(r.html).toContain('text-align:center');
  });

  it('줄 간격은 `PERCENT` 를 백분율로 낸다', () => {
    expect(엮은('ref-para-indent.hwpx').html).toMatch(/line-height:\d+%/);
  });
});

describe('쪽 — 치수를 믿는다', () => {
  /**
   * `landscape="WIDELY"` 를 가로로 읽어 뒤집었더니 A4 세로 문서가
   * **가로 PDF(842 × 595pt)** 로 나왔다. 세어 보니 구역 36개 가운데
   * **35개가 `WIDELY`** 인데 치수는 전부 세로꼴이었다.
   */
  it('**`landscape="WIDELY"` 라도 치수가 세로면 세로다**', () => {
    const d = 열기(표본 + '/로컬', '양식-계획서서식.hwpx');
    const 구역 = d.구역들[0]!;
    const pp = firstChildNamed(구역.쪽설정!, 'hp:pagePr')!;
    expect(getAttr(pp, 'landscape'), '이 문서가 WIDELY 가 아니면 시험이 헛돈다').toBe('WIDELY');
    expect(구역.용지크기!.너비).toBeLessThan(구역.용지크기!.높이);

    const m = /@page \{ size: ([\d.]+)mm ([\d.]+)mm/.exec(엮기(d).html);
    expect(m, '@page 규칙이 없다').not.toBeNull();
    expect(Number(m![1]), '세로 문서인데 가로로 냈다').toBeLessThan(Number(m![2]));
  });

  it('쪽 여백이 padding 으로 간다', () => {
    const r = 엮은('ref-page-setup.hwpx');
    expect(r.html).toMatch(/padding-left:[\d.]+mm/);
  });
});

describe('표', () => {
  it('열 폭을 `<colgroup>` 으로 못 박는다', () => {
    // 안 그러면 브라우저가 글 길이를 보고 제 맘대로 폭을 정한다
    const r = 엮은('ref-table-basic.hwpx');
    expect(r.html).toContain('<colgroup>');
    expect(r.html).toMatch(/<col style="width:[\d.]+mm">/);
    expect(r.html).toContain('table-layout: fixed');
  });

  it('합친 칸이 `rowspan`·`colspan` 으로 간다', () => {
    const r = 엮은('ref-table-merge.hwpx');
    expect(r.html).toMatch(/rowspan="\d"|colspan="\d"/);
  });

  it('**안 그리는 테두리는 안 그린다**', () => {
    const d = 열기(기준파일, 'ref-table-basic.hwpx');
    const 머리 = parseXml(d.머리.toXml()).root;
    const 없는것 = findAll(머리, 'hh:borderFill').some((bf) => {
      const b = firstChildNamed(bf, 'hh:leftBorder');
      return b !== undefined && getAttr(b, 'type') === 'NONE';
    });
    expect(없는것, 'NONE 테두리가 없으면 이 시험은 아무것도 안 본다').toBe(true);
    const 셀들 = 엮기(d).html.match(/<td[^>]*>/g) ?? [];
    expect(셀들.length).toBeGreaterThan(0);
    // NONE 인 자리에 선을 그으면 원본에 없는 격자가 생긴다
    expect(엮기(d).html).not.toContain('border-left:0.12mm solid #000000;border-right:0.12mm solid #000000;border-top:0.12mm solid #000000;border-bottom:0.12mm solid #000000;background');
  });

  it('**표를 `<p>` 안에 넣지 않는다**', () => {
    // 런 49168개 가운데 1269개가 표를 물고 있다. `<p>` 안의 `<table>` 은
    // 규격 위반이라 브라우저가 표를 문단 밖으로 끌어내 차례가 뒤집힌다.
    const r = 엮은('ref-table-nested.hwpx');
    expect(r.표수).toBeGreaterThan(0);
    expect(r.html).not.toMatch(/<p[ >]/);
    expect(r.html).toContain('<div class="p"');
  });

  it('표 안의 표까지 센다', () => {
    expect(엮은('ref-table-nested.hwpx').표수).toBeGreaterThanOrEqual(2);
  });
});

describe('그림', () => {
  it('알맹이를 `data:` 로 박는다 — 딸린 폴더가 없다', () => {
    const r = 엮은('ref-image.hwpx');
    expect(r.그림수).toBeGreaterThan(0);
    expect(r.html).toMatch(/<img src="data:image\/[a-z+]+;base64,/);
  });

  it('`images: false` 면 자리만 잡고 가벼워진다', () => {
    const 박은것 = 엮은('ref-image.hwpx');
    const 뺀것 = 엮은('ref-image.hwpx', { 그림: false });
    expect(뺀것.html).not.toContain('data:image');
    expect(Buffer.byteLength(뺀것.html)).toBeLessThan(Buffer.byteLength(박은것.html));
    // **자리는 남는다** — 없애면 아래가 통째로 올라온다
    expect(뺀것.html).toContain('빈그림');
  });
});

describe('묶은 개체 — 건너뛰면 글이 사라진다', () => {
  /**
   * 학교·관공서 문서의 「제목 띠」가 배경 그림 + 글상자를 묶어 놓은 꼴이다.
   * 통째로 지나쳤더니 계획서에서 **절 제목 넷이 다 빠졌다.**
   */
  const 계획서 = () => 열기(path.join(표본, '로컬'), '양식-계획서서식.hwpx');

  it('**묶음 안의 제목 글이 나온다**', () => {
    const d = 계획서();
    expect(findAll(d.구역들[0]!.root, 'hp:container').length,
      '묶음이 없으면 이 시험은 아무것도 안 본다').toBeGreaterThan(0);
    const html = 엮기(d).html;
    for (const 제목 of ['추진 개요', '세부 추진 내용', '예산 집행 계획', '기대 효과']) {
      expect(html, `묶음 안의 «${제목}» 이 빠졌다`).toContain(제목);
    }
  });

  it('묶음 안의 그림도 나온다', () => {
    expect(엮기(계획서()).그림수).toBeGreaterThan(0);
  });

  /**
   * 뜬 개체를 그냥 줄 안에 넣었더니, 그 문단에 걸린 **내어쓰기 −25.26mm** 를
   * 따라가 제목 띠가 쪽 왼쪽 밖으로 밀려 나갔다. 잘린 만큼 글이 사라져
   * 「예산 집행 계획」이 「행 계획」으로 보였다.
   */
  it('**뜬 개체는 문단 들여쓰기를 안 따라간다**', () => {
    const html = 엮기(계획서()).html;
    expect(html, '뜬 개체를 감싸는 자리가 없다').toContain('class="뜬것"');
    expect(html).toContain('.뜬것 { text-indent: 0');
    // 내어쓰기가 걸린 문단이 정말 있어야 이 시험이 뜻을 갖는다
    expect(html, '내어쓰기가 없으면 이 시험은 아무것도 안 본다').toMatch(/text-indent:-[\d.]+mm/);
  });
});

describe('안전하게 낸다', () => {
  it('**글자를 HTML 로 감싼다** — `&` 를 먼저 바꾼다', () => {
    const d = 문서.새로();
    const p = d.구역들[0]!.문단들[0]!;
    expect(p.글바꾸기('a < b & c > d "따옴표"').ok).toBe(true);
    const html = 엮기(d).html;
    expect(html).toContain('a &lt; b &amp; c &gt; d');
    // 두 번 감싸면 `&amp;lt;` 가 된다
    expect(html).not.toContain('&amp;lt;');
  });

  it('빈 문단도 자리를 차지한다', () => {
    // 양식의 빈 줄은 뜻이 있는 자리다. 없애면 아래가 통째로 올라온다
    expect(엮은('ref-blank.hwpx').html).toContain('<br>');
  });

  it('제목을 안 주면 첫 글줄을 쓴다', () => {
    const r = 엮은('ref-text-basic.hwpx');
    expect(r.html).toMatch(/<title>.+<\/title>/);
    expect(r.html).not.toContain('<title></title>');
  });

  it('제목에 든 `<` 도 감싼다', () => {
    const r = 엮은('ref-text-basic.hwpx', { 제목: '가<b>나' });
    expect(r.html).toContain('<title>가&lt;b&gt;나</title>');
  });
});

describe('표본 아홉 편을 다 엮는다', () => {
  const 것들: string[] = [];
  for (const 갈래 of ['공개', '로컬']) {
    const 곳 = path.join(표본, 갈래);
    if (!fs.existsSync(곳)) continue;
    for (const n of fs.readdirSync(곳)) {
      if (n.endsWith('.hwpx')) 것들.push(path.join(곳, n));
    }
  }

  it('표본이 있어야 아래 시험이 뜻을 갖는다', () => {
    expect(것들.length).toBeGreaterThanOrEqual(9);
  });

  for (const f of 것들) {
    it(`${path.basename(f, '.hwpx')} — 깨지지 않고 글이 다 실린다`, () => {
      const d = 문서.열기(fs.readFileSync(f));
      const r = 엮기(d, { 그림: false });
      expect(r.html.startsWith('<!doctype html>')).toBe(true);
      expect(r.html.trimEnd().endsWith('</html>')).toBe(true);
      expect(r.문단수).toBeGreaterThan(0);

      // **문서에 있는 글은 HTML 에도 있어야 한다.** 표·칸·묶음 어디에 들었든.
      //
      // 태그를 걷고 견준다. 한 문단의 글이 런 여럿에 나뉘어 있으면
      // HTML 에서는 `</span><span …>` 이 사이에 끼어, 날글로는 못 찾는다.
      const 벗긴것 = r.html.replace(/<[^>]*>/g, '');

      // **글 사이에 표가 낀 문단은 빼고 잰다.** 실측으로 글과 표가 같은 런에 든 것이
      // 1134개다 — `hp:t + hp:tbl + hp:t` 꼴이면 문단의 글은 이어 붙어 있어도
      // HTML 에서는 그 사이에 표 내용이 들어간다. 그게 맞는 차례다.
      const 순한문단인가 = (p: { 런들: ElementNode[] }): boolean =>
        p.런들.every((r2) => r2.children.every(
          (x) => x.kind !== 'element' || x.name === 'hp:t' || x.name === 'hp:lineBreak',
        ));

      const 글들 = d.구역들
        .flatMap((s) => s.모든문단들.filter(순한문단인가).map((p) => p.글.trim()))
        .filter((t) => t.length >= 4 && !/[<>&"]/.test(t));
      expect(글들.length, '재 볼 글이 없으면 이 시험은 아무것도 안 본다').toBeGreaterThan(10);
      const 빠진것 = 글들.filter((t) => !벗긴것.includes(t)).slice(0, 3);
      expect(빠진것, `HTML 에 빠진 글: ${빠진것.join(' / ')}`).toEqual([]);
    });
  }
});
