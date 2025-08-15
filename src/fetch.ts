import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { AtpAgent } from '@atproto/api'
import { IdResolver } from '@atproto/identity'
import { Lexicons, type LexiconDoc, parseLexiconDoc } from '@atproto/lexicon'
import { NSID } from '@atproto/syntax'
import { type ApiTypes, type GeneratedFile, type GeneratedSchema, registryData } from './types'
import { readLexicon } from './util'
import {
  stripScheme,
} from './codegen/lex-gen'

export async function fetchAllSchemas(
  schemaPath: string,
  lexicons: Record<string, string>,
  apiTypes: ApiTypes,
): Promise<GeneratedSchema> {
  const generatedSchema: GeneratedSchema = {all: [], api: {}}
  for (const apiType of Object.keys(apiTypes)) generatedSchema.api[apiType] = new Set()
  for (const [ nsid, registry ] of Object.entries(lexicons)) {
    if (!NSID.isValid(nsid)) {
      console.error(chalk.red(`\x1b[2K${nsid} is not NSID`))
      continue
    }
    console.log(`\x1b[2KResolve ${nsid}`)
    await fetchSchema(schemaPath, NSID.parse(nsid), registry)
      .then((schema) => {
        generatedSchema.all.push(schema)
        for (const apiType of Object.keys(generatedSchema.api)) generatedSchema.api[apiType].add(schema.path)
      })
  }
  const mainSchemaFiles = [...generatedSchema.all]
  console.log(`\x1b[2KResolve all dependencies`)
  for (const mainSchemaFile of mainSchemaFiles) {
    const nsid = mainSchemaFile.path.replace('.json', '').split('/').join('.')
    const registries: string[] = ['pds', 'github']
    if (lexicons[nsid].endsWith('/') && !registries.includes(lexicons[nsid])) registries.push(lexicons[nsid])
    for (const registry of Object.values(lexicons)) {
      if (registry !== 'github' && registry !== 'local' && registry.endsWith('/') && !registries.includes(registry)) registries.push(registry)
    }
    if (!registries.includes('local')) registries.push('local')
    await getAllLexDependencies(schemaPath, generatedSchema, NSID.parse(nsid), mainSchemaFile.content, registries)
  }
  process.stdout.write('\x1b[2K')
  return generatedSchema
}

const fetchSchema = async (schemaPath: string, nsid: NSID, registry: string, outErr: boolean = true): Promise<GeneratedFile> => {
  const schemaFileName = `${nsid.segments.join('/')}.json`
  const schemaFullPath = path.join(schemaPath, schemaFileName)
  if (registry === 'local') {
    process.stdout.write(chalk.gray(`\x1b[2KRead for ${schemaFullPath}\r`))
    let str: string
    try {
      str = fs.readFileSync(schemaFullPath, 'utf8')
    } catch (e) {
      if (outErr) console.error(chalk.red(`\x1b[2KFailed to read file: ${schemaFullPath}`))
      throw e
    }
    readLexicon(str, schemaFullPath, nsid, outErr)
    return {path: schemaFileName, content: str}
  } else if (registry === 'pds') {
    let dids: string[]
    try {
      process.stdout.write(chalk.gray(`\x1b[2KSearch did for _lexicon.${nsid.authority}\r`))
      const dnsRes: any = await (await fetch(`https://dns.google/resolve?name=_lexicon.${nsid.authority}&type=TXT`)).json()
      dids = dnsRes.Answer.filter(v => v.data.startsWith('did=')).map(v => v.data.slice(4))
      if (dids.length === 0) throw new Error()
    } catch (e) {
      if (outErr) console.error(chalk.red(`\x1b[2KNot found did for _lexicon.${nsid.authority}`))
      throw e
    }
    const idResolver = new IdResolver()
    const records: LexiconDoc[] = []
    for (const did of dids) {
      process.stdout.write(chalk.gray(`\x1b[2KGet DidDocument for ${did}\r`))
      const didDoc = await idResolver.did.resolve(did)
      if (!didDoc?.service) {
        if (outErr) console.error(chalk.red(`\x1b[2K${did} has no service`))
        continue
      }
      for (const {serviceEndpoint} of didDoc.service) {
        if (typeof serviceEndpoint !== 'string') {
          if (outErr) console.error(chalk.red(`\x1b[2K${did} has invalid service`))
          continue
        }
        const uri = `at://${did}/com.atproto.lexicon.schema/${nsid.toString()}`
        let xrpcRes: any
        try {
          process.stdout.write(chalk.gray(`\x1b[2KGet record for ${uri}\r`))
          const agent = new AtpAgent({service: serviceEndpoint})
          xrpcRes = await agent.com.atproto.repo.getRecord({repo: did, collection: 'com.atproto.lexicon.schema', rkey: nsid.toString()})
        } catch {
          if (outErr) console.error(chalk.red(`\x1b[2KCould not get record for ${uri}`))
          continue
        }
        try {
          delete xrpcRes.data.value['$type']
          const lexiconDoc = parseLexiconDoc(xrpcRes.data.value)
          records.push(lexiconDoc)
        } catch {
          if (outErr) console.error(chalk.red(`\x1b[2K${uri} is invalid lexicon`))
          continue
        }
      }
    }
    if (records.length === 0) throw new Error('ERR_ATLPM_NOTFOUND_LEXICON', {cause: `Could not get lexicon at all`})
    return {path: schemaFileName, content: JSON.stringify(records[0], undefined, 2)}
  } else if (registry === 'github') {
    let url: URL
    const domain = Object.keys(registryData[registry]).find(domain => nsid.authority.endsWith(domain))
    if (domain) {
      url = await registryData[registry][domain].getUrl(nsid)
    } else {
      if (outErr) console.error(chalk.red(`\x1b[2KUnknown authority in github: ${nsid.authority}`))
      throw new Error('ERR_ATLPM_UNKNOWN_AUTHORITY', { cause: `Unknown authority in github: ${nsid.authority}`})
    }
    process.stdout.write(chalk.gray(`\x1b[2KGet schema for ${url.href}\r`))
    let str: string
    try {
      str = await (await fetch(url)).text()
    } catch (e) {
      if (outErr) console.error(chalk.red(`\x1b[2KFailed to GET url: ${url.href}`))
      throw e
    }
    readLexicon(str, url.href, nsid, outErr)
    return {path: schemaFileName, content: str}
  } else if (URL.canParse(registry)) {
    let url: URL
    if (registry.endsWith('/')) {
      url = new URL(schemaFileName, registry)
    } else {
      url = new URL(registry)
    }
    process.stdout.write(chalk.gray(`\x1b[2KGet schema for ${url.href}\r`))
    let str: string
    try {
      str = await (await fetch(url)).text()
    } catch (e) {
      if (outErr) console.error(chalk.red(`\x1b[2KFailed to GET url: ${url.href}`))
      throw e
    }
    readLexicon(str, url.href, nsid, outErr)
    return {path: schemaFileName, content: str}
  } else {
    if (outErr) console.error(chalk.red(`\x1b[2KUnknown registry type: ${registry}`))
    throw new Error('ERR_ATLPM_UNKNOWN_REGISTRY', { cause: `Unknown registry type: ${registry}`})
  }
}

const getAllLexDependencies = async (schemaPath: string, generatedSchema: GeneratedSchema, nsid: NSID, content: string, registries: string[]): Promise<void> => {
  const schemaFileName = `${nsid.segments.join('/')}.json`
  const schemaFullPath = path.join(schemaPath, schemaFileName)
  const lexiconDoc = readLexicon(content, schemaFullPath, nsid)
  for (const apiType of Object.keys(generatedSchema.api)) {
    const imports: Set<string> = new Set()
    const lexicons = new Lexicons([lexiconDoc])
    for (const defId in lexiconDoc.defs) {
      const def = lexiconDoc.defs[defId]
      const lexUri = `${lexiconDoc.id}#${defId}`
      if (defId === 'main') {
        if (def.type === 'query' || def.type === 'procedure') {
          const inputDef = lexicons.getDefOrThrow(lexUri, ['query', 'procedure'])
          if (inputDef.type === 'procedure' && inputDef.input?.schema) getImportFromSchema(inputDef.input.schema, imports)
          const outputDef = lexicons.getDefOrThrow(lexUri, ['query', 'subscription', 'procedure'])
          const schema = outputDef.type === 'subscription' ? outputDef.message?.schema : outputDef.output?.schema
          if (schema) getImportFromSchema(schema, imports)
        } else if (def.type === 'subscription') {
          if (apiType === 'TSClient') continue
          if (apiType === 'TSServer') {
            const outputDef = lexicons.getDefOrThrow(lexUri, ['query', 'subscription', 'procedure'])
            const schema = outputDef.type === 'subscription' ? outputDef.message?.schema : outputDef.output?.schema
            if (schema) getImportFromSchema(schema, imports)
          }
        } else if (def.type === 'record') {
          const def = lexicons.getDefOrThrow(lexUri, ['record'])
          if (def.record.properties) getImportFromProperties(def.record.properties, imports)
        } else {
          const def = lexicons.getDefOrThrow(lexUri)
          getImportFromOtherDef(def, imports)
        }
      } else {
        const def = lexicons.getDefOrThrow(lexUri)
        getImportFromOtherDef(def, imports)
      }
    }
    for (const importNsid of imports) {
      if (generatedSchema.all.every(file => file.path !== `${importNsid.split('.').join('/')}.json`)) {
        let i = 0
        for (const registry of registries) {
          try {
            console.log(chalk.gray(`\x1b[2KResolve ${nsid}`))
            const str = (await fetchSchema(schemaPath, NSID.parse(importNsid), registry)).content
            generatedSchema.all.push({path: `${importNsid.split('.').join('/')}.json`, content: str})
            await getAllLexDependencies(schemaPath, generatedSchema, NSID.parse(importNsid), str, registries)
            break
          } catch {
            i++
          }
        }
        if (i === registries.length) console.error(chalk.red(`\x1b[2K${importNsid} could not be loaded in any registry!`))
      }
      generatedSchema.api[apiType].add(`${importNsid.split('.').join('/')}.json`)
    }
  }
}

const getImportFromSchema = (schema, imports: Set<string>) => {
  if (schema.type === 'ref') {
    imports.add(stripScheme(schema.ref.split('#')[0]))
  } else if (schema.type === 'union') {
    schema.refs.map((ref) => imports.add(stripScheme(ref.split('#')[0])))
  } else {
    if (schema.properties) getImportFromProperties(schema.properties, imports)
  }
}

const getImportFromOtherDef = (def, imports: Set<string>) => {
  if (def.type === 'array') {
    if (def.items.type === 'ref') {
      imports.add(stripScheme(def.items.ref.split('#')[0]))
    } else if (def.items.type === 'union') {
      def.items.refs.map((ref) => imports.add(stripScheme(ref.split('#')[0])))
    }
  } else if (def.type === 'object') {
    if (def.properties) getImportFromProperties(def.properties, imports)
  }
}

const getImportFromProperties = (properties, imports: Set<string>) => {
  for (const propKey in properties) {
    const propDef = properties[propKey]
    if (propDef.type === 'ref') {
      imports.add(stripScheme(propDef.ref.split('#')[0]))
    } else if (propDef.type === 'union') {
      propDef.refs.map((ref) => imports.add(stripScheme(ref.split('#')[0])))
    } else {
      if (propDef.type === 'array') {
        if (propDef.items.type === 'ref') {
          imports.add(stripScheme(propDef.items.ref.split('#')[0]))
        } else if (propDef.items.type === 'union') {
          propDef.items.refs.map((ref) => imports.add(stripScheme(ref.split('#')[0])))
        }
      }
    }
  }
}
