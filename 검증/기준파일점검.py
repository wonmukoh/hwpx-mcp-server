"""기준 파일이 정말 그 기능을 담고 있는지 확인한다.

만들었다고 다 된 것이 아니다. 액션이 조용히 아무 일도 안 했을 수 있다.
(실제로 머리말 액션이 그랬다 — 파일은 저장됐는데 머리말이 없었다)

    py 기준파일점검.py [기준파일폴더]
"""
import io
import os
import re
import sys
import zipfile

sys.stdout.reconfigure(encoding='utf-8')

# 이름 → (무엇을 확인하나, 있어야 하는 것들)
#   있어야 하는 것: (설명, 정규식, 어디서)   어디서: 'sec' | 'hdr' | 'zip'
점검표 = {
    'ref-blank': ('최소 문서 기준선', [
        ('구역 속성', r'<hp:secPr\s', 'sec'),
        ('글꼴 목록 7종', r'<hh:fontface lang="USER"', 'hdr'),
    ]),
    'ref-text-basic': ('글자 꾸밈', [
        ('굵게', r'<hh:bold\s*/>', 'hdr'),
        ('기울임', r'<hh:italic\s*/>', 'hdr'),
        ('밑줄', r'<hh:underline type="BOTTOM"', 'hdr'),
    ]),
    'ref-para-align': ('정렬', [
        ('가운데', r'horizontal="CENTER"', 'hdr'),
        ('오른쪽', r'horizontal="RIGHT"', 'hdr'),
    ]),
    'ref-para-indent': ('들여쓰기·여백', [
        ('문단 여백', r'<hh:margin>', 'hdr'),
        ('들여쓰기 값', r'<hc:intent value="-?\d+"', 'hdr'),
    ]),
    'ref-table-basic': ('표 뼈대', [
        ('표', r'<hp:tbl\s', 'sec'),
        ('칸 주소', r'<hp:cellAddr\s', 'sec'),
        ('칸 크기', r'<hp:cellSz\s', 'sec'),
        ('칸 여백', r'<hp:cellMargin\s', 'sec'),
    ]),
    'ref-table-border': ('표 테두리', [
        ('표', r'<hp:tbl\s', 'sec'),
        ('테두리 정의', r'<hh:borderFill\s', 'hdr'),
    ]),
    'ref-table-merge': ('병합', [
        ('병합된 칸', r'<hp:cellSpan colSpan="[2-9]"|<hp:cellSpan colSpan="\d+" rowSpan="[2-9]"', 'sec'),
    ]),
    'ref-image': ('그림', [
        ('그림 요소', r'<hp:pic\s', 'sec'),
        ('그림 파일', r'^BinData/', 'zip'),
        ('원래 크기', r'<hp:orgSz\s', 'sec'),
    ]),
    'ref-header-footer': ('머리말·꼬리말', [
        ('머리말 컨트롤', r'<hp:ctrl>\s*<hp:header\s', 'sec'),
    ]),
    'ref-note': ('각주·미주', [
        ('각주 컨트롤', r'<hp:ctrl>\s*<hp:footNote\s', 'sec'),
        ('미주 컨트롤', r'<hp:ctrl>\s*<hp:endNote\s', 'sec'),
        ('자동 번호', r'<hp:autoNum\s', 'sec'),
    ]),
    'ref-pagenum': ('쪽 번호', [
        ('쪽번호 컨트롤', r'<hp:pageNum\s', 'sec'),
    ]),
    'ref-column': ('다단', [
        ('두 단', r'<hp:colPr[^>]*colCount="[2-9]"', 'sec'),
    ]),
    'ref-link': ('하이퍼링크', [
        ('필드 시작', r'<hp:fieldBegin[^>]*type="HYPERLINK"', 'sec'),
        ('필드 끝', r'<hp:fieldEnd\s', 'sec'),
    ]),
    'ref-bookmark': ('책갈피', [
        ('책갈피', r'<hp:bookmark\s+name=', 'sec'),
    ]),
    'ref-footer': ('꼬리말', [
        ('꼬리말 컨트롤', r'<hp:ctrl>\s*<hp:footer\s', 'sec'),
    ]),
    'ref-dutmal': ('덧말', [
        ('덧말 요소', r'<hp:dutmal\s', 'sec'),
        ('본글자와 덧글자', r'<hp:mainText>[\s\S]*?<hp:subText>', 'sec'),
    ]),
    'ref-shape': ('도형', [
        ('사각형', r'<hp:rect\s|<hp:line\s|<hp:ellipse\s', 'sec'),
    ]),
    'ref-equation': ('수식', [
        ('수식 요소', r'<hp:equation\s', 'sec'),
    ]),
    'ref-memo': ('메모', [
        ('메모 요소', r'<hp:memo|<hp:fieldBegin[^>]*MEMO', 'sec'),
    ]),
    'ref-page-setup': ('용지 설정', [
        ('용지', r'<hp:pagePr\s', 'sec'),
        ('여백', r'<hp:margin\s', 'sec'),
    ]),
    'ref-section-break': ('구역 나누기', [
        ('구역 둘', r'Contents/section1\.xml', 'zip'),
    ]),
    'ref-style': ('스타일', [
        ('스타일 정의', r'<hh:style\s', 'hdr'),
    ]),
    'ref-tab': ('탭', [
        ('탭 정의', r'<hh:tabPr\s', 'hdr'),
    ]),
}


def 읽기(path):
    z = zipfile.ZipFile(path)
    names = z.namelist()
    sec = ''
    for n in names:
        if re.match(r'Contents/section\d+\.xml$', n):
            sec += z.read(n).decode('utf-8')
    hdr = z.read('Contents/header.xml').decode('utf-8') if 'Contents/header.xml' in names else ''
    return {'sec': sec, 'hdr': hdr, 'zip': '\n'.join(names)}


def main():
    폴더 = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '자료', '기준파일')

    통과 = 0
    문제 = []

    for 이름 in sorted(점검표):
        설명, 조건들 = 점검표[이름]
        path = os.path.join(폴더, 이름 + '.hwpx')
        if not os.path.exists(path):
            문제.append((이름, '파일 없음'))
            print('  ✗ %-20s 파일이 없다' % 이름)
            continue

        본문 = 읽기(path)
        빠진 = [설명2 for 설명2, 패턴, 어디 in 조건들
               if not re.search(패턴, 본문[어디], re.M)]

        if 빠진:
            문제.append((이름, '없음: ' + ', '.join(빠진)))
            print('  ✗ %-20s %s — 없음: %s' % (이름, 설명, ', '.join(빠진)))
        else:
            통과 += 1
            print('  ○ %-20s %s' % (이름, 설명))

    print()
    print('기준 파일 %d개 — 통과 %d / 문제 %d' % (len(점검표), 통과, len(문제)))
    if 문제:
        print()
        print('문제가 있는 것은 그 기능을 다시 만들거나, 한글에서 손으로 만들어 넣어야 한다.')
    return 1 if 문제 else 0


if __name__ == '__main__':
    sys.exit(main())
