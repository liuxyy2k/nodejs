import { load } from 'cheerio';
import req from '../../util/req.js';
import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const site = 'https://eactandand.aibyq.cc';

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const headers = {
    'User-Agent': UA,
    Referer: `${site}/`,
};
async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: headers,
        // httpsAgent: agent
    });
    return resp.data;
}

function parseVods($) {
    const list = [];
    $('.vod-card').each((_, el) => {
        list.push({
            vod_id: $(el).find('a').eq(0).attr('href') || '',
            vod_name: $(el).find('.vod-name').text().trim() || '',
            vod_pic: $(el).find('img').attr('src') ||'',
            vod_remarks: $(el).find('.vod-remarks').text().trim() ||'',
        });
    });
    return list;
}

async function init() {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
            { type_id: '/aidj/AIchengrenduanju/', type_name: 'AI成人短剧' },
            { type_id: '/aidj/AIchengrenmanju/', type_name: 'AI成人漫剧' },
            { type_id: '/aidj/AIhuanlian/', type_name: 'AI换脸' },
            { type_id: '/aidj/AImogai/', type_name: 'AI魔改' }
    ];
    return { class: classes, filters: {} };
}

async function category(inReq) {
    let url = `${site}${inReq.body.id}page/${inReq.body.page || inReq.body.pg || 1}/`;
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(`${url}`));
    return { page, pagecount: 9999999, list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const $ = load(await request(`${site}${id}`));
    const currentUrl = `${site}${id}`;
    const playList = [];
    $('.episodes a').each((_, el) => {
        const name = $(el).text().trim();
        const url = $(el).attr('href');
        if (name && url) {
            playList.push(`${name}$${url}`);
        }
    });
    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content') || '',
            vod_pic: $('meta[property="og:image"]').attr('content') || '',
            vod_content: $('meta[property="og:description"]').attr('content') || '',
            vod_play_from: 'AI不花钱',
            vod_play_url: playList.join('#'),
        }],
    };
}

async function play(inReq) {
    const id = inReq.body.id;
    const html = await request(`${site}${id}`)
    let playerData = {};
    let m3u8 = '';
    if (html) {
        const match = html.match(
            /var\s+player_data\s*=\s*(\{[\s\S]*?\})\s*;?/
        );
        if (match) {
            playerData = JSON.parse(match[1]);
            //https://eactandand.aibyq.cc/huangguo.php?ac=play&id=8319&ep=2&_=1791685324692
            const playUrl = `${site}/huangguo.php?ac=play&id=${playerData.url.split('|')[0]}&ep=${playerData.url.split('|')[1]}&_=${Date.now()}`;
            console.log('playUrl:', playUrl);
            const playData = await axios.get(playUrl, {
                headers: {
                    'User-Agent': UA,
                    Referer: `https://eactandand.aibyq.cc/static/player/huangguo.html?url=${playerData.url}`,
                },
                // httpsAgent: agent
            });
            console.log('playData:', playData.data);
            m3u8 = playData.data.url;
        }
    }
    return { parse: 0, url: m3u8, header: { 'User-Agent': UA, Referer: `https://eactandand.aibyq.cc/static/player/huangguo.html?url=${playerData.url}` } };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search?q=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'aiduanju', name: '📖AI不花钱', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
