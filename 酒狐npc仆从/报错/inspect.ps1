param([Parameter(Mandatory=$true)][string]$InFile)
Add-Type -AssemblyName System.Drawing
$b = [System.Drawing.Bitmap]::new((Resolve-Path $InFile).Path)

# --- colour histogram
$h = @{}
for ($y = 0; $y -lt $b.Height; $y++) {
  for ($x = 0; $x -lt $b.Width; $x++) {
    $p = $b.GetPixel($x, $y)
    if ($p.A -lt 8) { continue }
    $k = "{0},{1},{2}" -f $p.R, $p.G, $p.B
    if ($h.ContainsKey($k)) { $h[$k]++ } else { $h[$k] = 1 }
  }
}
Write-Host ("distinct colours: {0}" -f $h.Count)
$top = $h.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 26
foreach ($e in $top) { Write-Host ("  {0,-14} {1,5}" -f $e.Key, $e.Value) }

# --- silhouette span per row
Write-Host "row spans (y: left..right  width):"
for ($y = 0; $y -lt $b.Height; $y++) {
  $l = -1; $r = -1
  for ($x = 0; $x -lt $b.Width; $x++) {
    if ($b.GetPixel($x, $y).A -ge 8) { if ($l -lt 0) { $l = $x }; $r = $x }
  }
  if ($l -ge 0) { Write-Host ("{0,3}: {1,3}..{2,3}  ({3})" -f $y, $l, $r, ($r - $l + 1)) }
}

# --- skin region bbox
$sl = 999; $sr = -1; $st = 999; $sb = -1
for ($y = 0; $y -lt $b.Height; $y++) {
  for ($x = 0; $x -lt $b.Width; $x++) {
    $p = $b.GetPixel($x, $y)
    if ($p.A -lt 8) { continue }
    if ($p.R -gt 200 -and $p.G -gt 170 -and $p.G -lt 235 -and $p.B -gt 150 -and $p.B -lt 225) {
      if ($x -lt $sl) { $sl = $x }; if ($x -gt $sr) { $sr = $x }
      if ($y -lt $st) { $st = $y }; if ($y -gt $sb) { $sb = $y }
    }
  }
}
Write-Host ("skin bbox: x {0}..{1}  y {2}..{3}" -f $sl, $sr, $st, $sb)
$b.Dispose()
