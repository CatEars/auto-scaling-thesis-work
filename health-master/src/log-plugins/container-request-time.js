const { execSync } = require('child_process');
const fs = require('fs');

const tableName = 'requestTime';

const requestFile = '/requests.log'
const lastCopied = '/requests.cop.log'

// Lazy load uuid lib (not sure if available on )
let uuid;
const getUuid = () => {
  if (!uuid) {
    uuid = require('uuid/v4')
  }
  return uuid()
}

const getDockerId = () => {
  const dockerId = execSync('cut -c9- < /proc/1/cpuset')
  return () => {
    return dockerId;
  }
}

const getLatestRequests = () => {
  const options = {
    encoding: 'utf-8'
  }
  const data = fs.readFileSync(requestFile, options)
  const lastWrittenData = fs.readFileSync(lastCopied, options)

  // find what lines we don't already have...
  const lines = data.split('\n');
  const lastAsLines = lastWrittenData.split('\n');

  const alreadyWritten = lastAsLines.length
  const newLines = lines.slice(alreadyWritten)

  const containerId = getDockerId()
  const lineToObject = line => {
    const [start, end] = line.split('::')
    return { start, end, containerId }
  }

  const objectsToSave = newLines.map(lineToObject)

  // Save new checkpoint
  fs.writeFileSync(lastCopied, data)
  return objectsToSave
}

const fetch = async () => {
  return getLatestRequests()
}

const save = async (r, type, health, options) => {
  const uuid = require('uuid/v4')
  const {
    containerId, start, end
  } = health;
  const id = getUuid();
  const timestamp = Date.now()
  await r.table(tableName)
}

module.exports = {
  fetch, save, tables: [tableName]
}
