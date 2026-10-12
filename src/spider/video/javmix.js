import { load } from 'cheerio';
import req from '../../util/req.js';
import axios from 'axios';  
import { config } from './config.js';

const FLARE_URL = config.FLARE_URL;

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://javmix.tv/';

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
    });
    return resp.data;
}

function unpackPlayer(html) {
    const m = String(html).match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?return p\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)\)\)/);
    if (!m) return '';
    let p = m[1];
    const base = parseInt(m[2], 10);
    let count = parseInt(m[3], 10);
    const dict = m[4].split('|');
    while (count--) if (dict[count]) p = p.replace(new RegExp('\\b' + count.toString(base) + '\\b', 'g'), dict[count]);
    return p;
}

function unpackDetail(html) {
    const src = String(html);
    const start = src.indexOf("}('");
    if (!src.includes('eval(function(p,a,c,k,e,d)') || start < 0) return '';
    let i = start + 3;
    let payload = '';
    while (i < src.length) {
        if (src[i] === '\\') { payload += src[i + 1] === "'" ? "'" : src[i] + (src[i + 1] || ''); i += 2; continue; }
        if (src[i] === "'") break;
        payload += src[i];
        i++;
    }
    const rest = src.slice(i + 1).match(/^,(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/);
    if (!rest) return '';
    const base = parseInt(rest[1], 10);
    let count = parseInt(rest[2], 10);
    const words = rest[3].split('|');
    const enc = (n) => (n < base ? '' : enc(Math.floor(n / base))) + ((n % base) > 35 ? String.fromCharCode((n % base) + 29) : (n % base).toString(36));
    const table = {};
    while (count--) table[enc(count)] = words[count] || enc(count);
    return payload.replace(/\b\w+\b/g, (w) => (table[w] !== undefined ? table[w] : w));
}

function mediaFromHtml(html) {
    const text = unpackPlayer(html) || String(html);
    for (const key of ['hls4', 'hls2', 'hls3']) {
        const hit = text.match(new RegExp(`["']${key}["']\\s*:\\s*["']([^"']+)["']`));
        if (hit?.[1] && /^https?:/i.test(hit[1])) return hit[1];
    }
    const m3u8 = text.match(/https?:\/\/[^"'\s\\]+?\.m3u8[^"'\s\\]*/);
    if (m3u8) return m3u8[0];
    const master = text.match(/https?:\/\/[^"'\s\\]+?master\.txt[^"'\s\\]*/);
    return master ? master[0] : '';
}

async function pickBestM3u8(m3u8, referer) {
    try {
        const resp = await axios.get(m3u8, {
            headers: { 'User-Agent': UA, Referer: referer },
            httpsAgent: agent,
            timeout: 15000,
            validateStatus: () => true,
        });
        const text = String(resp.data || '');
        if (!text.includes('#EXT-X-STREAM-INF')) return m3u8;
        const lines = text.split('\n');
        let best = { height: -1, url: '' };
        for (let i = 0; i < lines.length; i++) {
            if (!lines[i].includes('#EXT-X-STREAM-INF')) continue;
            const height = parseInt(lines[i].match(/RESOLUTION=\d+x(\d+)/)?.[1] || '0', 10);
            const next = lines[i + 1]?.trim();
            if (!next || next.startsWith('#')) continue;
            if (height >= best.height) best = { height, url: next };
        }
        if (!best.url) return m3u8;
        return best.url.startsWith('http') ? best.url : new URL(best.url, m3u8).href;
    } catch {
        return m3u8;
    }
}

function streamtapeLink(html) {
    const patterns = [
        /getElementById\('botlink'\)\.innerHTML\s*=\s*'([^']*)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)/,
        /getElementById\('robotlink'\)\.innerHTML\s*=\s*'([^']*)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)(?:\.substring\((\d+)\))?/,
    ];
    for (const re of patterns) {
        const m = String(html).match(re);
        if (!m) continue;
        let link = m[1] + m[2].slice(parseInt(m[3], 10));
        if (m[4]) link = m[1] + m[2].slice(parseInt(m[3], 10)).slice(parseInt(m[4], 10));
        if (link.startsWith('//')) link = `https:${link}`;
        if (/^https?:/i.test(link)) return link.includes('stream=1') ? link : `${link}${link.includes('?') ? '&' : '?'}stream=1`;
    }
    return '';
}

function parseVods($) {
    const list = [];
    $('.post-list a').each((_, el) => {
        list.push({
            vod_id: $(el).attr('href') || '',
            vod_name: $(el).find('span').text().trim() || '',
            vod_pic: $(el).find('img').attr('src') || '',
            vod_remarks: $(el).find('.post-list-duration').text().trim() || '',
        });
    });
    return list;
}

async function init() {
    return {};
}

async function home() {
    return {
        class: [
            { type_id: '/video/', type_name: '色情视频' },
            { type_id: '/popularity/', type_name: '热门' },
            { type_id: '/xvideo/', type_name: '无码' },
            { type_id: '/fc2ppv/', type_name: '素人' },
            { type_id: '/soaring/   ', type_name: '急上昇' }
        ],
        filters: {},
    };
}

async function category(inReq) {
    let id = `${site}${inReq.body.id}`;
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    let url = `${site}${inReq.body.id}page/${page}/`;
    const $ = load(await request(`${url}`));
    return { page, pagecount: 9999999, list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const html = await request(id);
    const $ = load(html);
    const code = unpackDetail(html);
    const groups = new Map();
    for (const m of code.matchAll(/var (e(\d+)s(\d+))='<iframe[^']*src="(https?:\/\/[^"]+)"/g)) {
        const episode = m[2];
        const server = m[3];
        const url = m[4];
        const name = $(`#e${episode} span.e${episode}s${server}`).text().trim()
            || $(`#e1 span.e1s${server}`).text().trim()
            || `线路${server}`;
        const label = $(`#episode span.e${episode}s1`).text().trim() || episode;
        if (!groups.has(name)) groups.set(name, []);
        const item = `${label}$${url}`;
        if (!groups.get(name).includes(item)) groups.get(name).push(item);
    }
    const vod_play_from = [];
    const vod_play_url = [];
    for (const [name, urls] of groups) {
        vod_play_from.push(name);
        vod_play_url.push(urls.join('#'));
    }
    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim(),
            vod_pic: $('meta[property="og:image"]').attr('content') || $('#iframe img').attr('src') || '',
            vod_content: $('meta[property="og:description"]').attr('content') || '',
            vod_play_from: vod_play_from.join('$$$'),
            vod_play_url: vod_play_url.join('$$$'),
        }],
    };
}

async function play(inReq) {
    const page = String(inReq.body.id || '').trim();
    const referer = page || `${site}/`;
    if (/streamtape\.com/i.test(page)) {
        const html = await request(page, page);
        const link = streamtapeLink(html);
        let url = link || page;
        if (link) {
            const resp = await axios.get(link, {
                headers: { 'User-Agent': UA, Referer: 'https://streamtape.com/', Range: 'bytes=0-1' },
                // httpsAgent: agent,
                timeout: 20000,
                maxRedirects: 5,
                responseType: 'stream',
                validateStatus: () => true,
            });
            const loc = resp.request?.res?.responseUrl || resp.headers?.location;
            resp.data?.destroy?.();
            if (loc && loc !== link) url = loc;
        }
        return { parse: 0, url, header: { 'User-Agent': UA, Referer: 'https://streamtape.com/' } };
    }
    const html = await request(page, referer);
    let media = mediaFromHtml(html);
    if (media) {
        if (!media.startsWith('http')) media = new URL(media, page).href;
        media = await pickBestM3u8(media, page);
        return { parse: 0, url: media, header: { 'User-Agent': UA, Referer: new URL(page).origin + '/' } };
    }
    return { parse: 0, url: page, header: { 'User-Agent': UA, Referer: referer } };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search?keyword=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'javmix', name: '🌸JavMix', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
