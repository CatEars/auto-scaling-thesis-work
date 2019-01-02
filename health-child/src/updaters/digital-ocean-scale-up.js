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

// See DigitalOcean api for accepted strings
const defaultSize = `s-1vcpu-1gb`;
// Note: This is not image as in Docker Image, but as in Droplet Snapshot
const defaultImage = `ubuntu-16-04-x64`;

const scaleUp = async (flavor, sshKeyId, instances, options={}) => {
  const dropletsForFlavor = await r.table('droplets').filter({ tags: [ flavor ] }).run();
  // Do not scale up if the number of instances are fewer than the actual number of instances
  if (dropletsForFlavor.length >= instances) return Promise.resolve();

  const uri = `https://api.digitalocean.com/v2/droplets`;
  const method = `POST`;
  const name = `${flavor}-${Date.now()}`;
  const region = flavors[flavor].region;
  const size = options.size || defaultSize;
  const image = options.image || defaultImage;
  const tags = _.concat(flavors[flavor].tags || [], [flavor]);
  const ssh_keys = [ sshKeyId ];

  const rpOptions = {
    uri, method, json: true,
    body: {
      name, region, size, image, tags, ssh_keys
    },
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

  return rp(rpOptions);
}

module.exports = scaleUp;
