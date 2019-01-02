const { execSync } = require('child_process');
const sleep = require('sleep-promise');

async function setupContainerSlots(droplet, flavor) {
  const hostname = droplet.name;
  const swarmLeader = flavor['swarm-leader'];
  const maxContainers = 4;
  const scaleCommand = `docker node update --label-add containerslots=${maxContainers} ${hostname}`
  const sshCommand = `ssh ${swarmLeader} "${scaleCommand}"`;
  console.log(`Updating the containerslots for ${hostname} with:::`);
  console.log(':::', sshCommand);
  console.log(':::::::END');
  for (let i = 0; i < 10; ++i) {
    try {
      execSync(sshCommand);
      break;
    } catch(err) {
      console.log('Could not update containerslots', err);
    }
    await sleep(10000);
  }

}

module.exports = setupContainerSlots;
