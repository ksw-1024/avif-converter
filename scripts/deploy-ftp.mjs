#!/usr/bin/env node
/**
 * FTP Deploy Script for CORESERVER V2
 * 
 * 使用方法:
 *   node scripts/deploy-ftp.mjs
 * 
 * 環境変数（.env.localに設定）:
 *   FTP_HOST=xxx.coreserver.jp
 *   FTP_USER=your_username
 *   FTP_PASSWORD=your_password
 *   FTP_REMOTE_DIR=/public_html (または /domains/yourdomain.com/public_html)
 */

import { Client } from 'basic-ftp';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { readdir, stat } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// .env.local から環境変数を読み込む
function loadEnv() {
    const envPath = join(ROOT_DIR, '.env.local');
    if (existsSync(envPath)) {
        const envContent = readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
                if (!process.env[key.trim()]) {
                    process.env[key.trim()] = value;
                }
            }
        });
    }
}

loadEnv();

// 設定
const config = {
    host: process.env.FTP_HOST,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
    remoteDir: process.env.FTP_REMOTE_DIR || '/public_html',
    localDir: join(ROOT_DIR, 'dist'), // Astroのビルド出力ディレクトリ
    secure: false, // CORESERVER V2はFTPSも対応している場合はtrueに
};

// 色付きログ出力
const log = {
    info: (msg) => console.log(`\x1b[36mℹ\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m✗\x1b[0m ${msg}`),
    warn: (msg) => console.log(`\x1b[33m⚠\x1b[0m ${msg}`),
};

// ディレクトリ内のすべてのファイルを再帰的に取得
async function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = await readdir(dirPath);

    for (const file of files) {
        const fullPath = join(dirPath, file);
        const fileStat = await stat(fullPath);

        if (fileStat.isDirectory()) {
            await getAllFiles(fullPath, arrayOfFiles);
        } else {
            arrayOfFiles.push(fullPath);
        }
    }

    return arrayOfFiles;
}

// メインのデプロイ処理
async function deploy() {
    // 設定の検証
    if (!config.host || !config.user || !config.password) {
        log.error('FTP接続情報が設定されていません。');
        log.info('以下の環境変数を .env.local に設定してください:');
        console.log(`
  FTP_HOST=xxx.coreserver.jp
  FTP_USER=your_username
  FTP_PASSWORD=your_password
  FTP_REMOTE_DIR=/public_html
    `);
        process.exit(1);
    }

    // ビルドディレクトリの確認
    if (!existsSync(config.localDir)) {
        log.error('ビルドディレクトリが見つかりません。先に `pnpm build` を実行してください。');
        process.exit(1);
    }

    const client = new Client();
    client.ftp.verbose = process.env.FTP_VERBOSE === 'true';

    try {
        log.info(`FTPサーバーに接続中: ${config.host}`);

        await client.access({
            host: config.host,
            user: config.user,
            password: config.password,
            secure: config.secure,
        });

        log.success('FTP接続成功');
        log.info(`リモートディレクトリ: ${config.remoteDir}`);

        // リモートディレクトリに移動（存在しなければ作成）
        await client.ensureDir(config.remoteDir);
        log.success(`リモートディレクトリを確認: ${config.remoteDir}`);

        // ファイル一覧を取得
        const allFiles = await getAllFiles(config.localDir);
        const totalFiles = allFiles.length;

        log.info(`${totalFiles} 個のファイルをアップロードします...`);

        let uploadedCount = 0;
        let errorCount = 0;

        for (const localFile of allFiles) {
            const relativePath = relative(config.localDir, localFile);
            const remotePath = join(config.remoteDir, relativePath).replace(/\\/g, '/');
            const remoteDirectory = dirname(remotePath);

            try {
                // リモートディレクトリを作成
                await client.ensureDir(remoteDirectory);
                await client.cd(config.remoteDir); // ルートに戻る

                // ファイルをアップロード
                await client.uploadFrom(localFile, remotePath);
                uploadedCount++;

                // 進捗表示
                const progress = Math.round((uploadedCount / totalFiles) * 100);
                process.stdout.write(`\r\x1b[36m↑\x1b[0m アップロード中... ${uploadedCount}/${totalFiles} (${progress}%) - ${relativePath}`);
                process.stdout.write('\x1b[K'); // 行末をクリア
            } catch (err) {
                errorCount++;
                log.error(`アップロード失敗: ${relativePath} - ${err.message}`);
            }
        }

        console.log(''); // 改行

        if (errorCount === 0) {
            log.success(`デプロイ完了！ ${uploadedCount} 個のファイルをアップロードしました。`);
        } else {
            log.warn(`デプロイ完了（エラーあり）: ${uploadedCount} 成功, ${errorCount} 失敗`);
        }

    } catch (err) {
        log.error(`FTPエラー: ${err.message}`);
        process.exit(1);
    } finally {
        client.close();
        log.info('FTP接続を閉じました');
    }
}

// スクリプト実行
deploy();
