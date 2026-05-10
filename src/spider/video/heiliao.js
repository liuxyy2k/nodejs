import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const site = 'https://heiliao.com';


const PORT = process.env.DEV_HTTP_PORT || 9988;

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
        // httpsAgent: agent
    });
    return resp.data;
}

function getImgUrl($el) {
    const src = $el.attr('src') || $el.attr('data-src') || '';
    const enc = extractImgFromOnload($el.attr('onload') || '');
    const t   = enc || src;
    if (!t) return '';
    if (enc || shouldDecrypt(t)) {
        return `http://127.0.0.1:${PORT}/spider/hlw/3/img?url=${encodeURIComponent(e64(t))}`;
    }
    return absUrl(t);
}

function extractImgFromOnload(onload) {
    const m = (onload || '').match(/load(?:Share)?Img\s*\([^,]+,\s*['"]([^'"]+)['"]/);
    return m ? m[1] : '';
}

function shouldDecrypt(url) {
    const u = (url || '').toLowerCase();
    return ['pic.gylhaa.cn', 'new.slfpld.cn', '/upload_01/', '/upload/'].some(x => u.includes(x));
}

function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('//'))  return 'https:' + u;
    if (u.startsWith('/'))   return site + u;
    return u;
}

function aesDecrypt(buf) {
    const key      = Buffer.from('f5d965df75336270');
    const iv       = Buffer.from('97b60394abc2fbe1');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

function parseVodList($) {
    const list = [];
    $('.video-item').each((_, element) => {
        try {
            const url  = $(element).find('a').attr('href') || '';
            const name = $(element).find('h3').text().trim();
            if (!name || !url) return;
            // 从 URL 中提取纯数字 ID
            const id = url.split('/').find(p => /^\d+$/.test(p)) || '';
            const imgEl  =  $(element).find('img');
            const remarks = $(element).find('.date-xxx').text().trim() || ''
            list.push(
                {   vod_id: id, 
                    vod_name: name, 
                    vod_pic: imgEl.length ? getImgUrl(imgEl) : '', 
                    vod_remarks: remarks 
                }
            );
        } catch (e) {}
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'hlcg', type_name: '最新黑料' },
        { type_id: 'jrrs', type_name: '今日热瓜' },
        { type_id: 'jqrm', type_name: '热门黑料' },
        { type_id: 'lsdg', type_name: '经典黑料' },
        { type_id: 'mrrb', type_name: '日榜黑料' },
        { type_id: 'zbjx', type_name: '周榜精选' },
        { type_id: 'ybrg', type_name: '月榜热瓜' },
        { type_id: 'ycsq', type_name: '原创社区' },
        { type_id: 'qqqw', type_name: '全球奇闻' },
        { type_id: 'xycg', type_name: '校园黑料' },
    ];

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    // 分类 URL 规则：第1页 /tid/，后续 /tid/page/N/
    const url  = page > 1
        ? `${site}/${tid}/page/${page}/`
        : `${site}/${tid}/`;

    const html = await request(url);
    const $    = load(html);
    const list = parseVodList($);

    return { page, pagecount: 9999, list };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const html = await request(`${site}/archives/${id}`);
    const $    = load(html);

    const name    = $('meta[property="og:title"]').attr('content') || '';
    const pic     = $('meta[property="og:image"]').attr('content') || '';
    const year    = $('meta[property="video:release_date"]').attr('content') || '';
    const content = $('meta[property="og:description"]').attr('content') || '';

    const playParts = [];
    let index = 1;

    $('div.dplayer').each((_, element) => {
        try {
            const config = $(element).attr('config') || '';
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
            vod_id:        id,
            vod_name:      name,
            vod_pic:       pic,
            vod_year:      year,
            vod_content:   content,
            vod_play_from: '黑料网',
            vod_play_url:  playParts.join('#'),
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
    const $    = load(html);
    const list = parseVodList($);

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
        key: 'hlw',
        name: '🔥黑料网',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img',    imgProxy);
    },
};