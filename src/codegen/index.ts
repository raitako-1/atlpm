import { LexiconDoc } from '@atproto/lexicon'
import { GeneratedAPI } from '../types'
import { genClientApi } from './client'
import { genServerApi } from './server'

export async function genApi(
  lexiconDocs: LexiconDoc[],
  apiType: string,
): Promise<GeneratedAPI> {
  if (apiType === 'TSClient') return await genClientApi(lexiconDocs)
  if (apiType === 'TSServer') return await genServerApi(lexiconDocs)
  throw new Error('ERR_NLPM_JSON', { cause: 'Invalid apiType in nlpm.json'})
}
