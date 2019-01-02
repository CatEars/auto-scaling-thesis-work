const _ = require('lodash');
const rp = require('request-promise');
const fs = require('fs');
const url = require('url');
const loadConfig = require('../load-config');
const {
  'digital-ocean-secret': digitalOceanSecret,
  'digital-ocean-user': digitalOceanUser,
  'digital-ocean-method': digitalOceanMethod,
  'digital-ocean-ssh-key-id': digitalOceanSSHKey,
  'health-decay-time-ms': decayTimeMs,
  flavors,
  'rethinkdb-host': host
} = loadConfig();
const r = require('rethinkdbdash')({ host });
const { limitInstances } = require('../limits');

const scaleDown = async (flavor, sshKeyId, instances, options={}) => {
  console.log('Time 4 downscale!');
  const dropletsForFlavor = await r.table('droplets')
        .filter({ tags: [flavor] })
        .run();

  const limitedInstances = limitInstances(instances);
  if (dropletsForFlavor.length <= limitedInstances) return;

  const randomDroplets = _.shuffle(dropletsForFlavor);
  const dropletsToRemove = _.slice(randomDroplets, 0, dropletsForFlavor - limitedInstances);
  console.log('Random drops:', randomDroplets);
  console.log('Droplets to remove:', dropletsToRemove);
  for (const droplet of dropletsToRemove) {
    const uri = `https://api.digitalocean.com/v2/droplets/${droplet.id}`;
    const method = `DELETE`;
    const rpOptions = {
      uri, method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (digitalOceanMethod === 'oauth') {
      rpOptions.headers['Authorization'] = `Bearer ${digitalOceanSecret}`;
    } else if (digitalOceanMethod === 'password') {
      const [user, token] = [digitalOceanUser, digitalOceanSecret];
      rpOptions.uri = `https://${user}:${token}@api.digitalocean.com/v2/droplets`;
    }

    await rp(rpOptions);
  }
}

module.exports = scaleDown;
