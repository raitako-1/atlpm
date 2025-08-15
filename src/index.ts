#!/usr/bin/env node

import chalk from 'chalk'
import { Command } from 'commander'
import fs from 'fs'
import path from 'path'
import { AtpAgent } from '@atproto/api'
import { wait } from '@atproto/common'
import { LexiconDoc } from '@atproto/lexicon'
import { NSID } from '@atproto/syntax'
import { checkbox, editor, input, password as _password } from '@inquirer/prompts'
import { install } from './install'
import { type AtlpmManifest, registryData } from './types'
import { confirmOrExit, isRegistriedLex, readLexicon } from './util'
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
      if (registry === 'local' || registry === 'pds' || registry === 'github' || URL.canParse(registry)) {
        addLexicons[nsid] = registry
        if (registry === 'local' && !fs.existsSync(schemaPath) && !o.yes) await confirmOrExit('Are you sure you want to continue without write schema?', async () => {
          const schema = await editor({
            message: `Edit ${schemaPath}:`,
          })
          await fs.promises.mkdir(path.dirname(schemaPath), { recursive: true })
          fs.writeFileSync(schemaPath, schema)
        })
      } else if (await isRegistriedLex(NSID.parse(nsid))) {
        addLexicons[nsid] = 'pds'
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
  .command('publish')
  .description('Publishes a lexicon to the pds')
  .option('-C, --dir <path>', 'path of the current working directory', toPath)
  .argument('<nsid>', 'NSID')
  .action(async (nsid: string, o: {dir?: string}) => {
    if (!NSID.isValid(nsid)) {
      throw new Error('ERR_ATLPM_INVALID_NSID', { cause: `${nsid} is not NSID`})
    }
    const parsedNsid = NSID.parse(nsid)
    const schemaFullPath = path.resolve(await input({
      message: 'Enter a local path to lexicon schema file:',
      default: path.join(o.dir ?? process.cwd(), `lexicons/${parsedNsid.segments.join('/')}.json`),
    }))
    if (!fs.existsSync(schemaFullPath)) {
      throw new Error('ERR_ATLPM_SCHEMA_NO_EXISTS')
    }
    let schemaLexicon: LexiconDoc
    try {
      schemaLexicon = readLexicon(fs.readFileSync(schemaFullPath, 'utf8'), schemaFullPath)
      if (schemaLexicon.id !== parsedNsid.toString()) throw new Error()
    } catch {
      throw new Error('ERR_ATLPM_INVALID_SCHEMA')
    }
    schemaLexicon['$type'] = 'com.atproto.lexicon.schema'
    const identifier = await input({
      message: 'Enter your Bluesky identifier (ex. handle):',
      required: true,
    })
    const password = await _password({
      message: 'Enter your Bluesky password (preferably an App Password):',
    })
    const service = await input({
      message: 'Optionally, enter a custom PDS service to sign in with:',
      default: 'https://bsky.social',
    })
    const agent = new AtpAgent({service})
    await agent.login({identifier, password})
    await checkDns(parsedNsid, agent, true)
    console.log(`Put record to at://${agent.assertDid}/com.atproto.lexicon.schema/${nsid.toString()}`)
    const res = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: 'com.atproto.lexicon.schema',
      rkey: parsedNsid.toString(),
      validate: true,
      record: schemaLexicon,
    })
    if (!res.success) throw new Error('ERR_ATLPM_COULD_NOT_UPLOAD_SCHEMA')
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
    for (let delNsid of nsids.sort()) {
      if (!delNsid.includes(':')) delNsid = `:${delNsid}`
      const [nsid] = delNsid.split(':').slice(-1)
      if (!NSID.isValid(nsid)) {
        console.error(chalk.red(`${nsid} is not NSID`))
        continue
      }
      if (nsid in manifest.lexicons) {
        modtext += `\n ${chalk.redBright('-')} ${nsid}: ${manifest.lexicons[nsid]}`
        delete manifest.lexicons[nsid]
      } else {
        console.error(chalk.red(`${nsid} is not found from atlpm.json`))
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

const checkDns = async (nsid: NSID, agent: AtpAgent, sendMsg: boolean) => {
  try {
      const dnsRes: any = await (await fetch(`https://dns.google/resolve?name=_lexicon.${nsid.authority}&type=TXT`)).json()
      const dids = dnsRes.Answer.filter(v => v.data.startsWith('did=')).map(v => v.data.slice(4))
      if (!dids.includes(agent.assertDid)) throw new Error()
    } catch {
      if (sendMsg) {
        console.log(`\nAdd the following DNS record to your domain:\n  Host:  _lexicon\n  Type:  TXT\n  Value: did=${agent.assertDid}\nThis should create a domain record at: _lexicon.${nsid.authority}\n`)
        console.log('Waiting for reflection...')
      }
      await wait(5000)
      await checkDns(nsid, agent, false)
    }
}
