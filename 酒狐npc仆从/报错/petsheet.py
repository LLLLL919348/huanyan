import sys, os
from PIL import Image, ImageSequence

src = sys.argv[1]
out = sys.argv[2]
FW = int(sys.argv[3]) if len(sys.argv) > 3 else 72
FH = int(sys.argv[4]) if len(sys.argv) > 4 else 56
CONTENT_H = int(sys.argv[5]) if len(sys.argv) > 5 else 52
MAX_FRAMES = 10

im = Image.open(src)
n = getattr(im, "n_frames", 1)
print("source", im.format, im.size, "frames", n)

frames = []
for i, fr in enumerate(ImageSequence.Iterator(im)):
    frames.append(fr.convert("RGBA"))
print("loaded", len(frames))

# keep at most MAX_FRAMES, evenly spaced
if len(frames) > MAX_FRAMES:
    idx = [round(i * (len(frames) - 1) / (MAX_FRAMES - 1)) for i in range(MAX_FRAMES)]
    frames = [frames[int(j)] for j in idx]
    print("sampled frames", idx)

# common bbox across all frames so the motion is preserved
minx, miny, maxx, maxy = 10**9, 10**9, -1, -1
for f in frames:
    bb = f.getbbox()
    if not bb:
        continue
    minx = min(minx, bb[0]); miny = min(miny, bb[1])
    maxx = max(maxx, bb[2]); maxy = max(maxy, bb[3])
cw, ch = maxx - minx, maxy - miny
print("common content", (minx, miny, cw, ch))

scale = CONTENT_H / ch
dw, dh = max(1, round(cw * scale)), max(1, round(ch * scale))
print("scaled to", (dw, dh), "scale", round(scale, 4))

sheet = Image.new("RGBA", (FW * len(frames), FH), (0, 0, 0, 0))
padx = (FW - dw) // 2
for i, f in enumerate(frames):
    crop = f.crop((minx, miny, maxx, maxy))
    small = crop.resize((dw, dh), Image.NEAREST)
    sheet.alpha_composite(small, (padx + i * FW, 0))

sheet.save(out)
print("saved", out, sheet.size, "frames", len(frames))
