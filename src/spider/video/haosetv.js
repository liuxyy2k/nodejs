import axios from 'axios';
import { load } from 'cheerio';

const siteUrl = 'https://hsex.tv';
const cateUrl = siteUrl + '/';
const detailUrl = siteUrl + '/video-';
const searchUrl = siteUrl + '/search.htm?search=';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function request(url) {
    const resp = await axios.get(url, { headers });
    return resp.data;
}

// 解析视频列表（对应 Java 的 parseVods）
function parseVods($) {
    const list = [];
    $('div.thumbnail a').each((_, element) => {
        const style = $(element).find('div.image').attr('style') || '';
        const picMatch = style.match(/url\(['"']?(.*?)['"']?\)/);
        const pic = picMatch ? picMatch[1] : '';
        const url = $(element).attr('href') || '';
        const name = $(element).find('div.image').attr('title') || '';
        const remark = $(element).find('span').text();

        if (pic.endsWith('.gif') || !name) return;

        const id = url.split('-')[1];
        list.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remark,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const typeIdList =   ['list', 'top7_list', 'top_list', '5min_list', 'long_list'];
    const typeNameList = ['视频/Video list', '周榜/Weekly top', '月榜/Monthly top', '5分钟+/5min+', '10分钟+/10min+'];

    const classes = typeIdList.map((id, i) => ({
        type_id: id,
        type_name: typeNameList[i],
    }));

    const html = await request(siteUrl);
    const $ = load(html);
    const list = parseVods($);

    return { class: classes, list };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = inReq.body.page || 1;

    const url = `${cateUrl}${tid}-${pg}.htm`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return {
        page: parseInt(pg),
        pagecount: parseInt(pg) + 1,
        limit: 20,
        total: (parseInt(pg) + 1) * 20,
        list,
    };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = detailUrl + id;
    const html = await request(url);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';
    const playUrl = $('source#video-source').attr('src') || '';

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: 'HaoSe',
            vod_play_url: '播放$' + playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: headers,
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const url = searchUrl + text;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'haosevideo',
        name: 'HaoSeVideo',
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