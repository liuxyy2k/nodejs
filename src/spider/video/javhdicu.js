import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const site = 'https://javhd.icu';
const embedHost = 'https://vidara.to';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, Referer: `${site}/`, ...headers },
        timeout: 25000,
    });
    return resp.data;
}

async function postJson(reqUrl, body, headers = {}) {
    const resp = await axios.post(reqUrl, body, {
        headers: {
            'User-Agent': UA,
            'Content-Type': 'application/json',
            Origin: embedHost,
            Referer: `${embedHost}/`,
            ...headers,
        },
        timeout: 25000,
    });
    return resp.data;
}

function parseVods($) {
    const videos = [];
    $('article').each((_, element) => {
        const $el = $(element);
        const $a = $el.find('div.item-img a').first();
        const url = $a.attr('href') || $el.find('h3.post-title a').attr('href') || '';
        const name = $el.find('h3.post-title').text().trim() || $el.find('img').attr('alt') || '';
        const pic = $el.find('div.item-img img').attr('src') || $el.find('img').attr('src') || '';
        const hit = url.match(/\/video\/([^/]+)\/?/);
        const id = (hit && hit[1]) || '';
        if (!id || !name) return;
        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
        });
    });
    return videos;
}

function parsePageCount($, page) {
    let pagecount = page;
    $('a[href]').each((_, element) => {
        const href = $(element).attr('href') || '';
        const match = href.match(/\/page\/(\d+)\/?/);
        if (!match) return;
        const n = parseInt(match[1]);
        if (n > pagecount) pagecount = n;
    });
    return pagecount;
}

/** 从详情页 iframe 里取 vidara 的 filecode */
function parseFilecode($) {
    let code = '';
    $('iframe[src]').each((_, element) => {
        const src = $(element).attr('src') || '';
        const hit = src.match(/vidara\.to\/e\/([A-Za-z0-9]+)/) || src.match(/gobsao\w*\.com\/e\/([A-Za-z0-9]+)/);
        if (hit && !code) code = hit[1];
    });
    return code;
}

/** POST /api/stream 换真实 m3u8 */
async function resolveStream(filecode) {
    if (!filecode) return '';
    try {
        const data = await postJson(`${embedHost}/api/stream`, {
            filecode,
            device: 'web',
            codecs: { av1: 'av01.0.09M.10', h265: 'hvc1.1.6.L123.B0' },
        });
        return (data && data.streaming_url) || '';
    } catch (e) {
        return '';
    }
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'censored', type_name: 'Censored' },
        { type_id: 'jav-hd-uncen', type_name: 'Uncensored' },
        { type_id: 'jav-hd-engsub', type_name: 'English Subtitles' },
        { type_id: 'jav-hd-uncensored-leaked', type_name: 'Uncensored Leaked' },
        { type_id: 'dahlia', type_name: 'Dahlia' },
        { type_id: 'moodyz', type_name: 'Moodyz' },
        { type_id: 'idea-pocket', type_name: 'IdeaPocket' },
        { type_id: 'attackers', type_name: 'Attackers' },
        { type_id: 'faleno-xxx', type_name: 'Faleno' },
        { type_id: 'mw-xxx', type_name: 'MW' },
        { type_id: 'maid', type_name: 'Maid' },
        { type_id: 'nurse', type_name: 'Nurse' },
        { type_id: 'amateur-xxxxxx', type_name: 'Amateur' },
        { type_id: 'jav-player-decensored', type_name: 'Decensored' },
        { type_id: 'javenglish', type_name: 'JAV English' },
        { type_id: 'javgg-xxx', type_name: 'JAVGG' },
        { type_id: 'supjav-porn-videos', type_name: 'Supjav' },
    ];

    const html = await request(site);
    const $ = load(html);
    const list = parseVods($);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    let url = `${site}/categories/${tid}/`;
    if (page > 1) {
        url = `${site}/categories/${tid}/page/${page}/`;
    }

    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: parsePageCount($, page), list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = `${site}/video/${id}/`;
    const html = await request(url);
    const $ = load(html);

    const name = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';

    const filecode = parseFilecode($);
    const streamUrl = await resolveStream(filecode);

    const playUrl = streamUrl ? `第1集$${streamUrl}` : '';

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: '',
            vod_play_from: 'JavHD',
            vod_play_url: playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    let url = id;

    // 传的是完整地址就直接用，传的是视频 slug 就现解析
    if (!/^https?:\/\//i.test(id) && id) {
        try {
            const html = await request(`${site}/video/${id}/`);
            const $ = load(html);
            url = await resolveStream(parseFilecode($));
        } catch (e) {
            url = '';
        }
    }

    return {
        parse: 0,
        url,
        header: { 'User-Agent': UA, Referer: `${site}/` },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const url = `${site}/?s=${text}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'javhdicu',
        name: '🌸JavHD·ICU',
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
