const { execSync } = require('child_process')
const fs = require('fs')
const sleep = require('sleep-promise')
const path = require('path')

const TenSeconds = 10000
const OneMinute = TenSeconds * 6
const ElevenMinutes = OneMinute * 11

// Setup values in ContainerValues.
// These are [0, X], [X-1, X], [X, 0] and [X, X-1] where 1 <= X <= 10
const ContainerValues = []
for (let X = 3; X <= 10; X++) {
  ContainerValues.push([0, X])
  ContainerValues.push([X, 0])
  ContainerValues.push([X - 1, X])
  ContainerValues.push([X, X - 1])
}

const ComposeFile = `docker-compose.yml`
const ServiceCMD = N => `docker service scale testback_imageproxy=${N}`
const StatusCMD = () => `docker service ls`

const Scale = async (N) => {
  const start = Date.now()
  const res = execSync(ServiceCMD(N), { encoding: 'utf-8' })
  console.log('**************')
  console.log(res)
  console.log('**************')
  return start
}

let filename = ''
const AppendNewData = (() => {
  filename = `output-${Date.now()}.json`
  const fpath = path.resolve(__dirname, filename)
  fs.writeFileSync(fpath, '[')
  let firstTime = true

  return (startTime, stopTime, startContainers, stopContainers) => {
    const obj = {
      "A": startTime, "B": stopTime, "T":`${startContainers}-${stopContainers}`
    }
    const lineToSave = (firstTime ? '' : ',') + JSON.stringify(obj)
    firstTime = false
    fs.appendFileSync(fpath, lineToSave)
  }
})()

const CloseFile = () => {
  fs.appendFileSync(path.resolve(__dirname, filename), ']')
}

const WaitUntilAt = async (N) => {
  let stdout = execSync(StatusCMD(), { encoding: 'utf-8' })
  while (!stdout.includes(`${N}/${N}`)) {
    stdout = execSync(StatusCMD(), { encoding: 'utf-8' })
  }
}

const SingleScale = async (start, target) => {
  await Scale(start);
  await WaitUntilAt(start);

  const startTime = await Scale(target)
  await WaitUntilAt(target)
  const endTime = Date.now()

  AppendNewData(startTime, endTime, start, target)
}

const ErrorPrint = (err) => {
  console.error(`******* Error *******`)
  console.error(err)
  console.error(`*******  End  *******`)
}

const Main = async () => {
  const repetitions = 250
  const reps = {}
  for (const [start, target] of ContainerValues) {
    reps[`${start}-${target}`] = repetitions
  }
  reps['0-3'] = 102;
  const printFrequency = 10
  const sleepFrequency = 50

  for (const [start, target] of ContainerValues) {
    console.log(`[start=${start}, target=${target}]`)
    const key = `${start}-${target}`

    for (let rep = 0; rep < reps[key]; rep++) {
      if (rep % printFrequency === 0) {
        console.log(`At Repetition #${rep}`)
      }

      try {
        if (rep && rep % sleepFrequency === 0) {
          // This sleep tries to make sure that docker is able to congest everything properly
          execSync(`service docker restart`)
          await sleep(2 * OneMinute)
        }
      } catch (err) {
        console.error(`Error when restarting docker service [${start}, ${target}]@${rep}`)
        ErrorPrint(err)
      }

      try {
        await SingleScale(start, target)
      } catch (err) {
        console.error(`Error when processing [${start}, ${target}]@${rep}`)
        ErrorPrint(err)
      }
    }

  }

  CloseFile()
}

if (require.main === module) {
  Main().then(() => process.exit(0))
}
