const fs = require('fs')

const Main = async () => {
  const fname = process.argv[2]
  const data = fs.readFileSync(fname, { encoding: 'utf-8' })
  let d = '';
  try {
    d = JSON.parse(data)
  } catch (err) {}

  if (!d) {
    d = JSON.parse(`${data}]`) // add end of array
  }

  const counter = {}
  const min = {}
  const max = {}
  const avg = {}
  for (const elem of d) {
    if (!counter[elem.T]) {
      counter[elem.T] = 0
      min[elem.T] = elem.B - elem.A
      avg[elem.T] = []
      max[elem.T] = elem.B - elem.A
    }

    counter[elem.T] += 1
    min[elem.T] = Math.min(min[elem.T], elem.B - elem.A)
    avg[elem.T].push(elem.B - elem.A)
    max[elem.T] = Math.max(max[elem.T], elem.B - elem.A)
  }

  for (const key in counter) {
    const endStr = counter[key] < 250 ? `, and there are ${250 - counter[key]} left` : ''
    console.log(`[${key}] - Found ${counter[key]} times` + endStr)
    console.log(`          `,
                `Min: ${min[key]}`.padEnd(20),
                `Avg: ${Math.round(avg[key].reduce((a, b) => a + b, 0) / avg[key].length)}`.padEnd(20),
                `Max: ${max[key]}`)
  }
}

if (require.main === module) {
  Main().then(() => process.exit(0))
}
