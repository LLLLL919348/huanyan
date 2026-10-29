param(
  [Parameter(Mandatory=$true)][string]$InDir,
  [Parameter(Mandatory=$true)][string]$OutDir,
  [int]$FaceX = 11, [int]$FaceY = 16, [int]$FaceW = 13, [int]$FaceH = 11,
  [int]$EyeY = 19,
  [switch]$NoFace,
  [switch]$NoClean
)
Add-Type -AssemblyName System.Drawing

$PAL = @(
  @('K',   0,   0,  20),
  @('E',  16,  20,  48),
  @('D',  24,  48,  96),
  @('F',  24,  48, 120),
  @('N',  48,  72, 144),
  @('G',  48,  48, 120),
  @('M',  48,  96, 168),
  @('L',  72, 144, 216),
  @('C',  72, 168, 216),
  @('H', 205, 240, 255),
  @('W', 250, 250, 252),
  @('w', 216, 216, 240),
  @('S', 250, 225, 205),
  @('s', 232, 196, 178),
  @('B',  72, 138, 222),
  @('b',  24,  60, 130),
  @('P', 250, 170, 190),
  @('R', 200, 110, 120)
)
$RGB = New-Object 'System.Collections.Generic.Dictionary[string,System.Drawing.Color]' ([System.StringComparer]::Ordinal)
foreach ($c in $PAL) { $RGB[[string]$c[0]] = [System.Drawing.Color]::FromArgb(255, $c[1], $c[2], $c[3]) }

function SetPx($g, [int]$x, [int]$y, [string]$ch, [int]$w, [int]$h) {
  if ($x -lt 0 -or $x -ge $w -or $y -lt 0 -or $y -ge $h) { return }
  $g[$x, $y] = $ch
}
function GetPx($g, [int]$x, [int]$y, [int]$w, [int]$h) {
  if ($x -lt 0 -or $x -ge $w -or $y -lt 0 -or $y -ge $h) { return '.' }
  return [string]$g[$x, $y]
}

function Load-Grid([string]$path, [int]$w, [int]$h) {
  $b = [System.Drawing.Bitmap]::new((Resolve-Path $path).Path)
  $g = New-Object 'object[,]' $w, $h
  for ($y = 0; $y -lt $h; $y++) { for ($x = 0; $x -lt $w; $x++) {
      $p = $b.GetPixel($x, $y)
      if ($p.A -lt 128) { $g[$x, $y] = '.' } else { $g[$x, $y] = $p } } }
  $b.Dispose()
  return , $g
}

function Quantize($g, [int]$w, [int]$h) {
  for ($y = 0; $y -lt $h; $y++) { for ($x = 0; $x -lt $w; $x++) {
      $p = $g[$x, $y]
      if ($p -is [string]) { continue }
      $best = 'K'; $bd = [long]::MaxValue
      foreach ($c in $PAL) {
        $dr = [int]$p.R - $c[1]; $dg = [int]$p.G - $c[2]; $db = [int]$p.B - $c[3]
        $d = 2 * $dr * $dr + 4 * $dg * $dg + 3 * $db * $db
        if ($d -lt $bd) { $bd = $d; $best = [string]$c[0] }
      }
      $g[$x, $y] = $best } }
}

function Despeckle($g, [int]$w, [int]$h, [int]$passes) {
  for ($pass = 0; $pass -lt $passes; $pass++) {
    $changes = @()
    for ($y = 1; $y -lt ($h - 1); $y++) {
      for ($x = 1; $x -lt ($w - 1); $x++) {
        $c = [string]$g[$x, $y]
        if ($c -eq '.') { continue }
        $cnt = @{}
        $ok = $true
        for ($dy = -1; $dy -le 1; $dy++) {
          for ($dx = -1; $dx -le 1; $dx++) {
            if ($dx -eq 0 -and $dy -eq 0) { continue }
            $nx = $x + $dx; $ny = $y + $dy
            $n = GetPx $g $nx $ny $w $h
            if ($n -eq '.') { $ok = $false; break }
            if ($cnt.ContainsKey($n)) { $cnt[$n] = $cnt[$n] + 1 } else { $cnt[$n] = 1 }
          }
          if (-not $ok) { break }
        }
        if (-not $ok) { continue }
        $top = $cnt.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 1
        if ($null -eq $top) { continue }
        $isDark = ($c -eq 'K' -or $c -eq 'E')
        $topIsDark = ($top.Key -eq 'K' -or $top.Key -eq 'E')
        $limit = 6
        if ($isDark -and -not $topIsDark) { $limit = 4 }   # dark specks inside colour: easy
        if ($cnt.ContainsKey($c) -and -not $isDark) { continue }
        if ($top.Value -ge $limit) { $changes += , @($x, $y, [string]$top.Key) }
      }
    }
    foreach ($ch in $changes) { $g[$ch[0], $ch[1]] = $ch[2] }
  }
}

function Outline($g, [int]$w, [int]$h) {
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      if ([string]$g[$x, $y] -eq '.') { continue }
      $edge = $false
      if ($x -eq 0 -or $x -eq ($w - 1) -or $y -eq 0 -or $y -eq ($h - 1)) { $edge = $true }
      else {
        $xm = $x - 1; $xp = $x + 1; $ym = $y - 1; $yp = $y + 1
        if ((GetPx $g $xm $y $w $h) -eq '.') { $edge = $true }
        if ((GetPx $g $xp $y $w $h) -eq '.') { $edge = $true }
        if ((GetPx $g $x $ym $w $h) -eq '.') { $edge = $true }
        if ((GetPx $g $x $yp $w $h) -eq '.') { $edge = $true }
      }
      if ($edge) { $g[$x, $y] = 'K' }
    }
  }
}

function Stamp-Face($g, [int]$ox, [int]$oy, [int]$w, [int]$h) {
  $cx = $FaceX + ($FaceW - 1) / 2.0
  $cy = $FaceY + ($FaceH - 1) / 2.0
  for ($fy = 0; $fy -lt $FaceH; $fy++) {
    for ($fx = 0; $fx -lt $FaceW; $fx++) {
      $px = $FaceX + $fx
      $py = $FaceY + $fy
      $nx = ($px - $cx) / ($FaceW / 2.0)
      $ny = ($py - $cy) / ($FaceH / 2.0)
      if (($nx * $nx + $ny * $ny) -le 1.12) {
        $gx = $ox + $px; $gy = $oy + $py
        SetPx $g $gx $gy 'S' $w $h
      }
    }
  }
  $jy = $oy + $FaceY + $FaceH - 2
  for ($fx = 2; $fx -lt ($FaceW - 2); $fx++) {
    $px = $ox + $FaceX + $fx
    if ((GetPx $g $px $jy $w $h) -eq 'S') { SetPx $g $px $jy 's' $w $h }
  }

  $EYE = @('.EEE.', 'EBBBE', 'WBHBE', 'WBBbE', '.bbb.')
  $REV = @('.EEE.', 'EBBBE', 'EBHBW', 'EbBBW', '.bbb.')
  $lx = $ox + $FaceX + 1
  $rx = $ox + $FaceX + $FaceW - 6
  for ($j = 0; $j -lt 5; $j++) {
    $yy = $oy + $EyeY + $j
    for ($i = 0; $i -lt 5; $i++) {
      $ch1 = [string]$EYE[$j][$i]
      $ch2 = [string]$REV[$j][$i]
      $x1 = $lx + $i
      $x2 = $rx + $i
      if ($ch1 -ne '.') { SetPx $g $x1 $yy $ch1 $w $h }
      if ($ch2 -ne '.') { SetPx $g $x2 $yy $ch2 $w $h }
    }
  }
  $by = $oy + $EyeY - 2
  for ($i = 0; $i -lt 3; $i++) {
    $x1 = $lx + 1 + $i
    $x2 = $rx + 1 + $i
    SetPx $g $x1 $by 'D' $w $h
    SetPx $g $x2 $by 'D' $w $h
  }
  $mx = $ox + $FaceX + [int](($FaceW - 1) / 2)
  $my = $oy + $FaceY + $FaceH - 3
  SetPx $g ($mx - 1) $my 'R' $w $h
  SetPx $g $mx $my 'R' $w $h
  $bl = $oy + $FaceY + $FaceH - 4
  SetPx $g ($ox + $FaceX) $bl 'P' $w $h
  SetPx $g ($ox + $FaceX + $FaceW - 1) $bl 'P' $w $h
}

function Save-Grid($g, [int]$w, [int]$h, [string]$file) {
  $bmp = [System.Drawing.Bitmap]::new($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $h; $y++) { for ($x = 0; $x -lt $w; $x++) {
      $c = [string]$g[$x, $y]
      if ($c -eq '.') { continue }
      if (-not $RGB.ContainsKey($c)) { throw ("bad char {0} at {1},{2}" -f $c, $x, $y) }
      $bmp.SetPixel($x, $y, $RGB[$c]) } }
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Process([string]$name, [int]$w, [int]$h, [int]$frames) {
  $path = Join-Path $InDir $name
  if (-not (Test-Path $path)) { Write-Host ("missing " + $path); return }
  $g = Load-Grid $path $w $h
  if (-not $NoClean) {
    Quantize $g $w $h
    Despeckle $g $w $h 5
  }
  if (-not $NoFace) {
    for ($f = 0; $f -lt $frames; $f++) { Stamp-Face $g ($f * 40) 0 $w $h }
  }
  if (-not $NoClean) { Outline $g $w $h }
  Save-Grid $g $w $h (Join-Path $OutDir $name)
  Write-Host ("{0} -> {1}x{2} frames={3}" -f $name, $w, $h, $frames)
}

Process "zhanli.png" 40 56 1
Process "paobu.png" 120 56 3
Process "Armor_zhandou.png" 240 56 6
