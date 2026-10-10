import req from '../../util/req.js';

/**
 * BZSP005 · bzsp005.sbs（MacCMS · player_aaaa）
 */

const HOSTS = [
    'https://www.bzsp005.sbs',
    'https://bzsp005.sbs',
    'http://www.bzsp005.sbs',
    'http://bzsp005.sbs',
];

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CATES = [
    { type_id: '25', type_name: '口交颜射' },
    { type_id: '26', type_name: 'COS独家' },
    { type_id: '27', type_name: '约炮人妻' },
    { type_id: '28', type_name: '淫乱群交' },
    { type_id: '29', type_name: '成人动漫' },
    { type_id: '30', type_name: '国产原创' },
    { type_id: '31', type_name: '高清无码' },
    { type_id: '32', type_name: '强奸乱伦' },
    { type_id: '33', type_name: '人妻熟女' },
    { type_id: '34', type_name: '制服丝袜' },
    { type_id: '35', type_name: '巨乳美乳' },
    { type_id: '36', type_name: 'AV明星' },
];

let host = HOSTS[0];

function baseHeaders(extra = {}) {
    return {
        'User-Agent': UA,
        Referer: `${host}/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        ...extra,
    };
}

function looksReal(text) {
    if (!text || text.length < 200) return false;
    const low = text.toLowerCase();
    return (
        low.includes('/index.php/vod/') ||
        low.includes('player_aaaa') ||
        low.includes('.m3u8')
    );
}

function candidates(url) {
    try {
        const u = new URL(url);
        if (!u.hostname || !u.hostname.includes('bzsp005.sbs')) return [url];
        const path = u.pathname + u.search;
        const list = [];
        for (const h of [host, ...HOSTS]) {
            if (!list.includes(h)) list.push(h);
        }
        return list.map((h) => {
            const b = new URL(h);
            return `${b.origin}${path}`;
        });
    } catch {
        return [url];
    }
}

async function fetchOne(url) {
    try {
        const r = await req.get(url, {
            headers: baseHeaders(),
            timeout: 15000,
            responseType: 'text',
            validateStatus: () => true,
            proxy: false,
        });
        if (r.status >= 400) return '';
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch {
        return '';
    }
}

async function getHtml(url) {
    let best = '';
    for (const cand of candidates(url)) {
        const text = await fetchOne(cand);
        if (text && text.length > best.length) best = text;
        if (looksReal(text)) {
            try {
                const u = new URL(cand);
                if (u.hostname.includes('bzsp005.sbs')) {
                    host = u.origin;
                }
            } catch {
                /* keep */
            }
            return text;
        }
    }
    return looksReal(best) ? best : '';
}

function cleanUrl(raw, encrypt = '0') {
    if (!raw) return '';
    let url = String(raw).trim().replace(/^["']|["']$/g, '');
    if (!url) return '';
    url = url.replace(/\\\//g, '/');
    url = url.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
    );
    try {
        if (String(encrypt) === '2') {
            const pad = '='.repeat((4 - (url.length % 4)) % 4);
            const decoded = Buffer.from(url + pad, 'base64').toString('utf8');
            if (decoded) {
                url = decodeURIComponent(decoded).replace(/\\\//g, '/');
            }
        } else if (String(encrypt) === '1') {
            url = decodeURIComponent(url);
        }
    } catch {
        /* keep */
    }
    url = url.replace(/\\&/g, '&');
    return url
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();
}

function absUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `${host}${url}`;
    return url;
}

function parsePlay(html) {
    if (!html) return '';
    const start = html.indexOf('player_aaaa');
    if (start >= 0) {
        const block = html.slice(start, start + 8000);
        const em = block.match(/"encrypt"\s*:\s*"?(\d+)"?/);
        const encrypt = em ? em[1] : '0';
        let um = block.match(/"url"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (!um) um = block.match(/'url'\s*:\s*'((?:[^'\\]|\\.)*)'/);
        if (um?.[1]) {
            const url = cleanUrl(um[1], encrypt);
            if (url) return absUrl(url);
        }
    }
    let m = html.match(/<source[^>]+src=["']([^"']+)["']/is);
    if (m) return absUrl(cleanUrl(m[1]));
    m = html.match(/<video[^>]+src=["']([^"']+)["']/is);
    if (m) return absUrl(cleanUrl(m[1]));
    const text = html.replace(/\\\//g, '/').replace(/&amp;/g, '&');
    m = text.match(/https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?/i);
    if (m) return m[0];
    m = text.match(/https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?/i);
    return m ? m[0] : '';
}

function parseList(html) {
    const vids = [];
    const seen = new Set();
    const re =
        /<dt><a href="\/index\.php\/vod\/detail\/id\/(\d+)\.html" title="([^"]*)"[^>]*>\s*<img[^>]*src="([^"]+)"[^>]*alt="[^"]*"/g;
    for (const m of html.matchAll(re)) {
        const vid = m[1];
        if (seen.has(vid)) continue;
        seen.add(vid);
        const ctx = html.slice(m.index + m[0].length, m.index + m[0].length + 500);
        const sm = ctx.match(/评分:\s*([0-9.]+)/);
        vids.push({
            vod_id: vid,
            vod_name: m[2].trim(),
            vod_pic: m[3],
            vod_remarks: sm ? sm[1] : '',
        });
    }
    if (vids.length) return vids;

    for (const m of html.matchAll(
        /href=["'](?:https?:\/\/[^"']*)?\/index\.php\/vod\/detail\/id\/(\d+)\.html["']([^>]*)>([\s\S]*?)<\/a>/gi,
    )) {
        const vid = m[1];
        if (seen.has(vid)) continue;
        seen.add(vid);
        const attrs = m[2];
        const inner = m[3];
        const ctx = inner + html.slice(m.index + m[0].length, m.index + m[0].length + 800);
        let title = attrs.match(/title="([^"]+)"/)?.[1] || '';
        let pic =
            ctx.match(/<img[^>]+(?:data-src|data-original|src)=["']([^"']+)["']/i)?.[1] || '';
        if (!title && pic) {
            title = ctx.match(/<img[^>]+alt="([^"]*)"/i)?.[1] || '';
        }
        if (!title) title = inner.replace(/<[^>]+>/g, '').trim();
        const sm = ctx.match(/评分:\s*([0-9.]+)/);
        if (title) {
            vids.push({
                vod_id: vid,
                vod_name: title.replace(/&amp;/g, '&').trim(),
                vod_pic: pic,
                vod_remarks: sm ? sm[1] : '',
            });
        }
    }
    return vids;
}

function isDirectMedia(part) {
    return /\.(m3u8|mp4|flv|mkv|mov)(\?|#|$)/i.test(part || '');
}

async function resolvePlay(rawId) {
    const raw = String(rawId || '').trim();
    const part = raw.includes('$') ? raw.split('$').pop().trim() : raw;
    let url = '';
    let purl = '';
    let referer = `${host}/`;

    if (part) {
        if (isDirectMedia(part)) {
            url = absUrl(cleanUrl(part));
        } else if (/^\d+$/.test(part)) {
            purl = `${host}/index.php/vod/play/id/${part}/sid/1/nid/1.html`;
        } else if (part.startsWith('http')) {
            purl = part;
        } else if (part.startsWith('/')) {
            purl = `${host}${part}`;
        } else if (part.includes('vod/play/') || part.includes('vod/detail/')) {
            purl = `${host}/${part.replace(/^\/+/, '')}`;
        }
    }

    if (purl && !url) {
        referer = purl;
        let h = await getHtml(purl);
        url = parsePlay(h);
        if (!url && h) {
            const pm = h.match(/href=["']([^"']*vod\/play\/[^"']*)["']/i);
            if (pm) {
                let purl2 = pm[1].replace(/&amp;/g, '&');
                if (!purl2.startsWith('http')) purl2 = `${host}/${purl2.replace(/^\/+/, '')}`;
                if (purl2 !== purl) {
                    referer = purl2;
                    url = parsePlay(await getHtml(purl2));
                }
            }
        }
    }
    return { url, referer };
}

async function init(_inReq, _outResp) {
    host = HOSTS[0];
    return {};
}

async function home(_inReq, _outResp) {
    const h = await getHtml(`${host}/`);
    return {
        class: CATES,
        filters: {},
        list: parseList(h),
        parse: 0,
        jx: 0,
    };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '25');
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url =
        pg === 1
            ? `${host}/index.php/vod/type/id/${tid}.html`
            : `${host}/index.php/vod/type/id/${tid}/page/${pg}.html`;
    const h = await getHtml(url);
    return {
        list: parseList(h),
        page: pg,
        pagecount: 9999,
        limit: 48,
        total: 999999,
    };
}

async function detail(inReq, _outResp) {
    const vid = String(inReq.body.id || '');
    const h = await getHtml(`${host}/index.php/vod/detail/id/${vid}.html`);
    let name = h.match(/<title>(.+?)详情介绍/)?.[1]?.trim() || '';
    if (!name) name = h.match(/<title>([^<]+)<\/title>/)?.[1]?.trim() || '';
    const pic = h.match(/<dt><a[^>]*>\s*<img[^>]*src="(https?:\/\/[^"]+)"/)?.[1] || '';
    const detailUrl = `${host}/index.php/vod/detail/id/${vid}.html`;
    return {
        list: [
            {
                vod_id: vid,
                vod_name: name || vid,
                vod_pic: pic,
                vod_play_from: '正片',
                vod_play_url: `正片$${detailUrl}`,
            },
        ],
        parse: 0,
        jx: 0,
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
    const q = encodeURIComponent(key);
    const url =
        pg > 1
            ? `${host}/index.php/vod/search/wd/${q}/page/${pg}.html`
            : `${host}/index.php/vod/search/wd/${q}.html`;
    const h = await getHtml(url);
    return { list: parseList(h), page: pg };
}

async function play(inReq, _outResp) {
    const { url, referer } = await resolvePlay(inReq.body.id || inReq.body.flag);
    return {
        parse: 0,
        playUrl: '',
        url: url || '',
        jx: 0,
        header: baseHeaders({ Referer: referer }),
    };
}

export default {
    meta: {
        key: 'bzsp005',
        name: '💋BZSP005',
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
