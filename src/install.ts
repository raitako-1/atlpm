import path from 'path'
import { ApiTypes, type AtlpmManifest } from './types'
import { genApi } from './codegen'
import { fetchAllSchemas } from './fetch'
import {
  applyFileDiff,
  genFileDiff,
  printFileDiff,
  readAllLexicons,
} from './util'

export async function install(
  manifest: AtlpmManifest,
  yes: boolean,
  dir?: string,
): Promise<void> {
  manifest.apiTypes = manifest.apiTypes ?? {}
  manifest.schemaDir = manifest.schemaDir ?? './lexicons'
  manifest.lexicons = manifest.lexicons ?? {}
  if (Object.keys(manifest.lexicons).length <= 0) return
  const schemaPath = dir ? path.join(dir, manifest.schemaDir) : path.resolve(manifest.schemaDir)

  const schemaFiles = await fetchAllSchemas(schemaPath, manifest.lexicons, manifest.apiTypes)
  const schemaDiff = genFileDiff(schemaPath, schemaFiles.all, '.json')
  await printFileDiff(schemaDiff, yes)
  applyFileDiff(schemaDiff)
  console.log('All schemas wrote.')

  for (const apiType of Object.keys(manifest.apiTypes)) {
    const schemaPaths: string[] = []
    for (const relativePath of schemaFiles.api[apiType]) schemaPaths.push(path.join(schemaPath, relativePath))
    const lexicons = readAllLexicons(schemaPaths)
    const api = await genApi(lexicons, apiType as keyof ApiTypes)
    const apiDiff = genFileDiff(manifest.apiTypes[apiType], api.files, '.ts')
    await printFileDiff(apiDiff, yes)
    applyFileDiff(apiDiff)
  }
  console.log('API generated.')
}
