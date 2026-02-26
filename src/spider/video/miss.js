import req from '../../util/req.js';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://missav.ws';

async function request(reqUrl) {
    const resp = await req.get(reqUrl, {
        headers: {
            'User-Agent': UA,
        },
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let classes = [
        { type_id: 'dm265/cn/chinese-subtitle', type_name: '中文字幕' },
        { type_id: 'dm513/cn/new', type_name: '最近更新' },
        { type_id: 'dm509/cn/release', type_name: '新作上市' },
        { type_id: 'dm561/cn/uncensored-leak', type_name: '无码流出' },
        { type_id: 'dm168/cn/weekly-hot', type_name: '本週热门' },
        { type_id: 'dm207/cn/monthly-hot', type_name: '本月热门' },
        { type_id: 'dm95/cn/fc2', type_name: 'FC2' },
        { type_id: 'dm34/cn/madou', type_name: '麻豆传媒' },
    ];
    return {
        class: classes,
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = inReq.body.page;
    let page = pg || 1;
    if (page == 0) page = 1;

    const url = `${site}/${tid}?page=${page}`;
    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.thumbnail').each((_, e) => {
        const href = $(e).find('.text-secondary').attr('href');
        const name = $(e).find('.text-secondary').text().trim().replace(/\s+/g, ' ');
        const pic = $(e).find('.w-full').attr('data-src');
        const remarks = $(e).find('.left-1').text().trim();
        const duration = $(e).find('.right-1').text().trim();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: name,
                vod_pic: pic,
                vod_remarks: remarks + (duration ? ` ${duration}` : ''),
            });
        }
    });

    return {
        page: parseInt(page),
        list: videos,
    };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(id);
    const $ = load(html);

    const title = $('h1').first().text().trim();
    const pic = $('video').attr('poster') || '';

    // 解析 m3u8
    const m3u8Prefix = 'https://surrit.com/';
    const m3u8Suffix = '/playlist.m3u8';
    const match = html.match(/nineyu\.com\\\/(.+)\\\/seek\\\/_0\.jpg/);

    let vod_play_from = '默认';
    let vod_play_url = '';

    if (match && match[1]) {
        const uuid = match[1];
        const m3u8Url = `${m3u8Prefix}${uuid}${m3u8Suffix}`;
        try {
            const m3u8Data = await request(m3u8Url);
            const lines = m3u8Data.split('\n');
            const qualityLines = lines.filter(line => line.includes('/video.m3u8'));
            if (qualityLines.length > 0) {
                const episodes = qualityLines.map(line => {
                    const name = line.replace('/video.m3u8', '');
                    const url = `${m3u8Prefix}${uuid}/${line}`;
                    return `${name}$${url}`;
                });
                episodes.push(`自动$${m3u8Url}`);
                vod_play_url = episodes.join('#');
            } else {
                vod_play_url = `自动$${m3u8Url}`;
            }
        } catch (e) {
            vod_play_url = '';
        }
    }

    return {
        list: [
            {
                vod_id: id,
                vod_name: title,
                vod_pic: pic,
                vod_play_from,
                vod_play_url,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const flag = inReq.body.flag;
    const id = inReq.body.id;
    return {
        parse: 0,
        url: id,
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/cn/search/${text}?page=${page}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.thumbnail').each((_, e) => {
        const href = $(e).find('.text-secondary').attr('href');
        const name = $(e).find('.text-secondary').text().trim().replace(/\s+/g, ' ');
        const pic = $(e).find('.w-full').attr('data-src');
        const remarks = $(e).find('.left-1').text().trim();
        const duration = $(e).find('.right-1').text().trim();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: name,
                vod_pic: pic,
                vod_remarks: remarks + (duration ? ` ${duration}` : ''),
            });
        }
    });

    return {
        list: videos,
    };
}

export default {
    meta: {
        key: 'missav',
        name: 'MissAV',
        type: 3,
        indexs: 1,
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