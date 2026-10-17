import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { load } from 'cheerio';
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

const cat = await get(`${site}/category/sstp/1/`);
fs.writeFileSync('tools/91cg-sstp.html', typeof cat.data === 'string' ? cat.data : JSON.stringify(cat.data));
const $ = load(cat.data);
const arts = [];
$('article').each((_, el) => {
    const url = $(el).find('a').attr('href') || '';
    const name = $(el).find('.post-card-title').text().trim();
    const script = $(el).find('script').text().trim().slice(0, 80);
    if (name || url) arts.push({ name: name.slice(0, 40), url, script });
});
console.log('status', cat.status, 'len', String(cat.data).length, 'articles', arts.length);
console.log(JSON.stringify(arts.slice(0, 5), null, 2));

const first = arts.find(a => a.url);
if (first) {
    const d = await get(first.url.startsWith('http') ? first.url : site + first.url);
    fs.writeFileSync('tools/91cg-sstp-detail.html', typeof d.data === 'string' ? d.data : JSON.stringify(d.data));
    const $$ = load(d.data);
    const players = [];
    $$('div.dplayer').each((_, el) => {
        players.push(($$(el).attr('data-config') || '').slice(0, 400));
    });
    const iframes = [];
    $$('iframe').each((_, el) => iframes.push($$(el).attr('src') || ''));
    const videos = [];
    $$('video, source').each((_, el) => videos.push($$(el).attr('src') || ''));
    const m3u8 = String(d.data).match(/https?:[^"'\\\s]+\.m3u8[^"'\\\s]*/g) || [];
    console.log('detail', d.status, 'len', String(d.data).length);
    console.log('dplayer', players.length, players[0] || '');
    console.log('iframe', iframes.slice(0, 5));
    console.log('video', videos.slice(0, 5));
    console.log('m3u8', m3u8.slice(0, 5));
    const classes = [];
    $$('[class]').each((_, el) => {
        const c = $$(el).attr('class') || '';
        if (/player|video|dplayer|live|hls/i.test(c)) classes.push(c);
    });
    console.log('playerish', [...new Set(classes)].slice(0, 20));
}
