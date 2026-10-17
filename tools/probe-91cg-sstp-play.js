import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fs from 'fs';

const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://www.91cg1.com';

async function get(url) {
    const r = await axios.get(url, {
        headers: { 'User-Agent': UA, Referer: site + '/' },
        httpsAgent: agent,
        timeout: 25000,
        validateStatus: () => true,
    });
    return r;
}

const url = `${site}/category/sstp/video/12573/`;
const d = await get(url);
const html = String(d.data);
fs.writeFileSync('tools/91cg-sstp-detail.html', html);
console.log('status', d.status, 'len', html.length);

const keys = ['dplayer', 'm3u8', 'video-url', 'data-config', 'hls', 'player', 'iframe', 'source', 'playUrl', 'videoUrl', 'mp4'];
for (const k of keys) {
    const i = html.toLowerCase().indexOf(k.toLowerCase());
    console.log(k, i);
}

const re = /https?:[^"'\\\s<>]{10,200}/g;
const urls = [...new Set(html.match(re) || [])].filter(u => /m3u8|mp4|play|video|hls|stream/i.test(u));
console.log('media urls', urls.slice(0, 30));

const snippets = [];
for (const k of ['data-config', 'm3u8', 'videoUrl', 'playUrl', 'dplayer', 'hls.js', 'new DPlayer']) {
    let from = 0;
    let n = 0;
    const low = html.toLowerCase();
    const kk = k.toLowerCase();
    while (n < 2) {
        const i = low.indexOf(kk, from);
        if (i < 0) break;
        snippets.push('\n--- ' + k + ' @' + i + ' ---\n' + html.slice(Math.max(0, i - 120), i + 280));
        from = i + kk.length;
        n++;
    }
}
fs.writeFileSync('tools/91cg-sstp-snips.txt', snippets.join('\n') || 'none');
console.log('snips', snippets.length);
