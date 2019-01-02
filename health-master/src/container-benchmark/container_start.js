const { exec } = require('child-process-promise');
const fs = require('fs');
const sleep = require('sleep-promise');
const path = require('path');

const N = 5000;

const waitUntilDeployed = async () => {
  let output = '';
  while (!output.includes('1/1')) {
    const { stdout } = await exec(`docker service list`);
    output = stdout;
  }
}

const waitUntilGone = async () => {
  let output = 'briteback'
  while (output.includes('briteback')) {
    const { stdout } = await exec(`docker ps`);
    output = stdout;
  }
}

const logFile = () => {
  const logFile = path.resolve(__dirname, 'testingoutput.json');
  return logFile;
}

const logTimes = (A, B, C, D) => {
  // Append to file
  const appendStr = `{"startTimeA":${A},"startTimeB":${B},"endTimeA":${C},"endTimeB":${D}},\n`;
  fs.appendFileSync(logFile(), appendStr);
}

const logStart = () => {
  if (fs.existsSync(logFile())) {
    const newName = `testingoutput.${Date.now()}.json`;
    fs.renameSync(logFile(), newName);
  }
  fs.writeFileSync(logFile(), '[\n');
}

const logEnd = () => {
  fs.writeFileSync(logFile(), ']');
}

const Main = async () => {
  logStart();

  for (let i = 0; i < N; ++i) {
    // Always wait 10 seconds before next one.
    await sleep(10000);
    const startTimeA = Date.now();
    await exec('./deploy.sh');
    await waitUntilDeployed();
    const startTimeB = Date.now();
    const endTimeA = Date.now();
    await exec('docker service rm testback_imageproxy');
    await waitUntilGone();
    const endTimeB = Date.now();

    logTimes(startTimeA, startTimeB, endTimeA, endTimeB);
  }

  logEnd();
}

Main().then(() => process.exit(0))
