import fs from 'node:fs'

const p = process.argv[2] || 'C:/Users/Administrator/.dsh/profiles/desktop/node_modules/dsh-sidebar-organizer/lib/client.js'
const s = fs.readFileSync(p, 'utf8')
const start = s.indexOf('var CSS = [')
const end = s.indexOf('].join("")', start)
console.log('start', start, 'end', end)
const body = s.slice(start + 'var CSS = ['.length, end)
const after = s.slice(end, end + 60)
console.log('after:', JSON.stringify(after))
const re = /\n\s*"((?:[^"\\]|\\.)*)"/g
let out = ''
let m
while ((m = re.exec(body)) !== null) out += JSON.parse('"' + m[1] + '"')
console.log('css len', out.length)
console.log('has ord rule 1:', out.includes("[data-dso-ord='1']"))
console.log('idx of ord:', out.indexOf('[data-dso-ord]'))
console.log('braces', (out.match(/{/g) || []).length, (out.match(/}/g) || []).length)
console.log('tail:', JSON.stringify(out.slice(-200)))
