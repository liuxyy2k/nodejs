import req from '../../util/req.js';

/**
 * SupJav TVBox 源 (Python ayyc 同款逻辑)
 * Cloudflare 页面走 1314 代理; 播放链 data-link → supjav.php 三跳解析
 */

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HOST = 'https://supjav.com';
const PROXY_BASE = 'https://py.fzcrym.link:1314';
const PAGE_API = `${PROXY_BASE}/page?u=`;
const FS_PAGE_API = `${PROXY_BASE}/fs?u=`;
const STREAM_API = `${PROXY_BASE}/stream?u=`;
const SJ_HLS_API = `${PROXY_BASE}/sj_hls?u=`;
const SJ_IMG_API = `${PROXY_BASE}/sj_img?u=`;
const LK_BASE = 'https://lk1.supremejav.com/supjav.php';

const CATS = [
    ['__home', '最新'],
    ['__popular', '热门'],
    ['censored-jav', '有码 Censored'],
    ['uncensored-jav', '无码 Uncensored'],
    ['amateur', '素人 Amateur'],
    ['chinese-subtitles', '中文字幕 Chn Sub'],
    ['reducing-mosaic', '破解 Reducing Mosaic'],
    ['english-subtitles', '英文字幕 Eng Sub'],
];

const LINE_ORDER = { VOE: 0, FST: 10, ST: 20, TV: 90 };
const SORTS = [
    {
        key: 'sort',
        name: '排序',
        value: [
            { n: '最新', v: '' },
            { n: '最多观看', v: 'views' },
        ],
    },
];

const PLAY_TTL = 90 * 1000;
const playCache = new Map();

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    return {};
}

async function httpGet(url, timeout = 60000) {
    try {
        const resp = await req.get(url, {
            headers: { 'User-Agent': UA },
            timeout,
            responseType: 'text',
            validateStatus: () => true,
        });
        if (resp.status === 200) {
            return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        }
    } catch {
        /* ignore */
    }
    return '';
}

async function fetchPage(url, retries = 2) {
    const api = FS_PAGE_API + encodeURIComponent(url);
    for (let i = 0; i < Math.max(1, retries); i++) {
        const html = await httpGet(api, 220000);
        if (html && !html.includes('Just a moment') && html.length > 3000) return html;
    }
    const api2 = PAGE_API + encodeURIComponent(url);
    const html = await httpGet(api2, 90000);
    if (html && !html.includes('Just a moment') && html.length > 3000) return html;
    return '';
}

async function fetchStream(url, referer = '', timeout = 90000) {
    let api = STREAM_API + encodeURIComponent(url);
    if (referer) api += `&r=${encodeURIComponent(referer)}`;
    return httpGet(api, timeout);
}

function htmlUnescapeTitle(title) {
    return String(title || '')
        .replace(/&amp;/g, '&')
        .replace(/&#8217;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&#8211;/g, '-')
        .trim();
}

function proxyImg(pic) {
    if (!pic) return '';
    let url = pic;
    if (url.startsWith('//')) url = `https:${url}`;
    if (url.startsWith('http')) return SJ_IMG_API + encodeURIComponent(url);
    return url;
}

function parseCards(html) {
    const out = [];
    const seen = new Set();
    const blocks = html.split('<div class="post">').slice(1);
    const hostEsc = HOST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    for (const b of blocks) {
        const m = b.match(new RegExp(`href="${hostEsc}/(\\d+)\\.html"`));
        if (!m) continue;
        const vid = m[1];
        if (seen.has(vid)) continue;

        const t = b.match(/title="([^"]+)"/);
        let title = t ? htmlUnescapeTitle(t[1]) : '';
        if (!title) continue;
        seen.add(vid);

        let pic = '';
        for (const pat of [
            /<img[^>]+data-original="([^"]+)"/,
            /<img[^>]+data-src="([^"]+)"/,
            /<img[^>]+src="(https?:\/\/[^"]+)"/,
        ]) {
            const pm = b.match(pat);
            if (pm) {
                pic = pm[1];
                break;
            }
        }
        pic = proxyImg(pic);

        let code = '';
        const cm = title.match(/\b([A-Z]{2,6}-?\d{2,6}|FC2PPV[\s-]?\d{5,8})\b/);
        if (cm) code = cm[1];

        out.push({
            vod_id: vid,
            vod_name: title.slice(0, 90),
            vod_pic: pic,
            vod_remarks: code,
        });
    }
    return out;
}

function pageCount(html, cur) {
    const nums = [...html.matchAll(/\/page\/(\d+)/g)].map((m) => parseInt(m[1], 10)).filter(Number.isFinite);
    if (!nums.length) return cur;
    const mx = Math.max(...nums);
    return mx > 0 && mx <= 5000 ? mx : cur;
}

function int2base(num, radix) {
    const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
    if (num < 0) return `-${int2base(-num, radix)}`;
    const res = [];
    let x = num;
    while (x > 0) {
        res.push(digits[x % radix]);
        x = Math.floor(x / radix);
    }
    return res.length ? res.reverse().join('') : '0';
}

function unpackPacker(text) {
    const m = text.match(/}\('(.*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\)/s);
    if (!m) return '';
    let payload = m[1];
    const base = parseInt(m[2], 10);
    const count = parseInt(m[3], 10);
    const keys = m[4].split('|');
    try {
        payload = JSON.parse(`"${payload.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    } catch {
        /* keep raw */
    }
    const table = {};
    for (let i = 0; i < count; i++) {
        if (i < keys.length && keys[i]) table[int2base(i, base)] = keys[i];
    }
    return payload.replace(/\b\w+\b/g, (w) => (table[w] !== undefined ? table[w] : w));
}

function rot13(s) {
    return String(s).replace(/[a-zA-Z]/g, (c) => {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
}

function b64DecodeText(x) {
    const cleaned = String(x).replace(/[^A-Za-z0-9+/=]/g, '');
    const pad = (4 - (cleaned.length % 4)) % 4;
    return Buffer.from(cleaned + '='.repeat(pad), 'base64').toString('utf8');
}

function voeDecode(html) {
    const m = String(html || '').match(
        /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i,
    );
    if (!m) return {};
    const blk = m[1].trim();
    let raw = blk;
    try {
        const j = JSON.parse(blk);
        raw = Array.isArray(j) && j.length ? j[0] : blk;
    } catch {
        raw = blk;
    }

    let s = String(raw);
    for (const k of ['@$', '^^', '~@', '%?', '*~', '!!', '#&']) {
        s = s.replaceAll(k, '_');
    }
    s = s.replace(/_/g, '');

    try {
        let t = b64DecodeText(rot13(s));
        t = [...t].map((c) => String.fromCharCode(c.charCodeAt(0) - 3)).join('');
        t = b64DecodeText(t.split('').reverse().join(''));
        const cfg = JSON.parse(t);
        return typeof cfg === 'object' && cfg !== null ? cfg : {};
    } catch {
        return {};
    }
}

async function extractStream(s2, ref) {
    let hits = [...String(s2 || '').matchAll(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g)].map((x) => x[0]);
    if (hits.length) return { m3u8: hits[0], direct: '' };

    if (String(s2).includes('eval(function(p,a,c,k,e')) {
        const dec = unpackPacker(s2);
        hits = [...dec.matchAll(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g)].map((x) => x[0]);
        if (hits.length) return { m3u8: hits[0], direct: '' };
    }

    const em = String(s2).match(/https?:\/\/streamtape\.com\/e\/([A-Za-z0-9]+)/);
    if (em) {
        const eurl = `https://streamtape.com/e/${em[1]}/`;
        const page = await fetchStream(eurl, `${HOST}/`);
        for (const pat of [
            /innerHTML\s*=\s*'([^']+)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)/,
            /innerHTML\s*=\s*"([^"]+)"\s*\+\s*\("([^"]+)"\)\.substring\((\d+)\)/,
        ]) {
            const mm = String(page || '').match(pat);
            if (!mm) continue;
            let link = mm[1] + mm[2].slice(parseInt(mm[3], 10));
            if (link.startsWith('//')) link = `https:${link}`;
            if (!link.includes('dl=')) link += link.includes('?') ? '&dl=1' : '?dl=1';
            return { m3u8: '', direct: link };
        }
    }

    const tgt = [
        ...String(s2).matchAll(/window\.location\.href\s*=\s*'([^']+)'/g),
        ...String(s2).matchAll(/https?:\/\/[a-z0-9.-]+\/e\/[a-z0-9]{8,}/gi),
    ].map((x) => x[1] || x[0]);
    if (tgt.length) {
        const page = await fetchStream(tgt[0], ref);
        const cfg = voeDecode(page);
        const src = String(cfg.source || '');
        if (src.includes('.m3u8')) return { m3u8: src, direct: '' };
        const dau = String(cfg.direct_access_url || '');
        if (dau.startsWith('http')) return { m3u8: '', direct: dau };
        if (src.startsWith('http')) return { m3u8: '', direct: src };
    }

    return { m3u8: '', direct: '' };
}

function playCacheGet(key) {
    const v = playCache.get(key);
    if (!v) return null;
    if (Date.now() - v.at > PLAY_TTL) {
        playCache.delete(key);
        return null;
    }
    return v.val;
}

function playCachePut(key, val) {
    playCache.set(key, { at: Date.now(), val });
    if (playCache.size > 60) {
        const sorted = [...playCache.entries()].sort((a, b) => a[1].at - b[1].at);
        for (const [k] of sorted.slice(0, 20)) playCache.delete(k);
    }
}

function lineRank(name) {
    const u = String(name || '')
        .trim()
        .toUpperCase();
    return LINE_ORDER[u] ?? 50;
}

function buildCategoryUrl(tid, page, sort) {
    if (tid === '__home') {
        return page === 1 ? `${HOST}/` : `${HOST}/page/${page}/`;
    }
    if (tid === '__popular') {
        return page === 1 ? `${HOST}/popular/` : `${HOST}/popular/page/${page}/`;
    }
    const base = `${HOST}/category/${tid}`;
    let url = page === 1 ? `${base}/` : `${base}/page/${page}/`;
    if (sort) url += `?sort=${encodeURIComponent(sort)}`;
    return url;
}

async function fetchList(url) {
    let html = await fetchPage(url);
    let items = parseCards(html);
    if (!items.length) {
        for (let i = 0; i < 2; i++) {
            html = await fetchPage(url, 2);
            items = parseCards(html);
            if (items.length) break;
        }
    }
    return { html, items };
}

async function init(_inReq, _outResp) {
    return { ok: true };
}

async function home(_inReq, _outResp) {
    const classes = CATS.map(([type_id, type_name]) => ({ type_id, type_name }));
    const filters = Object.fromEntries(CATS.filter(([cid]) => !cid.startsWith('__')).map(([cid]) => [cid, SORTS]));
    const html = await fetchPage(`${HOST}/`);
    return { class: classes, filters, list: parseCards(html) };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.tid || inReq.body.id || '__home').trim();
    const page = Math.max(parseInt(inReq.body.page, 10) || 1, 1);
    const extend = parseExtend(inReq.body.filters || inReq.body.filter || inReq.body.extend || {});
    const sort = String(extend.sort || '').trim();
    const url = buildCategoryUrl(tid, page, sort);
    const { html, items } = await fetchList(url);
    return {
        page,
        pagecount: pageCount(html, page),
        limit: items.length || 24,
        total: items.length,
        list: items,
    };
}

async function search(inReq, _outResp) {
    const page = Math.max(parseInt(inReq.body.page, 10) || 1, 1);
    const kw = encodeURIComponent(String(inReq.body.wd || inReq.body.key || '').trim());
    const url =
        page === 1 ? `${HOST}/?s=${kw}` : `${HOST}/page/${page}/?s=${kw}`;
    const { html, items } = await fetchList(url);
    return {
        page,
        pagecount: pageCount(html, page),
        limit: items.length || 24,
        total: items.length,
        list: items,
    };
}

async function detail(inReq, _outResp) {
    let vid = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    vid = String(vid || '')
        .split('/')
        .pop()
        .replace('.html', '')
        .replace(/\D/g, '') || String(vid || '');

    const durl = `${HOST}/${vid}.html`;
    const html = await fetchPage(durl);

    let title = '';
    const tm = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (tm) title = htmlUnescapeTitle(tm[1].replace(/<[^>]+>/g, ''));

    let pic = '';
    const pm = html.match(/background-image:\s*url\((https:\/\/img\.supjav\.com\/[^)]+)\)/i);
    if (pm) pic = pm[1];
    if (!pic) {
        const im = html.match(
            /(https:\/\/img\.supjav\.com\/[^\s"'<>)]+\.(?:jpg|jpeg|png|webp)[^\s"'<>)]*)/i,
        );
        if (im) pic = im[1];
    }
    pic = proxyImg(pic);

    let views = '';
    const vm = html.match(/<span class="views">([^<]+)<\/span>/i);
    if (vm) views = vm[1].trim();

    const tags = [];
    const tagRe = new RegExp(`href="${HOST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(tag|actress)/([^"/]+)`, 'g');
    for (const m of html.matchAll(tagRe)) {
        const s = m[2].replace(/-/g, ' ').trim();
        if (s && !tags.includes(s)) tags.push(s);
    }

    let year = '';
    const ym = html.match(/\/images\/(\d{4})\//);
    if (ym) year = ym[1];

    const links = [...html.matchAll(/data-link="([0-9a-f]{40,})"/gi)].map((m) => m[1]);
    const names = [...html.matchAll(/data-link="[0-9a-f]{40,}"[^>]*>([^<]{1,12})</gi)].map((m) => m[1].trim());
    const pairs = links.map((lk, i) => {
        const nm = names[i] || `线路${i + 1}`;
        return [nm, `正片$${vid}|${lk}`];
    });
    pairs.sort((a, b) => lineRank(a[0]) - lineRank(b[0]));

    let content = title;
    if (tags.length) content += `\n标签: ${tags.slice(0, 10).join(', ')}`;

    return {
        list: [
            {
                vod_id: vid,
                vod_name: title || `SupJav ${vid}`,
                vod_pic: pic,
                vod_year: year,
                vod_remarks: views,
                vod_content: content.slice(0, 600),
                vod_play_from: pairs.length ? pairs.map((p) => p[0]).join('$$$') : 'SupJav',
                vod_play_url: pairs.length ? pairs.map((p) => p[1]).join('$$$') : `正片$${vid}|`,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const fail = { parse: 0, playUrl: '', url: '', jx: 0 };
    let raw = String(inReq.body.id || inReq.body.url || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();

    const pipe = raw.indexOf('|');
    const vid = (pipe >= 0 ? raw.slice(0, pipe) : raw).replace(/\D/g, '') || raw.slice(0, pipe);
    const lk = pipe >= 0 ? raw.slice(pipe + 1) : '';
    const detailUrl = `${HOST}/${vid}.html`;

    if (!lk) return fail;

    const cached = playCacheGet(lk);
    if (cached) return cached;

    const s1Url = `${LK_BASE}?l=${lk}`;
    const s1 = await fetchStream(s1Url, detailUrl);
    let olid = '';
    const om = String(s1 || '').match(/var\s+OLID\s*=\s*'([0-9a-f]{40,})'/i);
    if (om) olid = om[1].split('').reverse().join('');
    else olid = lk.split('').reverse().join('');

    const s2 = await fetchStream(`${LK_BASE}?c=${olid}`, s1Url);
    if (!s2) return fail;

    const { m3u8, direct } = await extractStream(s2, s1Url);
    if (!m3u8 && !direct) return fail;

    if (direct) {
        const res = {
            parse: 0,
            playUrl: '',
            url: direct,
            jx: 0,
            header: { 'User-Agent': UA, Referer: `${HOST}/` },
        };
        playCachePut(lk, res);
        return res;
    }

    let playUrl = m3u8.replace(/\\\//g, '/').replace(/&amp;/g, '&');
    const low = playUrl.toLowerCase();
    if (low.includes('turbosplayer') || low.includes('turboviplay')) {
        playUrl = SJ_HLS_API + encodeURIComponent(playUrl);
    } else {
        playUrl = STREAM_API + encodeURIComponent(playUrl);
    }

    const res = {
        parse: 0,
        playUrl: '',
        url: playUrl,
        jx: 0,
        header: { 'User-Agent': UA },
    };
    playCachePut(lk, res);
    return res;
}

export default {
    meta: {
        key: 'supjavpy',
        name: '🔥SupJav(PY)',
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
