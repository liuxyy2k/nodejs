import { load } from 'cheerio';
import req from '../../util/req.js';

const site = 'https://avbebe.com';
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';
const JUR705_PIC = 'https://pics.dmm.co.jp/digital/video/jur00705/jur00705pl.jpg';

const CLASSES = [
    { type_id: '/archives/category/new', type_name: '新番' },
    { type_id: '/archives/category/h動畫影片', type_name: '動畫卡通' },
    { type_id: '/archives/category/3d動畫', type_name: '3D動畫' },
    { type_id: '/archives/category/泡麵番', type_name: '泡麵番' },
    { type_id: '/archives/category/%E9%AB%98%E6%B8%85%E4%B8%AD%E5%AD%97', type_name: '高清中字' },
    { type_id: '/archives/category/%E9%A6%AC%E8%B3%BD%E5%85%8B%E7%A0%B4%E8%A7%A3', type_name: '無馬賽克' },
    { type_id: '/archives/category/%E9%AB%98%E6%B8%85%E7%B4%A0%E4%BA%BA', type_name: '高清素人' },
    { type_id: '/archives/category/綜合av', type_name: '綜合AV' },
    { type_id: '/archives/category/華語av/華語av-素人', type_name: '華語素人' },
    { type_id: '/archives/category/華語av/華語av-片商', type_name: '華語片商' },
];

const PACKER_FN = String.raw`function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)`;
const PACKED_EVAL_RE = new RegExp(
    String.raw`eval\(${PACKER_FN}[\s\S]+?}\(\s*'[\s\S]+?',\s*\d+,\s*\d+,\s*'[\s\S]+?'\.split\('\|'\)\s*\)+`
);

function fixUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (raw.startsWith('//')) return `https:${raw}`;
    if (raw.startsWith('http')) return raw;
    return `${site}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function encodeCategoryPath(path) {
    let p = String(path || '').trim();
    try {
        if (/%[0-9a-f]{2}/i.test(p)) p = decodeURIComponent(p);
    } catch { /* keep */ }
    if (!p.startsWith('/')) p = `/${p}`;
    return p.split('/').map((seg) => (seg ? encodeURIComponent(seg) : '')).join('/');
}

function buildCategoryUrl(tid, page) {
    const path = encodeCategoryPath(tid || '/archives/category/new');
    let url = `${site}${path}`;
    if (page > 1) url = `${url.replace(/\/+$/, '')}/page/${page}`;
    return url;
}

function cleanText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function cleanTitle(title) {
    return cleanText(title).replace(/[-–|│·【】[\]].*$/, '').trim();
}

function htmlUnescape(text) {
    return String(text || '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function parsePackerArgs(code) {
    const patterns = [
        /}\(\s*'([\s\S]+)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/,
        /}\(\s*'([\s\S]+)',\s*(\d+),\s*(\d+),\s*"([\s\S]*?)"\.split\('\|'\)/,
    ];
    for (const re of patterns) {
        const m = code.match(re);
        if (m) return m;
    }
    return null;
}

function unpackPacker(code) {
    const args = parsePackerArgs(code);
    if (!args) return '';
    let payload = args[1];
    const base = parseInt(args[2], 10);
    const count = parseInt(args[3], 10);
    if (!Number.isFinite(base) || base < 2 || base > 36) return '';
    if (!Number.isFinite(count) || count < 0 || count > 100000) return '';
    const dict = args[4].split('|');
    for (let i = count - 1; i >= 0; i--) {
        if (!dict[i]) continue;
        payload = payload.replace(new RegExp(`\\b${i.toString(base)}\\b`, 'g'), dict[i]);
    }
    return payload;
}

function extractStreamUrl(unpacked) {
    if (!unpacked) return '';
    for (const key of ['hls4', 'hls3', 'hls2', 'hls', 'file', 'source']) {
        const m = unpacked.match(new RegExp(`["']${key}["']\\s*:\\s*["']([^"']+)["']`));
        if (m?.[1]) return m[1];
    }
    const hit = unpacked.match(/https?:\/\/[^"']+\.m3u8[^"']*/i);
    return hit?.[0] || '';
}

function hglinkId(url) {
    const m = String(url || '').match(/hglink\.to\/e\/([^/?#]+)/i);
    return m?.[1] || '';
}

async function fetchText(url, referer = `${site}/`) {
    try {
        const resp = await req.get(url, {
            headers: {
                'User-Agent': UA,
                Referer: referer,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9',
            },
            timeout: 30000,
            responseType: 'text',
            validateStatus: () => true,
        });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

async function pickBestM3u8(m3u8, referer) {
    let best = m3u8;
    try {
        const text = await fetchText(m3u8, referer);
        if (!text.includes('#EXT-X-STREAM-INF')) return best;
        const lines = text.split('\n');
        let pick = { height: 0, url: '' };
        for (let i = 0; i < lines.length; i++) {
            if (!lines[i].includes('#EXT-X-STREAM-INF')) continue;
            const m = lines[i].match(/RESOLUTION=\d+x(\d+)/);
            const streamUrl = lines[i + 1]?.trim();
            if (!streamUrl) continue;
            const height = m ? parseInt(m[1], 10) : 0;
            if (height >= pick.height) pick = { height, url: streamUrl };
        }
        if (pick.url) {
            best = pick.url.startsWith('http')
                ? pick.url
                : m3u8.replace(/[^/?#]+\.(?:m3u8|txt)(\?.*)?$/, pick.url);
        }
    } catch { /* ignore */ }
    return best;
}

async function resolveIplayerPage(playerUrl, referer) {
    const html = await fetchText(playerUrl, referer || playerUrl);
    const match = html.match(PACKED_EVAL_RE);
    if (!match) {
        const direct = html.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/i);
        if (direct) return fixUrl(direct[0]);
        return '';
    }
    let playUrl = extractStreamUrl(unpackPacker(match[0]));
    if (!playUrl) return '';
    if (!playUrl.startsWith('http')) playUrl = `https://iplayerhls.com${playUrl}`;
    return pickBestM3u8(playUrl, referer || playerUrl);
}

async function resolveHglink(embedUrl) {
    const url = fixUrl(embedUrl);
    let id = hglinkId(url);
    if (!id) {
        const html = await fetchText(url, `${site}/`);
        id = html.match(/iplayerhls\.com\/e\/([^/"'?#]+)/i)?.[1]
            || html.match(/hglink\.to\/e\/([^/"'?#]+)/i)?.[1]
            || '';
    }
    if (!id) return '';
    return resolveIplayerPage(`https://iplayerhls.com/e/${id}`, url);
}

function extractM3u8FromHtml(html, referer = '') {
    const text = String(html || '');
    const patterns = [
        /(https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*)/i,
        /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
        /source\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
        /"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/i,
    ];
    for (const pat of patterns) {
        const m = text.match(pat);
        if (m?.[1]) return fixUrl(m[1]);
    }
    return '';
}

async function resolveIframeM3u8(iframeUrl, pageReferer = `${site}/`) {
    const url = fixUrl(iframeUrl);
    if (!url) return '';

    if (/\.(m3u8|mp4)(\?|$)/i.test(url)) return url;
    if (/hglink\.to/i.test(url)) return resolveHglink(url);
    if (/iplayerhls\.com/i.test(url)) return resolveIplayerPage(url, pageReferer);

    const html = await fetchText(url, pageReferer || url);
    const direct = extractM3u8FromHtml(html, url);
    if (direct) return direct;

    const iframe = html.match(/<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1];
    if (iframe && fixUrl(iframe) !== url) {
        return resolveIframeM3u8(iframe, url);
    }

    const iplayer = html.match(/iplayerhls\.com\/e\/([^/"'?#]+)/i)?.[1];
    if (iplayer) return resolveIplayerPage(`https://iplayerhls.com/e/${iplayer}`, url);

    return '';
}

function parseList(html) {
    const $ = load(html);
    const list = [];
    $('article.jeg_post, article[class*="jeg_post"], article.post').each((_, el) => {
        const node = $(el);
        const link = node.find('h3.jeg_post_title a, h3.entry-title a, .jeg_post_title a').first();
        const href = link.attr('href') || '';
        const name = cleanText(link.text());
        if (!href || !name) return;

        let pic = node.find('img').attr('data-src')
            || node.find('img').attr('data-lazy-src')
            || node.find('img').attr('src')
            || '';
        pic = pic.split('?')[0];
        if (pic.startsWith('data:')) pic = '';
        pic = fixUrl(pic);
        if (/\bJUR[-]?705\b/i.test(name)) pic = JUR705_PIC;

        list.push({
            vod_id: fixUrl(href),
            vod_name: name,
            vod_pic: pic,
            vod_remarks: '',
        });
    });
    return list;
}

function parsePageCount(html) {
    const text = String(html || '');
    const en = text.match(/Page\s+\d+\s+of\s+(\d+)/i);
    if (en) return parseInt(en[1], 10);
    const pages = [...text.matchAll(/\/page\/(\d+)/g)].map((m) => parseInt(m[1], 10));
    if (pages.length) return Math.max(...pages);
    return 1;
}

function contentRoot($) {
    for (const sel of [
        '.jeg_postcontent',
        '.entry-content',
        '.content-inner',
        '.jeg_main_content',
        'article.post',
        'article.jeg_post',
    ]) {
        const node = $(sel).first();
        if (node.length) return node;
    }
    return $('.jeg_content, .site-content, body').first();
}

function isSkipIframe(src) {
    return /facebook\.com|twitter\.com|doubleclick|adservice|adsystem|about:blank/i.test(src);
}

function isEmbedIframe(src) {
    const url = fixUrl(src);
    if (!url || isSkipIframe(url)) return false;
    if (/\.(jpg|jpeg|png|gif|webp|svg|css|js)(\?|$)/i.test(url)) return false;
    return /https?:\/\//i.test(url);
}

function collectEmbedUrls(html) {
    const text = String(html || '');
    const urls = [];
    const add = (raw) => {
        const url = fixUrl(raw);
        if (!url || !/^https?:\/\//i.test(url)) return;
        if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url)) return;
        if (!urls.includes(url)) urls.push(url);
    };

    for (const m of text.matchAll(/<iframe[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi)) {
        if (isEmbedIframe(m[1])) add(m[1]);
    }
    for (const m of text.matchAll(/\[arve[^\]]*url=["']([^"']+)["']/gi)) add(m[1]);
    for (const m of text.matchAll(/https?:\/\/hglink\.to\/e\/[^"'\\\s<]+/gi)) add(m[0]);
    for (const m of text.matchAll(/https?:\/\/[^"'\\\s]*(?:hgcloud|iplayerhls)[^"'\\\s]*/gi)) add(m[0]);
    for (const m of text.matchAll(/href=["'](https?:\/\/[^"']*(?:hglink|hgcloud|iplayerhls|\/embed\/|\/e\/)[^"']*)["']/gi)) {
        add(m[1]);
    }
    return urls;
}

function pickHlsFromNode(node) {
    const $node = node;
    let url = '';
    $node.find('source[src]').each((_, el) => {
        if (url) return;
        const src = fixUrl($(el).attr('src') || '');
        const type = String($(el).attr('type') || '').toLowerCase();
        if (!src) return;
        if (/mpegurl|m3u8/i.test(type) || /\.m3u8/i.test(src)) url = src;
    });
    if (!url) {
        const videoSrc = fixUrl($node.find('video[src]').attr('src') || '');
        if (/\.m3u8/i.test(videoSrc)) url = videoSrc;
    }
    return url;
}

function extractFlowEpisodes($, root) {
    const urls = [];
    root.find('[data-item]').each((_, el) => {
        const raw = htmlUnescape($(el).attr('data-item') || '');
        if (!raw.startsWith('{')) return;
        try {
            const data = JSON.parse(raw);
            const src = data?.sources?.[0]?.src || data?.src;
            if (src) urls.push(fixUrl(src));
        } catch { /* ignore */ }
    });
    return urls;
}

function extractDetail(html, vodId) {
    const $ = load(html);
    const fullHtml = String(html || '');
    const root = contentRoot($);
    const rootHtml = root.html() || fullHtml;

    let vodName = cleanTitle($('meta[property="og:title"]').attr('content') || '');
    if (!vodName) {
        vodName = cleanTitle($('h1.jeg_post_title, h1.entry-title, h1').first().text());
    }
    if (!vodName) {
        const titleMatch = fullHtml.match(/<title>(.*?)<\/title>/i);
        if (titleMatch) vodName = cleanTitle(titleMatch[1]);
    }

    const vodPic = fixUrl($('meta[property="og:image"]').attr('content') || '')
        || fixUrl(root.find('img.wp-post-image, .jeg_featured img, .thumbnail img').first().attr('src')
            || root.find('img').first().attr('data-src') || '');
    const vodContent = cleanText($('meta[property="og:description"]').attr('content') || '');

    const base = {
        vod_id: vodId,
        vod_name: vodName,
        vod_pic: vodPic,
        vod_content: vodContent,
    };

    const playerAreas = [
        root.find('.aiovg-player, .aiovg-player-container, .aiovg-responsive-container'),
        root.find('.flowplayer, .fp-player'),
        root,
    ].filter((n) => n.length);

    for (const area of playerAreas) {
        const hls = pickHlsFromNode(area);
        if (hls) {
            return { ...base, vod_play_from: 'AVBeBe', vod_play_url: `正片$${hls}`, _embed: hls };
        }
    }

    const flowUrls = extractFlowEpisodes($, root);
    if (flowUrls.length) {
        const playUrl = flowUrls.map((src, i) => `第${String(i + 1).padStart(2, '0')}集$${src}`).join('#');
        return { ...base, vod_play_from: 'AVBeBe', vod_play_url: playUrl, _embed: flowUrls[0] };
    }

    for (const area of playerAreas) {
        let mp4 = '';
        area.find('source[src*=".mp4"], video[src*=".mp4"]').each((_, el) => {
            if (mp4) return;
            mp4 = fixUrl($(el).attr('src') || '');
        });
        if (mp4) {
            return { ...base, vod_play_from: 'AVBeBe', vod_play_url: `正片$${mp4}`, _embed: mp4 };
        }
    }

    let embeds = collectEmbedUrls(rootHtml);
    if (!embeds.length) embeds = collectEmbedUrls(fullHtml);
    if (embeds.length) {
        if (embeds.length === 1) {
            return { ...base, vod_play_from: 'AVBeBe', vod_play_url: `正片$${embeds[0]}`, _embed: embeds[0] };
        }
        return {
            ...base,
            vod_play_from: embeds.map((_, i) => `线路${i + 1}`).join('$$$'),
            vod_play_url: embeds.map((src) => `正片$${src}`).join('$$$'),
            _embed: embeds[0],
        };
    }

    const m3u8Hit = rootHtml.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/i)
        || fullHtml.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/i);
    if (m3u8Hit) {
        const hls = fixUrl(m3u8Hit[0]);
        return { ...base, vod_play_from: 'AVBeBe', vod_play_url: `正片$${hls}`, _embed: hls };
    }

    const mp4Hit = rootHtml.match(/https?:\/\/[^"'\\\s]+\.mp4[^"'\\\s]*/i)
        || fullHtml.match(/https?:\/\/[^"'\\\s]+\.mp4[^"'\\\s]*/i);
    if (mp4Hit) {
        const mp4 = fixUrl(mp4Hit[0]);
        return { ...base, vod_play_from: 'AVBeBe', vod_play_url: `正片$${mp4}`, _embed: mp4 };
    }

    return null;
}

async function resolveDetailPlay(item, pageUrl) {
    if (!item?.vod_play_url) return item;
    const groups = String(item.vod_play_url).split('$$$');
    const fromGroups = String(item.vod_play_from || 'AVBeBe').split('$$$');
    const resolvedGroups = [];
    const resolvedFrom = [];

    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const parts = group.split('#').filter(Boolean);
        const resolvedParts = [];
        for (const part of parts) {
            const name = part.includes('$') ? part.split('$')[0] : '正片';
            const raw = part.includes('$') ? part.split('$').slice(1).join('$') : part;
            if (/\.(m3u8|mp4|flv)(\?|$)/i.test(raw)) {
                resolvedParts.push(`${name}$${raw}`);
                continue;
            }
            const m3u8 = await resolveIframeM3u8(raw, pageUrl);
            resolvedParts.push(`${name}$${m3u8 || raw}`);
        }
        resolvedGroups.push(resolvedParts.join('#'));
        resolvedFrom.push(fromGroups[i] || fromGroups[0] || 'AVBeBe');
    }

    const next = {
        ...item,
        vod_play_from: resolvedFrom.join('$$$'),
        vod_play_url: resolvedGroups.join('$$$'),
    };
    delete next._embed;
    return next;
}

async function init() {
    return {};
}

async function home() {
    return { class: CLASSES, filters: {} };
}

async function category(inReq) {
    let tid = String(inReq.body.id || '/archives/category/new').trim();
    try { tid = decodeURIComponent(tid); } catch { /* keep */ }
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url = buildCategoryUrl(tid, page);
    const html = await fetchText(url, `${site}/`);
    return {
        list: parseList(html),
        page,
        pagecount: parsePageCount(html),
    };
}

async function detail(inReq) {
    let rawId = String(inReq.body.id || inReq.body.url || '').trim();
    if (rawId.includes('$')) rawId = rawId.split('$').pop().trim();
    try { rawId = decodeURIComponent(rawId); } catch { /* keep */ }
    const vodId = fixUrl(rawId);
    if (!vodId) return { list: [] };
    const html = await fetchText(vodId, `${site}/`);
    if (!html) return { list: [] };
    const item = extractDetail(html, vodId);
    if (!item) return { list: [] };
    const resolved = await resolveDetailPlay(item, vodId);
    return { list: [resolved] };
}

async function play(inReq) {
    const headers = {
        'User-Agent': UA,
        Referer: `${site}/`,
        Origin: site,
    };
    let raw = String(inReq.body.id || inReq.body.url || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();
    if (!raw) return { parse: 0, url: '', header: headers };

    const direct = fixUrl(raw);
    if (/\.(m3u8|mp4|flv)(\?|$)/i.test(direct)) {
        return { parse: 0, url: direct, header: headers };
    }

    const playUrl = await resolveIframeM3u8(direct, `${site}/`);
    if (playUrl) {
        let referer = `${site}/`;
        if (/hglink\.to/i.test(direct)) {
            const id = hglinkId(direct);
            if (id) referer = `https://iplayerhls.com/e/${id}`;
        } else if (/iplayerhls\.com/i.test(direct)) {
            referer = direct;
        }
        return {
            parse: 0,
            url: playUrl,
            header: { ...headers, Referer: referer },
        };
    }

    return {
        parse: 1,
        url: direct,
        header: { ...headers, Referer: direct },
        jx: 0,
    };
}

async function search(inReq) {
    const wd = String(inReq.body.wd || '').trim();
    if (!wd) return { list: [] };
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    let url = `${site}/?s=${encodeURIComponent(wd)}`;
    if (page > 1) url += `&paged=${page}`;
    const html = await fetchText(url, `${site}/`);
    return { list: parseList(html) };
}

export default {
    meta: { key: 'avbebe', name: '🔥AVBeBe', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
