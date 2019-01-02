import * as fs from 'fs';
import * as path from 'path';

interface LoadType {
    timeInS: number;
    rate: number;
}


function loadTypeFromTimeAndRate(timeInS: number, rate: number): LoadType {
    return {
        timeInS,
        rate: rate
    }
}


function workloadLine(server: string, load: LoadType, uri: string): string {
    return `siege --log=siegelog.log -t ${load.timeInS}s -c ${load.rate} https://${server}${uri}`
}


function printLoads(loads: LoadType[], server: string, uri: string): void {
    let first = true;
    // Use a maximum of 100000 open files
    console.log('ulimit -n 100000');
    for (const load of loads) {
        if (!first) console.log(`echo "***********************"`);
        first = false;
        console.log('echo "The time is:"');
        console.log('echo `date +"%s"`');
        const line = workloadLine(server, load, uri);
        console.log(`echo "${line}"`);
        console.log(line);
    }
    console.log('echo "Ending time is:"');
    console.log('echo `date +"%s"`');
}


function main() {
    const argv = process.argv;
    const fname = argv[2];
    const dateStr = (new Date(Date.now())).toUTCString();
    console.log(`echo "File is: ${fname} Date compiled is ${dateStr}"`);
    const fpath = path.resolve(__dirname, fname);
    const data: number[][] = eval(fs.readFileSync(fpath, { encoding: 'utf-8' }));
    const loads = data.map(([time, rate]) => loadTypeFromTimeAndRate(time, rate));
    const server = 'xjobb.briteback.com';
    const uri = `/workload/https://liu.se/mall11/images/logo-sv.png`;
    //const uri = '/images/workload/https://assets.marthastewart.com/styles/wmax-1500/d33/vanilla-icecream-0611med107092des/vanilla-icecream-0611med107092des_sq.jpg?itok=ErVG8ofB';
    //const server = '174.138.13.141/workload/';
    printLoads(loads, server, uri);
}

main();
