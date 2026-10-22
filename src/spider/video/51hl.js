import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

const site = 'https://51hlws.com';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const PORT   = process.env.DEV_HTTP_PORT || 9988;

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
        // httpsAgent: agent,
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
    return `http://127.0.0.1:${PORT}/spider/hl51/3/img?url=${encodeURIComponent(e64(raw))}`;
}

async function parseVods($) {
    const items = [];

    $('article').each((_, element) => {
        const rawPic = $(element).find('.loading').attr('z-image-loader-url');
        const url = $(element).find('a').attr('href') || '';
        const name = $(element).find('.post-card-title').text().trim();
        const date  = $(element).find('span[itemprop="datePublished"]').text().trim();
        const parts = url.split('/');
        const id = parts[2] || '';
        if (name && url) {
            items.push(
                { 
                    vod_id: id, 
                    vod_name: name, 
                    vod_pic: rawPic ? proxyImgUrl(rawPic) : '',
                    vod_remarks: date.replace(/\s*年\s*|\s*月\s*/g, '-').replace(/\s*日/, '')
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
        { type_id: '/category/jinriheiliao/',            type_name: '今日黑料' },
        { type_id: '/category/bichiregua/',            type_name: '必吃热瓜' },
        { type_id: '/category/shenghuoheiliao/',            type_name: '生活黑料' },
        { type_id: '/category/zhutidasai/',            type_name: '主题大赛' },
        { type_id: '/category/wanghongheiliao/',            type_name: '网红黑料' },
        { type_id: '/category/bilujingping/',            type_name: '必撸精品' },
        { type_id: '/category/jingxuanheji/',            type_name: '精选合集' },
        { type_id: '/category/xiaoyuanyinluan/',            type_name: '校园淫乱' },
        { type_id: '/category/AIfuli/',            type_name: '51动漫' },
        { type_id: '/category/luanlunshequ/',           type_name: '乱伦社区' },
        { type_id: '/category/mingxingheiliao/',            type_name: '明星黑料' },
        { type_id: '/category/gouxueduanju/',            type_name: '狗血短剧' },
        { type_id: '/category/lieqizhongkou/',            type_name: '猎奇重口' }
    ];

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const html = await request(`${site}${tid}${page}/`);
    const $ = load(html);
    const list = await parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(`${site}/archives/${id}`);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';

    const playParts = [];
    let index = 1;
    $('div.dplayer').each((_, element) => {
        try {
            const config = JSON.parse($(element).attr('data-config') || '{}');
            const videoUrl = config?.video?.url || '';
            if (videoUrl) {
                playParts.push(`第${index}集$${videoUrl}`);
                index++;
            }
        } catch (e) {}
    });

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: '51黑料',
            vod_play_url: playParts.join('#'),
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
    const html = await request(`${site}/search?keywords=${text}`);
    const $ = load(html);
    const list = await parseVods($);

    return { list };
}

async function imgProxy(inReq, reply) {
    try {
        let raw = d64(inReq.query.url);
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
        key: 'hl51',
        name: '🍉51·黑料',
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