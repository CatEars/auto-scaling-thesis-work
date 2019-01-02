/**
 * Run on server to find all the active droplets. Manage droplets by
 * tags in order to separate different organizations. Stores all
 * active droplets in the 'droplets' table.
 */
const _ = require('lodash');
const uuid = require('uuid/v4');
const rp = require('request-promise');
const loadConfig = require('../load-config');
const url = require('url');
const {
  'digital-ocean-secret': digitalOceanSecret,
  'digital-ocean-user': digitalOceanUser,
  'digital-ocean-method': digitalOceanMethod
} = loadConfig();
const permaLog = require('../permaLog');

const tableName = 'droplets';

const fetch = async (options={}) => {
  const uri = `https://api.digitalocean.com/v2/droplets`;
  const method = 'GET';

  const requestOptions = {
    uri, method, json: true,
    headers: {
      'Content-Type': 'application/json'
    },
    qs: {

    }
  }

  _.assign(requestOptions.qs, options.digitalOceanQs);
  // The two different auth types are by user:password and by oauth
  if (digitalOceanMethod === 'oauth') {
    requestOptions.headers['Authorization'] = `Bearer ${digitalOceanSecret}`;
  } else if (digitalOceanMethod === 'password') {
    const [user, token] = [digitalOceanUser, digitalOceanSecret];
    requestOptions.uri = `https://${user}:${token}@api.digitalocean.com/v2/droplets`;
  } else {
    throw "Bad auth type for digital ocean " + digitalOceanMethod ;
  }

  const result = await rp(requestOptions);
  const droplets = result.droplets;
  if (_.get(result, 'links.pages.next')) {
    const nextPage = _.get(result, 'links.pages.next');
    if (nextPage) {
      const parsed = url.parse(nextPage);
      const page = parsed.searchParams.get('page');
      const extraOptions = {
        digitalOceanQs: { page }
      }
      const childOptions = _.assign({}, options, extraOptions);
      const nextPageDroplets = await fetch(childOptions);
      return _.concat(droplets, nextPageDroplets);
    }
  }

  return droplets;
}

const save = async (r, type, droplets, options) => {
  await permaLog(droplets, 'list', r);

  // 1. Find all active droplets and non-active droplets
  // 2. Drop all non-active droplets from dp
  // 3. Update all active droplets
  const dbDroplets = await r.table(tableName).run();
  const asId = droplet => droplet.id;
  const dropDroplets = _.differenceBy(dbDroplets, droplets, asId).map(asId);
  const newDroplets = _.differenceBy(droplets, dbDroplets, asId).map(asId);

  if (dropDroplets.length || newDroplets.length) {
    console.log('All database droplets:', dbDroplets.map(droplet => droplet.name));
  }
  if (dropDroplets.length) {
    console.log('Dropping following droplets:', dropDroplets);
  }
  if (newDroplets.length) {
    console.log('Adding following droplets:', newDroplets);
  }

  await Promise.all(
    dropDroplets.map(id => r.table('droplets').get(id).delete().run())
  );

  return Promise.all(droplets.map(droplet => {
    const {
      id,
      name,
      memory,
      vcpus,
      disk,
      status,
      networks,
      tags
    } = droplet;

    const toInsert = {
      id, name, memory, vcpus, disk, status, networks, tags
    };
    if (_.includes(newDroplets, asId(droplet))) {
      toInsert.isInitialized = false;
    }

    return r.table(tableName).insert(toInsert, {
      conflict: 'update'
    }).run();
  }))
}

module.exports = {
  fetch,
  save,
  tables: [tableName, /* The next ones are used by the perma logger */
           'logDroplets', 'logDestroyDroplets', 'logCreateDroplets', 'logContainers',
           'logRebalance']
};
