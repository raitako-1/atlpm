import { NSID } from '@atproto/syntax'

export interface ApiTypes {
  TSClient?: string
  TSServer?: string
}

export interface AtlpmManifest {
  apiTypes?: ApiTypes
  schemaDir?: string
  lexicons?: Record<string, string>
}

export interface GeneratedFile {
  path: string
  content: string
}

export interface GeneratedAPI {
  files: GeneratedFile[]
}

export interface GeneratedSchema {
  all: GeneratedFile[]
  api: {
    [k: string]: Set<string>
  }
}

export interface FileDiff {
  act: 'add' | 'mod' | 'del'
  path: string
  content?: string
}

type RegistryData = {
  github: {
    [domain: string]: {
      getUrl: (nsid: NSID) => Promise<URL>
    }
  }
}

export const registryData: RegistryData = {
  github: {
    'bsky.app': {
      getUrl: async (nsid) => {return new URL(`https://raw.githubusercontent.com/bluesky-social/atproto/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'bsky.chat': {
      getUrl: async (nsid) => {return new URL(`https://raw.githubusercontent.com/bluesky-social/atproto/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'atproto.com': {
      getUrl: async (nsid) => {return new URL(`https://raw.githubusercontent.com/bluesky-social/atproto/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'ozone.tools': {
      getUrl: async (nsid) => {return new URL(`https://raw.githubusercontent.com/bluesky-social/atproto/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'linkat.blue': {
      getUrl: async (nsid) => {return new URL(`https://raw.githubusercontent.com/mkizka/linkat/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'whtwnd.com': {
      getUrl: async (nsid) => {return new URL(`https://raw.githubusercontent.com/whtwnd/whitewind-blog/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'unravel.fyi': {
      getUrl: async (nsid) => {return new URL(`https://raw.githubusercontent.com/likeandscribe/frontpage/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'smokesignal.events': {
      getUrl: async (nsid) => {return new URL(`https://raw.githubusercontent.com/SmokeSignal-Events/lexicon/refs/heads/main/${nsid.segments.join('/')}.json`)},
    },
    'pastesphere.link': {
      getUrl: async (nsid) => {
        const [, , ...name] = nsid.segments
        return new URL(`https://raw.githubusercontent.com/echo8/pastesphere/refs/heads/main/lexicons/${name.join('/')}.json`)
      },
    },
    'psky.social': {
      getUrl: async (nsid) => {return new URL(`https://raw.githubusercontent.com/psky-atp/appview/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'moji.blue': {
      getUrl: async (nsid) => {
        const [, , ...name] = nsid.segments
        return new URL(`https://raw.githubusercontent.com/marukun712/stellar/refs/heads/master/lexicons/bluemoji/${name.join('/')}.json`)
      },
    },
    'stellar.maril.blue': {
      getUrl: async (nsid) => {return new URL(`https://raw.githubusercontent.com/marukun712/stellar/refs/heads/master/lexicons/stellar/${nsid.name}.json`)},
    },
    'evex.land': {
      getUrl: async (nsid) => {return new URL(`https://raw.githubusercontent.com/evex-dev/atratch-server/refs/heads/main/lexicons/${nsid.segments.join('/')}.json`)},
    },
    'skyblur.uk': {
      getUrl: async (nsid) => {
        const inferUrl = `https://raw.githubusercontent.com/usounds/Skyblur/refs/heads/main/lexicon/${nsid.segments.join('/')}`
        if ((await fetch(`${inferUrl}.json`)).status === 404) {
          return new URL(`${inferUrl}/record.json`)
        }
        return new URL(`${inferUrl}.json`)
      },
    },
  },
}
