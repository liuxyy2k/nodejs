import axios from 'axios';
import req from '../../util/req.js';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
const site = 'https://rou.video';

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
    const classes = [
        { type_id: `${site}/t/國產AV`, type_name: '國產AV' },
        { type_id: `${site}/t/探花`,   type_name: '探花' },
        { type_id: `${site}/t/自拍流出`, type_name: '自拍流出' },
        { type_id: `${site}/t/OnlyFans`, type_name: 'OnlyFans' },
        { type_id: `${site}/t/日本`,   type_name: '日本' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    let typeurl = inReq.body.id;
    const page = inReq.body.page || 1;

    const url = page > 1 ? `${typeurl}?order=createdAt&page=${page}` : typeurl;
    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.grid.grid-cols-2.mb-6 > div').each((_, element) => {
        if ($(element).find('.relative').length == 0) return;
        const href = $(element).find('.relative a').attr('href');
        const title = $(element).find('img:last').attr('alt');
        const cover = $(element).find('img').attr('src');
        const subTitle = $(element).find('.relative a > div:eq(1)').text();
        const hdinfo = $(element).find('.relative a > div:first').text();
        if (href) {
            videos.push({
                vod_id: site + href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: subTitle || hdinfo,
            });
        }
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);
    const $ = load(html);

    let playUrl = '';
    try {
        const scriptContent = $('#__NEXT_DATA__').html();
        const jsonData = JSON.parse(scriptContent);
        const ev = jsonData.props.pageProps.ev;
        playUrl = decodeEv(ev).videoUrl;
    } catch (e) {}

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
    const url = `${site}/search?q=${text}&t=&page=${page}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.grid.grid-cols-2.mb-6 > div').each((_, element) => {
        if ($(element).find('.relative').length == 0) return;
        const href = $(element).find('.relative a').attr('href');
        const title = $(element).find('img:last').attr('alt');
        const cover = $(element).find('img').attr('src');
        const subTitle = $(element).find('.relative a > div:eq(1)').text();
        const hdinfo = $(element).find('.relative a > div:first').text();
        if (href) {
            videos.push({
                vod_id: site + href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: subTitle || hdinfo,
            });
        }
    });

    return { list: videos };
}

function decodeEv(ev) {
    const decoded = _atob(ev.d)
        .split('')
        .map((c) => String.fromCharCode(c.charCodeAt(0) - ev.k))
        .join('');
    return JSON.parse(decoded);
}

function _atob(b64) {
    const chars = {
        ascii: () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
        cache: null,
        indices() {
            if (!this.cache) {
                this.cache = {};
                const ascii = this.ascii();
                for (let c = 0; c < ascii.length; c++) {
                    this.cache[ascii[c]] = c;
                }
            }
            return this.cache;
        },
    };
    const indices = chars.indices();
    const pos = b64.indexOf('=');
    const padded = pos > -1;
    const len = padded ? pos : b64.length;
    let i = -1, data = '';

    while (i < len) {
        const code =
            (indices[b64[++i]] << 18) | (indices[b64[++i]] << 12) |
            (indices[b64[++i]] << 6)  |  indices[b64[++i]];
        if (code !== 0) {
            data += String.fromCharCode((code >>> 16) & 255, (code >>> 8) & 255, code & 255);
        }
    }
    if (padded) data = data.slice(0, pos - b64.length);
    return data;
}

export default {
    meta: {
        key: 'rouvideo',
        name: '肉视频',
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