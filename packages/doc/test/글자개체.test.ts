/**
 * **글자 칸 안의 개체 넷** — 줄 나눔·탭·전각 빈칸·묶음 빈칸.
 *
 * 한글은 이 넷을 글자로 안 쓰고 `hp:t` 안의 빈 요소로 쓴다. 표본 46편에 lineBreak 53 ·
 * tab 53 · fwSpace 220 · nbSpace 90 개가 있었다 (실측 35항).
 *
 * 전에는 **읽을 때 버리고, 고치면 지웠다.** 「담당자<줄 나눔>2. 교육부」가
 * 「담당자2. 교육부」로 읽혔고, 한 글자만 바꿔 되써도 줄 나눔이 문서에서 사라졌다.
 * 결과는 `잃은서식: 0` 이었다. **같은 글로 되쓰면 「이미 같다」로 건너뛰어** 옛 시험은
 * 이 구멍을 한 번도 못 밟았다 — 그래서 여기서는 꼭 **글을 바꿔서** 되쓴다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findAll, childrenNamed, 글자개체, 글자칸읽기, 글자칸쓰기, createElement, serializeNode, type ElementNode } from '@hwpx/owpml';
import { 문서 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');
const 자리들 = [
  path.join(뿌리, '자료', '기준파일'),
  path.join(뿌리, '자료', '표본', '공개'),
  path.join(뿌리, '자료', '표본', '로컬'),   // 없으면 건너뛴다 (gitignore)
];
const 파일들 = 자리들
  .filter((d) => fs.existsSync(d))
  .flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.hwpx')).map((f) => path.join(d, f)));

const 개체이름 = Object.keys(글자개체);

/** 그 문단 **제** 글자 칸 안의 개체만 센다 — 글상자 안 문단의 것까지 세면 안 된다 */
function 제것세기(p: ElementNode, 이름: string): number {
  return childrenNamed(p, 'hp:run').flatMap((r) => childrenNamed(r, 'hp:t'))
    .flatMap((t) => t.children).filter((c) => c.kind === 'element' && c.name === 이름).length;
}

describe('글자 칸 읽고 쓰기 — 한 쌍', () => {
  it('**개체는 글자로 읽힌다**', () => {
    const t = createElement('hp:t', {});
    글자칸쓰기(t, '담당자\n2.\t가\u3000나\u00a0다');
    expect(글자칸읽기(t)).toBe('담당자\n2.\t가\u3000나\u00a0다');
    for (const 이름 of 개체이름) expect(findAll(t, 이름).length, 이름).toBe(1);
  });

  it('**있던 탭은 다시 쓴다** — 채움 점선(leader)이 안 사라진다', () => {
    const t = createElement('hp:t', {}, [createElement('hp:tab', { width: '9999', leader: '3', type: '2' })]);
    글자칸쓰기(t, '목차\t3');
    const 탭 = findAll(t, 'hp:tab')[0]!;
    expect(serializeNode(탭, '')).toContain('leader="3"');
  });

  it('`\\r\\n` 은 줄 나눔 하나다', () => {
    const t = createElement('hp:t', {});
    글자칸쓰기(t, '가\r\n나');
    expect(findAll(t, 'hp:lineBreak').length).toBe(1);
    expect(글자칸읽기(t)).toBe('가\n나');
  });
});

describe('표본의 개체 든 문단 — 글을 바꿔 되써도 개체가 남는다', () => {
  // 표본 전체에서 개체 든 문단을 모은다
  const 모음: { 파일: string; 이름: string }[] = [];
  for (const f of 파일들) {
    const d = 문서.열기(fs.readFileSync(f));
    for (const s of d.구역들) {
      for (const p of s.모든문단들) {
        if (findAll(p.el, 'hp:tbl').length > 0) continue;
        const 든것 = 개체이름.filter((n) => 제것세기(p.el, n) > 0);
        if (든것.length > 0) 모음.push({ 파일: path.basename(f), 이름: 든것.join('+') });
      }
    }
  }

  it('재 볼 문단이 있다 — 없으면 이 시험은 아무것도 안 본다', () => {
    expect(모음.length).toBeGreaterThan(0);
    // 공개 자료만으로도 줄 나눔과 탭은 있어야 한다
    const 이름들 = new Set(모음.flatMap((x) => x.이름.split('+')));
    expect(이름들.has('hp:lineBreak'), '줄 나눔 든 문단이 없다').toBe(true);
    expect(이름들.has('hp:tab'), '탭 든 문단이 없다').toBe(true);
  });

  it.each(파일들.map((f) => [path.basename(f), f] as const))('%s', (_이름, f) => {
    const d = 문서.열기(fs.readFileSync(f));
    for (const s of d.구역들) {
      for (const p of s.모든문단들) {
        if (findAll(p.el, 'hp:tbl').length > 0) continue;
        const 전 = 개체이름.map((n) => 제것세기(p.el, n));
        if (전.every((n) => n === 0)) continue;
        const 글 = p.글;
        // 읽을 때 글자로 나온다
        for (const [i, 이름] of 개체이름.entries()) {
          const 글자 = 글자개체[이름]!;
          expect(글.split(글자).length - 1 >= 전[i]!, `${이름} 이 글에 안 나온다: «${글.slice(0, 40)}»`).toBe(true);
        }
        // **글을 바꿔** 되쓴다 — 같은 글이면 건너뛰어 아무것도 안 잰다
        const r = p.글바꾸기(`${글}.`);
        expect(r.ok).toBe(true);
        const 뒤 = 개체이름.map((n) => 제것세기(p.el, n));
        expect(뒤, `되쓰니 개체가 사라졌다: «${글.slice(0, 40)}»`).toEqual(전);
      }
    }
  });
});

describe('모르는 요소가 든 글자 칸은 고치지 않는다', () => {
  it('**형광펜이 든 칸을 set_text·replace 가 날리지 않고 거절한다**', () => {
    const f = 파일들.find((x) => x.endsWith('ref-text-basic.hwpx'))!;
    const d = 문서.열기(fs.readFileSync(f));
    d.ID매기기();
    const p = d.구역들[0]!.모든문단들.find((x) => x.글.trim() !== '')!;
    const t = childrenNamed(p.런들.at(-1)!, 'hp:t')[0]!;
    t.children = [];
    for (const c of [createElement('hp:markpenBegin', { color: '#FFFF00' }), createElement('hp:markpenEnd', {})]) {
      c.parent = t;
      t.children.push(c);
    }
    const 문단글 = p.글;
    const r1 = p.글바꾸기(문단글 + '고침');
    expect(r1.ok, '형광펜이 사라지는데 됐다고 하면 안 된다').toBe(false);
    expect(findAll(t, 'hp:markpenBegin').length).toBe(1);
  });
});
