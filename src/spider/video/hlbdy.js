import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const PORT   = process.env.DEV_HTTP_PORT || 9988;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://hl365.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
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
    return `http://127.0.0.1:${PORT}/spider/heiliao/3/img?url=${encodeURIComponent(e64(raw))}`;
}


async function parseVods($) {
    const items = [];

    $('article').each((_, element) => {
        const rawPic = $(element).find('script').text().trim();
        const url = $(element).find('a').attr('href') || '';
        const name = $(element).find('.post-card-bottom-text').text().trim();
        const date  = $(element).find('span[itemprop="datePublished"]').text().trim();
        if (name && url) {
            items.push(
                { 
                    vod_id: url, 
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
        { type_id: '',     type_name: '首页' },
        { type_id: '24hcg', type_name: '今日看料' },
        { type_id: 'mrds', type_name: '每日大赛' },
        { type_id: 'rgtj', type_name: '热门吃瓜' },
        { type_id: 'mrrg', type_name: '每日吃瓜' },
        { type_id: 'hlda', type_name: '黑料大事' },
        { type_id: 'fcns', type_name: '反差女神' },
        { type_id: 'xyrg', type_name: '学院吃瓜' },
        { type_id: 'whhl', type_name: '网红吃瓜' },
        { type_id: 'hlzt', type_name: '黑料杂谈' },
        { type_id: 'mxbg', type_name: '明星吃瓜' },
        { type_id: 'gcmw', type_name: '官场秘闻' },
        { type_id: 'lydt', type_name: '撸友看片' },
        { type_id: 'whzj', type_name: '网黄专辑' }
    ];

    return { class: classes,  filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    let url = `${site}/category/${tid}/${page}/`;
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
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';

    const playParts = [];
    let index = 1;
    const config = $('div.dplayer').attr('data-config') || '';
    $('div.dplayer').each((_, element) => {
        try {
            const config = $(element).attr('data-config') || '';
            const json = JSON.parse(config);
            const videoUrl = json.video && json.video.url ? json.video.url : '';
            if (videoUrl) {
                playParts.push(`第${index}集$${videoUrl}`);
                index++;
            }
        } catch (e) {}
    });
    if(config === '') {
        const list = [];
        $('div.post-content').find('.btn').each((_, element) => {
            const foUrl = $(element).attr('href');
            if (foUrl) {
                list.push(foUrl);
            }
        });
       for (const url of list) {
            const ht = await request(`${site}${url}`);
            const $ = load(ht);
            const name = $('meta[property="og:title"]').attr('content') || '';
            $('div.dplayer').each((_, element) => {
            try {
                const config = $(element).attr('data-config') || '';
                const json = JSON.parse(config);
                const videoUrl = json.video && json.video.url ? json.video.url : '';
                if (videoUrl) {
                    playParts.push(`${name}$${videoUrl}`);
                    index++;
                }
            } catch (e) {}
            });
        }

    }
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: '黑料不打烊',
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
        key: 'heiliao',
        name: '黑料不打烊',
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