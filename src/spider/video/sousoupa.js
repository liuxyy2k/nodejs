import axios from 'axios';
import { load } from 'cheerio';


const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://www.sosopa.com';

async function ensureCookie() {
    if (headers['Cookie']) return;
    try {
        const resp = await axios.get(site + '/', { headers, maxRedirects: 5 });
        const setCookie = resp.headers['set-cookie'];
        if (setCookie && setCookie[0]) {
            headers['Cookie'] = setCookie[0].split(';')[0];
        }
    } catch (e) {
        const setCookie = e.response?.headers?.['set-cookie'];
        if (setCookie && setCookie[0]) {
            headers['Cookie'] = setCookie[0].split(';')[0];
        }
    }
}

const headers = {
    'Referer':  site + '/',
    'Origin':   site,
    'User-Agent': UA,
};

async function request(reqUrl, headers = {}) {
    await ensureCookie();
    const resp = await axios.get(reqUrl, {
        headers: headers
    });
    return resp.data;
}

function parseVods($) {
    const videos = [];
    $('.thumbnail').each((_, element) => {
        try {
            const pic = $(element).find('.lozad').attr('data-src') || '';
            const id = $(element).find('a').eq(0).attr('href') || '';
            const name = $(element).find('.text-secondary').text() || '';
            const remark = $(element).find('.absolute').text() || '';
            if (!id || !name) return;
            videos.push({
                vod_id: id,
                vod_name: name,
                vod_pic: pic,
                vod_remarks: remark
            });
        } catch (e) {}
    });
    return videos;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        {
            type_id: '/',
            type_name: '首页'
        }
    ];
    const html = await request(site);
    const $ = load(html);

    $('.text-nord0').each((_, element) => {
        try {
            const typeId = $(element).attr('href') || '';
            const typeName = $(element).text().trim();
            if(typeName === '在线客服') return
            if (typeId && typeName) {
                classes.push({ type_id: typeId, type_name: typeName });
            }
        } catch (e) {}
    });

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    let url = `${site}${tid}`;
    if(page > 1) {
        url = `${site}${tid.replace('.html','')}/page/${page}.html`
    }
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = `${site}${id}`;
    const html = await request(url);
    const $ = load(html);

    let name = $('meta[name="keywords"]').attr('content') || '';
    const des = $('meta[name="description"]').attr('content') || '';
    let pic = '';
    let playUrl = '';
    // 提取 JSON
    const match = html.match(/player_aaaa\s*=\s*(\{.*\})/);
    if (match) {
        const json = JSON.parse(match[1]);
        name = json.vod_data.vod_name
        pic = json.poster
        playUrl = json.url
    }

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: '搜搜啪',
            vod_content: des,
            vod_play_url: '播放$' + playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA,'Origin': site },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const url = `${site}/index.php/vod/search.html?wd=${text}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'ssp',
        name: '🌸搜搜啪',
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