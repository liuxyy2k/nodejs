import { load } from 'cheerio';
import req from '../../util/req.js';
import axios from 'axios';  
import { config } from './config.js';

const FLARE_URL = config.FLARE_URL;

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://jav.wine';

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const headers = {
    'User-Agent': UA,
    Referer: `${site}/`,
};

async function request(reqUrl, referer = `${site}/`) {
    const resp = await axios.get(reqUrl, {
        headers: { ...headers, Referer: referer },
        // httpsAgent: agent,
        timeout: 20000,
    });
    return resp.data;
}

function unpackPacker(html) {
    const m = String(html).match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?return p\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)\)\)/);
    if (!m) return '';
    let p = m[1];
    const base = parseInt(m[2], 10);
    let count = parseInt(m[3], 10);
    const dict = m[4].split('|');
    while (count--) if (dict[count]) p = p.replace(new RegExp('\\b' + count.toString(base) + '\\b', 'g'), dict[count]);
    return p;
}

function mediaFromHtml(html) {
    const unpacked = unpackPacker(html);
    const text = unpacked || String(html);
    const m3u8 = text.match(/https?:\/\/[^"'\s\\]+?\.m3u8[^"'\s\\]*/);
    if (m3u8) return m3u8[0];
    const cfg = String(html).match(/"m3u8"\s*:\s*"([^"]+)"/);
    if (cfg) return JSON.parse(`"${cfg[1]}"`);
    const master = text.match(/https?:\/\/[^"'\s\\]+?master\.txt[^"'\s\\]*/);
    return master ? master[0] : '';
}

function nextPage(html, base) {
    const iframe = String(html).match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframe?.[1] && iframe[1] !== 'about:blank') return new URL(iframe[1], base).href;
    const assigned = String(html).match(/videoFrame\.src\s*=\s*["']([^"']+)["']/);
    if (assigned?.[1]) return new URL(assigned[1], base).href;
    return '';
}

async function playmate(url) {
    const code = String(url).match(/playmate\.to\/embed\/([^/?#]+)/)?.[1];
    if (!code) return '';
    const resp = await axios.post('https://playmate.to/api/s', { filecode: code }, {
        headers: {
            'User-Agent': UA,
            Referer: url,
            Origin: 'https://playmate.to',
            'Content-Type': 'application/json',
        },
        // httpsAgent: agent,
        timeout: 20000,
        validateStatus: () => true,
    });
    return resp.data?.sx || '';
}

function parseVods($) {
    const list = [];
    $('article').each((_, el) => {
        list.push({
            vod_id: $(el).find('a').eq(0).attr('href') || '',
            vod_name: $(el).find('.entry-title').text().trim() || $(el).find('h2').text().trim() || '',
            vod_pic: $(el).find('img').attr('src') || '',
            vod_remarks: 'Jav',
        });
    });
    return list;
}

async function init() {
    return {};
}

async function home() {
    return {
        class: [
            { type_id: '', type_name: '正在观看' },
            { type_id: 'new', type_name: '最新发行' },
            { type_id: 'hot', type_name: '热门视频' },
            { type_id: '/genre/beautiful-girl/', type_name: '美女' },
            { type_id: '/genre/debut-work/', type_name: '处女座' },
            { type_id: '/jav-uncensored/', type_name: '无码' },
            
        ],
        filters: {},
    };
}

async function category(inReq) {
    let id = `${site}${inReq.body.id}`;
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    let url = ''
    if (inReq.body.id === '') {
        url = `${site}`;
    } else if (inReq.body.id === 'new') {
        url = `${site}/page/${page}/?filter=latest`;
    } else if (inReq.body.id === 'hot') {
        url = `${site}/page/${page}/?filter=popular`;
    } else {
        url = `${site}${inReq.body.id}page/${page}/`;
    }
    const $ = load(await request(`${url}`));
    return { page, pagecount: 9999999, list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const $ = load(await request(id));
    let playUrl = '';
    const vod_play_from = [];
    const vod_play_url = [];
    $('.acf-buttons button').each((_, el) => {
        const name = $(el).text().trim();
        const onclick = $(el).attr('onclick') || '';
        const match = onclick.match(/loadServer\(['"]([^'"]+)['"]/);
        if (match) {
            const url = match[1];
            vod_play_from.push(name);
            vod_play_url.push(`${name}$${url}`);
        }
    });
    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content') || '',
            vod_pic: $('meta[property="og:image"]').attr('content') || '',
            vod_content: $('meta[property="og:description"]').attr('content') || '',
            vod_play_from: vod_play_from.join('$$$'),
            vod_play_url: vod_play_url.join('$$$'),
        }],
    };
}

async function play(inReq) {
    let page = String(inReq.body.id || '').trim();
    let referer = `${site}/`;
    for (let i = 0; i < 4; i++) {
        if (/playmate\.to\/embed\//.test(page)) {
            const url = await playmate(page);
            if (url) return { parse: 0, url, header: { 'User-Agent': UA, Referer: 'https://playmate.to/' } };
        }
        const html = await request(page, referer);
        const media = mediaFromHtml(html);
        if (media) {
            return { parse: 0, url: media, header: { 'User-Agent': UA, Referer: new URL(page).origin + '/' } };
        }
        const next = nextPage(html, page);
        if (!next || next === page) break;
        referer = page;
        page = next;
    }
    return { parse: 0, url: page, header: { 'User-Agent': UA, Referer: referer } };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search?keyword=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'javmine', name: '🌸JavMine', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
