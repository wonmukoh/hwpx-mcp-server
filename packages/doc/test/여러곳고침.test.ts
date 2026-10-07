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
import { 문서, 문단, 고친곳들, 표 } from '../src/index.js';

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

describe('저장 길목의 마지막 그물', () => {
  it('**속성에 든 제어문자도 저장 전에 잡는다** — 입구를 빠져나간 길이 있어도', async () => {
    const { setAttr, findAll } = await import('@hwpx/owpml');
    const d = 문서.열기(fs.readFileSync(path.join(뿌리, '자료', '기준파일', 'ref-text-basic.hwpx')));
    const p = d.구역들[0]!.문단들[0]!;
    setAttr(p.el, 'paraPrIDRef', 'a\u0001b');
    expect(() => d.저장()).toThrow(/제어문자/);
    expect(findAll).toBeTypeOf('function');
  });
});

describe('칸 글을 고쳐도 문단 짜임이 안 무너진다', () => {
  it('**끝에 한 줄을 붙이면 마지막 문단에만 붙는다** — 앞 문단 안 줄 나눔이 문단 가름이 되지 않는다', async () => {
    const { 칸고침가르기 } = await import('../src/index.js');
    const 옛 = ['적정\n규모화', '지원금'];
    expect(칸고침가르기(옛, '적정\n규모화\n지원금\n추가줄')).toEqual(['적정\n규모화', '지원금\n추가줄']);
    // 되돌리면 그대로 돌아온다
    expect(칸고침가르기(['적정\n규모화', '지원금\n추가줄'], '적정\n규모화\n지원금')).toEqual(옛);
    // 한 문단 안 낱말만 고쳐도 다른 문단은 그대로
    expect(칸고침가르기(옛, '적정\n규모화\n지원 예산')).toEqual(['적정\n규모화', '지원 예산']);
  });

  it('문단 가름을 지우는 고침은 가르지 않는다 (옛 규칙으로 간다)', async () => {
    const { 칸고침가르기 } = await import('../src/index.js');
    expect(칸고침가르기(['가', '나'], '가나')).toBeUndefined();
  });

  it('**표본 칸에서 — 줄을 붙여 되써도 앞 문단들이 그대로다**', () => {
    const d = 문서.열기(fs.readFileSync(path.join(뿌리, '자료', '표본', '공개', '교육부-2026대학혁신지원사업-기본계획.hwpx')));
    d.ID매기기();
    // 문단이 둘 넘고, 앞 문단에 줄 나눔이 든 칸을 찾는다
    let 찾음: { id: string; 글들: string[] } | undefined;
    for (const s of d.구역들) {
      for (const t of s.표들) {
        const 표id = d.이름표.아이디(t);
        const tt = new 표(t);
        for (let y = 0; y < tt.줄수 && !찾음; y++) {
          for (let x = 0; x < tt.칸수 && !찾음; x++) {
            const 칸id = d.셀아이디(표id, y, x);
            const r = d.칸문단들(칸id);
            if (!r.ok || r.value.length < 2) continue;
            const 글들 = r.value.map((p) => p.글);
            if (글들.slice(0, -1).some((g) => g.includes('\n'))) 찾음 = { id: 칸id, 글들 };
          }
        }
      }
    }
    expect(찾음, '줄 나눔 든 여러 문단 칸이 표본에 있어야 잴 수 있다').toBeDefined();
    const r = d.칸글바꾸기(찾음!.id, `${찾음!.글들.join('\n')}\n추가줄`);
    expect(r.ok).toBe(true);
    const 뒤 = (d.칸문단들(찾음!.id) as { value: { 글: string }[] }).value.map((p) => p.글);
    expect(뒤.slice(0, -1)).toEqual(찾음!.글들.slice(0, -1));
    expect(뒤[뒤.length - 1]).toBe(`${찾음!.글들[찾음!.글들.length - 1]}\n추가줄`);
  });
});
