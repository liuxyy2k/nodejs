import axios from 'axios';
import { load } from 'cheerio';

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const site = 'https://ikk.jiukun66.autos';
const cateUrl = site + '/video/category/';
const detailUrl = site + '/video/view/';
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

/* ================== 解析列表 ================== */
function parseVods(html) {
    const $ = load(html);
    let list = [];

    $('article').each((_, el) => {
        const pic = $(el).find('img').attr('src');
        const href = $(el).find('a').attr('href');
        const name = $(el).find('h4').text().trim();
        const time = $(el).find('time').text().trim();

        if (!href || !name || !pic || pic.endsWith('.gif')) return;

        // 安全取 id
        const parts = href.replace(/\/+$/, '').split('/');
        const id = parts.pop();

        list.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: time,
        });
    });

    return list;
}

/* ================== 首页 ================== */
async function home() {
    const typeIdList = [
        "latest", "hd", "recent-favorite", "hot-list",
        "recent-rating", "nonpaid", "ori",
        "long-list", "longer-list",
        "month-discuss", "top-favorite",
        "most-favorite", "top-list", "top-last"
    ];

    const typeNameList = [
        "最近更新", "高清视频", "最近加精", "当前最热",
        "最近得分", "非付费", "91原创",
        "10分钟以上", "20分钟以上",
        "本月讨论", "本月收藏",
        "收藏最多", "本月最热", "上月最热"
    ];

    let classes = [];

    for (let i = 0; i < typeIdList.length; i++) {
        classes.push({
            type_id: typeIdList[i],
            type_name: typeNameList[i],
        });
    }

    const html = await request(site);

    return {
        class: classes,
        list: parseVods(html),
    };
}

/* ================== 分类 ================== */
async function category(inReq) {
    const tid = inReq.body.id;
    const page = inReq.body.page || 1;

    const url = `${cateUrl}${tid}/${page}`;

    const html = await request(url);

    return {
        page: parseInt(page),
        pagecount: parseInt(page) + 1,
        limit: 20,
        total: (parseInt(page) + 1) * 20,
        list: parseVods(html),
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

        const name = $('meta[property="og:title"]').attr('content') || '';
        const pic = $('meta[property="og:image"]').attr('content') || '';
        const year = $('meta[property="video:release_date"]').attr('content') || '';

        let playUrl = '';

        // 正则提取 window.$avdt
        const match = html.match(/window\.\$avdt\s*=\s*(\{[\s\S]*?\})\s*;/);

        if (match) {
            try {
                const jsonStr = match[1].replace(/\\\//g, '/');
                const avdt = JSON.parse(jsonStr);

                const hls = avdt.hls;
                const cdns = avdt.cdns;

                if (cdns && cdns.length > 0 && hls) {
                    playUrl = 'https://' + cdns[0] + hls;
                }
            } catch (e) {
                console.log('解析 avdt 失败');
            }
        }

        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: 'J91',
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

    const html = await request(searchUrl + wd);

    return {
        list: parseVods(html),
    };
}

export default {
    meta: {
        key: 'sp91',
        name: '91视频',
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