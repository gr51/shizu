# slice-sheet.ps1 · 把 AI 生成的 sprite sheet 按 N×M 网格切成单个 PNG（用 System.Drawing，能读 JPEG/PNG）
# 用法：.\slice-sheet.ps1 -In <输入> -Cols <列> -Rows <行> -Out <输出目录> -Prefix <前缀>

param(
  [Parameter(Mandatory=$true)][string]$In,
  [Parameter(Mandatory=$true)][int]$Cols,
  [Parameter(Mandatory=$true)][int]$Rows,
  [Parameter(Mandatory=$true)][string]$Out,
  [string]$Prefix = 'cell'
)

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile($In)
$cellW = [int]($src.Width / $Cols)
$cellH = [int]($src.Height / $Rows)
Write-Host "原图 $($src.Width)x$($src.Height) -> ${Cols}x${Rows} 网格，每格 ${cellW}x${cellH}"

New-Item -ItemType Directory -Force -Path $Out | Out-Null
$idx = 0
for ($r = 0; $r -lt $Rows; $r++) {
  for ($c = 0; $c -lt $Cols; $c++) {
    $rect = New-Object System.Drawing.Rectangle ($c * $cellW), ($r * $cellH), $cellW, $cellH
    $bmp = New-Object System.Drawing.Bitmap $cellW, $cellH
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $cellW, $cellH), $rect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $name = "$Prefix`_$idx.png"
    $bmp.Save((Join-Path $Out $name), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "  $name"
    $idx++
  }
}
$src.Dispose()
Write-Host "OK 切出 $idx 张 -> $Out"
