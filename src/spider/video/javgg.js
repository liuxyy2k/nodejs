import axios from 'axios';
import https from 'https';

const HOSTS = ['https://javgg.co', 'https://javgg.net', 'https://javgg.club'];
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const CLASSES = [
    { type_name: '最新', type_id: 'home' },
    { type_name: '无码', type_id: 'tag/hd-uncensored' },
    { type_name: '有码', type_id: 'tag/censored' },
    { type_name: '英字', type_id: 'tag/english-subtitle' },
    { type_name: '中字', type_id: 'tag/chinese-subtitle' },
    { type_name: '素人', type_id: 'tag/amateur-jav' },
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
    const seen = new Set();
    const items = html.matchAll(
        /<img[^>]+(?:data-src|data-original|src)=["']([^"']+)["'][^>]*>.*?(?:href=["'][^"']*?\/jav\/([a-zA-Z0-9\-_]+)\/?["'][^>]*>\s*([A-Z0-9\-_]+)|\/jav\/([a-zA-Z0-9\-_]+)\/)/gis,
    );
    for (const it of items) {
        const pic = fixUrl(it[1]);
        const vodId = String(it[2] || it[4] || '')
            .replace(/^[-_]+|[-_]+$/g, '')
            .toLowerCase();
        const name = it[3] || vodId;
        if (!vodId || vodId.length < 4 || seen.has(vodId)) continue;
        seen.add(vodId);
        list.push({
            vod_id: vodId,
            vod_name: cleanText(name) || vodId.toUpperCase(),
            vod_pic: pic.includes('http') ? pic : '',
            vod_remarks: '',
        });
    }
    if (list.length >= 5) return list;

    const fallbacks = [
        /href=["']([^"']*?\/jav\/([a-zA-Z0-9\-_]+)\/?)["'][^>]*>\s*([A-Z0-9\-_]+)/gis,
        /\/jav\/([a-zA-Z0-9\-_]+)\/["'][^>]*>\s*([A-Z0-9\-_]+)/gis,
    ];
    for (const pat of fallbacks) {
        for (const it of html.matchAll(pat)) {
            const groups = [...it].slice(1);
            const vodRaw = groups.length >= 3 ? groups[1] : groups[0];
            const nameRaw = groups.length >= 3 ? groups[2] : groups[1] || vodRaw;
            const vodId = String(vodRaw)
                .replace(/[^a-zA-Z0-9\-_]/g, '')
                .replace(/^[-_]+|[-_]+$/g, '')
                .toLowerCase();
            if (!vodId || vodId.length < 4 || seen.has(vodId)) continue;
            seen.add(vodId);
            list.push({
                vod_id: vodId,
                vod_name: cleanText(nameRaw) || vodId.toUpperCase(),
                vod_pic: '',
                vod_remarks: '',
            });
        }
        if (list.length >= 20) break;
    }
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

async function detail(inReq) {
    let vodId = inReq.body.id;
    if (Array.isArray(vodId)) vodId = vodId[0];
    vodId = String(vodId || '').trim();
    if (!vodId) return { list: [] };
    const url = `${host}/jav/${vodId}/`;
    const html = await getHtml(url);
    if (!html) return { list: [] };

    const titleM = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = titleM ? cleanText(titleM[1]) : vodId.toUpperCase();
    const pic = getPic(html, vodId);
    let servers = [...html.matchAll(/(?:Server|server)\s*([A-Z]{2})/gi)].map((m) => m[1]);
    if (!servers.length) servers = ['VH', 'TB', 'SW'];

    const playFrom = [];
    const playUrl = [];
    for (const s of servers) {
        playFrom.push(s);
        playUrl.push(`${s}$${url}#${s}`);
    }
    if (!playFrom.length) {
        playFrom.push('JavGG');
        playUrl.push(`正片$${url}`);
    }
    return {
        list: [
            {
                vod_id: vodId,
                vod_name: title,
                vod_pic: pic,
                vod_content: '',
                vod_play_from: playFrom.join('$$$'),
                vod_play_url: playUrl.join('$$$'),
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
    let id = String(inReq.body.id || '').trim();
    const result = { parse: 1, url: id, header: headers };
    const low = id.toLowerCase();
    if (['.m3u8', '.mp4', 'streamwish', 'vidhide', 'filemoon', 'dood'].some((x) => low.includes(x))) {
        result.parse = low.includes('.m3u8') || low.includes('.mp4') ? 0 : 1;
        return result;
    }
    if (id.includes('javcode.net')) {
        const m = id.match(/javcode\.net\/(?:rg|download)\/([A-Za-z0-9+/=]+)/);
        if (m) {
            const decoded = b64decodeSafe(m[1]);
            if (decoded) result.url = decoded.startsWith('http') ? decoded : fixUrl(decoded);
        }
        return result;
    }
    if (id.includes('/jav/') || !/^https?:\/\//i.test(id)) {
        const url = /^https?:\/\//i.test(id)
            ? id.split('#')[0]
            : `${host}/jav/${id.split('#')[0].replace(/^\/+|\/+$/g, '')}/`;
        const html = await getHtml(url);
        if (html) {
            const m3u8 = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
            if (m3u8) {
                result.url = m3u8[1];
                result.parse = 0;
                return result;
            }
            const iframe = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (iframe) {
                result.url = fixUrl(iframe[1]);
                return result;
            }
        }
        result.url = url;
    }
    return result;
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
        fastify.post('/search', search);
    },
};
