param(
  [Parameter(Mandatory=$true)][string]$InFile,   # a single frame (png/jpg)
  [Parameter(Mandatory=$true)][string]$OutFile,  # 720x56 sheet
  [int]$FrameW = 72,
  [int]$FrameH = 56,
  [int]$Frames = 10,
  [int]$ContentH = 52,
  [string]$Offsets = "0,1,2,1,0,1,2,1,0,0",
  [int]$BgThresh = 232
)
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::new((Resolve-Path $InFile).Path)
# crop to content using alpha, else by non-white pixels
$minX = $src.Width; $minY = $src.Height; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $src.Height; $y++) {
  for ($x = 0; $x -lt $src.Width; $x++) {
    $p = $src.GetPixel($x, $y)
    $opaque = $p.A -gt 8
    if (-not $opaque) { continue }
    if ($p.R -gt $BgThresh -and $p.G -gt $BgThresh -and $p.B -gt $BgThresh) { continue }
    if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
    if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
  }
}
if ($maxX -lt 0) { throw "empty image" }
$cw = $maxX - $minX + 1; $ch = $maxY - $minY + 1
Write-Host ("content {0},{1} {2}x{3}" -f $minX, $minY, $cw, $ch)

# uniform scale so the content is ContentH tall, nearest neighbour only
$scale = $ContentH / [double]$ch
$dw = [int][math]::Round($cw * $scale)
$dh = [int][math]::Round($ch * $scale)
Write-Host ("scaled to {0}x{1} (x{2:n3})" -f $dw, $dh, $scale)

# pre-scale the content into its own bitmap with nearest neighbour, integer maths
$scaled = [System.Drawing.Bitmap]::new($dw, $dh, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $dh; $y++) {
  $sy = $minY + [int][math]::Floor($y / $scale)
  if ($sy -gt $maxY) { $sy = $maxY }
  for ($x = 0; $x -lt $dw; $x++) {
    $sx = $minX + [int][math]::Floor($x / $scale)
    if ($sx -gt $maxX) { $sx = $maxX }
    $p = $src.GetPixel($sx, $sy)
    if ($p.A -le 8) { continue }
    if ($p.R -gt $BgThresh -and $p.G -gt $BgThresh -and $p.B -gt $BgThresh) { continue }
    $scaled.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $p.R, $p.G, $p.B))
  }
}
$src.Dispose()

$offs = @($Offsets -split "," | ForEach-Object { [int]$_.Trim() })
$sheet = [System.Drawing.Bitmap]::new($FrameW * $Frames, $FrameH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$padX = [int](($FrameW - $dw) / 2)
for ($i = 0; $i -lt $Frames; $i++) {
  $dy = $offs[$i % $offs.Count]
  $g.DrawImage($scaled, [System.Drawing.Rectangle]::new($padX + $i * $FrameW, $dy, $dw, $dh),
    [System.Drawing.Rectangle]::new(0, 0, $dw, $dh), [System.Drawing.GraphicsUnit]::Pixel)
}
$g.Dispose()
$scaled.Dispose()
$sheet.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
Write-Host ("saved {0} ({1}x{2})" -f $OutFile, ($FrameW * $Frames), $FrameH)
