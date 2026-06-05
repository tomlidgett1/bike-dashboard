import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import zlib from 'node:zlib'

const distDir = process.env.NEXT_DIST_DIR || '.next-profile'
const route = '/marketplace/page'
const require = createRequire(import.meta.url)

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function chunkFilesFromChunks(chunks = []) {
  return chunks.filter(
    (chunk) =>
      typeof chunk === 'string' &&
      chunk.startsWith('static/') &&
      (chunk.endsWith('.js') || chunk.endsWith('.css')),
  )
}

function fileStats(files) {
  let raw = 0
  let gzip = 0
  let brotli = 0

  const rows = files
    .map((file) => {
      const filePath = path.join(distDir, file)
      const bytes = fs.existsSync(filePath) ? fs.readFileSync(filePath) : Buffer.alloc(0)
      raw += bytes.length
      gzip += zlib.gzipSync(bytes).length
      brotli += zlib.brotliCompressSync(bytes).length
      return { file, raw: bytes.length }
    })
    .sort((a, b) => b.raw - a.raw)

  return { raw, gzip, brotli, rows }
}

function formatKb(bytes) {
  return `${Math.round(bytes / 1024)} KB`
}

function printSection(label, files) {
  const stats = fileStats(files)
  console.log(`${label}`)
  console.log(`files: ${files.length}`)
  console.log(`raw: ${formatKb(stats.raw)}`)
  console.log(`gzip: ${formatKb(stats.gzip)}`)
  console.log(`brotli: ${formatKb(stats.brotli)}`)
  console.log('largest files:')
  for (const row of stats.rows.slice(0, 12)) {
    console.log(`${String(Math.round(row.raw / 1024)).padStart(4)} KB  ${row.file}`)
  }
  console.log('')
  return stats
}

function getFilesFromLegacyAppManifest() {
  const manifestPath = path.join(distDir, 'app-build-manifest.json')
  if (!fs.existsSync(manifestPath)) return null

  const manifest = loadJson(manifestPath)
  const files = manifest.pages?.[route]
  return files?.length ? { jsFiles: files.filter((file) => file.endsWith('.js')), cssFiles: files.filter((file) => file.endsWith('.css')) } : null
}

function getFilesFromClientReferenceManifest() {
  const manifestPath = path.join(distDir, 'server/app/marketplace/page_client-reference-manifest.js')
  const buildManifestPath = path.join(distDir, 'build-manifest.json')

  if (!fs.existsSync(manifestPath) || !fs.existsSync(buildManifestPath)) return null

  globalThis.__RSC_MANIFEST = {}
  require(path.resolve(manifestPath))
  const manifest = globalThis.__RSC_MANIFEST?.[route]
  if (!manifest) return null

  const buildManifest = loadJson(buildManifestPath)
  const initialJs = new Set((buildManifest.rootMainFiles || []).filter((file) => file.endsWith('.js')))
  const initialCss = new Set()
  const asyncJs = new Set()

  for (const clientModule of Object.values(manifest.clientModules || {})) {
    const target = clientModule.async ? asyncJs : initialJs
    for (const file of chunkFilesFromChunks(clientModule.chunks)) {
      if (file.endsWith('.css')) {
        if (!clientModule.async) initialCss.add(file)
      } else {
        target.add(file)
      }
    }
  }

  for (const entries of Object.values(manifest.entryCSSFiles || {})) {
    for (const entry of entries || []) {
      if (entry?.path) initialCss.add(entry.path)
    }
  }

  return {
    jsFiles: [...initialJs].sort(),
    cssFiles: [...initialCss].sort(),
    asyncJsFiles: [...asyncJs].sort(),
  }
}

const result = getFilesFromLegacyAppManifest() || getFilesFromClientReferenceManifest()

if (!result) {
  console.error(`[bundle] Could not find marketplace bundle data in ${distDir}. Run npm run build:profile first.`)
  process.exit(1)
}

console.log(`Marketplace bundle (${route})`)
const jsStats = printSection('initial JS', result.jsFiles)
const cssStats = printSection('initial CSS', result.cssFiles || [])

if (result.asyncJsFiles?.length) {
  printSection('async JS chunks referenced by route (not counted in initial JS)', result.asyncJsFiles)
}

console.log(
  `initial transfer estimate: ${formatKb(jsStats.gzip + cssStats.gzip)} gzip, ${formatKb(jsStats.brotli + cssStats.brotli)} brotli`,
)
