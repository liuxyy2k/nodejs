import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

const PORT   = process.env.DEV_HTTP_PORT || 9988;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://annual.nqrcgia.com';

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
    const key      = Buffer.from('f5d965df75336270');
    const iv       = Buffer.from('97b60394abc2fbe1');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function proxyImgUrl(raw) {
    return `http://127.0.0.1:${PORT}/spider/hlcg/3/img?url=${encodeURIComponent(e64(raw))}`;
}


async function parseVods($) {
    const items = [];

    $('article').each((_, element) => {
        const rawPic = $(element).find('script').text().trim();
        const url = $(element).find('a').attr('href') || '';
        const name = $(element).find('.post-card-title').text().trim();
        const date  = $(element).find('span').eq(2).text().trim();
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
        { type_id: '/page/', type_name: '首页' },
        { type_id: '/category/zxcg/', type_name: '最新吃瓜' },
        { type_id: '/category/cgsd/', type_name: '吃瓜速递' },
        { type_id: '/category/lldd/', type_name: '乱伦吃瓜' },
        { type_id: '/category/bkdg/', type_name: '吃瓜必看' },
        { type_id: '/category/xsxy/', type_name: '学生黑料' },
        { type_id: '/category/dywh/', type_name: '网红黑料' },
        { type_id: '/category/meir-dasai/', type_name: '每日大赛' },
        { type_id: '/category/jsxm/', type_name: '精神小妹' },
        { type_id: '/category/gytg/', type_name: '投稿黑料' },
        { type_id: '/category/fcb/',  type_name: '反差女神' },
        { type_id: '/category/mxhl/', type_name: '明星黑料' },
        { type_id: '/category/onlyfans/', type_name: '猎奇重口' },
        { type_id: '/category/cgxw/', type_name: 'cos软妹' },
        { type_id: '/category/dnydsj/', type_name: 'AI换脸' },
        { type_id: '/category/hlzy/', type_name: '寸止挑战' },
        { type_id: '/category/lwcb/', type_name: '强力混剪' },
        { type_id: '/category/jktp/', type_name: '自拍偷拍' },
        { type_id: '/category/91sp/', type_name: '91视频' },
        { type_id: '/category/hwcg/', type_name: '禁漫天堂' },
        { type_id: '/category/cgzy/', type_name: '名人合集' },
        { type_id: '/category/hlph/', type_name: '黑料排行' },
        { type_id: '/category/hlys/', type_name: '黑料影视' },
    ];

    return { class: classes,  filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const url = `${site}${tid}${page}/`;
    const html = await request(url);
    const $ = load(html);
    let list = await parseVods($);
    if( tid === '/category/cgsd/' ) {
        const items = [];
        $('article').each((_, element) => {
            const rawPic = $(element).find('img').eq(0).attr('data-xkrkllgl');
            const url = $(element).find('a').attr('href') || '';
            const name = $(element).find('.post-title').text().trim();
            const date  = $(element).find('.post-date').text().trim();
            const parts = url.split('/');
            const id = parts[2] || '';
            if (name && url) {
                items.push(
                    { 
                        vod_id: id, 
                        vod_name: name, 
                        vod_pic: rawPic ? proxyImgUrl(rawPic) : '',
                        vod_remarks: date
                    }
                );
            }
        });
        list = items
    }

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(`${site}/archives/${id}/`);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const des = $('meta[property="og:description"]').attr('content') || '';

    const evalStr = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\([\s\S]*?\)\)/)[0];
    // 拿 split 里的字符串
    const kStr = evalStr.match(/'([^']+)'\.split/)[1];
    const arr = kStr.split('|');
    // 关键索引（固定的）
    const hash = arr[13];   // d
    const idss = arr[4];      // 6bb61e3b
    const t = Math.floor(Date.now() / 1000 / 2000);
    const url = `/player/${hash}/${idss}/${t}.js`;
    const js = await request(site + url);
    const unpacked = eval(js.replace('eval', ''))
    const base64 = unpacked.match(/data-config=['"]([^'"]+)['"]/)?.[1];
    let playUrl = ''
    if (base64) {
        playUrl = JSON.parse(Buffer.from(base64, 'base64').toString()).video.url;
        console.log(playUrl)
    }
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_content: des,
            vod_play_from: '黑料吃瓜',
            vod_play_url: '播放$' + playUrl,
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
    const html = await request(`${site}/search/search/${text}`);
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
        key: 'hlcg',
        name: '🔥黑料吃瓜',
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