import axios from 'axios';
import { load } from 'cheerio';
import vm from 'vm';
// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://thisav.biz';
const tokenUrl = 'https://thisav.biz/token.php?file=';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
        // httpsAgent: agent
    });
    return resp.data;
}

function parseVods($) {
    const videos = [];
    $('.thumbnail').each((_, element) => {
        try {
            const pic = $(element).find('.lozad.w-full').attr('data-src') || '';
            const id = $(element).find('a').eq(0).attr('href') || '';
            const name = $(element).find('.text-secondary').text().trim() || '';
            const remark = $(element).find('.absolute').text().trim() || '';
            if (!id || !name) return;
            videos.push({
                vod_id: id,
                vod_name: name,
                vod_pic: site + pic,
                vod_remarks: remark
            });
        } catch (e) {}
    });
    return videos;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/thisavtype/CHN_SUB',        type_name: '中文字幕' },
        { type_id: '/label/rank/by/time.html',   type_name: '最近更新' },
        { type_id: '/label/new/by/time',         type_name: '最新上市' },
        { type_id: '/thisavtype/Censored',       type_name: '日本有码' },
        { type_id: '/thisavtype/Uncensored',     type_name: '日本无码' },
        { type_id: '/thisavtype/FC2-PPV',        type_name: 'FC2-PPV' },
        { type_id: '/thisavtype/Mosaic_Removed', type_name: '无码破解' },
        { type_id: '/thisavtype/MGS',            type_name: 'MGS動画' },
        { type_id: '/thisavtype/Adult_IDOL',     type_name: '写真' },
        { type_id: '/thisavtype/Asian_Amateur',  type_name: '国产' },
        { type_id: '/thisavtype/Western_Porn',   type_name: '欧美成人' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const url = `${site}${tid}-${page}.html`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = `${site}${id}`;
    const html = await request(url);
    const $ = load(html);
    let playUrl = '';
    let file = ''
    let pic = '';
    const name = $('.text-base').text().trim() || '';
    const plar = $('.plyr__video-wrapper script').html();
    if (plar.includes('eval(function')) {
        const unpackCode = plar.replace(/^eval/, '');
        const result = vm.runInNewContext(unpackCode);
        const sandbox = {};
        vm.runInNewContext(result, sandbox);
        if (sandbox.player_aaaa) {
            file = sandbox.player_aaaa.url;
            pic = sandbox.player_aaaa.poster;
        }
    }
    //请求获取token
    const tokenResp = await request(tokenUrl + file);
    const token = tokenResp.token;
    const ts = tokenResp.ts;
    // 生成 sign
    const ky = file + '@' + ts;
    const sign = encrypt(ky);
    //获取播放地址
    const realUrl = `${site}/save_m3u8_cache.php?file=${file}&token=${token}&ts=${ts}&sign=${sign}`;
    const saveM3u8 = await request(realUrl);
    playUrl = site + saveM3u8.play_url
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'XVideos',
            vod_play_url: '播放$' + playUrl,
        }],
    };
}

function encrypt(str, key = 0x7b) {
    const bytes = Buffer.from(str);
    const xored = xorBytes(bytes, key);
    return encodeBase62(xored);
}

function xorBytes(buffer, key) {
    const result = Buffer.alloc(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        result[i] = buffer[i] ^ key;
    }
    return result;
}

const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function encodeBase62(buffer) {
    let num = BigInt('0x' + buffer.toString('hex'));
    let result = '';

    while (num > 0n) {
        result = BASE62[num % 62n] + result;
        num = num / 62n;
    }

    return result;
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
    const url = `${site}/vod/search.html?wd=${text}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);
    return { list };
}

export default {
    meta: {
        key: 'ThisAv',
        name: '🔥ThisAv',
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