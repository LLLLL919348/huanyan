param([Parameter(Mandatory=$true)][string]$InFile)
Add-Type -AssemblyName System.Drawing
$b = [System.Drawing.Bitmap]::new((Resolve-Path $InFile).Path)
$W = $b.Width; $H = $b.Height

Write-Host ("{0} {1}x{2}" -f (Split-Path $InFile -Leaf), $W, $H)
Write-Host ("     " + ((0..($W-1) | ForEach-Object { [string]($_ % 10) }) -join ''))
for ($y = 0; $y -lt $H; $y++) {
  $line = ""
  for ($x = 0; $x -lt $W; $x++) {
    $p = $b.GetPixel($x, $y)
    if ($p.A -lt 8) { $line += '.'; continue }
    $r = [int]$p.R; $g = [int]$p.G; $bb = [int]$p.B
    $mx = [math]::Max($r, [math]::Max($g, $bb)); $mn = [math]::Min($r, [math]::Min($g, $bb))
    $sat = $mx - $mn
    if ($r -gt 190 -and $g -gt 150 -and $sat -lt 70 -and $bb -lt $r) { $line += 'S' }        # skin-ish
    elseif ($mx -lt 70) { $line += '#' }                                                     # dark outline
    elseif ($bb -gt $r + 15 -and $mx -gt 90) { $line += ($(if ($sat -gt 90) { 'C' } else { 'N' })) }  # blue / cyan
    elseif ($mx -gt 200 -and $sat -lt 40) { $line += 'W' }                                   # white
    else { $line += '?' }
  }
  Write-Host ("{0,3}: {1}" -f $y, $line)
}

# dominant colours overall
$h = @{}
for ($y = 0; $y -lt $H; $y++) { for ($x = 0; $x -lt $W; $x++) {
    $p = $b.GetPixel($x, $y); if ($p.A -lt 8) { continue }
    $k = "{0},{1},{2}" -f $p.R, $p.G, $p.B
    if ($h.ContainsKey($k)) { $h[$k]++ } else { $h[$k] = 1 } } }
Write-Host "--- top colours ---"
$h.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 18 | ForEach-Object { "  {0,-14} {1,4}" -f $_.Key, $_.Value }
$b.Dispose()
