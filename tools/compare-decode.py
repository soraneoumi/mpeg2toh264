#!/usr/bin/env python3
"""
Compare the MPEG-2 decoder against ffmpeg, frame by frame.

    tools/compare-decode.py [--binary PATH] [--control] [--verbose] [--frames N] INPUT...

Each INPUT (.ts or .m2v) is decoded by `mpeg2toh264 decode` and by ffmpeg
(`-map 0:v:0 -fps_mode passthrough -pix_fmt yuv420p -f rawvideo`), both to
yuv420p at the visible size, and the frames are compared in display order as
they stream out of the two decoders. Requires python3 with numpy, ffmpeg and
ffprobe on PATH, and a release build of the command line tool (cargo build
--release).

Reported per stream: frames compared (and how many each decoder produced),
minimum and median PSNR of Y, Cb and Cr, the maximum absolute sample
difference, and the mean luma PSNR of the first and of the last frame of each
group of pictures, which shows whether the difference grows along the
prediction chain. A stream passes when both decoders produce the same number
of frames, every compared frame is at least 55 dB in every plane and no sample
differs by more than 6. Two decoders whose inverse transforms both meet IEEE
1180 round differently, and the difference adds up along a chain of predicted
pictures, so the limits leave room for that and the growth is only reported.

With --control the same figures are also given for ffmpeg's own integer IDCT
(`-idct int`) against its default one: two IDCTs that both meet IEEE 1180
differ by rounding, and that difference accumulates along a prediction chain
in the same way. --verbose lists every frame that misses a limit. --frames N
compares only the first N frames and requires only that both decoders produce
that many, for a stream that ends in a truncated picture, which each decoder
conceals and outputs in its own way.
"""

import argparse
import os
import subprocess
import sys

import numpy as np

MIN_PSNR = 55.0
MAX_DIFFERENCE = 6


def probe(path):
    """Visible size and picture types of the first video stream, per frame
    in the order ffmpeg outputs them."""
    size = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height", "-of", "csv=p=0", path],
        check=True, capture_output=True, text=True).stdout.split()[0].split(",")
    types = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "frame=pict_type", "-of", "csv=p=0", path],
        check=True, capture_output=True, text=True).stdout.split()
    return int(size[0]), int(size[1]), [t.strip(",") for t in types]


def ffmpeg(path, *options):
    return subprocess.Popen(
        ["ffmpeg", "-v", "error", *options, "-i", path, "-map", "0:v:0", "-fps_mode",
         "passthrough", "-pix_fmt", "yuv420p", "-f", "rawvideo", "pipe:1"],
        stdout=subprocess.PIPE)


def ours(path, binary):
    return subprocess.Popen([binary, "decode", "-q", path, "/dev/stdout"], stdout=subprocess.PIPE)


def read_frame(stream, size):
    data = stream.read(size)
    if len(data) < size:
        return None
    return np.frombuffer(data, dtype=np.uint8)


def psnr(a, b):
    mse = np.mean((a.astype(np.int32) - b.astype(np.int32)) ** 2)
    return float("inf") if mse == 0 else 10 * np.log10(255.0 ** 2 / mse)


def compare(path, tested, reference, width, height, types, verbose=False, limit=None):
    """Statistics of `tested` against `reference`, two running decoders."""
    cw, ch = (width + 1) // 2, (height + 1) // 2
    luma = width * height
    planes = [(0, luma), (luma, luma + cw * ch), (luma + cw * ch, luma + 2 * cw * ch)]
    size = planes[2][1]
    per_frame = []
    worst = 0
    counts = [0, 0]
    while True:
        a = read_frame(tested.stdout, size)
        b = read_frame(reference.stdout, size)
        counts[0] += a is not None
        counts[1] += b is not None
        if a is None or b is None:
            break
        if limit is not None and len(per_frame) >= limit:
            continue
        per_frame.append([psnr(a[s:e], b[s:e]) for s, e in planes])
        difference = int(np.max(np.abs(a.astype(np.int16) - b.astype(np.int16))))
        worst = max(worst, difference)
        if verbose and (min(per_frame[-1]) < MIN_PSNR or difference > MAX_DIFFERENCE):
            index = len(per_frame) - 1
            kind = types[index] if index < len(types) else "?"
            print(f"  frame {index} ({kind}): {'/'.join(db(v) for v in per_frame[-1])} dB, "
                  f"difference {difference}")
    # Count whatever is left of the longer output.
    for index, process in enumerate((tested, reference)):
        while read_frame(process.stdout, size) is not None:
            counts[index] += 1
        if process.wait() != 0:
            raise SystemExit(f"{path}: decoder exited with status {process.returncode}")
    per_frame = np.array(per_frame).reshape(-1, 3)
    count = len(per_frame)
    # Groups in display order start at each I frame.
    starts = [i for i, t in enumerate(types[:count]) if t == "I"] or [0]
    bounds = [(s, e) for s, e in zip(starts, starts[1:] + [count]) if e > s]
    capped = np.minimum(per_frame, 99.0)
    first = float(np.mean([capped[s, 0] for s, _ in bounds])) if count else 0.0
    last = float(np.mean([capped[e - 1, 0] for _, e in bounds])) if count else 0.0
    minimum = per_frame.min(axis=0) if count else np.zeros(3)
    median = np.median(per_frame, axis=0) if count else np.zeros(3)
    same_length = counts[0] == counts[1] if limit is None else min(counts) >= limit
    ok = (count > 0 and same_length and minimum.min() >= MIN_PSNR
          and worst <= MAX_DIFFERENCE)
    return {"count": count, "counts": counts, "min": minimum, "median": median,
            "worst": worst, "first": first, "last": last, "ok": ok}


def db(value):
    return "  inf" if value == float("inf") else f"{value:5.1f}"


def line(name, r):
    frames = f"{r['count']} ({r['counts'][0]}/{r['counts'][1]})"
    return (f"{name[:44]:44} {frames:>16} {'/'.join(db(v) for v in r['min']):>17} "
            f"{'/'.join(db(v) for v in r['median']):>17} {r['worst']:>4} "
            f"{r['first']:6.1f}/{r['last']:<6.1f} {'ok' if r['ok'] else 'FAIL'}")


def main():
    parser = argparse.ArgumentParser(description="Compare the MPEG-2 decoder against ffmpeg.")
    parser.add_argument("inputs", nargs="+")
    parser.add_argument("--binary", default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "target", "release", "mpeg2toh264"))
    parser.add_argument("--frames", type=int, help="compare only the first N frames")
    parser.add_argument("--verbose", action="store_true",
                        help="list the frames that miss a limit")
    parser.add_argument("--control", action="store_true",
                        help="also compare ffmpeg -idct int against ffmpeg's default IDCT")
    args = parser.parse_args()
    print(f"{'stream':44} {'frames (us/ref)':>16} {'min Y/Cb/Cr dB':>17} "
          f"{'median Y/Cb/Cr':>17} {'diff':>4} {'group Y first/last':>13} result")
    failed = False
    for path in args.inputs:
        width, height, types = probe(path)
        name = os.path.basename(path)
        r = compare(path, ours(path, args.binary), ffmpeg(path), width, height, types, args.verbose,
                    args.frames)
        print(line(name, r), flush=True)
        failed |= not r["ok"]
        if args.control:
            c = compare(path, ffmpeg(path, "-idct", "int"), ffmpeg(path), width, height, types,
                        limit=args.frames)
            print(line("  control: ffmpeg -idct int", c), flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
