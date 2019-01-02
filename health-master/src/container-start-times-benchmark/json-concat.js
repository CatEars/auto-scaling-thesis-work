const fs = require('fs')

const fnames = process.argv.slice(2)
let resultingArray = []

const readSingle = (fname) => {
  const data = fs.readFileSync(fname, { encoding: 'utf-8' })
  let d = ''
  try {
    d = JSON.parse(data)
  } catch (err) {}

  if (!d) {
    d = JSON.parse(data + ']')
  }

  return d
}

for (const fname of fnames) {
  resultingArray = resultingArray.concat(readSingle(fname))
}

console.log(JSON.stringify(resultingArray))
