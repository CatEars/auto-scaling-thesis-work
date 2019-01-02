2/**
 * Logs information to the database
 */
const _ = require('lodash');
const loadConfig = require('./load-config');
const {
  'rethinkdb-host': host
} = loadConfig();
const r = require('rethinkdbdash')({ host });
const loadPlugins = require('./load-plugins')

const failover = async (r, type, health) => {
  console.error(`Failed logging health of type: "${type}"`);
}

const plugins = loadPlugins();
const functionMapping = _.reduce(plugins, (result, value, key) => {
  result[key] = value.save
  return result;
}, {});

const logToDatabase = async (type, healthObject, options) => {
  if (!options) options = {};
  const choice = functionMapping[type] || failover;
  return choice(r, type, healthObject, options);
};

module.exports = { logToDatabase };
