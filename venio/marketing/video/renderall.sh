#!/bin/bash
# usage: renderall.sh mode dsf fps out.mp4
set -e
cd "$(dirname "$0")"; M=$1; D=$2; R=$3; O=$4; N=4; END=80
mkdir -p seg; rm -f seg/$M-$D-*.mp4
for i in $(seq 0 $((N-1))); do a=$(python3 -c "print($END*$i/$N)"); b=$(python3 -c "print($END*($i+1)/$N)");
  NODE_PATH=$(npm root -g) node render.cjs $M $D $R $a $b seg/$M-$D-$i.mp4 & done; wait
for i in $(seq 0 $((N-1))); do echo "file '$PWD/seg/$M-$D-$i.mp4'"; done > seg/$M-$D.txt
ffmpeg -loglevel error -y -f concat -safe 0 -i seg/$M-$D.txt -c copy $O
