import req from '../../util/req.js';

/**
 * 88影视 (88ayyc) · MacCMS · 双层 base64 · player_aaaa · 海报 XOR 解密
 * ext 示例: https://88ayyc35.6p.tattoo
 */

const DEFAULT_BASE = 'https://88ayyc35.6p.tattoo';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT = 12000;
const PER_PAGE = 10;
const CACHE_TTL = 300;
const PORT = process.env.DEV_HTTP_PORT || 9988;
const IMG_KEY = Buffer.from('OzoTeoS7D>6Y^@z39JmD');
const ENC_DOMAINS = ['cdn.bcebos.com', 'ucloudqn.unipus.cn', 'vfile.meituan.net'];

const FALLBACK_CATS = {
    3: '黑料吃瓜',
    4: '厂牌原创',
    5: '国产精选',
    6: '明星换脸',
    7: 'AV解说',
    8: '禁漫精选',
    9: '乱伦',
    10: '父女',
    11: '母子',
    12: '兄妹',
    13: '学生',
    14: '嫂子',
    15: '姐夫',
    16: '师生',
    17: '全家',
    28: '国产大片',
    31: '欧美大片',
    32: '网红直播',
    33: '探花约炮',
    34: '三级伦理',
    35: '萝莉开苞',
    66: '有声小说',
    68: 'cosplay',
    69: 'AI魔改',
    70: 'av综艺',
    72: '嫩妹下海',
    74: '每日甄选',
    76: 'ts人妖',
    77: '姿势玩法',
    78: '同性恋',
    79: '真实缅北',
    80: '恶心恐怖',
    81: '黄金圣水',
    82: '校园霸凌',
    83: '战场实录',
    84: '人兽乱交',
    85: '灵异视频',
    86: 'N号房',
    87: '日韩大片',
    88: 'SM调教',
};

let base = DEFAULT_BASE;
const cache = new Map();
const picMem = new Map();
const warming = new Set();

function applyBase(extend) {
    let ext = extend;
    if (typeof ext === 'object' && ext !== null && !Array.isArray(ext)) {
        ext = ext.ext || ext.base || ext.url || '';
    }
    if (Array.isArray(ext)) ext = ext[0] || '';
    ext = String(ext || '')
        .trim()
        .replace(/^["']|["']$/g, '');
    base = (ext.startsWith('http') ? ext : DEFAULT_BASE).replace(/\/$/, '');
}

function cacheGet(key) {
    const item = cache.get(key);
    if (!item) return null;
    if (Date.now() - item.at > CACHE_TTL * 1000) {
        cache.delete(key);
        return null;
    }
    return item.val;
}

function cacheSet(key, val) {
    cache.set(key, { at: Date.now(), val });
    if (cache.size > 2000) {
        for (const k of [...cache.keys()].slice(0, 1000)) cache.delete(k);
    }
}

function fetchHeaders(referer = '') {
    return {
        'User-Agent': UA,
        Referer: referer || `${base}/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Connection: 'close',
    };
}

function b64Decode(text) {
    const s = String(text || '').replace(/\s/g, '');
    const pad = (4 - (s.length % 4)) % 4;
    try {
        return Buffer.from(s + '='.repeat(pad), 'base64').toString('utf8');
    } catch {
        return null;
    }
}

function unwrap(text) {
    if (!text) return text;
    let m = text.match(/var\s+str\s*=\s*'([^']+)'/);
    if (!m) m = text.match(/var\s+str\s*=\s*"([^"]+)"/);
    if (!m) return text;
    let cur = m[1];
    for (let i = 0; i < 2; i++) {
        const next = b64Decode(cur);
        if (!next || !next.trim()) break;
        cur = next;
    }
    return cur;
}

async function fetchText(url, referer = '') {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const resp = await req.get(url, {
                headers: fetchHeaders(referer),
                timeout: TIMEOUT,
                responseType: 'text',
                validateStatus: () => true,
            });
            if (resp.status >= 400) continue;
            return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        } catch {
            /* retry */
        }
    }
    return '';
}

async function fetchJson(url, referer = '') {
    const text = unwrap(await fetchText(url, referer));
    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
}

function fixUrl(url) {
    const v = String(url || '').trim();
    if (!v) return '';
    if (v.startsWith('//')) return `https:${v}`;
    if (v.startsWith('http')) return v;
    if (v.startsWith('/')) return `${base}${v}`;
    return `${base}/${v.replace(/^\//, '')}`;
}

function pick(v, ...keys) {
    for (const k of keys) {
        const val = v?.[k];
        if (val !== undefined && val !== null && val !== '' && val !== '0') return val;
    }
    return '';
}

function picMime(buf) {
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf.length >= 3 && buf.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif';
    if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
        return 'image/webp';
    }
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    return '';
}

function decodePic(raw) {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw || []);
    if (buf.length < 64) return { data: Buffer.alloc(0), mime: '' };
    const direct = picMime(buf);
    if (direct) return { data: buf, mime: direct };

    const txt = buf.toString('utf8').trim();
    let encrypted;
    try {
        const pad = (4 - (txt.length % 4)) % 4;
        encrypted = Buffer.from(txt + '='.repeat(pad), 'base64');
    } catch {
        return { data: Buffer.alloc(0), mime: '' };
    }
    if (!encrypted.length) return { data: Buffer.alloc(0), mime: '' };

    const out = Buffer.allocUnsafe(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
        out[i] = encrypted[i] ^ IMG_KEY[i % IMG_KEY.length];
    }
    const mime = picMime(out);
    return mime ? { data: out, mime } : { data: Buffer.alloc(0), mime: '' };
}

async function loadPic(url) {
    if (!url || !url.startsWith('http')) return { data: Buffer.alloc(0), mime: '' };
    const mem = picMem.get(url);
    if (mem) return mem;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const resp = await req.get(url, {
                headers: fetchHeaders(`${base}/`),
                responseType: 'arraybuffer',
                timeout: TIMEOUT,
                validateStatus: () => true,
            });
            if (resp.status !== 200 || !resp.data) continue;
            const decoded = decodePic(Buffer.from(resp.data));
            if (decoded.data.length) {
                if (picMem.size < 400) picMem.set(url, decoded);
                return decoded;
            }
        } catch {
            /* retry */
        }
    }
    return { data: Buffer.alloc(0), mime: '' };
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/ayyc/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = inReq?.headers?.['x-forwarded-proto'] || 'http';
        return `${proto}://${hostHeader}${prefix}`;
    }
    return `http://127.0.0.1:${PORT}${prefix}`;
}

function wrapPic(rawUrl, inReq) {
    const url = fixUrl(rawUrl);
    if (!url || !url.startsWith('http')) return '';
    if (url.includes('/img?url=')) return url;

    const needDecode = ENC_DOMAINS.some((d) => url.includes(d));
    if (inReq && (needDecode || url.startsWith('http'))) {
        const b64 = Buffer.from(url, 'utf8').toString('base64');
        return `${getProxyBase(inReq)}/img?url=${encodeURIComponent(b64)}`;
    }
    return url;
}

function fmtPlay(sid) {
    return `线路${sid}`;
}

async function getCats() {
    const cached = cacheGet('cats');
    if (cached) return cached;

    let cats = {};
    try {
        const html = unwrap(await fetchText(`${base}/`));
        for (const m of html.matchAll(/\/index\.php\/vod\/type\/id\/(\d+)\.html"[^>]*>\s*([^<]{1,24}?)\s*</g)) {
            const name = m[2].trim();
            if (name && !cats[m[1]]) cats[m[1]] = name;
        }
    } catch {
        cats = {};
    }
    if (Object.keys(cats).length < 5) cats = { ...FALLBACK_CATS };
    cacheSet('cats', cats);
    return cats;
}

async function listPage(tid, page) {
    const ck = `lp:${tid}:${page}`;
    const cached = cacheGet(ck);
    if (cached) return cached;
    let j = {};
    try {
        j = await fetchJson(`${base}/index.php/ajax/data?mid=1&tid=${tid}&page=${page}`);
    } catch {
        j = { list: [], pagecount: 1, total: 0 };
    }
    cacheSet(ck, j);
    return j;
}

function parsePlayerAaaa(html) {
    const idx = html.indexOf('player_aaaa');
    if (idx < 0) return null;
    const start = html.indexOf('{', idx);
    if (start < 0) return null;
    let depth = 0;
    for (let i = start; i < html.length; i++) {
        const ch = html[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(html.slice(start, i + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

async function fetchPlay(vid, sid = 1, nid = 1) {
    const ck = `pp:${vid}:${sid}:${nid}`;
    const cached = cacheGet(ck);
    if (cached) return cached;

    const url = `${base}/index.php/vod/play/id/${vid}/sid/${sid}/nid/${nid}.html`;
    const ref = `${base}/index.php/vod/detail/id/${vid}.html`;
    let data = {};
    let m3u8 = '';
    const sids = [];
    try {
        const html = unwrap(await fetchText(url, ref));
        const obj = parsePlayerAaaa(html);
        if (obj) {
            data = { ...(obj.vod_data || {}) };
            let u = String(obj.url || '').trim().replace(/\\\//g, '/');
            if (u.startsWith('//')) u = `https:${u}`;
            m3u8 = u;
        }
        for (const m of html.matchAll(new RegExp(`/index\\.php/vod/play/id/${vid}/sid/(\\d+)/nid/`, 'g'))) {
            if (!sids.includes(m[1])) sids.push(m[1]);
        }
    } catch {
        /* ignore */
    }
    const res = [data, m3u8, sids.length ? sids : [String(sid)]];
    cacheSet(ck, res);
    return res;
}

async function fetchM3u8(vid, sid) {
    return (await fetchPlay(vid, sid, 1))[1];
}

function brief(v, cats, inReq) {
    const vid = String(v?.vod_id || '');
    const pic = pick(v, 'vod_pic', 'vod_pic_slide', 'vod_pic_thumb');
    return {
        vod_id: /^\d+$/.test(vid) ? parseInt(vid, 10) : vid,
        vod_name: v?.vod_name || '',
        vod_sub: '',
        vod_en: '',
        type_id: v?.type_id || 0,
        type_name: cats[String(v?.type_id || '')] || '',
        vod_pic: wrapPic(pic, inReq),
        vod_actor: v?.vod_actor || '',
        vod_director: v?.vod_director || '',
        vod_year: v?.vod_year || '',
        vod_area: v?.vod_area || '',
        vod_lang: v?.vod_lang || '',
        vod_remarks: v?.vod_remarks || v?.vod_pubdate || '',
        vod_score: String(v?.vod_score || '0'),
        vod_time: v?.vod_pubdate || new Date().toISOString().slice(0, 19).replace('T', ' '),
        vod_content: v?.vod_blurb || v?.vod_content || '',
        vod_play_from: '',
        vod_play_url: '',
    };
}

async function searchItems(wd) {
    const ck = `sb:${wd}`;
    const cached = cacheGet(ck);
    if (cached) return cached;

    const url = `${base}/index.php/vod/search.html?wd=${encodeURIComponent(wd)}`;
    const briefs = [];
    const seen = new Set();
    let html = '';
    try {
        html = unwrap(await fetchText(url));
    } catch {
        html = '';
    }

    for (const part of html.split(/(?=\/index\.php\/vod\/detail\/id\/\d+\.html")/)) {
        if (!part.startsWith('/index.php/vod/detail/id/')) continue;
        const head = part.slice(0, 2000);
        const m = head.match(/^\/index\.php\/vod\/detail\/id\/(\d+)\.html"/);
        if (!m) continue;
        const vid = m[1];
        if (seen.has(vid)) continue;
        seen.add(vid);
        const t = head.match(/title="([^"]{1,140})"/);
        const img = head.match(/<img[^>]+(?:data-src|data-original|src)="(https?:\/\/[^"]{10,200})"/);
        briefs.push({
            vod_id: vid,
            vod_name: t ? t[1].trim() : vid,
            vod_pic: img ? img[1] : '',
        });
    }

    if (!briefs.length && html) {
        try {
            const j = JSON.parse(html);
            for (const it of j.list || []) {
                briefs.push({
                    vod_id: String(it.vod_id || ''),
                    vod_name: it.vod_name || '',
                    vod_pic: it.vod_pic || '',
                });
            }
        } catch {
            /* ignore */
        }
    }

    cacheSet(ck, briefs);
    return briefs;
}

function warmPlay(vids) {
    const todo = [];
    for (const v of vids) {
        const vid = String(v || '');
        if (!vid || warming.has(vid) || cacheGet(`pp:${vid}:1:1`)) continue;
        warming.add(vid);
        todo.push(vid);
        if (todo.length >= 12) break;
    }
    if (!todo.length) return;

    setImmediate(async () => {
        try {
            await Promise.all(todo.map((vid) => fetchPlay(vid, 1, 1)));
        } finally {
            for (const vid of todo) warming.delete(vid);
        }
    });
}

function warmPics(urls) {
    const todo = urls.filter((u) => u && u.startsWith('http') && !picMem.has(u)).slice(0, 24);
    if (!todo.length) return;
    setImmediate(() => {
        Promise.all(todo.map((u) => loadPic(u))).catch(() => {});
    });
}

async function init(inReq, _outResp) {
    applyBase(inReq.body?.extend ?? inReq.body?.ext ?? '');
    return { ok: true };
}

async function home(inReq, _outResp) {
    applyBase(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const cats = await getCats();
    const classes = Object.entries(cats)
        .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
        .map(([tid, name]) => ({ type_id: parseInt(tid, 10), type_name: name }));

    const tidList = classes.slice(0, 4).map((c) => String(c.type_id));
    const filters = Object.fromEntries(tidList.map((t) => [t, []]));

    const tids = Object.keys(cats)
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
        .slice(0, 6);
    const items = [];
    const seen = new Set();
    const lists = await Promise.all(
        tids.map(async (tid) => {
            try {
                return (await listPage(tid, 1)).list?.slice(0, 6) || [];
            } catch {
                return [];
            }
        }),
    );
    for (const lst of lists) {
        for (const v of lst) {
            const vid = String(v.vod_id);
            if (seen.has(vid)) continue;
            seen.add(vid);
            items.push(brief(v, cats, inReq));
            warmPics([pick(v, 'vod_pic', 'vod_pic_slide', 'vod_pic_thumb')]);
        }
    }

    return { class: classes, filters, list: items };
}

async function category(inReq, _outResp) {
    applyBase(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const tid = String(inReq.body.tid || inReq.body.id || '5');
    const page = Math.max(parseInt(inReq.body.page, 10) || 1, 1);
    const cats = await getCats();
    const j = await listPage(tid, page);
    const raw = j.list || [];
    const list = raw.map((v) => brief(v, cats, inReq));
    const pagecount = parseInt(j.pagecount, 10) || 1;
    const total = parseInt(j.total, 10) || list.length;

    warmPlay(raw.map((v) => v.vod_id));
    warmPics(raw.map((v) => pick(v, 'vod_pic', 'vod_pic_thumb', 'vod_pic_slide')));

    return { list, page, pagecount, limit: PER_PAGE, total };
}

async function search(inReq, _outResp) {
    applyBase(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const wd = String(inReq.body.wd || inReq.body.key || '').trim();
    if (!wd) return { list: [] };
    const cats = await getCats();
    const briefs = await searchItems(wd);
    warmPlay(briefs.slice(0, 30).map((b) => b.vod_id));
    return { list: briefs.map((b) => brief(b, cats, inReq)) };
}

async function detail(inReq, _outResp) {
    applyBase(inReq.body?.extend ?? inReq.body?.ext ?? '');
    let vid = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    vid = String(vid || '')
        .split('$')[0]
        .trim();
    if (!vid) return { list: [] };

    if (vid.startsWith('http')) {
        return {
            list: [
                {
                    vod_id: vid,
                    vod_name: vid,
                    vod_play_from: '线路1',
                    vod_play_url: `正片$${vid}`,
                },
            ],
        };
    }

    const cats = await getCats();
    const [data, first, sids] = await fetchPlay(vid, 1, 1);
    const item = brief(data, cats, inReq);
    item.vod_id = /^\d+$/.test(vid) ? parseInt(vid, 10) : vid;

    const urls = {};
    if (first) urls['1'] = first;
    const rest = sids.filter((s) => !urls[s]);
    if (rest.length) {
        const results = await Promise.all(
            rest.map(async (sid) => {
                const u = await fetchM3u8(vid, sid);
                return [sid, u];
            }),
        );
        for (const [sid, u] of results) {
            if (u) urls[sid] = u;
        }
    }

    const froms = [];
    const playUrls = [];
    for (const sid of Object.keys(urls).sort((a, b) => {
        const na = parseInt(a, 10);
        const nb = parseInt(b, 10);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return 999;
    })) {
        const u = urls[sid];
        if (!u || !u.startsWith('http')) continue;
        froms.push(fmtPlay(sid));
        playUrls.push(`正片$${u}`);
    }

    item.vod_play_from = froms.length ? froms.join('$$$') : '线路1';
    item.vod_play_url = playUrls.join('$$$');
    return { list: [item] };
}

async function play(inReq, _outResp) {
    applyBase(inReq.body?.extend ?? inReq.body?.ext ?? '');
    let url = String(inReq.body.id || inReq.body.url || '').trim();
    if (url.includes('$')) url = url.split('$').pop().trim();
    if (url.startsWith('//')) url = `https:${url}`;
    if (!url.startsWith('http')) {
        const u = await fetchM3u8(url, 1);
        if (u) url = u;
    }
    return {
        parse: 0,
        playUrl: '',
        url,
        header: {
            'User-Agent': UA,
            Referer: `${base}/`,
        },
    };
}

async function imgProxy(inReq, reply) {
    try {
        let imgB64 = inReq.query.url || '';
        try {
            imgB64 = decodeURIComponent(imgB64);
        } catch {
            /* ignore */
        }
        const pad = (4 - (imgB64.length % 4)) % 4;
        if (pad) imgB64 += '='.repeat(pad);
        const imgUrl = Buffer.from(imgB64, 'base64').toString('utf8');
        if (!imgUrl || !imgUrl.startsWith('http')) return reply.code(404).send('');

        const { data, mime } = await loadPic(imgUrl);
        if (!data.length) return reply.code(404).send('');

        return reply
            .code(200)
            .header('Content-Type', mime || 'image/jpeg')
            .header('Cache-Control', 'public, max-age=604800')
            .send(data);
    } catch (e) {
        console.warn('[ayyc] imgProxy err', e.message);
        return reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'ayyc',
        name: '🎬88影视',
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
