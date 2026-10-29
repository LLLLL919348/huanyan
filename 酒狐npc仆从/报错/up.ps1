param(
  [Parameter(Mandatory=$true)][string]$InFile,
  [Parameter(Mandatory=$true)][string]$OutFile,
  [int]$Scale = 8,
  [int]$FrameW = 40,
  [int]$FrameH = 56,
  [switch]$Horizontal,
  [switch]$NoGrid,
  [string]$Bg = "24,20,34"
)
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::new((Resolve-Path $InFile).Path)
if ($Horizontal) { $fx = [int]($src.Width / $FrameW); $fy = 1 } else { $fx = 1; $fy = [int]($src.Height / $FrameH) }
$n = $fx * $fy

$gap = if ($NoGrid) { 0 } else { 1 }
$w = ($fx * $FrameW + ($fx - 1) * $gap) * $Scale
$h = ($fy * $FrameH + ($fy - 1) * $gap) * $Scale
$dst = [System.Drawing.Bitmap]::new($w, $h)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$bc = $Bg -split ","; $g.Clear([System.Drawing.Color]::FromArgb(255, [int]$bc[0], [int]$bc[1], [int]$bc[2]))

for ($j = 0; $j -lt $fy; $j++) {
  for ($i = 0; $i -lt $fx; $i++) {
    $sx = $i * $FrameW; $sy = $j * $FrameH
    $rect = [System.Drawing.Rectangle]::new($sx, $sy, $FrameW, $FrameH)
    $dx = ($i * ($FrameW + $gap)) * $Scale
    $dy = ($j * ($FrameH + $gap)) * $Scale
    $drect = [System.Drawing.Rectangle]::new($dx, $dy, $FrameW * $Scale, $FrameH * $Scale)
    $g.DrawImage($src, $drect, $rect, [System.Drawing.GraphicsUnit]::Pixel)
  }
}
$g.Dispose()
$dst.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose(); $src.Dispose()
Write-Host ("{0}  frames={1}  scale={2}  -> {3} ({4}x{5})" -f (Split-Path $InFile -Leaf), $n, $Scale, (Split-Path $OutFile -Leaf), $w, $h)


