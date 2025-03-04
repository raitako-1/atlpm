import path from 'path'
import chalk from 'chalk'
import { NSID } from '@atproto/syntax'
import { GeneratedFile, AtlpmManifest } from './types'
import { genApi } from './codegen'
import {
  applyFileDiff,
  fetchSchemas,
  genFileDiff,
  getAllFiles,
  printFileDiff,
  readAllLexicons,
} from './util'

export async function install(
  manifest: AtlpmManifest,
  yes: boolean,
  dir?: string,
): Promise<void> {
  if (manifest.apiType !== 'TSClient' && manifest.apiType !== 'TSServer') {
    throw new Error('ERR_ATLPM_JSON', { cause: 'Invalid apiType in atlpm.json'})
  }
  manifest.schemaDir = manifest.schemaDir ?? './lexicons'
  manifest.outDir = manifest.outDir ?? './src/lexicon'
  manifest.lexicons = manifest.lexicons ?? {}
  if (Object.keys(manifest.lexicons).length <= 0) return
  const schemaPath = dir ? path.join(dir, manifest.schemaDir) : path.resolve(manifest.schemaDir)
  const outPath = dir ? path.join(dir, manifest.outDir) : path.resolve(manifest.outDir)

  const schemaFiles: GeneratedFile[] = []
  for (const [ nsid, registry ] of Object.entries(manifest.lexicons)) {
    if (!NSID.isValid(nsid)) {
      console.error(chalk.red(`${nsid} is not NSID`))
      continue
    }
    console.log(`Fetch ${nsid}`)
    await fetchSchemas(schemaFiles, NSID.parse(nsid), registry, schemaPath, manifest.apiType)
  }
  const schemaDiff = genFileDiff(schemaPath, schemaFiles)
  await printFileDiff(schemaDiff, yes)
  applyFileDiff(schemaDiff)
  console.log('All schemas wrote.')

  const schemaPaths = getAllFiles(schemaPath).filter(fn => fn.endsWith('.json'))
  const lexicons = readAllLexicons(schemaPaths)
  const api = await genApi(lexicons, manifest.apiType)
  const apiDiff = genFileDiff(outPath, api.files)
  await printFileDiff(apiDiff, yes)
  applyFileDiff(apiDiff)
  console.log('API generated.')
}
