const { exec } = require('child-process-promise');
const tableName = 'dockerActive';

const getServices = async () => {
  const command = `docker service ls`;
  
  try {
    const { stdout } = await exec(command);

    if (!(stdout.contains('ID') && stdout.contains('NAME'))) {
      console.warn(`Could not get services properly`);
      return [];
    }
    
    // ID    NAME    MODE    REPLICAS    IMAGE
    const [header, ...entries] = stdout.split('\n');
    return entries.map(entry => entry.split(' ')[1]);
  } catch (error) {
    console.error('Could not fetch service data', error);
    return [];
  }
}

const getActiveContainers = async (service) => {
  const command = `docker service ps ${service}`;
  try {
    const { stdout } = await exec(command);
    if (!(stdout.contains('ID') && stdout.contains('CURRENT STATE'))) {
      console.warn(`Could not get container listing of service: ${service}`);
      return [];
    }

    //                                         5-8 is state + X minutes/hours ago
    // 0  1    2     3        4                5 6 7 8
    // ID NAME IMAGE NODE     DESIRED STATE    CURRENT STATE    ERROR     PORTS
    const [header, ...entries] = stdout.split('\n');
    return entries.map(entry => ({
      id: entry[0],
      desired: entry[4],
      state: entry[5]
    })).filter(health => health.state === 'Running');
  } catch (error) {
    console.error(`Could not get active containers for service ${service}`, error);
    return [];
  }
}

const fetch = async () => {
  const services = await getServices();
  if (!services.length) {
    return false; // Why are empty arrays considered truthy in javascript =(
  }

  const activeContainers = await Promise.all(services.map(getActiveContainers));
  return activeContainers;
}

const save = async (r, type, health) => {
  return Promise.all(health.map(entry => {
    const {
      id,
      desired,
      state
    } = entry;
    const timestamp = Date.now();
    return r.table(tableName).insert({
      id, desired, state
    }).run();
  }));
}

module.exports = {
  fetch, save, tables: [ tableName ]
};
