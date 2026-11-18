# レシート読み取りサーバー（無料枠：1日1回）

アプリ → このサーバー → Gemini API。API キーはサーバーだけが持ちます。

## 手順
1. `npm i -g wrangler` して `npx wrangler login`
2. `npx wrangler kv namespace create RATE` → 出てきた id を `wrangler.toml` に貼る
3. `wrangler.toml` の `ALLOWED_ORIGIN` を自分のアプリの URL に変える
4. Gemini の API キーを入れる：`npx wrangler secret put GEMINI_API_KEY`
5. `npx wrangler deploy` → 表示された URL をコピー
6. アプリの `app.js` 先頭近くの `RECEIPT_PROXY_URL` にその URL を入れて再配信

## 仕組み
- 制限：端末ごとに日本時間で1日1回 ＋ 同一回線(IP)は1日10回まで（`receipt-proxy.js` 上部で変更可）
- 保存：画像は保存・ログ出力しません。KV に入るのは日付と回数（端末ID・IPはハッシュ化）だけで、2日で消えます
- Gemini 側の扱い：無料枠の API は入力が改善目的に使われることがあります。「Google にも保存されない」とアプリで案内したい場合は、
  課金（Paid）設定の API キーを使い、Google の最新の利用規約・データ取り扱いを必ず確認してください。
