import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/mitaofc2/3';
const HOST = 'https://b2.bttss.cc';
const UA =
    'Mozilla/5.0 (Linux; Android 13; V2154A Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const PLAYLIST = '%EF%BC%BB%E8%9C%9C%E6%A1%83%EF%BC%BDFC2-PPV.m3u';
const RAW = `https://raw.githubusercontent.com/KAN314go/cc/refs/heads/main/file/${PLAYLIST}`;
const M3U_SOURCES = [
    `https://445569.pages.dev/${RAW}`,
    RAW,
    `https://cdn.jsdelivr.net/gh/KAN314go/cc@main/file/${PLAYLIST}`,
    `https://gcore.jsdelivr.net/gh/KAN314go/cc@main/file/${PLAYLIST}`,
    `https://ghproxy.net/${RAW}`,
];

const PER_PAGE = 60;
const CACHE_TTL = 6 * 3600;
const BATCH = 100;
const SEG_BATCH = 10;

const MEM = {
    ts: 0,
    items: [],
    index: {},
    classes: [],
    filters: {},
    updated: '',
    probe: {},
};

const cfg = {
    perPage: PER_PAGE,
    ttl: CACHE_TTL,
    needProbe: true,
    proxyLine: true,
    picOver: '',
    sources: [...M3U_SOURCES],
};

const http = axios.create({
    timeout: 30000,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    },
});

function headers(referer) {
    const h = {
        'User-Agent': UA,
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    };
    if (referer) h.Referer = referer;
    return h;
}

function cachePath() {
    const tag = crypto.createHash('md5').update(cfg.sources[0] || '').digest('hex').slice(0, 10);
    return path.join(os.tmpdir(), `mitao_fc2_${tag}.m3u`);
}

function fmtLm(lm) {
    if (!lm) return '';
    const d = new Date(lm);
    if (Number.isNaN(d.getTime())) return lm;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function extinfName(line) {
    let tail = '';
    const idx = line.lastIndexOf('"');
    if (idx >= 0) tail = line.slice(idx + 1);
    tail = tail.trim().replace(/^,+/, '').trim();
    if (!tail && line.includes(',')) tail = line.split(',').pop().trim();
    return tail;
}

function fixStream(url) {
    const u = String(url || '').trim();
    if (!/[ "'"]/.test(u)) return u;
    const m = u.match(/^(https?:\/\/[^\s"']+?\/videos\/[0-9a-fA-F]{16,64})/);
    if (m) {
        const h = u.match(/[?&]h=([0-9a-zA-Z]+)/);
        const tail = u.match(/\/([^/"'\s]+\.m3u8)/);
        const fn = tail ? tail[1] : 'g.m3u8';
        return `${m[1]}/${fn}${h ? `?h=${h[1]}` : ''}`;
    }
    return u.split(/["'\s]/)[0];
}

function parseM3u(text) {
    const items = [];
    let pend = null;
    let headLogo = '';
    const logoHits = {};
    for (const raw of String(text).split(/\r?\n/)) {
        const s = raw.trim();
        if (!s) continue;
        if (s.startsWith('#EXTM3U')) {
            headLogo = s.match(/x-tvg-logo="([^"]*)"/)?.[1] || headLogo;
            continue;
        }
        if (s.startsWith('#EXTINF')) {
            pend = [
                extinfName(s),
                s.match(/tvg-logo="([^"]*)"/)?.[1] || '',
                s.match(/group-title="([^"]*)"/)?.[1] || '',
            ];
            continue;
        }
        if (s.startsWith('%%')) {
            pend = [s.replace(/^%+/, '').trim(), '', ''];
            continue;
        }
        if (s.startsWith('#') || !pend) continue;
        const [name, logo, grp] = pend;
        pend = null;
        const url = fixStream(s);
        if (!name || !url.startsWith('http')) continue;
        let num = name.replace(/^[A-Za-z]*[-_]?/, '').replace(/\D/g, '') || name.replace(/\D/g, '');
        let seq = 0;
        let real = true;
        const m = name.match(/^FC2[-_]?(\d{5})$/i);
        if (m) {
            seq = parseInt(m[1], 10);
            real = false;
        }
        const gid = seq ? String(Math.floor((seq + BATCH - 1) / BATCH)).padStart(3, '0') : '000';
        if (logo) logoHits[logo] = (logoHits[logo] || 0) + 1;
        items.push({
            name,
            num,
            seq,
            real,
            gid,
            bk: gid === '000' ? -1 : Math.floor((parseInt(gid, 10) - 1) / SEG_BATCH),
            group: grp || `(${gid}) - FC2-PPV`,
            pic: cfg.picOver || logo || headLogo,
            url,
        });
    }
    if (!cfg.picOver) {
        let fb = headLogo;
        const hits = Object.entries(logoHits);
        if (hits.length) fb = hits.sort((a, b) => b[1] - a[1])[0][0];
        if (fb) {
            for (const it of items) {
                if (!it.pic) it.pic = fb;
            }
        }
    }
    return items;
}

function poolFor(tid) {
    const items = MEM.items;
    tid = String(tid || 'all').trim();
    if (tid === 'all') return items;
    if (tid === 'new') return items.filter((i) => i.real);
    const m = tid.match(/^s(\d+)$/);
    if (m) {
        const k = parseInt(m[1], 10);
        return items.filter((i) => i.bk === k);
    }
    return items;
}

function filtersFor(tid) {
    const pool = poolFor(tid);
    const gids = [...new Set(pool.map((i) => i.gid))].sort();
    const gv = [{ n: '全部', v: '' }, ...gids.map((g) => ({ n: `第${g}批`, v: g }))];
    const flt = [];
    if (gids.length > 1) flt.push({ key: 'group', name: '分组', value: gv });
    flt.push({
        key: 'sort',
        name: '排序',
        value: [
            { n: '番号升序', v: 'asc' },
            { n: '番号降序', v: 'desc' },
            { n: '随机', v: 'rand' },
        ],
    });
    flt.push({
        key: 'tail',
        name: '尾号',
        value: [{ n: '全部', v: '' }, ...Array.from({ length: 10 }, (_, d) => ({ n: String(d), v: String(d) }))],
    });
    return flt;
}

function buildClasses(items) {
    const classes = [{ type_id: 'all', type_name: '全部' }];
    if (items.some((i) => i.real)) classes.push({ type_id: 'new', type_name: '独家番号' });
    const buckets = {};
    for (const it of items) {
        if (it.bk >= 0) (buckets[it.bk] ||= []).push(it.seq);
    }
    for (const k of Object.keys(buckets).map(Number).sort((a, b) => a - b)) {
        const seqs = buckets[k];
        classes.push({
            type_id: `s${String(k).padStart(2, '0')}`,
            type_name: `FC2 ${String(Math.min(...seqs)).padStart(5, '0')}-${String(Math.max(...seqs)).padStart(5, '0')}`,
        });
    }
    MEM.classes = classes;
    MEM.filters = Object.fromEntries(classes.map((c) => [c.type_id, filtersFor(c.type_id)]));
}

function readDisk() {
    try {
        const p = cachePath();
        if (!fs.existsSync(p)) return ['', ''];
        const st = fs.statSync(p);
        if (Date.now() / 1000 - st.mtimeMs / 1000 >= cfg.ttl) return ['', ''];
        const raw = fs.readFileSync(p);
        if (raw.length <= 4096) return ['', ''];
        const ts = st.mtime;
        const pad = (n) => String(n).padStart(2, '0');
        const upd = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}`;
        return [raw.toString('utf8'), upd];
    } catch {
        return ['', ''];
    }
}

function writeDisk(text) {
    try {
        fs.writeFileSync(cachePath(), text, 'utf8');
    } catch {
        /* ignore */
    }
}

async function download() {
    for (const u of cfg.sources) {
        try {
            const r = await http.get(u, { headers: headers(), timeout: 30000, responseType: 'text' });
            if (r.status !== 200) continue;
            const text = typeof r.data === 'string' ? r.data : String(r.data || '');
            if (text.length < 4096 || !text.slice(0, 512).includes('#EXTM3U')) continue;
            const lm = r.headers['last-modified'] || '';
            return [text, fmtLm(lm)];
        } catch {
            continue;
        }
    }
    return ['', ''];
}

async function loadPlaylist(force = false) {
    if (!force && MEM.items.length && Date.now() / 1000 - MEM.ts < cfg.ttl) return;
    let [text, upd] = force ? ['', ''] : readDisk();
    if (!text) {
        [text, upd] = await download();
        if (text) writeDisk(text);
    }
    if (!text) return;
    const items = parseM3u(text);
    if (!items.length) return;
    MEM.items = items;
    MEM.index = Object.fromEntries(items.map((it) => [it.name, it]));
    MEM.updated = upd || new Date().toISOString().slice(0, 16).replace('T', ' ');
    MEM.ts = Date.now() / 1000;
    buildClasses(items);
}

async function ready() {
    if (!MEM.items.length) await loadPlaylist();
    return MEM.items.length > 0;
}

function card(it) {
    return {
        vod_id: it.name,
        vod_name: it.name,
        vod_pic: it.pic,
        vod_year: String(MEM.updated).slice(0, 4),
        vod_remarks: it.real ? '独家' : `第${it.gid}批`,
    };
}

function sortPool(pool, mode) {
    if (mode === 'desc') return [...pool].sort((a, b) => b.seq - a.seq || a.name.localeCompare(b.name));
    if (mode === 'rand') {
        const out = [...pool];
        let seed = Math.floor(Date.now() / 3600000);
        const rnd = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }
    return [...pool].sort((a, b) => (a.seq || -1) - (b.seq || -1) || a.name.localeCompare(b.name));
}

function pageOf(pool, pg) {
    pg = Math.max(1, parseInt(pg, 10) || 1);
    const total = pool.length;
    const size = cfg.perPage;
    const count = total ? Math.ceil(total / size) : 1;
    pg = Math.min(pg, Math.max(1, count));
    return {
        list: pool.slice((pg - 1) * size, pg * size).map(card),
        page: pg,
        pagecount: Math.max(1, count),
        limit: size,
        total,
    };
}

function findItem(vid) {
    const it = MEM.index[vid];
    if (it) return it;
    const q = String(vid || '').replace(/\D/g, '');
    if (!q) return null;
    return MEM.items.find((i) => i.num === q || i.num.replace(/^0+/, '') === q.replace(/^0+/, '')) || null;
}

function parseFilters(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function proxyBase(inReq) {
    const prefix = inReq?.server?.prefix || PREFIX;
    return `http://127.0.0.1:${PORT}${prefix}/m3u8`;
}

function proxyUrl(url, inReq) {
    if (!cfg.proxyLine || !url) return '';
    const tag = Buffer.from(url, 'utf8').toString('base64').replace(/=+$/, '');
    return `${proxyBase(inReq)}?id=${encodeURIComponent(tag)}`;
}

function fmtDur(sec) {
    sec = parseInt(sec, 10) || 0;
    if (sec <= 0) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

async function probeM3u8(url) {
    if (MEM.probe[url]) return MEM.probe[url];
    let info = { dur: 0, seg: 0 };
    try {
        const r = await http.get(url, { headers: headers(`${HOST}/`), timeout: 20000, responseType: 'text' });
        if (r.status === 200) {
            const text = typeof r.data === 'string' ? r.data : String(r.data || '');
            const ds = [...text.matchAll(/#EXTINF:\s*([\d.]+)/g)].map((m) => parseFloat(m[1]));
            info = { dur: ds.reduce((a, b) => a + b, 0), seg: ds.length };
        }
    } catch {
        /* ignore */
    }
    MEM.probe[url] = info;
    return info;
}

async function init(inReq) {
    let extend = inReq?.body?.extend || {};
    if (typeof extend === 'string' && extend.trim()) {
        try {
            extend = JSON.parse(extend);
        } catch {
            extend = {};
        }
    }
    const c = extend && typeof extend === 'object' ? extend : {};
    cfg.perPage = Math.max(1, parseInt(c.page_size, 10) || PER_PAGE);
    cfg.ttl = Math.max(60, parseInt(c.cache_ttl, 10) || CACHE_TTL);
    cfg.needProbe = c.probe !== false;
    cfg.proxyLine = c.proxy_line !== false;
    cfg.picOver = String(c.pic || '').trim();
    const my = String(c.m3u || '').trim();
    cfg.sources = (my ? [my] : []).concat(M3U_SOURCES);
    try {
        await loadPlaylist(true);
    } catch {
        /* ignore */
    }
    return {};
}

async function home() {
    await ready();
    const items = MEM.items;
    const reals = items.filter((i) => i.real);
    const rest = items.filter((i) => !i.real).sort((a, b) => b.seq - a.seq);
    return {
        class: MEM.classes,
        filters: MEM.filters,
        list: [...reals, ...rest].slice(0, cfg.perPage).map(card),
        parse: 0,
        jx: 0,
    };
}

async function category(inReq) {
    if (!(await ready())) return { list: [], page: 1, pagecount: 1, limit: PER_PAGE, total: 0 };
    const tid = String(inReq.body.id || 'all');
    const pg = inReq.body.page || 1;
    const ex = parseFilters(inReq.body.filters);
    let pool = poolFor(tid);
    const gid = String(ex.group || '').trim();
    if (gid) pool = pool.filter((i) => i.gid === gid);
    const tail = String(ex.tail || '').trim();
    if (/^\d$/.test(tail)) pool = pool.filter((i) => i.num.slice(-1) === tail);
    pool = sortPool(pool, String(ex.sort || 'asc'));
    return pageOf(pool, pg);
}

async function detail(inReq) {
    if (!(await ready())) return { list: [] };
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    const it = findItem(String(vid || ''));
    if (!it) return { list: [] };
    const host = it.url.replace(/^https?:\/\//, '').split('/')[0];
    const info = cfg.needProbe ? await probeM3u8(it.url) : { dur: 0, seg: 0 };
    const dur = fmtDur(info.dur);
    const froms = ['酷鱼专线'];
    const urls = [`正片$${it.url}`];
    const purl = proxyUrl(it.url, inReq);
    if (purl) {
        froms.push('酷鱼备用线');
        urls.push(`正片$${purl}`);
    }
    const desc = [`番号: ${it.name}`, `分组: 第${it.gid}批`];
    if (!it.real) desc.push(`片单序号: ${it.seq}`);
    if (dur) desc.push(`时长: ${dur} (${info.seg || 0} 个分片)`);
    desc.push(`来源: ${host} 直链 m3u8(未加密)`);
    desc.push(`片单更新: ${MEM.updated || '未知'}`);
    desc.push('说明: 本源取自 M3U 片单，仅含番号/封面/直链，站点侧无演职员等元数据。');
    return {
        list: [
            {
                vod_id: it.name,
                vod_name: it.name,
                vod_pic: it.pic,
                type_name: `FC2-PPV 第${it.gid}批`,
                vod_year: String(MEM.updated).slice(0, 4),
                vod_area: '日本',
                vod_lang: '日语',
                vod_remarks: dur || (it.real ? '独家番号' : `第${it.gid}批`),
                vod_actor: 'FC2-PPV 投稿者',
                vod_director: '小撸怡情 大撸伤身 哥保重身体呀 悠着点',
                vod_content: `${desc.slice(0, 2).join(' / ')}\n${desc.slice(2).join('\n')}`,
                vod_play_from: froms.join('$$$'),
                vod_play_url: urls.join('$$$'),
            },
        ],
    };
}

async function play(inReq) {
    let url = String(inReq.body.id || '').trim();
    if (!url.startsWith('http')) {
        await ready();
        const it = findItem(url);
        url = it ? it.url : '';
    }
    return {
        parse: 0,
        playUrl: '',
        url,
        header: { 'User-Agent': UA },
        jx: 0,
    };
}

async function search(inReq) {
    if (!(await ready())) return { list: [], page: 1, pagecount: 1, limit: PER_PAGE, total: 0 };
    const key = String(inReq.body.wd || '');
    const pg = inReq.body.page || 1;
    const k = key.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
    const q = k.replace(/^(fc2ppv|ppvfc2|fc2|ppv)+/g, '');
    let pool = [];
    if (q && /^\d+$/.test(q)) {
        const qs = q.replace(/^0+/, '') || '0';
        const exact = MEM.items.filter((i) => (i.num.replace(/^0+/, '') || '0') === qs);
        const fuzzy = MEM.items.filter((i) => i.num.includes(q) && !exact.includes(i));
        pool = exact.concat(fuzzy.sort((a, b) => (a.seq || -1) - (b.seq || -1)));
    } else if (q) {
        pool = MEM.items.filter((i) => i.name.toLowerCase().replace(/-/g, '').includes(q));
    } else if (k) {
        pool = MEM.items.filter((i) => i.name.toLowerCase().replace(/-/g, '').includes(k));
    }
    return pageOf(pool, pg);
}

async function m3u8Proxy(inReq, reply) {
    try {
        let tag = String(inReq.query.id || '');
        tag += '='.repeat((4 - (tag.length % 4)) % 4);
        const url = Buffer.from(tag, 'base64').toString('utf8');
        if (!/^https?:\/\//i.test(url)) return reply.code(404).send('');
        const r = await http.get(url, { headers: headers(`${HOST}/`), timeout: 15000, responseType: 'text' });
        const text = typeof r.data === 'string' ? r.data : String(r.data || '');
        const root = `${url.split('?')[0].replace(/\/[^/]*$/, '')}/`;
        const qs = url.includes('?') ? `?${url.split('?')[1]}` : '';
        const out = text.split(/\r?\n/).map((line) => {
            const s = line.trim();
            if (s && !s.startsWith('#') && !s.startsWith('http')) return root + s.replace(/^\/+/, '') + qs;
            return s;
        });
        reply.header('Content-Type', 'application/vnd.apple.mpegurl').send(out.join('\n'));
    } catch {
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'mitaofc2',
        name: '🍑蜜桃FC2',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/m3u8', m3u8Proxy);
    },
};
