import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://vqkcxj.asia';

const CLASSES = [
    { type_id: '/zh/new/index.html', type_name: '最新' },
    { type_id: '/zh/hot/index.html', type_name: '热门' },
    { type_id: '/zh/list/44002.html', type_name: '中文字幕' },
    { type_id: '/zh/list/44247.html', type_name: '无码破解' },
    { type_id: '/zh/list/44251.html', type_name: '英文字幕' },
    { type_id: '/zh/list/80001.html', type_name: 'FC2' },
    { type_id: '/zh/list/80002.html', type_name: 'HEYZO' },
    { type_id: '/zh/list/80003.html', type_name: 'Tokyo-Hot' },
    { type_id: '/zh/list/80004.html', type_name: '1pondo' },
    { type_id: '/zh/list/80005.html', type_name: 'Caribbeancom' },
    { type_id: '/zh/list/80013.html', type_name: 'SIRO' },
    { type_id: '/zh/list/80014.html', type_name: 'LUXU' },
    { type_id: '/zh/list/80015.html', type_name: 'GANA' },
    { type_id: '/zh/tags?key=4K', type_name: '4K' },
    { type_id: '/zh/tags?key=美少女', type_name: '美少女' },
    { type_id: '/zh/tags?key=素人', type_name: '素人' },
];

function utf8Decode(str) {
    let out = '';
    let i = 0;
    while (i < str.length) {
        const c = str.charCodeAt(i++);
        switch (c >> 4) {
            case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
                out += str.charAt(i - 1);
                break;
            case 12:
            case 13: {
                const c2 = str.charCodeAt(i++);
                out += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
                break;
            }
            case 14: {
                const c2 = str.charCodeAt(i++);
                const c3 = str.charCodeAt(i++);
                out += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
                break;
            }
            default:
                break;
        }
    }
    return out;
}

function decodePage(html) {
    const m = String(html || '').match(/[A-Za-z_$][\w$]*\("([0-9a-fA-F]{200,})","%"\)/);
    if (!m) return String(html || '');
    try {
        return utf8Decode(unescape(`%${m[1].match(/.{2}/g).join('%')}`));
    } catch {
        return String(html || '');
    }
}

function abs(path) {
    const s = String(path || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return site + (s.startsWith('/') ? s : `/${s}`);
}

function pageOf(body) {
    const page = parseInt(body?.page ?? body?.pg ?? 1, 10) || 1;
    return page > 0 ? page : 1;
}

function listUrl(tid, page) {
    let path = String(tid || '/zh/new/index.html').trim() || '/zh/new/index.html';
    if (/^https?:\/\//i.test(path)) {
        const u = new URL(path);
        path = u.pathname + u.search;
    }
    if (!path.startsWith('/')) path = `/${path}`;
    if (!path.startsWith('/zh')) path = `/zh${path}`;
    const q = path.indexOf('?');
    const search = q >= 0 ? path.slice(q) : '';
    let base = q >= 0 ? path.slice(0, q) : path;
    if (search && base.endsWith('/')) base = base.slice(0, -1);
    if (page > 1 && base.endsWith('.html')) base = base.replace(/\.html$/, `-${page}.html`);
    if (page > 1 && search) {
        const u = new URL(search, site);
        if (!u.searchParams.has('page')) u.searchParams.set('page', String(page));
        return site + base + u.search;
    }
    return site + base + search;
}

async function request(url, referer = `${site}/zh`) {
    const r = await req.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: referer,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            Cookie: '_slide_passed=1',
        },
        timeout: 25000,
        responseType: 'text',
        validateStatus: () => true,
    });
    const text = typeof r.data === 'string' ? r.data : String(r.data || '');
    if (r.status >= 400) return '';
    return decodePage(text);
}

function parseVods($) {
    const list = [];
    const seen = new Set();
    $('.post').each((_, el) => {
        const box = $(el);
        const href = box.find('a[href*=".html"]').first().attr('href') || '';
        if (!href || seen.has(href)) return;
        const img = box.find('img').first();
        let pic = img.attr('data-original') || img.attr('data-src') || img.attr('src') || '';
        if (pic.startsWith('data:')) pic = img.attr('data-original') || '';
        const tag = box.find('.tag').first().text().replace(/\s+/g, ' ').trim();
        const date = box.find('.date').first().text().replace(/\s+/g, ' ').trim();
        seen.add(href);
        list.push({
            vod_id: href,
            vod_name: box.find('h3').first().text().replace(/\s+/g, ' ').trim() || img.attr('alt') || '',
            vod_pic: pic,
            vod_remarks: [tag, date].filter(Boolean).join(' '),
        });
    });
    return list;
}

function pageCount($, page) {
    let max = 0;
    $('.pagination a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/-(\d+)\.html(?:\?|$)/) || href.match(/[?&]page=(\d+)/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    if (max) return max;
    return page;
}

function masterUrl(html) {
    const m = String(html || '').match(/window\.videoConfig\s*=\s*\{[\s\S]*?\burl\s*:\s*"([^"]+)"/);
    return m ? m[1] : '';
}

function parseVariants(text, base) {
    const lines = String(text || '').split(/\r?\n/);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
        const height = parseInt((lines[i].match(/RESOLUTION=\d+x(\d+)/) || [])[1] || '0', 10);
        let url = (lines[i + 1] || '').trim();
        if (!url || url.startsWith('#')) continue;
        if (!/^https?:\/\//i.test(url)) {
            try { url = new URL(url, base).href; } catch { continue; }
        }
        out.push({ name: height ? `${height}p` : `线路${out.length + 1}`, height, url });
    }
    out.sort((a, b) => b.height - a.height);
    return out;
}

async function variantsOf(pageUrl) {
    const html = await request(abs(pageUrl), abs(pageUrl));
    const master = masterUrl(html);
    if (!master) return { html, master: '', variants: [] };
    const playlist = await request(master, abs(pageUrl));
    let variants = parseVariants(playlist, master);
    if (!variants.length && /\.m3u8/i.test(master)) variants = [{ name: '自动', height: 0, url: master }];
    return { html, master, variants };
}

async function init() {
    return {};
}

async function home() {
    const $ = load(await request(`${site}/zh/new/index.html`));
    return { class: CLASSES, filters: {}, list: parseVods($) };
}

async function category(inReq) {
    const page = pageOf(inReq.body);
    const url = listUrl(inReq.body.id, page);
    const $ = load(await request(url));
    const list = parseVods($);
    return { page, pagecount: list.length ? pageCount($, page) : page, limit: list.length, total: 0, list };
}

async function detail(inReq) {
    let id = String((inReq.body && inReq.body.id) || '').trim();
    if (!id) return { list: [] };
    const { html, variants } = await variantsOf(id);
    const $ = load(html);
    const lines = variants.map((v) => `${v.name}$${id}|${v.name}`);
    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim() || '',
            vod_pic: $('meta[property="og:image"]').attr('content') || '',
            vod_content: $('meta[property="og:description"]').attr('content') || '',
            vod_play_from: lines.length ? 'D26' : '',
            vod_play_url: lines.join('#'),
        }],
    };
}

async function play(inReq) {
    const header = { 'User-Agent': UA, Referer: `${site}/zh` };
    const fail = { parse: 0, url: '', header };
    let id = String((inReq.body && inReq.body.id) || '').trim();
    if (!id) return fail;
    if (/\.m3u8(?:[?#]|$)/i.test(id) && !id.includes('|')) return { parse: 0, url: id, header };
    let quality = '';
    const bar = id.lastIndexOf('|');
    if (bar > 0) {
        quality = id.slice(bar + 1);
        id = id.slice(0, bar);
    }
    const { master, variants } = await variantsOf(id);
    const hit = variants.find((v) => v.name === quality) || variants[0];
    return { parse: 0, url: hit?.url || master || '', header };
}

async function search(inReq) {
    const page = pageOf(inReq.body);
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    if (!key) return { list: [], page, pagecount: 1, limit: 0, total: 0 };
    const url = listUrl(`/zh/search?key=${encodeURIComponent(key)}`, page);
    const $ = load(await request(url));
    const list = parseVods($);
    return { page, pagecount: list.length ? pageCount($, page) : page, limit: list.length, total: 0, list };
}

export default {
    meta: { key: 'd26cc', name: '🌸D26cc', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
