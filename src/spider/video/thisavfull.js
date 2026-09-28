import req from '../../util/req.js';
import { load } from 'cheerio';

/**
 * 蝴蝶·ThisAV 完整版
 * https://www.thisav.my + 导航站动态域名
 */

const DEFAULT_HOST = 'https://www.thisav.my';
const NAV_URLS = ['https://x99dh.cc', 'https://x99dh.one'];
const TG_GROUP = 'https://t.me/tvshare23';
const BRAND_ACTOR = 'TG群: @tvshare23';
const BRAND_DIRECTOR = '蝴蝶影视';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const DB_HOST_KEY = '/thisavLiveHost';

const COLOR_PALETTE = [
    ['1e3a8a', '60a5fa'], ['14532d', '4ade80'], ['701a75', 'f472b6'],
    ['7c2d12', 'fb923c'], ['1f2937', '38bdf8'], ['312e81', '818cf8'],
    ['831843', 'fb7185'], ['064e3b', '34d399'], ['3b0764', 'c084fc'],
];

const CLASSES = [
    { type_id: '/dm278/cn/chinese-subtitle', type_name: '中文字幕' },
    { type_id: '/dm539/cn/new', type_name: '最近更新' },
    { type_id: '/dm635/cn/release', type_name: '新作上市' },
    { type_id: '/dm817/cn/uncensored-leak', type_name: '无码流出' },
    { type_id: 'actresses', type_name: '女优一览' },
    { type_id: 'actresses_ranking', type_name: '女优排行' },
    { type_id: 'genres', type_name: '全部类型' },
    { type_id: 'makers', type_name: '全部发行商' },
    { type_id: '/cn/genres/VR', type_name: 'VR专区' },
    { type_id: '/dm301/cn/today-hot', type_name: '今日热门' },
    { type_id: '/dm170/cn/weekly-hot', type_name: '本週热门' },
    { type_id: '/dm273/cn/monthly-hot', type_name: '本月热门' },
    { type_id: '/dm597/cn/fc2', type_name: 'FC2' },
    { type_id: '/dm2208642/cn/heyzo', type_name: 'HEYZO' },
    { type_id: '/dm42/cn/tokyohot', type_name: '东京热' },
    { type_id: '/dm5199603/cn/1pondo', type_name: '一本道' },
    { type_id: '/dm7704788/cn/caribbeancom', type_name: '加勒比' },
    { type_id: '/dm91887/cn/caribbeancompr', type_name: '加勒比PR' },
    { type_id: '/dm7208981/cn/10musume', type_name: '天然素人' },
    { type_id: '/dm3600557/cn/pacopacomama', type_name: '熟女俱乐部' },
    { type_id: '/dm150/cn/gachinco', type_name: 'Gachinco' },
    { type_id: '/dm36/cn/siro', type_name: 'SIRO' },
    { type_id: '/dm34/cn/luxu', type_name: 'LUXU' },
    { type_id: '/dm34/cn/gana', type_name: 'GANA' },
    { type_id: '/dm38/cn/scute', type_name: 'S-CUTE' },
    { type_id: '/dm1004/cn/maan', type_name: 'PRESTIGE' },
    { type_id: '/dm34/cn/ara', type_name: 'ARA' },
    { type_id: '/dm33/cn/naughty4610', type_name: '顽皮4610' },
    { type_id: '/dm37/cn/naughty0930', type_name: '顽皮0930' },
    { type_id: '/dm63/cn/madou', type_name: '麻豆传媒' },
    { type_id: '/dm31/cn/twav', type_name: 'TWAV' },
    { type_id: '/dm15/cn/furuke', type_name: 'Furuke' },
    { type_id: '/dm37/cn/marriedslash', type_name: '人妻斩' },
    { type_id: '/dm42/cn/xxxav', type_name: 'XXX-AV' },
];

const PORT = process.env.DEV_HTTP_PORT || 9988;

const BANNED_SLUGS = new Set([
    'chinese-subtitle', 'new', 'release', 'uncensored-leak', 'today-hot',
    'weekly-hot', 'monthly-hot', 'genres', 'actresses', 'makers', 'series', 'tags',
    'vip', 'saved', 'playlists', 'history', 'login', 'register', 'siro', 'luxu', 'gana',
]);

let options = {};
let baseHost = DEFAULT_HOST;
let memHost = '';

function applyConfig(extend) {
    options = {};
    if (!extend) return;
    if (typeof extend === 'object' && extend !== null) {
        options = { ...extend };
        return;
    }
    const raw = String(extend).trim();
    if (!raw) return;
    if (raw.startsWith('{')) {
        try { options = JSON.parse(raw); } catch { /* ignore */ }
    }
}

function htmlUnescape(s) {
    return String(s || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '').trim();
}

async function getDbHost(db) {
    if (!db) return '';
    try {
        const v = await db.getData(DB_HOST_KEY);
        return v && String(v).startsWith('http') ? String(v) : '';
    } catch {
        return '';
    }
}

async function setDbHost(db, host) {
    if (!db || !host) return;
    try { await db.push(DB_HOST_KEY, host); } catch { /* ignore */ }
}

async function delDbHost(db) {
    if (!db) return;
    try { await db.delete(DB_HOST_KEY); } catch { /* ignore */ }
}

function fetchHeaders(referer = '') {
    return {
        'User-Agent': UA,
        Referer: referer || `${baseHost}/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
}

function absUrl(url, host = baseHost) {
    if (!url) return '';
    url = String(url).trim();
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `${host}${url}`;
    return `${host}/${url}`;
}

async function fetchHtml(targetUrl, { referer = '', checkHost = true, db } = {}) {
    if (!targetUrl) return { code: 0, text: '' };
    let url = targetUrl;
    if (url.startsWith('//')) url = `https:${url}`;
    else if (url.startsWith('/')) url = absUrl(url);

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const resp = await req.get(url, {
                headers: fetchHeaders(referer),
                timeout: 12000,
                validateStatus: () => true,
            });
            const code = resp.status;
            const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            if (code >= 400) {
                if ([404, 502, 503].includes(code) && checkHost && attempt === 0) {
                    memHost = '';
                    await delDbHost(db);
                    await ensureHost(db, true);
                    url = url.replace(/^https?:\/\/[^/]+/, baseHost);
                    continue;
                }
                return { code, text, err: `HTTP ${code}` };
            }
            return { code, text, err: '' };
        } catch (e) {
            if (attempt === 0 && checkHost) {
                memHost = '';
                await delDbHost(db);
                await ensureHost(db, true);
                url = url.replace(/^https?:\/\/[^/]+/, baseHost);
                continue;
            }
            return { code: -1, text: '', err: e.message };
        }
    }
    return { code: -1, text: '', err: 'timeout' };
}

async function testHost(host) {
    const res = await fetchHtml(`${host.replace(/\/$/, '')}/dm247/cn`, {
        referer: `${host}/`,
        checkHost: false,
    });
    return res.code === 200;
}

async function resolveNavSites() {
    for (const nav of NAV_URLS) {
        const res = await fetchHtml(nav, { checkHost: false });
        const text = res.text || '';
        if (!text) continue;

        const blocks = text.match(/["']([A-Za-z0-9+/=]{100,})["']/g) || [];
        for (const quoted of blocks) {
            const b = quoted.slice(1, -1);
            try {
                const decoded = Buffer.from(b, 'base64').toString('utf8');
                const unquoted = decodeURIComponent(decoded);
                if (!unquoted.includes('MissAV') || !unquoted.includes('[')) continue;
                const siteList = JSON.parse(unquoted);
                for (const item of siteList) {
                    if (item?.name !== 'MissAV') continue;
                    const cand = [];
                    if (item.url) cand.push(item.url);
                    for (const uObj of item.urls || []) {
                        const u = uObj?.url || '';
                        if (u && !cand.includes(u)) cand.push(u);
                    }
                    for (const cUrl of cand) {
                        try {
                            const parsed = new URL(cUrl);
                            const base = `${parsed.protocol}//${parsed.host}`;
                            if (await testHost(base)) return base;
                        } catch { /* ignore */ }
                    }
                }
            } catch { /* ignore */ }
        }
    }
    return options.defaultHost || DEFAULT_HOST;
}

async function ensureHost(db, force = false) {
    if (!force && memHost) {
        baseHost = memHost;
        return baseHost;
    }
    if (!force) {
        const cached = await getDbHost(db);
        if (cached) {
            baseHost = cached;
            memHost = cached;
            return baseHost;
        }
    }
    const resolved = await resolveNavSites();
    baseHost = resolved || DEFAULT_HOST;
    memHost = baseHost;
    await setDbHost(db, baseHost);
    return baseHost;
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/thisavfull/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = inReq?.headers?.['x-forwarded-proto'] || 'http';
        return `${proto}://${hostHeader}${prefix}`;
    }
    return `http://127.0.0.1:${PORT}${prefix}`;
}

function imageMime(buf) {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf.length >= 4 && buf.subarray(0, 4).toString() === 'GIF8') return 'image/gif';
    if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') {
        return 'image/webp';
    }
    return 'image/jpeg';
}

function wrapPic(rawPic, inReq, mode = 'video') {
    if (!rawPic) return '';
    const pic = absUrl(rawPic);
    if (pic.includes('/img?url=') || pic.includes('@Referer=')) return pic;

    if (inReq && pic.startsWith('http')) {
        const b64 = Buffer.from(pic, 'utf8').toString('base64');
        return `${getProxyBase(inReq)}/img?url=${encodeURIComponent(b64)}`;
    }

    const refEnc = encodeURIComponent(baseHost.replace(/\/$/, ''));
    if (mode === 'actress') {
        return `${pic}@Referer=${refEnc}/@User-Agent=${encodeURIComponent(UA)}`;
    }
    return `${pic}@Referer=${refEnc}@User-Agent=${encodeURIComponent(UA)}`;
}

function int2base(x, radix) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (x < 0) return `-${int2base(-x, radix)}`;
    const res = [];
    while (x > 0) {
        res.push(chars[x % radix]);
        x = Math.floor(x / radix);
    }
    return res.length ? res.reverse().join('') : '0';
}

function unpackPacker(p, a, c, k) {
    const d = {};
    while (c > 0) {
        c -= 1;
        const key = int2base(c, a);
        d[key] = (c < k.length && k[c]) ? k[c] : key;
    }
    return p.replace(/\b\w+\b/g, (w) => (d[w] !== undefined ? d[w] : w));
}

function parseActressCards(body, isRanking, inReq) {
    const vodList = [];
    const seen = new Set();
    let chunks = [...body.matchAll(/(<div[^>]*>\s*<a[^>]+href=["'][^"']*\/actresses\/[^"']+["'][^>]*>[\s\S]*?<\/div>\s*<\/div>)/gi)];
    if (!chunks.length) {
        chunks = [...body.matchAll(/(<a[^>]+href=["'][^"']*\/actresses\/[^"']+["'][^>]*>[\s\S]*?<\/a>\s*<div[\s\S]*?<\/div>)/gi)];
    }

    for (const m of chunks) {
        const block = m[1] || m[0];
        const hrefM = block.match(/href=["']([^"']*\/actresses\/[^"']+)["']/i);
        if (!hrefM) continue;
        const href = hrefM[1].trim();
        if (href.includes('actresses/ranking') || seen.has(href)) continue;
        seen.add(href);

        const picM = block.match(/(?:data-src|data-original|src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
        let rawPic = picM ? picM[1].trim() : '';
        const proxyPic = rawPic ? wrapPic(rawPic, inReq, 'actress') : '';

        const altM = block.match(/alt=["']([^"']+)["']/i);
        let title = altM ? altM[1].trim() : '';
        if (!title) {
            const txtCands = [...block.matchAll(/>([^<]+)</g)].map((x) => x[1].trim());
            for (const t of txtCands) {
                if (t && !/影片|条|條|部|出道|年|第|名|Ranking/.test(t) && t.length >= 2 && !/^\d+$/.test(t)) {
                    title = t;
                    break;
                }
            }
        }
        if (!title) title = '女优';
        title = htmlUnescape(title);

        let subDesc = '';
        let remarksText = '蝴蝶影视';
        if (isRanking) {
            const rankM = block.match(/(第\s*\d+\s*名)/);
            subDesc = rankM ? rankM[1].replace(/\s/g, '') : '';
            if (subDesc) remarksText = `蝴蝶影视 · ${subDesc}`;
        } else {
            const countM = block.match(/(\d+)\s*(?:条影片|條影片|部影片|部)/);
            const debutM = block.match(/(\d{4})\s*(?:出道|年出道)/);
            const meta = [];
            if (countM) meta.push(`${countM[1]}部`);
            if (debutM) meta.push(`${debutM[1]}出道`);
            subDesc = meta.join(' · ');
            if (subDesc) remarksText = `蝴蝶影视 · ${subDesc}`;
        }

        vodList.push({
            vod_id: `folder@${absUrl(href)}`,
            vod_name: subDesc ? `${title}\n${subDesc}` : title,
            vod_pic: proxyPic || `https://dummyimage.com/300x300/222222/ffffff.png&text=${encodeURIComponent(title.slice(0, 4))}`,
            vod_remarks: remarksText,
            vod_tag: 'folder',
            style: { type: 'oval', ratio: 1.0 },
        });
    }
    return vodList;
}

function parseGenreMakerCards(body, mode) {
    const targetKey = mode === 'genres' ? 'genres' : 'makers';
    const vodList = [];
    const seen = new Set();
    const reCell = new RegExp(`(<div>\\s*<a[^>]+href=["'][^"']*/${targetKey}/[^"']+["'][^>]*>[\\s\\S]*?</div>)`, 'gi');
    const cells = [...body.matchAll(reCell)];

    cells.forEach((m, idx) => {
        const cell = m[1];
        const hrefM = cell.match(new RegExp(`href=["']([^"']*/${targetKey}/[^"']+)["']`, 'i'));
        if (!hrefM) return;
        const cleanHref = hrefM[1].trim();
        if (seen.has(cleanHref) || cleanHref.endsWith(`/${targetKey}`) || cleanHref.endsWith(`/${targetKey}/`)) return;
        seen.add(cleanHref);

        let titleM = cell.match(/<a[^>]+class=["'][^"']*text-nord13[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
        if (!titleM) {
            titleM = cell.match(new RegExp(`<a[^>]+href=["'][^"']*/${targetKey}/[^"']+["'][^>]*>([\\s\\S]*?)<\\/a>`, 'i'));
        }
        const title = htmlUnescape(stripTags(titleM?.[1] || '')).trim();
        if (!title) return;

        const countM = cell.match(/(\d+)\s*(?:条影片|條影片|部影片|部)/);
        const remarks = countM ? `蝴蝶影视 · ${countM[1]}部` : '蝴蝶影视';
        const firstChar = title[0]?.trim().toUpperCase() || '?';
        const [bg, fg] = COLOR_PALETTE[idx % COLOR_PALETTE.length];
        const cardPic = `https://dummyimage.com/640x360/${bg}/${fg}.png&text=${encodeURIComponent(firstChar)}`;

        vodList.push({
            vod_id: `folder@${absUrl(cleanHref)}`,
            vod_name: title,
            vod_pic: cardPic,
            vod_remarks: remarks,
            vod_tag: 'folder',
            style: { type: 'rect', ratio: 1.78 },
        });
    });
    return vodList;
}

function parseVideoCards(body, inReq) {
    const vodList = [];
    const seen = new Set();
    let chunks = [];
    if (body.includes('class="relative group')) {
        chunks = body.split('class="relative group').slice(1).map((c) => `class="relative group${c}`);
    } else if (body.includes('class="thumbnail')) {
        chunks = body.split('class="thumbnail').slice(1).map((c) => `class="thumbnail${c}`);
    } else {
        chunks = [...body.matchAll(/(<a[^>]+href=["'](?:https?:\/\/[^"']+|\/[^"']+)["'][^>]*>[\s\S]*?<\/a>)/gi)].map((m) => m[1]);
    }

    for (const ch of chunks) {
        const hrefM = ch.match(/href=["']([^"']*\/(?:cn|dm\d+\/cn)\/([A-Za-z0-9_-]+))["']/i);
        if (!hrefM) continue;
        const fullHref = hrefM[1];
        const dvdId = hrefM[2];
        const dvdLow = dvdId.toLowerCase();
        if (BANNED_SLUGS.has(dvdLow) || seen.has(dvdLow) || dvdId.length < 3) continue;
        seen.add(dvdLow);

        let title = '';
        const altM = ch.match(/alt=["']([^"']+)["']/i);
        if (altM) {
            const cAlt = altM[1].trim();
            if (cAlt && cAlt !== dvdId && cAlt.length > dvdId.length) title = cAlt;
        }
        if (!title) {
            const txtCands = [...ch.matchAll(/>([^<]{6,120})</g)].map((x) => x[1].trim());
            for (const tStr of txtCands) {
                if (!/item\.|HD|FHD|4K|:|条影片/.test(tStr) && tStr.length > dvdId.length) {
                    title = tStr;
                    break;
                }
            }
        }
        if (!title) title = dvdId.toUpperCase();
        title = htmlUnescape(title);

        const picM = ch.match(/(?:data-src|data-original|src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
        let rawPic = (picM && !picM[1].includes('item.dvd_id')) ? picM[1].trim() : `https://spic2-147.71352.men/${dvdLow}/cover-n.jpg`;

        const durM = ch.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
        const dur = durM ? `蝴蝶影视 · ${durM[1]}` : `蝴蝶影视 · ${dvdId.toUpperCase()}`;

        vodList.push({
            vod_id: absUrl(fullHref),
            vod_name: title,
            vod_pic: wrapPic(rawPic, inReq),
            vod_remarks: dur,
            style: { type: 'rect', ratio: 1.78 },
        });
    }
    return vodList;
}

function parseCards(html, mode = 'video', inReq) {
    let body = html || '';
    if (body.includes('</nav>')) body = body.split('</nav>')[1];
    else if (body.includes('</header>')) body = body.split('</header>')[1];

    if (mode === 'actress') return parseActressCards(body, false, inReq);
    if (mode === 'actress_ranking') return parseActressCards(body, true, inReq);
    if (mode === 'genres' || mode === 'makers') return parseGenreMakerCards(body, mode);
    return parseVideoCards(body, inReq);
}

function buildFilters() {
    const filterSort = {
        key: 'sort',
        name: '排序',
        init: 'default',
        value: [
            { n: '默认排序', v: 'default' },
            { n: '发行日期', v: 'released_at' },
            { n: '最近更新', v: 'published_at' },
            { n: '收藏最多', v: 'saved' },
            { n: '今日浏览', v: 'today_views' },
            { n: '本周浏览', v: 'weekly_views' },
            { n: '本月浏览', v: 'monthly_views' },
            { n: '总浏览数', v: 'views' },
        ],
    };
    const filterType = {
        key: 'filters',
        name: '过滤',
        init: 'all',
        value: [
            { n: '所有', v: 'all' },
            { n: '单人作品', v: 'individual' },
            { n: '多人作品', v: 'multiple' },
            { n: '中文字幕', v: 'chinese-subtitle' },
        ],
    };
    const heightRanges = [
        '131-135', '136-140', '141-145', '146-150', '151-155',
        '156-160', '161-165', '166-170', '171-175', '176-180',
        '181-185', '186-190',
    ];
    const filterActressHeight = {
        key: 'height',
        name: '身高',
        init: 'all',
        value: [{ n: '选择身高', v: 'all' }, ...heightRanges.map((r) => ({ n: `${r}cm`, v: r }))],
    };
    const cups = 'ABCDEFGHIJKLMNOPQ'.split('');
    const filterActressCup = {
        key: 'cup',
        name: '罩杯',
        init: 'all',
        value: [{ n: '选择罩杯', v: 'all' }, ...cups.map((c) => ({ n: `${c} 罩杯`, v: c }))],
    };
    const filterActressAge = {
        key: 'age',
        name: '年龄',
        init: 'all',
        value: [
            { n: '选择年龄', v: 'all' },
            { n: '< 20', v: '<20' },
            { n: '20 - 30', v: '20-30' },
            { n: '30 - 40', v: '30-40' },
            { n: '40 - 50', v: '40-50' },
            { n: '50 - 60', v: '50-60' },
            { n: '> 60', v: '>60' },
        ],
    };
    const years = [];
    for (let y = 2026; y >= 2008; y--) years.push(String(y));
    const filterActressDebut = {
        key: 'debut',
        name: '出道年份',
        init: 'all',
        value: [{ n: '选择出道年份', v: 'all' }, ...years.map((y) => ({ n: `${y} 以前`, v: y }))],
    };
    const filterActressSort = {
        key: 'sort',
        name: '排序',
        init: 'default',
        value: [
            { n: '默认排序', v: 'default' },
            { n: '影片最多', v: 'videos' },
        ],
    };

    const filters = {};
    for (const item of CLASSES) {
        const cid = item.type_id;
        if (cid === 'actresses') {
            filters[cid] = [filterActressSort, filterActressHeight, filterActressCup, filterActressAge, filterActressDebut];
        } else if (!['actresses_ranking', 'genres', 'makers'].includes(cid)) {
            filters[cid] = [filterSort, filterType];
        }
    }
    return filters;
}

function buildCategoryUrl(tid, page, extend = {}) {
    const slug = String(tid || '').trim();
    const pg = Math.max(1, parseInt(page, 10) || 1);
    let targetUrl = '';
    let parseMode = 'video';

    if (slug.startsWith('folder@')) {
        targetUrl = slug.slice('folder@'.length);
        parseMode = 'video';
    } else if (slug === 'actresses') {
        targetUrl = `${baseHost}/cn/actresses`;
        parseMode = 'actress';
    } else if (slug === 'actresses_ranking') {
        targetUrl = `${baseHost}/cn/actresses/ranking`;
        parseMode = 'actress_ranking';
    } else if (slug === 'genres') {
        targetUrl = `${baseHost}/cn/genres`;
        parseMode = 'genres';
    } else if (slug === 'makers') {
        targetUrl = `${baseHost}/cn/makers`;
        parseMode = 'makers';
    } else {
        targetUrl = `${baseHost}${slug.replace(/\/$/, '')}`;
        parseMode = 'video';
    }

    const query = [];
    if (pg > 1) query.push(`page=${pg}`);

    if (parseMode === 'actress') {
        for (const k of ['height', 'cup', 'age', 'debut']) {
            const val = extend[k];
            if (val && val !== 'all') query.push(`${k}=${encodeURIComponent(val)}`);
        }
        if (extend.sort && extend.sort !== 'default') query.push(`sort=${extend.sort}`);
    } else if (parseMode === 'video') {
        if (extend.sort && extend.sort !== 'default') query.push(`sort=${extend.sort}`);
        if (extend.filters && extend.filters !== 'all') query.push(`filters=${extend.filters}`);
    }

    if (query.length) {
        targetUrl += (targetUrl.includes('?') ? '&' : '?') + query.join('&');
    }
    return { targetUrl, parseMode };
}

function cleanStreamUrl(u) {
    return htmlUnescape(String(u || '').replace(/\\\//g, '/').trim());
}

function isVideoFormat(url) {
    const u = String(url || '').toLowerCase();
    return ['.m3u8', '.mp4', '.flv', '.mkv', '.avi', '.ts', '.mpd', 'index.png', '/jmpres/']
        .some((k) => u.includes(k));
}

function playHeaders(referer = '') {
    const ref = referer || `${baseHost}/`;
    return {
        'User-Agent': UA,
        Referer: ref,
        Origin: baseHost.replace(/\/$/, ''),
        Accept: '*/*',
    };
}

function proxyStreamUrl(u) {
    const raw = cleanStreamUrl(u);
    if (!raw || raw.includes('/jmpres/')) return raw;
    const prefix = `${baseHost.replace(/\/$/, '')}/jmpres/$1/`;
    return raw.replace(/https?:\/\/(([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})\//, prefix);
}

function extractPackedSources(html) {
    const results = [];
    const packerM = html.match(/}\s*\(\s*['"]([\s\S]*?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([^'"]+)['"]\.split\(['"]\|['"]\)/);
    if (!packerM) return results;

    const payload = packerM[1]
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    const unpacked = unpackPacker(
        payload,
        parseInt(packerM[2], 10),
        parseInt(packerM[3], 10),
        packerM[4].split('|'),
    );

    const defs = [
        ['1080P超清', /source1280\s*=\s*['"]([^'"]+)['"]/],
        ['720P高清', /source842\s*=\s*['"]([^'"]+)['"]/],
        ['自适应线路', /(?:^|[^0-9A-Za-z_])source\s*=\s*['"]([^'"]+)['"]/m],
    ];
    for (const [from, re] of defs) {
        const m = unpacked.match(re);
        if (m?.[1]) {
            results.push({ from, url: proxyStreamUrl(m[1]) });
        }
    }
    return results;
}

async function resolveJmpresUrl(url, referer = '') {
    const jmp = cleanStreamUrl(url);
    if (!jmp.includes('/jmpres/')) return jmp;
    try {
        const resp = await req.get(jmp, {
            headers: playHeaders(referer),
            maxRedirects: 10,
            timeout: 20000,
            validateStatus: () => true,
        });
        const finalUrl = resp.request?.res?.responseUrl || jmp;
        const text = typeof resp.data === 'string' ? resp.data.slice(0, 4096) : '';
        const ct = String(resp.headers['content-type'] || '').toLowerCase();
        if (finalUrl && isVideoFormat(finalUrl) && !finalUrl.includes('/jmpres/')) {
            return finalUrl;
        }
        if (resp.status === 200 && (text.includes('#EXTM3U') || ct.includes('mpegurl') || ct.includes('mp4'))) {
            return finalUrl.includes('/jmpres/') ? finalUrl : jmp;
        }
    } catch (e) {
        console.warn('[thisavfull] jmpres resolve err', e.message);
    }
    return jmp;
}

async function init(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    if (options.defaultHost) {
        baseHost = String(options.defaultHost).replace(/\/$/, '');
        memHost = baseHost;
    }
    await ensureHost(inReq.server?.db);
    return {};
}

async function home(inReq, _outResp) {
    await ensureHost(inReq.server?.db);
    const { targetUrl, parseMode } = buildCategoryUrl('/dm539/cn/new', 1, {});
    const res = await fetchHtml(targetUrl, {
        referer: `${baseHost}/dm247/cn`,
        db: inReq.server?.db,
    });
    const list = parseCards(res.text, parseMode, inReq);
    return { class: CLASSES, filters: buildFilters(), list };
}

async function category(inReq, _outResp) {
    await ensureHost(inReq.server?.db);
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const tid = String(inReq.body.id || '/dm539/cn/new');
    const extend = inReq.body.filters || inReq.body.filter || inReq.body.extend || {};
    const { targetUrl, parseMode } = buildCategoryUrl(tid, pg, extend);
    const res = await fetchHtml(targetUrl, {
        referer: `${baseHost}/dm247/cn`,
        db: inReq.server?.db,
    });
    const list = parseCards(res.text, parseMode, inReq);
    return {
        page: pg,
        pagecount: list.length >= 12 ? pg + 1 : pg,
        limit: list.length,
        total: 9999,
        list,
    };
}

async function imgProxy(inReq, reply) {
    try {
        await ensureHost(inReq.server?.db);
        let imgB64 = inReq.query.url || '';
        try { imgB64 = decodeURIComponent(imgB64); } catch { /* ignore */ }
        const pad = (4 - (imgB64.length % 4)) % 4;
        if (pad) imgB64 += '='.repeat(pad);
        const imgUrl = Buffer.from(imgB64, 'base64').toString('utf8');
        if (!imgUrl || !imgUrl.startsWith('http')) return reply.code(404).send('');

        const resp = await req.get(imgUrl, {
            headers: fetchHeaders(`${baseHost}/`),
            responseType: 'arraybuffer',
            timeout: 15000,
            validateStatus: () => true,
        });
        if (resp.status !== 200 || !resp.data) return reply.code(404).send('');

        const body = Buffer.from(resp.data);
        return reply.code(200).header('Content-Type', imageMime(body)).send(body);
    } catch (e) {
        console.warn('[thisavfull] imgProxy err', e.message);
        return reply.code(500).send('');
    }
}

async function detail(inReq, _outResp) {
    await ensureHost(inReq.server?.db);
    let targetUrl = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '').trim();
    if (!targetUrl.startsWith('http')) targetUrl = absUrl(targetUrl);

    const res = await fetchHtml(targetUrl, { db: inReq.server?.db });
    const html = res.text || '';
    const $ = load(html);
    if (!html) return { list: [] };
    const des = $('meta[property="og:description"]').attr('content') || '';
    const titleM = html.match(/<title>(.*?)<\/title>/i);
    const rawTitle = titleM ? titleM[1].trim() : '精彩视频';
    const vodName = htmlUnescape(rawTitle.split(' - ')[0].split(' | ')[0].trim());

    const posterM = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    const vodPic = posterM ? posterM[1].trim() : '';

    const streams = extractPackedSources(html);
    const fromList = streams.map((s) => s.from);
    const urlList = streams.map((s) => `正片$${s.url}`);

    if (!fromList.length) {
        fromList.push('官方原线');
        urlList.push(`正片$${targetUrl}`);
    }
    return {
        list: [{
            vod_id: targetUrl,
            vod_name: vodName,
            vod_pic: vodPic,
            vod_actor: BRAND_ACTOR,
            vod_director: BRAND_DIRECTOR,
            vod_remarks: '蝴蝶影视',
            vod_content: des,
            vod_play_from: fromList.join('$$$'),
            vod_play_url: urlList.join('$$$'),
        }],
    };
}

async function play(inReq, _outResp) {
    await ensureHost(inReq.server?.db);
    let playUrl = cleanStreamUrl(inReq.body.id);
    let referer = `${baseHost}/`;

    // 详情页 fallback 或 jmpres 被误判时，重新从页面解包
    if (playUrl.startsWith('http') && !isVideoFormat(playUrl)) {
        const pageUrl = playUrl;
        const res = await fetchHtml(pageUrl, { db: inReq.server?.db });
        const streams = extractPackedSources(res.text || '');
        if (streams.length) {
            playUrl = streams[0].url;
            referer = pageUrl;
        }
    }

    if (isVideoFormat(playUrl)) {
        if (playUrl.includes('/jmpres/')) {
            playUrl = await resolveJmpresUrl(playUrl, referer);
        }
        return {
            parse: 0,
            jx: 0,
            url: playUrl,
            header: playHeaders(referer),
        };
    }

    return {
        parse: 1,
        jx: 1,
        url: playUrl,
        header: playHeaders(referer),
    };
}

async function search(inReq, _outResp) {
    await ensureHost(inReq.server?.db);
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const encoded = encodeURIComponent(key);
    const searchUrl = pg > 1
        ? `${baseHost}/cn/search/${encoded}?page=${pg}`
        : `${baseHost}/cn/search/${encoded}`;

    const res = await fetchHtml(searchUrl, { db: inReq.server?.db });
    const list = parseCards(res.text, 'video', inReq);

    return {
        page: pg,
        pagecount: list.length >= 12 ? pg + 1 : pg,
        limit: list.length,
        total: 9999,
        list,
    };
}

export default {
    meta: {
        key: 'thisavfull',
        name: '🌸MissAV免翻🌸',
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
