const pm2Intercom = require('pm2-intercom')
const _ = require('lodash')
const loadConfig = require('./load-config')
const {
  'rethinkdb-host': host,
  'decision-interval-ms': healthDecisionInterval,
  'update-cooldown-ms': updateCooldownMs,
  'container-update-cooldown-ms': containerUpdateCooldownMs,
  'down-scale-cooldown-ms': downScaleCooldownMs,
  'scaling-deciders': scalingDeciders,
  'digital-ocean-vm-size': digitalOceanVMSize,
  'early-update': earlyDigitalOceanUpdate,
  flavors
} = loadConfig()
const r = require('rethinkdbdash')({ host })
const timers = require('timers')
const dockerScale = require('./updaters/docker-scale')
const digitalOceanUpScale = require('./updaters/digital-ocean-scale-up')
const digitalOceanDownScale = require('./updaters/digital-ocean-scale-down')

const cpuDecider = require('./deciders/simple-cpu-decider')
const advancedDecider = require('./deciders/advanced-cpu-decider')

const digitalOceanSSH = require('./get-digital-ocean-ssh-keys')
const limits = require('./limits')
const permaLog = require('./permaLog')

const flavorName = 'breadwoof'
const serviceName = 'imageproxy'

const normalDeciderState = 'normal'
const cooldownDeciderState = 'cooldown'

/// -- Helper functions -- ////

const getFirstDecider = () => {
  const deciders = {
    'simple-cpu-decider': cpuDecider,
    'advanced-cpu-decider': advancedDecider
  }

  const theEmptyDecider = async () => ({})
  let decider = theEmptyDecider
  if (scalingDeciders && scalingDeciders.length) {
    const deciderName = scalingDeciders[0]
    decider = deciders[deciderName]
  }

  return decider
}

const normalizeConfig = config => {
  const ret = _.assign({}, config)
  ret.VMs = limits.limitVMs(ret.VMs || 0)
  ret.containers = limits.limitContainers(ret.containers || 0)
  return ret
}

const printConfig = (config, name) => {
  const msSinceLastUpdate = Date.now() - config.lastVMUpdate
  const msSinceLastContainer = Date.now() - config.lastContainerUpdate
  const nameStr = `==== ${name} ====`
  console.log(''.padEnd(5), nameStr)
  console.log(`VMs: ${config.VMs}`.padEnd(15),
              `Containers: ${config.containers}`.padEnd(15),
              `State: ${config.state}`.padEnd(15),
              `Last VM Update (ms): ${msSinceLastUpdate}`.padEnd(25),
              `Last Container Update (ms): ${msSinceLastContainer}`.padEnd(25),
              `Target cooldown: ${config.targetCooloff}`.padEnd(25))
  console.log(''.padEnd(5), _.repeat('=', nameStr.length))
  console.log()
}

const doPermaLog = (r, label, currentConfig, suggestedUpdates) => {
  for (const key in currentConfig) {
    if (currentConfig[key] === NaN) {
      currentConfig[key] = 0
    }
  }
  for (const key in suggestedUpdates) {
    if (suggestedUpdates[key] === NaN) {
      suggestedUpdates[key] = 0
    }
  }
  const finalConfig = _.assign({}, currentConfig, suggestedUpdates)
  const logObject = {
    finalConfig, lastConfig: currentConfig
  }
  return permaLog(logObject, label, r)
}

/// -- Scaling deciders -- ////

const ScaleUpInstances = {
  name: 'Scale Up VMs',

  shouldUpdate: (currentConfig, suggestedUpdates) => {
    return _.get(suggestedUpdates, 'VMs', currentConfig.VMs) > currentConfig.VMs
  },

  doIt: async (currentConfig, suggestedUpdates) => {
    doPermaLog(r, 'create', currentConfig, suggestedUpdates)

    digitalOceanUpScale(
      flavorName,
      currentConfig.sshKeyId,
      suggestedUpdates.VMs,
      { size: digitalOceanVMSize }
    ).catch(console.error)

    const updates = {}
    updates.lastVMUpdate = Date.now()
    updates.targetCooloff = (updates.lastVMUpdate + updateCooldownMs) || 0
    updates.state = cooldownDeciderState
    updates.containers = suggestedUpdates.containers
    updates.VMs = suggestedUpdates.VMs
    return updates
  }
}

const ScaleDownInstances = {
  name: 'Scale Down VMs',

  shouldUpdate: (currentConfig, suggestedUpdates) => {
    return _.get(suggestedUpdates, 'VMs', currentConfig.VMs) < currentConfig.VMs
  },

  doIt: async (currentConfig, suggestedUpdates) => {
    doPermaLog(r, 'destroy', currentConfig, suggestedUpdates)

    digitalOceanDownScale(
      flavorName,
      suggestedUpdates.VMs
    ).catch(console.error)

    const updates = {}
    updates.lastVMUpdate = Date.now()
    updates.targetCooloff = (updates.lastVMUpdate + downScaleCooldownMs) || 0
    updates.state = cooldownDeciderState
    updates.containers = suggestedUpdates.containers
    updates.VMs = suggestedUpdates.VMs
    return updates
  }

}

const ScaleUpOnlyContainers = {
  name: 'Scale Up Only Containers',

  shouldUpdate: (currentConfig, suggestedUpdates) => {
    return _.get(suggestedUpdates, 'containers', currentConfig.containers) > currentConfig.containers
  },

  doIt: async (currentConfig, suggestedUpdates) => {
    doPermaLog(r, 'containers', currentConfig, suggestedUpdates)
    dockerScale(flavorName, serviceName, suggestedUpdates.containers)

    const updates = {}
    updates.lastContainerUpdate = Date.now()
    updates.targetCooloff = (updates.lastContainerUpdate + containerUpdateCooldownMs) || 0
    updates.containers = suggestedUpdates.containers
    return updates
  }
}

const ScaleDownOnlyContainers = {
  name: 'Scale Down Only Containers',

  shouldUpdate: (currentConfig, suggestedUpdates) => {
    return _.get(suggestedUpdates, 'containers', currentConfig.containers) < currentConfig.containers
  },

  // This is, funnily enough, the exact same as scaling up
  doIt: ScaleUpOnlyContainers.doIt
}

const ScaleContainersFromPreviousChangedInstances = {
  name: 'Scale Up From Previous Upped Instances',

  shouldUpdate: (currentConfig, suggestedUpdates) => {
    return currentConfig.state === cooldownDeciderState &&
      currentConfig.targetCooloff < Date.now()
  },

  doIt: async (currentConfig, suggestedUpdates) => {
    doPermaLog(r, 'create', currentConfig, suggestedUpdates)
    dockerScale(flavorName, serviceName, currentConfig.containers)

    const updates = {}
    updates.lastContainerUpdate = Date.now()
    updates.state = normalDeciderState
    updates.targetCooloff = (updates.lastContainerUpdate + containerUpdateCooldownMs) || 0
    return updates
  }
}

const ScalingOrder = [
  ScaleContainersFromPreviousChangedInstances,
  ScaleUpInstances,
  ScaleDownInstances,
  ScaleUpOnlyContainers,
  ScaleDownOnlyContainers
]

/// -- Main Machinery -- ////

const applyConfig = async (unNormalizedRunConfig, unNormalizedSuggestedUpdates) => {
  const runConfig = normalizeConfig(unNormalizedRunConfig)
  const suggestedUpdates = normalizeConfig(unNormalizedSuggestedUpdates)

  const pickUnequal = (val, key) => !_.isEqual(runConfig[key], val)
  const differingSuggestions = _.pickBy(suggestedUpdates, pickUnequal)

  // Note: Remember that objects cannot be compared directly in JS, but requires
  // a bit of a complex function. Just use _.isEqual when comparing objects!
  if (_.isEqual(differingSuggestions, {})) {
    console.log('Suggestion equivalent to current config.');
    return {}
  }

  console.log('Found there to be suggested updates. Try to find suitable handler')
  printConfig(differingSuggestions, 'suggested updates')

  // Note: Only handle the first scalingHandler that says it should do the
  // update. Do not apply several, because this leads to a "super hard to debug"
  // scenario where several ScalingHandlers can affect the final config and do
  // contesting things at the same time.
  for (const scalingHandler of ScalingOrder) {
    if (scalingHandler.shouldUpdate(runConfig, differingSuggestions)) {
      console.log(`Found that "${scalingHandler.name}" can handle current config. Rejoice!`)
      return await scalingHandler.doIt(runConfig, differingSuggestions)
    }
  }

  console.error('Updates found but could not be applied!')
  printConfig(differingSuggestions, 'unapplied suggested updates')
  return {}
}

const decideAndPushInfo = async (runConfig) => {
  if (runConfig.targetCooloff > Date.now()) {
    const T = runConfig.targetCooloff - Date.now()
    console.log(`Too early for update, wait ${T}ms`)
    return
  }

  const allowedProps = [
    'VMs', 'containers'
  ]

  const decider = getFirstDecider()
  const runConfigCopy = _.assign({}, runConfig)
  console.log('Running Decider!')
  const suggestedDeciderConfig = await decider(r, runConfigCopy)
  const allowedSuggestions = _.pick(suggestedDeciderConfig, allowedProps)
  const suggestedConfigUpdates = allowedSuggestions

  console.log('Applying new config')
  const finalConfig = await applyConfig(runConfig, suggestedConfigUpdates)
  _.assign(runConfig, finalConfig)
  printConfig(runConfig, 'Current Config')
}

const processMessageHandler = packet => {}

const main = async () => {
  /**
   * [1]
   *
   * The state field of the run configuration has two possible values.
   *
   * 'normal' and 'cooldown'
   *
   * During the execution of the program it will shift between them. The run
   * configuration starts in the normal mode and as it ups or downs the number
   * of VMs available it will enter the cooldown period. This is also signified
   * by a large cooldown (targetCooloff will be higher than something like a
   * container increase/decrease). The cooldown period ends with updating the
   * containers to a different number. The reason for this is that containers
   * should be updated when the VMs for it are available.
   */

  const sshKeyId = await digitalOceanSSH.getOrUpdateWithLocal()
  const runConfigurations = {
    VMs: 1,
    containers: 1,
    sshKeyId,
    lastVMUpdate: 0,
    lastContainerUpdate: 0,
    state: normalDeciderState,
    targetCooloff: 0
  }

  const interval = healthDecisionInterval
  timers.setInterval(() => decideAndPushInfo(runConfigurations), interval)
  process.on('message', processMessageHandler)
  console.log('we done with main')
}

if (require.main === module) {
  main()
}
