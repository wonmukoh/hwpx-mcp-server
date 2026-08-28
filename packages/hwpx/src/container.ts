/**
 * HWPX 컨테이너.
 *
 * zip 위에 얹은 얇은 층이다. 부품 이름을 알고, manifest 를 지키고,
 * 규격에 어긋나는 것을 잡는다.
 *
 * 부품 짜임 (실측):
 *   mimetype                 ← **언제나 첫 항목, STORE**
 *   version.xml
 *   settings.xml
 *   Contents/header.xml      글자·문단·테두리 모양, 글꼴
 *   Contents/section0.xml    본문 (구역마다 하나)
 *   Contents/content.hpf     manifest — 어떤 파일이 들어 있나
 *   META-INF/container.xml   .rdf  manifest.xml
 *   BinData/*                그림
 *   Preview/*                미리보기 (없어도 된다)
 */

import {
  createEntry, entryData, readZip, setEntryData, writeZip,
  압축방식정하기, STORE, ZipError,
  type ZipArchive, type ZipEntry,
} from './zip.js';
import { 빈문서바이트 } from './빈문서.js';

export const 부품 = {
  mimetype: 'mimetype',
  version: 'version.xml',
  settings: 'settings.xml',
  header: 'Contents/header.xml',
  manifest: 'Contents/content.hpf',
  containerXml: 'META-INF/container.xml',
  containerRdf: 'META-INF/container.rdf',
  manifestXml: 'META-INF/manifest.xml',
} as const;

export const MIMETYPE = 'application/hwp+zip';

export class HwpxError extends Error {
  constructor(message: string, readonly 어떻게?: string) {
    super(어떻게 ? `${message}\n→ ${어떻게}` : message);
    this.name = 'HwpxError';
  }
}

export class HwpxContainer {
  private constructor(private readonly zip: ZipArchive) {}

  /**
   * 빈 문서를 연다.
   *
   * 템플릿은 **한글이 저장한 빈 문서 그대로다** (`검증/템플릿굽기.mjs` 가 굽는다).
   * 손으로 쓰지 않는다 — 규격을 어겨도 한글은 알려 주지 않고 그 뒤를 무시한다.
   */
  static 빈문서(): HwpxContainer {
    return HwpxContainer.open(빈문서바이트());
  }

  static open(buf: Buffer): HwpxContainer {
    let zip: ZipArchive;
    try {
      zip = readZip(buf);
    } catch (e) {
      throw new HwpxError(
        `HWPX 파일을 열 수 없다: ${(e as Error).message}`,
        'HWPX 는 zip 이다. 파일이 온전한지, .hwp(이진 형식)를 .hwpx 로 잘못 부른 건 아닌지 보라.'
      );
    }

    const c = new HwpxContainer(zip);
    const 첫항목 = zip.entries[0];
    if (!첫항목 || 첫항목.name !== 부품.mimetype) {
      throw new HwpxError(
        `첫 항목이 mimetype 이 아니다 (${첫항목?.name ?? '항목 없음'})`,
        'HWPX 는 mimetype 이 반드시 첫 항목이어야 한다.'
      );
    }
    if (!zip.byName.has(부품.header)) {
      throw new HwpxError(
        `${부품.header} 가 없다`,
        'HWPX 가 아니거나 파일이 깨졌다.'
      );
    }
    return c;
  }

  // ── 부품 읽기 ──────────────────────────────────────────────────────────

  /** 들어 있는 부품 이름들 (zip 순서 그대로) */
  names(): string[] {
    return this.zip.entries.map((e) => e.name);
  }

  has(name: string): boolean {
    return this.zip.byName.has(name);
  }

  /** 부품의 바이트. 없으면 오류 */
  read(name: string): Buffer {
    const e = this.zip.byName.get(name);
    if (!e) {
      throw new HwpxError(
        `${name} 부품이 없다`,
        `이 문서에 있는 부품: ${this.names().slice(0, 8).join(', ')}…`
      );
    }
    return entryData(e);
  }

  /** 부품을 글자로 (UTF-8) */
  readText(name: string): string {
    return this.read(name).toString('utf8');
  }

  /** 구역 파일 이름들. `section0.xml`, `section1.xml`, … 순서대로 */
  sectionNames(): string[] {
    return this.names()
      .filter((n) => /^Contents\/section\d+\.xml$/.test(n))
      .sort((a, b) => 구역번호(a) - 구역번호(b));
  }

  /** 그림 부품 이름들 */
  binDataNames(): string[] {
    return this.names().filter((n) => n.startsWith('BinData/') && !n.endsWith('/'));
  }

  // ── 부품 쓰기 ──────────────────────────────────────────────────────────

  /**
   * 부품 내용을 갈아 끼운다. 없으면 새로 만든다.
   *
   * 압축 방식은 **원본을 따른다.** 새 부품이면 형식에 맞춰 정한다
   * (jpg·png 는 그냥 담고, bmp 는 압축 — 한글이 그렇게 한다).
   */
  write(name: string, data: Buffer, method?: number): void {
    const e = this.zip.byName.get(name);
    if (e) {
      setEntryData(e, data, method);
      return;
    }
    const 새것 = createEntry(name, data, method ?? 압축방식정하기(name));
    this.zip.entries.push(새것);
    this.zip.byName.set(name, 새것);
  }

  writeText(name: string, text: string): void {
    this.write(name, Buffer.from(text, 'utf8'));
  }

  /** 부품을 뺀다 */
  remove(name: string): boolean {
    const e = this.zip.byName.get(name);
    if (!e) return false;
    if (name === 부품.mimetype) {
      throw new HwpxError('mimetype 은 뺄 수 없다', 'HWPX 규격이 요구한다.');
    }
    this.zip.entries.splice(this.zip.entries.indexOf(e), 1);
    this.zip.byName.delete(name);
    return true;
  }

  /** 손댄 부품이 있나 */
  get dirty(): boolean {
    return this.zip.entries.some((e) => e.dirty);
  }

  /** 손댄 부품 이름들 */
  dirtyNames(): string[] {
    return this.zip.entries.filter((e) => e.dirty).map((e) => e.name);
  }

  // ── 저장 ───────────────────────────────────────────────────────────────

  /**
   * 파일로 쓴다.
   *
   * **손대지 않은 부품은 원본 압축 바이트를 그대로 쓴다.**
   * 그래서 아무것도 안 고치고 저장하면 원본과 바이트가 같다.
   */
  save(): Buffer {
    const 문제 = this.검사();
    if (문제.length > 0) {
      throw new HwpxError(
        `저장을 막았다. 이대로 쓰면 한글이 못 읽는다:\n${문제.map((s) => `  - ${s}`).join('\n')}`,
        '위 문제를 고치고 다시 저장하라.'
      );
    }
    return writeZip(this.zip);
  }

  /** 검사만 하고 저장은 안 한다 */
  검사(): string[] {
    const 문제: string[] = [];

    const 첫항목 = this.zip.entries[0];
    if (!첫항목 || 첫항목.name !== 부품.mimetype) {
      문제.push('mimetype 이 첫 항목이 아니다');
    } else if (첫항목.method !== STORE) {
      문제.push('mimetype 은 압축하면 안 된다 (STORE 여야 한다)');
    } else if (entryData(첫항목).toString('utf8') !== MIMETYPE) {
      문제.push(`mimetype 내용이 "${MIMETYPE}" 이 아니다`);
    }

    if (!this.zip.byName.has(부품.header)) 문제.push(`${부품.header} 가 없다`);
    if (this.sectionNames().length === 0) 문제.push('구역(section) 파일이 하나도 없다');

    // manifest 와 실제 파일이 맞나
    문제.push(...this.manifest검사());

    return 문제;
  }

  // ── manifest (content.hpf) ─────────────────────────────────────────────

  /**
   * manifest 에 적힌 파일과 실제 zip 안 파일이 맞는지 본다.
   *
   * 어긋나면 한글이 그림을 못 찾거나 파일을 통째로 거부한다.
   * 지금 쓰는 MCP 는 이 둘을 따로 관리해서 어긋난 적이 있다.
   */
  /**
   * **구역을 하나 더 낸다.**
   *
   * 실측: 문서 161편 가운데 10편(6%)이 구역을 나눈다.
   * 표지와 본문의 쪽 설정이 다를 때, 가로/세로가 섞일 때 쓴다.
   *
   * 구역 하나를 더하는 것은 부품 하나를 쓰는 일로 안 끝난다. **셋을 다 해야 한다:**
   *   1. `Contents/sectionN.xml` 부품
   *   2. manifest 의 `<opf:item>` — 없으면 한글이 그 구역을 못 찾는다
   *   3. manifest 의 `<opf:spine>` 안 `<opf:itemref>` — 없으면 순서를 모른다
   *
   * 그림에서 겪은 것과 같다 — BinData 만 넣고 manifest 에 안 적어 그림이 사라졌다.
   */
  구역더하기(내용: string): string {
    const 번호 = this.sectionNames()
      .reduce((큰, n) => Math.max(큰, 구역번호(n)), -1) + 1;
    const 이름 = `Contents/section${번호}.xml`;
    this.writeText(이름, 내용);

    // **부품 차례를 맞춘다.** 새 부품은 맨 끝에 붙는데, 한글이 저장한 문서는
    // 구역들이 나란히 앞쪽에 있다. 끝에 두면 한글이 그 구역을 못 읽는다.
    const 앞구역 = 이름들끝(this.zip.entries, `Contents/section${번호 - 1}.xml`);
    const 새자리 = this.zip.entries.findIndex((e) => e.name === 이름);
    if (앞구역 !== -1 && 새자리 !== -1 && 새자리 !== 앞구역 + 1) {
      const [옮길것] = this.zip.entries.splice(새자리, 1);
      this.zip.entries.splice(앞구역 < 새자리 ? 앞구역 + 1 : 앞구역, 0, 옮길것!);
    }

    if (this.zip.byName.has(부품.manifest)) {
      let hpf = this.readText(부품.manifest);
      const id = `section${번호}`;
      const 항목 = `<opf:item id="${id}" href="${이름}" media-type="application/xml"/>`;

      // **목록 안 마지막**에 붙인다. 자리를 계산하지 않는다 —
      // 정규식으로 마지막 section 항목을 찾아 그 뒤에 끼우려다
      // 항목이 `</opf:manifest>` **밖으로** 나갔고, 한글이 그 구역을 통째로 버렸다.
      // 목록 안에서의 차례는 규격상 뜻이 없다. 뜻이 있는 것은 spine 의 차례다.
      if (!hpf.includes('</opf:manifest>')) {
        throw new HwpxError(
          'manifest 에 </opf:manifest> 가 없다',
          '깨진 문서다. 구역을 더할 수 없다.',
        );
      }
      hpf = hpf.replace('</opf:manifest>', `${항목}</opf:manifest>`);

      const 차례 = `<opf:itemref idref="${id}" linear="yes"/>`;
      hpf = hpf.replace('</opf:spine>', `${차례}</opf:spine>`);
      this.writeText(부품.manifest, hpf);
    }
    return 이름;
  }

  manifest검사(): string[] {
    if (!this.zip.byName.has(부품.manifest)) return [];
    const 문제: string[] = [];

    const hpf = this.readText(부품.manifest);
    const 적힌것 = new Set<string>();
    for (const m of hpf.matchAll(/<opf:item\b[^>]*\bhref="([^"]+)"/g)) {
      적힌것.add(decodeURIComponent(m[1]!));
    }

    const 있는것 = new Set(this.names());

    for (const href of 적힌것) {
      // manifest 는 Contents/ 기준 상대 경로를 쓰기도 한다
      if (있는것.has(href)) continue;
      if (있는것.has(`Contents/${href}`)) continue;
      문제.push(`manifest 에 적힌 ${href} 가 실제로는 없다`);
    }

    for (const name of this.binDataNames()) {
      const 짧은이름 = name.replace(/^BinData\//, '');
      if (적힌것.has(name) || 적힌것.has(짧은이름) || 적힌것.has(`../${name}`)) continue;
      문제.push(`${name} 이 manifest 에 없다 (한글이 그림을 못 찾는다)`);
    }

    return 문제;
  }
}

/** 그 이름을 가진 부품이 몇 째인가. 없으면 -1 */
function 이름들끝(entries: { name: string }[], name: string): number {
  return entries.findIndex((e) => e.name === name);
}

function 구역번호(name: string): number {
  const m = /section(\d+)\.xml$/.exec(name);
  return m ? Number(m[1]) : 0;
}

/** 부품 하나의 압축 방식을 본다 (검사용) */
export function 부품압축방식(c: HwpxContainer, name: string): number | undefined {
  // 컨테이너 안쪽을 들여다보는 유일한 통로
  return (c as unknown as { zip: ZipArchive }).zip.byName.get(name)?.method;
}

export { STORE, DEFLATE, 압축방식정하기, ZipError } from './zip.js';
export type { ZipEntry } from './zip.js';
