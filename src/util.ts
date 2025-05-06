import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import yesno from 'yesno'
import { ZodError, type ZodFormattedError } from 'zod'
import { type LexiconDoc, parseLexiconDoc } from '@atproto/lexicon'
import { type FileDiff, type GeneratedFile } from './types'

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

export function readAllLexicons(paths: Set<string>): LexiconDoc[] {
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

export function readLexicon(str: string, path: string, outErr: boolean = true): LexiconDoc {
  let obj: unknown
  try {
    obj = JSON.parse(str)
  } catch (e) {
    if (outErr) console.error(chalk.red(`Failed to parse JSON in file: ${path}`))
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
