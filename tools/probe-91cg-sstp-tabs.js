import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { load } from 'cheerio';

const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const site = 'https://www.91cg1.com';

async function get(path) {
    const r = await axios.get(site + path, {
        headers: { 'User-Agent': UA },
        httpsAgent: agent,
        timeout: 25000,
    });
    const $ = load(r.data);
    const n = $('a.realtime-card').length;
    const pages = $('.candid-list-pagination__center').attr('data-total-pages');
    const first = $('a.realtime-card').first();
    console.log(path, 'cards', n, 'pages', pages, 'href', first.attr('href'), 'name', (first.attr('aria-label') || '').slice(0, 20));
}

await get('/category/sstp/live/');
await get('/category/sstp/replay/');
await get('/category/sstp/live/2/');
