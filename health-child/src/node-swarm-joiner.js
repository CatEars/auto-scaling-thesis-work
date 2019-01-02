/**
 * Script that runs and listens for changes in the droplet database
 * and deploys health check to newly added droplets as well as force
 * them to join the correct swarm. Runs on master process to fix
 * nodes.
 */
const pm2Intercom = require('pm2-intercom');
const insertPassword = require('./insert-password');
const _ = require('lodash');
const uuid = require('uuid/v4');
const loadConfig = require('./load-config');
const timer = require('timers');
const {
  'rethinkdb-host': host,
  flavors
} = loadConfig();
const r = require('rethinkdbdash')({ host });
const { exec } = require('child-process-promise');

const getDropletFlavor = (droplet) => {
  const { tags } = droplet;
  const findJoinFlavor = tag => {
    return _.get(flavors, `${tag}`);
  }

  const tag = _.find(tags, findJoinFlavor);
  if (!tag) {
    throw `Could not find a flavor matching any of ${tags}`;
  }
  return flavors[tag];
}

const getJoinCommand = async (droplet, isWorker) => {
  const isManager = !isWorker;
  const flavor = getDropletFlavor(droplet);
  const [ip, port] = [flavor['swarm-leader'], flavor['swarm-port']];
  const swarmType = isManager ? 'manager' : 'worker';
  const getTokenCommand = `docker swarm join-token -q ${swarmType}`;
  const getTokenSSH = `ssh ${ip} '${getTokenCommand}'`;
  const { stdout } = await exec(getTokenSSH);
  const token = stdout;
  return `docker swarm join --token ${token} ${ip}:${port}`;
}

const createAndGetUserIdAndToken = async (droplet) => {
  const id = droplet.id.toString();
  const token = uuid();
  await insertPassword(r, id, token);
  return { userId: id, token };
}

const initializeDroplet = async (droplet, swarmJoinCommand, userId, userToken) => {
  const dropletPublicIp = _.find(droplet.networks.v4, network => network.type === 'public');
  if (!dropletPublicIp) return 'fail';
  const ip = dropletPublicIp.ip_address;

  const flavor = getDropletFlavor(droplet);
  const dropletCopyPath = flavor['health-path']
  // TODO: Is there a way to get the keys from the servers through DO and then insert them here?
  const sshConf = `-o "StrictHostKeyChecking=no"`;
  const copyRepo = `scp ${sshConf} -r ${dropletCopyPath} ${ip}:/health`;
  const deployCommand = `ssh ${sshConf} ${ip} "cd /health && ./deploy-script.sh '${userId}' '${userToken}'` +
        /* Note the usage of ", ' and `! */ ` '${swarmJoinCommand}'"`;
  const fullCommand = `${copyRepo} && ${deployCommand}`;
  const { stdout } = await exec(fullCommand);
  return 'success';
}

const dropletInit = async (droplet) => {
  if (_.includes(droplet.tags, 'static')) return;
  // Generate userId and token
  // Copy over the correct 
  // Download health check and start that process.
  // Get swarm token and ip from manager.
  // Tell machine to join swarm.
  const { userId, token } = await createAndGetUserIdAndToken(droplet);
  const joinCommand = await getJoinCommand(droplet, true);
  let result = 'fail';
  try {
    result = await initializeDroplet(droplet, joinCommand, userId, token);
  } catch (err) {
    console.log(err);
  }
  let tries = 0;
  const totalTries = 9;
  while (result === 'fail' && tries < totalTries) {
    tries += 1;
    // Wait for 10 seconds and try again.
    const sleepTimeMs = 10000;
    await new Promise(resolve => timer.setTimeout(resolve, sleepTimeMs));
    const tryDroplet = await r.table('droplets').get(droplet.id).run();
    if (!tryDroplet) {
      // Removed before setup worked???
      break;
    }
    try {
      result = await initializeDroplet(tryDroplet, joinCommand, userId, token);
    } catch (err) {
      console.log(err);
    }
  }
  console.log('I am outside the while loop, mister');;

  if (tries >= totalTries) {
    console.error(`Did not manage to setup droplet:::`, droplet);
  } else {
    setAsInitialized(droplet.id);
    console.log('Sending a droplet initialized IPC message with:::', droplet);
    process.send({
      topic: 'health:dropletInitialized',
      data: {
        droplet
      }
    })
  }
}

const setAsInitialized = dropletId => {
  r.table('droplets').update({ id: dropletId, isInitialized: true }).run();
}

const main = async () => {
  // 1. Start watching for changes of the droplets table.
  // 2. When a change occurs, look if isInitialized = false,
  //    in case it is, run the corresponding update
  //    function for the tag.

  const stream = await r.table('droplets').changes().run();

  stream.on('data', (data) => {
    const {
      old_val,
      new_val
    } = data;
    console.log(':::There is a new droplet in the database:::');
    console.log(old_val);
    console.log('*** V ***');
    console.log(new_val);
    console.log('******');

    // Make sure that isInitialized is exactly false and not falsy
    if (new_val && new_val.isInitialized == false && new_val.status === 'active') {
      // Initialize the droplet

      try {
        dropletInit(new_val);
      } catch (error) {
        console.log('Could not initialize =/////');
      }
    }

  });
};


if (require.main === module) {
  main();
}
