import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const site = 'https://www.xxxfollow.com';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const headers = {
    'Referer':  site + '/',
    'Origin':   site,
    'User-Agent': UA,
};

async function ensureCookie() {
    if (headers['Cookie']) return;
    try {
        const resp = await axios.get(site + '/', { headers, maxRedirects: 5 });
        const setCookie = resp.headers['set-cookie'];
        if (setCookie && setCookie[0]) {
            headers['Cookie'] = setCookie[0].split(';')[0];
        }
    } catch (e) {
        const setCookie = e.response?.headers?.['set-cookie'];
        if (setCookie && setCookie[0]) {
            headers['Cookie'] = setCookie[0].split(';')[0];
        }
    }
}

async function request(reqUrl) {
    await ensureCookie();
    const resp = await axios.get(reqUrl, {
        headers: headers,
        // httpsAgent: agent
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/tag/teen-18',   type_name: 'teen-18' },
        { type_id: '/tag/bigass',   type_name: 'bigass' },
        { type_id: '/tag/anal',   type_name: 'anal' },
        { type_id: '/tag/breedingmaterial',  type_name: 'breedingmaterial' },
        { type_id: '/tag/gooned',type_name: 'gooned' },
        { type_id: '/tag/onlyfans',    type_name: 'onlyfans' },
        { type_id: '/tag/xsmallgirls',    type_name: 'xsmallgirls' },
        { type_id: '/tag/sexygirl',    type_name: 'sexygirl' },
        { type_id: '/tag/sex&m=-1',    type_name: 'sex' },
        { type_id: '/tag/girlsinyogapants',    type_name: 'girlsinyogapants' },
        { type_id: '/tag/boobs',    type_name: 'boobs' },
        { type_id: '/tag/cumshot',    type_name: 'cumshot' },
        { type_id: '/tag/lingerie',    type_name: 'lingerie' },
        { type_id: '/tag/hardcore',    type_name: 'hardcore' },
        { type_id: '/tag/blonde',    type_name: 'blonde' },
        { type_id: '/tag/dance',    type_name: 'pussylips' },
        { type_id: '/tag/redhead',    type_name: 'redhead' },
        { type_id: '/tag/brunette',    type_name: 'brunette' },
        { type_id: '/tag/stripchat',    type_name: 'stripchat' },
        { type_id: '/tag/stepmommy',    type_name: 'stepmommy' },
        { type_id: '/tag/femaleorgasm',    type_name: 'femaleorgasm' },
        { type_id: '/tag/cosplaygirl',    type_name: 'cosplaygirl' },
        { type_id: '/tag/publicflash',    type_name: 'publicflash' },
        { type_id: '/tag/naturaltits',    type_name: 'naturaltits' },
    ];

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const typeurl = inReq.body.id;
    const page = inReq.body.page || 1;
    const url = `${site}/api/v1/post${typeurl}?genders=cf&period=featured&limit=24&page=${page}&start_time=${Date.now()}`
    const data = await request(url);
    const videos = []
    for (const item of data.list) {
         videos.push({
                vod_id: item.post.media[0].url,
                vod_name: item.post.text,
                vod_pic: item.post.media[0].start_url,
                vod_remarks: item.post.media[0].width,
        })
    }
    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    return {
        list: [{
            vod_id: url,
            vod_name: '',
            vod_pic: '',
            vod_play_from: '默认',
            vod_play_url: `播放$${url}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA,'Referer': site + '/'},
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
        key: 'xxxFollow',
        name: '🎥xxxFollow',
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