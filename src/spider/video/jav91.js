import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const site = 'https://jdkir.triutpw.cc';

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classurl = `${site}/index/getMvStyle/order/count`;
    const html = await request(classurl);
    const $ = load(html);

    const ignore = ['首页'];
    let classes = [];
    $('.pb-3.pb-e-lg-40 .col-6.col-sm-4.col-lg-3').each((_, e) => {
        const name = $(e).find('h4').text();
        const href = $(e).find('a').attr('href');
        if (!name || ignore.some(i => name.includes(i))) return;
        classes.push({ type_id: href, type_name: name });
    });

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const typeurl = inReq.body.id;
    const page = inReq.body.page || 1;
    const url = page > 1
        ? `${site}${typeurl}/sort/update/page/${page}`
        : `${site}${typeurl}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.pb-3.pb-e-lg-40 .col-6.col-sm-4.col-lg-3').each((_, element) => {
        const href = $(element).find('.title a').attr('href');
        const title = $(element).find('.title a').text();
        const subTitle = $(element).find('.label').text();
        if (href) {
            videos.push({
                vod_id: `${site}${href}`,
                vod_name: title,
                vod_pic: '',
                vod_remarks: subTitle,
            });
        }
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);

    let playUrl = '';
    try {
        playUrl = html.match(/var hlsUrl = "(.*?)";/)[1];
    } catch (e) {}

    const $ = load(html);
    const title = $('h1').first().text().trim();
    const pic = $('meta[property="og:image"]').attr('content') || '';

    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_play_from: '默认',
            vod_play_url: `播放$${playUrl}`,
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
    const url = page > 1
        ? `${site}/search/index/keyword/${text}/page/${page}`
        : `${site}/search/index/keyword/${text}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.pb-3.pb-e-lg-40 .col-6.col-sm-4.col-lg-3').each((_, element) => {
        const href = $(element).find('.title a').attr('href');
        const title = $(element).find('.title a').text();
        const subTitle = $(element).find('.label').text();
        if (href) {
            videos.push({
                vod_id: `${site}${href}`,
                vod_name: title,
                vod_pic: '',
                vod_remarks: subTitle,
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: '91jav',
        name: '🔥91Jav',
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