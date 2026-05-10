import axios from 'axios';
import { load } from 'cheerio';
const site = 'http://223rou.com';
const searchUrl = site + '/index.php/vod/search.html?wd=';

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

async function request(url) {
    const resp = await axios.get(url, {
        headers: {
            'User-Agent': UA
        },
    });
    return resp.data;
}

/* ================== 首页 ================== */
async function home() {
    let classes = [];
    let list = [];

    let html = await request(site);
    let $ = load(html);

    let count = 0;

    $('div.menu.clearfix dl dd').each((_, el) => {
        if (count >= 0 && count <= 16) {
            let href = $(el).find('a').attr('href');
            let text = $(el).text();

            if (href) {
                href = href.replace('index.html', '');
                classes.push({
                    type_id: href,
                    type_name: text
                });
            }
        }
        count++;
    });

    html = await request(site);
    $ = load(html);

    $('div.mod ul li a').each((_, el) => {
        try {
            const pic = $(el).find('img').attr('data-original');
            const url = $(el).attr('href');
            const name = $(el).attr('title');
            const id = url;

            list.push({
                vod_id: id,
                vod_name: name,
                vod_pic: site + pic
            });
        } catch (e) {}
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

    const target = site + tid + 'list_' + pg + '.html';

    const html = await request(target);
    const $ = load(html);

    let list = [];

    $('div.mod ul li a').each((_, el) => {
        try {
            const pic = $(el).find('img').attr('data-original');
            const url = $(el).attr('href');
            const name = $(el).attr('title');
            const id = url;

            list.push({
                vod_id: id,
                vod_name: name,
                vod_pic: site + pic
            });
        } catch (e) {}
    });

    return {
        page: parseInt(pg),
        pagecount: parseInt(pg) + 1,
        limit: 20,
        total: (parseInt(pg) + 1) * 20,
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
        const html = await request(site + id);
        const $ = load(html);

        const name = $('title').text().split('-')[0];

        // playUrl="xxxxm3u8";
        const match = html.match(/playUrl="(.*?)m3u8";/);

        let url = '';
        if (match) {
            url = match[1].replace(/\\\//g, '/') + 'm3u8';
        }

        // posterImg="xxxx";
        const match2 = html.match(/posterImg="(.*?)";/);

        let pic = '';
        if (match2) {
            pic = match2[1].replace(/\\\//g, '/');
        }
        //获取前缀
        const rep = await request('http://223rou.com/static/js/replace.js')
        const attr = rep.match(/replace\([^,]+,\s*"([^"]+)"/);
        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: site + pic,
            vod_play_from: '223ROU',
            vod_play_url: '播放$' + url.replace('+@movivecom@+', attr[1])
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
            'User-Agent': UA
        }
    };
}

/* ================== 搜索 ================== */
async function search(inReq) {
    const wd = inReq.body.wd;

    const html = await request(searchUrl + wd);
    const $ = load(html);

    let list = [];

    $('div.mod ul li a').each((_, el) => {
        try {
            const pic = $(el).find('img').attr('data-original');
            const url = $(el).attr('href');
            const name = $(el).attr('title');
            const id = url;

            list.push({
                vod_id: id,
                vod_name: name,
                vod_pic: site + pic
            });
        } catch (e) {}
    });

    return {
        list: list
    };
}

export default {
    meta: {
        key: 'rou223',
        name: '🔥Rou223',
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