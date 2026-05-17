import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://91porna.com';

const PORT   = process.env.DEV_HTTP_PORT || 9988;

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
        // httpsAgent: agent

    });
    return resp.data;
}

function proxyImgUrl(raw) {
    return `http://127.0.0.1:${PORT}/spider/porna91/3/img?url=${encodeURIComponent(e64(raw))}`;
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

function parseVods($) {
    const videos = [];
    $('div.video-item').each((_, element) => {
        const imgEl = $(element).find('.w-full').attr('data-src') ;
        const url = $(element).find('.flex').attr('href') || '';
        const name = $(element).find('.w-full').attr('alt') || '';
        const time = $(element).find('div.w-full').text().trim();
        videos.push({
            vod_id: url,
            vod_name: name,
            vod_pic: imgEl.length ? proxyImgUrl(imgEl) : '',
            vod_remarks: time,
        });
    });
    return videos;
}

function toBase(num, radix) {
    if (num < radix) {
        if (num < 10) return String(num);
        if (num < 36) return String.fromCharCode('a'.charCodeAt(0) + num - 10);
        return String.fromCharCode('A'.charCodeAt(0) + num - 36);
    }
    return toBase(Math.floor(num / radix), radix) + toBase(num % radix, radix);
}

function unpack(packed) {
    const match = packed.match(/\}\('(.*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\)/s);
    if (!match) return '';

    let payload = match[1];
    const radix = parseInt(match[2]);
    const count = parseInt(match[3]);
    const keywords = match[4].split('|');

    for (let i = count - 1; i >= 0; i--) {
        const word = (i < keywords.length && keywords[i]) ? keywords[i] : toBase(i, radix);
        const key = toBase(i, radix);
        payload = payload.replace(new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), word);
    }

    payload = payload.replace(/\\\//g, '/');
    payload = payload.replace(/\\u003e/g, '>');
    payload = payload.replace(/\\u003c/g, '<');
    payload = payload.replace(/\\"/g, '"');

    return payload;
}

function unpackUrl(source) {
    const match = source.match(/\}\('(.*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\)/s);
    if (!match) return '';

    let payload = match[1];
    const radix = parseInt(match[2]);
    const count = parseInt(match[3]);
    const keywords = match[4].split('|');

    for (let i = count - 1; i >= 0; i--) {
        if (i >= keywords.length || !keywords[i]) continue;
        const word = keywords[i];
        const key = toBase(i, radix);
        payload = payload.replace(new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), word);
    }

    payload = payload.replace(/\\'/g, "'");
    payload = payload.replace(/\\\\/g, '');

    return payload;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'comic/av/cate?type=update', type_name: '最近更新AV' },
        { type_id: 'comic/av/cate?type=new', type_name: '最近上市AV' },
        { type_id: 'comic/av/cate?type=hot', type_name: '热门AV' },
        { type_id: '/index/search?keyword=探花', type_name: '91探花' },
        { type_id: '/index/video?category=original', type_name: '国产原创' },
        { type_id: '/index/search?keyword=吃瓜+黑料+爆料', type_name: '吃瓜爆料' },
        { type_id: '/index/search?keyword=熟女', type_name: '熟女' },
        { type_id: '/index/search?keyword=萝莉', type_name: '萝莉' },
        { type_id: '/index/search?keyword=动漫', type_name: '动漫' },
        { type_id: '/index/search?keyword=换妻', type_name: '换妻' },
        { type_id: '/index/search?keyword=内射', type_name: '内射' },
        { type_id: '/index/search?keyword=按摩', type_name: '按摩' },
        { type_id: '/moviesets', type_name: '精选合集' },
        { type_id: 'now_hot', type_name: '当前最热' },
        { type_id: 'new_update', type_name: '最近更新' },
        { type_id: 'original', type_name: '91原创' },
        { type_id: 'now_month_hot', type_name: '本月最热' },
        { type_id: 'ten_minutes', type_name: '10分钟以上' },
        { type_id: 'twenty_minutes', type_name: '20分钟以上' },
        { type_id: 'now_month_collect', type_name: '本月收藏' },
        { type_id: 'hd', type_name: '高清' },
        { type_id: 'month_hot', type_name: '每月最热' },
        { type_id: 'now_month_comment', type_name: '本月讨论' },
        { type_id: 'max_collect', type_name: '收藏最多' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    let list = []

    if(tid === '/moviesets') {
        let url = `${site}/moviesets/${page}`;
        const html = await request(url);
        const $ = load(html);
        $('div.video-item').each((_, element) => {
            const imgEl = $(element).find('.w-full').attr('data-src') ;
            const url = $(element).find('.flex').attr('href') || '';
            const name = $(element).find('.w-full').attr('alt') || '';
            const count = $(element).find('.items-center span').eq(1).text().trim();
            list.push({
                vod_id:   `folder_${url}`,
                vod_name: name,
                vod_pic: imgEl.length ? proxyImgUrl(imgEl) : '',
                vod_remarks: count,
                vod_tag:  'folder',
            });
        });

    } else if (tid.startsWith('folder_')) {
        const url = tid.replace('folder_', '');
        let url2 = `${site}${url}/page/${page}`;
        const html = await request(url2);
        const $ = load(html);
        list = parseVods($);
    } else  {
        let url = ''
        if(tid.startsWith('comic')) {
            url = `${site}/${tid}`;
        } else if (tid.startsWith('/')) {
            url = `${site}${tid}`;
        } else {
            url = `${site}/comic/index/video?category=${tid}`;
        }
    
        if (page > 1) url += `&page=${page}`;

        const html = await request(url);
        const $ = load(html);
        list = parseVods($);
    }
    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(`${site}${id}`);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';

    let playUrl = '';
    const match = html.match(
        /eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\('[\s\S]+?'\.split\('\|'\),0,\{\}\)\)/
    );
    let packed = match?.[0] || '';
    packed = packed.replace(/^eval/, '');
    const ob = eval(packed);
    const base = ob.match(/\/index\/detail_play\?[\s\S]*?&u=/)?.[0] || '';
    const u = ob.match(/encodeURIComponent\("([^"]+)"/)?.[1] || '';
    const t = Math.floor(Date.now() / 1000 / 1800);
    let finalUrl =
        base +
        encodeURIComponent(u) +
        '&t=' + t;
    let jsContent = await request(site + finalUrl);
    jsContent = jsContent.replace(/^eval/, '');
    const unpacked2 = eval(jsContent);
   
    playUrl = unpacked2.match(/https?:\/\/[^'"]+\.m3u8[^'"]*/i)?.[0];
    

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: '91Porna',
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
    const html = await request(`${site}/search?keywords=${text}`);
    const $ = load(html);
    const list = parseVods($);

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
        key: 'porna91',
        name: '🔥91Porna',
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