import axios from 'axios';
import { load } from 'cheerio';
// import initCycleTLS from 'cycletls';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://missav.app';
const PROXY = process.env.HTTP_PROXY || null;
let cycleTLS = null; 
async function getCycleTLS() {
    if (!cycleTLS) cycleTLS = await initCycleTLS();
    return cycleTLS;
}

async function request(reqUrl) {
    const tls = await getCycleTLS();
    const resp = await tls(reqUrl, {
        ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,45-13-43-0-16-65281-51-18-11-27-35-23-10-5-17513-21,29-23-24,0',
        userAgent: UA,
        headers: {
            'Referer': 'https://missav123.com/',
        },
        proxy: PROXY || '',
    }, 'get');
    return resp.body;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/label/new/',               type_name: '最近更新' },
        { type_id: '/vodtype/28/',              type_name: '中文字幕' },
        { type_id: 'dm509/cn/release',          type_name: '新作上市' },
        { type_id: 'dm561/cn/uncensored-leak',  type_name: '无码流出' },
        { type_id: 'dm168/cn/weekly-hot',       type_name: '本週热门' },
        { type_id: 'dm207/cn/monthly-hot',      type_name: '本月热门' },
        { type_id: 'dm95/cn/fc2',               type_name: 'FC2' },
        { type_id: 'dm34/cn/madou',             type_name: '麻豆传媒' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const id = inReq.body.id;
    const page = inReq.body.page || 1;
    const url = `${site}/${id}?page=${page}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.thumbnail').each((_, e) => {
        const href = $(e).find('.text-secondary').attr('href');
        const title = $(e).find('.text-secondary').text().trim().replace(/\s+/g, ' ');
        const cover = $(e).find('.w-full').attr('data-src');
        const remarks = $(e).find('.left-1').text().trim();
        const duration = $(e).find('.right-1').text().trim();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: remarks,
            });
        }
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);

    const m3u8Prefix = 'https://surrit.com/';
    const m3u8Suffix = '/playlist.m3u8';

    let tracks = [];
    const match = html.match(/nineyu\.com\\\/(.+)\\\/seek\\\/_0\.jpg/);
    if (match && match[1]) {
        const uuid = match[1];
        const playlist = await request(m3u8Prefix + uuid + m3u8Suffix);
        const lines = playlist.split('\n');
        const matches = lines.filter(line => line.includes('/video.m3u8'));
        matches.forEach(m => {
            const name = m.replace('/video.m3u8', '');
            tracks.unshift(`${name}$${m3u8Prefix}${uuid}/${m}`);
        });
        tracks.push(`自动$${m3u8Prefix}${uuid}${m3u8Suffix}`);
    }

    const $ = load(html);
    const title = $('h1').first().text().trim();
    const pic = $('meta[property="og:image"]').attr('content') || '';

    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_play_from: '默认',
            vod_play_url: tracks.join('#'),
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
    const page = inReq.body.pg || 1;
    const url = `${site}/cn/search/${text}?page=${page}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.thumbnail').each((_, e) => {
        const href = $(e).find('.text-secondary').attr('href');
        const title = $(e).find('.text-secondary').text().trim().replace(/\s+/g, ' ');
        const cover = $(e).find('.w-full').attr('data-src');
        const remarks = $(e).find('.left-1').text().trim();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: remarks,
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: 'missav',
        name: 'MissAV',
        type: 3
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