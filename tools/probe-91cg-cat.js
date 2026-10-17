import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
import { load } from 'cheerio';
import fs from 'fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131';
const site = 'https://www.91cg1.com';
const r = await axios.get(site + '/', {
        headers: { 'User-Agent': UA },
        httpsAgent: agent,
    timeout: 25000,
    validateStatus: () => true,
});
const html = String(r.data || '');
fs.writeFileSync('tools/91cg-home.html', html);
console.log('status', r.status, 'len', html.length);
const $ = load(html);
const links = [];
$('a[href*="/category/"]').each((_, el) => {
    links.push(($(el).attr('href') || '') + ' | ' + $(el).text().replace(/\s+/g, ' ').trim());
});
console.log([...new Set(links)].join('\n'));
