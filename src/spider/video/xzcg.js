import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';


const PORT  = process.env.DEV_HTTP_PORT || 9988;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://xzcg8.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
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
    const key      = Buffer.from('YkZ4bTJYeDJ4TkhNc3IjejkhZ1VGUzJPZDRObkN1Tzk=','base64');
    const iv       = Buffer.from('ektQRTh0MCNzMlltQ3RZZw==','base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function proxyImgUrl(raw) {
    return `http://127.0.0.1:${PORT}/spider/xzcg/3/img?url=${encodeURIComponent(e64(raw))}`;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await request(site);
    const $ = load(html);
    $('.submenu-item').each((_, element) => {
        const href = $(element).attr('href') || '';
        const name = $(element).text() || '';
        if(name === '首页' || name === '' ) return
        classes.push(
            { 
                type_id: href, 
                type_name: name,
            }
        );
    });
    return { class: classes,  filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = parseInt(inReq.body.page || 1);

    const url = `${site}${tid}?page=${pg}`;
    const html = await request(url);
    const $ = load(html);

    const nuxt = $('#__NUXT_DATA__').text() || '[]';
    const json = JSON.parse(nuxt);

    // 动态找文章数据块
    const dataObj = json[3];
    let data = null;

    for (const key in dataObj) {
        const idx = dataObj[key];
        const wrapper = json[idx];
        if (!wrapper || typeof wrapper !== 'object') continue;

        const dataIndex = wrapper.Data;
        const realData = json[dataIndex];
        if (!realData) continue;

        const source = json[realData.Source];
        if (!Array.isArray(source) || source.length === 0) continue;

        const first = json[source[0]];
        if (
            first &&
            typeof first === 'object' &&
            first.Title !== undefined &&
            first.Cover !== undefined
        ) {
            data = realData;
            break;
        }
    }

    if (!data) {
        return {
            page: pg,
            pagecount: 0,
            limit: 20,
            total: 0,
            list: []
        };
    }

    const source = json[data.Source];
    const total = json[data.Count];

    const list = source.map(idx => {
        const item = json[idx];
        return {
            vod_id: json[item.Id],
            vod_name: json[item.Title],
            vod_pic: proxyImgUrl(json[item.Cover]),
            vod_remarks: json[item.CreateTimeLabel]
        };
    });

    return {
        page: pg,
        pagecount: Math.ceil(total / 20),
        limit: 20,
        total,
        list
    };
}


async function detail(inReq, _outResp) {
    const id = inReq.body.id;

    const html = await request(`${site}/detail/${id}`);
    const $ = load(html);

    const name = $('.detail-title').text()?.trim() || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const des = $('.content p').text()?.trim() || '';

    const index = 0;

    const key = Buffer.from(
        'YkZ4bTJYeDJ4TkhNc3IjejkhZ1VGUzJPZDRObkN1Tzk=',
        'base64'
    ).toString('utf8');

    const timestamp = Math.floor(Date.now() / 1000);

    const signStr = `${id}-${index}-${timestamp}-${key}`;

    const md5 = crypto.createHash('md5').update(signStr).digest('hex');

    const resp = await axios.post(
        `https://api.xzcg8.com/api/Nuxt/UrlToken`,
        {
            Data: {
                Id: id,
                Index: index,
                Timestamp: timestamp,
                Sign: md5
            }
        },
        {
            headers: {
                'User-Agent': UA,
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': `${site}/`,
                'Content-Type': 'application/json'
            }
        }
    );
    const playUrl = resp.data.Data
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_content: des,
            vod_play_from: '小嘴吃瓜',
            vod_play_url: `播放$${playUrl || id}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA ,'Referer' : site+ '/'},
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const html = await request(`${site}/search/${text}`);
    const $ = load(html);
    const nuxt = $('#__NUXT_DATA__').text() || '[]';
    const json = JSON.parse(nuxt);

    // 动态找文章数据块
    const dataObj = json[3];
    let data = null;

    for (const key in dataObj) {
        const idx = dataObj[key];
        const wrapper = json[idx];
        if (!wrapper || typeof wrapper !== 'object') continue;

        const dataIndex = wrapper.Data;
        const realData = json[dataIndex];
        if (!realData) continue;

        const source = json[realData.Source];
        if (!Array.isArray(source) || source.length === 0) continue;

        const first = json[source[0]];
        if (
            first &&
            typeof first === 'object' &&
            first.Title !== undefined &&
            first.Cover !== undefined
        ) {
            data = realData;
            break;
        }
    }

    if (!data) {
        return {
            page: pg,
            pagecount: 0,
            limit: 20,
            total: 0,
            list: []
        };
    }

    const source = json[data.Source];
    const total = json[data.Count];

    const list = source.map(idx => {
        const item = json[idx];
        return {
            vod_id: json[item.Id],
            vod_name: json[item.Title],
            vod_pic: proxyImgUrl(json[item.Cover]),
            vod_remarks: json[item.CreateTimeLabel]
        };
    });

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
        key: 'xzcg',
        name: '小嘴吃瓜',
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