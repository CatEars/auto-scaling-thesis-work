const pm2 = require('pm2');
const uuid = require('uuid/v4');
const tableName = 'pm2Health';

const fetch = async () => {
  await new Promise((resolve, reject) => {
    pm2.connect(err => {
      if (err) reject(err);
      resolve();
    })
  })

  const processes = await new Promise((resolve, reject) => {
    pm2.list((err, processDescriptionList) => {
      if (err) reject(err);
      resolve(processDescriptionList);
    });
  })

  const pickInterestingInfo = obj => {
    const {
      name, pid, monit, pm2_env
    } = obj;
    const {
      restart_time, status, instances
    } = pm2_env;
    return { name, pid, monit, restart_time, status, instances };
  }
  
  return processes.map(pickInterestingInfo);
};

const save = async (r, type, healthList) => {
  return Promise.all(healthList.map(health => {
    const {
      name, pid, monit, restart_time, status, instances
    } = health;
    const id = uuid();
    const timestamp = Date.now();
    return r.table(tableName).insert({
      id, timestamp, name, pid, monit, restart_time, status, instances
    });
  }))
}

module.exports = {
  fetch, save, tables: [ tableName ]
}
