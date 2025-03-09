import { NSID } from '@atproto/syntax'

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

type RegistryData = {
  github: {
    [domain: string]: {
      getUrl: (nsid: NSID) => URL
    }
  }
}

export const registryData: RegistryData = {
  github: {
    'bsky.app': {
      getUrl: (nsid) => {return new URL(`https://raw.githubusercontent.com/bluesky-social/atproto/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'bsky.chat': {
      getUrl: (nsid) => {return new URL(`https://raw.githubusercontent.com/bluesky-social/atproto/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'atproto.com': {
      getUrl: (nsid) => {return new URL(`https://raw.githubusercontent.com/bluesky-social/atproto/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'ozone.tools': {
      getUrl: (nsid) => {return new URL(`https://raw.githubusercontent.com/bluesky-social/atproto/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'linkat.blue': {
      getUrl: (nsid) => {return new URL(`https://raw.githubusercontent.com/mkizka/linkat/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'whtwnd.com': {
      getUrl: (nsid) => {return new URL(`https://raw.githubusercontent.com/whtwnd/whitewind-blog/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'unravel.fyi': {
      getUrl: (nsid) => {return new URL(`https://raw.githubusercontent.com/likeandscribe/frontpage/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'smokesignal.events': {
      getUrl: (nsid) => {return new URL(`https://raw.githubusercontent.com/SmokeSignal-Events/lexicon/refs/heads/main/${nsid.segments.join('/')}.json`)},
    },
    'pastesphere.link': {
      getUrl: (nsid) => {
        const [, , ...name] = nsid.segments
        return new URL(`https://raw.githubusercontent.com/echo8/pastesphere/refs/heads/main/lexicons/${name.join('/')}.json`)
      },
    },
    'psky.social': {
      getUrl: (nsid) => {return new URL(`https://raw.githubusercontent.com/psky-atp/appview/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'moji.blue': {
      getUrl: (nsid) => {
        const [, , ...name] = nsid.segments
        return new URL(`https://raw.githubusercontent.com/marukun712/stellar/refs/heads/master/lexicons/bluemoji/${name.join('/')}.json`)
      },
    },
    'stellar.maril.blue': {
      getUrl: (nsid) => {return new URL(`https://raw.githubusercontent.com/marukun712/stellar/refs/heads/master/lexicons/stellar/${nsid.name}.json`)},
    },
    'evex.land': {
      getUrl: (nsid) => {return new URL(`https://raw.githubusercontent.com/evex-dev/atratch-server/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
  },
}
