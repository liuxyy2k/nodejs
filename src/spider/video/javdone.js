import { load } from 'cheerio';
import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const site = 'https://javdoe.sh';

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

async function request(reqUrl, referer = `${site}/`) {
    try {
        const resp = await axios.get(reqUrl, {
            headers: {
                'User-Agent': UA,
                Referer: referer,
                Accept: '*/*',
            },
            // httpsAgent: agent,
            timeout: 30000,
            validateStatus: () => true,
        });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : resp.data;
    } catch {
        return '';
    }
}

const SORT_LISTS = new Set([
    '/recent/', '/popular/', '/releaseday/', '/rated/',
    '/discussed/', '/downloaded/', '/longest/', '/watched/',
]);

function normalizePath(typeId) {
    let path = String(typeId || '/recent/').trim();
    if (!path.startsWith('/')) path = `/${path}`;
    if (!path.endsWith('/')) path += '/';
    return path;
}

const SECTION_FALLBACK = {
    '/javhd/': 'javhd',
    '/jav-sub/': 'engsub',
};

async function fetchListHtml(typeId, page) {
    let path = normalizePath(typeId);
    if (path === '/jav-sub/') path = '/english-subtitle/';
    const base = `${site}${path}`;
    if (SORT_LISTS.has(path)) {
        const pageUrl = page <= 1 ? base : `${site}${path}${page}/`;
        const data = await request(`${pageUrl}?ajax=browse_videos`, pageUrl);
        return typeof data === 'object' ? (data.html || '') : '';
    }
    const pageUrl = page <= 1 ? base : `${site}${path}recent/${page}/`;
    const data = await request(`${pageUrl}?ajax=category_videos`, base);
    const html = typeof data === 'object' ? (data.html || '') : '';
    if (/video-title/.test(html)) return html;
    const section = SECTION_FALLBACK[normalizePath(typeId)];
    if (section && page <= 1) {
        const block = await request(`${site}/?ajax=fp_section&s=${section}`, `${site}/`);
        if (typeof block === 'object' && block.html) return block.html;
    }
    return html;
}

function absUrl(href) {
    const raw = String(href || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${site}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function parseVods(html) {
    const $ = load(html || '');
    const list = [];
    const seen = new Set();
    $('.video').each((_, el) => {
        const link = $(el).find('a.thumbnail, a[href]').first();
        const href = link.attr('href') || '';
        if (!href || seen.has(href)) return;
        seen.add(href);
        const name = $(el).find('.video-title').text().trim()
            || link.attr('title')
            || '';
        if (!name) return;
        list.push({
            vod_id: absUrl(href),
            vod_name: name,
            vod_pic: link.find('img').attr('src') || $(el).find('img').attr('src') || '',
            vod_remarks: $(el).find('.video-overlay').text().trim() || '',
        });
    });
    return list;
}

function unpackPacker(html) {
    const m = String(html).match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?return p\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)\)\)/);
    if (!m) return '';
    let p = m[1];
    const base = parseInt(m[2], 10);
    let count = parseInt(m[3], 10);
    const dict = m[4].split('|');
    while (count--) if (dict[count]) p = p.replace(new RegExp(`\\b${count.toString(base)}\\b`, 'g'), dict[count]);
    return p;
}

function absMedia(raw, base) {
    const url = String(raw || '').replace(/\\\//g, '/').trim();
    if (!url || url === 'about:blank') return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/') && base) {
        try { return new URL(url, base).href; } catch { return ''; }
    }
    return '';
}

function mediaFromHtml(html, base) {
    const unpacked = unpackPacker(html);
    const text = unpacked || String(html);
    const proxy = text.match(/(\/universal-stream-hls\/[a-f0-9]+\/playlist\.m3u8)/i)
        || text.match(/(https?:\/\/[^"'\s\\]*universal-stream-hls\/[a-f0-9]+\/playlist\.m3u8)/i);
    const proxyUrl = absMedia(proxy?.[1], base);
    if (proxyUrl) return proxyUrl;
    const hls2 = text.match(/["']hls2["']\s*:\s*["'](https?:[^"']+)["']/i);
    if (hls2) return hls2[1];
    const hls = text.match(/["']hls\d?["']\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i);
    if (hls) return hls[1];
    const abs = text.match(/https?:\/\/[^"'\s\\]+?\.m3u8[^"'\s\\]*/i);
    if (abs) return abs[0];
    const src = text.match(/["']src["']\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
    const fromSrc = absMedia(src?.[1], base);
    if (fromSrc) return fromSrc;
    const mp4 = text.match(/https?:\/\/[^"'\s\\]+?\.mp4[^"'\s\\]*/i);
    return mp4 ? mp4[0] : '';
}

function nextEmbedPage(html, base) {
    const iframe = String(html).match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframe?.[1] && !/^about:blank/i.test(iframe[1])) {
        try { return new URL(iframe[1], base).href; } catch { return iframe[1]; }
    }
    return '';
}

async function resolveEmbed(embedUrl, pageReferer) {
    let page = String(embedUrl || '').trim();
    let referer = pageReferer;
    for (let i = 0; i < 5; i++) {
        const html = await request(page, referer);
        const media = mediaFromHtml(String(html), page);
        if (media) return { url: media, referer: page };
        const next = nextEmbedPage(String(html), page);
        if (!next || next === page) break;
        referer = page;
        page = next;
    }
    return { url: '', referer: pageReferer };
}

function parseServerButtons($) {
    const vod_play_from = [];
    const vod_play_url = [];
    $('.button_choice_server').each((_, el) => {
        const name = $(el).attr('data-name')
            || $(el).find('span').not('.server-label').last().text().trim()
            || `线路${vod_play_from.length + 1}`;
        const embeds = $(el).attr('data-embeds');
        const embed = $(el).attr('data-embed');
        let token = '';
        if (embeds) token = `embeds:${embeds}`;
        else if (embed) token = `embed:${embed}`;
        if (!token) return;
        vod_play_from.push(name);
        vod_play_url.push(`${name}$jvd://${token}`);
    });
    return { vod_play_from, vod_play_url };
}

function decodePlayToken(raw) {
    const id = String(raw || '').trim();
    if (!id.startsWith('jvd://')) return null;
    const body = id.slice('jvd://'.length);
    if (body.startsWith('embeds:')) {
        try {
            const urls = JSON.parse(Buffer.from(body.slice('embeds:'.length), 'base64').toString('utf8'));
            return { type: 'embeds', urls: Array.isArray(urls) ? urls : [] };
        } catch { return null; }
    }
    if (body.startsWith('embed:')) {
        try {
            return { type: 'embed', url: Buffer.from(body.slice('embed:'.length), 'base64').toString('utf8') };
        } catch { return null; }
    }
    if (body.startsWith('page:')) {
        return { type: 'page', url: body.slice('page:'.length) };
    }
    return null;
}

async function init() {
    return {};
}

async function home() {
    return {
        class: [
            { type_id: '/recent/', type_name: '最新上传' },
            { type_id: '/releaseday/', type_name: '发布日期' },
            { type_id: '/popular/', type_name: '热门' },
            { type_id: '/rated/', type_name: '高评分' },
            { type_id: '/english-subtitle/', type_name: '英文字幕' },
            { type_id: '/chinese-subtitles/', type_name: '中文字幕' },
            { type_id: '/beautiful-girl/', type_name: '美丽女孩' },
            { type_id: '/debut-production/', type_name: '首部作品' },
            { type_id: '/amateur/', type_name: '素人' },
            { type_id: '/rape/', type_name: '强奸' },
            { type_id: '/slender/', type_name: '苗条' },
            { type_id: '/jav-sub/', type_name: 'JAV字幕' },
            { type_id: '/big-tits/', type_name: '巨乳' },
            { type_id: '/mature-woman/', type_name: '熟女' },
            { type_id: '/javhd/', type_name: 'JAVHD' },
        ],
        filters: {},
    };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const typeId = inReq.body.id || '/recent/';
    const html = await fetchListHtml(typeId, page);
    return { page, pagecount: 99999, list: parseVods(html) };
}

async function detail(inReq) {
    const pageUrl = absUrl(inReq.body.id);
    const html = await request(pageUrl, pageUrl);
    const $ = load(String(html));
    const { vod_play_from, vod_play_url } = parseServerButtons($);

    if (!vod_play_url.length) {
        const videoId = $('input[name="video_id"]').attr('value') || '';
        if (videoId) {
            vod_play_from.push('Embed');
            vod_play_url.push(`Embed$jvd://embed:${Buffer.from(`${site}/embed/${videoId}/`, 'utf8').toString('base64')}`);
        } else {
            vod_play_from.push('javdoe');
            vod_play_url.push(`正片$jvd://page:${pageUrl}`);
        }
    }

    return {
        list: [{
            vod_id: pageUrl,
            vod_name: $('meta[property="og:title"]').attr('content')?.replace(/\s*-\s*javdoe\.sh\s*$/i, '').trim() || '',
            vod_pic: $('meta[property="og:image"]').attr('content')
                || $('img[data-src], img.lazy').first().attr('data-src')
                || '',
            vod_content: $('meta[property="og:description"]').attr('content')
                || $('meta[name="description"]').attr('content')
                || '',
            vod_play_from: vod_play_from.join('$$$'),
            vod_play_url: vod_play_url.join('$$$'),
        }],
    };
}

async function play(inReq) {
    let raw = String(inReq.body.id || inReq.body.url || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();
    const pageReferer = `${site}/`;

    const token = decodePlayToken(raw);
    const embeds = (token?.type === 'embeds' ? token.urls : (token?.type === 'embed' && token.url ? [token.url] : []))
        .slice()
        .sort((a, b) => (/javhdz\.today/i.test(a) ? 0 : 1) - (/javhdz\.today/i.test(b) ? 0 : 1));
    let fallback = null;
    for (const embed of embeds) {
        const resolved = await resolveEmbed(embed, pageReferer);
        if (!resolved.url) continue;
        const hit = { parse: 0, url: resolved.url, header: { 'User-Agent': UA, Referer: resolved.referer || pageReferer } };
        if (/universal-stream-hls\/[a-f0-9]+\/playlist\.m3u8/i.test(resolved.url)) return hit;
        if (!fallback) fallback = hit;
    }
    if (fallback) return fallback;
    if (embeds.length) {
        return { parse: 1, url: embeds[0], header: { 'User-Agent': UA, Referer: pageReferer } };
    }

    if (token?.type === 'page' || /^https?:\/\//i.test(raw)) {
        const pageUrl = token?.type === 'page' ? token.url : raw;
        const html = await request(pageUrl, pageUrl);
        const $ = load(String(html));
        const { vod_play_url } = parseServerButtons($);
        const first = vod_play_url[0]?.split('$').pop();
        if (first) return play({ body: { id: first } });
    }

    if (/^https?:\/\//i.test(raw)) {
        const resolved = await resolveEmbed(raw, pageReferer);
        if (resolved.url) {
            return { parse: 0, url: resolved.url, header: { 'User-Agent': UA, Referer: resolved.referer || pageReferer } };
        }
        return { parse: 1, url: raw, header: { 'User-Agent': UA, Referer: pageReferer } };
    }

    return { parse: 0, url: '', header: { 'User-Agent': UA, Referer: pageReferer } };
}

async function search(inReq) {
    const wd = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const referer = `${site}/search/video/?s=${wd}`;
    let url = `${referer}&ajax=browse_videos`;
    if (page > 1) url += `&from=${page}`;
    const data = await request(url, referer);
    return { list: parseVods(typeof data === 'object' ? data.html : '') };
}

export default {
    meta: { key: 'javdone', name: '🌸JavDoe', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
