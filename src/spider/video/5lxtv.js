import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const host = 'https://5lxtv.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';

const baseHeaders = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const http = axios.create({
    timeout: 20000,
    validateStatus: () => true,
    headers: baseHeaders,
});

function h(referer = null, stream = false) {
    const headers = { ...baseHeaders };
    if (referer) headers.Referer = referer;
    if (stream) {
        headers.Accept = '*/*';
        headers.Origin = host;
    }
    return headers;
}

async function get(url, referer = null) {
    const r = await http.get(url, { headers: h(referer) });
    return typeof r.data === 'string' ? r.data : String(r.data || '');
}

function fix(url) {
    if (!url) return '';
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return host + url;
    return url;
}

function clean(s) {
    return String(s || '')
        .replace(/<.*?>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseList(html) {
    const vod = [];
    const ids = new Set();
    const blocks = html.matchAll(/<a[^>]+href="(\/videos\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g);
    for (const m of blocks) {
        const href = fix(m[1]);
        const block = m[2];
        const img = block.match(/<img[^>]+src="([^"]+)"[^>]*>/);
        const alt = block.match(/<img[^>]+alt="([^"]*)"/);
        const pic = img ? fix(img[1]) : '';
        let title = alt ? clean(alt[1]) : '';
        if (!title) {
            let ts = [...block.matchAll(/>([^<>]{2,120})</g)].map((x) => clean(x[1]));
            ts = ts.filter(
                (x) => x && !/^\d+:\d+|^▶|^\d{4}-\d{2}-\d{2}$/.test(x),
            );
            title = ts.length ? ts[ts.length - 1] : '';
        }
        let remark = '';
        const rm = [...block.matchAll(/>([^<>]*(?:\d+:\d+|\d+:\d+:\d+|▶[^<>]*)[^<>]*)</g)].map(
            (x) => clean(x[1]),
        );
        if (rm.length) {
            remark = rm.filter(Boolean).join(' ').slice(0, 30);
        }
        if (href && title && !ids.has(href)) {
            ids.add(href);
            vod.push({ vod_id: href, vod_name: title, vod_pic: pic, vod_remarks: remark });
        }
    }
    if (!vod.length) {
        for (const m of html.matchAll(
            /href="(\/videos\/[^"]+)"[\s\S]{0,800}?<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/g,
        )) {
            const href = fix(m[1]);
            if (!ids.has(href)) {
                ids.add(href);
                vod.push({
                    vod_id: href,
                    vod_name: clean(m[3]),
                    vod_pic: fix(m[2]),
                    vod_remarks: '',
                });
            }
        }
    }
    return vod;
}

function parseCats(html) {
    const arr = [];
    const seen = new Set();
    const bad = new Set([
        '/',
        '/latest',
        '/rankings',
        '/channels',
        '/actors',
        '/tags',
        '/favorites',
    ]);
    for (const m of html.matchAll(
        /<a[^>]+href="(\/[^"/?#]+)"[^>]*class="[^"]*(?:group|relative|block)[^"]*"[\s\S]*?<\/a>/g,
    )) {
        const href = m[1];
        if (bad.has(href) || href.startsWith('/videos')) continue;
        const block = m[0];
        const imgAlt = block.match(/<img[^>]+alt="([^"]+)"/);
        let txt = [...block.matchAll(/>([^<>]{2,30})</g)].map((x) => clean(x[1]));
        txt = txt.filter(
            (x) => x && !['channel', 'channels', 'creator', 'scandal'].includes(x.toLowerCase()),
        );
        const name = imgAlt
            ? clean(imgAlt[1])
            : txt.length
              ? txt[txt.length - 1]
              : href.replace(/^\//, '');
        if (!seen.has(href) && /^\/[a-z0-9_-]+$/.test(href)) {
            seen.add(href);
            arr.push({ type_name: name, type_id: href.replace(/^\//, '') });
        }
    }
    if (!arr.length) {
        return [
            { type_name: '中文字幕', type_id: 'chinese' },
            { type_name: '偷拍盜攝', type_id: 'selfie' },
            { type_name: '黑料吃瓜', type_id: 'scandal' },
            { type_name: '獨家AV', type_id: 'exclusive' },
            { type_name: '綠帽NTR', type_id: 'cuckold' },
            { type_name: 'FC2外流', type_id: 'fc2' },
            { type_name: '網紅UP主', type_id: 'upzhu' },
        ];
    }
    return arr;
}

function parsePlayApi(html) {
    const slug = html.match(/var\s+slug\s*=\s*"([^"]+)"/)?.[1];
    const t = html.match(/var\s+t\s*=\s*(\d+)/)?.[1];
    const n = html.match(/var\s+n\s*=\s*"([^"]+)"/)?.[1];
    if (!slug || !t || !n) return '';
    return `${host}/api/play/${encodeURIComponent(slug)}?t=${t}&n=${encodeURIComponent(n)}`;
}

function realPlay(html) {
    const api = parsePlayApi(html);
    if (api) return api;

    const ps = [
        /var\s+src\s*=\s*["']([^"']+playlist\.m3u8[^"']*)["']/,
        /var\s+src\s*=\s*["']([^"']+)["']/,
        /loadSource\(["']([^"']+playlist\.m3u8[^"']*)["']\)/,
        /["'](https?:\/\/[^"']+playlist\.m3u8[^"']*)["']/,
        /(https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)/,
    ];
    for (const p of ps) {
        const m = html.match(p);
        if (m) {
            return m[1].replace(/\\\//g, '/').replace(/&amp;/g, '&').trim();
        }
    }
    return '';
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const chtml = await get(`${host}/channels`);
    const vhtml = await get(`${host}/latest`);
    const classes = [
        { type_name: '最新', type_id: 'latest' },
        ...parseCats(chtml),
        { type_name: '排行', type_id: 'rankings' },
    ];
    const ids = [];
    const cleanClasses = [];
    for (const c of classes) {
        if (!ids.includes(c.type_id)) {
            ids.push(c.type_id);
            cleanClasses.push(c);
        }
    }
    return { class: cleanClasses, list: parseList(vhtml) };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id || '';
    const pg = String(inReq.body.page || '1');
    let path =
        tid === 'latest' ? '/latest' : tid === 'rankings' ? '/rankings' : `/${tid.replace(/^\/+|\/+$/g, '')}`;
    const url =
        host + path + (path.includes('?') ? `&page=${pg}` : `?page=${pg}`);
    const html = await get(url, `${host}/channels`);
    const vod = parseList(html);
    const nextPg = parseInt(pg, 10) + 1;
    const hasMore = new RegExp(
        `page=${nextPg}|下一頁|下一页|Next|rel="next"`,
    ).test(html);
    return {
        page: parseInt(pg, 10),
        pagecount: hasMore ? parseInt(pg, 10) + 1 : parseInt(pg, 10),
        limit: vod.length || 30,
        total: hasMore ? 999999 : vod.length,
        list: vod,
    };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id || '';
    const html = await get(url, `${host}/latest`);
    const name = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const pic = html.match(/poster="([^"]+)"|<meta property="og:image" content="([^"]+)"/);
    const desc = [];
    for (const k of ['時長', '观看', '觀看', '發布', '女优', '女優', '標籤', '标签']) {
        const m = html.match(new RegExp(`${k}[\\s\\S]{0,120}?<[^>]+>([^<>]+)<`));
        if (m) desc.push(`${k}:${clean(m[1])}`);
    }
    return {
        list: [
            {
                vod_id: url,
                vod_name: name ? clean(name[1]) : '5lxtv',
                vod_pic: fix(pic ? pic[1] || pic[2] || '' : ''),
                type_name: '',
                vod_year: '',
                vod_area: '',
                vod_remarks: '',
                vod_actor: '',
                vod_director: '',
                vod_content: desc.join(' '),
                vod_play_from: '5lxtv',
                vod_play_url: `播放$${url}`,
            },
        ],
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = String(inReq.body.pg || inReq.body.page || '1');
    const q = encodeURIComponent(key);
    const url = `${host}/search?q=${q}${pg !== '1' ? `&page=${pg}` : ''}`;
    const html = await get(url, host);
    return { list: parseList(html), page: parseInt(pg, 10) };
}

async function play(inReq, _outResp) {
    const url = inReq.body.id || '';
    const pageUrl = url.startsWith('http') ? url : fix(url);
    const html = await get(pageUrl, host);
    const playUrl = realPlay(html);
    if (!playUrl) {
        return { parse: 1, playUrl: '', url: pageUrl };
    }
    return {
        parse: 0,
        playUrl: '',
        url: playUrl,
        header: h(pageUrl, true),
    };
}

export default {
    meta: {
        key: '5lxtv',
        name: '🔥5lxtv',
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
