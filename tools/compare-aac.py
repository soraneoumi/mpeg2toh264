#!/usr/bin/env python3
"""Compare `mpeg2toh264 decode-audio` against ffmpeg's float AAC decoder.

Usage: compare-aac.py [--decoder PATH] [--keep DIR] input.adts...

Both decoders decode each stream to f32le. The frames are matched by the byte
offset of their ADTS frame -- ffmpeg leaves out the frames it refuses, where
ours conceals them, and reports positions that drift after damage -- and
compared channel by channel, ffmpeg's channel order
mapped to ours. Reported per stream: the frames compared, the largest absolute
difference, the RMS difference, and the frames whose difference exceeds 2^-15
of full scale.

Frames left out of that comparison, and reported apart:
- a frame decoded right after one either decoder did not decode, since the
  decoders carry different state out of a lost frame (ours fades the overlap
  out, ffmpeg keeps the last good frame's);
- a frame that uses noise substitution, and the frame after it, since each
  decoder makes its own noise. For these the ratio of the two outputs' RMS
  levels is reported instead, which should be near one.

Needs ffmpeg, ffprobe and numpy. Each stream's PCM is written twice in full
before it is compared, so the temporary directory needs room for that.
"""

import argparse
import bisect
import os
import subprocess
import sys
import tempfile

import numpy as np

BAR = 2.0 ** -15

# ffmpeg's channel order of each layout its AAC decoder reports, in the names
# our decoder gives its speakers.
FFMPEG_ORDER = {
    "mono": ["C"],
    "stereo": ["L", "R"],
    "3.0": ["L", "R", "C"],
    "4.0": ["L", "R", "C", "S"],
    "5.0": ["L", "R", "C", "SL", "SR"],
    "5.0(side)": ["L", "R", "C", "SL", "SR"],
    "5.1": ["L", "R", "C", "LFE", "SL", "SR"],
    "5.1(side)": ["L", "R", "C", "LFE", "SL", "SR"],
}
SPEAKERS = {
    "FrontCentre": "C",
    "FrontLeft": "L",
    "FrontRight": "R",
    "SurroundLeft": "SL",
    "SurroundRight": "SR",
    "Surround": "S",
    "Lfe": "LFE",
}


def run(command, **kwargs):
    return subprocess.run(command, check=True, capture_output=True, text=True, **kwargs)


def our_units(decoder, path, out):
    """Our output and, per access unit, (offset, outcome, tools)."""
    result = run([decoder, "decode-audio", "--frames", path, out])
    units, layouts = [], []
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) >= 3 and fields[0].isdigit() and fields[1].isdigit():
            units.append((int(fields[1]), fields[2], fields[3] if len(fields) > 3 else ""))
        elif line.startswith("  ") and "frames" in line:
            layouts.append(line.strip())
    return units, layouts, result.stdout


def our_order(layouts):
    """Our channel names, from the one layout the summary lists."""
    if len(layouts) != 1:
        return None
    text = layouts[0]
    if text.endswith("frames mono"):
        return ["C"]
    if text.endswith("frames dual mono"):
        return ["L", "R"]
    inside = text[text.index("[") + 1 : text.index("]")]
    return [SPEAKERS[name.strip()] for name in inside.split(",")]


def ffmpeg_frames(path, out):
    probe = run(
        [
            "ffprobe", "-v", "error", "-select_streams", "a:0", "-show_frames",
            "-show_entries", "frame=pkt_pos,pkt_size,channels", "-of", "csv=p=0", path,
        ]
    )
    frames = []
    for line in probe.stdout.splitlines():
        position, size, channels = (int(v) for v in line.split(",")[:3])
        frames.append((position, size, channels))
    stream = run(
        [
            "ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
            "stream=channel_layout", "-of", "csv=p=0", path,
        ]
    ).stdout.strip()
    run(["ffmpeg", "-v", "error", "-y", "-threads", "1", "-c:a", "aac", "-i", path, "-f", "f32le", out])
    return frames, stream


def compare(decoder, path, keep, keep_files):
    ours_path = os.path.join(keep, os.path.basename(path) + ".ours.f32")
    theirs_path = os.path.join(keep, os.path.basename(path) + ".ffmpeg.f32")
    units, layouts, summary = our_units(decoder, path, ours_path)
    frames, ffmpeg_layout = ffmpeg_frames(path, theirs_path)

    channels = {c for _, _, c in frames}
    if len(channels) != 1:
        sys.exit(f"{path}: ffmpeg's channel count changes ({channels}); not handled")
    (count,) = channels
    order = our_order(layouts) or (["L", "R"] if count == 2 else None)
    theirs_order = FFMPEG_ORDER.get(ffmpeg_layout.split()[0] if ffmpeg_layout else "", None)
    if theirs_order is None and count == 2:
        theirs_order = ["L", "R"]
    if order is None or theirs_order is None or len(order) != count:
        sys.exit(f"{path}: cannot match channels: ours {layouts}, ffmpeg {ffmpeg_layout} x{count}")
    mapping = [order.index(name) for name in theirs_order]

    ours = np.fromfile(ours_path, "<f4")
    theirs = np.fromfile(theirs_path, "<f4").reshape(-1, 1024, count)
    if len(theirs) != len(frames):
        sys.exit(f"{path}: ffmpeg wrote {len(theirs)} frames but reported {len(frames)}")

    # Our output holds a frame for every unit from the first decoded one on.
    first = next(i for i, (_, outcome, _) in enumerate(units) if outcome == "Decoded")
    ours = ours.reshape(-1, 1024, count)
    if len(ours) != len(units) - first:
        sys.exit(f"{path}: our output has {len(ours)} frames, expected {len(units) - first}")
    decoded_at = {offset: i for i, (offset, outcome, _) in enumerate(units) if outcome == "Decoded"}
    decoded_offsets = sorted(decoded_at)
    with open(path, "rb") as stream:
        data = stream.read()

    def frame_length(at):
        return ((data[at + 3] & 3) << 11) | (data[at + 4] << 3) | (data[at + 5] >> 5)

    # ffmpeg's reported packet positions drift from the headers after it has
    # resynchronised past damage, by a constant until the next damage. So a
    # position is taken with the drift last seen, and where that is not one of
    # our frames, the drift is found again from the next frame of ours of the
    # same length.
    drift = 0
    matched = []
    for position, size, _ in frames:
        at = position + drift
        if at not in decoded_at or frame_length(at) != size:
            k = bisect.bisect_left(decoded_offsets, position)
            while k < len(decoded_offsets) and frame_length(decoded_offsets[k]) != size:
                k += 1
            if k == len(decoded_offsets):
                matched.append(None)
                continue
            at = decoded_offsets[k]
            drift = at - position
        matched.append(at)
    ffmpeg_at = {at for at in matched if at is not None}

    clean = []
    after_loss = []
    noisy = []
    unmatched = 0
    for j, at in enumerate(matched):
        i = decoded_at.get(at)
        if i is None:
            unmatched += 1
            continue
        mine = ours[i - first][:, mapping]
        difference = mine - theirs[j]
        previous_ok = i > 0 and units[i - 1][1] == "Decoded" and units[i - 1][0] in ffmpeg_at
        if "N" in units[i][2] or (i > 0 and "N" in units[i - 1][2]):
            level = np.sqrt((theirs[j] ** 2).mean())
            ratio = np.sqrt((mine**2).mean()) / level if level > 0 else 1.0
            noisy.append(ratio)
        elif i > first and not previous_ok:
            after_loss.append(np.abs(difference).max())
        else:
            clean.append((i, np.abs(difference).max(), (difference.astype(np.float64) ** 2).sum()))

    del ours, theirs
    if not keep_files:
        os.remove(ours_path)
        os.remove(theirs_path)

    lost = sum(1 for _, outcome, _ in units if outcome != "Decoded")
    print(f"{os.path.basename(path)}: {count} channels, ffmpeg {ffmpeg_layout or '?'}, "
          f"ours {'; '.join(layouts)}")
    print(f"  units {len(units)}, ours not decoded {lost}, ffmpeg frames {len(frames)}, "
          f"ffmpeg frames we did not decode {unmatched}")
    if clean:
        maxima = np.array([m for _, m, _ in clean])
        rms = np.sqrt(sum(s for _, _, s in clean) / (len(clean) * 1024 * count))
        worst = clean[int(maxima.argmax())][0]
        print(f"  compared {len(clean)} frames: max |diff| {maxima.max():.3e} "
              f"({maxima.max() / BAR:.4f} of 2^-15), RMS {rms:.3e}, "
              f"over the bar {int((maxima > BAR).sum())}, worst at unit {worst}")
        over = [(i, m) for i, m, _ in clean if m > BAR]
        if over:
            print("  over the bar, by unit: " + ", ".join(f"{i} ({m:.2e})" for i, m in over[:20]))
    if after_loss:
        print(f"  {len(after_loss)} frames right after a loss: max |diff| {max(after_loss):.3e}")
    if noisy:
        noisy = np.array(noisy)
        print(f"  {len(noisy)} frames with noise substitution or after one: RMS level ratio "
              f"ours/ffmpeg median {np.median(noisy):.4f}, range {noisy.min():.4f}..{noisy.max():.4f}")
    return clean


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--decoder", default=os.path.join(os.path.dirname(__file__), "..", "target", "release", "mpeg2toh264"))
    parser.add_argument("--keep", help="directory to leave the decoded PCM in")
    parser.add_argument("inputs", nargs="+")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as scratch:
        for path in args.inputs:
            compare(args.decoder, path, args.keep or scratch, args.keep is not None)


if __name__ == "__main__":
    main()
