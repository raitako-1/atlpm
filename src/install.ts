import path from 'path'
import { AtlpmManifest } from './types'
import { genApi } from './codegen'
import { fetchAllSchemas } from './fetch'
import {
  applyFileDiff,
  genFileDiff,
  printFileDiff,
  readAllLexicons,
  readdirRecursiveSync,
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

  const schemaFiles = await fetchAllSchemas(schemaPath, manifest.lexicons, manifest.apiType)
  const schemaDiff = genFileDiff(schemaPath, schemaFiles, '.json')
  await printFileDiff(schemaDiff, yes)
  applyFileDiff(schemaDiff)
  console.log('All schemas wrote.')

  const schemaPaths = readdirRecursiveSync(schemaPath, '.json')
  const lexicons = readAllLexicons(schemaPaths)
  const api = await genApi(lexicons, manifest.apiType)
  const apiDiff = genFileDiff(outPath, api.files, '.ts')
  await printFileDiff(apiDiff, yes)
  applyFileDiff(apiDiff)
  console.log('API generated.')
}
