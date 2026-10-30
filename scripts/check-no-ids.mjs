// Fails when a Sweed-style id is written into the storefront or server code. Sweed ids are 18 to 21 lowercase
// alphanumerics with at least one letter and one digit. Product, category, brand and promotion ids must come from the
// API at runtime (plan section 3a, rule 7). Tests and fixtures are not scanned.
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_DIRS = ['src', 'server']
const EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'])
const ALLOWLIST = new Set() // Nothing is allowed by default. Add "relative/path:line" only with a reason in review.
// A string literal (single, double or back quotes, no line breaks) holding a bare token of 18 to 21 lowercase alphanumerics.
const STRING = /(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g
const TOKEN = /^[a-z0-9]{18,21}$/
const hasLetter = (text) => /[a-z]/.test(text)
const hasDigit = (text) => /[0-9]/.test(text)

async function filesIn(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...await filesIn(path))
    else if (EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.'))) && !/\.test\.[cm]?jsx?$/.test(entry.name)) found.push(path)
  }
  return found
}

// Finds Sweed-style ids in the text of one file. Pure, so the unit test can call it with a sample.
export function findIdsInText(text, file) {
  const hits = []
  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(STRING)) {
      for (const token of match[2].split(/[\s,;:/?&=#]+/)) {
        if (TOKEN.test(token) && hasLetter(token) && hasDigit(token)) hits.push({ file, line: index + 1, token })
      }
    }
  })
  return hits.filter((hit) => !ALLOWLIST.has(`${hit.file}:${hit.line}`))
}

export async function findIds(files) {
  const hits = []
  for (const file of files) hits.push(...findIdsInText(await readFile(file, 'utf8'), relative(root, file)))
  return hits
}

async function main() {
  const files = []
  for (const dir of SCAN_DIRS) files.push(...await filesIn(join(root, dir)))
  const hits = await findIds(files)
  if (hits.length) {
    for (const hit of hits) console.error(`${hit.file}:${hit.line}: Sweed-style id in code: ${hit.token}`)
    console.error(`${hits.length} hardcoded id(s) found. Read them from the API instead (plan 3a, rule 1).`)
    process.exit(1)
  }
  console.log(`check:ids passed: ${files.length} files in ${SCAN_DIRS.join(', ')} have no hardcoded Sweed ids.`)
}

// Runs only as the entry point, so the test can import findIds.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main()
