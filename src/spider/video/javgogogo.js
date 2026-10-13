import req from '../../util/req.js';

const DEFAULT_HOST = 'https://javgogogo.com';
const SOURCE = '99072762';
const UA =
    'Mozilla/5.0 (Linux; Android 14; 22127RK46C/Pixel5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const CLASS_DEFS = [
    ['素人自拍', '素人自拍', 'category'],
    ['無碼', '無碼', 'category'],
    ['有碼', '有碼', 'category'],
    ['中文字幕', '中文字幕', 'tag'],
    ['人妻熟女', '人妻熟女', 'category'],
    ['少女美女', '少女美女', 'category'],
    ['女同性戀', '女同性戀', 'category'],
    ['捆綁調教', '捆綁調教', 'category'],
    ['uncategorized', '其他', 'category'],
];

const CYR = 'АВЕКМНОРСТХавекмнорстх';
const LAT = 'ABEKMHOPCTXabekmhopctx';
const HOMO = Object.fromEntries([...CYR].map((c, i) => [c, LAT[i]]));

let host = DEFAULT_HOST;

function hdr(referer) {
    return {
        'User-Agent': UA,
        Referer: referer || `${host}/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9',
    };
}

function unescape(s) {
    if (!s) return '';
    return String(s)
        .replace(/&#8230;/g, '…')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

function kindOf(tid) {
    for (const [t, , k] of CLASS_DEFS) {
        if (t === tid) return k;
    }
    return 'category';
}

async function fetchText(url, referer) {
    try {
        const resp = await req.get(url, {
            headers: hdr(referer),
            timeout: 25000,
            responseType: 'text',
            validateStatus: (s) => s === 200,
        });
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

async function get(path) {
    const url = path.startsWith('http') ? path : `${host.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
    return fetchText(url);
}

function isSiteLink(href) {
    try {
        const u = new URL(href, host);
        const base = new URL(host);
        if (u.origin === base.origin) return true;
        return u.hostname.includes('javgogogo');
    } catch {
        return false;
    }
}

function parseList(html, exclude) {
    const out = [];
    if (!html) return out;
    for (const seg of html.split('<a class="thumb"').slice(1)) {
        const mh = seg.match(/href="([^"]+)"/);
        if (!mh) continue;
        if (!isSiteLink(mh[1])) continue;
        let slug;
        try {
            slug = new URL(mh[1], host).pathname.replace(/^\/+|\/+$/g, '');
        } catch {
            continue;
        }
        const low = slug.toLowerCase();
        if (!slug || slug.includes('/') || ['category', 'tag', 'author', 'page'].includes(low)) continue;
        if (exclude && slug === exclude) continue;
        const mi = seg.match(/data-src="([^"]+)"/);
        const pic = mi ? mi[1] : '';
        const md = seg.match(/<span class="duration">([^<]+)<\/span>/);
        const remark = md ? md[1].trim() : '';
        const mt = seg.match(/<a class="infos"[^>]*title="([^"]+)"/) || seg.match(/<span class="title">([^<]+)<\/span>/);
        const name = mt ? unescape(mt[1]) : slug;
        out.push({
            vod_id: slug,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remark,
            style: { type: 'rect', ratio: 1.33 },
        });
    }
    return out;
}

function pagecount(html, pg, cnt) {
    const nums = [...String(html || '').matchAll(/\/page\/(\d+)\//g)].map((m) => parseInt(m[1], 10));
    if (nums.length) return Math.max(Math.max(...nums), pg);
    return cnt >= 20 ? pg + 1 : pg;
}

function isoDur(s) {
    const m = String(s || '').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!m) return '';
    let h = (parseInt(m[2], 10) || 0) + (parseInt(m[1], 10) || 0) * 24;
    const mi = parseInt(m[3], 10) || 0;
    const se = parseInt(m[4], 10) || 0;
    if (h) return `${h}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}`;
    return `${mi}:${String(se).padStart(2, '0')}`;
}

function normId(ids) {
    let id = ids;
    if (Array.isArray(id)) id = id[0];
    return String(id || '').trim().replace(/^\/+|\/+$/g, '');
}

function embedOf(html) {
    const m =
        html.match(/itemprop="embedURL"\s+content="([^"]+)"/)
        || html.match(/<iframe[^>]*width="640"[^>]*src="([^"]+)"/)
        || html.match(/src="(https?:\/\/[^"]+\/embed\/\d+[^"]*)"/);
    if (!m) return ['', ''];
    const url = m[1];
    const mv = url.match(/\/embed\/(\d+)/);
    try {
        return [new URL(url).hostname, mv ? mv[1] : ''];
    } catch {
        return ['', mv ? mv[1] : ''];
    }
}

function kvsDecode(enc, base) {
    let s = [...String(enc || '')].map((c) => HOMO[c] || c).join('');
    s = s.replace(/,/g, '/');
    const pad = s.length % 4;
    if (pad) s += '='.repeat(4 - pad);
    let rel = Buffer.from(s, 'base64').toString('utf8');
    if (!rel.startsWith('/')) rel = `/${rel}`;
    return base.replace(/\/+$/, '') + rel;
}

async function resolvePlay(vid, ehost) {
    const embed = `https://${ehost}/embed/${vid}/?source=${SOURCE}`;
    let real = embed;
    try {
        const r0 = await req.get(embed, {
            headers: { 'User-Agent': UA },
            timeout: 25000,
            maxRedirects: 0,
            validateStatus: () => true,
        });
        const loc = r0.headers?.location || r0.headers?.Location || '';
        if (loc) real = new URL(loc, embed).href;
    } catch {
        /* keep embed */
    }
    let base;
    try {
        base = `https://${new URL(real).hostname}`;
    } catch {
        return ['', real];
    }
    try {
        await req.get(real, {
            headers: { 'User-Agent': UA },
            timeout: 25000,
            maxRedirects: true,
            validateStatus: () => true,
        });
    } catch {
        /* cookie seed optional */
    }
    const api = `${base}/api/videofile.php?video_id=${vid}`;
    let enc = '';
    try {
        const r2 = await req.get(api, {
            headers: { 'User-Agent': UA, Referer: real },
            timeout: 25000,
            validateStatus: () => true,
        });
        if (r2.status === 200) {
            const data = r2.data;
            if (Array.isArray(data) && data[0]?.video_url) enc = data[0].video_url;
            else {
                const text = typeof data === 'string' ? data : JSON.stringify(data || '');
                const mm = text.match(/"video_url"\s*:\s*"([^"]+)"/);
                if (mm) enc = mm[1];
            }
        }
    } catch {
        /* ignore */
    }
    if (!enc) return ['', real];
    const mp4 = kvsDecode(enc, base);
    const sep = mp4.includes('?') ? '&' : '?';
    return [`${mp4}${sep}f=video.m3u8`, real];
}

async function init(inReq) {
    host = DEFAULT_HOST;
    const ext = String(inReq?.body?.extend || '').trim();
    if (ext.startsWith('http')) host = ext.replace(/\/+$/, '');
    else if (ext.startsWith('{')) {
        try {
            const cfg = JSON.parse(ext);
            if (cfg.host || cfg.HOST || cfg.site) {
                host = String(cfg.host || cfg.HOST || cfg.site).replace(/\/+$/, '');
            }
        } catch {
            /* keep */
        }
    }
    return {};
}

async function home() {
    const classes = CLASS_DEFS.map(([type_id, type_name]) => ({ type_id, type_name }));
    return { class: classes, filters: {}, list: [] };
}

async function category(inReq) {
    let pg = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    if (pg < 1) pg = 1;
    const tid = String(inReq.body.id || inReq.body.tid || '').trim().replace(/^\/+|\/+$/g, '');
    const kind = kindOf(tid);
    const seg = kind === 'tag' ? 'tag' : 'category';
    const slug = tid === 'uncategorized' ? tid : encodeURIComponent(tid);
    let path = `/${seg}/${slug}/`;
    if (pg > 1) path += `page/${pg}/`;
    const html = await get(path);
    const vods = parseList(html);
    const pc = pagecount(html, pg, vods.length);
    const limit = vods.length || 20;
    return {
        list: vods,
        page: pg,
        pagecount: pc,
        limit,
        total: limit * pc,
    };
}

async function detail(inReq) {
    const vid = normId(inReq.body.id);
    if (!vid) return { list: [] };
    const slug = vid.split('/').pop();
    const html = await get(`/${vid}/`);
    if (!html) {
        return {
            list: [{
                vod_id: vid,
                vod_name: slug,
                vod_pic: '',
                vod_remarks: '解析異常',
                vod_content: '',
                vod_play_from: 'javgogogo',
                vod_play_url: `正片$${slug}|`,
            }],
        };
    }
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const name = h1 ? unescape(h1[1]) : slug;
    const og = html.match(/property="og:image"\s+content="([^"]+)"/);
    const pic = og ? og[1] : '';
    const durM = html.match(/itemprop="duration"\s+content="([^"]+)"/);
    const dur = durM ? isoDur(durM[1]) : '';
    const dateM = html.match(/itemprop="uploadDate"\s+content="([^"]+)"/);
    const date = dateM ? dateM[1].slice(0, 10) : '';
    const cats = [...html.matchAll(/href="[^"]*\/category\/[^"]+"\s+title="([^"]+)"/g)]
        .map((m) => unescape(m[1]))
        .filter(Boolean);
    const uniqCats = [...new Set(cats)];
    const [ehost, evid] = embedOf(html);
    const parts = [];
    if (date) parts.push(`發行日期：${date}`);
    if (dur) parts.push(`時長：${dur}`);
    if (uniqCats.length) parts.push(`分類：${uniqCats.join('、')}`);
    const playToken = ehost && evid ? `${evid}|${ehost}` : `${slug}|`;
    return {
        list: [{
            vod_id: vid,
            vod_name: name,
            vod_pic: pic,
            vod_year: date.slice(0, 4),
            vod_area: '日本',
            vod_remarks: dur || uniqCats[0] || '',
            vod_content: parts.join('\n'),
            type_name: uniqCats.join('、'),
            vod_play_from: 'javgogogo',
            vod_play_url: `正片$${playToken}`,
        }],
    };
}

async function play(inReq) {
    const playHeader = { 'User-Agent': UA };
    let sid = String(inReq.body.id || '').trim();
    if (sid.includes('$')) sid = sid.split('$').pop().trim();
    if (/^https?:\/\//i.test(sid) && (/\.m3u8/i.test(sid) || /\.mp4/i.test(sid))) {
        return { parse: 0, url: sid, header: playHeader };
    }
    let vid = sid;
    let ehost = '';
    if (sid.includes('|')) {
        [vid, ehost] = sid.split('|', 2);
        vid = vid.trim();
        ehost = ehost.trim();
    }
    if (vid && ehost) {
        const [url, real] = await resolvePlay(vid, ehost);
        if (url) {
            return {
                parse: 0,
                url,
                header: { 'User-Agent': UA, Referer: real },
            };
        }
    }
    return { parse: 0, url: '', header: playHeader };
}

async function search(inReq) {
    let pg = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    if (pg < 1) pg = 1;
    const key = encodeURIComponent(String(inReq.body.wd || inReq.body.key || ''));
    const path = pg > 1 ? `/page/${pg}/?s=${key}` : `/?s=${key}`;
    const list = parseList(await get(path));
    return {
        list,
        page: pg,
        pagecount: list.length >= 20 ? pg + 1 : pg,
        limit: list.length,
        total: 9999,
    };
}

export default {
    meta: {
        key: 'javgogogo',
        name: '🌸javgogogo',
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
