/**
 * **굽는 동안 `dist` 가 비면 안 된다.**
 *
 * 예전에는 `dist` 를 먼저 지우고 그 자리에 구웠다. 재 보니 **굽는 시간의 95%**
 * 동안 빈 자리였다(1,639ms 가운데 1,558ms).
 *
 * 밖에서 읽는 쪽이 그 창에 걸린다 —
 *
 *   - 앱에 번들해 넣는 쪽이 「2분 넘게 여섯 번 내리」 걸렸다고 알려 왔다
 *     (검증 한 바퀴가 dist 를 여섯 번 굽는다)
 *   - **이 폴더를 가리키는 MCP 설정**도 그때 서버를 못 띄운다
 *   - `npx` 로 쓰는 쪽도 같다
 *
 * 이제 옆에 굽고 마지막에 이름만 바꾼다. 빈 창이 밀리초로 줄었다.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const 뿌리 = path.resolve(__dirname, '../../..');
const 볼것 = path.join(뿌리, 'dist', 'packages', 'server', 'src', 'index.js');

/** 지금 남아 있는 굽는 자리들 */
function 찌꺼기들(): Set<string> {
  return new Set(fs.readdirSync(뿌리)
    .filter((n) => n.startsWith('dist.굽는중.') || n.startsWith('dist.치움.')));
}

/** 굽는 내내 5ms 마다 들여다보며 몇 번이나 비어 있나 센다 */
function 굽는동안재기(): Promise<{
  빈횟수: number; 총횟수: number; 코드: number | null; 새찌꺼기: string[]; 말: string;
}> {
  return new Promise((풀기) => {
    const 앞 = 찌꺼기들();
    let 빈횟수 = 0;
    let 총횟수 = 0;
    const 재기 = setInterval(() => {
      총횟수++;
      if (!fs.existsSync(볼것)) 빈횟수++;
    }, 5);
    // **굽기가 실패하면 까닭을 보여야 한다.** stdio 를 버리면
    // 「실패했다」 만 알고 왜인지는 영영 모른다.
    let 말 = '';
    const p = spawn(process.execPath, [path.join(뿌리, '검증', '빌드.mjs'), '--배포'],
      { cwd: 뿌리, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => { 말 += d; });
    p.stderr.on('data', (d) => { 말 += d; });
    p.on('exit', (코드) => {
      clearInterval(재기);
      // **제 굽기가 새로 남긴 것만** 센다. 검증 한 바퀴에는 일부러 깨뜨린 굽기도
      // 있어서(고장 내보기) 폴더에 남의 찌꺼기가 있는 게 정상이다.
      풀기({
        빈횟수, 총횟수, 코드, 말: 말.slice(-600),
        새찌꺼기: [...찌꺼기들()].filter((n) => !앞.has(n)),
      });
    });
  });
}

describe('굽는 동안에도 dist 를 읽을 수 있다', () => {
  it('**한 번도 안 빈다**', async () => {
    const r = await 굽는동안재기();
    expect(r.코드, `굽기가 깨졌다:
${r.말}`).toBe(0);
    expect(r.총횟수, '너무 빨리 끝나 들여다볼 틈이 없었다면 못 재는 것이다')
      .toBeGreaterThan(20);
    expect(r.빈횟수,
      `굽는 동안 dist 가 ${r.빈횟수}/${r.총횟수}번 비었다 — `
      + '밖에서 읽는 쪽이 그때 걸린다. 옆에 굽고 이름만 바꿔라')
      .toBe(0);
  }, 180_000);

  it('**제 굽기가 찌꺼기를 안 남긴다**', async () => {
    const r = await 굽는동안재기();
    expect(r.코드, `굽기가 깨졌다:
${r.말}`).toBe(0);
    expect(r.새찌꺼기,
      `굽고 나서 ${r.새찌꺼기.join(', ')} 가 남았다 — 굽는 자리를 안 치웠다`)
      .toEqual([]);
  }, 180_000);
});

describe('구운 자국 — 어느 소스에서 구웠나', () => {
  /**
   * **판 번호로는 번들을 못 가린다.** 개발 중에는 판을 안 올리고 소스만 고치는 게
   * 흔해서, 어제 것과 오늘 것이 둘 다 `0.5.0` 이라 답하면서 동작이 다르다.
   *
   * 실제로 그것 때문에 「이 번들에 그 고침이 들었나」 를 알아내려고
   * **도구 지문을 뜨고 stdio 로 두드려야** 했다. 굽는 자리에 커밋을 찍으면 끝날 일이었다.
   */
  const 자국길 = path.join(뿌리, 'dist', '구운것.json');

  it('**굽고 나면 자국이 남는다**', () => {
    expect(fs.existsSync(자국길), '자국이 없으면 어느 소스에서 구웠는지 모른다').toBe(true);
  });

  it('이름·판이 package.json 과 같다', () => {
    const 자국 = JSON.parse(fs.readFileSync(자국길, 'utf8')) as
      { name: string; version: string };
    const 꾸러미 = JSON.parse(fs.readFileSync(path.join(뿌리, 'package.json'), 'utf8')) as
      { name: string; version: string };
    expect(자국.name).toBe(꾸러미.name);
    expect(자국.version).toBe(꾸러미.version);
  });

  it('**커밋이 찍힌다** (git 저장소일 때)', () => {
    const 자국 = JSON.parse(fs.readFileSync(자국길, 'utf8')) as { commit?: string };
    // git 저장소가 아니면 안 찍는 것이 맞다 — 지어내지 않는다
    if (fs.existsSync(path.join(뿌리, '.git'))) {
      expect(자국.commit, 'git 저장소인데 커밋이 없다').toMatch(/^[0-9a-f]{7,}$/);
    } else {
      expect(자국.commit, 'git 저장소가 아닌데 커밋을 지어냈다').toBeUndefined();
    }
  });

  it('**굽는 자리가 dirty 를 켜지 않는다**', () => {
    // `.gitignore` 가 `dist/` 만 막았더니 굽는 동안 생기는 `dist.굽는중.<pid>/` 이
    // 안 걸러져, **굽는 쪽이 제가 만든 자리를 보고** 「고치는 중」 이라 찍었다.
    // 커밋 직후에도 켜졌다 — **늘 켜지는 표시는 아무것도 안 알려 준다.**
    const 무시글 = fs.readFileSync(path.join(뿌리, '.gitignore'), 'utf8');
    for (const 자리 of ['dist.굽는중.', 'dist.치움.']) {
      expect(무시글, `${자리}* 를 안 걸러내면 굽는 내내 dirty 가 켜진다`).toContain(자리);
    }
  });

  it('**안 올린 변경이 있으면 dirty 를 켠다**', () => {
    const 자국 = JSON.parse(fs.readFileSync(자국길, 'utf8')) as { dirty?: boolean };
    // 여기서 못 박는다. 안 그러면 git 저장소가 아닌 기계에서 **조용히 건너뛴다** —
    // 헛도는 시험 훑기가 이걸 잡아 줬다.
    expect(fs.existsSync(path.join(뿌리, '.git')),
      'git 저장소가 아니면 이 시험은 아무것도 안 본다').toBe(true);
    // 커밋만 찍으면 **고치는 중인 것을 그 커밋 그대로라고 말하게 된다**
    expect(typeof 자국.dirty, 'dirty 가 없으면 자국이 거짓말을 할 수 있다').toBe('boolean');
  });
});
