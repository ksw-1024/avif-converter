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

## Troubleshooting

### `wasm validation error ... failed to match magic number` / `404 /node_modules/.vite/deps/*.wasm`

Vite の依存最適化（prebundle）で `@jsquash/avif` の `.wasm` が正しく配信されず、404 HTMLをwasmとして読みにいって失敗することがあります。

```sh
rm -rf node_modules/.vite
pnpm dev
```
