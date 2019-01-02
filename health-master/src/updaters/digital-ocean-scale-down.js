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

const findDropletMeanCpu = async (droplet) => {
  const id = droplet.id;
  const healths = await r.table('cpuHealth')
//        .filter({ user: id }) <-- It should be this one
        .filter({ id })
        .orderBy(r.desc('timestamp'))
        .limit(30)
        .run();
  console.log(droplet, 'Healths:', healths);
  if (healths.length === 0) return -1;
  const sum = _.sum(healths, health => health.CPU) / healths.length;
  console.log('Sum for droplet is:', droplet, sum);
  return sum;
}

const scaleDown = async (flavor, instances, options={}) => {

  const dropletsForFlavor = await r.table('droplets')
        .filter(elem => elem('tags').contains(flavor))
        .run();
  const dynamicDroplets = await r.table('droplets')
        .filter({ tags: [flavor] })
        .run();
  const limitedInstances = limitVMs(instances);
  console.log('DropletsForFlavor', dropletsForFlavor);
  console.log('DynamicDroplets', dynamicDroplets);
  if (dropletsForFlavor.length <= limitedInstances) return;

  const randomDroplets = _.shuffle(dynamicDroplets);
  const dropletCpus = await Promise.all(randomDroplets.map(findDropletMeanCpu));
  const zipped = _.zip(randomDroplets, dropletCpus);
  const sorted = _.sortBy(zipped, ([droplet, cpu]) => cpu);
  const onlyDroplets = sorted.map(([a, ...rest]) => a);
  console.log('The droplets, sorted, are', sorted);
  const dropletsToRemove = _.slice(onlyDroplets, 0, dropletsForFlavor.length - limitedInstances);

  for (const droplet of dropletsToRemove) {
    const uri = `https://api.digitalocean.com/v2/droplets/${droplet.id}`;
    console.log('Deleting droplet at URI:', uri);
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
