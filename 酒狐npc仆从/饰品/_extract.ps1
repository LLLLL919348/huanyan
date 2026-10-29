Add-Type -AssemblyName PresentationCore, WindowsBase, System.Xaml
$src = "C:\Users\1\Documents\My Games\Terraria\tModLoader\ModSources\酒狐npc仆从\饰品\240px-Totem_of_Undying_Animation.webp"
$outDir = "C:\Users\1\Documents\My Games\Terraria\tModLoader\ModSources\酒狐npc仆从\饰品\totem_frames"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$stream = [System.IO.File]::OpenRead($src)
try {
  $decoder = [System.Windows.Media.Imaging.BitmapDecoder]::Create($stream, [System.Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat, [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
  $frames = $decoder.Frames
  Write-Output ("frames: " + $frames.Count)
  $i = 0
  foreach($f in $frames){
    $enc = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
    $enc.Frames.Add($f)
    $fs = [System.IO.File]::Create((Join-Path $outDir ("frame{0:D3}.png" -f $i)))
    $enc.Save($fs); $fs.Close()
    $i++
  }
  Write-Output ("saved: " + $i)
} finally { $stream.Close() }
