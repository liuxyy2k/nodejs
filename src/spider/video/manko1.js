import axios from 'axios';

// ═══════════════════════════════════════════════════════════════════════════════
// Manko manko.fun —— 蜘蛛插件（meta.type = 3）
//
//   站点：Vue 单页站（/dist/build.js + #app），页面本身没数据，全是接口给的
//   接口：不在 manko.fun 域上，走首页注入的 window.ip（healertanker.com）
//         备用 window.ip2（alpharomeo.shop）
//   编码：接口返回 {"data":"<base91>"}，要先 base91 解码再 JSON.parse
//         只有 common/* 两个列表是明文
//
//   列表：swx/movie/search?page=&size=&can_manko=true[&most_popular|&top_rated|
//         &subtitle_link.EN|&genre=|&category=|&country=|&keyword=|&actor=]
//         → { data:<b91>, total, condition }
//   详情：swx/movie/detail/{24位ObjectId} → { data:<b91> }
//   类型：common/list-genre   → { data:[...] }   明文
//   厂商：common/country-list → { data:[...] }   明文
//   随机：swx/movie/random-list?  → 80 条
//
//   两个必须知道的事：
//   1) 详情只认 24 位 ObjectId。传 slug（abf-399 这种）服务端不返回 404，
//      是直接挂住不回包 —— 所以插件里先校验格式，非 ObjectId 一律不打。
//   2) 片源 CDN 是一堆 *.site 随机子域（每个条目都不一样），必须实时取，
//      不能缓存 host。
// ═══════════════════════════════════════════════════════════════════════════════

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const EXT = {
    site:      '',            // 换镜像域名用（manko.fun 本身）
    apiHost:   '',            // 手填接口域名，留空自动抓
    proxy:     'direct',      // direct | m3u8 | all
    proxyHost: '',            // 壳子内部地址，播放器访问不到时手填
    ttl:       300,           // 缓存秒数
    timeout:   15000,
    pageSize:  24,
    cats:      60,            // 分类树最多放多少个
    lang:      'zh',          // 简介优先语言 zh | en | ja
};

const DEFAULTS = { ...EXT };

const meta = { key: 'manko1', name: '🌸Manko1', type: 3 };

const site = () => (EXT.site || 'https://manko.fun').replace(/\/+$/, '');

// 接口域名：首页注入 window.ip / window.ip2，硬编码这两个兜底
const HOSTS = ['healertanker.com', 'alpharomeo.shop'];

// ─── base91 解码（站点前端的 xn() 原样移植） ────────────────────────────────────
const A91 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';

function b91(t) {
    t = String(t == null ? '' : t);
    const n = t.length;
    const out = [];
    let a = 0, i = 0, o = -1;
    for (let s = 0; s < n; s++) {
        const l = A91.indexOf(t[s]);
        if (l === -1) continue;
        if (o < 0) { o = l; continue; }
        o += 91 * l;
        a |= o << i;
        i += (o & 8191) > 88 ? 13 : 14;
        do { out.push(a & 255); a >>= 8; i -= 8; } while (i > 7);
        o = -1;
    }
    if (o > -1) out.push((a | (o << i)) & 255);
    return Buffer.from(out).toString('utf8');
}

// 接口回来可能是 {"data":"<b91>"}，也可能 data 直接就是数组/对象
function unpack(j) {
    if (!j || typeof j !== 'object') return null;
    const d = j.data;
    if (d == null) return null;
    if (typeof d !== 'string') return d;
    const s = d.trim();
    if (s.startsWith('[') || s.startsWith('{')) {          // 已经是明文
        try { return JSON.parse(s); } catch (e) { /* 继续当 b91 */ }
    }
    try { return JSON.parse(b91(s)); } catch (e) { return null; }
}

function applyExt(inReq) {
    Object.assign(EXT, DEFAULTS);
    let ext = inReq && inReq.body && inReq.body.ext;
    if (typeof ext === 'string') { try { ext = JSON.parse(ext); } catch (e) { ext = null; } }
    if (ext && typeof ext === 'object') {
        for (const k of Object.keys(ext)) {
            if (ext[k] !== undefined && ext[k] !== null && ext[k] !== '') EXT[k] = ext[k];
        }
    }
    return EXT;
}

// ─── 缓存 ─────────────────────────────────────────────────────────────────────
const cache = new Map();
const CMAX  = 600;
function cget(k) {
    const e = cache.get(k);
    if (!e) return null;
    if (Date.now() > e.exp) { cache.delete(k); return null; }
    return e.v;
}
function cset(k, v, ttlSec) {
    if (cache.size > CMAX) {
        const now = Date.now();
        for (const [kk, vv] of cache) if (now > vv.exp) cache.delete(kk);
        if (cache.size > CMAX) cache.delete(cache.keys().next().value);
    }
    cache.set(k, { v, exp: Date.now() + (ttlSec || EXT.ttl) * 1000 });
    return v;
}

// ─── 接口域名（自动抓 + 缓存） ─────────────────────────────────────────────────
let apiHostCache = null;
let apiHostExp   = 0;

async function discoverHosts() {
    if (EXT.apiHost) return [String(EXT.apiHost).replace(/^https?:\/\//, '').replace(/\/+$/, '')];
    if (apiHostCache && Date.now() < apiHostExp) return apiHostCache;

    const list = [];
    try {
        const r = await axios.get(site() + '/home', {
            headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
            timeout: EXT.timeout, responseType: 'text', validateStatus: () => true, maxRedirects: 3,
        });
        const html = String(r.data || '');
        const m1 = html.match(/window\.ip\s*=\s*['"]([^'"]+)['"]/);
        const m2 = html.match(/window\.ip2\s*=\s*['"]([^'"]+)['"]/);
        if (m1 && m1[1]) list.push(m1[1].trim());
        if (m2 && m2[1] && m2[1].trim() !== (m1 && m1[1])) list.push(m2[1].trim());
    } catch (e) { /* 抓不到就用兜底 */ }

    for (const h of HOSTS) if (!list.includes(h)) list.push(h);

    apiHostCache = list;
    apiHostExp   = Date.now() + 10 * 60 * 1000;
    return list;
}

// ─── 请求 ─────────────────────────────────────────────────────────────────────
async function request(path, opt = {}) {
    const hosts = await discoverHosts();
    let lastErr;

    // 主域名挂了自动切备用（前端逻辑一样，两个域名同时死的情况很少）
    for (let hi = 0; hi < hosts.length; hi++) {
        const host = hosts[hi];
        for (let i = 0; i < 2; i++) {
            try {
                const r = await axios.get(`https://${host}/${path}`, {
                    headers: {
                        'User-Agent':      UA,
                        'Accept':          'application/json, text/plain, */*',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                        'Referer':         site() + '/',
                        ...(opt.headers || {}),
                    },
                    timeout:        EXT.timeout,
                    responseType:   'json',
                    validateStatus: () => true,
                    maxRedirects:   3,
                    decompress:     true,
                });
                if (r.status === 200 && r.data) return r.data;
                if (r.status === 404) return null;              // 404 是资源不存在，别重试
                lastErr = new Error(`HTTP ${r.status}`);
            } catch (e) {
                lastErr = e;
                if (e.code === 'ECONNABORTED' || /timeout/i.test(e.message)) break;  // 超时换域名
                await new Promise(r => setTimeout(r, 200 + i * 300));
            }
        }
    }
    throw lastErr || new Error('request failed');
}

// ─── 小工具 ───────────────────────────────────────────────────────────────────
const isObjId = (s) => /^[0-9a-f]{24}$/i.test(String(s || ''));

function pic(u) {
    const s = String(u || '');
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('//')) return 'https:' + s;
    return site() + (s.startsWith('/') ? s : '/' + s);
}

function fmtDur(min) {
    const m = Number(min) || 0;
    if (!m) return '';
    if (m < 60) return `${m}分钟`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h}小时${r}分` : `${h}小时`;
}

// 多语言字段取值：优先 zh → en → 第一个
function pickLang(arr, field) {
    if (!Array.isArray(arr) || !arr.length) return '';
    const order = [String(EXT.lang || 'zh').toLowerCase(), 'zh', 'en', 'ja'];
    for (const want of order) {
        const hit = arr.find(x => x && String(x.language || '').toLowerCase() === want && x[field]);
        if (hit) return String(hit[field]);
    }
    const f = arr.find(x => x && x[field]);
    return f ? String(f[field]) : '';
}

function titleOf(d) {
    const t = pickLang(d.title_display_name, 'title');
    return t || String(d.title || '');
}

// ─── 分类 ─────────────────────────────────────────────────────────────────────
const BASE_CATS = [
    { type_id: 'latest',     type_name: '最新更新' },
    { type_id: 'popular',    type_name: '最热' },
    { type_id: 'toprated',   type_name: '高分' },
    { type_id: 'subtitle',   type_name: '有字幕' },
    { type_id: 'random',     type_name: '随机' },
    { type_id: 'censored',   type_name: '有码' },
    { type_id: 'uncensored', type_name: '无码' },
    { type_id: 'fc2',        type_name: 'FC2' },
    { type_id: 'leaked',     type_name: '泄漏' },
    { type_id: 'nomosaic',   type_name: '无修正' },
];

async function getGenres() {
    const hit = cget('genres');
    if (hit) return hit;
    try {
        const j = await request('common/list-genre');
        const arr = Array.isArray(j && j.data) ? j.data : (Array.isArray(j) ? j : []);
        return cset('genres', arr.map(String).filter(Boolean), 3600);
    } catch (e) { return []; }
}

async function getMakers() {
    const hit = cget('makers');
    if (hit) return hit;
    try {
        const j = await request('common/country-list');
        const arr = Array.isArray(j && j.data) ? j.data : (Array.isArray(j) ? j : []);
        return cset('makers', arr.map(String).filter(Boolean), 3600);
    } catch (e) { return []; }
}

// type_id → 接口查询参数
function catToQuery(typeId) {
    const raw = String(typeId || '').trim();
    if (!raw) return '';
    if (/^(g|m|type|maker):/i.test(raw)) {
        const pre = raw.slice(0, raw.indexOf(':')).toLowerCase();
        const val = raw.slice(raw.indexOf(':') + 1);
        return (pre === 'g' || pre === 'type')
            ? 'genre=' + encodeURIComponent(val)
            : 'country=' + encodeURIComponent(val);
    }
    const id = raw.toLowerCase();
    switch (id) {
        case 'latest':     return '';
        case 'popular':    return 'most_popular=true';
        case 'toprated':   return 'top_rated=true';
        case 'subtitle':   return 'subtitle_link.EN=true';
        case 'censored':   return 'category=' + encodeURIComponent('Censored');
        case 'uncensored': return 'category=' + encodeURIComponent('Uncensored');
        case 'fc2':        return 'category=' + encodeURIComponent('FC2');
        case 'leaked':     return 'category=' + encodeURIComponent('Leaked');
        case 'nomosaic':   return 'category=' + encodeURIComponent('No Mosaic');
        case 'random':     return '__random__';
        default:           return 'category=' + encodeURIComponent(raw);   // 站内分类名原样传
    }
}

// 列表条目 → 壳子 vod
function toVod(x) {
    if (!x || typeof x !== 'object') return null;
    const id = String(x._id || '');
    if (!id) return null;

    const title = titleOf(x);
    const tags  = Array.isArray(x.tags) ? x.tags.map(String) : [];
    const date  = String(x.share_date || '').slice(0, 10);

    const vod = {
        vod_id:       id,
        vod_name:     title,
        vod_pic:      pic(x.wide_thumbnail || x.thumbnail_image || x.cover_image),
        vod_content:  '',
        vod_remarks:  date,
        vod_year:     String(x.startyear || date.slice(0, 4) || ''),
        vod_area:     '日本',
        vod_lang:     '日语',
        vod_actor:    '',
        vod_director: '',
        type_name:    tags.slice(0, 3).join(' / '),
        vod_pubdate:  date,
    };
    if (tags.length) vod.vod_tag = tags.join(',');
    return vod;
}

async function listByQuery(query, page, size) {
    const qs = [`page=${page}`, `size=${size}`, 'can_manko=true'];
    if (query) qs.push(query);
    const j = await request('swx/movie/search?' + qs.join('&'));
    const arr = unpack(j);
    const total = Number(j && j.total) || 0;
    return { arr: Array.isArray(arr) ? arr : [], total };
}

async function randomList(page) {
    const j = await request('swx/movie/random-list?');
    const arr = unpack(j);
    return { arr: Array.isArray(arr) ? arr : [], total: Number(j && j.total) || 0 };
}

// ─── 详情 ─────────────────────────────────────────────────────────────────────
async function getDetail(id) {
    const key = 'd:' + id;
    const hit = cget(key);
    if (hit) return hit;

    if (!isObjId(id)) return null;     // 非 ObjectId 服务端会挂住，直接不打

    const j = await request('swx/movie/detail/' + id);
    const d = unpack(j);
    if (!d || typeof d !== 'object') return null;
    return cset(key, d);
}

// 从详情里抠出所有能直接播的 m3u8
function playUrlsOf(d) {
    const out = [];
    const push = (name, u) => {
        const s = String(u || '').trim();
        if (!s || !/^https?:\/\//i.test(s)) return;
        if (out.some(x => x.url === s)) return;
        out.push({ name, url: s });
    };

    push('主线路', d.wasabi_url_1);
    if (d.missav_video) push('MissAV', d.missav_video);
    push('线路3', d.wasabi_url_2);
    push('线路4', d.wasabi_url_3);
    return out;
}

// ─── 路由 ─────────────────────────────────────────────────────────────────────
async function init(inReq, _outResp) {
    applyExt(inReq);

    const classes = BASE_CATS.slice();
    const max = Math.max(12, Number(EXT.cats) || 60);
    const room = Math.max(0, max - classes.length);

    // 类型 / 厂商按需展开。两边都要留位置：
    // 站内类型几百个、厂商也有上百个，一边倒会把另一边挤没，所以先对半分。
    const genreQuota = Math.ceil(room * 0.6);
    const makerQuota = room - genreQuota;

    if (genreQuota > 0) {
        const genres = await getGenres();
        let n = 0;
        for (const g of genres) {
            if (n >= genreQuota) break;
            if (!g || g.length > 40) continue;
            classes.push({ type_id: 'g:' + g, type_name: '类型·' + g });
            n++;
        }
    }
    if (makerQuota > 0) {
        const makers = await getMakers();
        let n = 0;
        for (const m of makers) {
            if (n >= makerQuota) break;
            if (!m || m.length > 40) continue;
            classes.push({ type_id: 'm:' + m, type_name: '厂商·' + m });
            n++;
        }
    }

    return { class: classes, filters: {} };
}

async function home(inReq, _outResp) {
    applyExt(inReq);
    const size = Math.min(50, Number(EXT.pageSize) || 24);

    const [hot, latest] = await Promise.all([
        listByQuery('most_popular=true', 1, size).catch(() => ({ arr: [] })),
        listByQuery('', 1, size).catch(() => ({ arr: [] })),
    ]);

    const seen = new Set();
    const list = [];
    for (const x of [...hot.arr, ...latest.arr]) {
        const v = toVod(x);
        if (!v || seen.has(v.vod_id)) continue;
        seen.add(v.vod_id);
        list.push(v);
    }
    return { list };
}

async function category(inReq, _outResp) {
    applyExt(inReq);
    const body    = (inReq && inReq.body) || {};
    const typeId  = String(body.id != null ? body.id : (body.type_id != null ? body.type_id : (body.tid != null ? body.tid : 'latest')));
    const page    = Math.max(1, Number(body.page) || 1);
    const size    = Math.min(50, Number(body.limit) || Number(body.size) || Number(EXT.pageSize) || 24);
    const query   = catToQuery(typeId);

    const key = `c:${typeId}:${page}:${size}`;
    const hit = cget(key);
    if (hit) return hit;

    let r;
    if (query === '__random__') {
        r = await randomList(page);
    } else {
        r = await listByQuery(query, page, size);
    }

    const list = r.arr.map(toVod).filter(Boolean);
    const total = Number(r.total) || 0;
    let pagecount;
    if (query === '__random__') {
        // 随机接口不吃 page，每次给的都是新的一批，给几页够翻就行
        pagecount = 10;
    } else {
        pagecount = total > 0 ? Math.min(2000, Math.ceil(total / size)) : (list.length >= size ? page + 1 : page);
    }

    const out = {
        page,
        pagecount,
        limit:  size,
        total:  total || list.length,
        list,
    };
    return cset(key, out);
}

async function detail(inReq, _outResp) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    let id = String(body.id != null ? body.id : (body.ids != null ? body.ids : ''));

    // 入参可能是纯 id / 完整 URL / "线路1$url"
    if (id.includes('$$')) id = id.slice(id.lastIndexOf('$$') + 2);
    else if (!/^https?:\/\//i.test(id) && id.includes('$')) id = id.slice(id.lastIndexOf('$') + 1);
    id = id.trim();

    // 直接给了 m3u8 的情况：没有详情，只回一个可播条目
    if (/^https?:\/\//i.test(id) && /\.m3u8(\?|$)/i.test(id)) {
        return { list: [{ vod_id: id, vod_name: '直链', vod_play_from: '线路1', vod_play_url: '线路1$' + id }] };
    }

    const d = await getDetail(id);
    if (!d) return { list: [] };

    const tags    = Array.isArray(d.tags) ? d.tags.map(String) : [];
    const desc    = pickLang(d.discription, 'overview');
    const links   = playUrlsOf(d);
    const froms   = [];
    const urls    = [];

    links.forEach((l, i) => {
        const name = links.length > 1 ? l.name : '线路1';
        const uniq = froms.includes(name) ? name + (i + 1) : name;
        froms.push(uniq);
        urls.push(`${uniq}$${l.url}`);
    });

    const actresses = Array.isArray(d.actress)
        ? d.actress.map(a => (a && (a.name || a)) || '').filter(Boolean).join(',')
        : '';

    const vod = {
        vod_id:       String(d._id || id),
        vod_name:     titleOf(d),
        vod_pic:      pic(d.cover_image || d.thumbnail_image),
        vod_content:  desc + (d.file_size_2 ? `\n\n片源大小：${d.file_size_2}` : ''),
        vod_remarks:  String(d.share_date || '').slice(0, 10),
        vod_year:     String(d.share_date || '').slice(0, 4),
        vod_area:     '日本',
        vod_lang:     '日语',
        vod_actor:    actresses || tags.slice(0, 6).join(','),
        vod_director: String(d.country || ''),        // 这个字段实际是厂商
        type_name:    tags.slice(0, 4).join(' / '),
        vod_pubdate:  String(d.share_date || '').slice(0, 10),
        vod_play_from: froms.join('$$'),
        vod_play_url:  urls.join('#'),
    };
    if (tags.length) vod.vod_tag = tags.join(',');

    return { list: [vod] };
}

async function play(inReq, _outResp) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    let id = String(body.id != null ? body.id : (body.ids != null ? body.ids : ''));

    const header = { 'User-Agent': UA, 'Referer': site() + '/' };

    // 入参：纯 id / 完整 URL / "线路名$url" / "线路名$$url"
    if (id.includes('$$')) id = id.slice(id.lastIndexOf('$$') + 2);
    else if (!/^https?:\/\//i.test(id) && id.includes('$')) id = id.slice(id.lastIndexOf('$') + 1);
    id = id.trim();

    let m3u8 = '';
    if (/^https?:\/\//i.test(id)) {
        m3u8 = id;                                   // 详情给的就是直链
    } else {
        const d = await getDetail(id);               // 纯 id → 实时取（CDN 域名轮换）
        if (d) {
            const links = playUrlsOf(d);
            m3u8 = links.length ? links[0].url : '';
        }
    }
    if (!m3u8) return { parse: 1, url: '' };

    const reqExt = body.ext || {};
    const mode = String(reqExt.proxy || EXT.proxy || DEFAULTS.proxy || 'direct').toLowerCase();
    const base = proxyBase(inReq);

    // direct：CDN 是公开 m3u8，播放器直连最省
    if (mode === 'direct' || !base) {
        return { parse: 0, url: m3u8, header };
    }
    return {
        parse: 0,
        url: `${base}/proxy/stream?u=${b64e(m3u8)}&m=${encodeURIComponent(mode)}`,
        header,
    };
}

async function search(inReq, _outResp) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    const wd   = String(body.wd != null ? body.wd : (body.keyword != null ? body.keyword : (body.q != null ? body.q : ''))).trim();
    const page = Math.max(1, Number(body.page) || 1);
    const size = Math.min(50, Number(body.limit) || Number(body.size) || Number(EXT.pageSize) || 24);

    if (!wd) return { page: 1, pagecount: 0, list: [] };

    const key = `s:${wd}:${page}:${size}`;
    const hit = cget(key);
    if (hit) return hit;

    let r;
    try {
        r = await listByQuery('keyword=' + encodeURIComponent(wd), page, size);
        // 关键词没结果时，试一下演员名（站点搜索里编号和演员是两条路）
        if (!r.arr.length && page === 1) {
            const r2 = await listByQuery('actor=' + encodeURIComponent(wd), 1, size);
            if (r2.arr.length) r = r2;
        }
    } catch (e) {
        return { page, pagecount: 0, list: [] };
    }

    const list = r.arr.map(toVod).filter(Boolean);
    const total = Number(r.total) || 0;
    const pagecount = total > 0 ? Math.min(2000, Math.ceil(total / size)) : (list.length >= size ? page + 1 : page);

    const out = { page, pagecount, limit: size, total: total || list.length, list };
    return cset(key, out);
}

// ─── 自检 ─────────────────────────────────────────────────────────────────────
async function debug(inReq, _outResp) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    const out = { site: site(), time: new Date().toISOString() };

    // 1) 接口域名
    try {
        const hosts = await discoverHosts();
        out.api_hosts = hosts.join(' , ');
    } catch (e) { out.api_hosts = 'FAIL ' + e.message; }

    // 2) 分类
    try {
        const ini = await init({ body: {} }, null);
        out.cats = ini.class.length;
    } catch (e) { out.cats = 'FAIL ' + e.message; }

    // 3) 列表
    let firstId = body.id || '';
    try {
        const r = await listByQuery('most_popular=true', 1, 5);
        out.list  = `${r.arr.length} 条 / total ${r.total}`;
        out.list_titles = r.arr.slice(0, 3).map(x => x.title).join(' | ');
        if (!firstId && r.arr.length) firstId = r.arr[0]._id;
    } catch (e) { out.list = 'FAIL ' + e.message; }

    // 4) 详情 + 线路
    if (firstId) {
        try {
            const d = await getDetail(firstId);
            if (!d) { out.detail = 'EMPTY'; }
            else {
                const links = playUrlsOf(d);
                out.detail      = `OK ${titleOf(d)}`;
                out.lines       = links.length ? links.map(l => l.name).join(' / ') : 'NONE';
                out.m3u8        = links.length ? links[0].url : '';
                out.m3u8_host   = links.length ? (() => { try { return new URL(links[0].url).host; } catch (e) { return ''; } })() : '';
                out.tags        = (d.tags || []).join(',');
                out.desc_len    = pickLang(d.discription, 'overview').length;
            }
        } catch (e) { out.detail = 'FAIL ' + e.message; }
    }

    // 5) 搜索
    try {
        const s = await search({ body: { wd: body.wd || 'ABF', page: 1 } }, null);
        out.search = s.list.length ? `OK ${s.total} 条 / ${s.pagecount} 页` : 'EMPTY';
    } catch (e) { out.search = 'FAIL ' + e.message; }

    // 6) CDN 可达性（这里不通不代表用户端不通，机房 IP 常被 CF 拦）
    if (out.m3u8) {
        try {
            const r = await axios.get(out.m3u8, {
                headers: { 'User-Agent': UA, 'Referer': site() + '/' },
                timeout: EXT.timeout, responseType: 'text', validateStatus: () => true, maxRedirects: 3,
            });
            const t = String(r.data || '');
            out.cdn_status = r.status;
            out.cdn_is_m3u8 = /^#EXTM3U/.test(t.trim().slice(0, 16)) ? 'YES' : 'NO';
            if (out.cdn_is_m3u8 === 'YES') {
                out.cdn_encrypted = /#EXT-X-KEY/i.test(t) ? ((t.match(/#EXT-X-KEY[^\n]*METHOD=([A-Z0-9\-]+)/i) || [])[1] || 'YES') : 'NO';
                out.cdn_segments = (t.match(/\n(?!\#)[^\n]+/g) || []).length;
            }
        } catch (e) { out.cdn_status = 'FAIL ' + e.message.slice(0, 60); }
    }

    out.proxy_mode = EXT.proxy;
    return out;
}

// ─── 代理转发（m3u8 / all 模式用） ─────────────────────────────────────────────
function b64e(s) { return Buffer.from(String(s), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64d(s) {
    if (!s) return '';
    try { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
    catch (e) { return ''; }
}

function isPrivateHost(host) {
    return /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|::1)/i.test(host)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

function rewriteM3u8(body, baseUrl, proxyBaseUrl, mode) {
    const origin = (() => { try { return new URL(baseUrl).origin; } catch (e) { return ''; } })();
    const wrap = (u) => {
        const abs = /^https?:\/\//i.test(u) ? u : (u.startsWith('/') ? origin + u : new URL(u, baseUrl).toString());
        return `${proxyBaseUrl}/proxy/stream?u=${b64e(abs)}&m=${encodeURIComponent(mode)}`;
    };
    return String(body).split('\n').map(line => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith('#')) {
            return line.replace(/URI="([^"]+)"/gi, (m0, u) => `URI="${wrap(u)}"`);
        }
        if (mode === 'all') return wrap(t);
        return t;
    }).join('\n');
}

async function proxyStream(req, reply) {
    const q = (req && req.query) || {};
    const target = b64d(q.u);
    const mode = String(q.m || 'm3u8').toLowerCase();

    if (!target || !/^https?:\/\//i.test(target)) {
        reply.code(400).send('bad target');
        return;
    }
    let host = '';
    try { host = new URL(target).hostname; } catch (e) { host = ''; }
    if (!host || isPrivateHost(host)) {
        reply.code(403).send('forbidden');
        return;
    }

    let up;
    try {
        up = await axios.get(target, {
            headers: {
                'User-Agent': UA,
                'Referer':    site() + '/',
                ...(req.headers && req.headers.range ? { Range: req.headers.range } : {}),
            },
            timeout:        Math.max(Number(EXT.timeout) || 15000, 25000),
            responseType:   'arraybuffer',
            validateStatus: () => true,
            maxRedirects:   5,
            decompress:     false,
        });
    } catch (e) {
        reply.code(502).send('upstream error');
        return;
    }

    const ct  = String((up.headers && up.headers['content-type']) || '');
    const buf = Buffer.from(up.data);

    if (up.status >= 400) {
        reply.code(up.status);
        reply.header('content-type', ct || 'text/plain');
        reply.send(buf);
        return;
    }

    // 只认真清单才重写；KEY 是 16 字节二进制，当文本处理会弄坏解密
    const isM3u8 = /^#EXTM3U/.test(buf.slice(0, 16).toString('utf8'));

    if (!isM3u8) {
        reply.code(up.status);
        if (up.headers['content-range'])  reply.header('content-range', up.headers['content-range']);
        if (up.headers['accept-ranges'])  reply.header('accept-ranges', up.headers['accept-ranges']);
        if (up.headers['content-length']) reply.header('content-length', up.headers['content-length']);
        reply.header('content-type', ct || 'application/octet-stream');
        reply.header('access-control-allow-origin', '*');
        reply.send(buf);
        return;
    }

    const base = proxyBase(req);
    const text = rewriteM3u8(buf.toString('utf8'), target, base, mode);
    reply.header('content-type', 'application/vnd.apple.mpegurl');
    reply.header('access-control-allow-origin', '*');
    reply.header('cache-control', 'no-cache');
    reply.send(text);
}

// 拼出播放器能访问的插件根地址（带壳子的路由前缀，如 /spider/manko/3）
function proxyBase(inReq) {
    if (EXT.proxyHost) return String(EXT.proxyHost).replace(/\/+$/, '');

    const h = (inReq && inReq.headers) || {};
    let host = h['x-forwarded-host'] || h.host || h[':authority'] || '';
    if (host && host.includes(',')) host = host.split(',')[0].trim();
    if (!host) return '';

    let proto = String(h['x-forwarded-proto'] || '').split(',')[0].trim();
    if (!proto) proto = h['x-forwarded-ssl'] === 'on' ? 'https' : 'http';

    const full = String(h['x-forwarded-prefix'] || h['x-original-uri'] || (inReq && inReq.url) || '');
    let prefix = '';
    const m = full.match(/^(\/spider\/[^/]+\/\d+)/);
    if (m) prefix = m[1];
    else if (inReq && inReq.routerPath && inReq.routerPath.startsWith('/spider/')) {
        const parts = inReq.routerPath.split('/').filter(Boolean);
        prefix = '/' + parts.slice(0, 3).join('/');
    }

    return `${proto}://${host}${prefix}`;
}

// ─── Export ───────────────────────────────────────────────────────────────────
export default {
    meta,
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
        fastify.post('/debug',    debug);
        fastify.get('/proxy/stream', proxyStream);
    },
};
