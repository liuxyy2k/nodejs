import axios from 'axios';
import https from 'https';

const hosts = ['https://www.lubosp.com', 'https://www.lookluping.xyz'];
let host = hosts[0];

const UA =
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const baseHeaders = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
};

const CLASSES = [
    { type_name: '最新视频', type_id: 'new' },
    { type_name: '热门精选', type_id: 'hot' },
    { type_name: '走光合集', type_id: 'zouguang' },
    { type_name: '免费视频', type_id: 'free' },
    { type_name: '抖音快手', type_id: 'type01' },
    { type_name: '百万粉丝博主', type_id: 'type01c02' },
    { type_name: '十万粉丝博主', type_id: 'type01c11' },
    { type_name: '高颜值女博主', type_id: 'type01c12' },
    { type_name: '会议私播', type_id: 'type27' },
    { type_name: '偷拍系列', type_id: 'type28' },
];

const VIP_CATS = {
    type01: 'type01',
    type01c02: 'type01/column02',
    type01c11: 'type01/column11',
    type01c12: 'type01/column12',
    type27: 'type27',
    type28: 'toupai/type28',
};

const NOPG = new Set(['type01']);

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const http = axios.create({
    timeout: 15000,
    httpsAgent,
    validateStatus: () => true,
});

let poolCache = null;
let poolTime = 0;

function fixEncoding(text) {
    if (!text) return '';
    try {
        return Buffer.from(text, 'latin1').toString('utf8');
    } catch {
        return text;
    }
}

function normalizeHtml(data) {
    if (typeof data === 'string') return fixEncoding(data);
    if (Buffer.isBuffer(data)) return fixEncoding(data.toString('utf8'));
    return fixEncoding(String(data || ''));
}

async function fetchHtml(path, data = null) {
    let last = '';
    for (const h of hosts) {
        const url = path.startsWith('http') ? path : h + path;
        try {
            let r;
            if (data !== null) {
                const body = new URLSearchParams(data).toString();
                r = await http.post(url, body, {
                    headers: {
                        ...baseHeaders,
                        Referer: `${h}/`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                });
            } else {
                r = await http.get(url, {
                    headers: { ...baseHeaders, Referer: `${h}/` },
                });
            }
            if (r.status < 200 || r.status >= 400) continue;
            const t = normalizeHtml(r.data);
            if (t && t.length > 500) {
                host = h;
                return t;
            }
            last = last || t;
        } catch {
            /* try next host */
        }
    }
    return last;
}

function wrapPic(pic) {
    if (!pic) return '';
    let p = pic.trim();
    if ((p.startsWith('"') || p.startsWith("'")) && (p.endsWith('"') || p.endsWith("'"))) {
        p = p.slice(1, -1);
    }
    p = p.replace(/&amp;/g, '&');
    if (p.includes('127.0.0.1') || p.includes('proxy')) return p;
    if (p.startsWith('//')) return `https:${p}`;
    if (!p.startsWith('http://') && !p.startsWith('https://')) {
        return p.startsWith('/') ? host + p : `${host}/${p}`;
    }
    return p;
}

function pagecount(html, pn = 1) {
    const pages = [...html.matchAll(/index_(\d+)\.html/g)].map((m) => parseInt(m[1], 10));
    if (pages.length) return Math.max(...pages);
    return html.includes('下一页') || html.includes(`index_${pn + 1}.html`) ? pn + 5 : pn;
}

function items(html) {
    const result = [];
    const seen = new Set();
    const re = /<a href="([^"]*?\/(\d+)\.html)"([^>]*)>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const vid = m[2];
        let path = m[1].replace(/^\/+/, '');
        if (!path.startsWith('free/')) continue;
        if (seen.has(vid)) continue;
        const titleM = /title="([^"]*)"/.exec(m[3]);
        let name = titleM ? titleM[1].trim() : m[4].replace(/<[^>]+>/g, '').trim();
        if (!name || name.length > 100) continue;
        seen.add(vid);
        const after = html.slice(m.index + m[0].length, m.index + m[0].length + 800);
        const imgM = after.match(/<img[^>]+(?:data-original|original|src)="([^"]+)"/);
        const pic = wrapPic(imgM ? imgM[1] : '');
        result.push({
            vod_id: path,
            vod_name: name.slice(0, 50),
            vod_pic: pic,
            vod_remarks: '',
        });
    }
    return result;
}

function encodeVip(m3u8, path, name) {
    const raw = `${m3u8}|${path}|${name || ''}`;
    return `vip@${Buffer.from(raw, 'utf8').toString('base64url')}`;
}

function decodeVip(vid) {
    const raw = Buffer.from(vid.slice(4), 'base64url').toString('utf8');
    const parts = raw.split('|');
    return {
        m3u8: parts[0] || '',
        path: parts[1] || '',
        name: parts[2] || '',
    };
}

function vipItems(html) {
    const result = [];
    const seen = new Set();
    if (!html) return result;
    const re = /<li[^>]*>[\s\S]*?<\/li>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const li = m[0];
        const im = li.match(/<img[^>]+(?:data-original|src)="([^"]+)"/);
        if (!im || !im[1].includes('vod.jpg')) continue;
        const pic = im[1].replace(/&amp;/g, '&').trim();
        if (seen.has(pic)) continue;
        const hm = li.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
        let name;
        if (hm) {
            name = hm[1].replace(/<[^>]+>/g, '').trim();
        } else {
            const tm = li.match(/<a[^>]+title="([^"]*)"/) || li.match(/<img[^>]+alt="([^"]*)"/);
            name = tm ? tm[1].trim() : '';
        }
        if (!name || name.length > 100) continue;
        const am = li.match(/<a[^>]+href="([^"]+\.html)"/);
        let path = am ? am[1].replace(/^\/+/, '').split('?')[0] : '';
        if (path.endsWith('.html')) path = path.slice(0, -5);
        if (path && !path.startsWith('free/') && !path.startsWith('type') && !path.startsWith('toupai/')) {
            path = '';
        }
        const m3u8 = pic.replace('vod.jpg', 'index.m3u8');
        const rm = li.match(/ico-left[^>]*>([^<]+)</);
        const remarks = rm ? rm[1].trim() : '';
        seen.add(pic);
        result.push({
            vod_id: encodeVip(m3u8, path, name),
            vod_name: name.slice(0, 50),
            vod_pic: pic,
            vod_remarks: remarks,
        });
    }
    return result;
}

async function hotItems() {
    const h = await fetchHtml('/');
    if (!h) return [];
    let m = h.match(/<div class="hide">\s*<ul[^>]*>([\s\S]*?)<\/ul>/);
    if (!m) m = h.match(/class="hide"[^>]*>\s*<ul[^>]*>([\s\S]*?)<\/ul>/);
    if (!m) return [];
    return vipItems(m[1]);
}

async function pool(pages = 3) {
    const now = Date.now();
    if (poolCache && now - poolTime < 1800000) return poolCache;
    const result = [];
    const seen = new Set();
    const bases = [
        'type01',
        'type01/column02',
        'type01/column11',
        'type01/column12',
        'type27',
        'toupai/type28',
        'free',
    ];
    for (const base of bases) {
        for (let pg = 1; pg <= pages; pg++) {
            const url = pg === 1 ? `/${base}/` : `/${base}/index_${pg}.html`;
            const html = await fetchHtml(url);
            if (!html || html.slice(0, 2000).includes('信息提示')) break;
            const list = vipItems(html);
            if (!list.length) break;
            for (const it of list) {
                if (!seen.has(it.vod_id)) {
                    seen.add(it.vod_id);
                    result.push(it);
                }
            }
        }
    }
    if (result.length) {
        poolCache = result;
        poolTime = now;
    }
    return result;
}

async function seriesUrl(name, vid, path, cid, xid) {
    const mm = name.trim().match(/^(.*?)\s*\((\d+)\)\s*\.\w+$/);
    if (!mm) return `正片$${path}`;
    const sn = mm[1];
    const cur = parseInt(mm[2], 10);
    const series = { [cur]: path };
    for (let p = 1; p <= 5; p++) {
        const url = p === 1 ? '/free/' : `/free/index_${p}.html`;
        const h = await fetchHtml(url);
        if (!h || h.slice(0, 2000).includes('信息提示')) break;
        for (const it of items(h)) {
            const im = it.vod_name.trim().match(/^(.*?)\s*\((\d+)\)\s*\.\w+$/);
            if (im && im[1] === sn) {
                const n = parseInt(im[2], 10);
                if (!(n in series)) series[n] = it.vod_id;
            }
        }
        if (Object.keys(series).length >= 60) break;
    }
    const eps = Object.entries(series)
        .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
        .map(([n, p]) => `第${n}段$${p}`);
    return eps.length ? eps.join('#') : `正片$${path}`;
}

async function vipDetail(vid) {
    try {
        const { m3u8, path, name } = decodeVip(vid);
        const vod = {
            vod_id: vid,
            vod_name: name || '会员视频',
            vod_pic: '',
            vod_remarks: '',
            vod_actor: '',
            vod_director: '',
            type_name: '会员视频',
            vod_year: '',
            vod_area: '',
            vod_content: name,
            vod_play_from: '直播录屏',
            vod_play_url: `正片$${vid}`,
        };
        if (path) {
            const html = await fetchHtml(`/${path}.html`);
            if (html) {
                const hm = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
                if (hm && hm[1].trim()) vod.vod_name = hm[1].trim();
                const pm =
                    html.match(/<img[^>]+src="([^"]*?\/video\/[^"]+)"/) ||
                    html.match(/<img[^>]+src="([^"]+)"/);
                if (pm) vod.vod_pic = wrapPic(pm[1]);
            }
        }
        if (!vod.vod_pic && m3u8) vod.vod_pic = m3u8.replace('index.m3u8', 'vod.jpg');
        return { list: [vod] };
    } catch {
        return { list: [] };
    }
}

function playHeader() {
    return { Referer: `${host}/`, 'User-Agent': UA };
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const filters = {};
    for (const c of CLASSES) filters[c.type_id] = [];
    const html = await fetchHtml('/');
    let list = vipItems(html);
    if (!list.length) list = items(html);
    return { class: CLASSES, filters, list: list.slice(0, 48) };
}

async function category(inReq, _outResp) {
    let pg = parseInt(inReq.body.page, 10) || 1;
    const tid = inReq.body.id || 'free';
    if (pg < 1) pg = 1;
    try {
        if (tid === 'new') {
            const html = await fetchHtml('/');
            const vodList = pg === 1 ? vipItems(html).slice(0, 48) : [];
            return { page: pg, pagecount: 1, limit: vodList.length, total: vodList.length, list: vodList };
        }
        if (tid === 'hot') {
            const vodList = pg === 1 ? await hotItems() : [];
            return { page: pg, pagecount: 1, limit: vodList.length, total: vodList.length, list: vodList };
        }
        if (tid === 'zouguang') {
            const hits = (await pool()).filter((it) => it.vod_name.includes('走光'));
            const pagecount = Math.max(1, Math.ceil(hits.length / 24));
            if (pg > pagecount) {
                return { page: pg, pagecount, limit: 24, total: hits.length, list: [] };
            }
            const start = (pg - 1) * 24;
            return {
                page: pg,
                pagecount,
                limit: 24,
                total: hits.length,
                list: hits.slice(start, start + 24),
            };
        }
        const base = VIP_CATS[tid];
        if (base) {
            const url = pg === 1 ? `/${base}/` : `/${base}/index_${pg}.html`;
            const html = await fetchHtml(url);
            if (!html || html.slice(0, 2000).includes('信息提示')) {
                return { page: pg, pagecount: 1, limit: 24, total: 0, list: [] };
            }
            const vodList = vipItems(html);
            if (!vodList.length) {
                return {
                    page: pg,
                    pagecount: pg === 1 ? 1 : Math.max(1, pg - 1),
                    limit: 24,
                    total: 0,
                    list: [],
                };
            }
            const pc = NOPG.has(tid) ? 1 : pagecount(html, pg);
            return {
                page: pg,
                pagecount: pc,
                limit: vodList.length,
                total: 24 * pc,
                list: vodList,
            };
        }
        const url = pg === 1 ? '/free/' : `/free/index_${pg}.html`;
        const html = await fetchHtml(url);
        if (!html || html.slice(0, 2000).includes('信息提示')) {
            return { page: pg, pagecount: 1, limit: 24, total: 0, list: [] };
        }
        const vodList = items(html);
        const pc = pagecount(html, pg);
        return {
            page: pg,
            pagecount: pc,
            limit: vodList.length,
            total: 48 * pc,
            list: vodList,
        };
    } catch {
        return { page: pg, pagecount: 1, limit: 24, total: 0, list: [] };
    }
}

async function detail(inReq, _outResp) {
    try {
        const vid = String(inReq.body.id || '');
        if (vid.startsWith('vip@')) return vipDetail(vid);

        let path;
        let aid;
        if (/^\d+$/.test(vid)) {
            aid = vid;
            path = `free/${aid}`;
        } else {
            const idM = vid.match(/(\d+)/);
            aid = idM ? idM[1] : vid;
            path = vid.replace(/^\/+/, '').replace(/\.html$/, '');
        }
        const html = await fetchHtml(`/${path}.html`);
        if (!html || !html.includes('buyvideo')) return { list: [] };

        const hm = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const tm = html.match(/<title>([^<]*)<\/title>/);
        const name = hm ? hm[1].trim() : tm ? tm[1].trim() : vid;

        let pm = html.match(/<img[^>]+src="([^"]*?\/video\/[^"]+)"/);
        if (!pm) pm = html.match(/<img[^>]+src="([^"]+)"/);

        const b =
            html.match(/buyvideo" classid="(\d+)" xxid="(\d+)"/) ||
            html.match(/classid="(\d+)"[^>]*xxid="(\d+)"/);
        const cid = b ? b[1] : '26';
        const xid = b ? b[2] : aid;

        return {
            list: [
                {
                    vod_id: vid,
                    vod_name: name,
                    vod_pic: wrapPic(pm ? pm[1] : ''),
                    vod_remarks: '',
                    vod_actor: '',
                    vod_director: '',
                    type_name: '免费视频',
                    vod_year: '',
                    vod_area: '',
                    vod_content: name,
                    vod_play_from: '直播录屏',
                    vod_play_url: await seriesUrl(name, vid, path, cid, xid),
                },
            ],
        };
    } catch {
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    try {
        let vid = String(inReq.body.id || '');
        if (vid.startsWith('vip@')) {
            let decoded;
            try {
                decoded = decodeVip(vid);
            } catch {
                return {};
            }
            const { m3u8, path } = decoded;
            if (m3u8 && m3u8.includes('.m3u8')) {
                return { parse: 0, url: m3u8, header: playHeader() };
            }
            if (path) vid = path;
            else return {};
        }

        let path;
        let aid;
        if (/^\d+$/.test(vid)) {
            aid = vid;
            path = `free/${aid}`;
        } else {
            const idM = vid.match(/(\d+)/);
            aid = idM ? idM[1] : vid;
            path = vid.replace(/^\/+/, '').replace(/\.html$/, '');
        }
        if (!aid) return {};

        const html = await fetchHtml(`/${path}.html`);
        if (!html || !html.includes('buyvideo')) return {};

        const b =
            html.match(/buyvideo" classid="(\d+)" xxid="(\d+)"/) ||
            html.match(/classid="(\d+)"[^>]*xxid="(\d+)"/);
        const cid = b ? b[1] : '26';
        const xid = b ? b[2] : aid;

        const r = await fetchHtml('/e/moyublog/bofang/', { id: xid, classid: cid });
        if (!r) return {};

        let nr = '';
        try {
            nr = JSON.parse(r).nr || '';
        } catch {
            nr = r;
        }

        let m = nr.match(/url:\s*["']([^"']+)["']/);
        if (m) {
            return { parse: 0, url: m[1].replace(/\\\//g, '/'), header: playHeader() };
        }

        m = nr.match(/src\s*=\s*["']?\s*\\?(\/e\/DownSys\/play\/[^"']+)/);
        let u = m ? m[1].replace(/\\\//g, '/').replace(/\s/g, '') : '';
        if (u.startsWith('/')) u = host + u;
        if (!u) return {};

        const fr = await fetchHtml(u);
        if (!fr) return {};
        m = fr.match(/url:\s*["']([^"']+)["']/);
        if (!m) return {};
        return { parse: 0, url: m[1].replace(/\\\//g, '/'), header: playHeader() };
    } catch {
        return {};
    }
}

async function search(inReq, _outResp) {
    const raw = String(inReq.body.wd || '');
    const key = raw.toLowerCase();
    try {
        const result = [];
        const seen = new Set();
        for (let p = 1; p <= 5; p++) {
            const url = p === 1 ? '/free/' : `/free/index_${p}.html`;
            const html = await fetchHtml(url);
            if (!html) continue;
            if (html.slice(0, 2000).includes('信息提示')) break;
            for (const it of items(html)) {
                if (!it.vod_name.toLowerCase().includes(key)) continue;
                if (seen.has(it.vod_id)) continue;
                seen.add(it.vod_id);
                result.push(it);
            }
            if (result.length >= 80) break;
        }
        if (result.length < 80) {
            const bases = [
                'type01',
                'type01/column02',
                'type01/column11',
                'type01/column12',
                'type27',
                'toupai/type28',
            ];
            for (const base of bases) {
                const h = await fetchHtml(`/${base}/`);
                if (!h || h.slice(0, 2000).includes('信息提示')) continue;
                for (const it of vipItems(h)) {
                    if (!it.vod_name.toLowerCase().includes(key)) continue;
                    if (seen.has(it.vod_id)) continue;
                    seen.add(it.vod_id);
                    result.push(it);
                }
                if (result.length >= 80) break;
            }
        }
        return { list: result.slice(0, 80), page: 1 };
    } catch {
        return { list: [], page: 1 };
    }
}

export default {
    meta: {
        key: 'lubosp',
        name: '💋直播录屏',
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
