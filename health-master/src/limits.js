const loadConfig = require('./load-config');
const {
  'digital-ocean-maximum-instances': digitalOceanMaximumInstances,
  'digital-ocean-maximum-containers': digitalOceanMaximumContainers
} = loadConfig();

const createLimiter = (minimum, maximum) => (value) => {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

module.exports = {
  limitVMs: createLimiter(1, digitalOceanMaximumInstances),
  limitContainers: createLimiter(1, digitalOceanMaximumContainers)
}



