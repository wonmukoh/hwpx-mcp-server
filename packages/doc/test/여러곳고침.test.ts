/**
 * **set_text 가 고친 곳마다 따로 간다** (2026-10-07 검토).
 *
 * 같은 앞·같은 뒤만 떼고 가운데를 한 덩이로 고쳤더니, 낱말 둘만 고쳐도 그 사이가 다 한
 * 덩이였다 — 사이의 각주가 낱말 한가운데로 가고, 서식 런 다섯이 하나로 합쳐졌다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseXml, childrenNamed, getAttr, 글자칸읽기, type ElementNode } from '@hwpx/owpml';
import { 문서, 문단, 고친곳들 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');

/** 문단을 「글[주]글」 꼴로 — 조종이 글 사이 어디에 있는지 보인다 */
function 짜임(p: ElementNode): string {
  return childrenNamed(p, 'hp:run').flatMap((r) => r.children
    .filter((c): c is ElementNode => c.kind === 'element')
    .map((c) => (c.name === 'hp:t' ? 글자칸읽기(c) : c.name === 'hp:ctrl' ? '[조종]' : ''))).join('');
}

describe('고친 곳 가르기', () => {
  it('떨어진 두 곳은 두 곳이다', () => {
    const 곳들 = 고친곳들('각주를 달 문장이다. 미주도 단다.', '각주를 단 문장이다. 미주도 달았다.');
    expect(곳들.length).toBe(2);
    expect(곳들[0]!.넣을것).toBe('단');
  });

  it('**딴 글로 갈아 끼우면 한 곳이다** — 우연히 같은 글자에서 잘게 쪼개지 않는다', () => {
    expect(고친곳들('목적을 달성하기 위하여', '학생 안전을 지키려고').length).toBe(1);
  });

  it('같은 글자가 둘 이하로 끼어 있으면 합친다', () => {
    // 「가나다라」→「X나Y라」: 가운데 「나」 하나를 사이에 둔 두 곳 → 한 곳
    expect(고친곳들('앞 가나다라 뒤', '앞 X나Y라 뒤').length).toBe(1);
  });

  it('이모지를 가운데서 자르지 않는다', () => {
    const 옛 = '웃음 😀 끝';
    const 새 = '웃음 😃 끝';
    const 곳 = 고친곳들(옛, 새)[0]!;
    expect(옛.slice(0, 곳.앞) + 곳.넣을것 + 옛.slice(곳.옛끝)).toBe(새);
  });

  it('어떤 글 쌍이든 고친 곳들을 대면 새 글이 된다', () => {
    const 쌍 = [
      ['', '새 글'], ['옛 글', ''], ['같다', '같다'], ['가나다', '가나다라'], ['라가나다', '가나다'],
      ['1. 목적: 안전 2. 방법: 교육', '1. 목표: 안전 2. 방식: 연수'],
      ['교육부(장관 최교진)는 12일 발표한다.', '교육청(교육감 ○○○)은 12일 발표했다.'],
    ];
    for (const [옛, 새] of 쌍) {
      let 글 = 옛!;
      for (const 곳 of [...고친곳들(옛!, 새!)].reverse()) 글 = 글.slice(0, 곳.앞) + 곳.넣을것 + 글.slice(곳.옛끝);
      expect(글, `${옛} → ${새}`).toBe(새);
    }
  });
});

describe('문단에서 두 곳을 고쳐도 각주·서식이 제자리에 남는다', () => {
  it('**각주가 낱말 한가운데로 안 간다** (기준 파일 ref-note)', () => {
    const d = 문서.열기(fs.readFileSync(path.join(뿌리, '자료', '기준파일', 'ref-note.hwpx')));
    const p = d.구역들[0]!.문단들.find((x) => x.글.includes('각주를 달'))!;
    expect(짜임(p.el)).toBe('[조종]각주를 달 문장이다.[조종] 미주도 단다.[조종]');
    const r = p.글바꾸기('각주를 단 문장이다. 미주도 달았다.');
    expect(r.ok).toBe(true);
    expect(짜임(p.el)).toBe('[조종]각주를 단 문장이다.[조종] 미주도 달았다.[조종]');
  });

  it('**사이의 서식 런이 안 합쳐진다** — 첫 낱말과 끝 낱말만 고칠 때', () => {
    const xml = '<hp:p xmlns:hp="p">'
      + '<hp:run charPrIDRef="1"><hp:t>교육부는 </hp:t></hp:run>'
      + '<hp:run charPrIDRef="2"><hp:t>굵은 낱말</hp:t></hp:run>'
      + '<hp:run charPrIDRef="1"><hp:t> 가운데 두고 발표한다.</hp:t></hp:run></hp:p>';
    const el = parseXml(xml).root;
    const p = new 문단(el, xml);
    const r = p.글바꾸기('교육청은 굵은 낱말 가운데 두고 발표했다.');
    expect(r.ok && r.value.잃은서식).toBe(0);
    const 런들 = childrenNamed(el, 'hp:run');
    expect(런들.map((x) => getAttr(x, 'charPrIDRef'))).toEqual(['1', '2', '1']);
    expect(글자칸읽기(childrenNamed(런들[1]!, 'hp:t')[0]!)).toBe('굵은 낱말');
    expect(p.글).toBe('교육청은 굵은 낱말 가운데 두고 발표했다.');
  });
});
