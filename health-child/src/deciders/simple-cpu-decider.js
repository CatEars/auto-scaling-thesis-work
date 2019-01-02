const _ = require('lodash');
const loadConfig = require('../load-config');

const getPM2Processes = async (r) => {
  return r
    .table('pm2Health')
    .orderBy(r.desc('timestamp'))
    .limit(20) // TODO: Limit is arbitrary, might need more in production setup
    .run();
}

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
  const anyCPUOver40 = _.some(meanCPU, process => process > 40);
  const allCPUUnder30 = _.every(meanCPU, process => process < 30);
  const mode =
        anyCPUOver40 ? 'high' :
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
