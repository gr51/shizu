# ===== wire-icons.ps1 · 把生成的大厅图标接入游戏 =====
# 图标源是 JPEG（API 返回 URL 下载得到），这里：去背景（边缘 flood-fill）+ 紧致裁剪 + 存透明 PNG。
# 用法：powershell -File tools\wire-icons.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class IconProc {
  public static Bitmap Process(string src, int threshold) {
    using (var bmp = new Bitmap(src)) {
      int w = bmp.Width, h = bmp.Height;
      var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
      var px = new int[w * h];
      Marshal.Copy(data.Scan0, px, 0, px.Length);
      bmp.UnlockBits(data);

      int bg = px[0];
      int bgr = (bg >> 16) & 0xff, bgg = (bg >> 8) & 0xff, bgb = bg & 0xff;
      var seen = new bool[w * h];
      var q = new Queue<int>();
      for (int x = 0; x < w; x++) { q.Enqueue(x); q.Enqueue((h - 1) * w + x); }
      for (int y = 0; y < h; y++) { q.Enqueue(y * w); q.Enqueue(y * w + w - 1); }
      while (q.Count > 0) {
        int i = q.Dequeue();
        if (seen[i]) continue;
        seen[i] = true;
        int c = px[i];
        int r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
        int d = Math.Abs(r - bgr) + Math.Abs(g - bgg) + Math.Abs(b - bgb);
        if (d > threshold) continue;
        px[i] = 0;
        int x = i % w, y = i / w;
        if (x + 1 < w) q.Enqueue(i + 1);
        if (x - 1 >= 0) q.Enqueue(i - 1);
        if (y + 1 < h) q.Enqueue(i + w);
        if (y - 1 >= 0) q.Enqueue(i - w);
      }

      int minX = w, minY = h, maxX = -1, maxY = -1;
      for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        int i = y * w + x;
        if (((px[i] >> 24) & 0xff) > 10) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      if (maxX < minX) return null;
      int nw = maxX - minX + 1, nh = maxY - minY + 1;
      var outb = new Bitmap(nw, nh, PixelFormat.Format32bppArgb);
      var outd = outb.LockBits(new Rectangle(0, 0, nw, nh), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
      var outp = new int[nw * nh];
      for (int y = 0; y < nh; y++) for (int x = 0; x < nw; x++) outp[y * nw + x] = px[(minY + y) * w + (minX + x)];
      Marshal.Copy(outp, 0, outd.Scan0, outp.Length);
      outb.UnlockBits(outd);
      return outb;
    }
  }
}
'@

if (-not ('IconProc' -as [type])) {
  Add-Type -TypeDefinition $src -ReferencedAssemblies 'System.Drawing'
}

$root = Split-Path -Parent $PSScriptRoot
$inDir = Join-Path $root '.tmp\gen\icons'
$outDir = Join-Path $root 'shizu-cocos\assets\art\lobby\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

foreach ($name in @('rift', 'bag', 'codex', 'gear', 'reset')) {
  $f = Join-Path $inDir "$name.png"
  if (-not (Test-Path $f)) { Write-Host "  缺 $name"; continue }
  $bmp = [IconProc]::Process($f, 70)
  if ($null -eq $bmp) { Write-Host "  空 $name"; continue }
  $dst = Join-Path $outDir "$name.png"
  $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "  OK $name -> $dst"
}
Write-Host '✓ 图标接入完成'
