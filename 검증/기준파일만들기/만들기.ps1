# 한글 2024 를 몰아 '기준 파일' 을 만든다.
#
# 기준 파일이란: 한글이 그 기능을 **어떤 XML 로 저장하는지** 보려고
# 한글로 직접 만든 파일이다. 우리가 만든 XML 과 바이트 단위로 비교한다.
#
# 형식 문서만 봐서는 모른다. 문서에 안 적힌 것이 많고,
# 적힌 대로 해도 한글이 안 읽는 경우가 있다.
#   (BinData 압축, colPr 자리, autoNum 누락 …)
#
#   .\만들기.ps1 -Only ref-table-basic     한 개만
#   .\만들기.ps1                            전부
param(
    [string]$Only = "",
    [string]$OutDir = ""
)
$ErrorActionPreference = 'Stop'

if (-not $OutDir) {
    $OutDir = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "자료\기준파일"
}
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force $OutDir | Out-Null }

# 한글은 OneDrive 경로에서 보안 대화상자를 띄운다. 로컬 임시 폴더에서 만든 뒤 옮긴다.
$Stage = Join-Path $env:TEMP "hwpx-ref"
if (-not (Test-Path $Stage)) { New-Item -ItemType Directory -Force $Stage | Out-Null }

$script:hwp = $null

function 열기 {
    $script:hwp = New-Object -ComObject HWPFrame.HwpObject
    try { $script:hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule") | Out-Null } catch { }
    $script:hwp.XHwpDocuments.Add(0) | Out-Null
}

function 닫기 {
    if ($script:hwp) {
        try { $script:hwp.Clear(1) | Out-Null } catch { }
        try { $script:hwp.Quit() | Out-Null } catch { }
        try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($script:hwp) | Out-Null } catch { }
        $script:hwp = $null
    }
}

function 글(${t}) {
    $h = $script:hwp
    $h.HAction.GetDefault("InsertText", $h.HParameterSet.HInsertText.HSet) | Out-Null
    $h.HParameterSet.HInsertText.Text = ${t}
    $h.HAction.Execute("InsertText", $h.HParameterSet.HInsertText.HSet) | Out-Null
}

function 줄바꿈 { $script:hwp.HAction.Run("BreakPara") | Out-Null }

function 실행($name) {
    # 되면 $true. 액션 이름은 한글 판마다 다를 수 있어 여러 개를 시도할 때 쓴다.
    try { return [bool]$script:hwp.HAction.Run($name) } catch { return $false }
}

function 실행중하나($names) {
    foreach ($n in $names) { if (실행 $n) { return $n } }
    return $null
}

function 저장($name) {
    $tmp = Join-Path $Stage "$name.hwpx"
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
    if (-not $script:hwp.SaveAs($tmp, "HWPX", "")) { throw "저장 실패: $name" }
    $dest = Join-Path $OutDir "$name.hwpx"
    Copy-Item $tmp $dest -Force
    Write-Output ("  저장  " + $name + ".hwpx  (" + [math]::Round((Get-Item $dest).Length / 1KB, 1) + " KB)")
}

# ─────────────────────────────────────────────────────────────────────────
# 기준 파일 목록
#   이름 / 무엇을 확인하려는 것인가 / 만드는 절차
# ─────────────────────────────────────────────────────────────────────────
$목록 = [ordered]@{

    "ref-blank" = @{
        확인 = "한글이 만드는 최소 문서. 모든 비교의 기준선"
        만들기 = { 글 "" }
    }

    "ref-text-basic" = @{
        확인 = "굵게·기울임·밑줄·취소선·글자색·음영이 charPr 에 어떻게 적히나"
        만들기 = {
            글 "보통 글자"; 줄바꿈
            실행 "CharShapeBold"      | Out-Null; 글 "굵게"; 실행 "CharShapeBold" | Out-Null; 줄바꿈
            실행 "CharShapeItalic"    | Out-Null; 글 "기울임"; 실행 "CharShapeItalic" | Out-Null; 줄바꿈
            실행 "CharShapeUnderline" | Out-Null; 글 "밑줄"; 실행 "CharShapeUnderline" | Out-Null; 줄바꿈
            실행중하나 @("CharShapeStrikeout","CharShapeStrike") | Out-Null; 글 "취소선"; 줄바꿈
            실행중하나 @("CharShapeSuperscript") | Out-Null; 글 "위첨자"; 줄바꿈
            실행중하나 @("CharShapeSubscript") | Out-Null; 글 "아래첨자"
        }
    }

    "ref-para-align" = @{
        확인 = "정렬 5종이 paraPr 의 align 에 어떻게 적히나"
        만들기 = {
            글 "왼쪽"; 실행 "ParagraphShapeAlignLeft" | Out-Null; 줄바꿈
            글 "가운데"; 실행 "ParagraphShapeAlignCenter" | Out-Null; 줄바꿈
            글 "오른쪽"; 실행 "ParagraphShapeAlignRight" | Out-Null; 줄바꿈
            글 "양쪽"; 실행 "ParagraphShapeAlignJustify" | Out-Null; 줄바꿈
            글 "배분"; 실행중하나 @("ParagraphShapeAlignDistribute","ParagraphShapeAlignDivision") | Out-Null
        }
    }

    "ref-para-indent" = @{
        확인 = "들여쓰기·내어쓰기·문단 여백·줄 간격. margin 의 left/intent/prev/next"
        만들기 = {
            글 "첫 줄 들여쓴 문단이다. 두 줄 넘어가도록 길게 쓴다. 눈금자의 두 값이 어떻게 적히는지 본다."
            실행중하나 @("ParagraphShapeIndentAtCaret","ParagraphShapeIncreaseMargin") | Out-Null
            줄바꿈
            글 "내어쓰기 문단이다. 두 줄 넘어가도록 길게 쓴다. 첫 줄이 왼쪽으로 나오고 나머지가 들어간다."
        }
    }

    "ref-table-basic" = @{
        확인 = "표 뼈대 — tbl/tr/tc/cellAddr/cellSpan/cellSz/cellMargin 와 감싼 문단"
        만들기 = {
            $h = $script:hwp
            $act = $h.CreateAction("TableCreate"); $set = $act.CreateSet(); $act.GetDefault($set)
            $set.SetItem("Rows", 3); $set.SetItem("Cols", 3)
            $set.SetItem("WidthType", 0); $set.SetItem("HeightType", 0)
            $act.Execute($set) | Out-Null
            글 "가"
        }
    }

    "ref-table-border" = @{
        확인 = "테두리 종류·굵기·면별 지정이 borderFill 에 어떻게 나뉘나"
        만들기 = {
            $h = $script:hwp
            $act = $h.CreateAction("TableCreate"); $set = $act.CreateSet(); $act.GetDefault($set)
            $set.SetItem("Rows", 2); $set.SetItem("Cols", 2)
            $act.Execute($set) | Out-Null
            # 표 전체 선택 후 셀 테두리 대화상자 기본값으로 적용
            실행 "TableCellBlock" | Out-Null
            실행 "TableCellBlockExtendAll" | Out-Null
            실행중하나 @("CellBorderAll","TableCellBorderAll") | Out-Null
        }
    }

    "ref-table-merge" = @{
        확인 = "병합이 cellSpan 과 사라진 tc 로 어떻게 표현되나"
        만들기 = {
            $h = $script:hwp
            $act = $h.CreateAction("TableCreate"); $set = $act.CreateSet(); $act.GetDefault($set)
            $set.SetItem("Rows", 3); $set.SetItem("Cols", 3)
            $act.Execute($set) | Out-Null
            실행 "TableCellBlock" | Out-Null
            실행 "TableCellBlockExtend" | Out-Null
            실행 "TableRightCell" | Out-Null
            실행 "TableMergeCell" | Out-Null
        }
    }

    "ref-image" = @{
        확인 = "그림 — pic/orgSz/curSz/imgRect/BinData 압축 방식/manifest"
        만들기 = {
            $png = Join-Path $Stage "ref.png"
            if (-not (Test-Path $png)) { 그림만들기 $png }
            # InsertPicture 는 액션이 아니라 hwp 의 직접 메서드다 (경로, 문서에포함, 크기옵션, ...)
            $script:hwp.InsertPicture($png, $true, 0, $false, $false, 0, 0, 0) | Out-Null
        }
    }

    "ref-header-footer" = @{
        확인 = "머리말·꼬리말 컨트롤 자리와 subList 속성. colPr 과의 순서"
        만들기 = {
            글 "본문"
            $ok = 실행중하나 @("HeaderFooter","HeaderFooterModify")
            if (-not $ok) { Write-Output "    (머리말 액션 없음 — 수동 확인 필요)" }
        }
    }

    "ref-note" = @{
        확인 = "각주·미주 — ctrl 포장, autoNum, suffixChar"
        만들기 = {
            글 "각주를 달 문장이다."
            if (실행 "InsertFootnote") { 글 "각주 내용이다."; 실행 "CloseEx" | Out-Null }
            실행 "MoveDocEnd" | Out-Null
            글 " 미주도 단다."
            if (실행 "InsertEndnote") { 글 "미주 내용이다."; 실행 "CloseEx" | Out-Null }
        }
    }

    "ref-pagenum" = @{
        확인 = "쪽 번호 컨트롤 — pos/formatType/sideChar"
        만들기 = {
            글 "본문"
            $h = $script:hwp
            $act = $h.CreateAction("PageNumPos"); $set = $act.CreateSet(); $act.GetDefault($set)
            try { $set.SetItem("DrawPos", 6) } catch { }
            $act.Execute($set) | Out-Null
        }
    }

    "ref-column" = @{
        확인 = "다단 — colPr 의 colCount/sameSz/sameGap 과 colSz"
        만들기 = {
            $h = $script:hwp
            $act = $h.CreateAction("MultiColumn"); $set = $act.CreateSet(); $act.GetDefault($set)
            try { $set.SetItem("Count", 2) } catch { }
            $act.Execute($set) | Out-Null
            for ($i = 1; $i -le 12; $i++) { 글 "$i. 다단 확인용 문장이다."; 줄바꿈 }
        }
    }

    "ref-link" = @{
        확인 = "하이퍼링크 — fieldBegin/fieldEnd 와 parameters, 링크 글자 모양"
        만들기 = {
            글 "교육부 누리집"
            실행 "MoveLineBegin" | Out-Null
            실행 "MoveSelLineEnd" | Out-Null
            $h = $script:hwp
            $act = $h.CreateAction("InsertHyperlink"); $set = $act.CreateSet(); $act.GetDefault($set)
            try { $set.SetItem("Text", "교육부 누리집") } catch { }
            try { $set.SetItem("Command", "https://www.moe.go.kr") } catch { }
            $act.Execute($set) | Out-Null
        }
    }

    "ref-bookmark" = @{
        확인 = "책갈피 요소 자리"
        만들기 = {
            글 "책갈피를 달 자리"
            실행 "MoveLineBegin" | Out-Null
            # 책갈피는 액션 이름이 판마다 다르다. 되는 것을 찾는다.
            $쓴것 = 실행중하나 @("InsertFieldBookmark", "Bookmark", "InsertBookmark", "FieldBookmark")
            if (-not $쓴것) {
                # 액션이 없으면 이름 붙은 필드로 대신한다
                try { $script:hwp.MoveSelLineEnd() | Out-Null } catch { }
                try { $script:hwp.SetCurFieldName("표시자1", 0, "", "") | Out-Null } catch { }
            } else { Write-Output ("    액션: " + $쓴것) }
        }
    }

    "ref-shape" = @{
        확인 = "도형 — rect/line/ellipse 의 구조. 실제 정부 문서에 rect 가 흔하다"
        만들기 = {
            글 "도형 아래 본문"
            실행중하나 @("DrawObjCreatorRectangle","DrawObjCreatorRect") | Out-Null
        }
    }

    "ref-equation" = @{
        확인 = "수식 — 교육부 기본계획에 실제로 들어 있다"
        만들기 = {
            글 "수식: "
            $h = $script:hwp
            $act = $h.CreateAction("EquationCreate"); $set = $act.CreateSet(); $act.GetDefault($set)
            try { $set.SetItem("String", "x^2 + y^2 = z^2") } catch { }
            $act.Execute($set) | Out-Null
        }
    }

    "ref-memo" = @{
        확인 = "메모 요소"
        만들기 = {
            글 "메모를 달 문장"
            실행 "MoveLineBegin" | Out-Null
            실행 "MoveSelLineEnd" | Out-Null
            실행중하나 @("InsertFieldMemo","MemoInsert") | Out-Null
        }
    }

    "ref-page-setup" = @{
        확인 = "용지·여백·방향과 쪽 테두리/배경이 secPr 에 어떻게 적히나"
        만들기 = {
            글 "본문"
            $h = $script:hwp
            $act = $h.CreateAction("PageSetup"); $set = $act.CreateSet(); $act.GetDefault($set)
            try { $set.SetItem("PaperDirection", 1) } catch { }   # 가로
            $act.Execute($set) | Out-Null
        }
    }

    "ref-section-break" = @{
        확인 = "구역 나누기 — section 파일이 하나 더 생기나, secPr 이 어떻게 갈리나"
        만들기 = {
            글 "첫 구역"
            실행중하나 @("BreakSection","InsertSectionBreak") | Out-Null
            글 "둘째 구역"
        }
    }

    "ref-style" = @{
        확인 = "문단 스타일 — style 요소와 paraPr/charPr 참조"
        만들기 = {
            글 "제목 1 스타일"
            실행중하나 @("StyleTemplate1","Style") | Out-Null
        }
    }

    "ref-tab" = @{
        확인 = "탭 — tabPr 과 문단 안 탭 문자"
        만들기 = {
            글 "왼쪽"
            실행중하나 @("InsertTab") | Out-Null
            글 "탭 뒤"
        }
    }
}

function 그림만들기($path) {
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap 120, 80
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(31, 78, 156))
    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

# ─────────────────────────────────────────────────────────────────────────
$대상 = if ($Only) { @($Only) } else { $목록.Keys }
$성공 = 0; $실패 = @()

foreach ($name in $대상) {
    if (-not $목록.Contains($name)) { Write-Output "  ?  모르는 이름: $name"; continue }
    Write-Output ("[" + $name + "] " + $목록[$name].확인)
    try {
        열기
        & $목록[$name].만들기
        저장 $name
        $성공++
    }
    catch {
        Write-Output ("  실패  " + $_.Exception.Message)
        $실패 += $name
    }
    finally { 닫기 }
}

Write-Output ""
Write-Output ("만든 것 " + $성공 + "개 / 실패 " + $실패.Count + "개")
if ($실패.Count -gt 0) { Write-Output ("실패: " + ($실패 -join ", ")) }
