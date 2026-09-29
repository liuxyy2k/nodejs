import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://airav.io';

function buildListUrl(tid, page) {
    const url = new URL(String(tid || '/list?sort=2').trim(), site);
    if (page > 1) url.searchParams.set('idx', String(page));
    else url.searchParams.delete('idx');
    return url.href;
}

function parsePageCount($, page) {
    const max = parseInt($('input[name=idx]').attr('max') || '0', 10);
    if (max > 0) return max;
    const m = ($('.page-btn a[href*="idx="]').attr('href') || '').match(/[?&]idx=(\d+)/);
    return m ? parseInt(m[1], 10) : page;
}

async function request(url, referer = '') {
    const resp = await req.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: referer || `${site}/`,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            Connection: 'keep-alive',
        },
    });
    return resp.data;
}

function parseVods($) {
    const list = [];
    $('.oneVideo').each((_, el) => {
        list.push({
            vod_id: $(el).find('a').eq(0).attr('href') || '',
            vod_name: $(el).find('h5').text().trim() || '',
            vod_pic: $(el).find('.card-img-top').attr('src') || '',
            vod_remarks: $(el).find('.fa-eye').text().trim() || '',
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
            { type_id: '/list?sort=3', type_name: '今日热门' },
            { type_id: '/list?sort=4', type_name: '本周热门' },
            { type_id: '/list?sort=5', type_name: '本月热门' },
            { type_id: '/list?sort=2', type_name: '最新发行' },
            { type_id: '/list?sort=1', type_name: '最近加入' },
            { type_id: '/list?sort=6', type_name: '总浏览数' },
            { type_id: '/tag?id=81', type_name: 'VR' },
            { type_id: '/tag?id=2479', type_name: '国产' },
            { type_id: '/tag?id=58', type_name: '中文' },
            { type_id: '/tag?id=33', type_name: '潮吹' },
            { type_id: '/tag?id=23', type_name: '美腿' },
            { type_id: '/tag?id=6', type_name: 'HD' },
            { type_id: '/tag?id=9', type_name: '人妻' },
            { type_id: '/tag?id=14', type_name: '无码' },
            { type_id: '/tag?id=39', type_name: '素人' },
            { type_id: '/posts', type_name: 'AV影评' },
        ],
        filters: {},
    };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(buildListUrl(inReq.body.id, page)));
    return { page, pagecount: parsePageCount($, page), list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const $ = load(await request(id.startsWith('http') ? id : `${site}${id}`));
    let playUrl = '';
    try {
        playUrl = JSON.parse($('script[type="application/ld+json"]').text().trim() || '{}').contentUrl || '';
    } catch {}
    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content') || '',
            vod_pic: $('meta[property="og:image"]').attr('content') || '',
            vod_content: $('meta[property="og:description"]').attr('content') || '',
            vod_play_from: 'airav',
            vod_play_url: playUrl ? `正片$${playUrl}` : '',
        }],
    };
}

async function play(inReq) {
    return { parse: 0, url: inReq.body.id, header: { 'User-Agent': UA, Referer: `${site}/` } };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search_result?kw=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'airav', name: '🌸Airav', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
