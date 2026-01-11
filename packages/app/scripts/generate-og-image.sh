#!/bin/bash

# Generate OpenGraph image for concert page
# Usage: ./scripts/generate-og-image.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_DIR="$SCRIPT_DIR/../public"
POSTER="$PUBLIC_DIR/2026-itav-poster.jpg"
OUTPUT="$PUBLIC_DIR/2026-itav-og.jpg"

# Target dimensions
WIDTH=1200
HEIGHT=630
ASPECT_RATIO=$(echo "scale=6; $WIDTH / $HEIGHT" | bc)

# Background color (sampled from original poster)
BG_COLOR="#1F4E84"

# Crop from top of poster down to this Y coordinate (tweak this value)
CROP_Y=740

echo "Cropping poster from y=0 to y=$CROP_Y..."

# Get poster width
POSTER_WIDTH=$(magick identify -format "%w" "$POSTER")

# Crop top portion
CROP_ASPECT=$(echo "scale=6; $POSTER_WIDTH / $CROP_Y" | bc)

echo "Crop dimensions: ${POSTER_WIDTH}x${CROP_Y} (aspect: $CROP_ASPECT, target: $ASPECT_RATIO)"

# Create the image: crop, then extend canvas to target aspect ratio, then resize
magick "$POSTER" \
  -crop "${POSTER_WIDTH}x${CROP_Y}+0+0" +repage \
  -gravity center -background "$BG_COLOR" \
  -extent "$(
    # Calculate extent dimensions to match target aspect ratio
    if (( $(echo "$CROP_ASPECT > $ASPECT_RATIO" | bc -l) )); then
      # Too wide - add padding top/bottom
      NEW_HEIGHT=$(echo "scale=0; $POSTER_WIDTH / $ASPECT_RATIO" | bc)
      echo "${POSTER_WIDTH}x${NEW_HEIGHT}"
    else
      # Too tall - add padding left/right
      NEW_WIDTH=$(echo "scale=0; $CROP_Y * $ASPECT_RATIO" | bc)
      echo "${NEW_WIDTH}x${CROP_Y}"
    fi
  )" \
  -resize "${WIDTH}x${HEIGHT}!" \
  -quality 90 \
  "$OUTPUT"

echo "Generated: $OUTPUT"
magick identify "$OUTPUT"
