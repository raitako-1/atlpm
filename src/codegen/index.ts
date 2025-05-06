import { type LexiconDoc } from '@atproto/lexicon'
import { type ApiTypes, type GeneratedAPI } from '../types'
import { genClientApi } from './client'
import { genServerApi } from './server'

export async function genApi(
  lexiconDocs: LexiconDoc[],
  apiType: keyof ApiTypes,
): Promise<GeneratedAPI> {
  if (apiType === 'TSClient') return await genClientApi(lexiconDocs)
  if (apiType === 'TSServer') return await genServerApi(lexiconDocs)
  throw new Error('ERR_ATLPM_JSON', { cause: 'Invalid apiType in atlpm.json'})
}
