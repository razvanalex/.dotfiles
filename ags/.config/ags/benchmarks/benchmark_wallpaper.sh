#!/usr/bin/env bash

ITERATIONS=5
echo "Running wallpaper benchmark ($ITERATIONS iterations)..."
echo "-----------------------------------------------"

total_time=0

for i in $(seq 1 $ITERATIONS); do
    start_time=$(date +%s%3N)
    
    # Run the request as separate arguments
    result=$(ags request wallpaper next)
    
    end_time=$(date +%s%3N)
    duration=$((end_time - start_time))
    total_time=$((total_time + duration))
    
    echo "Iteration $i: ${duration}ms"
    echo "Result: $result"
    echo "-----------------------------------------------"
done

average_time=$((total_time / ITERATIONS))
echo "Average Request Time: ${average_time}ms"
