import { load } from 'cheerio';
import req from '../../util/req.js';
import axios from 'axios';  
import { config } from './config.js';

const FLARE_URL = config.FLARE_URL;

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://avporner.com';

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
        'Origin': site,
        'Content-Type': 'application/x-www-form-urlencoded',
    };
    // 走 req.js：自动带上 cookie.json 里的 Cookie，并保存响应 Set-Cookie
    const resp = await req.get(targetUrl, { headers });
    return resp.data;
}

function parseVods($) {
    const list = [];
    $('.video-wrapper').each((_, el) => {
        list.push({
            vod_id: $(el).find('a').eq(0).attr('href') || '',
            vod_name: $(el).find('h4').text().trim() || '',
            vod_pic: $(el).find('img').attr('src') || '',
            vod_remarks: $(el).find('.material-icons').text().trim() || '',
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
            // { type_id: '', type_name: '全部' },
            { type_id: '/videos/latest', type_name: '最新发行' },
            { type_id: '/videos/trending', type_name: '热门话题' },
            { type_id: '/videos/top', type_name: '热门视频' },
            { type_id: '/videos/category/Uncensored', type_name: '无码' },
            { type_id: '/videos/category/Japanese', type_name: '日本人  ' },
            { type_id: '/videos/category/Chinese', type_name: '中国人' },
            { type_id: '/videos/category/Korean', type_name: '韩国人' },
            { type_id: '/videos/category/Creampie', type_name: '奶油派' },
            { type_id: '/videos/category/MILF', type_name: '熟女' },
            { type_id: '/videos/category/Big%20Tits', type_name: '大胸' },
            { type_id: '/videos/category/Incest', type_name: '乱伦' },
            { type_id: '/videos/category/Cam', type_name: 'Cam' },
            { type_id: '/videos/category/Other', type_name: '其他' }
        ],
        filters: {},
    };
}

async function category(inReq) {
    let url = `${site}${inReq.body.id}`;
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(`${url}?page_id=${page}`, `${url}`));
    return { page, pagecount: 9999999, list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const $ = load(await request(id));
    let playUrl = '';

    try {
        $('script[type="application/ld+json"]').each((i, el) => {
            if (playUrl) return;
    
            const jsonLd = $(el).text().trim();
    
            const match = jsonLd.match(/"contentUrl"\s*:\s*"([^"]+)"/);
    
            if (match) {
                playUrl = match[1];
            }
        });
    } catch (e) {
        console.log('JSON-LD 解析失败:', e.message);
    }

    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content') || '',
            vod_pic: $('meta[property="og:image"]').attr('content') || '',
            vod_content: $('meta[property="og:description"]').attr('content') || '',
            vod_play_from: 'avporner',
            vod_play_url: playUrl ? `正片$${playUrl}` : '',
        }],
    };
}

async function play(inReq) {
    return { parse: 0, url: inReq.body.id, header: { 'User-Agent': UA, Referer: `${site}/` } };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search?keyword=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'avporner', name: '🌸Avporner', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
