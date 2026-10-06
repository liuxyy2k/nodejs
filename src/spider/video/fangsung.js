import { load } from 'cheerio';
import req from '../../util/req.js';
import axios from 'axios';  
import { config } from './config.js';

const FLARE_URL = config.FLARE_URL;

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://www.fangsung.com';

// async function request(url) {
//     const resp = await axios.post(FLARE_URL, {
//         cmd: 'request.get',
//         url: url,
//         maxTimeout: 60000,
//     });
//     return resp.data.solution.response;
// }

async function request(targetUrl, referer = '') {
    const headers = {
        'User-Agent': UA,
        Referer: referer || `${site}/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
    };
    // 走 req.js：自动带上 cookie.json 里的 Cookie，并保存响应 Set-Cookie
    const resp = await req.get(targetUrl, { headers });
    return resp.data;
}

function parseVods($) {
    const list = [];
    $('div.row .col-md-3').each((_, el) => {
        list.push({
            vod_id: $(el).find('a').eq(0).attr('href') || '',
            vod_name: $(el).find('h5').text().trim() || '',
            vod_pic: $(el).find('img').attr('data-src') ||'',
            vod_remarks: 'Y2K',
        });
    });
    return list;
}

async function init() {
    return {};
}

async function home() {
    let classList = [];
    const html = await request(`${site}`);
    const $ = load(html);
    $('div.row').find('a').each((_, el) => {
        if($(el).attr('href') && $(el).find('h2').text().trim()) {
            classList.push({
                type_id: $(el).attr('href') || '',
                type_name: $(el).find('h2').text().trim() || '',
            });
        }
    });
    return { class: classList, filters: {} };
}

async function category(inReq) {
    let url = `${inReq.body.id}?page=${inReq.body.page || inReq.body.pg || 1}`;
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(`${url}`));
    return { page, pagecount: 9999999, list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const html = await request(`${id}`)
    const $ = load(html);
    const m3u8 = html.match(/https?:\/\/[^"'\\\s]+\.m3u8(?:\?[^"'\\\s]*)?/i)?.[0];
    

    return {
        list: [{
            vod_id: id,
            vod_name: $('head').find('title').text().trim() || '',
            vod_pic: '',
            vod_content: $('meta[name="description"]').attr('content') || '',
            vod_play_from: 'fangsung',
            vod_play_url: '播放$' + m3u8,
        }],
    };
}

async function play(inReq) {
    const id = inReq.body.id;
    return { parse: 0, url: id, header: { 'User-Agent': UA, Referer: `${site}/` } };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search?q=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'fangsung', name: '🌸Fangsung', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
