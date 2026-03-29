import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';


const PORT   = process.env.DEV_HTTP_PORT || 9988;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://18heiliao.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers }
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
    return `http://127.0.0.1:${PORT}/spider/18hl/3/img?url=${encodeURIComponent(e64(raw))}`;
}


async function parseVods($) {
    const items = [];
    $('article').each((_, element) => {
        const rawPic = $(element).find('.blog-background').attr('data-bg');
        const url = $(element).find('a').attr('href') || '';
        const name = $(element).find('.post-card-title').text().trim();
        const date  = $(element).find('span[itemprop="datePublished"]').text().trim();
        if (name && url) {
            items.push(
                { 
                    vod_id: url, 
                    vod_name: name, 
                    vod_pic: rawPic ? proxyImgUrl(rawPic) : '',
                    vod_remarks: date.split(' ')[0]
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
    const classes = [];
    const seen = new Set();
    const exclude = ['往期内容', '官方信息','热门标签','回家方法','投稿求瓜']
    const html = await request(site);
    const $ = load(html);
    $('.report-item').each((_, element) => {
        const typeId = $(element).attr('href')
        const typeName = $(element).text().trim() || ''
        // 是否命中黑名单
        if (exclude.some(keyword => typeName.includes(keyword))) return
        if(typeName && typeId  && !seen.has(typeId)) {
            seen.add(typeId);
            classes.push (
                {
                    type_id: typeId,
                    type_name: typeName
                }
            )
        }
    }); 
    return { class: classes,  filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    let url = `${site}${tid}page/${page}/`;
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
    const des = $('meta[property="og:description"]').attr('content') || '';

    // 提取 eval
    const evalMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\([\s\S]*?\)\)/);
    if (!evalMatch) throw new Error('没找到 eval');

    let evalStr = evalMatch[0];

    // 👇 劫持 document.write
    let scriptUrl = '';
    const document = {
        write: (str) => {
            const match = str.match(/src="([^"]+)"/);
            if (match) {
                scriptUrl = match[1];
            }
        }
    };
    try {
        eval(evalStr); // ⚠️ 这里执行的是混淆代码
    } catch (e) {
        console.log('eval执行失败', e);
    }

    if (!scriptUrl) {
        throw new Error('没有解析出 script 地址');
    }
    //拿到真正 js
    const js = await request(site + scriptUrl);
    // 去掉 eval 再执行
    let unpacked = '';
    try {
        unpacked = new Function('return ' + js.replace(/^eval/, ''))();
    } catch (e) {
        console.log('二次解密失败', e);
    }
    const base64 = unpacked.match(/data-config=['"]([^'"]+)['"]/)?.[1];
    let playUrl = '';
    if (base64) {
        const json = JSON.parse(Buffer.from(base64, 'base64').toString());
        playUrl = json?.video?.url || '';
    }
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_content: des,
            vod_play_from: '18黑料',
            vod_play_url: playUrl ? `专线$${playUrl}` : '',
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

        console.log('[imgProxy] 请求URL:', raw); // ← 确认拿到的 URL 对不对

        const resp = await axios.get(raw, {
            headers: {
                'User-Agent': UA,
                'Referer':    `${site}/`,
                'Origin':     site,
            },
            responseType: 'arraybuffer',
            timeout:      10000,
        });

        const buf = Buffer.from(resp.data);
        
        const decrypted = aesDecrypt(buf);
        let ct = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8') ct = 'image/gif';

        reply.header('Content-Type', ct).send(decrypted);
    } catch (e) {
        console.error('imgProxy error:', e.message);
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: '18hl',
        name: '18黑料',
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