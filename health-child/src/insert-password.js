const bcrypt = require('bcrypt');

const insertPassword = async (r, username, userToken) => {
  const saltRounds = 10;
  const tokenHash = await bcrypt.hash(userToken, saltRounds);
  return r.table('login').insert({
    id: username,
    token: tokenHash
  }, {
    conflict: 'update'
  }).run();
}

module.exports = insertPassword;
