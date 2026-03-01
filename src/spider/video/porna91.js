import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://91porna.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
    });
    return resp.data;
}

function parseVods($) {
    const videos = [];
    $('li div.video-item a').each((_, element) => {
        const pic = $(element).find('img').attr('data-src') || '';
        const url = $(element).attr('href') || '';
        const name = $(element).find('img').attr('alt') || '';
        const time = $(element).find('div.text-sm').text().trim();
        if (pic.endsWith('.gif') || !name) return;
        const id = url.split('=')[1] || '';
        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: time,
        });
    });
    return videos;
}

function toBase(num, radix) {
    if (num < radix) {
        if (num < 10) return String(num);
        if (num < 36) return String.fromCharCode('a'.charCodeAt(0) + num - 10);
        return String.fromCharCode('A'.charCodeAt(0) + num - 36);
    }
    return toBase(Math.floor(num / radix), radix) + toBase(num % radix, radix);
}

function unpack(packed) {
    const match = packed.match(/\}\('(.*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\)/s);
    if (!match) return '';

    let payload = match[1];
    const radix = parseInt(match[2]);
    const count = parseInt(match[3]);
    const keywords = match[4].split('|');

    for (let i = count - 1; i >= 0; i--) {
        const word = (i < keywords.length && keywords[i]) ? keywords[i] : toBase(i, radix);
        const key = toBase(i, radix);
        payload = payload.replace(new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), word);
    }

    payload = payload.replace(/\\\//g, '/');
    payload = payload.replace(/\\u003e/g, '>');
    payload = payload.replace(/\\u003c/g, '<');
    payload = payload.replace(/\\"/g, '"');

    return payload;
}

function unpackUrl(source) {
    const match = source.match(/\}\('(.*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\)/s);
    if (!match) return '';

    let payload = match[1];
    const radix = parseInt(match[2]);
    const count = parseInt(match[3]);
    const keywords = match[4].split('|');

    for (let i = count - 1; i >= 0; i--) {
        if (i >= keywords.length || !keywords[i]) continue;
        const word = keywords[i];
        const key = toBase(i, radix);
        payload = payload.replace(new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), word);
    }

    payload = payload.replace(/\\'/g, "'");
    payload = payload.replace(/\\\\/g, '');

    return payload;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'now_hot', type_name: '当前最热' },
        { type_id: 'new_update', type_name: '最近更新' },
        { type_id: 'original', type_name: '91原创' },
        { type_id: 'now_month_hot', type_name: '本月最热' },
        { type_id: 'ten_minutes', type_name: '10分钟以上' },
    ];

    const html = await request(`${site}/comic/index/video?category=play`);
    const $ = load(html);
    const list = parseVods($);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    let url = `${site}/comic/index/video?category=${tid}`;
    if (page > 1) url += `&page=${page}`;

    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(`${site}/comic/index/detail?video_key=${id}`);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';

    let playUrl = '';
    const scriptEl = $('div.player-container script').first();
    const obfuscated = scriptEl.length ? scriptEl.html() || '' : '';

    if (obfuscated) {
        const unpacked = unpack(obfuscated);

        const imgMatch = unpacked.match(/img=([^&]+)/);
        const img = imgMatch ? imgMatch[1] : '';

        const uMatch = unpacked.match(/encodeURIComponent\("([^"]+)"\)/);
        const uRaw = uMatch ? uMatch[1] : '';

        const t = Math.floor(Math.floor(Date.now() / 1000) / 1800);
        const uEncoded = encodeURIComponent(uRaw);

        const jsUrl = `${site}/index/detail_play.js?id=${id}&img=${img}&ads=https%3A%2F%2Fphtstcw.xyz&u=${uEncoded}&t=${t}`;
        const jsContent = await request(jsUrl);

        const unpacked2 = unpackUrl(jsContent);
        const m3u8Match = unpacked2.match(/data-url="([^"]+)"/);
        if (m3u8Match) {
            playUrl = m3u8Match[1];
        }
    }

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: 'Porna',
            vod_play_url: '播放$' + playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const html = await request(`${site}/search?keywords=${text}`);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'porna91',
        name: '91Porna',
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