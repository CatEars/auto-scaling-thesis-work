const _ = require('lodash');
const loadConfig = require('../load-config');
const {
  'scaling-policy': scalingPolicy,
  'health-decay-time-ms': decayTimeMs,
  'rebalance-cooldown-ms': rebalanceCooldownMs
} = loadConfig();

const allUnderValue = (values, target) => _.every(values, value => value < target);
const anyUnderValue = (values, target) => _.some(values, value => value < target);
const allOverValue = (values, target) => _.every(values, value => value > target);

// The number of VMs that should be for a given number of
// containers with the mixed policy
const VMsForContainers = (containers) => Math.ceil(containers / 4);

// VM Only scaling policy, scales by increasing the number of VMs
const VMOnly = {
  'over': (runConfig) => ({ VMs: runConfig.VMs + 2, containers: runConfig.containers + 2 }),
  'under': (runConfig) => ({ VMs: runConfig.VMs - 1, containers: runConfig.containers - 1 })
}

// Container Only scaling policy, scales by increasing the number of
// containers.
const ContainerOnly = {
  'over': (runConfig) => ({ containers: runConfig.containers + 2}),
  'under': (runConfig) => ({ containers: runConfig.containers - 1})
}

const Constant = {
  'over': (runConfig) => ({ containers: runConfig.containers, VMs: runConfig.VMs }),
  'under': (runConfig) => ({ containers: runConfig.containers, VMs: runConfig.VMs })
}

const Mixed = {
  'over': (runConfig) => {
    if (runConfig.containers % 4 == 0) {
      return {
        containers: runConfig.containers + 5,
        VMs: VMsForContainers(runConfig.containers + 5)
      }
    } else {
      return {
        containers: runConfig.containers + 1,
        VMs: VMsForContainers(runConfig.containers + 1)
      }
    }
  },
  'under': (runConfig) => ({
    containers: runConfig.containers - 1,
    VMs: VMsForContainers(runConfig.containers - 1)
  })
}

const stddev = values => {
  const avg = _.mean(values);
  const squareDiffSum = _.mean(values.map(v => (v - avg) * (v - avg)));
  return Math.sqrt(squareDiffSum);
}

const main = async (r, runConfig) => {
  const sinceTime = Date.now() - decayTimeMs;
  const maxHealthList = 100;
  const tooFewSamples = 10;

  const health =
        await r.table('cpuHealth')
        .orderBy(r.desc('timestamp'))
        .filter(elem => elem('timestamp').ge(sinceTime))
        .limit(maxHealthList)
        .run();

  if (health && health.length < tooFewSamples) return runConfig;
  console.log('====');
  console.log('5 first health deciders', Date.now(), (new Date(Date.now())).toUTCString());
  console.log(''.padEnd(5), 'Name'.padEnd(20), 'CPU'.padEnd(10));
  const toPrint = _.slice(health, 0, 5).map(item => {
    console.log(''.padEnd(5), item.user.padEnd(20), `${item.CPU}`.padEnd(10));
  })
  console.log('====');

  const N = 5; // Number of values to accumulate at max per process.
  const filtered = _.reduce(health, (accumulator, current) => {
    if (!accumulator[current.user]) {
      accumulator[current.user] = [current];
    } else if (accumulator[current.user].length < N) {
      accumulator[current.user].push(current);
    }
    return accumulator;
  }, {});

  const calcMean = arr => arr.length ? _.sumBy(arr, 'CPU') / arr.length : 0;
  const meanCpu = _.values(filtered).map(calcMean);
  const functionMapping = {
    'vm-only': VMOnly,
    'container-only': ContainerOnly,
    'mixed': Mixed,
    'constant': Constant
  };

  const policy = functionMapping[scalingPolicy];
  if (!policy) {
    console.error(`'${scalingPolicy}' is a BAD scaling policy!`);
    console.error(`No scaling engaged. Valid values are ['vm-only', 'container-only', 'mixed']`);
    return runConfig;
  }

  const closestSimilar = containers => {
    return containers;
    if (containers % 4 == 0) {
      return containers - 1;
    } else {
      return containers + 1;
    }
  }

  const allOver80 = allOverValue(meanCpu, 80);
  const allUnder35 = allUnderValue(meanCpu, 35);
  const anyUnder5 = anyUnderValue(meanCpu, 5);
  const rebalance = (stddev(meanCpu) > 30) &&
        (runConfig.lastRebalance + rebalanceCooldownMs < Date.now());
  const containers = rebalance ? closestSimilar(runConfig.containers) : runConfig.containers;
  console.log('Stddev is', stddev(meanCpu), ' and we will rebalance?', rebalance);
  console.log('The means are:', meanCpu, ' while last rebalance was', runConfig.lastRebalance, ' with cooldown', rebalanceCooldownMs);

  if (allOver80) {
    return policy['over'](runConfig);
  } else if (allUnder35 || anyUnder5) {
    return policy['under'](runConfig);
  } else {
    return _.assign({}, runConfig, { containers, rebalance });
  }
}

module.exports = main;
