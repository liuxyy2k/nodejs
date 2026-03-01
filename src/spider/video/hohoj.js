import axios from 'axios';
import { load } from 'cheerio';

const site = 'https://hohoj.tv';
const cateUrl = site + '/search';
const detailUrl = site + '/video?id=';
const searchUrl = site + '/search?type=';

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36';

async function request(url) {
    const resp = await axios.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': 'https://hohoj.tv/'
        }
    });
    return resp.data;
}

/* ================== 首页 ================== */
async function home() {
    let classes = [];
    let list = [];

    const typeIdList = ["censored&order=latest", "uncensored", "chinese", "europe"];
    const typeNameList = [" 最新日本A片", "无码", "中文字幕", "欧美"];

    for (let i = 0; i < typeNameList.length; i++) {
        classes.push({
            type_id: typeIdList[i],
            type_name: typeNameList[i]
        });
    }

    const html = await request(site);
    const $ = load(html);

    $('div.video-item a').each((_, el) => {
        const pic = $(el).find('img').attr('src');
        const name = $(el).find('img').attr('alt');
        const url = $(el).attr('href');

        if (!pic || pic.endsWith('.gif') || !name) return;

        const id = url.split('=')[1];

        list.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic
        });
    });

    return {
        class: classes,
        list: list
    };
}

/* ================== 分类 ================== */
async function category(inReq) {
    const tid = inReq.body.id;
    const pg = inReq.body.page || 1;

    let target = searchUrl + tid;

    if (parseInt(pg) > 1) {
        target = target + '&p=' + pg;
    }

    const html = await request(target);
    const $ = load(html);

    let list = [];

    $('div.video-item a').each((_, el) => {
        const pic = $(el).find('img').attr('src');
        const name = $(el).find('img').attr('alt');
        const url = $(el).attr('href');

        if (!pic || pic.endsWith('.gif') || !name) return;

        const id = url.split('=')[1];

        list.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic
        });
    });

    return {
        page: parseInt(pg),
        list: list
    };
}

/* ================== 详情 ================== */
async function detail(inReq) {
    const ids = Array.isArray(inReq.body.id)
        ? inReq.body.id
        : [inReq.body.id];

    let videos = [];

    for (const id of ids) {
        const html = await request(detailUrl + id);
        const $ = load(html);

        const name = $('meta[property="og:title"]').attr('content');
        const pic = $('meta[property="og:image"]').attr('content');
        const year = $('div.ms-auto span').text();

        const embedUrl = site + '/embed?id=' + id;
        const embedHtml = await request(embedUrl);
        const $$ = load(embedHtml);

        const playUrl = $$('video#my-video').attr('src');

        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year ? year.replace('上市於 ', '') : '',
            vod_play_from: 'Hohoj',
            vod_play_url: '播放$' + playUrl
        });
    }

    return {
        list: videos
    };
}

/* ================== 播放 ================== */
async function play(inReq) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: {
            'User-Agent': UA,
            'Referer': 'https://hohoj.tv/'
        }
    };
}

/* ================== 搜索 ================== */
async function search(inReq) {
    const wd = encodeURIComponent(inReq.body.wd);

    const html = await request(searchUrl + wd + '/');
    const $ = load(html);

    let list = [];

    $('div.video-img-box').each((_, el) => {
        const pic = $(el).find('img').attr('data-src');
        const url = $(el).find('a').attr('href');
        const name = $(el).find('div.detail > h6').text();

        const id = url.split('/')[4];

        list.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic
        });
    });

    return {
        list: list
    };
}

export default {
    meta: {
        key: 'hhj',
        name: 'Hohoj',
        type: 3
    },
    api: async (fastify) => {
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    }
};