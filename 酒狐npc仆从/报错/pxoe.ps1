param(
  [Parameter(Mandatory=$true)][string]$InFile,
  [Parameter(Mandatory=$true)][string]$OutFile,
  [int]$OutW = 40,
  [int]$OutH = 56,
  [int]$TargetH = 52,
  [int]$Colors = 24,
  [switch]$NoOutline,
  [switch]$NoFace
)
$ErrorActionPreference = "Stop"

$cs = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class Pxoe
{
    public static byte[] Load(string path, out int w, out int h)
    {
        using (Bitmap bmp = new Bitmap(path))
        {
            w = bmp.Width; h = bmp.Height;
            Bitmap src = new Bitmap(w, h, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(src)) { g.DrawImageUnscaled(bmp, 0, 0); }
            BitmapData bd = src.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            byte[] raw = new byte[w * h * 4];
            Marshal.Copy(bd.Scan0, raw, 0, raw.Length);
            src.UnlockBits(bd); src.Dispose();
            byte[] rgba = new byte[w * h * 4];
            for (int i = 0; i < w * h; i++)
            {
                rgba[i * 4] = raw[i * 4 + 2];
                rgba[i * 4 + 1] = raw[i * 4 + 1];
                rgba[i * 4 + 2] = raw[i * 4];
                rgba[i * 4 + 3] = raw[i * 4 + 3];
            }
            return rgba;
        }
    }

    public static void Save(string path, byte[] rgba, int w, int h)
    {
        using (Bitmap bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb))
        {
            BitmapData bd = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            byte[] raw = new byte[w * h * 4];
            for (int i = 0; i < w * h; i++)
            {
                raw[i * 4] = rgba[i * 4 + 2];
                raw[i * 4 + 1] = rgba[i * 4 + 1];
                raw[i * 4 + 2] = rgba[i * 4];
                raw[i * 4 + 3] = rgba[i * 4 + 3];
            }
            Marshal.Copy(raw, 0, bd.Scan0, raw.Length);
            bmp.UnlockBits(bd);
            bmp.Save(path, ImageFormat.Png);
        }
    }

    public static double Luma(byte[] p, int i)
    {
        return 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    }

    public static void RemoveBackground(byte[] p, int w, int h, int thr)
    {
        bool[] seen = new bool[w * h];
        int[] stack = new int[w * h];
        int sp = 0;
        for (int x = 0; x < w; x++) { stack[sp++] = x; stack[sp++] = (h - 1) * w + x; }
        for (int y = 0; y < h; y++) { stack[sp++] = y * w; stack[sp++] = y * w + w - 1; }
        while (sp > 0)
        {
            int idx = stack[--sp];
            if (idx < 0 || idx >= w * h || seen[idx]) continue;
            seen[idx] = true;
            int i = idx * 4;
            if (p[i + 3] < 8) continue;
            if (!(p[i] > thr && p[i + 1] > thr && p[i + 2] > thr)) continue;
            p[i + 3] = 0;
            int x = idx % w, y = idx / w;
            if (x > 0) stack[sp++] = idx - 1;
            if (x < w - 1) stack[sp++] = idx + 1;
            if (y > 0) stack[sp++] = idx - w;
            if (y < h - 1) stack[sp++] = idx + w;
        }
    }

    public static void Bbox(byte[] p, int w, int h, out int x0, out int y0, out int x1, out int y1)
    {
        x0 = w; y0 = h; x1 = -1; y1 = -1;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                if (p[(y * w + x) * 4 + 3] < 8) continue;
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
    }

    public static bool IsSkin(byte[] p, int j)
    {
        int r = p[j], g = p[j + 1], b = p[j + 2];
        double l = 0.299 * r + 0.587 * g + 0.114 * b;
        int warm = r - b;
        return l > 190 && r >= g && g >= b && warm >= 14 && warm <= 85 && r > 215;
    }

    public static int[] FindFace(byte[] p, int w, int h, int limitY)
    {
        bool[] mask = new bool[w * h];
        for (int i = 0; i < w * h; i++)
        {
            if (p[i * 4 + 3] < 8) continue;
            if (IsSkin(p, i * 4)) mask[i] = true;
        }
        int[] res = new int[9];
        res[0] = -1;
        bool[] seen = new bool[w * h];
        int[] stack = new int[w * h];
        int best = -1;
        for (int i = 0; i < w * h; i++)
        {
            if (!mask[i] || seen[i]) continue;
            int sp = 0; stack[sp++] = i; seen[i] = true;
            int area = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
            long sr = 0, sg = 0, sb = 0;
            while (sp > 0)
            {
                int idx = stack[--sp];
                int x = idx % w, y = idx / w;
                area++;
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
                sr += p[idx * 4]; sg += p[idx * 4 + 1]; sb += p[idx * 4 + 2];
                for (int dy = -1; dy <= 1; dy++)
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        int nx = x + dx, ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                        int nj = ny * w + nx;
                        if (!mask[nj] || seen[nj]) continue;
                        seen[nj] = true; stack[sp++] = nj;
                    }
            }
            if (y0 > limitY) continue;
            if (area > best)
            {
                best = area;
                res[0] = x0; res[1] = y0; res[2] = x1; res[3] = y1;
                res[4] = (int)(sr / area); res[5] = (int)(sg / area); res[6] = (int)(sb / area);
                res[7] = area;
            }
        }
        return res;
    }

    public static void OutlineExpand(byte[] p, int w, int h, int radius, int thresh, double strength)
    {
        double[] lum = new double[w * h];
        for (int i = 0; i < w * h; i++) lum[i] = Luma(p, i * 4);
        double[] outp = new double[w * h];
        Array.Copy(lum, outp, lum.Length);
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                int idx = y * w + x;
                if (p[idx * 4 + 3] < 8) continue;
                double mn = 255, mx = 0; int n = 0;
                for (int dy = -radius; dy <= radius; dy++)
                {
                    int yy = y + dy; if (yy < 0 || yy >= h) continue;
                    for (int dx = -radius; dx <= radius; dx++)
                    {
                        int xx = x + dx; if (xx < 0 || xx >= w) continue;
                        int j = yy * w + xx;
                        if (p[j * 4 + 3] < 8) continue;
                        double l = lum[j];
                        if (l < mn) mn = l;
                        if (l > mx) mx = l;
                        n++;
                    }
                }
                if (n == 0) continue;
                if (mx - mn < thresh) continue;
                double mid = (mn + mx) * 0.5;
                double target = (lum[idx] < mid) ? mn : mx;
                outp[idx] = lum[idx] + (target - lum[idx]) * strength;
            }
        for (int i = 0; i < w * h; i++)
        {
            if (p[i * 4 + 3] < 8) continue;
            double l0 = lum[i];
            if (l0 < 1) continue;
            double k = outp[i] / l0;
            if (k < 0.25) k = 0.25;
            if (k > 1.7) k = 1.7;
            for (int c = 0; c < 3; c++)
            {
                double v = p[i * 4 + c] * k;
                if (v > 255) v = 255;
                if (v < 0) v = 0;
                p[i * 4 + c] = (byte)(v + 0.5);
            }
        }
    }

    public static byte[] Downscale(byte[] p, int w, int h, int ow, int oh,
        double bx0, double by0, double bw, double bh)
    {
        byte[] o = new byte[ow * oh * 4];
        for (int oy = 0; oy < oh; oy++)
            for (int ox = 0; ox < ow; ox++)
            {
                int sx0 = (int)Math.Floor(bx0 + ox * bw / ow);
                int sx1 = (int)Math.Ceiling(bx0 + (ox + 1) * bw / ow);
                int sy0 = (int)Math.Floor(by0 + oy * bh / oh);
                int sy1 = (int)Math.Ceiling(by0 + (oy + 1) * bh / oh);
                if (sx0 < 0) sx0 = 0; if (sy0 < 0) sy0 = 0;
                if (sx1 > w) sx1 = w; if (sy1 > h) sy1 = h;
                if (sx1 <= sx0) sx1 = sx0 + 1;
                if (sy1 <= sy0) sy1 = sy0 + 1;
                int total = 0, opaque = 0;
                System.Collections.Generic.Dictionary<int, int> map = new System.Collections.Generic.Dictionary<int, int>();
                for (int y = sy0; y < sy1; y++)
                    for (int x = sx0; x < sx1; x++)
                    {
                        int j = y * w + x;
                        total++;
                        if (p[j * 4 + 3] < 8) continue;
                        opaque++;
                        int key = ((p[j * 4] >> 4) << 8) | ((p[j * 4 + 1] >> 4) << 4) | (p[j * 4 + 2] >> 4);
                        if (map.ContainsKey(key)) map[key] = map[key] + 1; else map[key] = 1;
                    }
                int oi = (oy * ow + ox) * 4;
                if (opaque * 2 < total) { o[oi + 3] = 0; continue; }
                int bestKey = -1, bestCount = -1;
                foreach (System.Collections.Generic.KeyValuePair<int, int> kv in map)
                    if (kv.Value > bestCount) { bestCount = kv.Value; bestKey = kv.Key; }
                if (bestKey < 0) { o[oi + 3] = 0; continue; }
                long sr = 0, sg = 0, sb = 0; int sn = 0;
                for (int y = sy0; y < sy1; y++)
                    for (int x = sx0; x < sx1; x++)
                    {
                        int j = y * w + x;
                        if (p[j * 4 + 3] < 8) continue;
                        int key = ((p[j * 4] >> 4) << 8) | ((p[j * 4 + 1] >> 4) << 4) | (p[j * 4 + 2] >> 4);
                        if (key != bestKey) continue;
                        sr += p[j * 4]; sg += p[j * 4 + 1]; sb += p[j * 4 + 2]; sn++;
                    }
                o[oi] = (byte)(sr / sn); o[oi + 1] = (byte)(sg / sn); o[oi + 2] = (byte)(sb / sn); o[oi + 3] = 255;
            }
        return o;
    }

    public static void Quantize(byte[] p, int w, int h, int k)
    {
        int n = w * h;
        double[] cr = new double[k], cg = new double[k], cb = new double[k];
        int[] order = new int[n];
        int cnt = 0;
        for (int i = 0; i < n; i++) if (p[i * 4 + 3] >= 8) order[cnt++] = i;
        if (cnt == 0) return;
        double[] lum = new double[cnt];
        for (int j = 0; j < cnt; j++) lum[j] = Luma(p, order[j] * 4);
        Array.Sort(lum, order);
        for (int c = 0; c < k; c++)
        {
            int pos = (int)((c + 0.5) * cnt / k);
            if (pos >= cnt) pos = cnt - 1;
            int j = order[pos];
            cr[c] = p[j * 4]; cg[c] = p[j * 4 + 1]; cb[c] = p[j * 4 + 2];
        }
        for (int it = 0; it < 10; it++)
        {
            double[] ar = new double[k], ag = new double[k], ab = new double[k];
            int[] an = new int[k];
            for (int i = 0; i < n; i++)
            {
                if (p[i * 4 + 3] < 8) continue;
                double r = p[i * 4], g = p[i * 4 + 1], b = p[i * 4 + 2];
                int bestC = 0; double bd = 1e18;
                for (int c = 0; c < k; c++)
                {
                    double dr = r - cr[c], dg = g - cg[c], db = b - cb[c];
                    double d = dr * dr + dg * dg + db * db;
                    if (d < bd) { bd = d; bestC = c; }
                }
                ar[bestC] += r; ag[bestC] += g; ab[bestC] += b; an[bestC]++;
            }
            for (int c = 0; c < k; c++)
                if (an[c] > 0) { cr[c] = ar[c] / an[c]; cg[c] = ag[c] / an[c]; cb[c] = ab[c] / an[c]; }
        }
        for (int i = 0; i < n; i++)
        {
            if (p[i * 4 + 3] < 8) continue;
            double r = p[i * 4], g = p[i * 4 + 1], b = p[i * 4 + 2];
            int bestC = 0; double bd = 1e18;
            for (int c = 0; c < k; c++)
            {
                double dr = r - cr[c], dg = g - cg[c], db = b - cb[c];
                double d = dr * dr + dg * dg + db * db;
                if (d < bd) { bd = d; bestC = c; }
            }
            p[i * 4] = (byte)(cr[bestC] + 0.5);
            p[i * 4 + 1] = (byte)(cg[bestC] + 0.5);
            p[i * 4 + 2] = (byte)(cb[bestC] + 0.5);
        }
    }

    public static void FacePass(byte[] src, int w, int h, byte[] dst, int dw, int dh,
        int fx0, int fy0, int fx1, int fy1, double bx0, double by0, double bw, double bh)
    {
        for (int oy = 0; oy < dh; oy++)
            for (int ox = 0; ox < dw; ox++)
            {
                double cxS = bx0 + (ox + 0.5) * bw / dw;
                double cyS = by0 + (oy + 0.5) * bh / dh;
                if (cxS < fx0 || cxS > fx1) continue;
                if (cyS < fy0 || cyS > fy1) continue;
                int ax = (int)Math.Floor(bx0 + ox * bw / dw);
                int ex = (int)Math.Ceiling(bx0 + (ox + 1) * bw / dw);
                int ay = (int)Math.Floor(by0 + oy * bh / dh);
                int ey = (int)Math.Ceiling(by0 + (oy + 1) * bh / dh);
                if (ax < 0) ax = 0; if (ay < 0) ay = 0;
                if (ex > w) ex = w; if (ey > h) ey = h;
                int skin = 0, sclera = 0, lash = 0, iris = 0, mouth = 0, opaque = 0;
                long sr = 0, sg = 0, sb = 0, ir = 0, ig = 0, ib = 0;
                int lr = 0, lg = 0, lb = 0; double bestL = 1e9;
                long mr = 0, mg = 0, mb = 0;
                for (int y = ay; y < ey; y++)
                    for (int x = ax; x < ex; x++)
                    {
                        int j = (y * w + x) * 4;
                        if (src[j + 3] < 8) continue;
                        opaque++;
                        int r = src[j], g = src[j + 1], b = src[j + 2];
                        double l = 0.299 * r + 0.587 * g + 0.114 * b;
                        int warm = r - b;
                        if (l < 118) { lash++; if (l < bestL) { bestL = l; lr = r; lg = g; lb = b; } }
                        else if (b > r + 18 && l > 95 && l < 218) { iris++; ir += r; ig += g; ib += b; }
                        else if (r > 195 && r - g > 55) { mouth++; mr += r; mg += g; mb += b; }
                        else if (r > 232 && g > 232 && b > 232 && warm < 14) { sclera++; }
                        else if (IsSkin(src, j)) { skin++; sr += r; sg += g; sb += b; }
                    }
                if (opaque == 0) continue;
                int bestCount = skin;
                int cls = 0;
                if (sclera > bestCount) { bestCount = sclera; cls = 1; }
                if (lash > bestCount) { bestCount = lash; cls = 2; }
                if (iris > bestCount) { bestCount = iris; cls = 3; }
                if (mouth > bestCount) { bestCount = mouth; cls = 4; }
                int di = (oy * dw + ox) * 4;
                if (dst[di + 3] < 8) continue;
                if (bestCount * 3 < opaque && cls != 2) continue;
                switch (cls)
                {
                    case 0:
                        if (skin > 0) { dst[di] = (byte)(sr / skin); dst[di + 1] = (byte)(sg / skin); dst[di + 2] = (byte)(sb / skin); }
                        break;
                    case 1:
                        dst[di] = 250; dst[di + 1] = 250; dst[di + 2] = 253;
                        break;
                    case 2:
                        dst[di] = (byte)lr; dst[di + 1] = (byte)lg; dst[di + 2] = (byte)lb;
                        break;
                    case 3:
                        dst[di] = (byte)(ir / iris); dst[di + 1] = (byte)(ig / iris); dst[di + 2] = (byte)(ib / iris);
                        break;
                    case 4:
                        dst[di] = (byte)(mr / mouth); dst[di + 1] = (byte)(mg / mouth); dst[di + 2] = (byte)(mb / mouth);
                        break;
                }
            }
    }

    public static void OutlineEdge(byte[] p, int w, int h, byte r, byte g, byte b)
    {
        byte[] copy = (byte[])p.Clone();
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                int i = (y * w + x) * 4;
                if (copy[i + 3] < 8) continue;
                bool edge = false;
                if (x == 0 || y == 0 || x == w - 1 || y == h - 1) edge = true;
                else
                {
                    if (copy[(y * w + x - 1) * 4 + 3] < 8) edge = true;
                    if (copy[(y * w + x + 1) * 4 + 3] < 8) edge = true;
                    if (copy[((y - 1) * w + x) * 4 + 3] < 8) edge = true;
                    if (copy[((y + 1) * w + x) * 4 + 3] < 8) edge = true;
                }
                if (edge) { p[i] = r; p[i + 1] = g; p[i + 2] = b; }
            }
    }
}
'@

Add-Type -TypeDefinition $cs -ReferencedAssemblies "System.Drawing" -ErrorAction Stop

$w = 0; $h = 0
$img = [Pxoe]::Load((Resolve-Path $InFile).Path, [ref]$w, [ref]$h)
Write-Host ("loaded {0}x{1}" -f $w, $h)
[Pxoe]::RemoveBackground($img, $w, $h, 232)

$x0 = 0; $y0 = 0; $x1 = 0; $y1 = 0
[Pxoe]::Bbox($img, $w, $h, [ref]$x0, [ref]$y0, [ref]$x1, [ref]$y1)
$bw = $x1 - $x0 + 1; $bh = $y1 - $y0 + 1
Write-Host ("bbox {0},{1} {2}x{3}" -f $x0, $y0, $bw, $bh)

$face = [Pxoe]::FindFace($img, $w, $h, [int]($h * 0.55))
if ($face[0] -ge 0) {
  Write-Host ("face box {0},{1}..{2},{3}  skin {4},{5},{6}  area {7}" -f $face[0],$face[1],$face[2],$face[3],$face[4],$face[5],$face[6],$face[7])
} else { Write-Host "face not found" }

[Pxoe]::OutlineExpand($img, $w, $h, 2, 42, 0.55)

$scale = $bh / [double]$TargetH
$sw = $OutW * $scale
$sh = $bh
$bx = $x0 + ($bw - $sw) / 2.0
if ($bx -lt 0) { $bx = 0 }
$by = $y0

$out = [Pxoe]::Downscale($img, $w, $h, $OutW, $OutH, $bx, $by, $sw, $sh)
[Pxoe]::Quantize($out, $OutW, $OutH, $Colors)
Write-Host ("downscaled + quantized (scale {0:n2})" -f $scale)

if (-not $NoFace -and $face[0] -ge 0) {
  [Pxoe]::FacePass($img, $w, $h, $out, $OutW, $OutH, $face[0], $face[1], $face[2], $face[3], $bx, $by, $sw, $sh)
  Write-Host "face pass done"
}
if (-not $NoOutline) { [Pxoe]::OutlineEdge($out, $OutW, $OutH, 12, 14, 34) }
[Pxoe]::Save($OutFile, $out, $OutW, $OutH)
Write-Host ("saved " + $OutFile)
