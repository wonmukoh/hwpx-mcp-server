/**
 * **문단 번호·글머리표 세기** — 한글이 그려 주는 「1.」「가.」「∘」.
 *
 * 표본으로는 한글 내보내기와 한 글자도 안 틀린 것을 쟀다(2026-10-07, 번호 55·10·1·3개).
 * 여기서는 표본에 없는 갈래 — 수준이 내려갔다 올라올 때, 틀 글에 윗수준이 섞일 때 — 를 잰다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseXml, findAll } from '@hwpx/owpml';
import { 번호꼴, 번호매기기, 문서, type 번호정의 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');

function 정의(틀들: Record<number, string>, 꼴들: Record<number, string>): 번호정의 {
  const 수준들 = new Map(Object.entries(틀들).map(([k, 틀]) => [Number(k), { 시작: 1, 꼴: 꼴들[Number(k)] ?? 'DIGIT', 틀 }]));
  return {
    머리: new Map([
      ['1', { 갈래: 'NUMBER', idRef: '7', 수준: 0 }],
      ['2', { 갈래: 'NUMBER', idRef: '7', 수준: 1 }],
      ['3', { 갈래: 'NUMBER', idRef: '7', 수준: 2 }],
      ['9', { 갈래: 'BULLET', idRef: '4', 수준: 0 }],
    ]),
    번호틀: new Map([['7', 수준들]]),
    글머리: new Map([['4', '∘']]),
  };
}

function 문단들(모양들: string[]) {
  const xml = `<hs:sec xmlns:hs="s" xmlns:hp="p">${모양들.map((m) => `<hp:p paraPrIDRef="${m}"><hp:run><hp:t>x</hp:t></hp:run></hp:p>`).join('')}</hs:sec>`;
  const 뿌리el = parseXml(xml).root;
  return { 뿌리el, ps: findAll(뿌리el, 'hp:p') };
}

describe('번호 세기', () => {
  it('**깊은 수준은 윗수준을 세면 처음으로 돌아간다** — 번호 없는 문단이 끼어도 이어 센다', () => {
    const { 뿌리el, ps } = 문단들(['1', '2', '2', '0', '1', '2', '9']);
    const 지도 = 번호매기기(정의({ 1: '^1.', 2: '^2.' }, { 2: 'HANGUL_SYLLABLE' }), [뿌리el], () => false);
    expect(ps.map((p) => 지도.get(p) ?? '')).toEqual(['1.', '가.', '나.', '', '2.', '가.', '∘']);
  });

  it('**틀 글에 윗수준을 섞어 쓴다** (^1.^2) — 윗수준은 지금 셈으로', () => {
    const { 뿌리el, ps } = 문단들(['1', '2', '2', '1', '2', '3']);
    const 지도 = 번호매기기(정의({ 1: '^1.', 2: '^1.^2', 3: '(^3)' }, { 3: 'CIRCLED_DIGIT' }), [뿌리el], () => false);
    expect(ps.map((p) => 지도.get(p))).toEqual(['1.', '1.1', '1.2', '2.', '2.1', '(①)']);
  });

  it('곁글(각주·메모) 안 문단은 세지 않는다', () => {
    const { 뿌리el, ps } = 문단들(['1', '1', '1']);
    const 지도 = 번호매기기(정의({ 1: '^1.' }, {}), [뿌리el], (p) => p === ps[1]);
    expect(ps.map((p) => 지도.get(p))).toEqual(['1.', undefined, '2.']);
  });

  it('번호 꼴', () => {
    expect(번호꼴(3, 'HANGUL_SYLLABLE')).toBe('다');
    expect(번호꼴(4, 'ROMAN_CAPITAL')).toBe('IV');
    expect(번호꼴(9, 'ROMAN_SMALL')).toBe('ix');
    expect(번호꼴(2, 'CIRCLED_DIGIT')).toBe('②');
    expect(번호꼴(1, 'CIRCLED_HANGUL_SYLLABLE')).toBe('㉮');
    expect(번호꼴(2, 'HANGUL_JAMO')).toBe('ㄴ');
    expect(번호꼴(3, 'LATIN_SMALL')).toBe('c');
    expect(번호꼴(15, 'HANGUL_SYLLABLE')).toBe('15');   // 넘치면 숫자
    expect(번호꼴(5, '모르는꼴')).toBe('5');
  });

  it('**읽기만 해서는 머리글이 안 더러워진다** — 고치지 않은 문서는 바이트째 같아야 한다', () => {
    const f = path.join(뿌리, '자료', '기준파일', 'ref-blank.hwpx');
    const d = 문서.열기(fs.readFileSync(f));
    d.번호표지들();
    expect(d.머리.dirty).toBe(false);
  });

  it('개요 번호 — 구역이 가리키는 번호틀로 (기준 파일)', () => {
    const d = 문서.열기(fs.readFileSync(path.join(뿌리, '자료', '기준파일', 'ref-outline.hwpx')));
    expect([...d.번호표지들().values()]).toEqual(['1.']);
  });
});
