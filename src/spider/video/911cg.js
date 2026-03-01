import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const site = 'https://armed.spijkta.xyz';

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
    });
    return resp.data;
}

async function loadBackgroundImage(imageUrl) {
    try {
        const resp = await axios.get(imageUrl, {
            headers: { 'User-Agent': UA },
            responseType: 'arraybuffer',
        });
        const base64 = Buffer.from(resp.data).toString('base64');
        const mime = resp.headers['content-type'] || 'image/jpeg';
        return `data:${mime};base64,${base64}`;
    } catch (e) {
        return imageUrl;
    }
}

async function parseVods($) {
    const items = [];

    $('article').each((_, element) => {
        const scriptText = $(element).find('script').toString();
        const match = scriptText.match(/'(https?:\/\/[^']+)/);
        const imageUrl = match ? match[1] : '';
        const url = $(element).find('a').attr('href') || '';
        const name = $(element).find('.post-card-title').text().trim();
        const id = url.split('/').filter(Boolean).pop() || '';
        if (name && url) {
            items.push({ id, name, imageUrl });
        }
    });

    const pics = await Promise.all(items.map(item =>
        item.imageUrl ? loadBackgroundImage(item.imageUrl) : Promise.resolve('')
    ));

    return items.map((item, i) => ({
        vod_id: item.id,
        vod_name: item.name,
        vod_pic: pics[i] || '',
    }));
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'jrgb',  type_name: '今日大瓜' },
        { type_id: 'rmgb',  type_name: '精选大瓜' },
        { type_id: 'blqw',  type_name: '猎奇吃瓜' },
        { type_id: 'rlph',  type_name: '每日排行' },
        { type_id: 'ssdbl', type_name: '热点吃瓜' },
        { type_id: 'xyss',  type_name: '校园吃瓜' },
        { type_id: 'whbl',  type_name: '网红黑料' },
        { type_id: 'thjx',  type_name: '探花经典' },
        { type_id: 'tksm',  type_name: '偷窥泄密' },
        { type_id: 'bgzq',  type_name: '反差爆料' },
    ];

    const html = await request(site);
    const $ = load(html);
    const list = await parseVods($);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const html = await request(`${site}/category/${tid}/${page}/`);
    const $ = load(html);
    const list = await parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(`${site}/archives/${id}`);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';

    const playParts = [];
    let index = 1;
    $('div.dplayer').each((_, element) => {
        try {
            const config = JSON.parse($(element).attr('data-config') || '{}');
            const videoUrl = config?.video?.url || '';
            if (videoUrl) {
                playParts.push(`第${index}集$${videoUrl}`);
                index++;
            }
        } catch (e) {}
    });

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: 'Cg911',
            vod_play_url: playParts.join('#'),
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
    const list = await parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'chig911',
        name: '911吃瓜',
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