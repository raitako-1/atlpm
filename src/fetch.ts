import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { Lexicons } from '@atproto/lexicon'
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
      console.error(chalk.red(`${nsid} is not NSID`))
      continue
    }
    console.log(`Fetch ${nsid}`)
    await fetchSchema(schemaPath, NSID.parse(nsid), registry)
      .then((schema) => {
        generatedSchema.all.push(schema)
        for (const apiType of Object.keys(generatedSchema.api)) generatedSchema.api[apiType].add(schema.path)
      })
  }
  const mainSchemaFiles = [...generatedSchema.all]
  console.log(`Fetch all dependencies`)
  for (const mainSchemaFile of mainSchemaFiles) {
    const nsid = mainSchemaFile.path.replace('.json', '').split('/').join('.')
    const registries: string[] = ['github']
    if (lexicons[nsid].endsWith('/') && !registries.includes(lexicons[nsid])) registries.push(lexicons[nsid])
    for (const registry of Object.values(lexicons)) {
      if (registry !== 'github' && registry !== 'local' && registry.endsWith('/') && !registries.includes(registry)) registries.push(registry)
    }
    if (!registries.includes('local')) registries.push('local')
    await getAllLexDependencies(schemaPath, generatedSchema, NSID.parse(nsid), mainSchemaFile.content, registries)
  }
  return generatedSchema
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
    readLexicon(str, schemaFullPath, nsid, outErr)
    return {path: schemaFileName, content: str}
  } else if (registry === 'github') {
    let url: URL
    const domain = Object.keys(registryData[registry]).find(domain => nsid.authority.endsWith(domain))
    if (domain) {
      url = await registryData[registry][domain].getUrl(nsid)
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
    readLexicon(str, url.href, nsid, outErr)
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
    readLexicon(str, url.href, nsid, outErr)
    return {path: schemaFileName, content: str}
  } else {
    if (outErr) console.error(chalk.red(`Unknown registry type: ${registry}`))
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
          if (inputDef.type === 'procedure' && inputDef.input?.schema) {
            if (inputDef.input.schema.type === 'ref') {
              imports.add(stripScheme(inputDef.input.schema.ref.split('#')[0]))
            } else if (inputDef.input.schema.type === 'union') {
              inputDef.input.schema.refs.map((ref) => imports.add(stripScheme(ref.split('#')[0])))
            } else {
              if (inputDef.input.schema.properties) {
                for (const propKey in inputDef.input.schema.properties) {
                  const propDef = inputDef.input.schema.properties[propKey]
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
            }
          }
          const outputDef = lexicons.getDefOrThrow(lexUri, ['query', 'subscription', 'procedure'])
          const schema = outputDef.type === 'subscription' ? outputDef.message?.schema : outputDef.output?.schema
          if (schema) {
            if (schema.type === 'ref') {
              imports.add(stripScheme(schema.ref.split('#')[0]))
            } else if (schema.type === 'union') {
              schema.refs.map((ref) => imports.add(stripScheme(ref.split('#')[0])))
            } else {
              if (schema.properties) {
                for (const propKey in schema.properties) {
                  const propDef = schema.properties[propKey]
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
            }
          }
        } else if (def.type === 'subscription') {
          if (apiType === 'TSClient') continue
          if (apiType === 'TSServer') {
            const outputDef = lexicons.getDefOrThrow(lexUri, ['query', 'subscription', 'procedure'])
            const schema = outputDef.type === 'subscription' ? outputDef.message?.schema : outputDef.output?.schema
            if (schema) {
              if (schema.type === 'ref') {
                imports.add(stripScheme(schema.ref.split('#')[0]))
              } else if (schema.type === 'union') {
                schema.refs.map((ref) => imports.add(stripScheme(ref.split('#')[0])))
              } else {
                if (schema.properties) {
                  for (const propKey in schema.properties) {
                    const propDef = schema.properties[propKey]
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
              }
            }
          }
        } else if (def.type === 'record') {
          const def = lexicons.getDefOrThrow(lexUri, ['record'])
          if (def.record.properties) {
            for (const propKey in def.record.properties) {
              const propDef = def.record.properties[propKey]
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
        } else {
          const def = lexicons.getDefOrThrow(lexUri)
          if (def.type === 'array') {
            if (def.items.type === 'ref') {
              imports.add(stripScheme(def.items.ref.split('#')[0]))
            } else if (def.items.type === 'union') {
              def.items.refs.map((ref) => imports.add(stripScheme(ref.split('#')[0])))
            }
          } else if (def.type === 'object') {
            if (def.properties) {
              for (const propKey in def.properties) {
                const propDef = def.properties[propKey]
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
          }
        }
      } else {
        const def = lexicons.getDefOrThrow(lexUri)
        if (def.type === 'array') {
          if (def.items.type === 'ref') {
            imports.add(stripScheme(def.items.ref.split('#')[0]))
          } else if (def.items.type === 'union') {
            def.items.refs.map((ref) => imports.add(stripScheme(ref.split('#')[0])))
          }
        } else if (def.type === 'object') {
          if (def.properties) {
            for (const propKey in def.properties) {
              const propDef = def.properties[propKey]
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
        }
      }
    }
    for (const importNsid of imports) {
      if (generatedSchema.all.every(file => file.path !== `${importNsid.split('.').join('/')}.json`)) {
        let i = 0
        for (const registry of registries) {
          try {
            const str = (await fetchSchema(schemaPath, NSID.parse(importNsid), registry)).content
            generatedSchema.all.push({path: `${importNsid.split('.').join('/')}.json`, content: str})
            await getAllLexDependencies(schemaPath, generatedSchema, NSID.parse(importNsid), str, registries)
            break
          } catch {
            i++
          }
        }
        if (i === registries.length) console.error(chalk.red(`${importNsid} could not be loaded in any registry!`))
      }
      generatedSchema.api[apiType].add(`${importNsid.split('.').join('/')}.json`)
    }
  }
}
