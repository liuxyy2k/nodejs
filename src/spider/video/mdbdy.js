import { load } from 'cheerio';
import crypto from 'crypto';
import req from '../../util/req.js';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/mdbdy/3';
const site = 'https://mdbdy.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CLASSES = [
    { type_id: '/', type_name: '首页' },
    { type_id: '/category/17202/', type_name: '今日热搜' },
    { type_id: '/category/189010101/', type_name: '今日大赛' },
    { type_id: '/category/216010101/', type_name: 'AI短剧' },
    { type_id: '/category/14202/', type_name: '学生校园' },
    { type_id: '/category/17521/', type_name: '必吃大瓜' },
    { type_id: '/category/14203/', type_name: '明星黑料' },
    { type_id: '/category/214710102/', type_name: '网红黑料' },
    { type_id: '/category/810103/', type_name: '海角社区' },
    { type_id: '/category/14205/', type_name: '网黄专区' },
    { type_id: '/category/810101/', type_name: '麻豆传媒' },
    { type_id: '/category/810104/', type_name: '反差专区' },
    { type_id: '/category/810102/', type_name: '绿帽社区' },
    { type_id: '/category/216010102/', type_name: '探花偷拍' },
    { type_id: '/category/218310101/', type_name: 'AV解说' },
    { type_id: '/category/810105/', type_name: '猎奇重口' },
    { type_id: '/category/810106/', type_name: '里番动漫' },
    { type_id: '/category/312010101/', type_name: '优选投放区' },
];

const FILTERS = [
    {
        key: 'cat',
        name: '分类',
        value: [{ n: '全部', v: '' }].concat(CLASSES.filter((c) => c.type_id !== '/').map((c) => ({ n: c.type_name, v: c.type_id }))),
    },
];

function abs(u) {
    if (!u) return '';
    u = String(u).trim();
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return site + u;
    return `${site}/${u}`;
}

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
        const o = JSON.parse(String(raw));
        return o && typeof o === 'object' ? o : {};
    } catch {
        return {};
    }
}

function e64(s) {
    try {
        return Buffer.from(s || '').toString('base64');
    } catch {
        return '';
    }
}

function d64(s) {
    try {
        return Buffer.from(s || '', 'base64').toString('utf-8');
    } catch {
        return '';
    }
}

function isImgMagic(buf) {
    return (
        (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ||
        (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) ||
        buf.slice(0, 3).toString() === 'GIF' ||
        buf.slice(0, 4).toString() === 'RIFF'
    );
}

function xorDescramble(buf) {
    const out = Buffer.from(buf);
    const key = Buffer.from('2019ysapp7527');
    for (let i = 0; i < 100 && i < out.length; i++) out[i] ^= key[i % key.length];
    return out;
}

function aesDecrypt(buf) {
    const decipher = crypto.createDecipheriv(
        'aes-128-cbc',
        Buffer.from('f5d965df75336270'),
        Buffer.from('97b60394abc2fbe1'),
    );
    decipher.setAutoPadding(true);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function decodeImg(buf) {
    if (isImgMagic(buf)) return buf;
    if (buf.length % 16 === 0) {
        try {
            const aes = aesDecrypt(buf);
            if (isImgMagic(aes)) return aes;
            const aesXor = xorDescramble(aes);
            if (isImgMagic(aesXor)) return aesXor;
        } catch {}
    }
    return xorDescramble(buf);
}

function proxyPic(url, inReq) {
    url = abs(url);
    if (!url || url.startsWith('blob:')) return '';
    const prefix = inReq?.server?.prefix || PREFIX;
    return `http://127.0.0.1:${PORT}${prefix}/img?url=${encodeURIComponent(e64(url))}`;
}

async function request(url) {
    const resp = await req.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: `${site}/`,
            Origin: site,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        timeout: 20000,
        validateStatus: () => true,
    });
    return resp.data;
}

function coverOf($el) {
    const bg = $el.find('.blog-background');
    const dataBg = bg.attr('data-bg') || bg.attr('data-src') || '';
    if (dataBg && !dataBg.startsWith('blob:')) return dataBg;
    const style = bg.attr('style') || '';
    const m = style.match(/url\(["']?([^"')]+)["']?\)/);
    if (m && m[1] && !m[1].startsWith('blob:')) return m[1];
    return $el.find('img').attr('src') || $el.find('meta[itemprop="image"]').attr('content') || '';
}

function parseVods($, inReq) {
    const list = [];
    const seen = new Set();
    $('article').each((_, el) => {
        const $el = $(el);
        if ($el.hasClass('no-mask') || $el.find('.post-card-advert').length) return;
        const href = $el.find('a[href*="/archives/"]').first().attr('href') || $el.find('a').first().attr('href') || '';
        if (!/\/archives\/\d+/.test(href)) return;
        const id = (href.match(/\/archives\/(\d+)/) || [])[1];
        if (!id || seen.has(id)) return;
        seen.add(id);
        const name = $el.find('.post-card-title').text().trim() || $el.find('h2').first().text().trim();
        if (!name) return;
        const info = $el.find('.post-card-info').text().replace(/\s+/g, ' ').trim();
        const date = (info.match(/(\d{4})年(\d{2})月(\d{2})日/) || []).slice(1).join('-');
        const cat = $el.find('.post-card-info span').last().text().replace(/[•\s]/g, '').trim();
        list.push({
            vod_id: id,
            vod_name: name,
            vod_pic: proxyPic(coverOf($el), inReq),
            vod_remarks: date || cat || '',
        });
    });
    return list;
}

function buildListUrl(tid, page, ext = {}) {
    let raw = String(ext.cat || tid || '/').trim() || '/';
    try {
        raw = decodeURIComponent(raw);
    } catch {}
    if (!raw.startsWith('/')) raw = `/${raw}`;
    if (raw === '/') {
        return page > 1 ? `${site}/${page}/` : `${site}/`;
    }
    if (!raw.endsWith('/')) raw += '/';
    return page > 1 ? `${site}${raw}${page}/` : `${site}${raw}`;
}

function parsePageCount($, page) {
    let max = page;
    $('.page-navigator a, a.next').each((_, el) => {
        const href = String($(el).attr('href') || '');
        const m = href.match(/\/(\d+)\/?$/);
        const n = m ? parseInt(m[1], 10) : 0;
        if (n > max) max = n;
    });
    if ($('.page-navigator .next a, a.next').length && max <= page) max = page + 1;
    return max || page;
}

async function init() {
    return {};
}

async function home(inReq) {
    const filters = {};
    for (const c of CLASSES) filters[c.type_id] = FILTERS;
    const html = await request(`${site}/`);
    const $ = load(typeof html === 'string' ? html : '');
    return { class: CLASSES, filters, list: parseVods($, inReq) };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const tid = String(inReq.body.id || '/');
    const ext = parseExtend(inReq.body.extend || inReq.body.filters || inReq.body.filter);
    const url = buildListUrl(tid, page, ext);
    const html = await request(url);
    const $ = load(typeof html === 'string' ? html : '');
    const list = parseVods($, inReq);
    return {
        list,
        page,
        pagecount: parsePageCount($, page) || (list.length ? page + 1 : page),
        limit: 30,
        total: list.length,
    };
}

async function fetchPlay(cid, idx = 0) {
    const data = await request(`${site}/play-url/${encodeURIComponent(cid)}.json?i=${idx}`);
    const json = typeof data === 'string' ? JSON.parse(data) : data;
    return json?.data || null;
}

async function detail(inReq) {
    let id = inReq.body.id;
    if (Array.isArray(id)) id = id[0];
    id = String(id || '').replace(/\/+$/, '').split('/').pop();
    if (!id) return { list: [] };
    const html = await request(`${site}/archives/${id}/`);
    const text = typeof html === 'string' ? html : '';
    const $ = load(text);
    const name =
        $('h1.post-title').first().text().trim() ||
        $('meta[property="og:title"]').attr('content') ||
        $('meta[itemprop="headline"]').attr('content') ||
        '';
    const pic =
        $('meta[itemprop="image"]').attr('content') ||
        $('.dplayer').first().attr('data-cover') ||
        $('meta[property="og:image"]').attr('content') ||
        '';
    const content = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
    const tracks = [];
    const players = $('.dplayer').toArray();
    let i = 0;
    for (const el of players) {
        const cid = $(el).attr('data-video-id') || $(el).attr('data-video_id') || '';
        if (!cid) continue;
        i += 1;
        const idx = $(el).attr('data-player-index') || '0';
        try {
            const data = await fetchPlay(cid, idx);
            const url = data?.url || '';
            const hevc = data?.h265_url || '';
            const label = players.length > 1 ? `第${i}段` : '正片';
            if (url) tracks.push(`${label}$${url}`);
            if (hevc && hevc !== url) tracks.push(`${label} HEVC$${hevc}`);
        } catch {}
    }
    return {
        list: [
            {
                vod_id: id,
                vod_name: name,
                vod_pic: proxyPic(pic, inReq),
                vod_content: content,
                vod_play_from: '麻豆不打烊',
                vod_play_url: tracks.join('#'),
            },
        ],
    };
}

async function play(inReq) {
    let raw = String(inReq.body.id || '');
    if (raw.includes('$')) raw = raw.split('$').pop();
    return {
        parse: 0,
        url: raw,
        header: { 'User-Agent': UA, Referer: `${site}/` },
    };
}

async function search(inReq) {
    const kw = String(inReq.body.wd || '').trim();
    if (!kw) return { list: [] };
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const u = new URL('/search', site);
    u.searchParams.set('keywords', kw);
    if (page > 1) u.searchParams.set('page', String(page));
    const html = await request(u.href);
    const $ = load(typeof html === 'string' ? html : '');
    return { list: parseVods($, inReq), page };
}

async function imgProxy(inReq, reply) {
    try {
        const raw = abs(d64(inReq.query.url));
        if (!raw) return reply.code(404).send('');
        const resp = await req.get(raw, {
            headers: { 'User-Agent': UA, Referer: `${site}/`, Origin: site },
            responseType: 'arraybuffer',
            timeout: 15000,
            validateStatus: () => true,
        });
        const decrypted = decodeImg(Buffer.from(resp.data || []));
        let ct = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8') ct = 'image/gif';
        reply.header('Content-Type', ct).send(decrypted);
    } catch {
        reply.code(500).send('');
    }
}

export default {
    meta: { key: 'mdbdy', name: '🍉麻豆不打烊', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img', imgProxy);
    },
};
