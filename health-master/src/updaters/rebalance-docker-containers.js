const loadConfig = require('../load-config');
const {
  flavors
} = loadConfig();
const { exec } = require('child-process-promise');

const main = async (flavorName) => {
  const flavor = flavors[flavorName];
  const { 'swarm-leader': ip,
          'scalable-services': services,
          'service-name': serviceName } = flavor;

  console.log('Time to rebalance', flavorName);
  const commands = services.map(service => {
    const derivedName = `${serviceName}_${service}`;
    return `docker service update --force ${derivedName}`;
  });

  const sshCommands = commands.map(cmd => `ssh ${ip} '${cmd}'`);

  const rebalanceTries = 10;
  
  await Promise.all(sshCommands.map(async (command) => {
    for (let i = 0; i < rebalanceTries; ++i) {
      try {
        console.log('Performing:', command);
        console.log('For the', i, 'th time');
        await exec(command);
        break;
      } catch (err) {
        console.log('Could not rebalance:', command);
      }
    }
  }))
}

module.exports = main;
