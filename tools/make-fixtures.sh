#!/bin/bash
# Regenerate the synthetic MPEG-2 test streams in testdata.
#
# The committed .m2v files are the authority -- byte-identical output is not
# guaranteed across ffmpeg versions. This script records how they were produced
# and what each one is meant to exercise.
set -euo pipefail
cd "$(dirname "$0")/../testdata"

# Intra only. Exercises the DC size tables (B.12/B.13) and coefficient table
# zero (B.14) without any motion syntax at all.
ffmpeg -y -v error -f lavfi -i testsrc2=size=352x288:rate=25 -frames:v 3 \
  -c:v mpeg2video -g 1 -bf 0 -qscale:v 4 -f mpeg2video i_only.m2v

# I+P. Adds macroblock_type for P pictures, motion vectors and skipped
# macroblocks.
ffmpeg -y -v error -f lavfi -i testsrc2=size=352x288:rate=25 -frames:v 10 \
  -c:v mpeg2video -g 5 -bf 0 -qscale:v 4 -f mpeg2video ip.m2v

# I+B+B+P, the classic broadcast GOP. Adds backward and interpolated prediction.
ffmpeg -y -v error -f lavfi -i testsrc2=size=352x288:rate=25 -frames:v 15 \
  -c:v mpeg2video -g 15 -bf 2 -qscale:v 4 -f mpeg2video ibbp.m2v

# Three genuine open-GOP boundaries. In display order the stream is
# IBBPBBPBBPBBPBBI..., and the two B pictures immediately ahead of every I are
# solid red then solid blue. A session that drops or repeats those leading
# pictures is therefore conspicuous both visually and in decoded-frame tests.
ffmpeg -y -v error -f lavfi -i testsrc2=size=352x288:rate=25 -frames:v 46 \
  -vf "drawbox=x=0:y=0:w=iw:h=ih:color=red:t=fill:enable='eq(mod(n,15),13)',drawbox=x=0:y=0:w=iw:h=ih:color=blue:t=fill:enable='eq(mod(n,15),14)'" \
  -c:v mpeg2video -g 15 -bf 2 -sc_threshold 1000000000 -qscale:v 4 \
  -f mpeg2video open_gop_leading_bb.m2v

# 1440x1080 interlaced, shaped like a terrestrial broadcast. Exercises field
# motion types, field DCT and macroblock_escape.
ffmpeg -y -v error -f lavfi -i testsrc2=size=1440x1080:rate=30000/1001 -frames:v 15 \
  -c:v mpeg2video -g 15 -bf 2 -b:v 16M -flags +ildct+ilme -top 1 \
  -f mpeg2video hd1080i.m2v

# The only fixture that reaches coefficient table one (B.15). Also covers
# alternate scan, the non-linear quantiser and a custom intra matrix.
# non_linear_quant requires qmax <= 28 in ffmpeg.
IM=$(python3 -c "print(','.join(str(v) for v in [8,17,18,19,21,23,25,27,17,18,19,21,23,25,27,28,20,21,22,23,24,26,28,30,21,22,23,24,26,28,30,32,22,23,24,26,28,30,32,35,23,24,26,28,30,32,35,38,25,26,28,30,32,35,38,41,27,28,30,32,35,38,41,45]))")
ffmpeg -y -v error -f lavfi -i testsrc2=size=352x288:rate=25 -frames:v 8 \
  -c:v mpeg2video -g 4 -bf 1 -qscale:v 2 -qmax 28 \
  -intra_vlc 1 -alternate_scan 1 -non_linear_quant 1 -intra_matrix "$IM" \
  -f mpeg2video altscan.m2v

# Near-lossless, to push levels high enough to need the escape code often.
ffmpeg -y -v error -f lavfi -i testsrc2=size=352x288:rate=25 -frames:v 6 \
  -c:v mpeg2video -g 3 -bf 1 -qscale:v 1 -intra_vlc 1 -f mpeg2video escape.m2v

ls -l ./*.m2v

# AAC-LC streams for the audio decoder, each with ffmpeg's float decoding of
# it as the reference (f32le, interleaved in ffmpeg's channel order). The
# signal is a rising tone with a click every 0.37 s, which forces short
# windows, and pink noise, which makes the encoder use TNS. Noise
# substitution is off: two decoders make different noise, so its samples
# cannot be compared. Intensity stereo is off where mid/side is on: ffmpeg
# signals both with ms_mask_present 2 and inverts the intensity bands under
# it, where ISO/IEC 14496-3 does not (see audio/spectrum.rs).
mkdir -p aac
cd aac
TONE="aevalsrc=exprs='0.25*sin(2*PI*(80+900*t)*t)+if(lt(mod(t\,0.37)\,0.0015)\,0.7\,0)|0.25*sin(2*PI*(80+900*t)*t+0.4)+0.1*sin(2*PI*3000*t)+if(lt(mod(t+0.1\,0.53)\,0.0015)\,0.6\,0)'"
NOISE="anoisesrc=c=pink:a=0.15:d=10"
aac() { # name rate seconds channel-filter encoder-options...
  local name=$1 rate=$2 seconds=$3 filter=$4
  shift 4
  ffmpeg -y -v error -f lavfi -i "$TONE:s=$rate:d=$seconds" -f lavfi -i "$NOISE:r=$rate" \
    -filter_complex "[0][1]amerge=inputs=2,$filter" -t "$seconds" -c:a aac "$@" "$name.adts"
  ffmpeg -y -v error -c:a aac -i "$name.adts" -f f32le "$name.f32"
}
# Stereo at 48 kHz with mid/side and TNS.
aac stereo48 48000 1.2 "pan=stereo|c0=c0+0.3*c2|c1=c1+0.5*c2" \
  -b:a 128k -aac_ms 1 -aac_is 0 -aac_pns 0 -aac_tns 1
# Intensity stereo without mid/side, at 44.1 kHz.
aac intensity44 44100 1.2 "pan=stereo|c0=c0+0.3*c2|c1=0.8*c0+0.2*c2" \
  -b:a 48k -aac_ms 0 -aac_is 1 -aac_pns 0 -aac_tns 1
# Mono at 32 kHz.
aac mono32 32000 2.5 "pan=mono|c0=c0+0.3*c2" -b:a 48k -aac_pns 0 -aac_tns 1
# Stereo at the two lowest rates the band tables cover separately.
aac stereo24 24000 2 "pan=stereo|c0=c0+0.3*c2|c1=c1+0.5*c2" \
  -b:a 32k -aac_ms 1 -aac_is 0 -aac_pns 0 -aac_tns 1
aac stereo16 16000 2.5 "pan=stereo|c0=c0+0.3*c2|c1=c1+0.5*c2" \
  -b:a 24k -aac_ms 1 -aac_is 0 -aac_pns 0 -aac_tns 1
# 5.1, channel_configuration 6.
aac surround48 48000 0.42 "pan=5.1|FL=c0|FR=c1|FC=0.5*c0+0.5*c1|LFE=0.5*c0|BL=c2|BR=0.7*c0+0.3*c2" \
  -b:a 320k -aac_ms 1 -aac_is 0 -aac_pns 0 -aac_tns 1
ls -l ./*.adts ./*.f32
