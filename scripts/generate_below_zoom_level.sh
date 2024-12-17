#!/bin/bash

process_tile() {
    local zoom_level="$1"
    local x_coord="$2"
    local y_coord="$3"
    local increment=10
    local sMaxZoom=8
    local sEncoding="terrarium"
    local sFile="/mnt/c/Users/Andrew/Desktop/Junk/tile_data/pmtiles/gebco_terrarium0-8.pmtiles"
	local oDir="/work/"
    local oMaxZoom=11

    echo "process_tile: Processing tile - Zoom: $zoom_level, X: $x_coord, Y: $y_coord"
	
	npx tsx ../src/generate-countour-tile-batch.ts --x $x_coord --y $y_coord --z $zoom_level --sFile $sFile --sEncoding $sEncoding --sMaxZoom $sMaxZoom --increment $increment --oMaxZoom $oMaxZoom --oDir $oDir
	
    echo "process_tile: Finished processing $zoom_level-$x_coord-$y_coord"
}
export -f process_tile

# Function to generate tile coordinates and output them as a single space delimited string variable.
generate_tile_coordinates_xargs() {
  local zoom_level=$1

  # Input Validation
  if [[ "$zoom_level" -lt 0 ]]; then
    echo "Error: Invalid zoom level. zoomLevel must be >= 0" >&2
    return 1
  fi

  local tiles_in_dimension=$(echo "2^$zoom_level" | bc)

  local output=""

  for ((y=0; y<$tiles_in_dimension; y++)); do
    for ((x=0; x<$tiles_in_dimension; x++)); do
        output+="$zoom_level $x $y "
    done
  done

  # Assign the output variable to the bash variable named RETVAL.
  # this is a common trick in bash, if you want to return a variable from a function.
  declare RETVAL="$output"

  # Output the string to standard output, in case it needs to be piped to another function
  echo -n "$output"

  return 0
}

# --- Main Script ---
if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <zoomLevel>" >&2
    exit 1
fi

zoom_level_param="$1"

# Generate the space separated list of tiles and output it to stdout
generate_tile_coordinates_xargs "$zoom_level_param"

# Capture the return value using a pipe.
tile_coords_str=$(generate_tile_coordinates_xargs "$zoom_level_param")

if [[ $? -eq 0 ]]; then
	echo "$tile_coords_str" | xargs -P 8 -n 3 bash -c 'process_tile "$@"' bash
else
  echo "Error generating tiles" >&2
  exit 1
fi