/**
 * 인라인 꾸밈 — `**굵게**` `[[강조]]`.
 *
 * 정부 문서 본문은 한 문단이 런 28개로 쪼개져 있기도 하다.
 * 그걸 글 안에 표시해서 한 번에 받는 것이 이 표시법이다.
 */

import { describe, expect, it } from 'vitest';
import { 꾸밈풀기, 꾸밈걷기, 꾸밈있나 } from '../src/index.js';
import { 꺼내기 } from '@hwpx/doc';

const 파랑 = '#0000FF';

describe('표시를 푼다', () => {
  it('표시가 없으면 조각 하나', () => {
    expect(꺼내기(꾸밈풀기('그냥 글'))).toEqual([{ 글: '그냥 글', 굵게: false }]);
  });

  it('굵게를 가른다', () => {
    expect(꺼내기(꾸밈풀기('앞 **가운데** 뒤'))).toEqual([
      { 글: '앞 ', 굵게: false },
      { 글: '가운데', 굵게: true },
      { 글: ' 뒤', 굵게: false },
    ]);
  });

  it('강조색을 가른다', () => {
    expect(꺼내기(꾸밈풀기('앞 [[핵심]] 뒤'))).toEqual([
      { 글: '앞 ', 굵게: false },
      { 글: '핵심', 굵게: false, 색: 파랑 },
      { 글: ' 뒤', 굵게: false },
    ]);
  });

  it('**색과 굵기는 따로다** — 실측에서 파란 글자의 3분의 2가 안 굵었다', () => {
    const 조각들 = 꺼내기(꾸밈풀기('[[색만]]'));
    expect(조각들[0]).toEqual({ 글: '색만', 굵게: false, 색: 파랑 });
  });

  it('겹쳐 쓸 수 있다 — 순서는 상관없다', () => {
    const a = 꺼내기(꾸밈풀기('**[[둘 다]]**'));
    const b = 꺼내기(꾸밈풀기('[[**둘 다**]]'));
    expect(a).toEqual([{ 글: '둘 다', 굵게: true, 색: 파랑 }]);
    expect(b).toEqual(a);
  });

  it('강조색을 바꿀 수 있다', () => {
    const 조각들 = 꺼내기(꾸밈풀기('[[빨강]]', { 강조색: '#FF0000' }));
    expect(조각들[0]!.색).toBe('#FF0000');
  });

  it('글자 그대로 쓰려면 앞에 역슬래시', () => {
    const 조각들 = 꺼내기(꾸밈풀기('\\*\\*별표\\*\\* 와 \\[\\[대괄호\\]\\]'));
    expect(조각들.map((x) => x.글).join('')).toBe('**별표** 와 [[대괄호]]');
    expect(조각들.every((x) => !x.굵게)).toBe(true);
  });

  it('한 문단에 여러 번 나와도 다 가른다', () => {
    const 조각들 = 꺼내기(꾸밈풀기('**하나**와 **둘**과 [[셋]]'));
    expect(조각들.filter((x) => x.굵게).length).toBe(2);
    expect(조각들.filter((x) => x.색).length).toBe(1);
  });

  it('풀어도 글자는 그대로다', () => {
    const 원글 = '’26년부터 **AI 모델 기반**을 개시하여 **수험생·학부모**들이';
    const 조각들 = 꺼내기(꾸밈풀기(원글));
    expect(조각들.map((x) => x.글).join('')).toBe('’26년부터 AI 모델 기반을 개시하여 수험생·학부모들이');
  });
});

describe('안 닫히면 못 한다고 한다', () => {
  it('`**` 가 하나면 어디까지인지 말한다', () => {
    const r = 꾸밈풀기('앞 **안 닫음');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain('안 닫혔다');
    expect(r.이유).toContain('**');
    // 몇 번째 글자인지 짚어 준다
    expect(r.이유).toMatch(/\d+번째/);
    expect(r.어떻게).toContain('앞 **안 닫음');
  });

  it('`[[` 가 안 닫히면 말한다', () => {
    const r = 꾸밈풀기('앞 [[안 닫음');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain('[[');
    expect(r.이유).toContain('안 닫혔다');
  });

  it('`]]` 가 먼저 나오면 말한다', () => {
    const r = 꾸밈풀기('앞 ]] 뒤');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain("']]'");
    expect(r.어떻게).toContain('\\]\\]');
  });

  it('**조용히 넘어가지 않는다** — 안 닫힌 것을 그냥 두면 문서가 통째로 굵어진다', () => {
    for (const 나쁜글 of ['**', '[[', ']]', '**앞 [[뒤', '앞 ** 가운데 [[ 뒤']) {
      expect(꾸밈풀기(나쁜글).ok, 나쁜글).toBe(false);
    }
  });
});

describe('거들기', () => {
  it('표시가 있나 본다', () => {
    expect(꾸밈있나('**굵게**')).toBe(true);
    expect(꾸밈있나('[[강조]]')).toBe(true);
    expect(꾸밈있나('그냥 글')).toBe(false);
  });

  it('표시를 걷어 맨 글만', () => {
    expect(꾸밈걷기('앞 **가운데** [[뒤]]')).toBe('앞 가운데 뒤');
    // 안 닫혀도 터지지 않는다 — 오류 메시지를 만들 때 쓰기 때문이다
    expect(꾸밈걷기('앞 **안 닫음')).toBe('앞 안 닫음');
  });
});

describe('빈 것', () => {
  it('빈 글은 빈 조각 하나', () => {
    expect(꺼내기(꾸밈풀기(''))).toEqual([{ 글: '', 굵게: false }]);
  });

  it('표시만 있고 글이 없어도 터지지 않는다', () => {
    expect(꺼내기(꾸밈풀기('****'))).toEqual([{ 글: '', 굵게: false }]);
  });
});
