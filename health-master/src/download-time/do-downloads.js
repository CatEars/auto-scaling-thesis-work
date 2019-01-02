const fs = require('fs');
const DockerName = `briteback/image-proxy:workloadtest_1.0.0`
const { execSync } = require('child_process');

const N = 100;
const OutputFile = `output.txt`;

const DoDelete = () => {
  execSync(`docker rmi ${DockerName}`);
}

const DoPull = () => {
  const start = Date.now();
  execSync(`docker pull ${DockerName}`);
  const end = Date.now();
  return [start, end];
}

const Main = () => {
  DoDelete();
  for (let i = 0; i < N; ++i) {
    const [start, end] = DoPull();
    const ToLog = `(((${i}, ${start}, ${end})))\n`;
    console.log(ToLog);
    fs.appendFileSync(OutputFile, ToLog);
    DoDelete();
  }
}


if (require.main === module) {
  Main();
}
