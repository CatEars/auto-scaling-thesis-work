const _ = require('lodash');
const uuid = require('uuid/v4')

const stamp = obj => _.assign({}, obj, {id: uuid(), timestamp: Date.now()});

const logJson = (table, name) => async (json, tag, r) => {
  const data = name ? stamp(_.set({}, name, json)) : stamp(json);
  await r.table(table).insert(data).run();
}

const defaultLog = async (json, tag, r) => {
  console.log('Tag is', tag, 'and that may have been the wrong tag.');
  console.log(json);
}

const logFromTag = async (json, tag, r) => {
  const functionMapping = {
    'list': logJson('logDroplets', 'droplets'),
    'create':  logJson('logDestroyDroplets', 'configs'),
    'destroy': logJson('logCreateDroplets', 'configs'),
    'containers': logJson('logContainers', 'configs'),
    'nodes': logJson('logDockerNodes'),
    'rebalance': logJson('logRebalance', 'configs')
  }
  const F = functionMapping[tag] || defaultLog;
  return await F(json, tag, r);
}

module.exports = logFromTag;
