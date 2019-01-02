const { exec } = require('child-process-promise');
const fs = require('fs');
const sleep = require('sleep-promise');
const path = require('path');

const TenSeconds = 10000;
const OneMinute = TenSeconds * 6;
const ElevenMinutes = OneMinute * 11;

const ContainerValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const Rates = [5, 10, 20, 40, 60, 80, 100, 120];

const ServiceCMD = N => `docker service scale testback_imageproxy=${N}`;
const ManagerSSH = cmd => `ssh containertest "${cmd}"`;
const KillerSSH = cmd => `${cmd}`;
const SiegeCMD = (N, rate) => `nohup ./siege-${rate} > siege_inner-${N}-${rate}.out`;

const Scale = async (N) => {
  await exec(ManagerSSH(ServiceCMD(N)));
  await sleep(OneMinute / 6);
}

const DoRequests = async (N, R) => {
  const { stdout } = await exec(SiegeCMD(N, R));
  await sleep(OneMinute);
  return stdout;
}

const Main = async () => {
  for (const N of ContainerValues) {
    console.log('N =', N);
    let scaled = false;

    try {
      await Scale(N);
      scaled = true;
    } catch (error) {
      console.log('Could not scale up accordingly!, exiting!!!');
      console.log(error);
      return;
    }
    console.log();
    console.log('SCALED:', scaled);
    for (const R of Rates) {
      console.log('   R =', R);
      let requested = false;
      try {
        const result = await DoRequests(N, R);
        requested = true;
        console.log('***');
        console.log(result);
        console.log('***');
        const fpath = path.resolve(__dirname, `siege-${N}-${R}.out`);
        fs.writeFileSync(fpath, result);
      } catch (error) {
        console.log('Could not run requests for', R);
        console.log(error);
        console.log('Continuing!');
      }
      console.log();
      console.log('REQUESTED:', requested);
    }
  }
}

if (require.main === module) {
  Main().then(() => process.exit(0));
}
