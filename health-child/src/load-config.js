const _ = require('lodash');
const fs = require('fs');
const path = require('path');

// Note: The precedence of configuration parameters is as follows:
//  - Environment variables
//  - Included .json files
//  - config.json

module.exports = () => {
  const configPath = process.env.CONFIG_PATH || path.resolve(__dirname, '..', 'config.json');
  const configData = fs.readFileSync(configPath);
  const data = JSON.parse(configData);

  // Look for included files (typically secret files).
  // Note: included files cannot themselves include more files, only
  // things from config.json are included.
  if (data['included-files']) {
    const extraIncludes = data['included-files'];
    const includeFileInConfig = pathFromConfig => {
      const thePath = path.resolve(path.dirname(configPath), pathFromConfig);
      try {
        const configData = fs.readFileSync(thePath);
        const updateData = JSON.parse(configData);
        _.assign(data, updateData);
      } catch (err) {
        console.log('Could not add included file: ', pathFromConfig);
      }
    }
    extraIncludes.map(includeFileInConfig);
  }

  // Get the correct path for any health-path in the flavor (might be
  // more in future so 2x for-loop).
  if (data['flavors']) {
    const pathsKeys = ['health-path'];
    for (const pathKey of pathsKeys) {
      for (const flavorKey in data['flavors']) {
        const pathFromConfig = data['flavors'][flavorKey][pathKey];
        data['flavors'][flavorKey][pathKey] = path.resolve(configPath, pathFromConfig);
      }
    }
  }
  
  // Overwrite any config value with values from process.env
  const envMapping = {
    'decision-interval-ms': process.env.DECISION_INTERVAL_MS,
    'digital-ocean-secret': process.env.DIGITAL_OCEAN_SECRET,
    'digital-ocean-user': process.env.DIGITAL_OCEAN_USER,
    'digital-ocean-method': process.env.DIGITAL_OCEAN_METHOD,
    'hostname': process.env.HEALTH_HOSTNAME,
    'rethinkdb-host': process.env.RETHINKDB_HOST,
    'token': process.env.TOKEN,
    'update-cooldown-ms': process.env.UPDATE_COOLDOWN_MS,
    'username': process.env.USERNAME,
    'send-health-interval-ms': process.env.SEND_HEALTH_INTERVAL_MS,
    'public-ssh-key-path': process.env.PUBLIC_SSH_KEY_PATH
  };

  for (const key in envMapping) {
    if (envMapping[key]) {
      data[key] = envMapping[key];
    }
  }

  if (process.env.PLUGINS) {
    const plugins = process.env.PLUGINS;
    data['plugins'] = _.split(plugins, ',');
  }
  
  return data;
}
