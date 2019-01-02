const _ = require('lodash');
//const getPM2Processes = require('./get-PM2');

const main = async (r, runConfig) => {
  const modes = {
    high: {
      instances: 1,
      replicas: 2
    },
    low: {
      instances: 0,
      replicas: 1
    }
  };

  const processes = await getPM2Processes(r);
  const N = 3;
  const filtered = _.reduce(processes, (accumulator, current) => {
    if (!accumulator[current.name]) {
      accumulator[current.name] = [current];
    } else if (accumulator[current.name].length < N) {
      accumulator[current.name].push(current);
    }
    return accumulator;
  }, {});

  const calcMean = arr => arr.length ? _.sumBy(arr, 'monit.cpu') / arr.length : 0;
  const meanCPU = _.values(filtered).map(calcMean);
  const anyCPUOver80 = _.some(meanCPU, process => process > 80);
  const allCPUUnder30 = _.every(meanCPU, process => process < 30);
  const mode =
        anyCPUOver80 ? 'high' :
        allCPUUnder30 ? 'low' :
        runConfig.simpleCPULastMode || 'low';
  const config = modes[mode];
  console.log('--------------------');
  console.log('These are the mean CPU values:', meanCPU);
  console.log('This is my decided mode:', mode);
  console.log('--------------------');
  runConfig.simpleCPULastMode = mode;
  return _.assign(runConfig, config);
}

module.exports = main;
