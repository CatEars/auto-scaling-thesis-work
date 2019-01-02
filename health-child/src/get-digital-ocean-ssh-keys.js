const loadConfig = require('./load-config');
const {
  'digital-ocean-secret': digitalOceanSecret,
  'digital-ocean-method': digitalOceanMethod,
  'digital-ocean-user': digitalOceanUser,
  'public-ssh-key-path': sshPath
} = loadConfig();
const fs = require('fs');
const rp = require('request-promise');
const os = require('os');

const authOptions = (rpOptions) => {
  if (digitalOceanMethod === 'oauth') {
    rpOptions.headers['Authorization'] = `Bearer ${digitalOceanSecret}`;
  } else if (digitalOceanMethod === 'password') {
    const [user, token] = [digitalOceanUser, digitalOceanSecret];
    rpOptions.uri = `https://${user}:${token}@api.digitalocean.com/v2/droplets`;
  }
}

const retrieve = async () => {
  const uri = `https://api.digitalocean.com/v2/account/keys/`;
  const method = 'GET';

  const rpOptions = {
    uri, method, json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  }

  authOptions(rpOptions);
  return rp(rpOptions);
}

/**
 * Either gets the current ssh key from the API and returns the id or
 * creates a new one and returns the id.
 */
const getOrUpdateWithLocal = async () => {
  const publicKey = fs.readFileSync(sshPath).toString().trim();
  const retrieved = await retrieve();
  if (retrieved.ssh_keys) {
    for (const key of retrieved.ssh_keys) {
      if (key.public_key === publicKey) {
        return key.id;
      }
    }
  }

  const uri = `https://api.digitalocean.com/v2/account/keys/`;
  const method = `POST`;

  const rpOptions = {
    uri, method, json: true,
    headers: {
      'Content-Type': 'application/json'
    },
    body: {
      name: `Auto-uploaded SSH Key (${os.hostname()})`,
      public_key: publicKey
    }
  }

  authOptions(rpOptions);
  const result = await rp(rpOptions);
  return result.ssh_key.id;
}

module.exports = { retrieve, getOrUpdateWithLocal };

if (require.main === module) {
  retrieve()
    .then(console.log)
    .catch(console.error);
}
