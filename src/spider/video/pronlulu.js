import axios from 'axios';
import { load } from 'cheerio';

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const site = 'https://www.pornlulu.com';
const cateUrl = site + '/cat/';
const detailUrl = site + '/v/';
const searchUrl = site + '/search?keywords=';

async function request(url) {
    const resp = await axios.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': site,
        },
        timeout: 10000,
    });
    return resp.data;
}

function fixUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return site + url;
}

/* ================== 首页 ================== */
async function home() {
    const html = await request(site);
    const $ = load(html);

    let classes = [];

    $('ul#w4 li.nav-item a').each((_, el) => {
        const link = $(el).attr('href');
        const name = $(el).find('p').text().trim();

        if (!link || !name) return;

        const tid = link.replace(/\/+$/, '').split('/').pop();

        classes.push({
            type_id: tid,
            type_name: name,
        });
    });

    return {
        class: classes,
        filters: {},
    };
}

/* ================== 分类 ================== */
async function category(inReq) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page || 1);

    let url = cateUrl + tid;
    if (page > 1) {
        url += '?page=' + page;
    }

    const html = await request(url);
    const $ = load(html);

    let videos = [];

    $('div.card a.visited').each((_, el) => {
        const href = $(el).attr('href');
        const name = $(el).find('img').attr('alt');
        let pic = $(el).find('img').attr('src');

        if (!href || !name || !pic || pic.endsWith('.gif')) return;

        const id = href.replace(/\/+$/, '').split('/').pop();
        pic = fixUrl(pic);

        videos.push({
            vod_id: id,
            vod_name: name.trim(),
            vod_pic: pic,
        });
    });

    return {
        page: page,
        pagecount: page + 1,
        limit: 20,
        total: page * 20 + 20,
        list: videos,
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

        const name =
            $('meta[property="og:title"]').attr('content') ||
            $('title').text();

        const pic =
            $('meta[property="og:image"]').attr('content') || '';

        const year =
            $('meta[property="video:release_date"]').attr('content') || '';

        let playUrl = '';

        // 优先解析 ld+json
        const jsonScript = $('script[type="application/ld+json"]').html();

        if (jsonScript) {
            try {
                const obj = JSON.parse(jsonScript);
                if (obj.contentUrl) {
                    playUrl = obj.contentUrl.replace(/\\\//g, '/');
                }
            } catch (e) {}
        }

        // 兜底匹配 mp4
        if (!playUrl) {
            const match = html.match(/https?:\/\/[^"]+\.mp4[^"]*/);
            if (match) playUrl = match[0];
        }

        videos.push({
            vod_id: id,
            vod_name: name.trim(),
            vod_pic: pic,
            vod_year: year,
            vod_play_from: 'PronLu',
            vod_play_url: '播放$' + playUrl,
        });
    }

    return {
        list: videos,
    };
}

/* ================== 播放 ================== */
async function play(inReq) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: {
            'User-Agent': UA,
            'Referer': site,
        },
    };
}

/* ================== 搜索 ================== */
async function search(inReq) {
    const wd = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;

    const html = await request(searchUrl + wd + '&page=' + page);
    const $ = load(html);

    let videos = [];

    $('div.card a.visited').each((_, el) => {
        const href = $(el).attr('href');
        const name = $(el).find('img').attr('alt');
        let pic = $(el).find('img').attr('src');

        if (!href || !name || !pic || pic.endsWith('.gif')) return;

        const id = href.replace(/\/+$/, '').split('/').pop();
        pic = fixUrl(pic);

        videos.push({
            vod_id: id,
            vod_name: name.trim(),
            vod_pic: pic,
        });
    });

    return {
        list: videos,
    };
}

export default {
    meta: {
        key: 'pornlulu',
        name: 'PronLulu',
        type: 3
    },
    api: async (fastify) => {
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};