export type ApiType = 'TSClient' | 'TSServer'

export interface AtlpmManifest {
  apiType?: ApiType
  schemaDir?: string
  outDir?: string
  lexicons?: Record<string, string>
}

export interface GeneratedFile {
  path: string
  content: string
}

export interface GeneratedAPI {
  files: GeneratedFile[]
}

export interface FileDiff {
  act: 'add' | 'mod' | 'del'
  path: string
  content?: string
}
