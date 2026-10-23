"""Builds synthetic 'camera' clips of the real reference photos with KNOWN geometry, for the tracking tests.

Each clip is a looping MJPEG file that headless Chromium can play as a fake webcam. For every clip a JSON
sidecar records where the centre of the photograph is in video pixels, so tests can compare the tracked
pumpkin position with ground truth.

usage: python3 -I make-test-videos.py <images_dir> <out_dir>
"""
import json, math, subprocess, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

images_dir, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
VW, VH = 1280, 720
BG = (92, 88, 84)

def homography(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    _, _, vt = np.linalg.svd(np.array(A, float))
    H = vt[-1].reshape(3, 3)
    return H / H[2, 2]

def apply(H, x, y):
    p = H @ np.array([x, y, 1.0])
    return p[0] / p[2], p[1] / p[2]

def make_frame(photo, quad):
    w, h = photo.size
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    H = homography(src, quad)
    Hinv = np.linalg.inv(H)
    coeffs = (Hinv / Hinv[2, 2]).flatten()[:8]
    warped = photo.transform((VW, VH), Image.PERSPECTIVE, tuple(coeffs), Image.BICUBIC)
    mask = Image.new('L', photo.size, 255).transform((VW, VH), Image.PERSPECTIVE, tuple(coeffs), Image.BILINEAR)
    frame = Image.new('RGB', (VW, VH), BG)
    frame.paste(warped, (0, 0), mask)
    cx, cy = apply(H, w / 2, h / 2)
    return frame, (cx, cy)

def rect_quad(cx, cy, height, angle_deg=0.0, aspect=1152 / 2048):
    hh, hw = height / 2, height * aspect / 2
    a = math.radians(angle_deg)
    pts = []
    for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]:
        x, y = sx * hw, sy * hh
        pts.append((cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a)))
    return pts

def write_clip(name, frame, centre):
    jpg = os.path.join(out_dir, f'{name}.jpg')
    frame.save(jpg, quality=95)
    out = os.path.join(out_dir, f'{name}.mjpeg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-i', jpg, '-t', '2', '-r', '15',
                    '-vf', 'format=yuvj420p', '-c:v', 'mjpeg', '-q:v', '2', '-f', 'mjpeg', out], check=True)
    with open(os.path.join(out_dir, f'{name}.json'), 'w') as f:
        json.dump({'name': name, 'video': [VW, VH], 'centre': centre}, f)
    print(name, 'centre', None if centre is None else (round(centre[0], 1), round(centre[1], 1)))

photos = [Image.open(os.path.join(images_dir, f'image{i}.jpg')).convert('RGB') for i in (1, 2, 3)]

for i, p in enumerate(photos, 1):
    f, c = make_frame(p, rect_quad(VW / 2, VH / 2, 640))
    write_clip(f'img{i}-straight', f, c)

# Rotated 28 degrees, off-centre
f, c = make_frame(photos[2], rect_quad(VW * 0.42, VH * 0.52, 600, angle_deg=28))
write_clip('img3-rotated', f, c)

# Perspective: image turned away (right edge farther than left edge) and tilted
tilt = [(470, 90), (790, 150), (800, 600), (450, 650)]
f, c = make_frame(photos[0], tilt)
write_clip('img1-perspective', f, c)

# Blank scene: nothing to find
blank = Image.new('RGB', (VW, VH), BG)
d = ImageDraw.Draw(blank)
write_clip('blank', blank, None)

# Moving: image 3 sweeps left-to-right while swaying +-14 degrees, 15 fps for 4 s. The sidecar lists the true centre of
# every frame so a test can check that the tracked pumpkin follows the real path.
FRAMES = 60
path_pts = []
seq_dir = os.path.join(out_dir, 'moving-frames')
os.makedirs(seq_dir, exist_ok=True)
for k in range(FRAMES):
    u = k / (FRAMES - 1)
    cx = VW * (0.32 + 0.36 * (0.5 - 0.5 * math.cos(math.pi * 2 * u * 0.5)))  # eases 0.32 -> 0.68 of the width
    ang = 14 * math.sin(2 * math.pi * u)
    f, c = make_frame(photos[2], rect_quad(cx, VH / 2, 600, angle_deg=ang))
    f.save(os.path.join(seq_dir, f'f{k:03d}.jpg'), quality=95)
    path_pts.append(c)
mov = os.path.join(out_dir, 'img3-moving.mjpeg')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '15', '-i', os.path.join(seq_dir, 'f%03d.jpg'),
                '-vf', 'format=yuvj420p', '-c:v', 'mjpeg', '-q:v', '2', '-f', 'mjpeg', mov], check=True)
with open(os.path.join(out_dir, 'img3-moving.json'), 'w') as fh:
    json.dump({'name': 'img3-moving', 'video': [VW, VH], 'path': path_pts}, fh)
print('img3-moving', FRAMES, 'frames, centre x from', round(min(p[0] for p in path_pts)), 'to', round(max(p[0] for p in path_pts)))

# Lose-and-refind: 4 s with image 3 in view, then 6 s of an empty scene, looping. (MJPEG streams concatenate.)
with open(os.path.join(out_dir, 'img3-lose.mjpeg'), 'wb') as out:
    for _ in range(2):
        out.write(open(os.path.join(out_dir, 'img3-straight.mjpeg'), 'rb').read())
    for _ in range(3):
        out.write(open(os.path.join(out_dir, 'blank.mjpeg'), 'rb').read())
print('img3-lose written')
