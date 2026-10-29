param(
  [Parameter(Mandatory=$true)][string]$InFile,
  [int]$X0 = 0, [int]$Y0 = 0, [int]$X1 = -1, [int]$Y1 = -1
)
Add-Type -AssemblyName System.Drawing

# Authoritative palette: single char per color, case-SENSITIVE (array, not hashtable)
$PAL = @(
  @('.', -1,   -1,  -1),   # transparent
  @('K',  24,  22,  34),   # outline near-black
  @('D',  26,  38,  92),   # deep navy (hair root / dress)
  @('N',  42,  62, 132),   # navy mid
  @('M',  60,  96, 180),   # blue
  @('C',  96, 186, 232),   # cyan hair tip
  @('S', 255, 226, 206),   # skin
  @('s', 232, 186, 168),   # skin shadow
  @('W', 255, 255, 255),   # white
  @('w', 206, 220, 238),   # white shadow
  @('B',  64, 140, 224),   # iris blue
  @('b',  28,  76, 160),   # iris dark
  @('P', 255, 150, 168),   # blush
  @('R', 198,  72,  72),   # mouth red
  @('G', 226, 178,  96)    # gold
)

$bmp = [System.Drawing.Bitmap]::new((Resolve-Path $InFile).Path)
if ($X1 -lt 0) { $X1 = $bmp.Width - 1 }
if ($Y1 -lt 0) { $Y1 = $bmp.Height - 1 }

Write-Host ("FILE {0}  {1}x{2}   region x{3}-{4} y{5}-{6}" -f (Split-Path $InFile -Leaf), $bmp.Width, $bmp.Height, $X0, $X1, $Y0, $Y1)
$hdr = "     "
for ($x = $X0; $x -le $X1; $x++) { $hdr += [string]($x % 10) }
Write-Host $hdr

for ($y = $Y0; $y -le $Y1; $y++) {
  $line = ""
  for ($x = $X0; $x -le $X1; $x++) {
    $px = $bmp.GetPixel($x, $y)
    if ($px.A -lt 8) { $line += '.'; continue }
    $best = '?'; $bd = [int]::MaxValue
    for ($i = 0; $i -lt $PAL.Count; $i++) {
      $c = $PAL[$i]
      if ($c[1] -lt 0) { continue }
      $dr = [int]$px.R - $c[1]; $dg = [int]$px.G - $c[2]; $db = [int]$px.B - $c[3]
      $d = $dr*$dr + $dg*$dg + $db*$db
      if ($d -lt $bd) { $bd = $d; $best = $c[0] }
    }
    $line += $best
  }
  Write-Host ("{0,3}: {1}" -f $y, $line)
}
$bmp.Dispose()

