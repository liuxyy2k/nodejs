import { load } from 'cheerio';
import req from '../../util/req.js';
import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const site = 'https://javtsunami.com';

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const headers = {
    'User-Agent': UA,
    Referer: `${site}/`,
};
async function request(reqUrl, referer = `${site}/`) {
    const resp = await axios.get(reqUrl, {
        headers: { ...headers, Referer: referer },
        // httpsAgent: agent,
        timeout: 20000,
        validateStatus: () => true,
    });
    if (resp.status !== 200) return '';
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function parseVods($) {
    const list = [];
    $('article').each((_, el) => {
        list.push({
            vod_id: $(el).find('a').eq(0).attr('href') || '',
            vod_name: $(el).find('.entry-header').text().trim() || '',
            vod_pic: $(el).find('img').attr('src') ||'',
            vod_remarks: $(el).find('.views').text().trim() || '',
        });
    });
    return list;
}

async function init() {
    return {};
}

async function home() {
    const classList = [
        { type_name: '最新发布', type_id: '/category/new-release' },
        { type_name: '最新', type_id: '/?filter=latest' },
        { type_name: '精选', type_id: '/category/featured' },
        { type_name: '热门', type_id: '/category/hot-jav' },
        { type_name: '有码', type_id: '/category/jav-censored' },
        { type_name: '无码', type_id: '/category/jav-uncensored' },
        { type_name: '中国AV', type_id: '/category/chinese' },
        
        { type_name: '4K', type_id: '/tag/4k' },
    ]
    return { class: classList, filters: {} };
}

async function category(inReq) {
    let url = `${site}${inReq.body.id}/page/${inReq.body.page || inReq.body.pg || 1}`;
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(`${url}`));
    return { page, pagecount: 9999999, list: parseVods($) };
}


/**
 * 解 Packer
 */
function unpackPacker(code) {
    const match = code.match(
        /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{[\s\S]*?\}\s*\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\(\s*['"]\|['"]\s*\)\s*\)\s*\)/
    );

    if (!match) {
        return null;
    }

    const p = match[2];
    const a = parseInt(match[3], 10);
    let c = parseInt(match[4], 10);
    const k = match[6].split('|');

    let result = p;

    while (c--) {
        if (k[c]) {
            result = result.replace(
                new RegExp('\\b' + c.toString(a) + '\\b', 'g'),
                k[c]
            );
        }
    }

    return result;
}


function absUrl(id) {
    const raw = String(id || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${site}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function collectIframes(html) {
    const $ = load(html || '');
    const list = [];
    const seen = new Set();
    $('.responsive-player iframe, iframe').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || '';
        if (!src || /^about:blank/i.test(src) || seen.has(src)) return;
        seen.add(src);
        list.push(src);
    });
    return list;
}

function collectServerTokens(html) {
    const $ = load(html || '');
    const resolveUrl = $('.jw-player-shell').attr('data-resolve-url')
        || `${site}/wp-json/jw-dom-tabs/v1/resolve`;
    const servers = [];
    $('iframe[data-server-token]').each((_, el) => {
        const token = $(el).attr('data-server-token') || '';
        if (!token) return;
        servers.push({
            label: $(el).attr('data-server-label') || `线路${servers.length + 1}`,
            token,
        });
    });
    return { resolveUrl, servers };
}

async function resolveServerToken(resolveUrl, token, pageUrl) {
    const resp = await axios.post(resolveUrl, { token }, {
        headers: {
            'User-Agent': UA,
            Referer: pageUrl,
            Origin: site,
            'Content-Type': 'application/json',
        },
        // httpsAgent: agent,
        timeout: 20000,
        validateStatus: () => true,
    });
    return String(resp.data?.url || '').trim();
}

async function resolvePageEmbeds(pageUrl) {
    const url = absUrl(pageUrl);
    const html = await request(url, url);
    const { resolveUrl, servers } = collectServerTokens(html);
    const embeds = [];
    for (const item of servers) {
        const embed = await resolveServerToken(resolveUrl, item.token, url);
        if (embed) embeds.push({ label: item.label, url: embed });
    }
    if (embeds.length) return embeds;
    for (const src of collectIframes(html)) {
        embeds.push({ label: '播放', url: src });
    }
    return embeds;
}

function absMedia(url, embedUrl) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    try {
        const merged = new URL(url, embedUrl);
        const hostRaw = String(embedUrl).match(/^https?:\/\/([^/?#]+)/i)?.[1];
        if (hostRaw && hostRaw !== merged.host) {
            return `${merged.protocol}//${hostRaw}${merged.pathname}${merged.search}${merged.hash}`;
        }
        return merged.href;
    } catch {
        return `https://hicherri.com${url.startsWith('/') ? '' : '/'}${url}`;
    }
}

function pickHls(unpacked, embedUrl) {
    const text = String(unpacked || '');
    const links = {};
    for (const m of text.matchAll(/"(hls\d?)"\s*:\s*"([^"]+)"/g)) {
        links[m[1]] = absMedia(m[2], embedUrl);
    }
    const abs = [links.hls2, links.hls3, links.hls4].find((u) => u && /^https?:\/\//i.test(u));
    if (abs) return abs;
    if (links.hls4) return absMedia(links.hls4, embedUrl);
    return (text.match(/https?:[^"'\\\s]+\.m3u8[^"'\\\s]*/i) || [])[0] || '';
}

async function resolveHicherri(embedUrl) {
    const html = await request(embedUrl, embedUrl);
    const regex = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{[\s\S]*?\}\s*\([\s\S]*?\.split\(['"]\|['"]\)\s*\)\s*\)/;
    const match = String(html).match(regex);
    if (!match) return '';
    return pickHls(unpackPacker(match[0]), embedUrl);
}

async function resolveVidara(embedUrl) {
    let filecode = '';
    let origin = 'https://iosbgaigo.com';
    try {
        const u = new URL(embedUrl);
        origin = u.origin;
        const parts = u.pathname.split('/').filter(Boolean);
        filecode = parts[parts.length - 1] || '';
    } catch {
        return '';
    }
    if (!filecode) return '';
    const resp = await axios.post(
        `${origin}/api/stream`,
        { filecode, device: 'web' },
        {
            headers: {
                'User-Agent': UA,
                Origin: origin,
                Referer: embedUrl,
                'Content-Type': 'application/json',
            },
            // httpsAgent: agent,
            timeout: 15000,
            validateStatus: () => true,
        }
    );
    return String(resp.data?.streaming_url || '').trim();
}

async function detail(inReq) {
    const id = inReq.body.id;
    const pageUrl = absUrl(id);
    const html = await request(pageUrl, pageUrl);
    const $ = load(html);
    const embeds = await resolvePageEmbeds(pageUrl);
    const playGroups = embeds.length
        ? embeds.map((item) => [item.label, item.url])
        : [['Javtsunami', pageUrl]];
    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content') || $('meta[name="og:title"]').attr('content') || '',
            vod_pic: $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content') || '',
            vod_content: $('meta[property="og:description"]').attr('content') || $('meta[name="og:description"]').attr('content') || '',
            vod_play_from: playGroups.map((p) => p[0]).join('$$$'),
            vod_play_url: playGroups.map((p) => `正片$${p[1]}`).join('$$$'),
        }],
    };
}

async function play(inReq) {
    const header = { 'User-Agent': UA, Referer: `${site}/` };
    let raw = String(inReq.body.id || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();
    if (/\.m3u8(\?|$)/i.test(raw)) return { parse: 0, jx: 0, url: raw, header };
    if (!raw) return { parse: 0, jx: 0, url: '', header };

    let embed = raw;
    if (/javtsunami\.com/i.test(raw) || (raw.startsWith('/') && !/^https?:/i.test(raw))) {
        const embeds = await resolvePageEmbeds(raw);
        embed = embeds.find((u) => /hicherri/i.test(u.url))?.url
            || embeds.find((u) => /iosbgaigo|vidara/i.test(u.url))?.url
            || embeds[0]?.url
            || '';
    }
    if (!embed) return { parse: 0, jx: 0, url: '', header };

    let media = '';
    if (/hicherri/i.test(embed)) {
        media = await resolveHicherri(embed);
        header.Referer = 'https://hicherri.com/';
    } else if (/iosbgaigo|vidara/i.test(embed)) {
        media = await resolveVidara(embed);
        try {
            header.Referer = `${new URL(embed).origin}/`;
        } catch {
            header.Referer = 'https://iosbgaigo.com/';
        }
    } else {
        media = await resolveHicherri(embed);
        if (!media) media = await resolveVidara(embed);
        header.Referer = embed;
    }
    if (!media) return { parse: 0, jx: 0, url: '', header };
    return { parse: 0, jx: 0, url: media, header };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search?q=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'javtsunami', name: '🌸Javtsunami', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
