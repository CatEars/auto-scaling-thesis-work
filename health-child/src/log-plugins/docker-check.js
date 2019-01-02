const uuid = require('uuid/v4');
const { exec } = require('child-process-promise');

const tableName = 'dockerHealth';

const fetch = async (options) => {
  if (!options) options = {};
  const { printResults = false } = options;

  const command = `docker stats --format '{"name":"{{.Container}}","CPU":"{{.CPUPerc}}","memory":"{{.MemUsage}}","network":"{{.NetIO}}"},' --no-stream`
  const result = await exec(command);
  const { stdout } = result;

 // Removes last character (a comma) and turns into JSON array
  const removeLastComma = stdout.trim().substr(0, stdout.trim().length - 1);
  const asArray = `[${removeLastComma}]`
  const values = JSON.parse(asArray);
  // const {
  //   name,
  //   CPU,
  //   memory,
  //   network
  // } = values;
  if (printResults) {
    console.log(values);
  }
  return values;
}

const save = async (r, type, healthList) => {
  return Promise.all(healthList.map(health => {
    const {
      CPU,
      name,
      memory,
      network
    } = health;
    const id = uuid();
    const timestamp = Date.now();
    return r.table(tableName).insert({
      id, CPU, name, memory, network, timestamp
    }).run();
  }))
}

module.exports = {
  fetch, save, tables: [ tableName ]
};

