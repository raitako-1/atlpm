# ATProtocol Lexicon Package Manager
Forked from [@atproto/lex-cli](https://github.com/bluesky-social/atproto/blob/main/packages/lex-cli)

`atlpm init`

`atlpm add github:app.bsky.feed.post local:com.example.test https://raw.githubusercontent.com/bluesky-social/atproto/refs/heads/main/lexicons:app.bsky.feed.like`

local:\<nsid\>で読み込むと、schemaDir配下のschemaを読み込みます。
github:\<nsid\>での読み込みは、今のところ`bsky.app, bsky.chat, atproto.com, ozone.tools, linkat.blue, whtwnd.com, unravel.fyi, smokesignal.events, pastesphere.link, psky.social, moji.blue, stellar.maril.blue, evex.land`に対応しています。

