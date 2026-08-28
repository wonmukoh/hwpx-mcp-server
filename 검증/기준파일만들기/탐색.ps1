# 액션 이름과 매개변수 집합을 더듬어 본다.
# 어떤 조합이 실제로 먹히는지 파일을 저장해 확인한다.
$ErrorActionPreference = 'Continue'
$Stage = Join-Path $env:TEMP "hwpx-probe"
if (-not (Test-Path $Stage)) { New-Item -ItemType Directory -Force $Stage | Out-Null }

function 새문서 {
    $h = New-Object -ComObject HWPFrame.HwpObject
    try { $h.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule") | Out-Null } catch { }
    $h.XHwpDocuments.Add(0) | Out-Null
    return $h
}
function 닫기($h) {
    try { $h.Clear(1) | Out-Null } catch { }
    try { $h.Quit() | Out-Null } catch { }
    try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($h) | Out-Null } catch { }
}
function 글($h, $t) {
    $h.HAction.GetDefault("InsertText", $h.HParameterSet.HInsertText.HSet) | Out-Null
    $h.HParameterSet.HInsertText.Text = $t
    $h.HAction.Execute("InsertText", $h.HParameterSet.HInsertText.HSet) | Out-Null
}
function 확인($path, $패턴, $이름) {
    if (-not (Test-Path $path)) { Write-Output ("  " + $이름 + " : 저장 안 됨"); return $false }
    $zip = [System.IO.Compression.ZipFile]::OpenRead($path)
    $found = $false
    foreach ($e in $zip.Entries) {
        if ($e.FullName -like "Contents/section*.xml") {
            $sr = New-Object System.IO.StreamReader($e.Open())
            $xml = $sr.ReadToEnd(); $sr.Close()
            if ($xml -match $패턴) { $found = $true }
        }
    }
    $zip.Dispose()
    Write-Output ("  " + $이름 + " : " + $(if ($found) { "됨 ✓" } else { "안 됨" }))
    return $found
}
Add-Type -AssemblyName System.IO.Compression.FileSystem

# ── 다단 ─────────────────────────────────────────────────────────────────
Write-Output "[다단]"
foreach ($방식 in @("HSecDef", "HColDef-Count", "HColDef-Cols")) {
    $h = 새문서
    try {
        switch ($방식) {
            "HSecDef" {
                $set = $h.HParameterSet.HSecDef.HSet
                $h.HAction.GetDefault("MultiColumn", $set) | Out-Null
                $h.HParameterSet.HSecDef.ColDef.Count = 2
                $h.HAction.Execute("MultiColumn", $set) | Out-Null
            }
            "HColDef-Count" {
                $set = $h.HParameterSet.HColDef.HSet
                $h.HAction.GetDefault("MultiColumn", $set) | Out-Null
                $h.HParameterSet.HColDef.Count = 2
                $h.HAction.Execute("MultiColumn", $set) | Out-Null
            }
            "HColDef-Cols" {
                $act = $h.CreateAction("MultiColumn")
                $set = $act.CreateSet(); $act.GetDefault($set)
                $set.SetItem("Count", 2)
                $act.Execute($set) | Out-Null
            }
        }
        글 $h "다단 확인"
        $out = Join-Path $Stage "col-$방식.hwpx"
        if (Test-Path $out) { Remove-Item $out -Force }
        $h.SaveAs($out, "HWPX", "") | Out-Null
        확인 $out 'colCount="[2-9]"' $방식 | Out-Null
    } catch { Write-Output ("  " + $방식 + " : 예외 " + $_.Exception.Message.Substring(0, [Math]::Min(50, $_.Exception.Message.Length))) }
    finally { 닫기 $h }
}

# ── 머리말 ───────────────────────────────────────────────────────────────
Write-Output "[머리말]"
foreach ($방식 in @("HHeaderFooter", "MoveToHeader")) {
    $h = 새문서
    try {
        switch ($방식) {
            "HHeaderFooter" {
                $set = $h.HParameterSet.HHeaderFooter.HSet
                $h.HAction.GetDefault("HeaderFooter", $set) | Out-Null
                try { $h.HParameterSet.HHeaderFooter.Type = 0 } catch { }
                try { $h.HParameterSet.HHeaderFooter.ApplyClass = 0 } catch { }
                $h.HAction.Execute("HeaderFooter", $set) | Out-Null
                글 $h "머리말 글"
                $h.HAction.Run("CloseEx") | Out-Null
            }
            "MoveToHeader" {
                # 본문 → 머리말 영역으로 이동하는 방식
                $h.HAction.Run("MoveTopLevelBegin") | Out-Null
                $r = $h.HAction.Run("HeaderFooterModify")
                Write-Output ("    HeaderFooterModify = " + $r)
                글 $h "머리말 글"
                $h.HAction.Run("CloseEx") | Out-Null
            }
        }
        글 $h "본문"
        $out = Join-Path $Stage "hf-$방식.hwpx"
        if (Test-Path $out) { Remove-Item $out -Force }
        $h.SaveAs($out, "HWPX", "") | Out-Null
        확인 $out '<hp:header\s' $방식 | Out-Null
    } catch { Write-Output ("  " + $방식 + " : 예외 " + $_.Exception.Message.Substring(0, [Math]::Min(50, $_.Exception.Message.Length))) }
    finally { 닫기 $h }
}

# ── 도형 ─────────────────────────────────────────────────────────────────
Write-Output "[도형]"
foreach ($방식 in @("HShapeObject", "DrawObjCreator")) {
    $h = 새문서
    try {
        switch ($방식) {
            "HShapeObject" {
                $set = $h.HParameterSet.HShapeObject.HSet
                $h.HAction.GetDefault("DrawObjCreator", $set) | Out-Null
                try {
                    $h.HParameterSet.HShapeObject.CreationType = 1   # 사각형
                    $h.HParameterSet.HShapeObject.Width = 5000
                    $h.HParameterSet.HShapeObject.Height = 3000
                } catch { }
                $h.HAction.Execute("DrawObjCreator", $set) | Out-Null
            }
            "DrawObjCreator" {
                $act = $h.CreateAction("DrawObjCreator")
                $set = $act.CreateSet(); $act.GetDefault($set)
                try { $set.SetItem("CreationType", 1) } catch { }
                $act.Execute($set) | Out-Null
            }
        }
        글 $h "도형 아래"
        $out = Join-Path $Stage "shape-$방식.hwpx"
        if (Test-Path $out) { Remove-Item $out -Force }
        $h.SaveAs($out, "HWPX", "") | Out-Null
        확인 $out '<hp:rect\s|<hp:line\s|<hp:ellipse\s' $방식 | Out-Null
    } catch { Write-Output ("  " + $방식 + " : 예외 " + $_.Exception.Message.Substring(0, [Math]::Min(50, $_.Exception.Message.Length))) }
    finally { 닫기 $h }
}

Write-Output "끝"
