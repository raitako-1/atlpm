import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { ZodError, type ZodFormattedError } from 'zod'
import { AtpAgent } from '@atproto/api'
import { IdResolver } from '@atproto/identity'
import { type LexiconDoc, parseLexiconDoc } from '@atproto/lexicon'
import { NSID } from '@atproto/syntax'
import { confirm } from '@inquirer/prompts'
import { type FileDiff, type GeneratedFile } from './types'

export async function confirmOrExit(message: string, noFn?: () => Promise<void>) {
  const answer = await confirm({
    message,
    default: false,
  })
  if (!answer) {
    if (noFn) {
      await noFn()
    } else {
      console.log('Aborted.')
      process.exit(0)
    }
  }
}

export function readAllLexicons(paths: string[]): LexiconDoc[] {
  paths = [...paths].sort() // incoming path order may have come from locale-dependent shell globs
  const docs: LexiconDoc[] = []
  for (const path of paths) {
    if (!path.endsWith('.json') || !fs.statSync(path).isFile()) {
      continue
    }
    try {
      let str: string
      try {
        str = fs.readFileSync(path, 'utf8')
      } catch (e) {
        console.error(chalk.red(`Failed to read file: ${path}`))
        throw e
      }
      docs.push(readLexicon(str, path))
    } catch (e) {
      // skip
    }
  }
  return docs
}

export function readLexicon(str: string, path: string, nsid?: NSID, outErr: boolean = true): LexiconDoc {
  let obj: unknown
  try {
    obj = JSON.parse(str)
  } catch (e) {
    if (outErr) console.error(chalk.red(`Failed to parse JSON in file: ${path}`))
    throw e
  }
  if (!nsid) nsid = NSID.parse((obj as LexiconDoc).id)
  if (
    obj &&
    typeof obj === 'object' &&
    typeof (obj as LexiconDoc).lexicon === 'number'&&
    (obj as LexiconDoc).id === nsid.toString()
  ) {
    try {
      return parseLexiconDoc(obj)
    } catch (e) {
      if (outErr) console.error(chalk.red(`Invalid lexicon: ${path}`))
      if (e instanceof ZodError) {
        printZodError(e.format())
      }
      throw e
    }
  } else {
    if (outErr) console.error(chalk.red(`Not lexicon schema: ${path}`))
    throw new Error(`Not lexicon schema`)
  }
}

export function genFileDiff(outDir: string, files: GeneratedFile[], endWith: string) {
  const diffs: FileDiff[] = []
  const existingFiles = readdirRecursiveSync(outDir, endWith)

  for (const file of files) {
    file.path = path.join(outDir, file.path)
    if (existingFiles.includes(file.path)) {
      if (file.content !== fs.readFileSync(file.path, 'utf8')) diffs.push({ act: 'mod', path: file.path, content: file.content })
    } else {
      diffs.push({ act: 'add', path: file.path, content: file.content })
    }
  }
  for (const filepath of existingFiles) {
    if (files.find((f) => f.path === filepath)) {
      // do nothing
    } else {
      diffs.push({ act: 'del', path: filepath })
    }
  }

  return diffs
}

export async function printFileDiff(diff: FileDiff[], yes: boolean) {
  let modtext = 'This will write the following files:'
  for (const d of diff) {
    switch (d.act) {
      case 'add':
        modtext += `\n${chalk.greenBright('[+ add]')} ${d.path}`
        break
      case 'mod':
        modtext += `\n${chalk.yellowBright('[* mod]')} ${d.path}`
        break
      case 'del':
        modtext += `\n${chalk.redBright('[- del]')} ${d.path}`
        break
    }
  }
  if (modtext.split('\n').length > 1) {
    console.log(modtext)
    if (!yes) await confirmOrExit('Are you sure you want to continue?')
  } else {
    console.log('No changes were made to the files.')
  }
}

export function applyFileDiff(diff: FileDiff[]) {
  for (const d of diff) {
    switch (d.act) {
      case 'add':
      case 'mod':
        fs.mkdirSync(path.join(d.path, '..'), { recursive: true }) // lazy way to make sure the parent dir exists
        fs.writeFileSync(d.path, d.content || '', 'utf8')
        break
      case 'del':
        fs.unlinkSync(d.path)
        break
    }
  }
}

function printZodError(node: ZodFormattedError<any>, path = ''): boolean {
  if (node._errors?.length) {
    console.log(chalk.red(`Issues at ${path}:`))
    for (const err of dedup(node._errors)) {
      console.log(chalk.red(` - ${err}`))
    }
    return true
  } else {
    for (const k in node) {
      if (k === '_errors') {
        continue
      }
      printZodError(node[k], `${path}/${k}`)
    }
  }
  return false
}

function readdirRecursiveSync(root: string, endWith: string, files: string[] = [], prefix = ''): string[] {
  const dir = path.join(root, prefix)
  if (!fs.existsSync(dir)) return files
  if (fs.statSync(dir).isDirectory())
    fs.readdirSync(dir).forEach(function (name) {
      readdirRecursiveSync(root, endWith, files, path.join(prefix, name))
    })
  else if (prefix.endsWith(endWith)) {
    files.push(path.join(root, prefix))
  }

  return files
}

function dedup(arr: string[]): string[] {
  return Array.from(new Set(arr))
}

export const isRegistriedLex = async (nsid: NSID): Promise<boolean> => {
  let dids: string[]
  try {
    const dnsRes: any = await (await fetch(`https://dns.google/resolve?name=_lexicon.${nsid.authority}&type=TXT`)).json()
    dids = dnsRes.Answer.filter(v => v.data.startsWith('did=')).map(v => v.data.slice(4))
  } catch {
    return false
  }
  const idResolver = new IdResolver()
  const records: LexiconDoc[] = []
  for (const did of dids) {
    const didDoc = await idResolver.did.resolve(did)
    if (!didDoc?.service) {
      continue
    }
    for (const {serviceEndpoint} of didDoc.service) {
      if (typeof serviceEndpoint !== 'string') {
        continue
      }
      try {
        const agent = new AtpAgent({service: serviceEndpoint})
        const xrpcRes = await agent.com.atproto.repo.getRecord({repo: did, collection: 'com.atproto.lexicon.schema', rkey: nsid.toString()})
        delete xrpcRes.data.value['$type']
        const lexiconDoc = parseLexiconDoc(xrpcRes.data.value)
        records.push(lexiconDoc)
      } catch {
        continue
      }
    }
  }
  if (records.length === 0) {
    return false
  } else {
    return true
  }
}
