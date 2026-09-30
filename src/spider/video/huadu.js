import req from '../../util/req.js';

const PUB_URLS = [
    'https://huaduys.net',
];
const DOMAIN_LIST = [
    'https://huaduys.net/',
];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const ADS = ['广告点赞', '开元棋牌', '澳门新葡京', '好色直播', '注册送', '棋牌', '赌场', '葡京', '博彩'];
const FALLBACK = [
    { type_id: '/vodshow/1-----------.html', type_name: '中文字幕' },
    { type_id: '/vodshow/2-----------.html', type_name: '无字幕' },
    { type_id: '/vodshow/3-----------.html', type_name: '国产' },
    { type_id: '/vodshow/4-----------.html', type_name: '动漫' },
    { type_id: '/vodshow/5-----------.html', type_name: '欧美' },
    { type_id: '/vodshow/6-----------.html', type_name: '中字无码' },
    { type_id: '/vodshow/7-----------.html', type_name: '中字有码' },
    { type_id: '/vodshow/8-----------.html', type_name: '步兵无码' },
    { type_id: '/vodshow/9-----------.html', type_name: '骑兵有码' },
    { type_id: '/vodshow/10-----------.html', type_name: '国产精品' },
    { type_id: '/vodshow/11-----------.html', type_name: '国产传媒' },
    { type_id: '/vodshow/12-----------.html', type_name: '糖心Vlog' },
    { type_id: '/vodshow/13-----------.html', type_name: '欧美中字' },
    { type_id: '/vodshow/14-----------.html', type_name: '中字里番' },
    { type_id: '/vodshow/15-----------.html', type_name: '3D动漫' },
    { type_id: '/vodshow/16-----------.html', type_name: 'AI短剧' },
];

let host = DOMAIN_LIST[0];
let hostReady = false;
const cache = new Map();

function headers() {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: host,
        'Accept-Language': 'zh-CN,zh;q=0.9',
    };
}

function fix(u) {
    if (!u) return '';
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return host.replace(/\/+$/, '') + u;
    return u;
}

function decodeHtml(s) {
    s = String(s || '');
    s = s.replace(/&#x([0-9a-fA-F]+);?/g, (_, h) => {
        const n = parseInt(h, 16);
        return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    });
    s = s.replace(/&#(\d+);?/g, (_, n) => {
        const c = parseInt(n, 10);
        return c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : '';
    });
    return s
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"');
}

function txt(s) {
    return decodeHtml(String(s || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function attr(tag, name) {
    const m = String(tag || '').match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'));
    return m ? decodeHtml(m[1]).trim() : '';
}

function mid(text, a, b) {
    const i = text.indexOf(a);
    if (i < 0) return '';
    const j = text.indexOf(b, i + a.length);
    return j < 0 ? '' : text.slice(i + a.length, j).replace(/\\/g, '');
}

async function get(url) {
    if (cache.has(url)) return cache.get(url);
    try {
        const r = await req.get(url, {
            headers: headers(),
            timeout: 8000,
            validateStatus: () => true,
            maxRedirects: 5,
        });
        const t = typeof r.data === 'string' ? r.data : String(r.data || '');
        cache.set(url, t);
        return t;
    } catch {
        cache.set(url, '');
        return '';
    }
}

function isOk(t) {
    return t.length > 200 && ['花都', 'huadu', 'vodtype', 'voddetail', 'stui'].some((x) => t.includes(x));
}

async function probeHost(u) {
    const url = u.endsWith('/') ? u : `${u}/`;
    return isOk(await get(url));
}

async function resolveHost() {
    for (const u of DOMAIN_LIST) {
        if (await probeHost(u)) return u.endsWith('/') ? u : `${u}/`;
    }
    for (const p of PUB_URLS) {
        const t = await get(p);
        const found = [...new Set((t.match(/https?:\/\/[a-zA-Z0-9.-]+\.(?:com|net|org|top|cc|vip)\/?/g) || [])
            .map((x) => (x.endsWith('/') ? x : `${x}/`)))];
        for (const u of found) {
            if (await probeHost(u)) return u;
        }
    }
    return DOMAIN_LIST[0];
}

function pic(block) {
    for (const k of ['data-original', 'data-src', 'data-lazyload', 'data-lazy-src', 'src']) {
        const m = block.match(new RegExp(`<img[^>]+${k}=["']([^"']+)`, 'i'));
        if (!m) continue;
        const u = m[1].trim();
        const low = u.toLowerCase();
        if (u && !low.includes('blank') && !low.includes('loading') && !low.includes('default')) return fix(u);
    }
    return '';
}

function videos(text) {
    const out = [];
    const seen = new Set();
    const blocks = text.match(/<li[\s\S]*?<\/li>/g) || [];
    for (const b of blocks) {
        if (!b.includes('stui-vodlist__thumb') && !b.includes('voddetail')) continue;
        if (ADS.some((x) => b.includes(x))) continue;
        const hm = b.match(/<h4[^>]*class=["'][^"']*title[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        const am = b.match(/<a[^>]+class=["'][^"']*stui-vodlist__thumb[^"']*["'][^>]+href=["']([^"']+)["']/i);
        const href = hm ? hm[1] : (am ? am[1] : '');
        if (!href.includes('voddetail')) continue;
        let name = hm ? txt(hm[2]) : '';
        if (!name) {
            const tm = b.match(/title=["']([^"']+)["']/i);
            name = tm ? tm[1].trim() : '';
        }
        if (!href || !name || seen.has(href) || name.length < 2) continue;
        const image = pic(b);
        if (!image) continue;
        seen.add(href);
        const rm = b.match(/<span[^>]+class=["'][^"']*pic-text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
        out.push({ vod_id: href, vod_name: name, vod_pic: image, vod_remarks: rm ? txt(rm[1]) : '' });
    }
    return out;
}

function classId(href) {
    href = href.replace('vodtype', 'vodshow');
    if (href.includes('.html') && !href.includes('-----------')) return `${href.split('.html')[0]}-----------.html`;
    if (!href.includes('.html')) return `${href.replace(/\/+$/, '')}-----------.html`;
    return href;
}

function collectClasses(text) {
    const arr = [];
    const seen = new Set();
    const add = (href, inner, openTag) => {
        let name = attr(openTag, 'title') || txt(inner);
        if (!name || /^\d+$/.test(name) || ['首页', '发布页', 'VPN下载'].includes(name)) return;
        if (/vod(search|play|down)/i.test(href)) return;
        const cid = classId(href);
        if (seen.has(cid)) return;
        seen.add(cid);
        arr.push({ type_id: cid, type_name: name });
    };
    const re = /<a([^>]*href=["']([^"']*(?:vodtype|vodshow)[^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(text))) add(m[2], m[3], m[1]);
    return arr.length ? arr : FALLBACK;
}

async function ensureHost() {
    if (hostReady) return;
    host = await resolveHost();
    hostReady = true;
}

async function init() {
    cache.clear();
    hostReady = false;
    await ensureHost();
    return {};
}

async function home() {
    await ensureHost();
    const text = await get(host);
    return { class: collectClasses(text), filters: {} };
}

async function category(inReq) {
    await ensureHost();
    const pg = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    const cid = String(inReq.body.id || inReq.body.tid || '');
    const base = cid.includes('---.html') ? cid.split('---.html')[0] : cid.replace(/\.html$/i, '');
    const list = videos(await get(fix(`${base}${pg}---.html`)));
    return { page: pg, pagecount: 9999, limit: 90, total: 999999, list };
}

async function detail(inReq) {
    await ensureHost();
    let did = inReq.body.id;
    if (Array.isArray(did)) did = did[0];
    did = fix(String(did || ''));
    const text = (await get(did)).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    const name = txt(mid(text, '<h1', '</h1>')) || txt(mid(text, '标题：', '</span>'));
    const join = (re) => [...text.matchAll(re)].map((x) => x[1]).join(' ');
    const pm = text.match(/class=["']btn btn-primary["'][^>]+href=["']([^"']+)["']/i);
    const play = fix(pm ? pm[1] : did);
    return {
        list: [{
            vod_id: did,
            vod_name: name,
            vod_pic: pic(text),
            vod_director: join(/分类：[\s\S]*?target=["'][^"']*["']>(.*?)<\/a>/g),
            vod_actor: join(/演员：[\s\S]*?target=["'][^"']*["']>(.*?)<\/a>/g),
            vod_remarks: join(/类别：[\s\S]*?target=["'][^"']*["']>(.*?)<\/a>/g),
            vod_year: txt(mid(text, '日期：', 'p>')),
            vod_area: txt(mid(text, '时长：', 'p>')),
            vod_content: name || '',
            vod_play_from: '花都专线',
            vod_play_url: `播放$${play}`,
        }],
    };
}

async function search(inReq) {
    await ensureHost();
    const key = String(inReq.body.wd || '').trim();
    const pg = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    if (!key) return { list: [] };
    const list = videos(await get(fix(`/vodsearch/-------------.html?wd=${encodeURIComponent(key)}`)));
    return { list, page: pg, pagecount: 9999, limit: 90, total: 999999 };
}

async function play(inReq) {
    await ensureHost();
    const id = String(inReq.body.id || '');
    const text = await get(id);
    let u = mid(text, '"","url":"', '"') || mid(text, '"url":"', '"');
    if (u) {
        try {
            u = decodeURIComponent(Buffer.from(u, 'base64').toString('utf8'));
        } catch {
            try { u = decodeURIComponent(u); } catch { /* keep */ }
        }
    }
    return {
        parse: u ? 0 : 1,
        url: u || id,
        header: {
            'User-Agent': 'Linux; Android 12; Pixel 3 XL) AppleWebKit/537.36 Chrome/98.0.4758.101 Mobile Safari/537.36',
        },
    };
}

export default {
    meta: {
        key: 'huadu',
        name: '💋花都影视',
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
