/**
 * Run once to setup all necessary tables used by the plugins
 */
const insertPassword = require('./insert-password');
const loadConfig = require('./load-config');
const {
  'rethinkdb-host': host,
  username,
  token,
  flavors
} = loadConfig();
const r = require('rethinkdbdash')({ host });
const loadPlugins = require('./load-plugins');
const _ = require('lodash');

const setup = async () => {
  const plugins = loadPlugins();
  const tables = new Set();
  const existingTables = await r.tableList().run();

  for (const key in plugins) {
    if (plugins[key].complexTable) {
      try {
        await plugins[key].createTables(r);
      } catch (err) {
        console.error('Got error for create table in', key, 'plugin');
        console.error(err);
      }
    } else {
      plugins[key].tables.map(table => tables.add(table));
    }
  }
  tables.add('login');

  for (const table of tables) {
    if (_.includes(existingTables, table)) {
      console.log('Skipping', table, 'as it already exists');
      continue;
    }
    try {
      await r.tableCreate(table).run().then(() => console.log(`Created table: ${table}`));
    } catch (err) {
      console.error('Got error when creating table', table);
      console.error(err);
    }
  }
}


const checkMasterToken = async () => {
  // The master server sends data to itself so it needs to enter its
  // own id and token into the database.
  return insertPassword(r, username, token);
}

const checkFlavorLogins = async () => {
  // Make sure that all flavor logins are present in database
  for (const flavorKey in flavors) {
    const flavor = flavors[flavorKey];
    if (flavor && flavor.logins) {
      for (const login of flavor.logins) {
        const id = login.username;
        const token = login.token;
        await insertPassword(r, id, token);
        console.log('Set token for user:', id);
      }
    }
  }
}

if (require.main === module) {
  setup()
    .then(checkMasterToken)
    .then(checkFlavorLogins)
    .then(() => process.exit(0));
}
