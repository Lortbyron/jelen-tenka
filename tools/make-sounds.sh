#!/usr/bin/env bash
# Renders the one-shot sounds of Jelen Tenka with earshot (https://github.com/Leonxlnx/earshot, MIT).
# The rest (thunder, drips, wood, UI) is already in public/sounds.
#
#   EARSHOT_PY=/path/to/.earshot/.venv/bin/python ./tools/make-sounds.sh
#
# Needs ffmpeg. Birds, cicadas, frogs, crickets, wind, rain, the city and footsteps are not files:
# they are synthesised live in src/audio.js.
set -euo pipefail

PY="${EARSHOT_PY:?Set EARSHOT_PY to the python of your earshot install}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/sounds"
TMP="$(mktemp -d)"
mkdir -p "$OUT"

render() {
  local id="$1" name="$2"; shift 2
  "$PY" -m earshot sfx render "$id" -o "$TMP/$name.wav" --peak -3 "$@" > /dev/null
  ffmpeg -loglevel error -y -i "$TMP/$name.wav" -ac 1 -ar 44100 -c:a libmp3lame -q:a 4 "$OUT/$name.mp3"
  echo "  $name  <-  $id $*"
}

echo "marimba (D major pentatonic, F#3..D6; the bank starts just above D3): the generative music of the park"
for n in F#3 A3 B3 D4 E4 F#4 A4 B4 D5 E5 F#5 A5 B5 D6; do
  render mallet/marimba "marimba_${n/\#/s}" --pitch "$n"
done

echo "bamboo: a dry accent for the marimba phrases"
render fit/hit/bamboo_tok bamboo_tok

# Thunder, drips, wood and UI sounds already ship in public/sounds.
# If a sibling ../floating-house project exists, refresh them from there.
SHARED="$(dirname "$0")/../../floating-house/public/sounds"
if [ -d "$SHARED" ]; then
  echo "copy the shared sounds from the sanctuary"
  for n in thunder_body thunder_roll ui_open ui_close ui_tap ui_toggle ui_swish wood_tap \
           drip_drop_1 drip_drop_2 drip_plink_1 drip_plink_2 drip_tiny_1 drip_tiny_2; do
    cp "$SHARED/$n.mp3" "$OUT/"
  done
fi
echo "done: $(ls "$OUT" | wc -l | tr -d ' ') files"
