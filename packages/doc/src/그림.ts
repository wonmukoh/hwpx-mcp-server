/**
 * 그림 — BinData 에 넣고 manifest 에 적는다.
 *
 * ## 왜 둘을 한 곳에서 하나
 *
 * 그림 파일과 manifest(`content.hpf`) 는 **반드시 짝이 맞아야 한다.**
 * 어긋나면 한글이 그림을 못 찾거나 파일을 통째로 거부한다.
 * 지금 쓰는 MCP 는 이 둘을 따로 관리해서 실제로 어긋난 적이 있다.
 *
 * ## 압축은 형식을 따른다
 *
 * 실측 (문서 113편): jpg 57건·png 41건이 **전부 STORE**,
 * bmp 26건·wmf 1건이 **전부 DEFLATE**.
 * 이미 압축된 형식은 다시 압축해 봐야 커지기만 한다. 컨테이너가 알아서 고른다.
 *
 * ## `hashkey` 는 흉내 내지 않는다
 *
 * 한글이 적는 `hashkey` 는 파일 바이트의 md5·sha1·sha256 **어느 것도 아니다** (재 봤다).
 * 한글이 제 방식으로 만드는 값이라 우리가 맞출 수 없다.
 * 그래서 **안 적는다.** 한글이 받아들이는지는 실제로 먹여 확인한다
 * (`검증/그림수용시험.mjs`).
 */

import { getAttr, setAttr, appendChild, createElement, findFirst, childrenNamed } from '@hwpx/owpml';
import { parseXml, serializeXml } from '@hwpx/owpml';
import { 부품 } from '@hwpx/container';
import { 됨, 안됨, type 결과 } from './결과.js';

/** 확장자 → media-type. 한글이 쓰는 것만 */
const 매체형: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  wmf: 'image/x-wmf',
  emf: 'image/x-emf',
  svg: 'image/svg+xml',
};

export interface 그림잰것 {
  너비px: number;
  높이px: number;
}

/**
 * 그림 파일에서 크기를 읽는다.
 *
 * 크기를 모르면 문서에 넣을 때 **비율이 뭉개진다.**
 * 그러니 못 읽으면 짐작하지 말고 못 읽는다고 말한다.
 */
export function 그림크기(바이트: Buffer): 결과<그림잰것> {
  // PNG: 8바이트 서명 + IHDR
  if (바이트.length > 24
    && 바이트[0] === 0x89 && 바이트[1] === 0x50 && 바이트[2] === 0x4e && 바이트[3] === 0x47) {
    return 됨({ 너비px: 바이트.readUInt32BE(16), 높이px: 바이트.readUInt32BE(20) });
  }

  // GIF
  if (바이트.length > 10 && 바이트.subarray(0, 3).toString('latin1') === 'GIF') {
    return 됨({ 너비px: 바이트.readUInt16LE(6), 높이px: 바이트.readUInt16LE(8) });
  }

  // BMP
  if (바이트.length > 26 && 바이트[0] === 0x42 && 바이트[1] === 0x4d) {
    return 됨({ 너비px: 바이트.readInt32LE(18), 높이px: Math.abs(바이트.readInt32LE(22)) });
  }

  // JPEG — SOF 표지를 찾아 들어간다
  if (바이트.length > 4 && 바이트[0] === 0xff && 바이트[1] === 0xd8) {
    let i = 2;
    while (i + 9 < 바이트.length) {
      if (바이트[i] !== 0xff) { i++; continue; }
      const 표지 = 바이트[i + 1]!;
      // SOF0~SOF3, SOF5~SOF7, SOF9~SOF11, SOF13~SOF15 에 크기가 있다
      const SOF = (표지 >= 0xc0 && 표지 <= 0xc3) || (표지 >= 0xc5 && 표지 <= 0xc7)
        || (표지 >= 0xc9 && 표지 <= 0xcb) || (표지 >= 0xcd && 표지 <= 0xcf);
      if (SOF) {
        return 됨({ 높이px: 바이트.readUInt16BE(i + 5), 너비px: 바이트.readUInt16BE(i + 7) });
      }
      const 길이 = 바이트.readUInt16BE(i + 2);
      if (길이 < 2) break;
      i += 2 + 길이;
    }
  }

  return 안됨(
    '그림 크기를 못 읽었다',
    'png · jpg · gif · bmp 만 크기를 잴 수 있다. 다른 형식이면 width·height 를 직접 줘라.',
  );
}

/** 확장자로 media-type 을 고른다 */
export function 매체형고르기(이름: string): 결과<string> {
  const 확장 = (이름.split('.').pop() ?? '').toLowerCase();
  const t = 매체형[확장];
  if (!t) {
    return 안됨(
      `'${확장}' 는 넣을 수 없는 그림 형식이다`,
      `쓸 수 있는 것: ${Object.keys(매체형).join(', ')}`,
    );
  }
  return 됨(t);
}

export interface 들인그림 {
  /** manifest 의 항목 id. `hc:img/@binaryItemIDRef` 가 이걸 가리킨다 */
  항목id: string;
  /** zip 안 이름 */
  부품이름: string;
  너비px: number;
  높이px: number;
}

/**
 * 그림 바이트를 문서에 들인다 — **BinData 와 manifest 를 한 번에.**
 *
 * 같은 바이트가 이미 들어 있으면 다시 넣지 않고 그것을 쓴다.
 * (같은 그림을 열 번 넣으면 파일이 열 배가 된다)
 */
export function 그림들이기(
  통: { read(n: string): Buffer; readText(n: string): string; write(n: string, b: Buffer): void;
    writeText(n: string, t: string): void; has(n: string): boolean; binDataNames(): string[] },
  바이트: Buffer,
  원래이름: string,
): 결과<들인그림> {
  const 형 = 매체형고르기(원래이름);
  if (!형.ok) return 형;

  const 잰것 = 그림크기(바이트);
  if (!잰것.ok) return 잰것;

  // 이미 같은 바이트가 들어 있나
  for (const n of 통.binDataNames()) {
    if (통.read(n).equals(바이트)) {
      const 있는id = manifest에서찾기(통.readText(부품.manifest), n);
      if (있는id) {
        return 됨({ 항목id: 있는id, 부품이름: n, ...잰것.value });
      }
    }
  }

  const 확장 = (원래이름.split('.').pop() ?? 'png').toLowerCase();
  const 번호 = 다음번호(통.binDataNames());
  const 항목id = `image${번호}`;
  const 부품이름 = `BinData/${항목id}.${확장}`;

  // 압축 방식은 컨테이너가 형식을 보고 고른다 (jpg·png 는 그냥 담고, bmp 는 압축)
  통.write(부품이름, 바이트);

  const 적기 = manifest에적기(통.readText(부품.manifest), 항목id, 부품이름, 형.value);
  if (!적기.ok) return 적기;
  통.writeText(부품.manifest, 적기.value);

  return 됨({ 항목id, 부품이름, ...잰것.value });
}

function 다음번호(있는것: string[]): number {
  let 최대 = 0;
  for (const n of 있는것) {
    const m = /image(\d+)/.exec(n);
    if (m) 최대 = Math.max(최대, Number(m[1]));
  }
  return 최대 + 1;
}

function manifest에서찾기(hpf: string, 부품이름: string): string | undefined {
  for (const m of hpf.matchAll(/<opf:item\b[^>]*>/g)) {
    if (!m[0].includes(부품이름)) continue;
    const id = /\bid="([^"]+)"/.exec(m[0]);
    if (id) return id[1];
  }
  return undefined;
}

/**
 * manifest 에 항목을 적는다.
 *
 * `hashkey` 는 안 적는다 — 한글이 제 방식으로 만드는 값이라 흉내 낼 수 없다.
 * 없어도 한글이 받는지는 실제로 먹여 확인한다.
 */
function manifest에적기(hpf: string, id: string, href: string, 매체: string): 결과<string> {
  const 새항목 = `<opf:item id="${id}" href="${href}" media-type="${매체}" isEmbeded="1"/>`;

  // 다른 item 뒤에 붙인다 — manifest 의 item 은 한 덩이로 모여 있다
  const 마지막 = [...hpf.matchAll(/<opf:item\b[^>]*\/>/g)].pop();
  if (마지막) {
    const 자리 = 마지막.index! + 마지막[0].length;
    return 됨(hpf.slice(0, 자리) + 새항목 + hpf.slice(자리));
  }

  // item 이 하나도 없으면 manifest 안에 넣는다
  const 닫는곳 = hpf.indexOf('</opf:manifest>');
  if (닫는곳 === -1) {
    return 안됨(
      'content.hpf 에 opf:manifest 가 없다',
      'HWPX 가 아니거나 깨진 파일이다.',
    );
  }
  return 됨(hpf.slice(0, 닫는곳) + 새항목 + hpf.slice(닫는곳));
}
