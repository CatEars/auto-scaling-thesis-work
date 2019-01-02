const { exec } = require('child-process-promise');
const loadConfig = require('../load-config');
const {
  flavors
} = loadConfig();

const main = async (flavor, service, replicas) => {
  const { 'swarm-leader': swarmLeader, 'service-name': serviceName } = flavors[flavor];
  const dockerCommand = `docker service scale ${serviceName}_${service}=${replicas}`;
  const sshConf = `-o "StrictHostKeyChecking=no"`;
  const sshCommand = `ssh ${sshConf} ${swarmLeader} "${dockerCommand}"`;
  const { stdout } = await exec(sshCommand);
  console.log('Scaled ', flavor , '-', service, 'to', replicas, 'replicas');
}

module.exports = main;
