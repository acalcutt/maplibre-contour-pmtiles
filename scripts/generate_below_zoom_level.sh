#!/bin/bash

# Default Values (except sFile and oDir)
increment_default=10
sMaxZoom_default=8
sEncoding_default="mapbox"
oMaxZoom_default=11
oMinZoom_default=4


# Function to parse command line arguments
parse_arguments() {
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --increment) increment="$2"; shift 2 ;;
            --sMaxZoom) sMaxZoom="$2"; shift 2 ;;
            --sEncoding) sEncoding="$2"; shift 2 ;;
            --sFile) sFile="$2"; shift 2 ;;
            --oDir) oDir="$2"; shift 2 ;;
            --oMaxZoom) oMaxZoom="$2"; shift 2 ;;
            --oMinZoom) oMinZoom="$2"; shift 2 ;;    
            *) echo "Unknown option: $1" >&2; usage; exit 1;;
        esac
    done

    # Check if sFile and oDir are provided
    if [[ -z "$sFile" ]]; then
        echo "Error: --sFile is required." >&2
        usage
        exit 1
    fi
    if [[ -z "$oDir" ]]; then
        echo "Error: --oDir is required." >&2
        usage
        exit 1
    fi

    # Return the min zoom (for use in tile loop).
    echo "$oMinZoom"
}

usage() {
    echo "Usage: $0 --sFile <path> --oDir <path> [options]"
    echo "  Options:"
    echo "    --increment <value>       Increment value (default: $increment_default)"
    echo "    --sMaxZoom <value>        Source Max Zoom (default: $sMaxZoom_default)"
    echo "    --sEncoding <encoding>    Source Encoding (default: $sEncoding_default)"
    echo "    --sFile <path>           Source File Path (REQUIRED)"
    echo "    --oDir <path>             Output Directory (REQUIRED)"
    echo "    --oMaxZoom <value>        Output Max Zoom (default: $oMaxZoom_default)"
    echo "    --oMinZoom <value>        Output Min Zoom (default: $oMinZoom_default)"
}

# Initialize with defaults (except sFile and oDir)
increment="$increment_default"
sMaxZoom="$sMaxZoom_default"
sEncoding="$sEncoding_default"
oMaxZoom="$oMaxZoom_default"
oMinZoom="$oMinZoom_default"
sFile="" # Initialize sFile to empty
oDir="" # Initialize oDir to empty


process_tile() {
    local zoom_level="$1"
    local x_coord="$2"
    local y_coord="$3"


    echo "process_tile: Processing tile - Zoom: $zoom_level, X: $x_coord, Y: $y_coord"
    
    npx tsx ../src/generate-countour-tile-batch.ts \
        --x "$x_coord" \
        --y "$y_coord" \
        --z "$zoom_level" \
        --sFile "$sFile" \
        --sEncoding "$sEncoding" \
        --sMaxZoom "$sMaxZoom" \
        --increment "$increment" \
        --oMaxZoom "$oMaxZoom" \
        --oDir "$oDir"
    
    echo "process_tile: Finished processing $zoom_level-$x_coord-$y_coord"
}
export -f process_tile

# Function to generate tile coordinates and output them as a single space delimited string variable.
generate_tile_coordinates() {
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
# Parse arguments and validate, getting the min zoom level
oMinZoom=$(parse_arguments "$@")

# Loop through each zoom level
for (( zoom_level=$oMinZoom; zoom_level <= $oMaxZoom; zoom_level++ ))
do
	# Generate the space separated list of tiles and output it to stdout
	generate_tile_coordinates "$zoom_level"

	# Capture the return value using a pipe.
	tile_coords_str=$(generate_tile_coordinates "$zoom_level")

	if [[ $? -eq 0 ]]; then
		echo "$tile_coords_str" | xargs -P 8 -n 3 bash -c 'process_tile "$@"' bash
	else
		echo "Error generating tiles" >&2
		exit 1
	fi
done