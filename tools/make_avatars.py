"""Turn photos of your child into Brick Buddy avatar poses — 100% on this Mac.

Background removal uses Apple's Vision framework (VNGenerateForegroundInstanceMaskRequest,
macOS 14+) through PyObjC. No photo is uploaded anywhere, sent to Claude, or committed to git.

    pip install pyobjc-framework-Vision pyobjc-framework-Quartz pillow
    python tools/make_avatars.py \
        --wave peace.png --think chin.png --jump jump.png --hug bunny.png \
        --pout pout.png --bike bike.png --hips hips.png \
        --out backend/data/private/avatar

Output: one transparent PNG per pose (wave.png, think.png, ...). The app picks them up
automatically (or upload them in Parent mode -> Avatar Studio).
"""
from __future__ import annotations

import argparse
import io
from pathlib import Path

from PIL import Image

POSES = ["wave", "think", "jump", "hug", "pout", "bike", "hips"]


def cutout(src: Path) -> Image.Image:
    import Quartz
    import Vision
    from Foundation import NSURL

    handler = Vision.VNImageRequestHandler.alloc().initWithURL_options_(NSURL.fileURLWithPath_(str(src)), None)
    req = Vision.VNGenerateForegroundInstanceMaskRequest.alloc().init()
    ok, err = handler.performRequests_error_([req], None)
    if not ok or not req.results():
        raise RuntimeError(f"{src.name}: no person found ({err})")
    obs = req.results()[0]
    buf, err = obs.generateMaskedImageOfInstances_fromRequestHandler_croppedToInstancesExtent_error_(
        obs.allInstances(), handler, True, None)
    if buf is None:
        raise RuntimeError(f"{src.name}: mask failed ({err})")
    ci = Quartz.CIImage.imageWithCVPixelBuffer_(buf)
    cg = Quartz.CIContext.contextWithOptions_(None).createCGImage_fromRect_(ci, ci.extent())
    data = Quartz.CFDataCreateMutable(None, 0)
    dest = Quartz.CGImageDestinationCreateWithData(data, "public.png", 1, None)
    Quartz.CGImageDestinationAddImage(dest, cg, None)
    Quartz.CGImageDestinationFinalize(dest)
    return Image.open(io.BytesIO(bytes(data))).convert("RGBA")


def tidy(im: Image.Image, max_h: int = 900, pad: float = 0.04) -> Image.Image:
    bbox = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    p = int(max(im.size) * pad)
    canvas = Image.new("RGBA", (im.width + 2 * p, im.height + 2 * p), (0, 0, 0, 0))
    canvas.paste(im, (p, p), im)
    if canvas.height > max_h:
        canvas = canvas.resize((round(canvas.width * max_h / canvas.height), max_h), Image.LANCZOS)
    return canvas


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for pose in POSES:
        ap.add_argument(f"--{pose}", type=Path, help=f"photo for the '{pose}' pose")
    ap.add_argument("--out", type=Path, default=Path("backend/data/private/avatar"))
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    for pose in POSES:
        src = getattr(args, pose)
        if not src:
            continue
        img = tidy(cutout(src))
        img.save(args.out / f"{pose}.png", optimize=True)
        print(f"{pose:6s} <- {src.name}  {img.size[0]}x{img.size[1]}")


if __name__ == "__main__":
    main()
