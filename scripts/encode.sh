#!/usr/bin/env bash
# Re-encodes the raw AI clips for scroll scrubbing.
#  - crops 1088px clips to 1080, removes the "AI generated" watermark (delogo + feathered blur)
#  - short GOP (-g 8 desktop / -g 6 mobile) and no B-frames so random seeks decode only a few frames
#  - +faststart so metadata is at the head of the file
#  - exports first/last-frame WebP posters (instant paint + reduced-motion stills)
set -euo pipefail
cd "$(dirname "$0")/.."
RAW=media/raw
OUT=public/media
mkdir -p "$OUT/desktop" "$OUT/mobile" "$OUT/posters"

# order: output-id raw-file
MAP="01:u12 02:u07 03:u14 04:u11 05:u06 06:u05 07:u08 08:u02 09:u01 10:u03 11:u10 12:u09 13:u04"

FG="[0:v]crop=1920:1080:0:(ih-1080)/2,setsar=1,delogo=x=1535:y=950:w=330:h=70,split[base][src];\
[src]crop=440:160:1470:910,boxblur=luma_radius=24:luma_power=2:chroma_radius=24:chroma_power=2[bl];\
color=c=black:s=440x160:r=24,format=gray,drawbox=x=30:y=30:w=380:h=100:color=white:t=fill,boxblur=12:1[m];\
[bl][m]alphamerge[blm];[base][blm]overlay=1470:910:shortest=1,format=yuv420p"

encode() {
  local id=$1 src=$RAW/$2.mp4
  ffmpeg -v error -y -i "$src" -filter_complex "$FG" -an \
    -c:v libx264 -preset slow -crf 24 -g 8 -keyint_min 8 -sc_threshold 0 -bf 0 \
    -profile:v high -movflags +faststart "$OUT/desktop/$id.mp4"
  ffmpeg -v error -y -i "$src" -filter_complex "$FG,scale=1280:720:flags=lanczos" -an \
    -c:v libx264 -preset slow -crf 26 -g 6 -keyint_min 6 -sc_threshold 0 -bf 0 \
    -profile:v high -movflags +faststart "$OUT/mobile/$id.mp4"
  ffmpeg -v error -y -i "$OUT/desktop/$id.mp4" -vf "select=eq(n\,0)" -frames:v 1 -c:v libwebp -quality 78 "$OUT/posters/$id-first.webp"
  ffmpeg -v error -y -sseof -0.08 -i "$OUT/desktop/$id.mp4" -update 1 -frames:v 1 -c:v libwebp -quality 78 "$OUT/posters/$id-last.webp"
  echo "done $id"
}

for pair in $MAP; do encode "${pair%%:*}" "${pair##*:}" & 
  # two encodes at a time
  while [ "$(jobs -rp | wc -l)" -ge 3 ]; do wait -n; done
done
wait
du -sh "$OUT"/desktop "$OUT"/mobile "$OUT"/posters
