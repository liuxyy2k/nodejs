import axios from 'axios';
import https from 'https';
import { load } from 'cheerio';

const HOSTS = ['https://javgg.co', 'https://javgg.net', 'https://javgg.club'];
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const CLASSES = [
    { type_name: '最新', type_id: 'new-post' },
    { type_name: '今日热门', type_id: '/trending/?sort=today' },
    { type_name: '本周热门', type_id: '/trending/?sort=weekly' },
    { type_name: '本月热门', type_id: '/trending/?sort=monthly' },
    { type_name: '无码', type_id: 'tag/hd-uncensored' },
    { type_name: '有码', type_id: 'tag/censored' },
    { type_name: '英字', type_id: 'tag/english-subtitle' },
    { type_name: '中字', type_id: 'tag/chinese-subtitle' },
    { type_name: '素人', type_id: 'tag/amateur-jav' },
    { type_name: '随机', type_id: 'random/' },
    { type_name: '中出', type_id: 'genre/creampie' },
    { type_name: '巨乳', type_id: 'genre/big-tits' },
    { type_name: '人妻', type_id: 'genre/married-woman' },
    { type_name: '美少女', type_id: 'genre/beautiful-girl' },
    { type_name: '熟女', type_id: 'genre/mature-woman' },
    { type_name: '4K', type_id: 'genre/4k' },
];

let host = HOSTS[0];
const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: `${host}/`,
    Connection: 'keep-alive',
};

function cleanText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function fixUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return host + url;
    return url;
}

function b64decodeSafe(s) {
    try {
        const padded = String(s || '').replace(/ /g, '+') + '='.repeat((4 - (String(s).length % 4)) % 4);
        return Buffer.from(padded, 'base64').toString('utf8');
    } catch {
        return '';
    }
}

async function getHtml(url, timeout = 12000) {
    for (const h of HOSTS) {
        let realUrl = url;
        if (url.includes(host)) realUrl = url.replace(host, h);
        else if (!/^https?:\/\//i.test(url)) realUrl = `${h.replace(/\/$/, '')}/${String(url).replace(/^\//, '')}`;
        try {
            const resp = await axios.get(realUrl, {
                headers: { ...headers, Referer: `${h}/` },
                timeout,
                validateStatus: () => true,
                maxRedirects: 5,
                responseType: 'text',
            });
            const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            if (resp.status === 200 && text.length > 1500) {
                host = h;
                headers.Referer = `${h}/`;
                return text;
            }
        } catch {
            continue;
        }
    }
    return '';
}

function parseList(html) {
    const list = [];
    const $ = load(html);
    $('article').each((_, element) => {
        const title = $(element).find('.titlecontent').text().trim();
        const url = $(element).find('a').eq(0).attr('href');
        const pic = $(element).find('img').attr('src');
        const remarks = $(element).find('.data span').text().trim();
        list.push({
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remarks,
        });
    });
    return list;
}

function getPic(html, vodId = '') {
    const escaped = String(vodId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
        new RegExp(`<img[^>]+(?:data-src|data-original|src)=["']([^"']+)["'][^>]*(?:alt=["'][^"']*${escaped}[^"']*["'])?`, 'i'),
        /<img[^>]+(?:data-src|data-original|src)=["']([^"']+(?:jpg|jpeg|png|webp)[^"']*)["']/i,
        /property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
        /data-src=["']([^"']+)["']/i,
        /src=["']([^"']+(?:cover|poster|thumb|jav)[^"']*)["']/i,
    ];
    for (const pat of patterns) {
        const m = html.match(pat);
        if (!m) continue;
        const pic = fixUrl(m[1]);
        if (pic.includes('http') && !pic.endsWith('.svg')) return pic;
    }
    return '';
}

async function init() {
    return {};
}

async function home() {
    const html = await getHtml(host);
    return { class: CLASSES, list: html ? parseList(html) : [] };
}

async function category(inReq) {
    const tid = String(inReq.body.id || 'home');
    const pg = String(inReq.body.page || 1);
    const url =
        tid === 'home'
            ? pg === '1'
                ? host
                : `${host}/page/${pg}/`
            : pg === '1'
              ? `${host}/${tid}/`
              : `${host}/${tid}/page/${pg}/`;
    const html = await getHtml(url);
    const list = html ? parseList(html) : [];
    return { list, page: pg, pagecount: 9999, limit: 40, total: 999999 };
}

function requestOrigin(inReq) {
    const proto = String(inReq.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const reqHost = inReq.headers['x-forwarded-host'] || inReq.headers.host;
    return `${proto}://${reqHost}`;
}

function playmateId(url) {
    const m = String(url || '').match(/playmate\.to\/embed\/([^/?#]+)/i);
    return m ? m[1] : '';
}

function collectEmbeds(html) {
    const $ = load(html || '');
    const seen = new Set();
    const list = [];
    $('iframe#playaa, iframe.metaframe').each((_, el) => {
        const src = fixUrl($(el).attr('src') || $(el).attr('data-src') || '');
        if (!src || seen.has(src)) return;
        seen.add(src);
        list.push(src);
    });
    return list;
}

function allowedMedia(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host.endsWith('playmate.to') || host.endsWith('plauymito.live') || host.endsWith('javgg.co');
    } catch {
        return false;
    }
}

function isPlaylist(url) {
    return /\.(m3u8|txt)(\?|$)/i.test(url);
}

function rewritePlaylist(text, playlistUrl, origin) {
    return String(text)
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith('#')) {
                return line.replace(/URI="([^"]+)"/g, (full, uri) => {
                    let abs = '';
                    try {
                        abs = new URL(uri, playlistUrl).href;
                    } catch {
                        return full;
                    }
                    if (!allowedMedia(abs)) return full;
                    const route = isPlaylist(abs) ? 'm3u8' : 'seg';
                    return `URI="${origin}/spider/javgg/3/${route}?u=${encodeURIComponent(abs)}"`;
                });
            }
            let abs = '';
            try {
                abs = new URL(trimmed, playlistUrl).href;
            } catch {
                return line;
            }
            if (!allowedMedia(abs)) return line;
            const route = isPlaylist(abs) ? 'm3u8' : 'seg';
            return `${origin}/spider/javgg/3/${route}?u=${encodeURIComponent(abs)}`;
        })
        .join('\n');
}

async function resolvePlaymate(id) {
    if (!id) return '';
    const resp = await axios.post(
        'https://playmate.to/api/s',
        { c: id, d: 'web' },
        {
            headers: {
                'User-Agent': UA,
                Origin: 'https://playmate.to',
                Referer: `https://playmate.to/embed/${id}`,
                'Content-Type': 'application/json',
            },
            timeout: 15000,
            validateStatus: () => true,
        }
    );
    return String(resp.data?.sx || '').trim();
}

async function detail(inReq) {
    const vodId = inReq.body.id;
    const html = await getHtml(`${vodId}`);
    const $ = load(html);
    const title = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const content = $('meta[name="description"]').attr('content') || '';
    const embeds = collectEmbeds(html);
    const pm = embeds.find((src) => playmateId(src)) || '';
    const from = [];
    const urls = [];
    if (pm) {
        from.push('Playmate');
        urls.push(`正片$${pm}`);
    }
    embeds.forEach((src, i) => {
        if (src === pm) return;
        from.push(`线路${i + 1}`);
        urls.push(`正片$${src}`);
    });
    if (!from.length) {
        from.push('Javgg');
        urls.push(`正片$${vodId}`);
    }
    return {
        list: [
            {
                vod_id: vodId,
                vod_name: title,
                vod_pic: pic,
                vod_content: content,
                vod_play_from: from.join('$$$'),
                vod_play_url: urls.join('$$$'),
            },
        ],
    };
}

async function search(inReq) {
    const key = encodeURIComponent(String(inReq.body.wd || ''));
    const pg = String(inReq.body.page || 1);
    const url = pg === '1' ? `${host}/?s=${key}` : `${host}/page/${pg}/?s=${key}`;
    const html = await getHtml(url);
    return { list: html ? parseList(html) : [], page: pg };
}

async function play(inReq) {
    const header = { 'User-Agent': UA, Referer: 'https://playmate.to/' };
    let raw = String(inReq.body.id || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();
    let id = playmateId(raw);
    if (!id && /^[A-Za-z0-9]+$/.test(raw) && raw.length >= 8) id = raw;
    if (!id && /^https?:\/\//i.test(raw) && /javgg\.(co|net|club)/i.test(raw)) {
        const html = await getHtml(raw);
        const embed = collectEmbeds(html).find((src) => playmateId(src));
        id = playmateId(embed);
    }
    const sx = await resolvePlaymate(id);
    if (!sx) return { parse: 0, jx: 0, url: '', header };
    return {
        parse: 0,
        jx: 0,
        url: sx,
        header,
    };
}

async function m3u8(inReq, reply) {
    const target = String(inReq.query.u || '').trim();
    if (!allowedMedia(target)) {
        reply.code(403);
        return 'forbidden';
    }
    let resp;
    try {
        resp = await axios.get(target, {
            headers: { 'User-Agent': UA, Referer: 'https://playmate.to/' },
            timeout: 20000,
            responseType: 'text',
            validateStatus: () => true,
        });
    } catch {
        reply.code(502);
        return 'playlist failed';
    }
    const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    if (resp.status >= 400 || !text.includes('#EXTM3U')) {
        reply.code(502);
        return 'playlist failed';
    }
    reply.header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'no-store');
    return reply.send(rewritePlaylist(text, target, requestOrigin(inReq)));
}

async function seg(inReq, reply) {
    const target = String(inReq.query.u || '').trim();
    if (!allowedMedia(target)) {
        reply.code(403);
        return 'forbidden';
    }
    const reqHeaders = { 'User-Agent': UA, Referer: 'https://playmate.to/' };
    if (inReq.headers.range) reqHeaders.Range = String(inReq.headers.range);
    let resp;
    try {
        resp = await axios.get(target, {
            headers: reqHeaders,
            responseType: 'arraybuffer',
            timeout: 20000,
            validateStatus: () => true,
        });
    } catch {
        reply.code(502);
        return 'segment failed';
    }
    const buf = Buffer.isBuffer(resp.data) ? resp.data : Buffer.from(resp.data || []);
    if (resp.status >= 400 || buf.length < 188 || buf[0] !== 0x47) {
        reply.code(502);
        return 'segment failed';
    }
    reply.code(resp.status === 206 ? 206 : 200);
    reply.header('Content-Type', 'video/mp2t');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'no-store');
    if (resp.headers['content-range']) reply.header('Content-Range', resp.headers['content-range']);
    return reply.send(buf);
}

export default {
    meta: {
        key: 'javgg',
        name: '🌸JavGG',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.get('/m3u8', m3u8);
        fastify.get('/seg', seg);
        fastify.post('/search', search);
    },
};
