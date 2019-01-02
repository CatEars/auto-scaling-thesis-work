module.exports = async (r) => {
  return r
    .table('pm2Health')
    .orderBy(r.desc('timestamp'))
    .limit(20) // TODO: Limit is arbitrary, might need more in production setup
    .run();
}
