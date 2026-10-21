import { load } from 'cheerio';
import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const site = 'https://www4.24-jav.com';

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const headers = {
    'User-Agent': UA,
    Referer: `${site}/`,
};

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers,
        // httpsAgent: agent,
        timeout: 25000,
        validateStatus: () => true,
        responseType: 'text',
    });
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function absUrl(href) {
    const s = String(href || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return site + (s.startsWith('/') ? s : `/${s}`);
}

function pagePath(id) {
    let p = String(id || '').trim();
    if (/^https?:\/\//i.test(p)) {
        try {
            p = new URL(p).pathname;
        } catch {
            return p;
        }
    }
    return p.startsWith('/') ? p : `/${p}`;
}

function tokenFromEmbed(embedUrl) {
    const m = String(embedUrl || '').match(/mee18player\.com\/(?:play|p2p-hls)\/([a-f0-9]+)/i);
    return m ? m[1] : '';
}

function streamFromEmbed(embedUrl) {
    const token = tokenFromEmbed(embedUrl);
    if (!token) return '';
    if (/p2p-hls/i.test(embedUrl)) return `https://mee18player.com/hlsr2/${token}/master.m3u8`;
    return `https://mee18player.com/hls/${token}/master.m3u8`;
}

async function playLinesForPath(id) {
    const path = pagePath(id);
    const pageUrl = absUrl(path);
    const html = await request(pageUrl);
    const $ = load(html);
    const mirrors = [];
    $('.mirror li a[href]').each((_, el) => {
        const name = $(el).text().replace(/\s+/g, ' ').trim();
        const href = $(el).attr('href') || '';
        if (href) mirrors.push({ name: name || `线路${mirrors.length + 1}`, url: absUrl(href) });
    });
    if (!mirrors.length) mirrors.push({ name: '播放', url: pageUrl });

    const lines = [];
    for (const m of mirrors) {
        const h = m.url === pageUrl ? html : await request(m.url);
        const d = load(h);
        const iframe = d('iframe[src*="mee18player"]').attr('src') || d('iframe').first().attr('src') || '';
        const stream = streamFromEmbed(iframe);
        if (stream) lines.push(`${m.name}$${stream}`);
    }
    return lines;
}

function parseVods($) {
    const list = [];
    $('article').each((_, el) => {
        list.push({
            vod_id: $(el).find('a').eq(0).attr('href') || '',
            vod_name: $(el).find('.entry-title').text().trim() || '',
            vod_pic: $(el).find('img').attr('src') || '',
            vod_remarks: $(el).find('.overlay').text().trim() || '',
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
            { type_id: '/', type_name: '最新视频' },
            { type_id: '/category/subthai/', type_name: '泰语字幕' },
            { type_id: '/genre/big-tits/', type_name: '大胸' },
            { type_id: '/genre/beautiful-girl/', type_name: '美丽女孩' },
            { type_id: '/genre/married-woman/', type_name: '已婚妇女' },
        ],
        filters: {},
    };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    let tid = String(inReq.body.id || '/').trim() || '/';
    if (!tid.startsWith('/')) tid = `/${tid}`;
    if (!tid.endsWith('/')) tid += '/';
    const url = `${site}${tid}page/${page}/`;
    const $ = load(await request(url));
    return { page, pagecount: 9999999, list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const path = pagePath(id);
    const pageUrl = absUrl(path);
    const $ = load(await request(pageUrl));
    const lines = await playLinesForPath(path);

    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim() || '',
            vod_pic: $('meta[property="og:image"]').attr('content') || '',
            vod_content: $('meta[property="og:description"]').attr('content') || '',
            vod_play_from: lines.length ? '24Jav' : '',
            vod_play_url: lines.join('#'),
        }],
    };
}

async function play(inReq) {
    const fail = { parse: 0, url: '', header: { 'User-Agent': UA, Referer: `${site}/` } };
    const raw = String((inReq.body && inReq.body.id) || '').trim();
    if (!raw) return fail;

    if (/^https?:\/\/.+\.(m3u8|mp4)/i.test(raw)) {
        return {
            parse: 0,
            url: raw,
            header: {
                'User-Agent': UA,
                Referer: /mee18player\.com/i.test(raw) ? 'https://mee18player.com/' : `${site}/`,
            },
        };
    }

    const stream = streamFromEmbed(raw);
    if (stream) {
        return { parse: 0, url: stream, header: { 'User-Agent': UA, Referer: 'https://mee18player.com/' } };
    }

    const lines = await playLinesForPath(raw);
    const url = (lines[0] || '').split('$').slice(1).join('$') || '';
    if (!url) return fail;
    return { parse: 0, url, header: { 'User-Agent': UA, Referer: 'https://mee18player.com/' } };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search?q=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: '24jav', name: '🌸Jav·24', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
