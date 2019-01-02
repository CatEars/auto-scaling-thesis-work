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
  flavors,
  'rethinkdb-host': host
} = loadConfig();
const r = require('rethinkdbdash')({ host });
const { limitVMs } = require('../limits');

// See DigitalOcean api for accepted strings
const defaultSize = `s-1vcpu-1gb`;
// Note: This is not image as in Docker Image, but as in Droplet Snapshot
const defaultImage = `ubuntu-16-04-x64`;

const scaleUp = async (flavor, sshKeyId, instances, options={}) => {
  const dropletsForFlavor = await r.table('droplets')
        .filter(elem => elem('tags').contains(flavor))
        .run();
  const limitedInstances = limitVMs(instances);

  // Do not scale up if the number of instances are fewer than the actual number of instances
  if (dropletsForFlavor.length >= limitedInstances) return;

  // Set up Request options
  const uri = `https://api.digitalocean.com/v2/droplets`;
  const method = `POST`;
  const region = flavors[flavor].region;
  const size = options.size || defaultSize;
  const image = options.image || defaultImage;
  const tags = _.concat(flavors[flavor].tags || [], [flavor]);
  const ssh_keys = [ sshKeyId ];
  const rpOptions = {
    uri, method, json: true,
    body: {
      region, size, image, tags, ssh_keys
    },
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const dropletsToCreate = limitedInstances - dropletsForFlavor.length;
  if (dropletsToCreate == 1) {
    const name = `${flavor}-${Date.now()}`;
    rpOptions.body.name = name;
  } else {
    // Limit the number of droplets to multi-create to 10 at a time.
    // Because the API says so:
    // https://developers.digitalocean.com/documentation/v2/#create-multiple-droplets
    // "Up to ten Droplets may be created at a time."
    const actualDropletsToCreate = Math.min(dropletsToCreate, 10);
    const namePrefix = `${flavor}-${Date.now()}`;
    const names =_.range(actualDropletsToCreate)
          .map(num => `${namePrefix}-${num.toString()}`);
    rpOptions.body.names = names;
  }

  if (digitalOceanMethod === 'oauth') {
    rpOptions.headers['Authorization'] = `Bearer ${digitalOceanSecret}`;
  } else if (digitalOceanMethod === 'password') {
    const [user, token] = [digitalOceanUser, digitalOceanSecret];
    rpOptions.uri = `https://${user}:${token}@api.digitalocean.com/v2/droplets`;
  }

  await rp(rpOptions);
}

module.exports = scaleUp;
