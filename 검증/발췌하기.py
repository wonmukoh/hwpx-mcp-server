"""실제 문서에서 '한글이 이 기능을 어떻게 저장하는가' 를 뽑아낸다.

COM 액션으로 못 만드는 기능이 있다 (도형·머리말·다단은 대화상자를 띄우거나
매개변수 이름이 판마다 다르다). 그런데 그 기능들은 **실제 정부 문서에 들어 있다.**
합성한 기준 파일보다 실제 문서에서 뽑은 것이 오히려 확실하다.

    py 발췌하기.py
"""
import io
import os
import re
import sys
import zipfile

sys.stdout.reconfigure(encoding='utf-8')

여기 = os.path.dirname(os.path.abspath(__file__))
뿌리 = os.path.dirname(여기)
표본 = [os.path.join(뿌리, '자료', '표본', d) for d in ('공개', '로컬')]
낼곳 = os.path.join(뿌리, '자료', '기준파일', '발췌')

# 뽑을 것 — 이름 / 무엇을 보려는가 / 찾을 정규식 / 앞뒤로 얼마나
뽑기 = [
    ('다단', '단이 둘 이상인 colPr. colCount/sameSz/sameGap 와 colSz 유무',
     r'<hp:colPr[^>]*colCount="[2-9]"[^>]*(?:/>|>[\s\S]*?</hp:colPr>)', 0),

    ('머리말', 'header 컨트롤의 자리와 subList 속성. colPr 과의 순서',
     r'<hp:ctrl>\s*<hp:header\s[\s\S]*?</hp:header>\s*</hp:ctrl>', 400),

    ('꼬리말', 'footer 컨트롤',
     r'<hp:ctrl>\s*<hp:footer\s[\s\S]*?</hp:footer>\s*</hp:ctrl>', 400),

    ('도형-사각형', 'rect — 정부 문서에서 가장 흔한 도형',
     r'<hp:rect\s[\s\S]*?</hp:rect>', 200),

    ('도형-선', 'line',
     r'<hp:line\s[\s\S]*?</hp:line>', 200),

    ('도형-타원', 'ellipse',
     r'<hp:ellipse\s[\s\S]*?</hp:ellipse>', 200),

    ('도형-묶음', 'container — 도형 여럿을 묶은 것',
     r'<hp:container\s[\s\S]*?</hp:container>', 200),

    ('수식', 'equation — 교육부 기본계획에 실제로 있다',
     r'<hp:equation\s[\s\S]*?</hp:equation>', 200),

    ('책갈피', 'bookmark',
     r'<hp:bookmark\s[^>]*/>', 300),

    ('쪽번호-숨김', 'pageHiding — 첫 쪽에 머리말·쪽번호를 감춘다',
     r'<hp:pageHiding\s[^>]*/>', 200),

    ('번호-다시시작', 'newNum — 쪽/그림/표 번호를 다시 시작',
     r'<hp:newNum\s[^>]*/>', 200),

    ('글자겹침', 'compose — 글자 겹치기',
     r'<hp:compose\s[\s\S]*?</hp:compose>', 200),

    ('덧말', 'dutmal — 글자 위에 다는 작은 글',
     r'<hp:dutmal\s[\s\S]*?</hp:dutmal>', 200),
]


def 문서들():
    # 표본 폴더를 먼저 본다 (여기서 나오면 저장소에 근거가 남는다)
    for d in 표본:
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if f.lower().endswith('.hwpx'):
                yield os.path.join(d, f)
    # 표본에 없으면 더 넓은 목록을 훑는다 (--목록 파일로 준다)
    if '--목록' in sys.argv:
        목록파일 = sys.argv[sys.argv.index('--목록') + 1]
        for line in io.open(목록파일, encoding='utf-8'):
            path = line.strip()
            if path and path.lower().endswith('.hwpx') and os.path.exists(path):
                yield path


def 본문(path):
    z = zipfile.ZipFile(path)
    out = []
    for n in z.namelist():
        if re.match(r'Contents/section\d+\.xml$', n):
            out.append(z.read(n).decode('utf-8'))
    return '\n'.join(out)


def 보기좋게(xml, 폭=100):
    """태그마다 줄바꿈. 너무 길면 자른다."""
    s = re.sub(r'>\s*<', '>\n<', xml)
    줄 = []
    for line in s.split('\n'):
        while len(line) > 폭 * 2:
            줄.append(line[:폭 * 2] + ' …')
            line = ''
        if line:
            줄.append(line)
    return '\n'.join(줄[:60])


def main():
    os.makedirs(낼곳, exist_ok=True)
    캐시 = {}
    찾음 = 0
    못찾음 = []

    for 이름, 설명, 패턴, 여유 in 뽑기:
        결과 = None
        for path in 문서들():
            if path not in 캐시:
                try:
                    캐시[path] = 본문(path)
                except Exception:
                    캐시[path] = ''
            xml = 캐시[path]
            m = re.search(패턴, xml)
            if m:
                앞 = xml[max(0, m.start() - 여유):m.start()]
                결과 = (os.path.basename(path), 앞, m.group(0))
                break

        낼파일 = os.path.join(낼곳, 이름 + '.md')
        if not 결과:
            못찾음.append(이름)
            print('  ✗ %-14s %s' % (이름, '표본에 없다'))
            continue

        출처, 앞, 조각 = 결과
        with io.open(낼파일, 'w', encoding='utf-8') as f:
            f.write('# %s\n\n%s\n\n' % (이름, 설명))
            f.write('출처: `%s`\n\n' % 출처)
            if 앞.strip():
                f.write('## 바로 앞\n\n```xml\n%s\n```\n\n' % 보기좋게(앞[-여유:]))
            f.write('## 이 요소\n\n```xml\n%s\n```\n' % 보기좋게(조각))
        찾음 += 1
        print('  ○ %-14s %s (%s)' % (이름, 설명[:40], 출처[:28]))

    print()
    print('발췌 %d개 / 못 찾음 %d개' % (찾음, len(못찾음)))
    if 못찾음:
        print('못 찾음: %s' % ', '.join(못찾음))
        print('→ 그 기능을 쓴 문서를 표본에 더하거나, 한글에서 손으로 만들어야 한다.')


if __name__ == '__main__':
    main()
