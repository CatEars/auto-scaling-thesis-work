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
  
  await Promise.all(commands.map(command => exec(command)))
}

module.exports = main;
