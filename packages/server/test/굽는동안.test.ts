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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';

import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const 뿌리 = path.resolve(__dirname, '../../..');

/**
 * **진짜 `dist` 를 굽지 않는다.**
 *
 * 예전에는 여기서 `빌드.mjs --배포` 를 그냥 불렀다. 그런데 이 파일은
 * `고장 내보기` 가 **고장을 심은 채** 부른다(`vitest run packages/server`).
 * 그러니 검증 한 바퀴가 끝나면 `dist` 에 고장이 담겨 있었다 —
 * 소스는 되돌아가는데 `dist` 는 안 되돌아간다.
 *
 * `dist/` 는 `.gitignore` 라 `git status` 에도 안 걸린다. 아래로 쓰는 앱이
 * 「깨끗한 커밋」 딱지를 단 고장 난 번들을 받을 뻔했다 (`자료/실측.md` 28항).
 *
 * 이제 **제 임시 자리**에 굽는다. 재는 것은 그대로다 — 「굽는 동안 안 비나」도
 * 「자국이 남나」도 굽는 자리가 어디든 같은 성질이다.
 *
 * **저장소 안**에 굽는다. 밖(`os.tmpdir()`)에 구웠더니 굽기 끝의 자체 점검이
 * `@modelcontextprotocol/sdk` 를 못 찾았다 — 구운 것을 실제로 불러 보는데,
 * `node_modules` 는 저장소 안에 있다. `.gitignore` 가 `dist.시험.*` 을 막는다.
 */
const 굽을곳 = path.join(뿌리, `dist.시험.${process.pid}`);
const 볼것 = path.join(굽을곳, 'packages', 'server', 'src', 'index.js');

afterAll(() => {
  // 제 자리와 그 옆에 생긴 굽는 자리까지 치운다. 안 치우면 저장소에 쌓인다.
  //
  // **진짜 dist 는 절대 안 지운다.** 이 줄이 없어서 실제로 지웠다 —
  // 아래 「진짜 dist 를 안 건드린다」 고장이 `굽을곳` 을 `dist` 로 바꾸는데,
  // 그러면 `path.basename(굽을곳)` 이 `'dist'` 가 되어 **`dist` 로 시작하는 것을
  // 전부** 지운다. 고장 내보기는 검증마다 도니 한 바퀴마다 dist 가 사라졌다.
  // 아래로 쓰는 앱이 「폴더는 있는데 dist 가 없다」로 굽기를 멈추고 알려 왔다.
  //
  // 배운 것 둘 —
  //   · **앞부분 맞추기는 남의 자리를 문다.** 정확한 이름이거나 그 아래만 지운다.
  //   · **고장이 「지우는 코드」를 바꾸면 밖에 자국이 남는다.** 그래서 막는 줄은
  //     고장이 심겨도 도는 자리, 즉 `굽을곳` 과 무관한 자리에 둔다.
  for (const n of 치울것들(굽을곳, fs.readdirSync(뿌리))) {
    fs.rmSync(path.join(뿌리, n), { recursive: true, force: true });
  }
});

/**
 * 저장소 뿌리에 있는 것들 가운데 **이 시험이 치워도 되는 이름**을 고른다.
 *
 * 따로 떼어 둔 까닭: 고장 하나로는 이 흠이 안 잡힌다. `굽을곳` 이 성할 때는
 * 막는 줄을 빼도 `dist` 가 안 지워지고, 사고는 **다른 고장이 `굽을곳` 을
 * 바꿀 때** 난다. 그러니 「굽을곳이 dist 라면」 을 시험이 직접 줘 봐야 한다.
 */
export function 치울것들(굽을곳자리: string, 있는것: readonly string[]): string[] {
  const 내이름 = path.basename(굽을곳자리);
  return 있는것.filter((n) => {
    if (n === 'dist') return false;                       // 진짜 dist 는 절대 안 고른다
    return n === 내이름 || n.startsWith(`${내이름}.`);     // 정확한 이름이거나 그 아래만
  });
}

/** 지금 남아 있는 굽는 자리들 (굽을곳 옆에 생긴다) */
function 찌꺼기들(): Set<string> {
  const 앞 = `${path.basename(굽을곳)}.`;
  return new Set(fs.readdirSync(path.dirname(굽을곳))
    .filter((n) => n.startsWith(`${앞}굽는중.`) || n.startsWith(`${앞}치움.`)));
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
    const p = spawn(process.execPath,
      [path.join(뿌리, '검증', '빌드.mjs'), '--배포', '--낼곳', 굽을곳],
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

/** 임시 자리에 한 번 굽는다 */
function 한번굽기() {
  const r = spawnSync(process.execPath,
    [path.join(뿌리, '검증', '빌드.mjs'), '--배포', '--낼곳', 굽을곳],
    { cwd: 뿌리, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`미리 굽기가 깨졌다: ${r.stderr ?? ''}`);
}

/**
 * 굽는 자리를 한 번 만들어 둔다. 없으면 「없다」와 「비었다」가 구별이 안 된다.
 *
 * **`if (…) return;` 으로 안 쓴다.** 헛도는 시험 훑기가 그 꼴을 「앞에 못 박은 것
 * 없이 건너뛴다」 로 잡는데, 규칙이 옳다. 여기는 시험 본문이 아니라 채비라
 * 건너뛰는 게 맞지만, **규칙을 무르게 하느니 이쪽을 그 꼴이 아니게 쓴다.**
 */
function 미리굽기() {
  if (!fs.existsSync(볼것)) 한번굽기();
}

describe('굽는 동안에도 dist 를 읽을 수 있다', () => {
  // **재는 것은 「이미 있는 자리가 굽는 동안 비나」다.** 자리가 아예 없으면
  // 처음부터 끝까지 「비었다」가 나오고, 그건 재려던 것이 아니다.
  beforeAll(미리굽기, 180_000);

  it('**빈 창이 5ms 한 칸을 안 넘는다**', async () => {
    // 예전에는 `dist` 를 먼저 지우고 그 자리에 구웠다 — **굽는 시간의 95%** 가
    // 빈 자리였다. 지금은 옆에 굽고 맨 끝에 이름만 바꾼다.
    //
    // **0 은 못 만든다.** 윈도우에는 폴더를 통째로 맞바꾸는 길이 없어
    // 「옛것을 치우고」 → 「새것을 앉히고」 두 번으로 나뉜다. 그 사이가 창이다.
    // 실제로 다섯 번 재서 넷은 0, 한 번은 160칸 중 1칸이 걸렸다.
    //
    // 그래서 「한 번도 안 빈다」 로 단언하지 않는다 — 그건 가끔 빨개지는 시험이
    // 되고, 가끔 빨개지는 시험은 아무도 안 믿는다. **한 칸을 넘으면** 잡는다.
    const r = await 굽는동안재기();
    expect(r.코드, `굽기가 깨졌다:
${r.말}`).toBe(0);
    expect(r.총횟수, '너무 빨리 끝나 들여다볼 틈이 없었다면 못 재는 것이다')
      .toBeGreaterThan(20);
    expect(r.빈횟수,
      `굽는 동안 dist 가 ${r.빈횟수}/${r.총횟수}번 비었다 — `
      + '옛 방식(먼저 지우고 그 자리에 굽기)으로 돌아가면 95% 가 나온다')
      .toBeLessThanOrEqual(1);
  }, 180_000);

  it('**진짜 dist 를 안 건드린다**', async () => {
    // 이 시험 파일은 `고장 내보기` 가 **고장을 심은 채** 부른다. 여기서 진짜 dist 를
    // 구우면 고장이 담긴 채 구워지고, 소스와 달리 **dist 는 안 되돌아간다.**
    // dist 는 .gitignore 라 git 도 못 잡고, 아래로 쓰는 앱이 그걸 물고 번들을 굽는다.
    const 진짜 = path.join(뿌리, 'dist');
    expect(path.resolve(굽을곳), '이 시험은 진짜 dist 에 구우면 안 된다')
      .not.toBe(path.resolve(진짜));
    expect(굽을곳.startsWith(진짜 + path.sep), '진짜 dist 안에 구워도 안 된다').toBe(false);

    // 그리고 **구운 것이 실제로 제 자리에 떨어졌는지** 본다. 경로만 보면
    // 「--낼곳 을 주고도 딴 데 굽는」 꼴을 못 잡는다.
    //
    // 진짜 dist 의 시각을 견주는 쪽은 안 쓴다 — **남이 나란히 구울 수 있다.**
    // 사람이 옆 창에서 `빌드.mjs --배포` 를 돌리기만 해도 빨개진다.
    // 재려는 것은 「이 시험이 진짜 dist 를 굽나」지 「아무도 안 굽나」가 아니다.
    const 내자국 = path.join(굽을곳, '구운것.json');
    const 전 = fs.existsSync(내자국) ? fs.statSync(내자국).mtimeMs : -1;
    const r = await 굽는동안재기();
    expect(r.코드, `굽기가 깨졌다:
${r.말}`).toBe(0);
    expect(fs.existsSync(내자국), '제 자리에 안 구웠다 — --낼곳 이 안 먹었나').toBe(true);
    expect(fs.statSync(내자국).mtimeMs, '제 자리를 다시 안 구웠다')
      .toBeGreaterThan(전);
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

describe('뒷정리가 남의 자리를 안 문다', () => {
  // **`dist.시험.7` 과 `dist.시험.77` 을 일부러 같이 둔다.** 앞부분만 맞추면
  // 짧은 쪽이 긴 쪽을 문다 — 오늘 `dist` 를 훑다가 같은 함정에 걸렸다.
  const 있는것 = ['dist', 'dist.굽는중.1', 'dist.치움.2',
    'dist.시험.7', 'dist.시험.7.굽는중.3', 'dist.시험.77', 'packages', '자료'];

  it('**굽을곳이 dist 로 바뀌어도 진짜 dist 는 안 고른다**', () => {
    // 고장 내보기가 실제로 이 값을 바꾼다. 그때 `dist` 가 통째로 사라졌다.
    const 고른것 = 치울것들(path.join(뿌리, 'dist'), 있는것);
    expect(고른것, '진짜 dist 를 지우면 아래로 쓰는 앱이 굽지 못한다')
      .not.toContain('dist');
  });

  it('**이름 앞부분만 맞는 남의 자리는 안 고른다**', () => {
    // `dist.시험.77` 은 `dist.시험.7` 로 시작하지만 **남의 것**이다.
    // 나란히 도는 프로세스의 자리를 지우면 그쪽 굽기가 통째로 깨진다.
    expect(치울것들(path.join(뿌리, 'dist.시험.7'), 있는것))
      .toEqual(['dist.시험.7', 'dist.시험.7.굽는중.3']);
  });

  it('제 자리와 그 아래는 고른다', () => {
    expect(치울것들(path.join(뿌리, 'dist.시험.77'), 있는것)).toEqual(['dist.시험.77']);
  });
});

describe('구운 자국 — 어느 소스에서 구웠나', () => {
  /**
   * **판 번호로는 번들을 못 가린다.** 개발 중에는 판을 안 올리고 소스만 고치는 게
   * 흔해서, 어제 것과 오늘 것이 둘 다 `0.5.0` 이라 답하면서 동작이 다르다.
   *
   * 실제로 그것 때문에 「이 번들에 그 고침이 들었나」 를 알아내려고
   * **도구 지문을 뜨고 stdio 로 두드려야** 했다. 굽는 자리에 커밋을 찍으면 끝날 일이었다.
   */
  // **여기서도 진짜 dist 를 안 본다.** 자국이 남는가·커밋이 찍히는가는
  // 굽는 자리가 어디든 같은 성질이다. 진짜 dist 는 `내놓을채비` 가 본다.
  const 자국길 = path.join(굽을곳, '구운것.json');

  // 앞 describe 가 이미 구웠겠지만 **차례에 기대지 않는다.**
  // 없으면 여기서 굽는다 — 없다고 조용히 건너뛰면 아무것도 안 보는 시험이 된다.
  beforeAll(() => {
    if (!fs.existsSync(자국길)) 한번굽기();
  }, 180_000);

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
    for (const 자리 of ['dist.굽는중.', 'dist.치움.', 'dist.시험.']) {
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
