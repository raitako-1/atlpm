import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import yesno from 'yesno'
import { LexiconDoc, Lexicons, parseLexiconDoc } from '@atproto/lexicon'
import { NSID } from '@atproto/syntax'
import { IndentationText, Project } from 'ts-morph'
import { ZodError, ZodFormattedError } from 'zod'
import { ApiType, FileDiff, GeneratedFile } from './types'
import {
  genRecord,
  genUserType,
  genXrpcInput,
  genXrpcOutput,
} from './codegen/lex-gen'

export async function confirmOrExit(q: string, noFn?: () => Promise<void>) {
  const ok = await yesno({
    question: `${q} [y/N]`,
    defaultValue: false,
  })
  if (!ok) {
    if (noFn) {
      await noFn()
    } else {
      console.log('Aborted.')
      process.exit(0)
    }
  }
}

export function getAllFiles(dirpath: string): string[] {
  const files: string[] = []
  if (!fs.existsSync(dirpath) || !fs.statSync(dirpath).isDirectory()) return files
  fs.readdirSync(dirpath, {withFileTypes: true}).forEach(dirent => {
    const fp = path.join(dirpath, dirent.name)
    if (dirent.isDirectory()) {
      files.push(...getAllFiles(fp))
    } else {
      files.push(fp)
    }
  })
  return files
}

export async function fetchSchemas(files: GeneratedFile[], nsid: NSID, registry: string, schemaPath: string, apiType: ApiType): Promise<void> {
  const schemaFileName = `${nsid.toString().replace(/\./g, '/')}.json`
  const schemaFullPath = path.join(schemaPath, schemaFileName)
  if (registry === 'local') {
    let str: string
    let lexiconDoc: LexiconDoc
    try {
      try {
        str = fs.readFileSync(schemaFullPath, 'utf8')
      } catch (e) {
        console.error(chalk.red(`Failed to read file: ${schemaFullPath}`))
        throw e
      }
      lexiconDoc = readLexicon(str, schemaFullPath)
    } catch {
      return
    }
    files.push({path: schemaFileName, content: str})
    const imports = getLexDependencies(apiType, lexiconDoc)
    for (const nsid of imports) {
      if (!files.some(file => file.path === `${nsid.replace(/\./g, '/')}.json`)) await fetchSchemas(files, NSID.parse(nsid), registry, schemaPath, apiType)
    }
  } else if (registry === 'github' || URL.canParse(registry)) {
    let url: string
    if (registry === 'github') {
      if (nsid.authority.endsWith('bsky.app') || nsid.authority.endsWith('bsky.chat') || nsid.authority.endsWith('atproto.com') || nsid.authority.endsWith('ozone.tools')) {
        url = `https://raw.githubusercontent.com/bluesky-social/atproto/refs/heads/main/lexicons/${schemaFileName}`
      } else if (nsid.authority.endsWith('linkat.blue')) {
        url = `https://raw.githubusercontent.com/mkizka/linkat/refs/heads/main/lexicons/${schemaFileName}`
      } else if (nsid.authority.endsWith('whtwnd.com')) {
        url = `https://raw.githubusercontent.com/whtwnd/whitewind-blog/refs/heads/main/lexicons/${schemaFileName}`
      } else if (nsid.authority.endsWith('unravel.fyi')) {
        url = `https://raw.githubusercontent.com/likeandscribe/frontpage/refs/heads/main/lexicons/${schemaFileName}`
      } else if (nsid.authority.endsWith('smokesignal.events')) {
        url = `https://raw.githubusercontent.com/SmokeSignal-Events/lexicon/refs/heads/main/${schemaFileName}`
      } else if (nsid.authority.endsWith('pastesphere.link')) {
        const [, , ...name] = nsid.segments
        url = `https://raw.githubusercontent.com/echo8/pastesphere/refs/heads/main/lexicons/${name.join('/')}.json`
      } else if (nsid.authority.endsWith('psky.social')) {
        url = `https://raw.githubusercontent.com/psky-atp/appview/refs/heads/main/lexicons/${schemaFileName}`
      } else if (nsid.authority.endsWith('moji.blue')) {
        const [, , ...name] = nsid.segments
        url = `https://raw.githubusercontent.com/marukun712/stellar/refs/heads/master/lexicons/bluemoji/${name.join('/')}.json`
      } else if (nsid.authority.endsWith('stellar.maril.blue')) {
        url = `https://raw.githubusercontent.com/marukun712/stellar/refs/heads/master/lexicons/stellar/${nsid.name}.json`
      } else if (nsid.authority.endsWith('evex.land')) {
        url = `https://raw.githubusercontent.com/evex-dev/atratch-server/refs/heads/main/lexicons/${schemaFileName}`
      } else {
        console.error(chalk.red(`Unknown authority in github: ${nsid.authority}`))
        return
      }
    } else {
      url = new URL(schemaFileName, registry).toString()
    }
    let str: string
    let lexiconDoc: LexiconDoc
    try {
      try {
        const response = await fetch(url)
        str = await response.text()
      } catch (e) {
        console.error(chalk.red(`Failed to GET url: ${url}`))
        throw e
      }
      lexiconDoc = readLexicon(str, url)
    } catch {
      return
    }
    files.push({path: schemaFileName, content: str})
    const imports = getLexDependencies(apiType, lexiconDoc)
    for (const nsid of imports) {
      if (!files.some(file => file.path === `${nsid.replace(/\./g, '/')}.json`)) await fetchSchemas(files, NSID.parse(nsid), registry, schemaPath, apiType)
    }
  } else {
    console.error(chalk.red(`Unknown registry type: ${registry}`))
    return
  }
}

function getLexDependencies(apiType: ApiType, lexiconDoc: LexiconDoc): Set<string> {
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
  return imports
}

export function readAllLexicons(paths: string[]): LexiconDoc[] {
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

export function readLexicon(str: string, path: string): LexiconDoc {
  let obj: unknown
  try {
    obj = JSON.parse(str)
  } catch (e) {
    console.error(chalk.red(`Failed to parse JSON in file: ${path}`))
    throw e
  }
  if (
    obj &&
    typeof obj === 'object' &&
    typeof (obj as LexiconDoc).lexicon === 'number'
  ) {
    try {
      return parseLexiconDoc(obj)
    } catch (e) {
      console.error(chalk.red(`Invalid lexicon: ${path}`))
      if (e instanceof ZodError) {
        printZodError(e.format())
      }
      throw e
    }
  } else {
    console.error(chalk.red(`Not lexicon schema: ${path}`))
    throw new Error(`Not lexicon schema`)
  }
}

export function genTsObj(lexicons: LexiconDoc[]): string {
  return `export const lexicons = ${JSON.stringify(lexicons, null, 2)}`
}

export function genFileDiff(outDir: string, files: GeneratedFile[]) {
  const diffs: FileDiff[] = []
  const existingFiles = readdirRecursiveSync(outDir)

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

function readdirRecursiveSync(root: string, files: string[] = [], prefix = '') {
  const dir = path.join(root, prefix)
  if (!fs.existsSync(dir)) return files
  if (fs.statSync(dir).isDirectory())
    fs.readdirSync(dir).forEach(function (name) {
      readdirRecursiveSync(root, files, path.join(prefix, name))
    })
  else if (prefix.endsWith('.ts') || prefix.endsWith('.json')) {
    files.push(path.join(root, prefix))
  }

  return files
}

function dedup(arr: string[]): string[] {
  return Array.from(new Set(arr))
}
