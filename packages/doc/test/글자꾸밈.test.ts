/**
 * **취소선·첨자·강조점.**
 *
 * 셋 다 이름을 짐작하면 틀리는 자리다 (`자료/실측.md` 29항) —
 *
 *   - 취소선은 자식의 있고 없고가 아니라 `hh:strikeout/@shape` 다
 *   - 위 첨자는 `hh:supscript` 다. 규격 표에는 `SUPERSCRIPT` 로 적혀 있다
 *   - 강조점은 자식이 아니라 `hh:charPr/@symMark` 다
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findAll, firstChildNamed, getAttr, parseXml } from '@hwpx/owpml';
import { 문서 } from '../src/index.js';

const 기준파일 = path.join(path.resolve(__dirname, '../../..'), '자료', '기준파일');

/**
 * 문서를 열고 첫 문단에 서식을 **차례로** 준 뒤, 그 문단이 쓰는 charPr 을 돌려준다.
 *
 * 차례로 받는 까닭: 끄는 것을 재려면 **먼저 켜야** 한다. 바탕 글자모양은 이미
 * 취소선 `NONE` 에 첨자도 없어서, 그냥 끄면 「이미 그 글자모양이라 바뀐 것이
 * 없다」 가 난다 — 그건 옳은 동작이다.
 */
function 서식주고보기(...패치들: Record<string, unknown>[]) {
  const d = 문서.열기(fs.readFileSync(path.join(기준파일, 'ref-text-basic.hwpx')));
  d.ID매기기();
  const 첫문단 = d.구역들.flatMap((s) => s.문단들)[0]!;
  const id = d.이름표.아이디(첫문단.el);
  let 마지막 = '';
  for (const 패치 of 패치들) {
    const r = d.글자서식주기(id, 패치 as never);
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);
    if (r.ok) 마지막 = r.value.charPrId;
  }

  // 저장했다 다시 열어 **파일에 실제로 들어갔는지** 본다
  const 다시 = 문서.열기(d.저장());
  const 머리 = parseXml(다시.컨테이너.readText('Contents/header.xml')).root;
  const charPr = findAll(머리, 'hh:charPr').find((e) => getAttr(e, 'id') === 마지막);
  expect(charPr, '새로 만든 charPr 이 파일에 없다').toBeDefined();
  return charPr!;
}

describe('글자 꾸밈 — 이름을 짐작하지 않는다', () => {
  it('**취소선은 @shape 로 켠다** (자식 있고 없고가 아니다)', () => {
    const 켬 = 서식주고보기({ 취소선: true });
    const so = firstChildNamed(켬, 'hh:strikeout');
    expect(so, 'hh:strikeout 요소가 있어야 한다').toBeDefined();
    expect(getAttr(so!, 'shape')).toBe('SOLID');

    // **켰다 꺼야 잰다.** 바탕이 이미 NONE 이라 그냥 끄면 무동작이다.
    const 끔 = 서식주고보기({ 취소선: true }, { 취소선: false });
    expect(getAttr(firstChildNamed(끔, 'hh:strikeout')!, 'shape')).toBe('NONE');
  });

  it('**위 첨자는 hh:supscript 다** (규격은 SUPERSCRIPT 라 적었다)', () => {
    const c = 서식주고보기({ 첨자: 'super' });
    expect(firstChildNamed(c, 'hh:supscript'), 'hh:supscript 가 없다').toBeDefined();
    expect(firstChildNamed(c, 'hh:superscript'), '규격 이름으로 넣으면 한글이 못 읽는다')
      .toBeUndefined();
  });

  it('**첨자 둘은 같이 못 켠다**', () => {
    const 위 = 서식주고보기({ 첨자: 'super' });
    expect(firstChildNamed(위, 'hh:subscript')).toBeUndefined();
    const 아래 = 서식주고보기({ 첨자: 'sub' });
    expect(firstChildNamed(아래, 'hh:subscript')).toBeDefined();
    expect(firstChildNamed(아래, 'hh:supscript')).toBeUndefined();
    const 없앰 = 서식주고보기({ 첨자: 'super' }, { 첨자: 'none' });
    expect(firstChildNamed(없앰, 'hh:supscript')).toBeUndefined();
    expect(firstChildNamed(없앰, 'hh:subscript')).toBeUndefined();
  });

  it('**강조점은 자식이 아니라 @symMark 다**', () => {
    const c = 서식주고보기({ 강조점: 'DOT_ABOVE' });
    expect(getAttr(c, 'symMark')).toBe('DOT_ABOVE');
    expect(findAll(c, 'hh:diacSym').length, '자식으로 넣으면 안 된다').toBe(0);
  });

  it('셋을 한꺼번에 줘도 서로 안 지운다', () => {
    const c = 서식주고보기({ 취소선: true, 첨자: 'sub', 강조점: 'DOT_ABOVE', 굵게: true });
    expect(getAttr(firstChildNamed(c, 'hh:strikeout')!, 'shape')).toBe('SOLID');
    expect(firstChildNamed(c, 'hh:subscript')).toBeDefined();
    expect(getAttr(c, 'symMark')).toBe('DOT_ABOVE');
    expect(firstChildNamed(c, 'hh:bold')).toBeDefined();
  });

  it('**서식을 줘도 문서가 성한 채로 남는다**', () => {
    const d = 문서.열기(fs.readFileSync(path.join(기준파일, 'ref-text-basic.hwpx')));
    d.ID매기기();
    const id = d.이름표.아이디(d.구역들.flatMap((s) => s.문단들)[0]!.el);
    expect(d.글자서식주기(id, { 취소선: true, 첨자: 'super', 강조점: 'DOT_ABOVE' } as never).ok).toBe(true);
    expect(d.검사(), '서식을 줬더니 흠이 생겼다').toEqual([]);
  });
});
