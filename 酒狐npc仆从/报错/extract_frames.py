import sys, os
from PIL import Image, ImageSequence

src = sys.argv[1]
outdir = sys.argv[2]
os.makedirs(outdir, exist_ok=True)

im = Image.open(src)
print("format", im.format, "size", im.size, "n_frames", getattr(im, "n_frames", 1), "mode", im.mode)

frames = []
for i, fr in enumerate(ImageSequence.Iterator(im)):
    f = fr.convert("RGBA")
    p = os.path.join(outdir, "f%02d.png" % i)
    f.save(p)
    frames.append(p)
    print("frame", i, f.size, "bbox", f.getbbox())

print("saved", len(frames), "frames to", outdir)
