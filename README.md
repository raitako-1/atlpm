# ATProtocol Lexicon Package Manager
[Concept](https://bsky.app/profile/raitako.com/post/3lgfzq3fgk22w)<br>
Inspiration from [lpm](https://github.com/tom-sherman/lpm)<br>
Forked from [@atproto/lex-cli](https://github.com/bluesky-social/atproto/blob/main/packages/lex-cli)

This is a ATProto ...

- **[Lexicon](https://atproto.com/specs/lexicon):** A schema definition language for ATProto.
- **API:** Programs can refer to the schema.
  - **[TypeScript Client API](https://github.com/bluesky-social/atproto/blob/main/packages/lex-cli):** for Client in TypeScript.
  - **[TypeScript Server API](https://github.com/bluesky-social/atproto/blob/main/packages/lex-cli):** for Server in TypeScript.

... Package Manager.

## How to use
`atlpm init`<br>
`atlpm install`<br>
`atlpm add github:app.bsky.feed.post local:com.example.test https://raw.githubusercontent.com/bluesky-social/atproto/refs/heads/main/lexicons/:app.bsky.feed.like https://raw.githubusercontent.com/bluesky-social/statusphere-example-app/refs/heads/main/lexicons/status.json:xyz.statusphere.status`

## コマンドの説明
### 読み込みに関して
`local:<nsid>`で読み込むと、schemaDirで設定されているディレクトリ下のschemaを読み込みます。<br>
`github:<nsid>`で読み込むと、githubから自動でschemaを読み込みます。今のところ`bsky.app, bsky.chat, atproto.com, ozone.tools, linkat.blue, whtwnd.com, unravel.fyi, smokesignal.events, pastesphere.link, psky.social, moji.blue, stellar.maril.blue, evex.land, skyblur.uk`に対応しています。<br>
`<url>:<nsid>`で読み込むと、指定されたURLからschemaを読み込みます。nsidのドットがそのままスラッシュに置き換わっているタイプのURLであれば、lexiconsディレクトリをURLに指定することでも読み込め、その場合依存関係を読み込む際にもそのURLが使われるようになります。

### 依存関係に関して
依存関係の読み込みに関しては、一度`atlpm.json`の`lexicons`に書かれているnsidのschemaをそこで指定されたregistryから全て読み込み、その後それらの依存関係を全てgithub->URL->localの優先順(URLがschemaそのものを指定している場合そのURLはスキップされ、schemaを読み込んだregistryが一番優先度が高い状態)で読み込んでいます。<br>
もし自動で読み込まれない依存関係が存在した場合は`${nsid} could not be loaded in any registry!`と表示されるようになっているので、そのようなschemaに関してはそれぞれ`atlpm.json`の`lexicons`に追記してください。

## 将来的には...
将来的にはPDSなどによるlexicon解決やpublishに対応する計画です。※nsidのワイルドカード表記は今のところ対応する計画はありません。
