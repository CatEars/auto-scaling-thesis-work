const _ = require('lodash');
const rp = require('request-promise');
const loadConfig = require('../load-config');
const {
  'digital-ocean-secret': digitalOceanSecret,
  'digital-ocean-user': digitalOceanUser,
  'digital-ocean-method': digitalOceanMethod,
  'digital-ocean-ssh-key-id': digitalOceanSSHKey,
  flavors,
  'rethinkdb-host': host
} = loadConfig();
const crypto = require('crypto');

// See DigitalOcean api for accepted strings
const defaultSize = `s-1vcpu-1gb`;
// Note: This is not image as in Docker Image, but as in Droplet Snapshot
const defaultImage = `ubuntu-16-04-x64`;
const defaultName = `XJobbTest-Small`
const defaultRegion = `ams3`;
const defaultTags = [`testingtag`];

const addAuth = rpOptions => {
  if (digitalOceanMethod === 'oauth') {
    const DOSecret = process.env.DIGITAL_OCEAN_SECRET || digitalOceanSecret;
    rpOptions.headers['Authorization'] = `Bearer ${DOSecret}`;
  } else if (digitalOceanMethod === 'password') {
    const [user, token] = [digitalOceanUser, digitalOceanSecret];
    rpOptions.uri = `https://${user}:${token}@api.digitalocean.com/v2/droplets`;
  }
}

const listVMs = async (tagId) => {
  const uri = `https://api.digitalocean.com/v2/droplets?tag_name=${tagId}`;
  const method = `GET`;
  const rpOptions = {
    uri, method, json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  addAuth(rpOptions);
  
  return await rp(rpOptions);
}

const issueVM = async (options={}) => {
  const uri = `https://api.digitalocean.com/v2/droplets`;
  const method = `POST`;
  const name = `${defaultName}-${Date.now()}`;
  const region = options.region || defaultRegion;
  const size = options.size || defaultSize;
  const image = options.image || defaultImage;
  const tags = options.tags || defaultTags;
  const ssh_keys = options.ssh_keys || [];
  const tagId = `tag${crypto.randomBytes(10).toString('hex')}`
  tags.push(tagId);

  const rpOptions = {
    uri, method, json: true,
    body: {
      name, region, size, image, tags, ssh_keys
    },
    headers: {
      'Content-Type': 'application/json'
    }
  };

  addAuth(rpOptions);

  const startTime = Date.now();
  await rp(rpOptions);
  
  const isActive = vms =>
        vms.droplets.length &&
        vms.droplets[0].status === 'active';
  
  let VMs = await listVMs(tagId);
  while (!isActive(VMs)) {
    VMs = await listVMs(tagId);
  }
  
  const endTime = Date.now();
  return {
    startTime, endTime, tagId, VMs
  }
}

const removeDroplet = async (tagId, dropletId) => {
  const uri = `https://api.digitalocean.com/v2/droplets/${dropletId}`;
  const method = `DELETE`;
  const rpOptions = {
    uri, method, json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  addAuth(rpOptions);
  await rp(rpOptions);

  const isActive = vms =>
        vms.droplets.length &&
        vms.droplets[0].status === 'active';

  const startTime = Date.now();
  let VMs = await listVMs(tagId);
  while (isActive(VMs)) {
    VMs = await listVMs(tagId);
  }
  const endTime = Date.now();

  return {
    startTime, endTime, VMs
  }
}

const removeAllWithTag = async (tag) => {
  const uri = `https://api.digitalocean.com/v2/droplets?tag_name=${tag}`;
  const method = `DELETE`;
  const rpOptions = {
    uri, method, json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  addAuth(rpOptions);
  await rp(rpOptions);
}

const main = async (logToConsole=true) => {
  const options = {};
  const times = await issueVM(options);
  await removeDroplet(times.tagId, times.VMs.droplets[0].id);
  if (logToConsole) {
    console.log(times.startTime, times.endTime, `${(times.endTime - times.startTime) / 1000.0}s`);
  }
  return times;
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(console.error);
}

module.exports = {
  issueVM,
  removeDroplet,
  removeAllWithTag
}
