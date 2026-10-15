import req from '../../util/req.js';

const HOST = 'https://pektino.com';
const LANG = 'zh-CN';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CLASSES = [
    { type_id: 'daily', type_name: '每日精选' },
    { type_id: 'weekly', type_name: '每周热门' },
    { type_id: 'monthly', type_name: '每月排行' },
    { type_id: 'all', type_name: '历史最佳' },
];

const CARD_STYLE = { type: 'rect', ratio: 1.78 };

function siteReferer() {
    return `${HOST}/${LANG}`;
}

function hdr(referer) {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        Referer: referer || siteReferer(),
    };
}

function unescapeHtml(s) {
    return String(s || '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function convertPicProxy(picUrl) {
    if (!picUrl) return '';
    let u = String(picUrl).trim();
    if (u.startsWith('//')) u = `https:${u}`;
    if (u.includes('twimg.com')) return `https://wsrv.nl/?url=${encodeURIComponent(u)}`;
    return u;
}

async function fetchHtml(url, retry = 3) {
    for (let i = 0; i < retry; i++) {
        try {
            const resp = await req.get(url, {
                headers: hdr(),
                timeout: 12000,
                responseType: 'arraybuffer',
                validateStatus: () => true,
            });
            if (resp.status >= 400) return '';
            const buf = Buffer.from(resp.data || []);
            for (const enc of ['utf8', 'gbk', 'gb2312', 'latin1']) {
                try {
                    const text = buf.toString(enc);
                    if (text) return text;
                } catch {
                    /* next */
                }
            }
            return buf.toString('utf8');
        } catch {
            if (i < retry - 1) await new Promise((r) => setTimeout(r, 300));
        }
    }
    return '';
}

async function translateAuto(text) {
    if (!text) return '';
    try {
        const resp = await req.post(
            'https://aidemo.youdao.com/trans',
            new URLSearchParams({ q: text, from: 'Auto', to: 'zh-CHS' }).toString(),
            {
                headers: {
                    'User-Agent': UA,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                timeout: 2500,
                validateStatus: () => true,
            },
        );
        const trans = resp.data?.translation;
        if (Array.isArray(trans) && trans[0]) return String(trans[0]).trim();
    } catch {
        /* fallback */
    }
    try {
        const q = encodeURIComponent(text);
        const resp = await req.get(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${q}`,
            { headers: { 'User-Agent': UA }, timeout: 2000, validateStatus: () => true },
        );
        const data = resp.data;
        if (Array.isArray(data?.[0])) {
            const translated = data[0].map((part) => part?.[0] || '').join('');
            if (translated.trim()) return translated.trim();
        }
    } catch {
        /* keep original */
    }
    return text;
}

function parseCards(htmlText) {
    const items = [];
    if (!htmlText) return items;
    const re = /(<a[^>]+href="[^"]*(?:\/zh-CN)?\/movie\/[^"]+"[^>]*>.*?<\/a>)/gis;
    const seen = new Set();
    for (const block of htmlText.match(re) || []) {
        const hrefM = block.match(/href="([^"]*(?:\/zh-CN)?\/movie\/([^"/]+)\/?)"/i);
        if (!hrefM) continue;
        const vid = hrefM[2];
        if (seen.has(vid)) continue;
        seen.add(vid);
        const imgM = block.match(/(?:src|data-src|poster)="([^"]+)"/i);
        const pic = imgM ? convertPicProxy(imgM[1]) : '';
        const durM = block.match(/(\d+:\d+(?::\d+)?)/);
        const dur = durM ? durM[1] : '';
        const altM = block.match(/alt="([^"]+)"/i);
        let rawTitle = altM ? altM[1].replace(/X \(Twitter\) adult video /i, '').trim() : vid;
        const title = rawTitle === vid ? `精选影片 ${vid}` : rawTitle;
        const remarks = dur ? `蝴蝶影视 | ${dur}` : '蝴蝶影视';
        items.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remarks,
            style: CARD_STYLE,
        });
    }
    return items;
}

function findInitialItems(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.props?.pageProps?.initialItems) return obj.props.pageProps.initialItems;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const r = findInitialItems(item);
            if (r) return r;
        }
    } else {
        for (const value of Object.values(obj)) {
            const r = findInitialItems(value);
            if (r) return r;
        }
    }
    return null;
}

function parseNextDataItems(html) {
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return [];
    try {
        const items = findInitialItems(JSON.parse(m[1]));
        if (!items) return [];
        return items.map((item) => {
            const vid = item.url_cd || '';
            if (!vid) return null;
            let duration = '';
            if (item.time != null) {
                const mins = Math.floor(item.time / 60);
                const secs = item.time % 60;
                duration = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            }
            const remarks = duration ? `蝴蝶影视 | ${duration}` : '蝴蝶影视';
            return {
                vod_id: vid,
                vod_name: item.anime_title || vid,
                vod_pic: convertPicProxy(item.thumbnail || ''),
                vod_remarks: remarks,
                style: CARD_STYLE,
            };
        }).filter(Boolean);
    } catch {
        return [];
    }
}

function extractList(html) {
    const cards = parseCards(html);
    if (cards.length) return cards;
    return parseNextDataItems(html);
}

function categoryUrl(tid, pg) {
    const clean = String(tid || 'daily').trim().replace(/^\/+|\/+$/g, '');
    let url = clean === 'daily' ? `${HOST}/${LANG}` : `${HOST}/${LANG}/${clean}`;
    if (pg > 1) url += `?page=${pg}`;
    return url;
}

function findVideoUrl(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (typeof obj.url === 'string' && obj.url.includes('video.twimg.com')) return obj.url;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const r = findVideoUrl(item);
            if (r) return r;
        }
    } else {
        for (const value of Object.values(obj)) {
            const r = findVideoUrl(value);
            if (r) return r;
        }
    }
    return null;
}

function extractMp4s(html, vid) {
    const clean = String(html || '').replace(/\\\//g, '/').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const raw = [...clean.matchAll(/(https?:\/\/video\.twimg\.com\/[^"'\\s<>]+\.mp4(?:\?[^"'\\s<>]*)?)/gi)].map((m) =>
        m[1].replace(/\\/g, '').trim(),
    );
    const valid = [...new Set(raw.filter((u) => u.startsWith('http')))];
    let pick = valid.find((u) => u.includes(vid));
    if (!pick && valid.length) pick = valid[0];
    return pick || '';
}

async function init() {
    return {};
}

async function home() {
    return { class: CLASSES, filters: {}, list: [], class_flag: 0, style: CARD_STYLE };
}

async function homeVod() {
    const html = await fetchHtml(`${HOST}/${LANG}`);
    return { list: extractList(html), style: CARD_STYLE };
}

async function category(inReq) {
    const pg = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    const tid = String(inReq.body.id || inReq.body.tid || 'daily');
    const html = await fetchHtml(categoryUrl(tid, pg));
    const list = extractList(html);
    return {
        list,
        page: pg,
        pagecount: 999,
        limit: 50,
        total: 9999,
        class_flag: 0,
        style: CARD_STYLE,
    };
}

async function detail(inReq) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    vid = String(vid || '').trim();
    if (!vid) return { list: [] };

    const targetUrl = vid.startsWith('http') ? vid : `${HOST}/${LANG}/movie/${vid}`;
    const html = await fetchHtml(targetUrl);
    if (!html) return { list: [] };

    let title = '';
    const tM = html.match(/<title>([^<]+)<\/title>/i);
    if (tM) title = tM[1].split(' - ')[0].trim();

    let pic = '';
    const picM = html.match(/property="og:image"\s+content="([^"]+)"/i);
    if (picM) pic = convertPicProxy(picM[1]);

    let desc = '';
    const descM = html.match(/name="description"\s+content="([^"]+)"/i);
    if (descM) desc = descM[1].trim();

    let videoStream = extractMp4s(html, vid);
    if (!videoStream) {
        const nextM = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (nextM) {
            try {
                videoStream = findVideoUrl(JSON.parse(nextM[1])) || '';
            } catch {
                /* ignore */
            }
        }
    }

    const playUrl = videoStream
        ? `超清直链$${videoStream}`
        : `网页解析$${targetUrl}`;

    const zhTitle = await translateAuto(title);
    const displayTitle = zhTitle || title;
    const noticeDesc = `🦋 蝴蝶影视 独家呈现\n官方交流群: @tvshare23\n原名: ${title}\n${desc}`;

    return {
        list: [{
            vod_id: vid,
            vod_name: unescapeHtml(displayTitle),
            vod_pic: pic,
            vod_year: '',
            vod_area: '',
            vod_actor: '🦋 TG群: @tvshare23',
            vod_director: '🦋 蝴蝶影视',
            vod_content: noticeDesc,
            vod_remarks: '蝴蝶影视',
            vod_play_from: '蝴蝶影视',
            vod_play_url: playUrl,
        }],
    };
}

async function play(inReq) {
    let url = String(inReq.body.id || '').trim();
    if (url.includes('$')) url = url.split('$').pop().trim();
    const header = {
        'User-Agent': UA,
        Referer: 'https://twitter.com/',
    };
    if (!url.startsWith('http')) {
        return { parse: 0, url: '', header };
    }
    if (/video\.twimg\.com/i.test(url)) {
        return { parse: 0, url, header };
    }
    if (!/\.mp4|\.m3u8/i.test(url)) {
        return { parse: 1, url, header: { 'User-Agent': UA, Referer: siteReferer() } };
    }
    return { parse: 0, url, header };
}

async function search(inReq) {
    const pg = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    const kw = encodeURIComponent(String(inReq.body.wd || inReq.body.key || ''));
    let url = `${HOST}/${LANG}/search?tag=${kw}`;
    if (pg > 1) url += `&page=${pg}`;
    const list = extractList(await fetchHtml(url));
    return {
        list,
        page: pg,
        pagecount: 999,
        limit: 24,
        total: 9999,
        class_flag: 0,
        style: CARD_STYLE,
    };
}

export default {
    meta: {
        key: 'pektino',
        name: '🎥Twitter精选',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/homeVod', homeVod);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
