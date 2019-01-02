const uuid = require('uuid/v4');
const { exec } = require('child-process-promise');

const tableName = 'cpuHealth';

const fetch = async (options) => {
  if (!options) options = {};

  const samples = 3;
  const { stdout } = await exec(`mpstat 2 ${samples} | tail -n 1`)
  // Average: CPU    %usr   %nice    %sys %iowait    %irq   %soft  %steal  %guest  %gnice   %idle

  // numbers are represented by % ( range of [0,100] ) with "," as
  // decimal separator, which we will change to a dot. The one we want
  // is the additive inverse of idle (that is, we want the sum that
  // the CPU has been active).
  const inverseCpu = stdout
        .split(' ')
        .filter(elem => !!elem)
        .map(elem => elem.replace(',', '.'))
        .map(parseFloat)
        .pop(); // returns last element
  console.log('Idle time (in percent is):', inverseCpu);
  return [{
    CPU: 100.0 - inverseCpu
  }]
}

const save = async (r, type, health, options) => {
  if (!health[0]) return;
  const {
    CPU
  } = health[0];
  const { user } = options;
  const id = uuid();
  const timestamp = Date.now();
  await r.table(tableName).insert({
    id, CPU, user, timestamp
  }).run();
}

module.exports = {
  fetch, save, tables: [ tableName ]
};

