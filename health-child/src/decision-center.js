const pm2Intercom = require('pm2-intercom');
const _ = require('lodash');
const loadConfig = require('./load-config');
const {
  'rethinkdb-host': host,
  'decision-interval-ms': healthDecisionInterval,
  'update-cooldown-ms': updateCooldownMs,
  'scaling-deciders': scalingDeciders,
  flavors
} = loadConfig();
const r = require('rethinkdbdash')({ host });
const timers = require('timers');
const dockerScale = require('./updaters/docker-scale');
const digitalOceanUpScale = require('./updaters/digital-ocean-scale-up');
const rebalanceDockerContainers = require('./updaters/rebalance-docker-containers');
const cpuDecider = require('./deciders/simple-cpu-decider');
const digitalOceanSSH = require('./get-digital-ocean-ssh-keys');

const applyConfig = async (lastConfig, currentConfig) => {
  console.log('Lastconfig:', lastConfig);
  console.log('Currentconfig:', currentConfig);

  const pickUnequal = (val, key) => !_.isEqual(lastConfig[key], val);
  const updates = _.pickBy(currentConfig, pickUnequal);

  // Note: Remember that objects cannot be compared directly in JS, but requires
  // a bit of a complex function. Just use _.isEqual when comparing objects!
  if (_.isEqual(lastConfig, currentConfig) || _.isEqual(updates, {})) {
    console.log('Mode already configured like this');
    console.log('********');
    console.log(updates);
    console.log('********');

    return {};
  } else {
    console.log('Updating with following update object:');
    console.log('********');
    console.log(updates);
    console.log('********');

    // Create the final config object with same properties as
    // `lastConfig`, but with updates from `updates`
    const finalConfig = _.assign({}, lastConfig, updates);
    if (finalConfig.instances && finalConfig.instances > lastConfig.instances) {
      const flavorName = 'breadwoof';
      const serviceName = 'child';
      await digitalOceanUpScale(flavorName, currentConfig.sshKeyId, finalConfig.instances);
      await dockerScale(flavorName, serviceName, finalConfig.replicas);
      lastConfig.lastUpdate = Date.now();
    } else if (finalConfig.instances) {
      finalConfig.instances = lastConfig.instances;
      finalConfig.replicas = lastConfig.replicas;
    }

    return finalConfig;
  }
}

const decideAndPushInfo = async (runConfig) => {
  if (runConfig.lastUpdate + updateCooldownMs > Date.now()) {
    console.log('Too early to update again, this quickly after the last');
    return;
  }

  const deciders = {
    'simple-cpu-decider': cpuDecider
  };
  const theEmptyDecider = async () => ({});

  const interestingProps = ['instances', 'replicas', 'sshKeyId']
  // Note: _.assign({}, runConfig) makes sure that deciders cannot
  // mutate runConfig and force them to rely on returning an updated
  // object, instead of changing the one given to them.
  const updatedConfig = {};
  for (const deciderName of scalingDeciders) {
    const decider = deciders[deciderName] || theEmptyDecider;
    const configDescription = await decider(r, _.assign({}, runConfig));
    _.assign(updatedConfig, _.pick(configDescription, interestingProps));
  }

  const finalConfig = await applyConfig(runConfig, updatedConfig);
  _.assign(runConfig, finalConfig);
}

const processMessageHandler = packet => {
  console.log('Got an IPC message:::', packet);
  if (packet.topic === 'health:dropletInitialized') {
    const { droplet } = packet.data;
    console.log('Droplet fully initialized, trying to rebalance scalable containers', droplet);

    // Do nothing for static droplets and droplets with no tags
    if (!!droplet.tags || !!droplet.tags.length || _.includes(droplet.tags, 'static')) {
      console.log('But not for this one, because it is either static or has no tags');
      return;
    }

    for (const tag of droplet.tags) {
      if (flavors[tag]) {
        try {
          rebalanceDockerContainers(tag);
          return;
        } catch (err){
          console.log('Could not rebalance tag =(');
        }
      }
    }
  }
}

const main = async () => {
  const sshKeyId = await digitalOceanSSH.getOrUpdateWithLocal();
  const interval = healthDecisionInterval;
  const runConfigurations = {
    instances: 0, // TODO: How to configure instances correctly from start?
    replicas: 1,
    sshKeyId,
    lastUpdate: 0
  };
  timers.setInterval(() => decideAndPushInfo(runConfigurations), interval);
  process.on('message', processMessageHandler);
}

if (require.main === module) {
  main();
}
