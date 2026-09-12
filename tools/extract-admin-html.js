import fs from 'fs';
import path from 'path';

const s = fs.readFileSync('index.js', 'utf8');
const outDir = 'src/website/admin/pages';
fs.mkdirSync(outDir, { recursive: true });

// Extract <!DOCTYPE html> ... </html> blocks (template literals may use \r\n)
const re = /<!DOCTYPE html>[\s\S]*?<\/html>/g;
const pages = [];
let m;
while ((m = re.exec(s)) !== null) {
  let html = m[0];
  // decode common unicode escapes in bundle
  html = html.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  html = html.replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  html = html.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  // bundle 模板字符串里的转义，静态提取后需还原成浏览器可执行的 JS
  html = html.replace(/\\`/g, '`').replace(/\\\$\{/g, '${');
  html = html.replaceAll('replace(/\\\\/+$/,', 'replace(/\\/+$/,');
  html = html.replaceAll('replace(/\\\\/search$/,', 'replace(/\\/search$,');
  html = html.replaceAll('\\r', '');
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1] : `page-${pages.length}`;
  pages.push({ title, html });
}

const slug = (title) => title
  .replace(/[^\w\u4e00-\u9fff]+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase();

const used = new Map();
for (const p of pages) {
  let name = slug(p.title) || 'index';
  if (name === '爬虫配置管理') name = 'index';
  else if (name.includes('missav')) name = 'missav';
  else if (name.includes('jable')) name = 'jable';
  else if (name.includes('cookie')) name = 'cookies';
  else if (name.includes('直播')) name = 'live';
  else if (name.includes('搜索')) name = 'search';
  else if (name.includes('cms')) name = 'cms';
  else if (name.includes('数据库')) name = 'database';
  else if (name.includes('m3u8')) name = 'm3u8';
  else if (name.includes('catpaw') || name.includes('测试')) name = 'test';

  const count = (used.get(name) || 0) + 1;
  used.set(name, count);
  const file = count > 1 ? `${name}-${count}.html` : `${name}.html`;
  fs.writeFileSync(path.join(outDir, file), p.html, 'utf8');
  console.log(`Wrote ${file} (${p.title})`);
}

console.log(`\nTotal: ${pages.length} pages`);
