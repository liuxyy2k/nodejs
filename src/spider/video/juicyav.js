import { load } from 'cheerio';
import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const site = 'https://juicyav.com/cn';

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const headers = {
    'User-Agent': UA,
    Referer: `${site}/`,
};
async function request(reqUrl, extraHeaders = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { ...headers, ...extraHeaders },
        // httpsAgent: agent,
        timeout: 30000,
        validateStatus: () => true,
        responseType: typeof reqUrl === 'string' && /\.m3u8/i.test(reqUrl) ? 'text' : undefined,
    });
    return resp.data;
}

function absUrl(url, base) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    try {
        return new URL(url, base).href;
    } catch {
        return url;
    }
}

function isMasterPlaylist(text) {
    return String(text || '').includes('#EXT-X-STREAM-INF');
}

function variantLabel(height, bandwidth) {
    if (height >= 2160) return '4K';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height > 0) return `${height}p`;
    if (bandwidth > 0) return `${Math.round(bandwidth / 1000)}k`;
    return '播放';
}

function parseM3u8Variants(text, baseUrl) {
    const lines = String(text || '').split('\n').map((line) => line.trim());
    const variants = [];
    const seen = new Set();

    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('#EXT-X-STREAM-INF')) continue;
        const inf = lines[i];
        const res = inf.match(/RESOLUTION=(\d+)x(\d+)/i);
        const bw = inf.match(/BANDWIDTH=(\d+)/i);
        const height = res ? parseInt(res[2], 10) : 0;
        const bandwidth = bw ? parseInt(bw[1], 10) : 0;
        const next = lines[i + 1] || '';
        if (!next || next.startsWith('#')) continue;
        const url = absUrl(next, baseUrl);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        variants.push({
            label: variantLabel(height, bandwidth),
            url,
            height,
            bandwidth,
        });
    }

    variants.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
    return variants;
}

function pickBestM3u8(text, baseUrl) {
    const variants = parseM3u8Variants(text, baseUrl);
    if (variants.length) return variants[0].url;
    const direct = String(text || '')
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('#'));
    return absUrl(direct, baseUrl);
}

function buildPlayUrlFromMaster(m3u8Text, masterUrl) {
    const variants = parseM3u8Variants(m3u8Text, masterUrl);
    if (!variants.length) {
        const best = pickBestM3u8(m3u8Text, masterUrl);
        return best ? `播放$${best}` : '';
    }
    const labels = new Map();
    return variants
        .map((v) => {
            let label = v.label;
            const n = labels.get(label) || 0;
            labels.set(label, n + 1);
            if (n > 0) label = `${label}${n + 1}`;
            return `${label}$${v.url}`;
        })
        .join('#');
}

function parseVods($) {
    const list = [];
    $('article').each((_, el) => {
        list.push({
            vod_id: $(el).find('a').eq(0).attr('href') || '',
            vod_name: $(el).find('h3').text().trim() || '',
            vod_pic: $(el).find('img').attr('src') ||'',
            vod_remarks: 'Jav',
        });
    });
    return list;
}

async function init() {
    return {};
}

async function home() {
    const classes = [
            { type_id: '/videos/release', type_name: '最新发布' },
            { type_id: '/videos/subbed', type_name: '字幕视频' },
            { type_id: '/tags/Individual', type_name: '单体作品' },
            { type_id: '/tags/Hd', type_name: '高清' },
            { type_id: '/tags/4K', type_name: '4K' },
            { type_id: '/tags/Uncensored%20leak', type_name: '无码' },
            { type_id: '/tags/Slim', type_name: '苗条' },
            { type_id: '/tags/Ordinary%20Person', type_name: '素人' },
            { type_id: '/tags/Extreme%20Orgasm', type_name: '极限高潮' },
            { type_id: '/tags/Wife', type_name: '人妻' },
            { type_id: '/tags/Creampie', type_name: '中出' },
            { type_id: '/tags/Pretty+Girl', type_name: '美少女' },
            { type_id: '/tags/Mature+Woman', type_name: '熟女' },
            { type_id: '/tags/Orgy', type_name: '多人' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq) {
    let url = `${site}${inReq.body.id}?page=${inReq.body.page || inReq.body.pg || 1}`;
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(`${url}`));
    return { page, pagecount: 9999999, list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const $ = load(await request(`${id}`));
    const playUrl = $('#video-player').find('source').attr('src') || '';

    let vodPlayUrl = '';
    if (playUrl) {
        try {
            const m3u8Data = await request(playUrl, { Referer: id });
            if (isMasterPlaylist(m3u8Data)) {
                vodPlayUrl = buildPlayUrlFromMaster(m3u8Data, playUrl);
            } else {
                vodPlayUrl = `播放$${pickBestM3u8(m3u8Data, playUrl) || playUrl}`;
            }
        } catch {
            vodPlayUrl = `播放$${playUrl}`;
        }
    }

    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[name="title"]').attr('content') || '',
            vod_pic: $('meta[name="og:image"]').attr('content') || '',
            vod_content: $('meta[name="description"]').attr('content') || '',
            vod_play_from: 'Juicyav',
            vod_play_url: vodPlayUrl,
        }],
    };
}

async function play(inReq) {
    let url = String(inReq.body.id || '').trim();
    if (url.includes('$')) url = url.split('$').pop().trim();
    const header = { 'User-Agent': UA, Referer: `${site}/` };

    if (/\.m3u8(\?|$)/i.test(url)) {
        try {
            const m3u8Data = await request(url, { Referer: `${site}/` });
            if (isMasterPlaylist(m3u8Data)) {
                url = pickBestM3u8(m3u8Data, url) || url;
            }
        } catch {
            /* 保持原 master 地址 */
        }
    }

    return { parse: 0, url, header };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search?q=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'juicyav', name: '🌸Juicyav', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
