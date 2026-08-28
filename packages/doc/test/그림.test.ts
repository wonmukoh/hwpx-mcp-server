/**
 * 그림 — BinData 와 manifest 는 **반드시 짝이 맞아야 한다.**
 *
 * 어긋나면 한글이 그림을 못 찾거나 파일을 통째로 거부한다.
 * 지금 쓰는 MCP 는 이 둘을 따로 관리해서 실제로 어긋난 적이 있다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HwpxContainer, 부품 } from '@hwpx/container';
import { 그림들이기, 그림크기, 매체형고르기, 꺼내기 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');
const 기준파일 = path.join(뿌리, '자료', '기준파일');

function 그림바이트(): Buffer {
  const c = HwpxContainer.open(fs.readFileSync(path.join(기준파일, 'ref-image.hwpx')));
  return c.read('BinData/image1.png');
}

function 빈통() {
  return HwpxContainer.빈문서();
}

describe('그림 크기를 읽는다', () => {
  it('png', () => {
    const r = 꺼내기(그림크기(그림바이트()));
    expect(r).toEqual({ 너비px: 120, 높이px: 80 });
  });

  it('gif 머리를 읽는다', () => {
    const b = Buffer.alloc(16);
    b.write('GIF89a', 0, 'latin1');
    b.writeUInt16LE(320, 6);
    b.writeUInt16LE(240, 8);
    expect(꺼내기(그림크기(b))).toEqual({ 너비px: 320, 높이px: 240 });
  });

  it('bmp 머리를 읽는다', () => {
    const b = Buffer.alloc(32);
    b[0] = 0x42; b[1] = 0x4d;
    b.writeInt32LE(640, 18);
    b.writeInt32LE(-480, 22);   // 음수면 위에서 아래로 그린다는 뜻. 크기는 절댓값
    expect(꺼내기(그림크기(b))).toEqual({ 너비px: 640, 높이px: 480 });
  });

  it('**모르는 형식은 짐작하지 않는다**', () => {
    const r = 그림크기(Buffer.from('그냥 글자'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.어떻게).toContain('width');
  });
});

describe('media-type 을 고른다', () => {
  it('아는 확장자', () => {
    expect(꺼내기(매체형고르기('a.png'))).toBe('image/png');
    expect(꺼내기(매체형고르기('a.JPG'))).toBe('image/jpeg');
    expect(꺼내기(매체형고르기('a.bmp'))).toBe('image/bmp');
  });

  it('모르는 확장자는 **쓸 수 있는 것을 적어** 거절한다', () => {
    const r = 매체형고르기('a.txt');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.어떻게).toContain('png');
  });
});

describe('그림을 들인다 — BinData 와 manifest 를 **한 번에**', () => {
  it('둘 다 들어간다', () => {
    const c = 빈통();
    const r = 꺼내기(그림들이기(c, 그림바이트(), 'test.png'));

    expect(c.binDataNames()).toEqual([r.부품이름]);
    const hpf = c.readText(부품.manifest);
    expect(hpf).toContain(r.부품이름);
    expect(hpf).toContain(`id="${r.항목id}"`);
    expect(hpf).toContain('media-type="image/png"');

    // 컨테이너 검사가 짝을 본다 — 어긋나면 여기서 걸린다
    expect(c.검사()).toEqual([]);
  });

  it('**manifest 에 안 적으면 저장이 막힌다**', () => {
    const c = 빈통();
    // 일부러 BinData 에만 넣어 본다
    c.write('BinData/떠돌이.png', 그림바이트());
    expect(c.검사().some((t) => t.includes('manifest'))).toBe(true);
    expect(() => c.save()).toThrow();
  });

  it('크기를 같이 돌려준다', () => {
    const r = 꺼내기(그림들이기(빈통(), 그림바이트(), 'test.png'));
    expect(r.너비px).toBe(120);
    expect(r.높이px).toBe(80);
  });

  it('**같은 바이트를 두 번 넣어도 파일은 하나**', () => {
    const c = 빈통();
    const a = 꺼내기(그림들이기(c, 그림바이트(), 'test.png'));
    const b = 꺼내기(그림들이기(c, 그림바이트(), '다른이름.png'));
    expect(c.binDataNames().length).toBe(1);
    expect(b.항목id).toBe(a.항목id);
    expect(b.부품이름).toBe(a.부품이름);
  });

  it('다른 그림은 따로 들어간다', () => {
    const c = 빈통();
    const 첫것 = 그림바이트();
    const 둘째 = Buffer.from(첫것);
    둘째[둘째.length - 1] = (둘째[둘째.length - 1]! + 1) & 0xff;   // 바이트 하나만 다르게

    const a = 꺼내기(그림들이기(c, 첫것, 'a.png'));
    const b = 꺼내기(그림들이기(c, 둘째, 'b.png'));
    expect(c.binDataNames().length).toBe(2);
    expect(b.항목id).not.toBe(a.항목id);
    expect(c.검사()).toEqual([]);
  });

  it('그림이 아닌 형식은 거절한다', () => {
    expect(그림들이기(빈통(), Buffer.from('x'), 'a.txt').ok).toBe(false);
  });

  it('크기를 못 읽는 파일은 거절한다 (넣어 놓고 뭉개지 않는다)', () => {
    const r = 그림들이기(빈통(), Buffer.from('png 가 아닌 바이트'), 'a.png');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain('크기');
  });

  it('넣은 뒤 저장했다 다시 열어도 그림이 있다', () => {
    const c = 빈통();
    const r = 꺼내기(그림들이기(c, 그림바이트(), 'test.png'));
    const 다시 = HwpxContainer.open(c.save());
    expect(다시.binDataNames()).toEqual([r.부품이름]);
    expect(다시.read(r.부품이름).equals(그림바이트())).toBe(true);
    expect(다시.readText(부품.manifest)).toContain(r.항목id);
  });
});
