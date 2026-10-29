param(
  [Parameter(Mandatory=$true)][string]$InFile,
  [Parameter(Mandatory=$true)][string]$OutFile,
  [int]$X = 0, [int]$Y = 0, [int]$W = 40, [int]$H = 56,
  [int]$Scale = 12,
  [int]$FrameW = 0, [int]$FrameH = 0, [int]$Frame = 0
)
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Bitmap]::new((Resolve-Path $InFile).Path)
if ($FrameW -gt 0 -and $FrameH -gt 0) {
  $ox = ($Frame % [int]($src.Width / $FrameW)) * $FrameW
  $oy = [int]([math]::Floor($Frame / [int]($src.Width / $FrameW))) * $FrameH
} else { $ox = 0; $oy = 0 }
$dst = [System.Drawing.Bitmap]::new($W * $Scale, $H * $Scale)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.Clear([System.Drawing.Color]::FromArgb(255, 24, 20, 34))
$g.DrawImage($src, [System.Drawing.Rectangle]::new(0, 0, $W * $Scale, $H * $Scale),
  [System.Drawing.Rectangle]::new($ox + $X, $oy + $Y, $W, $H), [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$dst.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose(); $src.Dispose()
Write-Host ("crop {0},{1} {2}x{3} scale {4} -> {5}" -f ($ox + $X), ($oy + $Y), $W, $H, $Scale, (Split-Path $OutFile -Leaf))
