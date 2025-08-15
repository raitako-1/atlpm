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
```
atlpm init
atlpm install
atlpm add app.bsky.feed.post com.atproto.sync.subscribeRepos
atlpm publish com.example.instance

atlpm add -y \
  github:app.bsky.feed.post \
  local:com.example.test \
  https://raw.githubusercontent.com/bluesky-social/atproto/refs/heads/main/lexicons/:app.bsky.feed.like \
  https://raw.githubusercontent.com/bluesky-social/statusphere-example-app/refs/heads/main/lexicons/status.json:xyz.statusphere.status
```

## コマンドの説明
### publishに関して
`atlpm publish <nsid>`で、localで読み込める状態のlexiconをPDSにrecordとして書き込み、世界中の人があなたのlexiconを(nsidさえ知っていれば)このようなツールを使って読み込むことができるようにします。<br>
lexicon schemaが必要なのはもちろんのこと、アカウントは何でもいいのでApp Passwordを使ってログインできる環境であることと、DNSのレコードを設定できる状況にあることが必須です。(既にDNSレコードを設定できている場合はログイン情報のみで大丈夫です。)

### 読み込みに関して
`<nsid>`で読み込むと、pds->github->localの優先順に対応しているregistryを自動的に探して設定します。<br>
`local:<nsid>`で読み込むと、schemaDirで設定されているディレクトリ下のschemaを読み込むように設定します。<br>
`pds:<nsid>`で読み込むと、[こちら](https://atproto.com/ja/specs/lexicon#lexicon-publication-and-resolution)に書かれた方法でpdsからschemaを読み込むように設定します。<br>
`github:<nsid>`で読み込むと、githubから自動でschemaを読み込むように設定します。今のところ`bsky.app, bsky.chat, atproto.com, ozone.tools, linkat.blue, whtwnd.com, unravel.fyi, smokesignal.events, pastesphere.link, psky.social, moji.blue, stellar.maril.blue, evex.land, skyblur.uk`に対応しています。対応してほしいTLDがありましたら、お手数ですが[作成者](https://bsky.app/profile/raitako.com)にお知らせください。<br>
`<url>:<nsid>`で読み込むと、指定されたURLからschemaを読み込むように設定します。nsidのドットがそのままスラッシュに置き換わっているタイプのURLであれば、lexiconsディレクトリをURLに指定することでも読み込め、その場合依存関係を読み込む際にもそのURLが使われるようになります。

### 依存関係に関して
依存関係の読み込みに関しては、一度`atlpm.json`の`lexicons`に書かれているnsidのschemaをそこで指定されたregistryから全て読み込み、その後それらの依存関係を全て`pds->github->依存関係が書かれた元のschemaを読み込んだURL->その他のURL->local`の優先順(URLがschemaそのものを指定している場合そのURLはスキップされます)で読み込んでいます。<br>
もし自動で読み込まれない依存関係が存在した場合は`${nsid} could not be loaded in any registry!`と表示されるようになっているので、そのようなschemaに関してはそれぞれ`atlpm.json`の`lexicons`に追記してください。

## 将来的には...
読み込み時のnsidのワイルドカード表記に関しては、依存関係を別ディレクトリで管理できるようになってから対応させるつもりです。
