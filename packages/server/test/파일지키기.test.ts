/**
 * **파일을 지킨다** (2026-10-07 견딤성 검토).
 *
 * 쓰다가 실패하면 원본이 0바이트가 됐고, 연 뒤 밖에서 고친 파일을 말없이 덮었고,
 * 고친 문서의 미리보기에 옛 글(지운 이름)이 남았고, 점심 먹고 오면 고친 것이 사라져 있었다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HwpxContainer, readZip, writeZip, entryData, setEntryData, DEFLATE, STORE } from '@hwpx/container';
import { 문서 } from '@hwpx/doc';
import { 도구부르기, 문서방 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');
const 보도자료 = path.join(뿌리, '자료', '표본', '공개', '교육부-2026대학혁신지원사업-보도자료.hwpx');

function 사본(이름 = '사본.hwpx'): string {
  const 자리 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), '파일지키기-')), 이름);
  fs.copyFileSync(보도자료, 자리);
  return 자리;
}

async function 열기(방: 문서방, 파일: string) {
  const r = await 도구부르기('open_document', { path: 파일 }, 방);
  expect(r.isError, r.content[0]?.text).toBeUndefined();
  return r;
}

describe('저장', () => {
  it('**쓰지 못해도 원본이 그대로다** — 읽기 전용 파일에 덮어쓰기', async () => {
    const 파일 = 사본();
    const 원본 = fs.readFileSync(파일);
    const 방 = new 문서방();
    const doc_id = (await 열기(방, 파일)).structuredContent!['doc_id'] as string;
    await 도구부르기('edit', { doc_id, edits: [{ op: 'replace', find: '교육부', replace: '교육청', limit: 1 }] }, 방);
    fs.chmodSync(파일, 0o444);
    try {
      const r = await 도구부르기('save_document', { doc_id, overwrite: true }, 방);
      expect(r.isError).toBe(true);
      expect(r.content[0]?.text).toContain('원본 파일은 그대로다');
      expect(fs.readFileSync(파일).equals(원본)).toBe(true);
      // 임시 파일을 남기지 않는다
      expect(fs.readdirSync(path.dirname(파일)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    } finally {
      fs.chmodSync(파일, 0o666);
    }
  });

  it('**연 뒤 밖에서 바뀐 파일은 덮지 않는다** — force 로만', async () => {
    const 파일 = 사본();
    const 방 = new 문서방();
    const doc_id = (await 열기(방, 파일)).structuredContent!['doc_id'] as string;
    // 한글에서 고쳐 저장한 셈
    fs.appendFileSync(파일, Buffer.from([0]));
    const 막힘 = await 도구부르기('save_document', { doc_id, overwrite: true }, 방);
    expect(막힘.isError).toBe(true);
    expect(막힘.content[0]?.text).toContain('밖에서 바뀌었다');
    const 됨 = await 도구부르기('save_document', { doc_id, overwrite: true, force: true }, 방);
    expect(됨.isError, 됨.content[0]?.text).toBeUndefined();
    // 저장한 뒤로는 다시 막히지 않는다
    const 또 = await 도구부르기('save_document', { doc_id, overwrite: true }, 방);
    expect(또.isError, 또.content[0]?.text).toBeUndefined();
  });

  it('**같은 파일을 두 번 열면 알리고, 나중에 저장하는 쪽이 막힌다**', async () => {
    const 파일 = 사본();
    const 방 = new 문서방();
    const 첫 = (await 열기(방, 파일)).structuredContent!['doc_id'] as string;
    const 둘 = await 열기(방, 파일);
    expect(둘.structuredContent!['also_open_as']).toEqual([첫]);
    const 둘id = 둘.structuredContent!['doc_id'] as string;
    expect((await 도구부르기('save_document', { doc_id: 첫, overwrite: true }, 방)).isError).toBeUndefined();
    const 나중 = await 도구부르기('save_document', { doc_id: 둘id, overwrite: true }, 방);
    expect(나중.isError).toBe(true);
  });

  it('파일 이름에 : 가 들면 거절한다 (대체 데이터 스트림)', async () => {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방)).structuredContent!['doc_id'] as string;
    const 자리 = path.join(os.tmpdir(), 'ads.hwpx:숨은.hwpx');
    const r = await 도구부르기('save_document', { doc_id, path: 자리 }, 방);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('쓸 수 없는 글자');
  });
});

describe('미리보기', () => {
  it('**고친 문서의 미리보기에 옛 글이 안 남는다** — 지운 이름이 zip 안에 남지 않는다', async () => {
    const 파일 = 사본();
    const 방 = new 문서방();
    const doc_id = (await 열기(방, 파일)).structuredContent!['doc_id'] as string;
    const 옛통 = HwpxContainer.open(fs.readFileSync(파일));
    expect(옛통.readText('Preview/PrvText.txt')).toContain('최교진');
    const 옛그림 = 옛통.read('Preview/PrvImage.png');
    await 도구부르기('edit', { doc_id, edits: [{ op: 'replace', find: '최교진', replace: '○○○' }] }, 방);
    await 도구부르기('save_document', { doc_id, overwrite: true }, 방);
    const 통 = HwpxContainer.open(fs.readFileSync(파일));
    expect(통.readText('Preview/PrvText.txt')).not.toContain('최교진');
    expect(통.readText('Preview/PrvText.txt')).toContain('○○○');
    const 그림 = 통.read('Preview/PrvImage.png');
    expect(그림.equals(옛그림)).toBe(false);
    expect(그림.subarray(1, 4).toString('latin1')).toBe('PNG');
    // 크기는 옛 그림 그대로
    expect(그림.readUInt32BE(16)).toBe(옛그림.readUInt32BE(16));
  });

  it('안 고치고 저장하면 바이트가 같다 (미리보기도 안 건드린다)', () => {
    const 바이트 = fs.readFileSync(보도자료);
    expect(문서.열기(바이트).저장().equals(바이트)).toBe(true);
  });
});

describe('열기', () => {
  it('**mimetype 이 압축된 파일도 저장된다** — 우리가 STORE 로 바로잡는다', () => {
    const zip = readZip(fs.readFileSync(보도자료));
    const 첫 = zip.entries[0]!;
    setEntryData(첫, entryData(첫), DEFLATE);
    const d = 문서.열기(writeZip(zip));
    const 다시 = readZip(d.저장());
    expect(다시.entries[0]!.name).toBe('mimetype');
    expect(다시.entries[0]!.method).toBe(STORE);
  });

  it('**폴더를 열면 폴더라고 말한다** — 「.hwp 를 잘못 불렀나」가 아니다', async () => {
    const 폴더 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), '폴더-')), '이름.hwpx');
    fs.mkdirSync(폴더);
    const r = await 도구부르기('open_document', { path: 폴더 }, new 문서방());
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('폴더');
  });
});

describe('오래 안 쓴 문서', () => {
  it('**고치고 저장 안 한 것은 한 시간이 지나도 안 치운다**', async () => {
    let 지금 = 0;
    const 방 = new 문서방(() => 지금);
    const 고친것 = (await 도구부르기('create_document', {}, 방)).structuredContent!['doc_id'] as string;
    await 도구부르기('compose', { doc_id: 고친것, blocks: [{ kind: 'body', text: '고친 글' }] }, 방);
    const 그냥연것 = (await 열기(방, 사본())).structuredContent!['doc_id'] as string;
    지금 += 2 * 60 * 60 * 1000;
    expect(방.꺼내기(고친것)).toBeDefined();
    expect(방.꺼내기(그냥연것)).toBeUndefined();
  });
});

describe('ID 는 문서마다 다르다', () => {
  it('**딴 문서의 ID 로는 못 고친다** — 말없이 엉뚱한 문단을 고치지 않는다', async () => {
    const 방 = new 문서방();
    const 가 = (await 열기(방, 사본('가.hwpx'))).structuredContent!['doc_id'] as string;
    const 나 = (await 열기(방, 사본('나.hwpx'))).structuredContent!['doc_id'] as string;
    const 가뼈 = (await 도구부르기('get_outline', { doc_id: 가, limit: 5000 }, 방)).structuredContent!['items'] as { id: string }[];
    const 나뼈 = (await 도구부르기('get_outline', { doc_id: 나, limit: 5000 }, 방)).structuredContent!['items'] as { id: string }[];
    const 나것 = new Set(나뼈.map((x) => x.id));
    expect(가뼈.filter((x) => 나것.has(x.id)).length).toBe(0);
    const r = await 도구부르기('edit', { doc_id: 나, edits: [{ op: 'set_text', id: 가뼈[0]!.id, text: 'x' }] }, 방);
    expect(r.isError).toBe(true);
  });

  it('같은 파일을 다시 열면 같은 ID 다 (짜임을 안 바꿨으면)', async () => {
    const 파일 = 사본();
    const 뼈 = async () => {
      const 방 = new 문서방();
      const id = (await 열기(방, 파일)).structuredContent!['doc_id'] as string;
      return ((await 도구부르기('get_outline', { doc_id: id }, 방)).structuredContent!['items'] as { id: string }[]).map((x) => x.id);
    };
    expect(await 뼈()).toEqual(await 뼈());
  });
});

describe('깨진 파일은 열 때 말한다', () => {
  const 바꿔열기 = async (고치기: (zip: ReturnType<typeof readZip>) => void) => {
    const zip = readZip(fs.readFileSync(보도자료));
    고치기(zip);
    const 파일 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), '깨진-')), '깨진.hwpx');
    fs.writeFileSync(파일, writeZip(zip));
    return 도구부르기('open_document', { path: 파일 }, new 문서방());
  };

  it('**같은 이름 부품이 둘이면 거절한다** — 「구역 2개」로 열지 않는다', async () => {
    const r = await 바꿔열기((zip) => {
      const 구역 = zip.entries.find((e) => e.name === 'Contents/section0.xml')!;
      zip.entries.push({ ...구역 });
    });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('같은 이름');
  });

  it('**manifest 가 XML 로 안 읽히면 거절한다**', async () => {
    const r = await 바꿔열기((zip) => {
      const e = zip.entries.find((x) => x.name === 'Contents/content.hpf')!;
      setEntryData(e, Buffer.from('<opf:package><깨짐', 'utf8'));
    });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('content.hpf');
  });

  it('**구역 XML 이 깨지면 어느 부품인지 말한다**', async () => {
    const r = await 바꿔열기((zip) => {
      const e = zip.entries.find((x) => x.name === 'Contents/section0.xml')!;
      setEntryData(e, Buffer.from('<hs:sec><hp:p>', 'utf8'));
    });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('section0.xml');
  });

  it('manifest 이름에 틀린 퍼센트 꼴이 있어도 「URI malformed」로 터지지 않는다', () => {
    const 통 = HwpxContainer.open(fs.readFileSync(보도자료));
    const hpf = 통.readText('Contents/content.hpf');
    통.writeText('Contents/content.hpf', hpf.replace('</opf:manifest>', '<opf:item id="x" href="50%할인.png" media-type="image/png"/></opf:manifest>'));
    expect(() => 통.manifest검사()).not.toThrow();
  });
});
