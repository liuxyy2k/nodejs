import axios from 'axios';
import crypto from 'crypto';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/huangguo/3';
const CANDIDATE_SITES = [
    'https://huangguoai.com',
    'https://huangguo10.com',
    'https://1462.vqojfzoq.cc',
];
let SITE = CANDIDATE_SITES[0];
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const AES_KEY = Buffer.from('f5d965df75336270');
const AES_IV = Buffer.from('97b60394abc2fbe1');

const HEADERS = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: `${SITE}/`,
};

const TABS = [
    { type_name: '首页', type_id: 'home' },
    { type_name: 'AI成人短剧', type_id: 'ai-duanju' },
    { type_name: 'AI成人漫剧', type_id: 'ai-manju' },
    { type_name: 'AI换脸', type_id: 'ai-huanlian' },
    { type_name: 'AI魔改', type_id: 'ai-mogai' },
    { type_name: '排行榜', type_id: 'ranks/hot' },
    { type_name: '黄果吃瓜', type_id: 'chigua' },
];

function fix(u) {
    if (!u) return '';
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return SITE + u;
    return u;
}

function imgSrc(u) {
    u = fix(u || '');
    if (/^https?:\/\//i.test(u) && u.includes('?') && !/auth_key=/i.test(u)) {
        u = u.replace(/\?[\s\S]*$/, '');
    }
    return u;
}

function stripTags(s) {
    return String(s || '').replace(/<[^>]*>/g, '').trim();
}

function proxyPic(url, inReq) {
    url = imgSrc(url);
    if (!url) return '';
    const prefix = inReq?.server?.prefix || PREFIX;
    const enc = Buffer.from(url, 'utf8').toString('base64url');
    return `http://127.0.0.1:${PORT}${prefix}/img?url=${encodeURIComponent(enc)}`;
}

async function fetchHtml(url, referer) {
    const tryGet = async (target) => {
        try {
            const resp = await axios.get(target, {
                headers: referer ? { ...HEADERS, Referer: referer } : { ...HEADERS, Referer: `${SITE}/` },
                timeout: 15000,
                responseType: 'text',
                validateStatus: () => true,
                family: 4,
            });
            if (resp.status >= 400) return '';
            const html = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            if (/cloudflare|Attention Required/i.test(html) && !/hg-drama-card|hg-card-grid/.test(html)) return '';
            return html;
        } catch {
            return '';
        }
    };
    let html = await tryGet(url);
    if (html) return html;
    const path = String(url || '').replace(/^https?:\/\/[^/]+/i, '') || '/';
    for (const host of CANDIDATE_SITES) {
        if (host === SITE) continue;
        html = await tryGet(host + (path.startsWith('/') ? path : `/${path}`));
        if (html) {
            SITE = host;
            HEADERS.Referer = `${SITE}/`;
            return html;
        }
    }
    return '';
}

function gridSlices(html, allGrids) {
    const re = /<div\s+class="[^"]*\bhg-card-grid\b[^"]*"[^>]*>/g;
    const starts = [];
    let m;
    while ((m = re.exec(html))) starts.push(m.index + m[0].length);
    if (!starts.length) return [];
    const n = allGrids ? starts.length : Math.min(1, starts.length);
    const slices = [];
    for (let i = 0; i < n; i++) {
        const to = i + 1 < starts.length ? starts[i + 1] : html.length;
        slices.push(html.slice(starts[i], to));
    }
    return slices;
}

function cardBlocks(slice) {
    const re = /<div\s+class="[^"]*\bhg-drama-card\b[^"]*"[^>]*>/g;
    const starts = [];
    let m;
    while ((m = re.exec(slice))) starts.push(m.index + m[0].length);
    const blocks = [];
    for (let i = 0; i < starts.length; i++) {
        const to = i + 1 < starts.length ? starts[i + 1] : slice.length;
        blocks.push(slice.slice(starts[i], to));
    }
    return blocks;
}

function parseCardBlock(block, inReq) {
    const a = block.match(/href="[^"]*\/(?:video|detail)\/(\d+)\/[^"]*"/);
    if (!a) return null;
    const vid = a[1];
    const imgM = block.match(/data-src="([^"]+)"/) || block.match(/src="([^"]+)"/);
    let title = '';
    const t = block.match(/hg-drama-card__title[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)
        || block.match(/hg-drama-card__title[^>]*>([\s\S]*?)<\/div>/);
    if (t) title = stripTags(t[1].replace(/<span class="sr-only"[^>]*>[\s\S]*?<\/span>/g, ''));
    if (!title) {
        const tt = block.match(/<a[^>]+href="[^"]*\/(?:video|detail)\/\d+\/"[^>]*>([\s\S]*?)<\/a>/);
        if (tt) title = stripTags(tt[1].replace(/<span class="sr-only"[^>]*>[\s\S]*?<\/span>/g, ''));
    }
    if (!title) {
        const alt = block.match(/alt="([^"]+)"/);
        title = alt ? alt[1] : vid;
    }
    const ep = block.match(/hg-drama-card__episode[^>]*>([\s\S]*?)<\/span>/);
    const score = block.match(/hg-drama-card__score[^>]*>([\s\S]*?)<\/span>/);
    const rem = ep ? stripTags(ep[1]) : '';
    const sc = score ? stripTags(score[1]) : '';
    return {
        vod_id: vid,
        vod_name: title,
        vod_pic: proxyPic(imgM ? imgM[1] : '', inReq),
        vod_remarks: rem && sc ? `${rem} · ${sc}` : rem || sc,
    };
}

function parseGridCards(html, allGrids, inReq) {
    if (!html) return [];
    const list = [];
    const seen = new Set();
    for (const slice of gridSlices(html, allGrids)) {
        for (const block of cardBlocks(slice)) {
            const item = parseCardBlock(block, inReq);
            if (!item || seen.has(item.vod_id)) continue;
            seen.add(item.vod_id);
            list.push(item);
        }
    }
    return list;
}

function parseRanks(html, inReq) {
    if (!html) return [];
    const listM = html.match(/<div\s+class="[^"]*\bhg-rank-list\b[^"]*"[^>]*>/);
    const from = listM ? listM.index + listM[0].length : 0;
    const slice = html.slice(from);
    const re = /<div\s+class="[^"]*\bhg-rank-item\b[^"]*"[^>]*>/g;
    const starts = [];
    let m;
    while ((m = re.exec(slice))) starts.push(m.index + m[0].length);
    const list = [];
    const seen = new Set();
    for (let i = 0; i < starts.length; i++) {
        const to = i + 1 < starts.length ? starts[i + 1] : slice.length;
        const block = slice.slice(starts[i], to);
        const a = block.match(/href="[^"]*\/(?:video|detail)\/(\d+)\/[^"]*"/);
        if (!a || seen.has(a[1])) continue;
        seen.add(a[1]);
        const imgM = block.match(/data-src="([^"]+)"/) || block.match(/src="([^"]+)"/);
        let title = '';
        const t = block.match(/hg-rank-item__title[^>]*>([\s\S]*?)<\/h2>/);
        if (t) title = stripTags(t[1]);
        if (!title) {
            const tt = block.match(/<a[^>]+href="[^"]*\/(?:video|detail)\/\d+\/"[^>]*>([\s\S]*?)<\/a>/);
            if (tt) title = stripTags(tt[1]);
        }
        if (!title) continue;
        const tags = block.match(/hg-rank-item__tags[^>]*>([\s\S]*?)<\/div>/);
        list.push({
            vod_id: a[1],
            vod_name: title,
            vod_pic: proxyPic(imgM ? imgM[1] : '', inReq),
            vod_remarks: tags ? stripTags(tags[1]) : '',
        });
    }
    return list;
}

function looksLikeImage(buf) {
    if (!buf || buf.length < 8) return false;
    if (buf[0] === 0xff && buf[1] === 0xd8) return true;
    if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
    if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return true;
    const gif = buf.slice(0, 6).toString('ascii');
    return gif === 'GIF87a' || gif === 'GIF89a';
}

function unpadPkcs7(buf) {
    if (!buf.length) return buf;
    const pad = buf[buf.length - 1];
    if (pad < 1 || pad > 16 || pad > buf.length) return buf;
    for (let i = buf.length - pad; i < buf.length; i++) {
        if (buf[i] !== pad) return buf;
    }
    return buf.slice(0, buf.length - pad);
}

function trimImage(buf) {
    if (buf[0] === 0xff && buf[1] === 0xd8) {
        const i = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
        if (i >= 0) return buf.slice(0, i + 2);
    } else if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        const marker = Buffer.from('IEND\xaeB`\x82', 'binary');
        const i = buf.lastIndexOf(marker);
        if (i >= 0) return buf.slice(0, i + 8);
    }
    return buf;
}

function decryptImg(raw) {
    if (!raw || raw.length % 16 !== 0) return raw;
    let pt;
    try {
        const d = crypto.createDecipheriv('aes-128-cbc', AES_KEY, AES_IV);
        d.setAutoPadding(false);
        pt = Buffer.concat([d.update(raw), d.final()]);
    } catch {
        return raw;
    }
    if (!looksLikeImage(pt)) return raw;
    pt = unpadPkcs7(pt);
    return trimImage(pt);
}

function imageMime(buf) {
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
    if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif';
    if (buf.slice(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
    return 'image/jpeg';
}

async function init() {
    return {};
}

async function home(inReq) {
    const html = await fetchHtml(`${SITE}/`);
    return {
        class: TABS,
        filters: {},
        list: parseGridCards(html, true, inReq),
    };
}

async function category(inReq) {
    const id = String(inReq.body.id || 'home').replace(/^\//, '');
    const page = Math.max(1, parseInt(inReq.body.page, 10) || 1);
    if (id === 'home') {
        const html = await fetchHtml(`${SITE}/`);
        let list = parseGridCards(html, true, inReq);
        return { list,
            page: page,
            pagecount: 99999,
            limit: 24,
            total: list.length };
    }
    const url = `${SITE}/${id}/${page > 1 ? `${page}/` : ''}`;
    const html = await fetchHtml(url);
    const list = id.includes('rank') ? parseRanks(html, inReq) : parseGridCards(html, false, inReq);
    return {
        list,
        page: page,
        pagecount: 99999,
        limit: 24,
        total: list.length
    };
}

async function detail(inReq) {
    let id = inReq.body.id;
    if (Array.isArray(id)) id = id[0];
    id = String(id || '').trim();
    if (!id) return { list: [] };
    let html = await fetchHtml(`${SITE}/video/${id}/`);
    if (!html) html = await fetchHtml(`${SITE}/detail/${id}/`);
    if (!html) return { list: [] };
    const title =
        stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '') ||
        stripTags(html.match(/<title>([^<]+)<\/title>/i)?.[1] || '').split('|')[0].trim();
    const pic =
        html.match(/property="og:image"[^>]+content="([^"]+)"/i)?.[1] ||
        html.match(/"coverSrc":"([^"]+)"/)?.[1]?.replace(/\\u0026/g, '&').replace(/\\\//g, '/') ||
        html.match(/data-src="([^"]+)"/)?.[1] ||
        '';
    const tracks = [];
    const gridM =
        html.match(/<div\s+class="[^"]*\bhg-web-play__ep-grid\b[^"]*"[^>]*>([\s\S]*?)<\/div>/) ||
        html.match(/<div\s+class="[^"]*\bhg-web-detail__ep-grid\b[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (gridM) {
        const are = /<a\b[^>]*>[\s\S]*?<\/a>/g;
        let m;
        while ((m = are.exec(gridM[1]))) {
            const tag = m[0];
            const href = tag.match(/href="([^"]+)"/)?.[1];
            if (!href) continue;
            const eid = tag.match(/data-ep-id="([^"]*)"/)?.[1] || '';
            const name = eid ? `第${eid}集` : stripTags(tag) || `第${tracks.length + 1}集`;
            tracks.push(`${name.replace(/[#$]/g, ' ')}$${fix(href)}|${eid || tracks.length + 1}`);
        }
    }
    if (!tracks.length) {
        const playM =
            html.match(/<a\b[^>]*class="[^"]*\bhg-web-detail__play\b[^"]*"[^>]*href="([^"]+)"/) ||
            html.match(/<a\b[^>]*class="[^"]*\bhg-web-play__ep\b[^"]*"[^>]*href="([^"]+)"/);
        if (playM) tracks.push(`第1集$${fix(playM[1])}|1`);
        else tracks.push(`第1集$${SITE}/video/${id}/|1`);
    }
    return {
        list: [
            {
                vod_id: id,
                vod_name: title,
                vod_pic: proxyPic(pic, inReq),
                vod_content: '',
                vod_play_from: '黄果短剧',
                vod_play_url: tracks.join('#'),
            },
        ],
    };
}

async function play(inReq) {
    let raw = String(inReq.body.id || '');
    let ep = '1';
    if (raw.includes('|')) {
        const idx = raw.lastIndexOf('|');
        ep = raw.slice(idx + 1) || '1';
        raw = raw.slice(0, idx);
    }
    if (!raw) return { parse: 0, url: '' };
    const html = await fetchHtml(raw, SITE);
    let playUrl = '';
    const m = html.match(/id="videoInitialData"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
        try {
            const data = JSON.parse(m[1]);
            playUrl = (data?.epPlaySrcs && (data.epPlaySrcs[ep] || data.epPlaySrcs[String(ep)])) || data?.videoSrc || '';
        } catch {
            /* ignore */
        }
    }
    if (playUrl) {
        playUrl = playUrl.replace(/\\u0026/g, '&');
        if (!/^https?:\/\//i.test(playUrl)) {
            playUrl = playUrl.match(/(https?:\/\/[^\s"']+)/)?.[1] || '';
        }
    }
    return {
        parse: 0,
        url: playUrl,
        header: { 'User-Agent': UA, Referer: `${SITE}/` },
    };
}

async function search(inReq) {
    const kw = String(inReq.body.wd || '').trim();
    if (!kw) return { list: [] };
    const html = await fetchHtml(`${SITE}/search/video/${encodeURIComponent(kw)}/`);
    return { list: parseGridCards(html, false, inReq), page: 1 };
}

async function imgProxy(inReq, reply) {
    try {
        let u = decodeURIComponent(String(inReq.query.url || ''));
        try {
            const decoded = Buffer.from(u, 'base64url').toString('utf8');
            if (/^https?:\/\//i.test(decoded)) u = decoded;
        } catch {
            /* keep */
        }
        u = imgSrc(u);
        if (!/^https?:\/\//i.test(u)) return reply.code(400).send('');
        const resp = await axios.get(u, {
            headers: HEADERS,
            timeout: 15000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        if (resp.status >= 400) return reply.code(resp.status).send('');
        const raw = Buffer.from(resp.data);
        const img = decryptImg(raw);
        reply.header('Content-Type', imageMime(img)).send(img);
    } catch {
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'huangguo',
        name: '📖黄果短剧',
        type: 3,
    },
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
