#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { Command } from 'commander'
import { NSID } from '@atproto/syntax'
import { checkbox, editor, input } from '@inquirer/prompts'
import { install } from './install'
import { type AtlpmManifest, registryData } from './types'
import { confirmOrExit } from './util'
import * as pkg from '../package.json'

const program = new Command()
program.name(pkg.name).description(pkg.description).version(pkg.version)

program
  .command('add')
  .description('Adds lexicons')
  .option('-C, --dir <path>', 'path of the current working directory', toPath)
  .option('-y, --yes', 'skip confirmation')
  .argument('<schemas...>', '<registry(local or github or url)>:<NSID>')
  .action(async (schemas: string[], o: {dir?: string, yes?: true}) => {
    const manifestPath = path.join(o.dir ?? process.cwd(), 'atlpm.json')
    if (!fs.existsSync(manifestPath)) {
      throw new Error('ERR_ATLPM_JSON_NO_EXISTS', { cause: `atlpm.json no exists. Try to run \`atlpm init${o.dir ? ` --dir ${o.dir}` :''}\`` })
    }
    const manifest: AtlpmManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    manifest.lexicons = manifest.lexicons ?? {}
    const addLexicons: Record<string, string> = {}
    for (let schema of schemas) {
      if (!schema.includes(':')) schema = `:${schema}`
      const nsid = schema.split(':')[schema.split(':').length - 1]
      if (!NSID.isValid(nsid)) {
        console.error(chalk.red(`${nsid} is not NSID`))
        continue
      }
      const registry = schema.replace(/:[a-zA-Z]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(\.[a-zA-Z]([a-zA-Z]{0,61}[a-zA-Z])?)$/, '')
      const schemaPath = path.join(o.dir ? path.join(o.dir, manifest.schemaDir ?? './lexicons') : path.resolve(manifest.schemaDir ?? './lexicons'), `${nsid.split('.').join('/')}.json`)
      if (registry === 'local') {
        addLexicons[nsid] = registry
        if (!fs.existsSync(schemaPath) && !o.yes) await confirmOrExit('Are you sure you want to continue without write schema?', async () => {
          const schema = await editor({
            message: `Edit ${schemaPath}:`,
          })
          await fs.promises.mkdir(path.dirname(schemaPath), { recursive: true })
          fs.writeFileSync(schemaPath, schema)
        })
      } else if (registry === 'github' || URL.canParse(registry)) {
        addLexicons[nsid] = registry
      } else if (Object.keys(registryData.github).some(domain => NSID.parse(nsid).authority.endsWith(domain))) {
          addLexicons[nsid] = 'github'
      } else if (fs.existsSync(schemaPath)) {
        addLexicons[nsid] = 'local'
      } else {
        console.error(chalk.red(`${registry ? `${registry}:`: ''}${nsid} is an unknown registry type.`))
        continue
      }
    }
    let modtext = chalk.cyanBright('lexicons:')
    for (const addNsid of Object.keys(addLexicons).sort()) {
      if (addNsid in manifest.lexicons) {
        if (addLexicons[addNsid] !== manifest.lexicons[addNsid]) {
          manifest.lexicons[addNsid] = addLexicons[addNsid]
          modtext += `\n ${chalk.yellowBright('*')} ${addNsid}: ${addLexicons[addNsid]}`
        }
      } else {
        manifest.lexicons[addNsid] = addLexicons[addNsid]
        modtext += `\n ${chalk.greenBright('+')} ${addNsid}: ${addLexicons[addNsid]}`
      }
    }
    if (modtext.split('\n').length > 1) console.log(modtext)
    manifest.lexicons = Object.keys(manifest.lexicons).sort().reduce((object, key) => {
      if (manifest.lexicons) object[key] = manifest.lexicons[key]
      return object
    }, {})
    await fs.promises.mkdir(path.dirname(manifestPath), { recursive: true })
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
    console.log(`Wrote to ${manifestPath}`)
    await install(manifest, o.yes ? true : false, o.dir)
    console.log('Done!')
  })

program
  .command('init')
  .description('Creates a atlpm.json file')
  .option('-C, --dir <path>', 'path of the current working directory', toPath)
  .action(async (o: {dir?: string}) => {
    const manifestPath = path.join(o.dir ?? process.cwd(), 'atlpm.json')
    if (fs.existsSync(manifestPath)) {
      throw new Error('ERR_ATLPM_JSON_EXISTS', { cause: 'atlpm.json already exists' })
    }
    const manifest: AtlpmManifest = {
      apiTypes: {},
    }
    const apiTypes = await checkbox({
      message: 'Choose the type of API when codegen:',
      choices: [
        {
          name: 'TypeScript Client API',
          value: 'TSClient',
        },
        {
          name: 'TypeScript Server API',
          value: 'TSServer',
        },
      ],
    })
    for (const apiType of apiTypes) {
      if (manifest.apiTypes) {
        if (apiType === 'TSClient') {
          manifest.apiTypes.TSClient = await input({
            message: 'Enter a local path to TypeScript Client API folder:',
            default: apiTypes.length > 1 ? './src/lexicon/client' : './src/client',
          })
        } else if (apiType === 'TSServer') {
          manifest.apiTypes.TSServer = await input({
            message: 'Enter a local path to TypeScript Server API folder:',
            default: apiTypes.length > 1 ? './src/lexicon/server' : './src/lexicon',
          })
        }
      }
    }
    manifest.schemaDir = await input({
      message: 'Enter a local path to lexicons folder:',
      default: './lexicons',
    })
    manifest.lexicons = {}
    await fs.promises.mkdir(path.dirname(manifestPath), { recursive: true })
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
    console.log(`Wrote to ${manifestPath}

${JSON.stringify(manifest, null, 2)}`)
    console.log('Done!')
  })

program
  .command('install')
  .option('-C, --dir <path>', 'path of the current working directory', toPath)
  .option('-y, --yes', 'skip confirmation')
  .description('Fetch and codegen all lexicons')
  .action(async (o: {dir?: string, yes?: true}) => {
    const manifestPath = path.join(o.dir ?? process.cwd(), 'atlpm.json')
    if (!fs.existsSync(manifestPath)) {
      throw new Error('ERR_ATLPM_JSON_NO_EXISTS', { cause: `atlpm.json no exists. Try to run \`atlpm init${o.dir ? ` --dir ${o.dir}` :''}\`` })
    }
    const manifest: AtlpmManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    await install(manifest, o.yes ? true : false, o.dir)
    console.log('Done!')
  })

program
  .command('remove')
  .option('-C, --dir <path>', 'path of the current working directory', toPath)
  .option('-y, --yes', 'skip confirmation')
  .description('Removes lexicons')
  .argument('<nsids...>', 'NSIDs')
  .action(async (nsids: string[], o: {dir?: string, yes?: true}) => {
    const manifestPath = path.join(o.dir ?? process.cwd(), 'atlpm.json')
    if (!fs.existsSync(manifestPath)) {
      throw new Error('ERR_ATLPM_JSON_NO_EXISTS', { cause: `atlpm.json no exists. Try to run \`atlpm init${o.dir ? ` --dir ${o.dir}` :''}\`` })
    }
    const manifest: AtlpmManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    manifest.lexicons = manifest.lexicons ?? {}
    let modtext = chalk.cyanBright('lexicons:')
    for (const delNsid of nsids.sort()) {
      if (delNsid in manifest.lexicons) {
        modtext += `\n ${chalk.redBright('-')} ${delNsid}: ${manifest.lexicons[delNsid]}`
        delete manifest.lexicons[delNsid]
      }
    }
    if (modtext.split('\n').length > 1) console.log(modtext)
    manifest.lexicons = Object.keys(manifest.lexicons).sort().reduce((object, key) => {
      if (manifest.lexicons) object[key] = manifest.lexicons[key]
      return object
    }, {})
    await fs.promises.mkdir(path.dirname(manifestPath), { recursive: true })
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
    console.log(`Wrote to ${manifestPath}`)
    await install(manifest, o.yes ? true : false, o.dir)
    console.log('Done!')
  })

program.parse()

function toPath(v: string) {
  return v ? path.resolve(v) : undefined
}
