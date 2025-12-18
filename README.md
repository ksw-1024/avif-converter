# avif-converter

JPG/PNG を **WebP / AVIF** に **クライアントサイド変換**してダウンロードできる、Astro の静的Webアプリです。

- 画像のアップロードは行いません（ローカルで完結）
- WebP は `canvas.toBlob('image/webp', quality)` を使用
- AVIF は `@jsquash/avif` (WASM) を **Web Worker** で実行（AVIF選択時に遅延 import）

## 使い方

```sh
pnpm install
pnpm dev
```

## ビルド（静的）

```sh
pnpm build
pnpm preview
```

## デプロイ（サブパス配信 /c-img など）

例: `https://www.ksw1024.studio/c-img/` のように **サブディレクトリ配信**する場合は、ビルド時に `ASTRO_BASE` を設定してください。

```sh
ASTRO_BASE="/c-img/" pnpm build
```

## Troubleshooting

### `wasm validation error ... failed to match magic number` / `404 /node_modules/.vite/deps/*.wasm`

Vite の依存最適化（prebundle）で `@jsquash/avif` の `.wasm` が正しく配信されず、404 HTMLをwasmとして読みにいって失敗することがあります。

```sh
rm -rf node_modules/.vite
pnpm dev
```

### デプロイ後に `MIME タイプ ("text/html") ... /_astro/...` で Worker/wasm がブロックされる

静的ホスティング側が `/_astro/*` を `index.html` にリライトしてしまう/または `dist/_astro` がアップロードされていないと、`.js/.wasm` の代わりにHTMLが返ってきて失敗します。

- `dist/` 配下（`dist/_astro` を含む）をまるごと配信する
- SPA fallback / rewrite は `/_astro/*` を除外する
- 既に古いJSをキャッシュしている場合はハードリロード（強制再読み込み）する

### `Error: モジュール指定 "./index-xxxx.js" の解決時にエラー`

たいていは **`/_astro/*.js` が 404 になっている** か、**JSのはずが `text/html` で返っている**（rewrite/fallback に飲まれている）状態です。

- `dist/_astro` が丸ごとアップロードされているか確認
- `/_astro/*` の rewrite 除外を確認
- サブパス配信なら `ASTRO_BASE="/c-img/"` などの `base` を設定してビルドし直す
- GitHub Pages の場合は `.nojekyll` が必要（このプロジェクトは `public/.nojekyll` を同梱）
