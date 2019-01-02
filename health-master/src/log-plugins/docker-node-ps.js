const { exec } = require('child-process-promise');
const permaLog = require('../permaLog');

const tableName = 'logDockerNodes';

const fetch = async (options={}) => {
  const command = `docker node ls -q | xargs docker node ps | grep Running | grep --invert-match "\\\\\\\_"`;
  const { stdout } = await exec(command);
  return { output: stdout };
}

const save = async (r, type, health) => {
  await permaLog(health, 'nodes', r);
}

module.exports = {
  fetch, save, tables: [ tableName ]
}
