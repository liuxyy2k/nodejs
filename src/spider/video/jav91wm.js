import { load } from 'cheerio';
import req from '../../util/req.js';
import crypto from 'crypto';
import axios from 'axios';

const PORT   = process.env.DEV_HTTP_PORT || 9988;

const NAME = '🌸91jav';
const HOSTS = ['alcohol.kzjdba.cc', 'www.91jav1.com'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const CLASSES = [
    ['2', '角色剧情'], ['3', '中文字幕'], ['4', '制服诱惑'], ['5', '直接开啪'],
    ['6', '丝袜美腿'], ['7', '捆绑调教'], ['8', '多P群交'], ['9', '男友视角'],
    ['10', '羞辱强暴'], ['11', '无码高清'], ['12', '盗摄偷拍'], ['13', '女同百合'],
    ['14', '乱伦伦理'], ['15', '人妻诱惑'], ['16', 'AV解说'], ['17', '网黄精选'],
    ['18', '性爱知识'], ['19', '英文字幕'],
];

const RE_PLAYER = /var\s+hlsUrl\s*=\s*"([^"]+)"/;
const RE_TITLE = /<title>([^<]+)<\/title>/i;

let host = HOSTS[0];

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
    return `http://127.0.0.1:${PORT}/spider/jav91wm/3/img?url=${encodeURIComponent(e64(raw))}`;
}


function clean(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

function pageOf(body) {
    const page = parseInt(body?.page ?? body?.pg ?? 1, 10) || 1;
    return page > 0 ? page : 1;
}

function abs(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return `https://${host}${path.startsWith('/') ? path : `/${path}`}`;
}

async function fetchText(url, referer = '') {
    const headers = {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Connection: 'close',
    };
    if (referer) headers.Referer = referer;
    try {
        const r = await req.get(url, {
            headers,
            timeout: 25000,
            responseType: 'text',
            validateStatus: () => true,
        });
        if (!r || r.status >= 400) return '';
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch {
        return '';
    }
}

async function getPath(path, referer = '') {
    if (/^https?:\/\//i.test(path)) return fetchText(path, referer);
    const p = path.startsWith('/') ? path : `/${path}`;
    let body = await fetchText(`https://${host}${p}`, referer);
    if (body) return body;
    for (const h of HOSTS) {
        if (h === host) continue;
        body = await fetchText(`https://${h}${p}`, referer);
        if (body) {
            host = h;
            return body;
        }
    }
    return '';
}

function parseCards(body) {
    const $ = load(String(body || ''));
    const out = [];
    const seen = new Set();
    $('.video-img-box').each((_, el) => {
        const box = $(el);
        const a = box.find('a[href*="/videos/"]').first();
        const href = a.attr('href') || '';
        const vid = (href.match(/\/videos\/[^/?#]+/) || [])[0];
        if (!vid || seen.has(vid)) return;
        const label = clean(box.find('.absolute-bottom-right .label').first().text());
        if (label === '广告') return;
        const img = box.find('img.zximg').first();
        const pic = img.attr('z-image-loader-url') || img.attr('data-src') || '';
        if (!pic || pic.startsWith('blob:')) return;
        const name = clean(box.find('h3.title a').first().text()) || clean(img.attr('alt'));
        seen.add(vid);
        out.push({
            vod_id: `https://${host}${vid}`,
            vod_name: name || '未知',
            vod_pic: pic ? proxyImgUrl(pic) : '',
            vod_remarks: label,
        });
    });
    return out;
}

function streamUrl(body) {
    const m = String(body || '').match(RE_PLAYER);
    return m ? m[1].trim() : '';
}

function pageTitle(body) {
    const m = String(body || '').match(RE_TITLE);
    if (!m) return '';
    return clean(m[1].split(' - 91jav')[0]);
}

async function init() {
    return {};
}

async function home() {
    const list = parseCards(await getPath('/'));
    return {
        class: CLASSES.map(([type_id, type_name]) => ({ type_id, type_name })),
        filters: {},
        list,
        page: 1,
        pagecount: list.length ? 999 : 1,
        limit: 20,
        total: 99999,
    };
}

async function category(inReq) {
    const body = inReq.body || {};
    const page = pageOf(body);
    const tid = String(body.id || body.tid || '11').trim();
    const html = await getPath(`/theme/detail/${encodeURIComponent(tid)}/page/${page}`);
    const list = parseCards(html);
    return {
        list,
        page,
        pagecount: list.length ? 999 : page,
        limit: list.length,
        total: 99999,
    };
}

async function detail(inReq) {
    let id = inReq.body && inReq.body.id;
    const ids = Array.isArray(id) ? id : [id];
    const list = [];
    for (const one of ids) {
        let page = String(one || '').trim();
        if (!page) continue;
        if (!/^https?:\/\//i.test(page)) page = abs(page);
        const html = await getPath(page, page);
        if (!streamUrl(html)) continue;
        list.push({
            vod_id: page,
            vod_name: pageTitle(html) || '未知',
            vod_pic: '',
            vod_play_from: '91jav',
            vod_play_url: `第1集$${page}`,
            vod_remarks: '',
        });
    }
    return { list };
}

async function play(inReq) {
    const fail = { parse: 0, url: '', header: { Referer: `https://${host}/` } };
    let purl = String((inReq.body && inReq.body.id) || '').trim();
    if (!purl) return fail;
    if (/\.m3u8(?:[?#]|$)/i.test(purl)) {
        return { parse: 0, url: purl, header: { 'User-Agent': UA, Referer: `https://${host}/` } };
    }
    if (!/^https?:\/\//i.test(purl)) purl = abs(purl);
    const html = await getPath(purl, purl);
    const url = streamUrl(html);
    if (!url) return fail;
    return { parse: 0, url, header: { 'User-Agent': UA, Referer: `https://${host}/` } };
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
                'Referer':    `www.91jav1.com/`,
                'Origin':     'www.91jav1.com',
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

async function search(inReq) {
    const body = inReq.body || {};
    const page = pageOf(body);
    const key = String(body.wd || body.key || body.word || '').trim();
    if (!key) return { list: [], page, pagecount: 1, limit: 0, total: 0 };
    let html = await getPath(`/search/${encodeURIComponent(key)}/${page}`);
    let list = parseCards(html);
    if (!list.length) {
        html = await getPath(`/theme/detail/11/page/${page}`);
        list = parseCards(html);
    }
    return {
        list,
        page,
        pagecount: list.length ? 999 : page,
        limit: list.length,
        total: 99999,
    };
}

export default {
    meta: { key: 'jav91wm', name: NAME, type: 3 },
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
