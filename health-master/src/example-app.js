/**
 * An example app that pretty prints JSON.
 */
const bodyParser = require('body-parser');
const express = require('express');
const loadConfig = require('./load-config');
const util = require('util');

const {
  port
} = loadConfig();

const app = express();
app.use(bodyParser.json());

app.post('/', async (req, res) => {
  const { body } = req;
  const { page } = body;
  if (!page) {
    res.sendStatus(200);
  } else {
    for (let i = 0; i < 100; ++i) {
      util.inspect(page, {depth:null, colors: true});
    }
    res.send(util.inspect(page, { depth: null, colors: true }));
  }
})

app.listen(port);
