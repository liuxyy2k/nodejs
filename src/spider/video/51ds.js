import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const PORT   = process.env.DEV_HTTP_PORT || 9988;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://bean.cecrswtk.cc';

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
    return `http://127.0.0.1:${PORT}/spider/ds51/3/img?url=${encodeURIComponent(e64(raw))}`;
}


async function parseVods($) {
    const items = [];

    $('article').each((_, element) => {
        const rawPic = $(element).find('script').text().trim();
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
                    vod_remarks: date.replace(/\s*年\s*|\s*月\s*/g, '-').replace(/\s*日/, ''),
                    style: { ratio: 1.77, type: 'rect' }
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
    const exclude = ['常见问题', '官方TG群','最新地址','回家的路','商务合作','往期内容','官方信息','投稿方式','福利APP']
    const html = await request(site);
    const $ = load(html);
    $('.nav-link').each((_, element) => {
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
    let list = []
    if (tid === 'mrdg') {
        let url = `${site}${tid}${page}/`;
        const html = await request(url);
        const $ = load(html);
        $('article').each((_, element) => {
            const rawPic = $(element).find('script').text().trim();
            const url = $(element).find('a').attr('href') || '';
            const name = $(element).find('.post-card-title').text().trim();
            const date  = $(element).find('span[itemprop="datePublished"]').text().trim();
            if (name && url) {
                list.push(
                    { 
                        vod_id:   `folder_${url}`,
                        vod_name: name.trim(),
                        vod_pic:  rawPic ? proxyImgUrl(rawPic) : '',
                        vod_tag:  'folder',
                        style:    { ratio: 1.77, type: 'rect' },
                    }
                );
            }
        });
    } else if (tid.startsWith('folder_')) { 
        const url = tid.replace('folder_', '');
        const html = await request(site + url);
        const $ = load(html);
        $('article .post-content').find('a').each((_, element) => {
            const rawPic = $(element).find('img').attr('data-xkrkllgl') || '';
            const url = $(element).attr('href') || '';
            const name = $(element).find('img').attr('alt') || '';
            const parts = url.split('/');
            const id = parts[2] || '';
            if (name && url) {
                list.push(
                    { 
                        vod_id: id, 
                        vod_name: name, 
                        vod_pic: rawPic ? proxyImgUrl(rawPic) : '',
                        vod_remarks: '',
                        style: { ratio: 1.77, type: 'rect' }
                    }
                );
            }
        })
    }
     else {
         let url = `${site}${tid}${page}/`;
        if(tid === '') {
            url = `${site}/page/${page}/`;
        }
        const html = await request(url);
        const $ = load(html);
        list = await parseVods($);
    }
    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(`${site}/archives/${id}`);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';

    const playParts = [];
    let index = 1;
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

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: 'Cg51',
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
        key: 'ds51',
        name: '🔥51大赛',
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