import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { Lexicons } from '@atproto/lexicon'
import { NSID } from '@atproto/syntax'
import { IndentationText, Project } from 'ts-morph'
import { ApiType, GeneratedFile, registryData } from './types'
import { readLexicon } from './util'
import {
  genRecord,
  genUserType,
  genXrpcInput,
  genXrpcOutput,
} from './codegen/lex-gen'

export async function fetchAllSchemas(
  schemaPath: string,
  lexicons: Record<string, string>,
  apiType: ApiType,
): Promise<GeneratedFile[]> {
  const schemaFiles: GeneratedFile[] = []
  for (const [ nsid, registry ] of Object.entries(lexicons)) {
    if (!NSID.isValid(nsid)) {
      console.error(chalk.red(`${nsid} is not NSID`))
      continue
    }
    console.log(`Fetch ${nsid}`)
    await fetchSchema(schemaPath, NSID.parse(nsid), registry)
      .then((schema) => schemaFiles.push(schema))
  }
  const mainSchemaFiles = [...schemaFiles]
  console.log(`Fetch all dependencies`)
  for (const mainSchemaFile of mainSchemaFiles) {
    const nsid = mainSchemaFile.path.replace('.json', '').split('/').join('.')
    const registries: string[] = ['github']
    if (lexicons[nsid].endsWith('/') && !registries.includes(lexicons[nsid])) registries.push(lexicons[nsid])
    for (const registry of Object.values(lexicons)) {
      if (registry !== 'github' && registry !== 'local' && registry.endsWith('/') && !registries.includes(registry)) registries.push(registry)
    }
    if (!registries.includes('local')) registries.push('local')
    await getAllLexDependencies(schemaPath, schemaFiles, NSID.parse(nsid), mainSchemaFile.content, apiType, registries)
  }
  return schemaFiles
}

const fetchSchema = async (schemaPath: string, nsid: NSID, registry: string, outErr: boolean = true): Promise<GeneratedFile> => {
  const schemaFileName = `${nsid.segments.join('/')}.json`
  const schemaFullPath = path.join(schemaPath, schemaFileName)
  if (registry === 'local') {
    console.log(chalk.gray(`Read ${schemaFullPath}`))
    let str: string
    try {
      str = fs.readFileSync(schemaFullPath, 'utf8')
    } catch (e) {
      if (outErr) console.error(chalk.red(`Failed to read file: ${schemaFullPath}`))
      throw e
    }
    readLexicon(str, schemaFullPath, outErr)
    return {path: schemaFileName, content: str}
  } else if (registry === 'github') {
    let url: URL
    const domain = Object.keys(registryData[registry]).find(domain => nsid.authority.endsWith(domain))
    if (domain) {
      url = registryData[registry][domain].getUrl(nsid)
    } else {
      if (outErr) console.error(chalk.red(`Unknown authority in github: ${nsid.authority}`))
      throw new Error('ERR_ATLPM_UNKNOWN_AUTHORITY', { cause: `Unknown authority in github: ${nsid.authority}`})
    }
    console.log(chalk.gray(`Get ${url.href}`))
    let str: string
    try {
      str = await (await fetch(url)).text()
    } catch (e) {
      if (outErr) console.error(chalk.red(`Failed to GET url: ${url.href}`))
      throw e
    }
    readLexicon(str, url.href, outErr)
    return {path: schemaFileName, content: str}
  } else if (URL.canParse(registry)) {
    let url: URL
    if (registry.endsWith('/')) {
      url = new URL(schemaFileName, registry)
    } else {
      url = new URL(registry)
    }
    console.log(chalk.gray(`Get ${url.href}`))
    let str: string
    try {
      str = await (await fetch(url)).text()
    } catch (e) {
      if (outErr) console.error(chalk.red(`Failed to GET url: ${url.href}`))
      throw e
    }
    readLexicon(str, url.href, outErr)
    return {path: schemaFileName, content: str}
  } else {
    if (outErr) console.error(chalk.red(`Unknown registry type: ${registry}`))
    throw new Error('ERR_ATLPM_UNKNOWN_REGISTRY', { cause: `Unknown registry type: ${registry}`})
  }
}

const getAllLexDependencies = async (schemaPath: string, schemaFiles: GeneratedFile[], nsid: NSID, content: string, apiType: ApiType, registries: string[]): Promise<void> => {
  const schemaFileName = `${nsid.segments.join('/')}.json`
  const schemaFullPath = path.join(schemaPath, schemaFileName)
  const lexiconDoc = readLexicon(content, schemaFullPath)
  const file = new Project({
      useInMemoryFileSystem: true,
      manipulationSettings: { indentationText: IndentationText.TwoSpaces },
    })
    .createSourceFile(`/types/${lexiconDoc.id.split('.').join('/')}.ts`)
  const imports: Set<string> = new Set()
  const lexicons = new Lexicons([lexiconDoc])
  for (const defId in lexiconDoc.defs) {
    const def = lexiconDoc.defs[defId]
    const lexUri = `${lexiconDoc.id}#${defId}`
    if (defId === 'main') {
      if (def.type === 'query' || def.type === 'procedure') {
        genXrpcInput(file, imports, lexicons, lexUri)
        genXrpcOutput(file, imports, lexicons, lexUri, false)
      } else if (def.type === 'subscription') {
        if (apiType === 'TSClient') continue
        if (apiType === 'TSServer') genXrpcOutput(file, imports, lexicons, lexUri, false)
      } else if (def.type === 'record') {
        genRecord(file, imports, lexicons, lexUri)
      } else {
        genUserType(file, imports, lexicons, lexUri)
      }
    } else {
      genUserType(file, imports, lexicons, lexUri)
    }
  }
  for (const importNsid of imports) {
    if (schemaFiles.every(file => file.path !== `${importNsid.split('.').join('/')}.json`)) {
      let i = 0
      for (const registry of registries) {
        try {
          const str = (await fetchSchema(schemaPath, NSID.parse(importNsid), registry, false)).content
          schemaFiles.push({path: `${importNsid.split('.').join('/')}.json`, content: str})
          await getAllLexDependencies(schemaPath, schemaFiles, NSID.parse(importNsid), str, apiType, registries)
          break
        } catch {
          i++
        }
      }
      if (i === registries.length) console.error(chalk.red(`${importNsid} could not be loaded in any registry!`))
    }
  }
}
