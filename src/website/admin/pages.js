// 开发模式从磁盘读取 pages/*.html；npm run build 时 esbuild 会内嵌 HTML 到单文件 index.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cache = new Map();

export function loadPage(name) {
  if (cache.has(name)) return cache.get(name);
  const file = path.join(__dirname, 'pages', `${name}.html`);
  const html = fs.readFileSync(file, 'utf8');
  cache.set(name, html);
  return html;
}

export function wantsHtml(req) {
  return (req.headers.accept || '').includes('text/html');
}
