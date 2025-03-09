# ATProtocol Lexicon Package Manager
Forked from [@atproto/lex-cli](https://github.com/bluesky-social/atproto/blob/main/packages/lex-cli)

`atlpm init`<br>
`atlpm add github:app.bsky.feed.post local:com.example.test https://raw.githubusercontent.com/bluesky-social/atproto/refs/heads/main/lexicons/:app.bsky.feed.like https://raw.githubusercontent.com/bluesky-social/statusphere-example-app/refs/heads/main/lexicons/status.json:xyz.statusphere.status`

local:\<nsid\>で読み込むと、schemaDirで設定されているディレクトリ下のschemaを読み込みます。<br>
github:\<nsid\>で読み込むと、githubから自動でschemaを読み込みます。今のところ`bsky.app, bsky.chat, atproto.com, ozone.tools, linkat.blue, whtwnd.com, unravel.fyi, smokesignal.events, pastesphere.link, psky.social, moji.blue, stellar.maril.blue, evex.land`に対応しています。<br>
\<url\>:\<nsid\>で読み込むと、指定されたURLからschemaを読み込みます。nsidのドットがそのままスラッシュに置き換わっているタイプのURLであれば、lexiconsディレクトリをURLに指定することでも読み込め、その場合依存関係を読み込む際にもそのURLが使われるようになります。

依存関係の読み込みに関しては、一度`atlpm.json`の`lexicons`に書かれているnsidのschemaをそこで指定されたregistryから全て読み込み、その後それらの依存関係を全てgithub->URL->localの優先順(URLがschemaそのものを指定している場合そのURLはスキップされ、schemaを読み込んだregistryが一番優先度が高い状態)で読み込んでいます。<br>
もし自動で読み込まれない依存関係が存在した場合は`${nsid} could not be loaded in any registry!`と表示されるようになっているので、そのようなschemaに関してはそれぞれ`atlpm.json`の`lexicons`に追記してください。
