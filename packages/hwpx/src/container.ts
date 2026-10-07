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
  createEntry, entryData, readZip, setEntryData, writeZip, crc32,
  압축방식정하기, STORE, ZipError,
  type ZipArchive, type ZipEntry,
} from './zip.js';
import { 빈문서바이트 } from './빈문서.js';
import { deflateSync } from 'node:zlib';

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
    // **열 때 보는 것과 저장할 때 보는 것을 맞춘다.** 구역이 없는 파일을 열어 주면
    // 「구역 0개」로 고치고 나서 저장에서야 영영 막혔다 (2026-10-07 검토)
    if (c.sectionNames().length === 0) {
      throw new HwpxError(
        '구역(Contents/section0.xml …)이 하나도 없다',
        '본문이 없는 파일이다. 한글에서 열어 다시 저장해 보거나 원본을 다시 받아라.'
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

  /**
   * **mimetype 을 규격대로 되쓴다** — 압축돼 있으면 풀어서(STORE) 담는다.
   *
   * 남이 만든 파일에 그런 것이 있다. 열기·고치기는 다 되는데 저장만 「mimetype 은 압축하면
   * 안 된다」로 **영영** 막혔다 — 우리가 고칠 수 있는 것을 막기만 했다 (2026-10-07 검토).
   */
  mimetype바로잡기(): boolean {
    const 첫 = this.zip.entries[0];
    if (!첫 || 첫.name !== 부품.mimetype || 첫.method === STORE) return false;
    setEntryData(첫, entryData(첫), STORE);
    return true;
  }

  /**
   * **미리보기를 지금 글로 갈아 끼운다** (`Preview/PrvText.txt` · `Preview/PrvImage.png`).
   *
   * 한글은 저장할 때 첫 쪽의 글과 그림을 여기 넣고, 탐색기·한글의 파일 미리보기가 이것을
   * 보여 준다. 우리는 손대지 않아서 **고친 문서에 옛 글이 그대로** 남았다 — 학생 이름을 지워
   * 내보내도 미리보기와 zip 안에 이름이 남았다 (2026-10-07 검토). 글은 새로 쓰고, 그림은 같은
   * 크기의 흰 그림으로 바꾼다(쪽을 그릴 수 없으니 옛 쪽을 남기지 않는 것이 먼저다).
   */
  미리보기갈기(글: string): void {
    const 글자리 = 'Preview/PrvText.txt';
    const 그림자리 = 'Preview/PrvImage.png';
    if (this.has(글자리)) this.write(글자리, Buffer.from(글, 'utf8'));
    if (this.has(그림자리)) {
      const 옛 = this.read(그림자리);
      // PNG 머리(IHDR)에서 크기를 읽는다. 못 읽으면 한글이 흔히 쓰는 크기
      const 맞나 = 옛.length > 24 && 옛.toString('latin1', 12, 16) === 'IHDR';
      const 너비 = Math.min(맞나 ? 옛.readUInt32BE(16) : 724, 2000) || 1;
      const 높이 = Math.min(맞나 ? 옛.readUInt32BE(20) : 1024, 2000) || 1;
      this.write(그림자리, 흰그림(너비, 높이));
    }
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

  /** 들어 있는 바탕쪽 부품 이름들 */
  바탕쪽이름들(): string[] {
    return this.names().filter((n) => /^Contents\/masterpage\d+\.xml$/.test(n));
  }

  /**
   * **바탕쪽 부품을 하나 낸다.**
   *
   * 바탕쪽은 `hp:secPr` 안에 들어가는 것이 아니라 **딴 부품**이다.
   * 규격 문서(HWPML)만 보고 `hp:secPr` 안에 넣었더니 한글이 파일을 아예 못 열었다 —
   * 자리를 다섯 가지로 바꿔 봐도 같았다. 한글에 직접 만들게 해 보고서야 보였다
   * (`자료/실측.md` 32항).
   *
   *     Contents/masterpage0.xml   <masterPage id="masterpage0" type="BOTH" …>
   *     Contents/section0.xml      <hp:secPr masterPageCnt="1"> … <hp:masterPage idRef="masterpage0"/>
   *     Contents/content.hpf       <opf:item id="masterpage0" href="Contents/masterpage0.xml" …/>
   *
   * 구역과 달리 **spine 에는 안 넣는다.** 바탕쪽은 읽는 차례가 있는 것이 아니라
   * 구역이 `idRef` 로 가리키는 것이다 (한글이 저장한 문서가 그렇다).
   *
   * **구역마다 하나씩 낸다.** 두 구역이 같은 부품을 가리키게 했더니 **한글이
   * 죽었다** (RPC 가 끊긴다 — 못 여는 것보다 나쁘다). 한글이 저장한 두 구역
   * 문서를 열어 보니 부품이 둘이었다:
   *
   *     header.xml · masterpage0.xml · section0.xml · masterpage1.xml · section1.xml
   *
   * 차례도 저렇다 — 바탕쪽은 **제 구역 바로 앞**에 놓인다. 그래서 어느 구역
   * 앞에 둘지 받는다.
   */
  바탕쪽더하기(내용: string, 앞에둘구역: string): { 이름: string; id: string } {
    const 번호 = this.바탕쪽이름들()
      .reduce((큰, n) => Math.max(큰, Number(/masterpage(\d+)/.exec(n)?.[1] ?? -1)), -1) + 1;
    const id = `masterpage${번호}`;
    const 이름 = `Contents/${id}.xml`;
    this.writeText(이름, 내용);

    // **제 구역 바로 앞**으로 옮긴다. 새 부품은 맨 끝에 붙는데, 한글이 저장한
    // 문서는 바탕쪽과 구역이 짝지어 놓여 있다. 구역에서 겪은 것과 같은 자리다.
    const 새자리 = this.zip.entries.findIndex((e) => e.name === 이름);
    if (새자리 !== -1) {
      const [옮길것] = this.zip.entries.splice(새자리, 1);
      const 구역자리 = 이름들끝(this.zip.entries, 앞에둘구역);
      this.zip.entries.splice(구역자리 === -1 ? this.zip.entries.length : 구역자리, 0, 옮길것!);
    }

    if (this.zip.byName.has(부품.manifest)) {
      let hpf = this.readText(부품.manifest);
      if (!hpf.includes('</opf:manifest>')) {
        throw new HwpxError(
          'manifest 에 </opf:manifest> 가 없다',
          '깨진 문서다. 바탕쪽을 더할 수 없다.',
        );
      }
      const 항목 = `<opf:item id="${id}" href="${이름}" media-type="application/xml"/>`;
      hpf = hpf.replace('</opf:manifest>', `${항목}</opf:manifest>`);
      // **spine 에는 안 넣는다.** 넣으면 한글이 바탕쪽을 본문 차례에 끼워 읽는다.
      this.writeText(부품.manifest, hpf);
    }
    return { 이름, id };
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

/** 흰 PNG (RGB 8비트) — 미리보기 그림을 지울 때 쓴다 */
function 흰그림(너비: number, 높이: number): Buffer {
  const 토막 = (종류: string, 몸: Buffer): Buffer => {
    const 길이 = Buffer.alloc(4);
    길이.writeUInt32BE(몸.length);
    const 이름몸 = Buffer.concat([Buffer.from(종류, 'latin1'), 몸]);
    const 검 = Buffer.alloc(4);
    검.writeUInt32BE(crc32(이름몸) >>> 0);
    return Buffer.concat([길이, 이름몸, 검]);
  };
  const 머리 = Buffer.alloc(13);
  머리.writeUInt32BE(너비, 0);
  머리.writeUInt32BE(높이, 4);
  머리[8] = 8; 머리[9] = 2; 머리[10] = 0; 머리[11] = 0; 머리[12] = 0;
  const 줄 = Buffer.alloc(1 + 너비 * 3, 0xff);
  줄[0] = 0;   // 거르개 없음
  const 날것 = Buffer.alloc(줄.length * 높이);
  for (let y = 0; y < 높이; y++) 줄.copy(날것, y * 줄.length);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    토막('IHDR', 머리),
    토막('IDAT', deflateSync(날것)),
    토막('IEND', Buffer.alloc(0)),
  ]);
}
