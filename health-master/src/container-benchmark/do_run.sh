#!/bin/bash
RATES=(5 10 20 40 60 80 100 120)
CONTS=(1 2 3 4 5 6 7 8 9 10)

touch debug.txt
mv debug.txt "debug.txt.$(date +%s)"

for N in "${CONTS[@]}"
do
    echo "N = $N" >> debug.txt

    # Scale and sleep for 10 seconds
    ssh containertest "docker service scale testback_imageproxy=$N"
    sleep 10

    for R in "${RATES[@]}"
    do
        echo "   R = $R" >> debug.txt
        nohup ./siege-$R > shsiege-$N-$R.out &
        # sleep for 11 minutes (siege should be done in 10 minutes)
        sleep 660
        if [ -f siegelog.log ]; then
            mv siegelog.log siegelog-$N-$R.log
        fi
    done


done
