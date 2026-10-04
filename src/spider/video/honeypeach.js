import axios from 'axios';
import crypto from 'crypto';

const DEFAULT_HOST = 'https://honeypeach.cc';
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const PREFIX = '/spider/honeypeach/3';

const MODULES = [
    ['live', '🔴蜜桃直播'],
    ['duanju', '🎬蜜桃短剧'],
    ['caibian', '💋擦边短剧'],
    ['video', '📺蜜桃视频'],
    ['shortv', '🎭蜜桃动漫'],
    ['guochan', '🇨🇳国产精品'],
    ['heiliao', '🍉黑料吃瓜'],
];
const VALID_KEYS = new Set(MODULES.map(([k]) => k));
const SEARCH_MODULES = ['video', 'duanju', 'caibian', 'shortv', 'guochan'];
const DEFAULT_SRC = { duanju: 'huangguo', caibian: 'huangdou', heiliao: 'huangdou' };
const DEFAULT_CAT = { live: 'girls', duanju: 'tuijian', caibian: '0', video: 'new', shortv: 'all', guochan: '', heiliao: '0' };
const RL_ERRS = new Set(['rl_sid', 'rl_dev', 'rl_ip', 'rl', 'rate', 'limit', 'toomany', 'busy']);
const CACHE_TTL = [
    ['/api/home', 21600],
    ['/api/cats', 21600],
    ['/api/module', 90],
    ['/api/detail', 600],
    ['/api/search', 120],
    ['/api/comments', 3],
];

let host = DEFAULT_HOST;
let ua = UA;
let timeout = 15000;
let danmakuOn = true;
let filtersOn = true;
let videoFiltersOn = true;
let cacheOn = true;

let sid = '';
let skey = null;
let skexp = 0;
let dev = '';
let signLock = Promise.resolve();
const catCache = {};
const catDefaults = {};
const filterDefaults = {};
const apiCache = new Map();
let homeCache = null;
let lastErr = '';

function s(v) {
    if (v == null) return '';
    if (typeof v === 'object') return '';
    return String(v).trim();
}

function asDict(v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    if (Array.isArray(v)) {
        const out = {};
        for (const it of v) {
            if (!it || typeof it !== 'object') continue;
            const k = it.key || it.k;
            if (k) out[String(k)] = it.value ?? it.v;
        }
        return out;
    }
    if (typeof v === 'string') {
        const t = v.trim();
        if (!t) return {};
        for (const cand of [t, decodeURIComponent(t)]) {
            if (cand.startsWith('{') || cand.startsWith('[')) {
                try {
                    const d = JSON.parse(cand);
                    if (d && typeof d === 'object' && !Array.isArray(d)) return d;
                } catch {}
            }
        }
    }
    return {};
}

function toInt(v, dft = 0, low, high) {
    let n = parseInt(v, 10);
    if (!Number.isFinite(n)) n = dft;
    if (low != null && n < low) n = low;
    if (high != null && n > high) n = high;
    return n;
}

function looksLikeGarbage(v) {
    const t = s(v);
    if (!t) return false;
    if (/[{}'"]/.test(t) && t.includes(':')) return true;
    if (t.includes(' ') && (t.includes(',') || t.includes(':'))) return true;
    return t.length > 60;
}

function quote(v) {
    return encodeURIComponent(v).replace(/%20/g, '+');
}

function qsOf(params) {
    const parts = [];
    for (const [k, v] of Object.entries(params || {})) {
        const val = s(v);
        if (!val) continue;
        parts.push(`${quote(k)}=${quote(val)}`);
    }
    return parts.join('&');
}

function applyExtend(raw) {
    const cfg = asDict(raw);
    const next = s(cfg.host || cfg.site || cfg.domain);
    if (next) host = (next.startsWith('http') ? next : `https://${next}`).replace(/\/+$/, '');
    if (s(cfg.ua)) ua = s(cfg.ua);
    timeout = toInt(cfg.timeout || 15, 15, 3, 60) * 1000;
    danmakuOn = cfg.danmaku !== false;
    filtersOn = cfg.filters !== false;
    videoFiltersOn = cfg.video_filters !== false;
    cacheOn = cfg.cache !== false;
}

function randId(n = 24) {
    return crypto.randomBytes(n).toString('hex').slice(0, n);
}

function devId() {
    if (!dev) dev = `zp${randId(24)}`;
    return dev;
}

function withSignLock(fn) {
    const run = signLock.then(fn, fn);
    signLock = run.then(() => {}, () => {});
    return run;
}

async function req(url, headers = {}) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': ua, Accept: 'application/json, text/plain, */*', ...headers },
        timeout,
        responseType: 'arraybuffer',
        validateStatus: () => true,
    });
    return { status: resp.status, body: Buffer.from(resp.data || []) };
}

async function handshake(forceNew) {
    if (forceNew) dev = `zp${randId(24)}`;
    let last = '';
    for (let i = 0; i < 3; i++) {
        try {
            const { body } = await req(`${host}/api/handshake?dev=${quote(devId())}`);
            const d = JSON.parse(body.toString('utf8'));
            if (d.skey && d.sid) {
                sid = s(d.sid);
                skey = Buffer.from(s(d.skey), 'hex');
                skexp = toInt(d.exp, 0);
                return true;
            }
            last = s(d.err) || 'skey/sid 为空';
        } catch (e) {
            last = e.message;
        }
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
    console.log('暗夜蜜桃握手失败:', last);
    return false;
}

async function ensureSign(force = false) {
    return withSignLock(async () => {
        if (skey && !force && Date.now() / 1000 < skexp - 120) return true;
        return handshake(force);
    });
}

function cacheTtl(path) {
    for (const [pfx, ttl] of CACHE_TTL) {
        if (path.startsWith(pfx)) return ttl;
    }
    return 0;
}

function cacheKey(path, params) {
    return `${path}?${qsOf(params)}`;
}

function cacheGet(key, allowStale = false) {
    const hit = apiCache.get(key);
    if (!hit) return null;
    const age = (Date.now() - hit.ts) / 1000;
    if (age <= hit.ttl) return hit.data;
    if (allowStale && age <= 1800) return hit.data;
    return null;
}

function useful(data) {
    return data && (data.list || data.cats || data.modules);
}

function cachePut(key, data, ttl) {
    if (ttl <= 0 || !useful(data)) return;
    if (apiCache.size > 400) apiCache.clear();
    apiCache.set(key, { ts: Date.now(), ttl, data });
}

async function sign(path, params) {
    const qs = qsOf(params);
    if (!(await ensureSign())) return [{}, 'nosign'];
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = randId(16);
    const bh = crypto.createHash('sha256').update('').digest('hex');
    const canon = ['GET', path, qs, bh, ts, nonce, sid].join('\n');
    const sig = crypto.createHmac('sha256', skey).update(canon).digest('hex');
    const url = host + path + (qs ? `?${qs}` : '');
    const { status, body } = await req(url, {
        'X-Hp-Sid': sid,
        'X-Hp-Ts': ts,
        'X-Hp-Nonce': nonce,
        'X-Hp-Sign': sig,
        Referer: `${host}/`,
    });
    let d = {};
    try { d = JSON.parse(body.toString('utf8')); } catch {}
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
    let err = s(d.err);
    if (!err && status === 429) err = 'rl_sid';
    lastErr = err;
    return [d, err];
}

function rotateDev() {
    dev = `zp${randId(24)}`;
    sid = '';
    skey = null;
    skexp = 0;
}

async function api(path, params, retry = 1, rotate = 2) {
    try {
        const ttl = cacheOn ? cacheTtl(path) : 0;
        const ck = ttl > 0 ? cacheKey(path, params) : '';
        if (ck) {
            const hit = cacheGet(ck);
            if (hit) return hit;
        }
        const [d, err] = await sign(path, params);
        if (['nosig', 'nosign', 'badsig', 'expired'].includes(err) && retry > 0) {
            await ensureSign(true);
            return api(path, params, retry - 1, rotate);
        }
        if (RL_ERRS.has(err) && rotate > 0) {
            rotateDev();
            await new Promise((r) => setTimeout(r, 300));
            return api(path, params, retry, rotate - 1);
        }
        if (err) {
            if (ck) {
                const stale = cacheGet(ck, true);
                if (stale) return stale;
            }
            return {};
        }
        if (ck && ttl > 0 && !useful(d)) {
            const stale = cacheGet(ck, true);
            if (stale) return stale;
        }
        if (ck) cachePut(ck, d, ttl);
        return d;
    } catch (e) {
        console.log('暗夜蜜桃接口异常', path, e.message);
        return {};
    }
}

async function apiList(path, params) {
    const d = await api(path, params);
    const list = (d.list || []).filter((x) => x && typeof x === 'object');
    return [list, d];
}

function absUrl(u) {
    u = s(u);
    if (!u) return '';
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return host + u;
    return u;
}

function normTid(tid) {
    const t = s(tid);
    if (VALID_KEYS.has(t)) return t;
    for (const [k] of MODULES) {
        if (k && t.includes(k)) return k;
    }
    const core = t.replace(/[^0-9A-Za-z\u4e00-\u9fff]+/g, '');
    if (core) {
        for (const [k, name] of MODULES) {
            const n = name.replace(/[^0-9A-Za-z\u4e00-\u9fff]+/g, '');
            if (n && (n.includes(core) || core.includes(n))) return k;
        }
    }
    return t || 'video';
}

function pack(key, src, vid, ep) {
    return `${key}|${src || ''}|${vid}|${ep ?? 1}`;
}

function splitPlay(raw) {
    const p = s(raw).split('|');
    if (p.length >= 4) return [normTid(p[0]), p[1], p[2], p[3]];
    if (p.length === 3) return [normTid(p[0]), p[1], p[2], '1'];
    return ['video', '', s(raw), '1'];
}

function guessSrc(mod, item) {
    const src = s(item?.src);
    if (src) return src;
    const m = s(item?.cover).match(/^\/cover\/([^?/]+)\?/);
    if (m && ['huangguo', 'huangdou'].includes(m[1]) && ['duanju', 'caibian', 'heiliao'].includes(mod)) return m[1];
    return DEFAULT_SRC[mod] || '';
}

function brief(mod, src, x) {
    return {
        vod_id: `${mod}|${src || ''}|${s(x.id)}`,
        vod_name: s(x.title || x.name),
        vod_pic: absUrl(x.cover),
        vod_remarks: s(x.remark),
        vod_content: s(x.desc),
    };
}

function requestOrigin(inReq) {
    const proto = String(inReq?.headers?.['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const reqHost = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host || `127.0.0.1:${process.env.DEV_HTTP_PORT || 9988}`;
    return `${proto}://${reqHost}`;
}

function proxyUrl(inReq, query) {
    return `${requestOrigin(inReq)}${PREFIX}/proxy?${qsOf(query)}`;
}

async function homeModules() {
    if (homeCache) return homeCache;
    const out = {};
    const d = await api('/api/home');
    for (const m of d.modules || []) {
        if (m?.key) out[s(m.key)] = `${s(m.icon)}${s(m.name || m.key)}`;
    }
    homeCache = out;
    return out;
}

async function catsOf(key) {
    if (catCache[key]) return catCache[key];
    const d = await api('/api/cats', { key, v: 3 });
    const cats = (d.cats || []).filter((c) => c && typeof c === 'object');
    if (cats.length) catCache[key] = cats;
    return cats;
}

async function defaultCat(key) {
    if (catDefaults[key]) return catDefaults[key];
    let cat = DEFAULT_CAT[key] ?? '';
    let src = DEFAULT_SRC[key] || '';
    let sub = 0;
    for (const c of await catsOf(key)) {
        const code = s(c.code);
        if (!code) continue;
        cat = code;
        src = s(c.src) || src;
        sub = toInt(c.sub, 0);
        break;
    }
    catDefaults[key] = [cat, src, sub];
    return catDefaults[key];
}

async function tagOptions(catCode, limit = 200) {
    const [lst] = await apiList('/api/module', { key: 'video', cat: catCode, page: 1 });
    const out = [];
    for (const x of lst) {
        const code = s(x.code);
        if (!code) continue;
        out.push({ n: s(x.name) || code, v: code });
        if (out.length >= limit) break;
    }
    return out;
}

function jsonCat(v) {
    const t = s(v);
    if (!t) return '';
    if (t.startsWith('{')) {
        try {
            const o = JSON.parse(t);
            if (o && typeof o === 'object') return s(o.c);
        } catch {}
    }
    return t;
}

async function parseFilter(key, extend) {
    let ext = asDict(extend);
    if (!Object.keys(ext).length && typeof extend === 'string' && extend.trim()) ext = { cat: extend.trim() };
    const tmp = {};
    const raw = (k) => {
        let v = ext[k];
        if (Array.isArray(v)) v = v[0] ?? '';
        return v;
    };
    for (const k of ['cat', 'tag', 'actress', 'maker']) {
        const v = raw(k);
        if (v && typeof v === 'object') {
            tmp[k] = s(v.c ?? v.code);
            tmp[`${k}_src`] = s(v.s || v.src);
            tmp[`${k}_sub`] = toInt(v.b ?? v.sub, 0);
            continue;
        }
        const t = s(v);
        if (!t) continue;
        if (t.startsWith('{') || t.startsWith('[') || t.toUpperCase().includes('%7B')) {
            const o = asDict(t);
            if (Object.keys(o).length) {
                tmp[k] = s(o.c ?? o.code);
                tmp[`${k}_src`] = s(o.s || o.src);
                tmp[`${k}_sub`] = toInt(o.b ?? o.sub, 0);
                continue;
            }
            const m = t.match(/["']c["']\s*:\s*["']([^"']*)["']/);
            if (m) {
                tmp[k] = m[1];
                continue;
            }
        }
        if (looksLikeGarbage(t)) continue;
        tmp[k] = t;
    }
    const dflt = filterDefaults[key] || {};
    let picked = '';
    let pickedK = '';
    for (const k of ['tag', 'actress', 'maker']) {
        if (tmp[k] && tmp[k] !== dflt[k]) {
            picked = tmp[k];
            pickedK = k;
            break;
        }
    }
    if (!picked) {
        const c = tmp.cat;
        if (c && (c !== jsonCat(dflt.cat) || !dflt.cat)) {
            picked = c;
            pickedK = 'cat';
        }
    }
    if (!picked) return defaultCat(key);
    let src = tmp[`${pickedK}_src`] || '';
    const sub = toInt(tmp[`${pickedK}_sub`], 0);
    if (!src && pickedK === 'cat') src = DEFAULT_SRC[key] || '';
    if (pickedK !== 'cat') src = '';
    return [picked, src, sub];
}

async function init(inReq) {
    applyExtend(inReq.body?.extend ?? inReq.body?.ext ?? '');
    await ensureSign();
    return {};
}

async function home(inReq) {
    const mods = await homeModules();
    const classes = MODULES.map(([key, fallback]) => ({
        type_id: key,
        type_name: mods[key] || fallback,
    }));
    const filters = {};
    if (!filtersOn) {
        const list = await homeList();
        return { class: classes, filters, list };
    }
    const boxes = {};
    await Promise.all(MODULES.map(async ([key]) => {
        try { boxes[key] = await catsOf(key); } catch { boxes[key] = []; }
    }));
    for (const [key] of MODULES) {
        const opts = [];
        let dflt = null;
        for (const c of boxes[key] || []) {
            if (['tags', 'actress', 'todo'].includes(c.kind)) continue;
            const code = s(c.code);
            const label = s(c.name) || code || '全部';
            const val = JSON.stringify({ c: code, s: s(c.src), b: toInt(c.sub, 0) });
            if (dflt == null) dflt = val;
            opts.push({ n: label, v: val });
        }
        if (!opts.length) {
            const val = JSON.stringify({ c: DEFAULT_CAT[key] ?? '', s: DEFAULT_SRC[key] || '', b: 0 });
            opts.push({ n: '全部', v: val });
            dflt = val;
        }
        const flt = [{ key: 'cat', name: '分类', value: opts }];
        filterDefaults[key] = { ...(filterDefaults[key] || {}), cat: dflt || '' };
        if (key === 'video' && videoFiltersOn) {
            for (const [kk, nm, cc] of [['tag', '类型', 'genres'], ['actress', '女优', 'actresses-ranking'], ['maker', '发行商', 'makers']]) {
                const vals = await tagOptions(cc);
                if (!vals.length) continue;
                flt.push({ key: kk, name: nm, value: vals });
                filterDefaults[key][kk] = vals[0].v;
            }
        }
        filters[key] = flt;
    }
    return { class: classes, filters, list: await homeList() };
}

async function homeList() {
    const vlist = [];
    for (const [mod, cat] of [['video', 'new'], ['duanju', 'tuijian'], ['guochan', ''], ['shortv', 'all'], ['heiliao', '0']]) {
        const [lst] = await apiList('/api/module', { key: mod, cat, page: 1, src: DEFAULT_SRC[mod] || '' });
        if (lst.length) {
            const [, dsrc] = await defaultCat(mod);
            for (const x of lst.slice(0, 12)) vlist.push(brief(mod, guessSrc(mod, x) || dsrc, x));
            break;
        }
        if (lastErr) break;
    }
    return vlist;
}

async function category(inReq) {
    const key = normTid(inReq.body.id || inReq.body.tid);
    const page = toInt(inReq.body.page || inReq.body.pg, 1, 1);
    let cat;
    let src;
    let sub;
    try {
        [cat, src, sub] = await parseFilter(key, inReq.body.filters || inReq.body.filter || inReq.body.extend);
    } catch {
        [cat, src, sub] = await defaultCat(key);
    }
    const plans = [[cat, src, sub]];
    if (page === 1) {
        const dft = await defaultCat(key);
        for (const p of [dft, ['', '', 0]]) {
            if (!plans.some((x) => x[0] === p[0] && x[1] === p[1] && x[2] === p[2])) plans.push(p);
        }
    }
    let first = null;
    for (const [c, srcName, b] of plans.slice(0, 3)) {
        const [lst, d] = await apiList('/api/module', { key, cat: c, src: srcName, sub: b, page });
        if (!first) first = d;
        if (lst.length) {
            const pages = toInt(d.pages, 0, 0);
            const pagecount = pages > 0 ? pages : (d.has_more ? page + 1 : page);
            return {
                list: lst.map((x) => brief(key, s(x.src) || srcName, x)),
                page,
                pagecount,
                limit: lst.length,
                total: pagecount * Math.max(lst.length, 1),
            };
        }
        if (lastErr) break;
    }
    const pagecount = toInt(first?.pages, 0, 0) || page;
    return { list: [], page, pagecount, limit: 30, total: 0 };
}

async function detail(inReq) {
    const ids = s(inReq.body.id);
    if (!ids) return { list: [] };
    let [key, src, vid] = splitPlay(ids);
    if (!src) src = DEFAULT_SRC[key] || '';
    const d = await api(`/api/detail/${key}/${encodeURIComponent(vid)}`, src ? { src } : {});
    const det = d.detail;
    if (!det || typeof det !== 'object') return { list: [] };
    const eps = det.episodes || [];
    const epList = [];
    eps.forEach((e, i) => {
        if (!e || typeof e !== 'object') return;
        const ep = e.ep || (i + 1);
        let name = s(e.name) || `第${ep}集`;
        if (e.lock || e.vip || e.price) name += '🔒';
        epList.push(`${name}$${pack(key, src, vid, ep)}`);
    });
    if (!epList.length) epList.push(`播放$${pack(key, src, vid, 1)}`);
    const vod = {
        vod_id: ids,
        vod_name: s(det.title),
        vod_pic: absUrl(det.cover),
        vod_content: s(det.desc),
        vod_remarks: s(det.remark || det.duration),
        vod_play_from: key === 'live' ? '直播' : '蜜桃',
        vod_play_url: epList.join('#'),
    };
    if (det.actor) vod.vod_actor = s(det.actor);
    if (det.area) vod.vod_area = s(det.area);
    if (det.tag) vod.vod_tag = s(det.tag);
    if (key === 'live' && det.viewers) vod.vod_remarks = `在线 ${det.viewers} 人`;
    return { list: [vod] };
}

async function search(inReq) {
    const kw = s(inReq.body.wd || inReq.body.key);
    const page = toInt(inReq.body.page || inReq.body.pg, 1, 1);
    if (!kw) return { list: [], page };
    const out = [];
    const seen = new Set();
    for (const mod of SEARCH_MODULES) {
        const [lst] = await apiList('/api/search', { key: mod, kw, page });
        for (const x of lst) {
            const vid = s(x.id);
            if (!vid || seen.has(vid)) continue;
            seen.add(vid);
            out.push(brief(mod, guessSrc(mod, x), x));
        }
    }
    return { list: out, page };
}

async function playData(key, src, vid, ep, retry = 1) {
    const d = await api(`/api/play/${key}/${encodeURIComponent(vid)}/${ep || '1'}`, src ? { src } : {});
    const pl = d.play && typeof d.play === 'object' ? d.play : {};
    if (!pl.src && retry > 0) {
        await new Promise((r) => setTimeout(r, 500));
        return playData(key, src, vid, ep, retry - 1);
    }
    return pl;
}

async function play(inReq) {
    let raw = s(inReq.body.id);
    try { if (raw.includes('%')) raw = decodeURIComponent(raw); } catch {}
    let [key, src, vid, ep] = splitPlay(raw);
    if (!src) src = DEFAULT_SRC[key] || '';
    if (!ep) ep = '1';
    const header = { 'User-Agent': ua, Referer: `${host}/` };
    let pl = {};
    try { pl = await playData(key, src, vid, ep); } catch {}
    const srcUrl = s(pl.src);
    const px = s(pl.src_proxy);
    const smart = proxyUrl(inReq, { type: 'hls', key, src, vid, ep });
    const lines = [];
    if (srcUrl.startsWith('/')) {
        lines.push('线路一·直连', host + srcUrl);
        if (px.startsWith('/')) lines.push('线路二·中转', host + px);
        lines.push('线路三·智能', smart);
    } else if (srcUrl) {
        if (px.startsWith('/')) lines.push('线路一·中转', host + px);
        lines.push('线路二·直连', srcUrl);
        lines.push('线路三·智能', smart);
    } else {
        lines.push('线路一·智能', smart);
    }
    const res = { parse: 0, header, url: lines.length >= 4 ? lines : (lines[1] || '') };
    if (key === 'live' && danmakuOn) res.danmaku = proxyUrl(inReq, { type: 'danmu', sid: vid });
    return res;
}

function rewriteM3u8(text, playlistUrl) {
    if (!text.includes('#EXTM3U')) return null;
    const abs = (u) => {
        try { return new URL(u, playlistUrl).href; } catch { return u; }
    };
    const lines = text.split('\n').map((line) => {
        if (line.includes('URI="')) {
            return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${abs(u)}"`);
        }
        const ln = line.trim();
        if (ln && !ln.startsWith('#')) return abs(ln);
        return line;
    });
    return lines.join('\n');
}

async function fetchPlaylist(url) {
    const { status, body } = await req(url, { Referer: `${host}/` });
    if (![200, 206].includes(status) || !body.length) return null;
    return rewriteM3u8(body.toString('utf8'), url);
}

function xmlEsc(v) {
    return s(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function danmakuXml(liveId) {
    const head = '<?xml version="1.0" encoding="UTF-8"?>';
    try {
        const d = await api(`/api/comments/live/${encodeURIComponent(s(liveId))}`);
        const rows = [];
        let i = 0;
        for (const m of d.messages || []) {
            if (!m || typeof m !== 'object') continue;
            const user = s(m.u);
            const text = s(m.t);
            if (!text) continue;
            const show = user ? `${user}: ${text}` : text;
            rows.push(`\t<d p="${(i * 0.8).toFixed(1)},1,25,16777215,0">${xmlEsc(show.slice(0, 80))}</d>`);
            i += 1;
        }
        if (!rows.length) return `${head}<i></i>`;
        return [head, '<i>', ...rows, '</i>'].join('\n');
    } catch {
        return `${head}<i></i>`;
    }
}

async function localProxy(inReq, reply) {
    try {
        const q = inReq.query || {};
        if (s(q.type) === 'hls') {
            const key = normTid(q.key || 'video');
            const src = s(q.src);
            const vid = s(q.vid);
            const ep = s(q.ep) || '1';
            const pl = await playData(key, src, vid, ep);
            let url = s(pl.src);
            if (!url) return reply.code(404).type('text/plain').send('');
            if (!url.startsWith('http')) url = host + url;
            let txt = await fetchPlaylist(url);
            if (txt == null && pl.src_proxy) txt = await fetchPlaylist(absUrl(pl.src_proxy));
            if (txt == null) return reply.code(404).type('text/plain').send('');
            return reply.type('application/vnd.apple.mpegurl').header('Cache-Control', 'no-cache').send(txt);
        }
        if (s(q.type) === 'danmu') {
            return reply.type('text/xml').send(await danmakuXml(q.sid || ''));
        }
    } catch (e) {
        console.log('暗夜蜜桃代理异常', e.message);
    }
    return reply.code(404).type('text/plain').send('');
}

export default {
    meta: {
        key: 'honeypeach',
        name: '🍑暗夜蜜桃',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy', localProxy);
    },
};
