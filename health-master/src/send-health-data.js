/**
 * Script that sends health data to the watcher
 */
const _ = require('lodash');
const rp = require('request-promise');
const loadPlugins = require('./load-plugins')
const loadConfig = require('./load-config')
const fs = require('fs');

const {
  hostname,
  'network-path': networkPath,
  username: user,
  token,
  plugins: enabledPlugins,
  'repeat-send-health': repeatSendHealth,
  'send-health-interval-ms': sendHealthInterval
} = loadConfig();

const plugins = loadPlugins();
const functionMapping = _.reduce(plugins, (result, value, key) => {
  result[key] = value.fetch
  return result;
}, {});

const mapToFunction = name => {
  const availableFunctions = functionMapping;
  const f = availableFunctions[name];

  if (!f) {
    console.warn('Could not find health-check function for name:', name);
    return () => {}; // The "empty" function
  }
  return availableFunctions[name];
}

const mapToObject = (values) => {
  const [type, health] = values;
  return { type, health };
}

const main = async (skipChecks) => {
  if (!skipChecks) skipChecks = [];

  const choices = enabledPlugins.filter(item => !skipChecks.includes(item));
  const functions = choices.map(mapToFunction);
  const results = await Promise.all(functions.map(async (func) => {
    try {
      const result = await func();
      return Promise.resolve(result);
    } catch(error) {
      console.error('Got an error while processing plugin', error);
      return Promise.resolve(false);
    }
  }));

  const joined = _.zip(choices, results);
  const toProcess = joined.filter(([name, value]) => !!value);
  const items = toProcess.map(mapToObject);
  const url = `https://${hostname}/${networkPath}/`;

  const options = {
    uri: url,
    body: {
      user, token, items
    },
    method: 'POST',
    json: true
  };

  return rp(options);
}

if (require.main === module) {
  if (repeatSendHealth) {
    const timers = require('timers');
    timers.setInterval(() => {
      main().catch(console.error);
    }, sendHealthInterval);
  } else {
    main()
      .then(() => {
        console.log('Finished sending health')
        process.exit(0);
      })
      .catch(console.error);
  }
}
