/**
 * 고칠 때 무슨 일이 벌어지는지 확인한다.
 *
 * 두 가지가 핵심이다.
 *   1. 고친 것이 **정말 저장되나** (dirty 를 잊으면 조용히 사라진다)
 *   2. 안 고친 데는 **그대로인가** (남의 문서를 망치면 안 된다)
 */

import { describe, expect, it } from 'vitest';
import {
  appendChild, createElement, createText, escapeXml, getAttr, getAttrNumber,
  insertAfter, insertBefore, parseXml, removeAttr, removeNode, replaceNode,
  serializeXml, setAttr, setText, textOf, unescapeXml,
  findAll, findFirst, childrenNamed, closestNamed, pathOf, countByName,
  굵기맞추기, hwpToPt, ptToHwp, pt, hwp,
} from '../src/index.js';

const 표본 = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="…">
  <hp:p id="1" paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>첫 줄 &amp; 표시</hp:t></hp:run></hp:p>
  <hp:p id="2" paraPrIDRef="0"><hp:run charPrIDRef="1"><hp:t>둘째 줄</hp:t></hp:run></hp:p>
</hs:sec>`;

describe('속성 고치기', () => {
  it('값을 바꾸면 그 자리만 바뀐다', () => {
    const doc = parseXml(표본);
    const p = findAll(doc.root, 'hp:p')[1]!;
    setAttr(p, 'paraPrIDRef', '7');

    const 나온것 = serializeXml(doc);
    expect(나온것).toContain('<hp:p id="2" paraPrIDRef="7">');
    expect(나온것).toContain('<hp:p id="1" paraPrIDRef="0">');   // 첫째는 그대로
    expect(나온것.split('\n')[0]).toBe(표본.split('\n')[0]);      // 선언도 그대로
  });

  it('같은 값을 넣으면 아무것도 안 바뀐다', () => {
    const doc = parseXml(표본);
    const p = findAll(doc.root, 'hp:p')[0]!;
    setAttr(p, 'paraPrIDRef', '0');           // 원래 값과 같다
    expect(serializeXml(doc)).toBe(표본);      // 바이트가 그대로
  });

  it('없던 속성은 뒤에 붙는다', () => {
    const doc = parseXml(표본);
    const p = findAll(doc.root, 'hp:p')[0]!;
    setAttr(p, 'pageBreak', '1');
    expect(serializeXml(doc)).toContain('<hp:p id="1" paraPrIDRef="0" pageBreak="1">');
  });

  it('뺄 수 있다. 없는 걸 빼면 false 를 준다', () => {
    const doc = parseXml(표본);
    const p = findAll(doc.root, 'hp:p')[0]!;
    expect(removeAttr(p, 'paraPrIDRef')).toBe(true);
    expect(removeAttr(p, '없는것')).toBe(false);
    expect(serializeXml(doc)).toContain('<hp:p id="1">');
  });

  it('특수문자는 이스케이프해서 넣는다', () => {
    const doc = parseXml(표본);
    const p = findAll(doc.root, 'hp:p')[0]!;
    setAttr(p, 'name', 'a<b&c"d');
    const 나온것 = serializeXml(doc);
    expect(나온것).toContain('name="a&lt;b&amp;c&quot;d"');
    // 다시 읽으면 원래 값
    expect(getAttr(findAll(parseXml(나온것).root, 'hp:p')[0]!, 'name')).toBe('a<b&c"d');
  });
});

describe('글자 읽고 쓰기', () => {
  it('읽을 때는 이스케이프를 푼다', () => {
    const doc = parseXml(표본);
    const t = findFirst(doc.root, 'hp:t')!;
    expect(textOf(t)).toBe('첫 줄 & 표시');
  });

  it('쓸 때는 이스케이프를 건다', () => {
    const doc = parseXml(표본);
    const t = findFirst(doc.root, 'hp:t')!;
    setText(t, '바뀐 <글> & 표시');
    const 나온것 = serializeXml(doc);
    expect(나온것).toContain('<hp:t>바뀐 &lt;글&gt; &amp; 표시</hp:t>');
    expect(나온것).toContain('둘째 줄');    // 나머지는 그대로
  });

  it('숫자 속성을 숫자로 준다', () => {
    const doc = parseXml(표본);
    expect(getAttrNumber(findAll(doc.root, 'hp:p')[1]!, 'id')).toBe(2);
    expect(getAttrNumber(findAll(doc.root, 'hp:p')[1]!, '없는것')).toBeUndefined();
  });
});

describe('노드 넣고 빼기', () => {
  it('뒤에 붙인다', () => {
    const doc = parseXml(표본);
    // 한글 구조 그대로: hp:p > hp:run > hp:t > 글자
    const 새문단 = createElement('hp:p', { id: '3' }, [
      createElement('hp:run', { charPrIDRef: '0' }, [
        createElement('hp:t', {}, [createText('셋째 줄')]),
      ]),
    ]);
    appendChild(doc.root, 새문단);
    const 나온것 = serializeXml(doc);
    expect(나온것).toContain('<hp:p id="3"><hp:run charPrIDRef="0"><hp:t>셋째 줄</hp:t></hp:run></hp:p>');
    expect(나온것.indexOf('셋째')).toBeGreaterThan(나온것.indexOf('둘째'));
  });

  it('앞·뒤에 끼운다', () => {
    const doc = parseXml(표본);
    const 둘째 = findAll(doc.root, 'hp:p')[1]!;
    expect(insertBefore(둘째, createElement('mark', { at: 'before' }))).toBe(true);
    expect(insertAfter(둘째, createElement('mark', { at: 'after' }))).toBe(true);

    const 나온것 = serializeXml(doc);
    expect(나온것.indexOf('at="before"')).toBeLessThan(나온것.indexOf('id="2"'));
    expect(나온것.indexOf('at="after"')).toBeGreaterThan(나온것.indexOf('둘째 줄'));
  });

  it('뺀다. 부모가 없으면 false', () => {
    const doc = parseXml(표본);
    const 첫째 = findAll(doc.root, 'hp:p')[0]!;
    expect(removeNode(첫째)).toBe(true);
    expect(serializeXml(doc)).not.toContain('첫 줄');
    expect(removeNode(doc.root)).toBe(false);      // 뿌리는 부모가 없다
  });

  it('갈아 끼운다', () => {
    const doc = parseXml(표본);
    const 첫째 = findAll(doc.root, 'hp:p')[0]!;
    expect(replaceNode(첫째, createElement('hp:p', { id: '9' }))).toBe(true);
    const 나온것 = serializeXml(doc);
    expect(나온것).toContain('<hp:p id="9"/>');
    expect(나온것).not.toContain('첫 줄');
  });
});

describe('찾기', () => {
  it('바로 아래 자식만 vs 자손 전부', () => {
    const doc = parseXml('<a><b><b/></b><b/></a>');
    expect(childrenNamed(doc.root, 'b')).toHaveLength(2);   // 바로 아래만
    expect(findAll(doc.root, 'b')).toHaveLength(3);          // 손자까지
  });

  it('위로 올라가 조상을 찾는다', () => {
    const doc = parseXml(표본);
    const t = findFirst(doc.root, 'hp:t')!;
    expect(closestNamed(t, 'hp:p')?.name).toBe('hp:p');
    expect(closestNamed(t, '없는것')).toBeUndefined();
    expect(pathOf(t)).toBe('hs:sec > hp:p > hp:run > hp:t');
  });

  it('무엇이 몇 개 들었는지 센다', () => {
    const 셈 = countByName(parseXml(표본).root);
    expect(셈.get('hp:p')).toBe(2);
    expect(셈.get('hp:t')).toBe(2);
  });
});

describe('단위', () => {
  it('pt 와 HWPUNIT 을 오간다', () => {
    expect(ptToHwp(pt(11))).toBe(1100);
    expect(hwpToPt(hwp(1100))).toBe(11);
    expect(ptToHwp(pt(10.5))).toBe(1050);
  });

  it('테두리 굵기는 한글이 받는 값으로 맞춘다', () => {
    // 숫자와 mm 사이에 칸이 있어야 한글이 읽는다
    expect(굵기맞추기('0.4')).toBe('0.4 mm');
    expect(굵기맞추기(0.13)).toBe('0.12 mm');    // 가장 가까운 것
    expect(굵기맞추기('말도 안 되는 값')).toBe('0.12 mm');
  });
});

describe('이스케이프', () => {
  it('숫자 참조까지 푼다', () => {
    expect(unescapeXml('&#65;&#x42;&amp;&lt;&gt;&quot;&apos;')).toBe('AB&<>"\'');
  });
  it('되돌릴 수 있다', () => {
    const 원본 = `가 & 나 < 다 > 라 " 마 ' 바`;
    expect(unescapeXml(escapeXml(원본))).toBe(원본);
  });
});
