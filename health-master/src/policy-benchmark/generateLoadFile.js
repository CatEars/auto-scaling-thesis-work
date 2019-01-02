"use strict";
exports.__esModule = true;
var fs = require("fs");
var path = require("path");
function loadTypeFromTimeAndRate(timeInS, rate) {
    return {
        timeInS: timeInS,
        rate: rate
    };
}
function workloadLine(server, load, uri) {
    return "siege --log=siegelog.log -t " + load.timeInS + "s -c " + load.rate + " https://" + server + uri;
}
function printLoads(loads, server, uri) {
    var first = true;
    // Use a maximum of 100000 open files
    console.log('ulimit -n 100000');
    for (var _i = 0, loads_1 = loads; _i < loads_1.length; _i++) {
        var load = loads_1[_i];
        if (!first)
            console.log("echo \"***********************\"");
        first = false;
        console.log('echo "The time is:"');
        console.log('echo `date +"%s"`');
        var line = workloadLine(server, load, uri);
        console.log("echo \"" + line + "\"");
        console.log(line);
    }
    console.log('echo "Ending time is:"');
    console.log('echo `date +"%s"`');
}
function main() {
    var argv = process.argv;
    var fname = argv[2];
    var dateStr = (new Date(Date.now())).toUTCString();
    console.log("echo \"File is: " + fname + " Date compiled is " + dateStr + "\"");
    var fpath = path.resolve(__dirname, fname);
    var data = eval(fs.readFileSync(fpath, { encoding: 'utf-8' }));
    var loads = data.map(function (_a) {
        var time = _a[0], rate = _a[1];
        return loadTypeFromTimeAndRate(time, rate);
    });
    var server = 'xjobb.briteback.com';
    var uri = "/workload/https://liu.se/mall11/images/logo-sv.png";
    //const uri = '/images/workload/https://assets.marthastewart.com/styles/wmax-1500/d33/vanilla-icecream-0611med107092des/vanilla-icecream-0611med107092des_sq.jpg?itok=ErVG8ofB';
    //const server = '174.138.13.141/workload/';
    printLoads(loads, server, uri);
}
main();
