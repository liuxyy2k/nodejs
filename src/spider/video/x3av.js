import axios from 'axios';
import https from 'https';

/**
 * 樱花传媒 - https://x3av.com
 * 播放 API: /api.php/post/urlget/ + packer 解包
 */

const DEFAULT_SITE = 'https://x3av.com';
const UA =
    'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

let siteUrl = DEFAULT_SITE;

const http = axios.create({
    timeout: 15_000,
    httpsAgent,
    validateStatus: () => true,
});

function headers(extra = {}) {
    return {
        'User-Agent': UA,
        Referer: `${siteUrl}/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...extra,
    };
}

function match(text, pattern) {
    const m = String(text || '').match(pattern);
    return m ? String(m[1]).trim() : '';
}

function attr(tag, key) {
    return match(tag, new RegExp(`${key}=["']([^"']+)`));
}

function clean(text) {
    let t = String(text || '').replace(/<[^>]+>/g, ' ');
    try {
        t = decodeURIComponent(t);
    } catch {
        /* keep */
    }
    return t
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function fullUrl(url) {
    url = String(url || '')
        .replace(/&amp;/g, '&')
        .trim();
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) return siteUrl + url;
    return `${siteUrl}/${url}`;
}

function joinUrl(base, url) {
    url = String(url || '')
        .replace(/\\\//g, '/')
        .replace(/&amp;/g, '&')
        .trim();
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('http')) return url;
    try {
        return new URL(url, base).href;
    } catch {
        return url;
    }
}

function realPic(url) {
    url = fullUrl(url || '')
        .replace(/&amp;/g, '&')
        .trim();
    if (!url || /noimage/i.test(url) || url.endsWith('/')) return '';
    if (url.includes('getimages.php') && url.includes('src=')) {
        const m = url.match(/src=([^&]+)/);
        if (m) {
            try {
                const src = decodeURIComponent(m[1]).replace(/&amp;/g, '&');
                if (src.startsWith('http') && !/noimage/i.test(src)) return src;
            } catch {
                /* ignore */
            }
        }
    }
    const m = url.match(/(https?:\/\/[^&'"]+\.(?:jpg|jpeg|png|webp))/i);
    if (m) {
        try {
            return decodeURIComponent(m[1]);
        } catch {
            return m[1];
        }
    }
    return url;
}

function baseN(num, base) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    if (num === 0) return '0';
    let s = '';
    let n = num;
    while (n) {
        s = chars[n % base] + s;
        n = Math.floor(n / base);
    }
    return s;
}

function unpack(html) {
    const m = String(html || '').match(
        /eval\(function\(p,a,c,k,e,d\).*?\}\('(.+?)',(\d+),(\d+),'(.+?)'\.split\('\|'\)\)\)/s,
    );
    if (!m) return '';
    let p = m[1];
    const a = parseInt(m[2], 10);
    const c = parseInt(m[3], 10);
    const k = m[4].split('|');
    for (let i = c - 1; i >= 0; i--) {
        if (i < k.length && k[i]) {
            p = p.replace(new RegExp(`\\b${baseN(i, a)}\\b`, 'g'), k[i]);
        }
    }
    return p;
}

async function getHtml(url, extraHeaders = {}) {
    if (!url) return '';
    try {
        const resp = await http.get(url, {
            headers: headers(extraHeaders),
            responseType: 'text',
        });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function parseList(html) {
    html = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
    const arr = [];
    let blocks = [
        ...html.matchAll(
            /<div[^>]+class=["'][^"']*video-elem[^"']*["'][\s\S]*?(?=<div[^>]+class=["'][^"']*video-elem|<ul[^>]+class=["'][^"']*pagination|<\/body>|$)/gi,
        ),
    ].map((m) => m[0]);

    if (!blocks.length) {
        blocks = [...html.matchAll(/<a[^>]+href=["'][^"']*\/videos\/\d+\.html[^"']*["'][\s\S]*?<\/a>/gi)].map(
            (m) => m[0],
        );
    }

    for (const block of blocks) {
        const href = match(block, /href=["']([^"']*\/videos\/\d+\.html[^"']*)/);
        const name = clean(
            match(block, /<a[^>]+class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/a>/) ||
                match(block, /title=["']([^"']+)/) ||
                match(block, /alt=["']([^"']+)/),
        );
        const imgTag = match(block, /(<img[\s\S]*?>)/);
        const pic = attr(imgTag, 'data-original') || attr(imgTag, 'data-src') || attr(imgTag, 'src');
        const remark = clean(
            match(block, /<span[^>]+class=["'][^"']*(?:duration|remarks|time)[^"']*["'][^>]*>([\s\S]*?)<\/span>/) ||
                '',
        );
        if (href && name) {
            arr.push({
                vod_id: fullUrl(href),
                vod_name: name,
                vod_pic: realPic(pic),
                vod_remarks: remark,
            });
        }
    }
    return arr;
}

function extractPlayerUrl(iframe, html) {
    if (!iframe) return '';
    const code = unpack(html) || html;
    const p = {};
    const m = code.match(/var\s+p\s*=\s*(\{[\s\S]*?\})\s*;/);
    if (m) {
        for (const kv of m[1].matchAll(/["']?(hls\d+|mp4|file)["']?\s*:\s*["']([^"']+)["']/gi)) {
            p[kv[1].toLowerCase()] = kv[2].replace(/\\\//g, '/');
        }
    }
    let url = p.hls2 || p.hls3 || p.hls4 || p.file || p.mp4 || '';
    if (!url) {
        const sm = code.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*(p\.(hls\d+|file|mp4)|["']([^"']+)["'])/i);
        if (sm) {
            url = p[(sm[2] || '').toLowerCase()] || sm[3] || '';
        }
    }
    if (!url) {
        const urls = [
            ...code.matchAll(
                /https?:\/\/[^"']+?\.(?:m3u8|mp4)(?:\?[^"']*)?|\/[A-Za-z0-9_./-]+\/(?:master|index)\.(?:m3u8|mp4)(?:\?[^"']*)?/gi,
            ),
        ].map((x) => x[0]);
        for (const u of urls) {
            if (!/jpg|png/i.test(u)) {
                url = u;
                break;
            }
        }
    }
    return joinUrl(iframe, url);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(inReq, _outResp) {
    const extend = inReq.body?.extend || inReq.body?.ext || '';
    siteUrl = DEFAULT_SITE;
    if (extend) {
        try {
            const obj = typeof extend === 'string' ? JSON.parse(extend) : extend;
            if (obj?.siteUrl) siteUrl = String(obj.siteUrl).replace(/\/$/, '');
        } catch {
            /* keep default */
        }
    }
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '1', type_name: '有码' },
        { type_id: '2', type_name: '无码' },
        { type_id: '3', type_name: '素人' },
        { type_id: '4', type_name: '中文字幕' },
    ];
    const filters = {};
    for (const c of classes) {
        filters[c.type_id] = [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最新', v: 'time' },
                    { n: '热门', v: 'hits' },
                    { n: '评分', v: 'score' },
                ],
            },
        ];
    }
    const html = await getHtml(siteUrl);
    return { class: classes, filters, list: parseList(html) };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '1');
    const pg = String(inReq.body.page || inReq.body.pg || '1');
    const extend = inReq.body.extend || {};
    const by = extend.by || '';

    let url;
    if (by && by !== 'time') {
        url = `${siteUrl}/vshow/by/${by}/id/${tid}/page/${pg}.html`;
    } else if (pg === '1') {
        url = `${siteUrl}/category/${tid}.html`;
    } else {
        url = `${siteUrl}/category/${tid}/page/${pg}.html`;
    }

    const html = await getHtml(url);
    const videos = parseList(html);
    const page = parseInt(pg, 10) || 1;
    return {
        page,
        pagecount: videos.length ? page + 1 : page,
        limit: 24,
        total: 999999,
        list: videos,
    };
}

async function detail(inReq, _outResp) {
    const vid = String(inReq.body.id || '');
    const url = fullUrl(vid);
    const html = await getHtml(url);

    const name = clean(match(html, /<h1[^>]*>([\s\S]*?)<\/h1>/) || match(html, /<title[^>]*>([\s\S]*?)<\/title>/) || '');
    const pic =
        match(html, /background\s*:\s*url\((.*?)\)/) ||
        match(html, /<img[^>]+data-original=["']([^"']+)/) ||
        match(html, /<img[^>]+data-src=["']([^"']+)/) ||
        match(html, /<img[^>]+src=["']([^"']+)/);
    const desc = clean(
        match(html, /<div[^>]+class=["'][^"']*(?:desc|content|video-info)[^"']*["'][^>]*>([\s\S]*?)<\/div>/) || '',
    );
    const actor = clean(match(html, /主演[:：\s]*(?:&nbsp;\s*)*([^<]+)/) || '');
    const remarks = clean(match(html, /番号[:：\s]*(?:&nbsp;\s*)*([^<]+)/) || '');

    const playItems = [];
    for (const m of html.matchAll(/<a[^>]+id=["']playerserver["'][^>]*>/gi)) {
        const tag = m[0];
        const vodid = attr(tag, 'data-vodid');
        const sid = attr(tag, 'data-sid') || '1';
        const nid = attr(tag, 'data-nid') || '1';
        const title = clean(match(html.slice(m.index + m[0].length, m.index + m[0].length + 200), /([^<]+)<\/a>/) || `播放${playItems.length + 1}`);
        if (vodid) playItems.push(`${title}$${vodid}|${sid}|${nid}`);
    }
    if (!playItems.length) {
        const mid = match(url, /\/videos\/(\d+)/);
        if (mid) playItems.push(`播放$${mid}|1|1`);
    }

    return {
        list: [
            {
                vod_id: vid,
                vod_name: name,
                vod_pic: realPic(pic),
                vod_remarks: remarks,
                vod_actor: actor,
                vod_content: desc,
                vod_play_from: '樱花传媒',
                vod_play_url: playItems.join('#'),
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    const pp = id.split('|');
    if (pp.length < 3) {
        return { parse: 1, url: id, header: headers() };
    }

    const form = new URLSearchParams({
        ids: pp[0],
        flag: 'player',
        sid: pp[1],
        nid: pp[2],
    });

    let text = '';
    try {
        const resp = await http.post(`${siteUrl}/api.php/post/urlget/`, form.toString(), {
            headers: headers({
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            }),
            responseType: 'text',
        });
        text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data || '');
    } catch {
        text = '';
    }

    let iframe = '';
    try {
        const obj = typeof text === 'object' ? text : JSON.parse(text);
        iframe = match(obj.player || '', /<iframe[^>]+src=["']([^"']+)/);
    } catch {
        iframe = match(text, /<iframe[^>]+src=["']([^"']+)/);
    }
    iframe = fullUrl(iframe);

    const iframeHtml = await getHtml(iframe, { Referer: `${siteUrl}/` });
    const real = extractPlayerUrl(iframe, iframeHtml);
    if (real) {
        return {
            parse: 0,
            url: real,
            header: { 'User-Agent': UA, Referer: iframe },
        };
    }
    return {
        parse: 1,
        url: iframe,
        header: { 'User-Agent': UA, Referer: `${siteUrl}/` },
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = String(inReq.body.pg || inReq.body.page || '1');
    const wd = encodeURIComponent(key);
    const url =
        pg === '1'
            ? `${siteUrl}/search.html?wd=${wd}`
            : `${siteUrl}/search.html?wd=${wd}&page=${pg}`;
    const html = await getHtml(url);
    return { list: parseList(html) };
}

export default {
    meta: {
        key: 'x3av',
        name: '💋樱花传媒',
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
