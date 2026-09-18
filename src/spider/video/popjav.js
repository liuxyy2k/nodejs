import axios from 'axios';
import { load } from 'cheerio';

import { HttpsProxyAgent } from 'https-proxy-agent';
// // 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://popjav.in';

async function request(url) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA },
    });
    return resp.data;
}

const PACKER_FN = String.raw`function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)`;
const PACKED_EVAL_RE = new RegExp(
    String.raw`eval\(${PACKER_FN}[\s\S]+?}\(\s*'[\s\S]+',\s*\d+,\s*\d+,\s*'[\s\S]+?'\.split\('\|'\)\s*\)+`
);

function parsePackerArgs(code) {
    const patterns = [
        /}\(\s*'([\s\S]+)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/,
        /}\(\s*'([\s\S]+)',\s*(\d+),\s*(\d+),\s*"([\s\S]*?)"\.split\('\|'\)/,
        /}\(\s*"([\s\S]+)",\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/,
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
        payload = payload.replace(new RegExp('\\b' + i.toString(base) + '\\b', 'g'), dict[i]);
    }
    return payload;
}

function extractStreamUrl(unpacked) {
    if (!unpacked) return '';
    for (const key of ['hls2', 'hls3', 'hls4']) {
        const m = unpacked.match(new RegExp(`["']${key}["']\\s*:\\s*["']([^"']+)["']`));
        if (m?.[1]) return m[1];
    }
    return '';
}

function parseCards($) {
    const list = [];
    $('.post-list a').each((_, element) => {
        const href     = $(element).attr('href') || '';
        const title    = $(element).find('img').attr('alt') || '';
        const cover    = $(element).find('img').attr('src') || '';
        const remark    = $(element).find('.post-list-time').text() || '';
        if (!href || !title) return;
        list.push({ vod_id: href, vod_name: title, vod_pic: cover,vod_remarks: remark });
    });
    return list;
}



async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/censored/',         type_name: '有码'},
        { type_id: '/uncensored/',       type_name: '无码'},
        { type_id: '/amature/',          type_name: '素人'},
        { type_id: '/fc2ppv/',           type_name: 'FC2'},
        { type_id: '/vr/',               type_name: 'VR'},
        { type_id: '/trend/',            type_name: '热度' },
        { type_id: '/popularity/',       type_name: '人气' },
        { type_id: '/uncensored',        type_name: '无码' }
    ];
    return { class: classes, filters: {}};
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    const url = `${site}${tid}page/${page}/`
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    const html = await request(href);
    const $    = load(html);

    const name = $('#player-width h1').text().trim() || '';
    const des  = $('#post-content').text() || '';
    let pic  = $('#iframe img').attr('src') || '';
    let vod_play_from = '';
    let vod_play_url = '';
    const reg = /<script>\s*eval\(function\(p,a,c,k,e,d\)[\s\S]*?\)\)\s*<\/script>/;
    const match = html.match(reg);
    if (match) {
        const js = match[0].replace(/<script>\s*/i, '').replace(/\s*<\/script>/i, '');
        const unpacked = eval(js.replace('eval', ''));
        const urls = [...new Set(
            [...unpacked.matchAll(/https?:\/\/[^"' ]+\/[ev]\/[a-z0-9]+/gi)]
                .map((v) => v[0]),
        )];

        const fromArr = [];
        const urlArr = [];

        urls.forEach((url, index) => {
            fromArr.push(`线路${index + 1}`);
            urlArr.push(`播放$${url}`);
        });

        vod_play_from = fromArr.join('$$$');
        vod_play_url = urlArr.join('$$$');
    }
    return {
        list: [{
            vod_id:        href,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: vod_play_from,
            vod_play_url:  vod_play_url,
            vod_content: des
        }],
    };
}

async function play(inReq, _outResp) {
    const url = inReq.body.id;
    let playUrl = ''
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA, Referer: site + '/' },
    });
    const match2 = String(resp.data || '').match(PACKED_EVAL_RE);
    if (match2) {
        const unpacked = unpackPacker(match2[0]);
        playUrl = extractStreamUrl(unpacked);
    }
    if (!playUrl) {
        return { parse: 0, url: '', header: { 'User-Agent': UA, Referer: url } };
    }

    const domain = 'https://' + new URL(url).hostname;
    let m3u8 = playUrl.startsWith('http') ? playUrl : domain + playUrl;

    let newUrl = m3u8;
    try {
        const resm3U8 = await axios.get(m3u8, {
            headers: {
                'User-Agent': UA,
                Referer: url,
            },
            validateStatus: () => true,
        });
        const text = String(resm3U8.data || '');
        if (text.includes('#EXT-X-STREAM-INF')) {
            const lines = text.split('\n');
            let best = { height: 0, url: '' };
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes('#EXT-X-STREAM-INF')) {
                    const m = line.match(/RESOLUTION=\d+x(\d+)/);
                    if (m) {
                        const height = parseInt(m[1], 10);
                        const streamUrl = lines[i + 1]?.trim();
                        if (streamUrl && height > best.height) {
                            best.height = height;
                            best.url = streamUrl;
                        }
                    }
                }
            }
            if (best.url) {
                newUrl = best.url.startsWith('http')
                    ? best.url
                    : m3u8.replace(/[^/?#]+\.m3u8(\?.*)?$/, best.url);
            }
        }
    } catch (e) {
        console.log('[popjav] master parse fail:', e.message);
    }
     return {
        parse: 0,
        url: newUrl,
        header: { 'User-Agent': UA,
                'Referer': url
         },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;
    const html = await request(`${site}/search?q=${text}`);
    const $    = load(html);
    const list = parseCards($);
    return { list };
}

export default {
    meta: {
        key: 'popJav',
        name: '🔥PopJav',
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