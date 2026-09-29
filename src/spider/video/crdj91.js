import axios from 'axios';
import crypto from 'crypto';

const DEFAULT_HOST = 'https://91crdj.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const EPISODE_RE = /\/(?:duanju|manju|zhenrenju)\/\d+-[^/]+\/(\d+)\/?$/;
const LIST_HREF_RE =
    /href="(https?:\/\/[^"]*?\/(?:duanju|manju|zhenrenju)\/(\d+)-([^/"]+)\/)"/g;
const EP_HREF_RE =
    /href="(https?:\/\/[^"]*?\/(?:duanju|manju|zhenrenju)\/\d+-[^/"]+\/(\d+)\/)"/g;

const PORT   = process.env.DEV_HTTP_PORT || 9988;

const CHANNELS = [
    { type_id: 'duanju', type_name: '成人短剧', path: '/duanju/' },
    { type_id: 'manju', type_name: '成人漫剧', path: '/manju/' },
    { type_id: 'zhenrenju', type_name: '真人剧', path: '/zhenrenju/' },
    { type_id: 'aiduanju', type_name: 'AI短剧', path: '/biaoqian/aiduanju/' },
    { type_id: '91duanju', type_name: '91短剧', path: '/biaoqian/91duanju/' },
    { type_id: 'chengrenduanju', type_name: '成人短剧标签', path: '/biaoqian/chengrenduanju/' },
    { type_id: 'wudaduanju', type_name: '武打短剧', path: '/biaoqian/wudaduanju/' },
    { type_id: 'xuanhuanduanju', type_name: '玄幻短剧', path: '/biaoqian/xuanhuanduanju/' },
    { type_id: 'xianxiaduanju', type_name: '仙侠短剧', path: '/biaoqian/xianxiaduanju/' },
];

const CHANNEL_MAP = Object.fromEntries(CHANNELS.map((c) => [c.type_id, c]));

let host = DEFAULT_HOST;

function playHeaders() {
    return {
        'User-Agent': UA,
        Referer: `${host}/`,
        Origin: host,
    };
}

function pageHeaders(referer) {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: referer || `${host}/`,
    };
}

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function absUrl(u) {
    if (!u) return '';
    u = String(u).trim().replace(/\\\//g, '/');
    if (u.startsWith('//')) return `https:${u}`;
    try {
        return new URL(u, `${host}/`).href;
    } catch {
        return u;
    }
}

function unescapePlay(u) {
    return String(u || '')
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/');
}

function isDirectVideo(url) {
    return /\.(m3u8|mp4)(\?|$)/i.test(String(url || ''));
}

async function request(url, referer) {
    try {
        const resp = await axios.get(url, {
            headers: pageHeaders(referer),
            timeout: 18000,
            validateStatus: () => true,
            responseType: 'text',
        });
        if (resp.status >= 400) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch (e) {
        console.log(`[91短剧] 请求失败: ${url} -> ${e.message}`);
        return '';
    }
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

function aesDecrypt(buf) {
    const key      = Buffer.from('f5d965df75336270');
    const iv       = Buffer.from('97b60394abc2fbe1');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function proxyImgUrl(raw) {
    return `http://127.0.0.1:${PORT}/spider/crdj91/3/img?url=${encodeURIComponent(e64(raw))}`;
}

function parseList(html) {
    const videos = [];
    const seen = new Set();
    if (!html) return videos;

    let m;
    LIST_HREF_RE.lastIndex = 0;
    while ((m = LIST_HREF_RE.exec(html))) {
        const href = m[1];
        const slug = m[3];
        if (EPISODE_RE.test(href.replace(/\/$/, ''))) continue;
        if (seen.has(href)) continue;
        seen.add(href);

        const block = html.slice(Math.max(0, m.index - 400), m.index + m[0].length + 600);
        let title = block.match(/(?:title|alt)=["']([^"']{2,120})["']/)?.[1]?.trim() || '';
        if (!title || title === '立即观看' || title === '从头看') title = slug;
        const pic = block.match(
            /(?:src|data-src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
        )?.[1];

        videos.push({
            vod_id: href,
            vod_name: title.slice(0, 80),
            vod_pic: proxyImgUrl(absUrl(pic)),
            vod_remarks: '',
        });
    }
    return videos;
}

function extractM3u8(html) {
    if (!html) return '';
    const current = html.match(/"current"\s*:\s*\{[^}]*?"src"\s*:\s*"([^"]+)"/);
    if (current) {
        const u = unescapePlay(current[1]);
        if (u.startsWith('http')) return u;
    }
    const src = html.match(/"src"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/);
    if (src) return unescapePlay(src[1]);
    const m3u8 = html.match(/(https?:\/\/[^\s"'<>]+?\.m3u8[^\s"'<>]*)/);
    if (m3u8) return unescapePlay(m3u8[1]);
    const mp4 = html.match(/(https?:\/\/[^\s"'<>]+?\.mp4[^\s"'<>]*)/);
    return mp4 ? unescapePlay(mp4[1]) : '';
}

function pagecountFrom(html, pg, videos, minCount) {
    if (html.includes('下一页') || html.includes(`/page/${pg + 1}/`)) return pg + 1;
    if (videos.length >= minCount) return pg + 1;
    return pg;
}

async function init(inReq) {
    const conf = parseExtend(inReq.body?.extend);
    if (conf.host) host = String(conf.host).replace(/\/+$/, '');
    return {};
}

async function home() {
    const html = await request(`${host}/`);
    return {
        class: CHANNELS.map(({ type_id, type_name }) => ({ type_id, type_name })),
        list: parseList(html).slice(0, 24),
        filters: {},
    };
}

async function category(inReq) {
    let pg = parseInt(inReq.body.page, 10);
    if (!Number.isFinite(pg) || pg < 1) pg = 1;
    const tid = String(inReq.body.id || 'duanju');
    const path = CHANNEL_MAP[tid]?.path || '/duanju/';
    const url = pg <= 1 ? `${host}${path}` : `${host}${path.replace(/\/+$/, '')}/page/${pg}/`;
    const html = await request(url);
    const videos = parseList(html);
    return {
        list: videos,
        page: pg,
        pagecount: pagecountFrom(html, pg, videos, 10),
        limit: 24,
        total: 9999,
    };
}

async function detail(inReq) {
    let pageUrl = inReq.body.id;
    if (Array.isArray(pageUrl)) pageUrl = pageUrl[0];
    pageUrl = absUrl(String(pageUrl || ''));
    if (!pageUrl) return { list: [] };

    const html = await request(pageUrl);
    if (!html) return { list: [] };

    let name = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1]?.trim() || '';
    if (!name) {
        const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
        name = title.replace(/\s*[-|—].*$/, '').trim();
    }

    let pic =
        html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
        html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1] ||
        html.match(/(?:src|data-src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i)?.[1] ||
        '';
    const desc =
        html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim() ||
        html.match(/content=["']([^"']+)["'][^>]*property=["']og:description["']/i)?.[1]?.trim() ||
        '';

    const eps = [];
    const seen = new Set();
    let m;
    EP_HREF_RE.lastIndex = 0;
    while ((m = EP_HREF_RE.exec(html))) {
        const href = m[1];
        if (seen.has(href)) continue;
        seen.add(href);
        eps.push({ n: parseInt(m[2], 10), name: `第${m[2]}集`, url: href });
    }
    eps.sort((a, b) => a.n - b.n);
    if (!eps.length) {
        eps.push({ n: 1, name: '第1集', url: `${pageUrl.replace(/\/+$/, '')}/1/` });
    }

    return {
        list: [
            {
                vod_id: pageUrl,
                vod_name: name || '短剧',
                vod_pic: absUrl(pic),
                vod_remarks: `共${eps.length}集`,
                vod_content: desc.slice(0, 500),
                vod_play_from: '91短剧',
                vod_play_url: eps.map((e) => `${e.name}$${e.url}`).join('#'),
            },
        ],
    };
}

async function search(inReq) {
    let pg = parseInt(inReq.body.page, 10);
    if (!Number.isFinite(pg) || pg < 1) pg = 1;
    const key = String(inReq.body.wd || '').trim();
    if (!key) return { list: [], page: 1, pagecount: 1, limit: 24, total: 0 };
    const q = encodeURIComponent(key);
    const url = pg > 1 ? `${host}/search/${q}/page/${pg}/` : `${host}/search/${q}/`;
    const html = await request(url);
    const videos = parseList(html);
    return {
        list: videos,
        page: pg,
        pagecount: pagecountFrom(html, pg, videos, 8),
        limit: 24,
        total: videos.length,
    };
}

async function play(inReq) {
    const header = playHeaders();
    let play = String(inReq.body.id || '').trim();
    if (!play) return { parse: 0, url: '', header };
    play = absUrl(play);
    if (isDirectVideo(play)) return { parse: 0, url: play, header };

    const html = await request(play, `${host}/`);
    const real = extractM3u8(html);
    if (real) return { parse: 0, url: real, header };
    return { parse: 1, jx: 1, url: play, header };
}

async function imgProxy(inReq, reply) {
    try {
        let raw = d64(inReq.query.url);
        const match = raw.match(/loadBannerDirect\('([^']*)'/);
        if (match) raw = match[1];
        if (!raw) return reply.code(404).send('');

        const resp = await axios.get(raw, {
            headers: {
                'User-Agent': UA,
                'Referer':    `${DEFAULT_HOST}/`,
                'Origin':     DEFAULT_HOST,
            },
            responseType: 'arraybuffer',
            timeout:      10000,
        });

        const decrypted = aesDecrypt(Buffer.from(resp.data));
        let   ct        = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8')  ct = 'image/gif';

        reply.header('Content-Type', ct).send(decrypted);
    } catch (e) {
        console.error('imgProxy error:', e.message);
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'crdj91',
        name: '📖91短剧',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img',  imgProxy);
    },
};
