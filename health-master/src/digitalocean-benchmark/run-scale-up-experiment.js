const { issueVM, removeDroplet, removeAllWithTag } = require('./digital-ocean-scale-up');
const sleep = require('sleep-promise');
const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const digitalOceanSSH = require('../get-digital-ocean-ssh-keys');

const snapshot = (outputFile, collectedStartupTimes, collectedShutdownTimes) => {
  const pickUseful = item => {
    return _.pick(item, ['startTime', 'endTime']);
  }

  const saveObject = {
    'start': _.map(collectedStartupTimes, pickUseful),
    'stop': _.map(collectedShutdownTimes, pickUseful)
  }

  try {
    fs.writeFileSync(outputFile, JSON.stringify(saveObject));
  } catch (error) {
    console.log('Could not write snapshot!!!');
    console.log(error);
    console.log('*** Snapshot ***');
    console.log(collectedStartupTimes);
    console.log(collectedShutdownTimes);
    console.log('*** End Snapshot ***');
  }
}

let lastToken = 2;
const numTokens = 5;
const toggleToken = () => {
  const currentToken = (lastToken + 1) % numTokens;
  const suffix = `${currentToken}`;
  const fname = `digital-ocean-secrets${suffix}.json`;
  console.log(`Switching to ${fname} secret instead!`);
  const fpath = path.resolve(__dirname, '..', '..', 'secrets', fname);
  const data = JSON.parse(fs.readFileSync(fpath, { encoding: 'utf-8' }));
  const secret = data['digital-ocean-secret'];
  process.env.DIGITAL_OCEAN_SECRET = secret;
  lastToken = currentToken;
}

const main = async () => {
  toggleToken() // Initializes secret token

  // The total number of VMs to test for.
  const numberOfVMs = 749;

  // Remove ALL testing droplets with every #purgeRatio droplet that is issued.
  const purgeFrequency = 25;

  // Tag to use on DigitalOcean.
  const tag = 'smalltest';

  // Wait for a second between creation and deletion.
  const defaultSleepTime = 1000;

  // Report every X times how many we have done and how many there are left to do.
  const reportFrequency = 8;

  // Save intermediate results every X times.
  const snapshotFrequency = 2;

  // The file that snapshots and the result will be written to.
  const outputFile = 'small-longer-test.json';

  // Toggle key used for polling every X times.
  const toggleFrequency = 70;
  
  console.log('Running test with', numberOfVMs, 'VMs');

  const sshKey = await digitalOceanSSH.getOrUpdateWithLocal();
  
  const collectedStartupTimes = [];
  const collectedShutdownTimes = [];
  
  try {
    for (let i = 1; i <= numberOfVMs; i += 1) {
      if (i % purgeFrequency == 0) {
        await removeAllWithTag(tag);
      }

      if (i % reportFrequency == 0) {
        console.log(`On item #${i} of #${numberOfVMs}`);
      }

      if (i % snapshotFrequency == 0) {
        snapshot(outputFile, collectedStartupTimes, collectedShutdownTimes);
      }

      if (i % toggleFrequency == 0) {
        console.log('Time 4 a toggle!');
        toggleToken();
      }
      
      const options = {
        tags: [tag],
        ssh_keys: [sshKey]
      }

      const startResult = await issueVM(options);
      collectedStartupTimes.push(startResult);

      // Await for a second just to make sure that everything works as
      // expected.
      await sleep(defaultSleepTime);

      const tagId = startResult.tagId;
      const dropletId = startResult.VMs.droplets[0].id;
      const stopResult = await removeDroplet(tagId, dropletId);
      collectedShutdownTimes.push(stopResult);
    }

  } catch (error) {
    console.log(error)
  } finally {
    // Make sure that all droplets are removed before continuing
    await removeAllWithTag(tag);
  }

  snapshot(outputFile, collectedStartupTimes, collectedShutdownTimes);
}

if (require.main === module) {
  try {
    main().then(() => process.exit(0)).catch(console.error);
  } finally {
    const tag = 'smalltest';
    removeAllWithTag(tag);
  }
}
