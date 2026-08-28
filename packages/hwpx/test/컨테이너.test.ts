/**
 * 2단계 합격 기준 — **열고 저장하면 바이트가 같아야 한다.**
 *
 * XML 왕복보다 어렵다. 다시 압축하면 deflate 구현이 달라 바이트가 달라진다.
 * 그래서 손대지 않은 부품은 **원본 압축 바이트를 그대로** 쓴다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  HwpxContainer, HwpxError, MIMETYPE, 부품, 부품압축방식,
  crc32, createEntry, entryData, readZip, writeZip, 압축방식정하기,
  빈문서바이트,
  DEFLATE, STORE,
} from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');
const 폴더들 = [
  path.join(뿌리, '자료', '기준파일'),
  path.join(뿌리, '자료', '표본', '공개'),
  path.join(뿌리, '자료', '표본', '로컬'),
];

function 문서들(): string[] {
  return 폴더들.flatMap((d) =>
    fs.existsSync(d)
      ? fs.readdirSync(d).filter((f) => f.toLowerCase().endsWith('.hwpx')).map((f) => path.join(d, f))
      : []
  );
}

function 첫차이(a: Buffer, b: Buffer): string {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return `${i}번째 바이트부터 다르다 (원본 ${a.length} / 저장 ${b.length})\n` +
    `  원본: ${a.subarray(i, i + 24).toString('hex')}\n` +
    `  저장: ${b.subarray(i, i + 24).toString('hex')}`;
}

describe('열고 저장하면 바이트가 같다', () => {
  const 목록 = 문서들();

  it('문서가 있어야 한다', () => {
    expect(목록.length).toBeGreaterThanOrEqual(25);
  });

  for (const file of 목록) {
    it(path.basename(file), () => {
      const 원본 = fs.readFileSync(file);
      const c = HwpxContainer.open(원본);
      expect(c.dirty).toBe(false);
      const 저장 = c.save();
      if (!원본.equals(저장)) throw new Error(첫차이(원본, 저장));
    });
  }
});

describe('부품을 읽는다', () => {
  const 표본 = path.join(뿌리, '자료', '기준파일', 'ref-table-basic.hwpx');

  it('mimetype 이 첫 항목이고 압축이 안 돼 있다', () => {
    const c = HwpxContainer.open(fs.readFileSync(표본));
    expect(c.names()[0]).toBe(부품.mimetype);
    expect(c.readText(부품.mimetype)).toBe(MIMETYPE);
    expect(부품압축방식(c, 부품.mimetype)).toBe(STORE);
  });

  it('구역 파일을 번호 순서로 준다', () => {
    const 여럿 = path.join(뿌리, '자료', '기준파일', 'ref-section-break.hwpx');
    const c = HwpxContainer.open(fs.readFileSync(여럿));
    const 구역 = c.sectionNames();
    expect(구역.length).toBeGreaterThanOrEqual(2);
    expect(구역[0]).toBe('Contents/section0.xml');
    expect(구역[1]).toBe('Contents/section1.xml');
  });

  it('없는 부품을 읽으면 무엇이 있는지 알려 준다', () => {
    const c = HwpxContainer.open(fs.readFileSync(표본));
    expect(() => c.read('없는/부품.xml')).toThrow(/없는\/부품\.xml 부품이 없다/);
    expect(() => c.read('없는/부품.xml')).toThrow(/이 문서에 있는 부품/);
  });

  it('그림 부품을 찾는다', () => {
    const 그림 = path.join(뿌리, '자료', '기준파일', 'ref-image.hwpx');
    const c = HwpxContainer.open(fs.readFileSync(그림));
    expect(c.binDataNames().length).toBeGreaterThan(0);
  });
});

describe('부품을 고친다', () => {
  const 표본 = path.join(뿌리, '자료', '기준파일', 'ref-blank.hwpx');

  it('고치면 dirty 로 잡히고, 고친 것만 바뀐다', () => {
    const 원본 = fs.readFileSync(표본);
    const c = HwpxContainer.open(원본);
    const 원래설정 = c.readText(부품.settings);

    c.writeText(부품.settings, 원래설정 + '<!-- 표시 -->');
    expect(c.dirty).toBe(true);
    expect(c.dirtyNames()).toEqual([부품.settings]);

    const 저장 = c.save();
    expect(저장.equals(원본)).toBe(false);

    // 다시 열어 보면 고친 것이 들어 있고 나머지는 그대로다
    const 다시 = HwpxContainer.open(저장);
    expect(다시.readText(부품.settings)).toContain('<!-- 표시 -->');
    expect(다시.readText(부품.header)).toBe(c.readText(부품.header));
    expect(다시.names()).toEqual(c.names());
  });

  it('mimetype 은 뺄 수 없다', () => {
    const c = HwpxContainer.open(fs.readFileSync(표본));
    expect(() => c.remove(부품.mimetype)).toThrow(HwpxError);
  });

  it('새 부품은 형식에 맞는 압축 방식을 고른다', () => {
    const c = HwpxContainer.open(fs.readFileSync(표본));
    c.write('BinData/사진.png', Buffer.alloc(1000, 7));
    c.write('BinData/그림.bmp', Buffer.alloc(1000, 7));
    // jpg·png 는 이미 압축돼 있으니 그냥 담고, bmp 는 압축한다 (한글이 그렇게 한다)
    expect(부품압축방식(c, 'BinData/사진.png')).toBe(STORE);
    expect(부품압축방식(c, 'BinData/그림.bmp')).toBe(DEFLATE);
  });
});

describe('저장을 막는다 — 한글이 못 읽을 파일은 안 쓴다', () => {
  const 표본 = path.join(뿌리, '자료', '기준파일', 'ref-blank.hwpx');

  it('mimetype 내용이 틀리면 막는다', () => {
    const c = HwpxContainer.open(fs.readFileSync(표본));
    c.writeText(부품.mimetype, '엉뚱한 것');
    expect(() => c.save()).toThrow(/mimetype 내용이/);
  });

  it('manifest 에 없는 그림을 넣으면 막는다', () => {
    const c = HwpxContainer.open(fs.readFileSync(표본));
    c.write('BinData/떠돌이.png', Buffer.alloc(10));
    expect(() => c.save()).toThrow(/manifest 에 없다/);
  });

  it('막을 때는 무엇을 어떻게 해야 하는지 말한다', () => {
    const c = HwpxContainer.open(fs.readFileSync(표본));
    c.write('BinData/떠돌이.png', Buffer.alloc(10));
    try {
      c.save();
      throw new Error('막았어야 한다');
    } catch (e) {
      expect((e as Error).message).toContain('저장을 막았다');
      expect((e as Error).message).toContain('→');     // 어떻게 하라는 말
    }
  });
});

describe('HWPX 가 아닌 것', () => {
  it('zip 이 아니면 그렇게 말한다', () => {
    expect(() => HwpxContainer.open(Buffer.from('이건 zip 이 아니다')))
      .toThrow(/zip 이 아니다|열 수 없다/);
  });

  it('mimetype 이 없는 zip 은 거절한다', () => {
    const zip = { entries: [createEntry('a.txt', Buffer.from('x'))], byName: new Map(), comment: Buffer.alloc(0) };
    zip.byName.set('a.txt', zip.entries[0]!);
    expect(() => HwpxContainer.open(writeZip(zip))).toThrow(/mimetype/);
  });
});

describe('zip 바닥', () => {
  it('CRC-32 가 맞다', () => {
    // 널리 알려진 값
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });

  it('압축 방식 고르기', () => {
    expect(압축방식정하기('a.png')).toBe(STORE);
    expect(압축방식정하기('a.JPG')).toBe(STORE);
    expect(압축방식정하기('a.bmp')).toBe(DEFLATE);
    expect(압축방식정하기('Contents/section0.xml')).toBe(DEFLATE);
  });

  it('만든 항목을 다시 읽으면 같다', () => {
    const 내용 = Buffer.from('가나다'.repeat(500), 'utf8');
    for (const method of [STORE, DEFLATE]) {
      const e = createEntry('t.bin', 내용, method);
      expect(entryData(e).equals(내용)).toBe(true);
      expect(e.crc).toBe(crc32(내용));
    }
  });

  it('만든 zip 을 다시 읽을 수 있다', () => {
    const a = createEntry('mimetype', Buffer.from(MIMETYPE), STORE);
    const b = createEntry('Contents/header.xml', Buffer.from('<x/>'));
    const zip = { entries: [a, b], byName: new Map([['mimetype', a], ['Contents/header.xml', b]]), comment: Buffer.alloc(0) };
    const 다시 = readZip(writeZip(zip));
    expect(다시.entries.map((e) => e.name)).toEqual(['mimetype', 'Contents/header.xml']);
    expect(entryData(다시.byName.get('Contents/header.xml')!).toString()).toBe('<x/>');
  });
});

describe('빈 문서 템플릿 — 한글이 만든 것을 굽는다', () => {
  it('굽힌 템플릿이 원본과 바이트가 같다', () => {
    // 손으로 고쳤거나 굽는 것을 잊었으면 여기서 걸린다
    const 원본 = fs.readFileSync(path.join(뿌리, '자료', '기준파일', 'ref-blank.hwpx'));
    expect(빈문서바이트().equals(원본)).toBe(true);
  });

  it('열면 빈 문서다', () => {
    const c = HwpxContainer.빈문서();
    expect(c.검사()).toEqual([]);
    expect(c.dirty).toBe(false);
    expect(c.sectionNames()).toEqual(['Contents/section0.xml']);
    expect(c.binDataNames()).toEqual([]);
    expect(c.readText(부품.mimetype)).toBe(MIMETYPE);
  });

  it('부를 때마다 딴 것을 준다 (앞서 고친 것이 묻어 오면 안 된다)', () => {
    const a = HwpxContainer.빈문서();
    a.writeText(부품.settings, a.readText(부품.settings) + '<!-- 흔적 -->');
    const b = HwpxContainer.빈문서();
    expect(b.dirty).toBe(false);
    expect(b.readText(부품.settings)).not.toContain('흔적');
  });

  it('그대로 저장하면 원본과 바이트가 같다', () => {
    expect(HwpxContainer.빈문서().save().equals(빈문서바이트())).toBe(true);
  });
});
