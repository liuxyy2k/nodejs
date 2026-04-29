import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

const site = 'https://carry.pobwqst.cc';

const PORT   = process.env.DEV_HTTP_PORT || 9988;

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
        // httpsAgent: agent
    });
    return resp.data;
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

function aesDecrypt(buf) {
    const key      = Buffer.from('f5d965df75336270');
    const iv       = Buffer.from('97b60394abc2fbe1');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function proxyImgUrl(raw) {
    return `http://127.0.0.1:${PORT}/spider/mtw/3/img?url=${encodeURIComponent(e64(raw))}`;
}

async function parseVods($) {
    const items = [];
    $('.xqbj-list-rows').each((_, element) => {
        const rawPic = $(element).find('img').attr('z-image-loader-url') || '';
        const url = $(element).find('a').eq(0).attr('href') || '';
        const name = $(element).find('.xqbj-list-rows-image-title').text().trim();
        const date  = $(element).find('div.xqbj-list-rows-bottom-tags-tag .is-desktop').text().trim();
        const num  = $(element).find('div.xqbj-list-rows-bottom-tags-tag .is-mobile').text().trim();
        if (name && url) {
            items.push(
                { 
                    vod_id: url, 
                    vod_name: name, 
                    vod_pic: rawPic ? proxyImgUrl(rawPic.replace(/`/g, '')) : '',
                    vod_remarks: num + ' ' + date
                }
            );
        }
    });

    return items
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '',            type_name: '首页' },
        { type_id: '/order/today/',            type_name: '今日更新' },
        { type_id: '/category/mitaoremen/',            type_name: '蜜桃热门' },
        { type_id: '/category/wanghuang/',            type_name: '蜜桃网黄' },
        { type_id: '/category/cg/',            type_name: '原创大片' },
        { type_id: '/category/gaoqingav/',            type_name: '高清AV' },
        { type_id: '/category/tan-hua-da-shen/',            type_name: '探花大神' },
        { type_id: '/category/ou-mei-xi-lie/',            type_name: '欧美系列' },
        { type_id: '/category/ce-pai-chao-di/',            type_name: '厕拍抄底' },
        { type_id: '/category/jian-kong-po-jie/',           type_name: '监控破解' }
    ];

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    let url = `${site}${tid}${page}/`
    if(tid === '/order/today/') {
        url = `${site}${tid}page/${page}/`
    }
    if(tid === '') {
        url = `${site}/page/${page}/`;
    }
    const html = await request(url);
    const $ = load(html);
    const list = await parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(`${site}${id}`);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';
    const desc = $('meta[property="og:description"]').attr('content') || '';
    const dataConfig = $('.videoplayer').attr('data-config') || '{}';
    const json = JSON.parse(dataConfig)
    console.log(dataConfig)
    let playUrl = json.video?.url || '';
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: '蜜桃网',
            vod_play_url: '播放$' + playUrl,
            vod_content: desc,
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
    const html = await request(`${site}/search/${text}/`);
    const $ = load(html);
    const list = await parseVods($);

    return { list };
}

async function imgProxy(inReq, reply) {
    try {
        let raw = d64(inReq.query.url);
        console.log(raw)
        const match = raw.match(/loadBannerDirect\('([^']*)'/);
        if (match) raw = match[1];
        if (!raw) return reply.code(404).send('');

        const resp = await axios.get(raw, {
            headers: {
                'User-Agent': UA,
                'Referer':    `${site}/`,
                'Origin':     site,
            },
            responseType: 'arraybuffer',
            timeout:      10000,
        });

        const decrypted = aesDecrypt(Buffer.from(resp.data));
        let   ct        = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8')  ct = 'image/gif';

        reply.header('Content-Type', ct).send(decrypted);
    } catch (e) {
        console.error('imgProxy error:', e.message);
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'mtw',
        name: '蜜桃网',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img',  imgProxy);
    },
};