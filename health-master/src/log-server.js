/**
 * Server that handles Authentication for requests and sending them of
 * to the health database.
 */
const bcrypt = require('bcrypt');
const express = require('express');
const bodyParser = require('body-parser');
const { logToDatabase } = require('./health-db');
const loadConfig = require('./load-config');
const _ = require('lodash');
const {
  port: watcherPort,
  'rethinkdb-host': host
} = loadConfig();
const r = require('rethinkdbdash')({ host });


const app = express();
app.use(bodyParser.json());

const logHealthToDB = async (type, entry, user, options={}) => {
  await logToDatabase(type, entry, _.assign({ user }, options));
}

const authenticateUser = async (user, token) => {
  const row = await r.table('login').get(user).run();
  if (!row) {
    return false;
  }
  const saltRounds = 10;
  const result = await bcrypt.compare(token, row.token);
  return result;
}

const authenticatorMiddleware = async (req, res, next) => {
  const { body } = req;
  const { token, user } = body;
  const auth = await authenticateUser(user, token);
  if (!auth) {
    console.log('Bad request, wrong token sent to health check', user, token);
    res.sendStatus(403);
  } else {
    next();
  }
}
app.use(authenticatorMiddleware);

app.post('/healthlog', async (req, res) => {
  const { body } = req;
  const { type, health, user } = body;
  logHealthToDB(type, health, user);
  res.sendStatus(200);
});

app.post('/healthlogs', async (req, res) => {
  const { body } = req;
  const { items, user } = body;
  items.map(({ type, health, options }) => logHealthToDB(type, health, user, options));
  res.sendStatus(200);
})

app.listen(watcherPort);
