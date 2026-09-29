import axios from 'axios';
import { load } from 'cheerio';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

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
        },
        // httpsAgent: agent
    });
    return resp.data;
}

async function parseVods($) {
    const items = [];
    $('div.video-item a').each((_, el) => {
        const pic = $(el).find('img').attr('src');
        const name = $(el).find('img').attr('alt');
        const url = $(el).attr('href');
        const remark = $(el).find('.me-2').text() || '';
        if (!pic || pic.endsWith('.gif') || !name) return;
        const id = url.split('=')[1];
        items.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remark.trim(),
            style: { ratio: 1.77, type: 'rect' }
        });
    });
    return items
}

/* ================== 首页 ================== */
async function home() {
    let classes = [];

    const typeIdList = ["censored&order=latest", "uncensored", "chinese", "europe","all_models"];
    const typeNameList = [" 最新日本A片", "无码", "中文字幕", "欧美", "女优"];

    for (let i = 0; i < typeNameList.length; i++) {
        classes.push({
            type_id: typeIdList[i],
            type_name: typeNameList[i]
        });
    }

    const html = await request(site);
    const $ = load(html);
    let list = await parseVods($);

    return {class: classes,list: list};
}

/* ================== 分类 ================== */
async function category(inReq) {
    const tid = inReq.body.id;
    const pg = inReq.body.page || 1;
    let list = []
    

    if(tid === 'all_models') {
      let target = site + '/' +  tid;
        if (parseInt(pg) > 1) {
            target = target + '?p=' + pg;
        }
        const html = await request(target);
        const $ = load(html);
        $('.model-list .model').each((_, el) => {
            const pic = $(el).find('img').attr('src');
            const name = $(el).find('.model-name').text() || '';
            const url = $(el).find('a').attr('href');
            if (!pic || pic.endsWith('.gif') || !name) return;
            list.push({
                 vod_id:   `folder_${url}`,
                 vod_name: name.trim(),
                 vod_pic:  pic,
                 vod_tag:  'folder',
                 style:    { ratio: 1.77, type: 'rect' },
            });
        });
    } else if(tid.startsWith('folder_')) { 
         let url = tid.replace('folder_', '');
         url = site + url + '&p=' + pg;
         const html = await request(url);
         const $ = load(html);
         list = await parseVods($);
    } else {
        let target = searchUrl + tid;
        if (parseInt(pg) > 1) {
            target = target + '&p=' + pg;
        }
        const html = await request(target);
        const $ = load(html);
        list = await parseVods($);
    }

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
        const desc = $('meta[property="og:description"]').attr('content');
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
            vod_play_url: '播放$' + playUrl,
            vod_content: desc,
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

    let list = await parseVods($);

    return {
        list: list
    };
}

export default {
    meta: {
        key: 'hhj',
        name: '🌸Hohoj',
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