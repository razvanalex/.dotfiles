#!/usr/bin/env bash

ITERATIONS=10
echo "Running ping benchmark ($ITERATIONS iterations)..."
echo "-----------------------------------------------"

for i in $(seq 1 $ITERATIONS); do
    /usr/bin/time -f "Iteration $i: %e s" ags request ping 2>&1 | grep "Iteration"
    # Optional: ags request wallpaper next # uncomment to see if it causes crosstalk
done
