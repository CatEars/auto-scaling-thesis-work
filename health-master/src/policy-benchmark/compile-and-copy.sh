tsc generateLoadFile.ts
for f in ./blueprints/*
do
    F=$(basename $f)
    node generateLoadFile.js ./blueprints/$F > ./workloads/$F
    chmod u+x ./workloads/$F
done

scp workloads/* dropletkiller:~
