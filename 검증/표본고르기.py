"""HWPX 파일들을 훑어 '무엇이 들어 있는지' 를 세고, 서로 다른 것들을 골라 준다.

왕복 무손실 시험에 쓸 표본은 **다양해야** 값어치가 있다.
비슷한 양식 다섯 개보다 성격이 다른 다섯 개가 낫다.

    py 표본고르기.py 목록파일 [--top 8]
"""
import io
import re
import sys
import zipfile
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8')

# 셀 것들 — 파서가 다뤄야 하는 요소들
관심 = [
    'tbl', 'pic', 'ctrl', 'header', 'footer', 'footNote', 'endNote',
    'pageNum', 'colPr', 'fieldBegin', 'bookmark', 'autoNum', 'secPr',
    'container', 'line', 'rect', 'ellipse', 'polygon', 'curve', 'connectLine',
    'textart', 'equation', 'chart', 'ole', 'video', 'compose', 'dutmal',
    'markpenBegin', 'indexmark', 'newNum', 'pageHiding', 'pageNumCtrl',
]


def 살피기(path):
    try:
        z = zipfile.ZipFile(path)
    except Exception as e:
        return None

    names = z.namelist()
    sections = [n for n in names if re.match(r'Contents/section\d+\.xml$', n)]
    if not sections:
        return None

    c = Counter()
    총글자 = 0
    for n in sections:
        try:
            xml = z.read(n).decode('utf-8')
        except Exception:
            return None
        for m in re.finditer(r'<hp:([A-Za-z]+)(?=[\s/>])', xml):
            c[m.group(1)] += 1
        총글자 += sum(len(t) for t in re.findall(r'<hp:t>([\s\S]*?)</hp:t>', xml))

    try:
        header = z.read('Contents/header.xml').decode('utf-8')
    except Exception:
        header = ''

    # header 쪽 통계
    스타일 = len(re.findall(r'<hh:style\s', header))
    글꼴 = len(re.findall(r'<hh:font\s', header))
    글자모양 = len(re.findall(r'<hh:charPr\s', header))
    문단모양 = len(re.findall(r'<hh:paraPr\s', header))
    테두리 = len(re.findall(r'<hh:borderFill\s', header))
    번호 = len(re.findall(r'<hh:numbering\s', header))
    바탕쪽 = len([n for n in names if 'masterpage' in n.lower()])
    그림파일 = len([n for n in names if n.startswith('BinData/') and not n.endswith('/')])

    특징 = {k: c.get(k, 0) for k in 관심 if c.get(k)}
    return {
        'path': path,
        'sections': len(sections),
        'chars': 총글자,
        'p': c.get('p', 0),
        'run': c.get('run', 0),
        '특징': 특징,
        'style': 스타일, 'font': 글꼴, 'charPr': 글자모양,
        'paraPr': 문단모양, 'borderFill': 테두리, 'numbering': 번호,
        'masterPage': 바탕쪽, 'binData': 그림파일,
        'size': __import__('os').path.getsize(path),
    }


def 점수(r):
    """다양성 점수 — 드문 요소를 쓸수록 높다"""
    s = 0
    s += len(r['특징']) * 10           # 요소 종류 수
    s += min(r['sections'], 5) * 5     # 구역이 여럿이면 가산
    s += min(r['style'], 30)           # 스타일이 많으면 복잡한 문서
    s += min(r['borderFill'], 30)
    s += min(r['numbering'], 5) * 4
    s += r['masterPage'] * 20
    s += min(r['binData'], 10) * 3
    return s


def main():
    목록 = [l.strip() for l in io.open(sys.argv[1], encoding='utf-8') if l.strip()]
    top = 8
    if '--top' in sys.argv:
        top = int(sys.argv[sys.argv.index('--top') + 1])

    결과 = []
    for p in 목록:
        r = 살피기(p)
        if r:
            r['점수'] = 점수(r)
            결과.append(r)

    print('읽은 파일 %d개 / 정상 %d개' % (len(목록), len(결과)))
    print()

    # 전체에서 무엇이 얼마나 쓰이는지
    전체 = Counter()
    for r in 결과:
        for k in r['특징']:
            전체[k] += 1
    print('--- 요소별 등장 문서 수 ---')
    for k, v in 전체.most_common():
        print('  %-14s %3d개 문서' % (k, v))
    print()

    결과.sort(key=lambda r: -r['점수'])
    print('--- 다양성 상위 %d ---' % top)
    for r in 결과[:top]:
        이름 = r['path'].split('/')[-1]
        print('  [%3d] %s' % (r['점수'], 이름[:56]))
        print('        구역%d 문단%d 글자%d / 스타일%d 글꼴%d 테두리%d 번호%d 바탕쪽%d 그림%d'
              % (r['sections'], r['p'], r['chars'], r['style'], r['font'],
                 r['borderFill'], r['numbering'], r['masterPage'], r['binData']))
        print('        %s' % ' '.join('%s:%d' % (k, v) for k, v in sorted(r['특징'].items())))


if __name__ == '__main__':
    main()
