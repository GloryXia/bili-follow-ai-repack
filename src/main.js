/**
 * Legacy 入口 — 保持向后兼容
 * 新代码请使用 `node src/index.js follow` 或 `npm start`
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { runFollow } from './modules/follow/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('⚠️  main.js 是旧入口，推荐使用: npm start 或 node src/index.js follow');

runFollow({ rootDir }).catch(error => {
  console.error('致命错误:', error?.message || String(error));
  process.exitCode = 1;
});
