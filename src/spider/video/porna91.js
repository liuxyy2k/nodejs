import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';
import https from 'https';

const DEFAULT_HOST = 'https://91porna.com';
const PORT = process.env.DEV_HTTP_PORT || 9988;
const META_KEY = 'porna91';

const imgCache = new Map();

let host = DEFAULT_HOST;
let headers = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: `${DEFAULT_HOST}/`,
};

const http = axios.create({
    timeout: 10000,
    validateStatus: () => true,
});

function e64(text) {
    try {
        return Buffer.from(String(text)).toString('base64');
    } catch {
        return '';
    }
}

function d64(text) {
    try {
        return Buffer.from(String(text), 'base64').toString('utf8');
    } catch {
        return '';
    }
}

function joinUrl(base, path) {
    if (!path) return base || '';
    try {
        return new URL(path, base.endsWith('/') ? base : base + '/').href;
    } catch {
        return path;
    }
}

function proxyImg(url, type = 'img') {
    if (!url) return '';
    return `http://127.0.0.1:${PORT}/spider/${META_KEY}/3/img?url=${encodeURIComponent(e64(url))}&type=${type}`;
}

function toBase(n, a) {
    const digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (n === 0) return '0';
    let out = '';
    while (n) {
        const r = n % a;
        n = Math.floor(n / a);
        out = digits[r] + out;
    }
    return out;
}

function unpackPacker(s) {
    const m = String(s || '').match(
        /eval\(function\(p,a,c,k,e,(?:d|r)\)\{[\s\S]+?\}\('\s*([\s\S]*?)\s*',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)\s*,\s*0\s*,\s*\{\}\)\)/,
    );
    if (!m) return s;

    let p = m[1];
    const a = parseInt(m[2], 10);
    const c = parseInt(m[3], 10);
    const k = m[4].split('|');

    for (let i = c - 1; i >= 0; i--) {
        const key = toBase(i, a);
        const val = i < k.length && k[i] ? k[i] : key;
        p = p.replace(new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), val);
    }
    return p;
}

function aesImg(data) {
    if (!data || data.length < 16) return data;
    const pairs = [
        [Buffer.from('f5d965df75336270'), Buffer.from('97b60394abc2fbe1')],
        [Buffer.from('75336270f5d965df'), Buffer.from('abc2fbe197b60394')],
    ];
    for (const [key, iv] of pairs) {
        try {
            const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
            const dec = Buffer.concat([decipher.update(data), decipher.final()]);
            if (
                (dec[0] === 0xff && dec[1] === 0xd8) ||
                (dec[0] === 0x89 && dec[1] === 0x50) ||
                dec.slice(0, 4).toString() === 'GIF8'
            ) {
                return dec;
            }
        } catch {
            /* try next */
        }
    }
    return data;
}

function imgUrl(url) {
    url = String(url || '').trim().replace(/^['"]+|['"]+$/g, '');
    if (!url) return '';

    if (url.startsWith('data:')) {
        const b64s = url.split(',')[1] || '';
        let raw = Buffer.from(b64s, 'base64');
        if (
            !(
                (raw[0] === 0xff && raw[1] === 0xd8) ||
                (raw[0] === 0x89 && raw[1] === 0x50) ||
                raw.slice(0, 4).toString() === 'GIF8'
            )
        ) {
            raw = aesImg(raw);
        }
        const key = crypto.createHash('md5').update(raw).digest('hex');
        imgCache.set(key, raw);
        return `http://127.0.0.1:${PORT}/spider/${META_KEY}/3/img?type=cache&key=${key}`;
    }

    url = url.startsWith('http') ? url : joinUrl(host, url);
    return proxyImg(url, 'img');
}

function cr(href, name) {
    if (!href || !name) return '';
    const payload = JSON.stringify({ id: href, name });
    return `[a=cr:${payload}/]${name}[/a]`;
}

async function getHtml(url) {
    const r = await http.get(url, { headers });
    if (r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : String(r.data || '');
}

function getList($) {
    const out = [];
    const seen = new Set();

    $('div.video-item').each((_, el) => {
        const item = $(el);
        const a = item.find('a[href*="/comic/index/detail"]').first();
        if (!a.length) return;
        let href = a.attr('href') || '';
        if (!href) return;
        href = href.startsWith('http') ? href : joinUrl(host, href);
        if (seen.has(href)) return;
        seen.add(href);

        const img = item.find('img').first();
        let pic = img.attr('data-src') || img.attr('src') || '';
        if (pic.startsWith('/')) pic = joinUrl(host, pic);
        if (pic.includes('poster_loading')) pic = img.attr('data-src') || pic;

        let title = (img.attr('alt') || '').trim();
        if (!title) {
            const t = item.find('.line-clamp-2, .line-clamp-1').first();
            title = t.text().trim();
        }
        if (title.length < 2) return;

        const dur = item.text().replace(/\s+/g, ' ').trim();
        const m = dur.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
        const remark = m ? m[0] : '';

        out.push({
            vod_id: href,
            vod_name: title,
            vod_pic: pic ? imgUrl(pic) : '',
            vod_remarks: remark,
            style: { type: 'rect', ratio: 1.33 },
        });
    });

    return out;
}

async function extractPlayUrl(videoKey, fallbackHtml = '') {
    if (!videoKey) return ['', ''];

    for (const [pat, typ] of [
        [/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/i, 'm3u8'],
        [/https?:\/\/[^"'\\\s]+\.mp4[^"'\\\s]*/i, 'mp4'],
    ]) {
        const m = String(fallbackHtml || '').match(pat);
        if (m) return [m[0], typ];
    }

    const embed = `${host}/comic/index/embed?id=${videoKey}`;
    let html = await getHtml(embed);
    let unpacked = unpackPacker(html);

    let img = unpacked.match(/embed_play\.js\?img=([^"&]+)/);
    let u = unpacked.match(/encodeURIComponent\(["']([^"']+)["']\)/);
    if (!(img && u)) {
        img = html.match(/embed_play\.js\?img=([^"&]+)/);
        u = html.match(/encodeURIComponent\(["']([^"']+)["']\)/);
    }
    if (!(img && u)) return ['', ''];

    const tBucket = Math.floor(Date.now() / 1000 / 1800);
    const jsUrl = `${host}/index/embed_play.js?img=${img[1]}&u=${encodeURIComponent(u[1])}&t=${tBucket}`;
    const jsRaw = await getHtml(jsUrl);
    const js = unpackPacker(jsRaw);

    let m3 = js.match(/src=\\"(https?:\/\/[^\\"]+\.m3u8[^\\"]*)\\"/i);
    if (m3) {
        return [m3[1].replace(/\\\//g, '/').trim().replace(/^["']+|["'\\]+$/g, ''), 'm3u8'];
    }

    m3 = js.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s]*/i);
    if (m3) {
        return [m3[0].replace(/\\\//g, '/').trim().replace(/^["']+|["'\\]+$/g, ''), 'm3u8'];
    }
    const mp4 = js.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s]*/i);
    if (mp4) {
        return [mp4[0].replace(/\\\//g, '/').trim().replace(/^["']+|["'\\]+$/g, ''), 'mp4'];
    }
    return ['', ''];
}

async function init(inReq, _outResp) {
    let extend = inReq.body?.extend || '';
    if (typeof extend === 'string' && extend) {
        try {
            extend = JSON.parse(extend);
        } catch {
            extend = {};
        }
    }
    if (extend && typeof extend === 'object') {
        if (extend.host) host = String(extend.host).replace(/\/$/, '');
    }
    headers = {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: `${host}/`,
    };
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_name: '正在播放', type_id: '/comic/index/video?category=play' },
        { type_name: '当前最热', type_id: '/comic/index/video?category=now_hot' },
        { type_name: '最近更新', type_id: '/comic/index/video?category=new_update' },
        { type_name: '91原创', type_id: '/comic/index/video?category=original' },
        { type_name: '本月最热', type_id: '/comic/index/video?category=now_month_hot' },
        { type_name: '高清', type_id: '/comic/index/video?category=hd' },
        { type_name: '每月最热', type_id: '/comic/index/video?category=month_hot' },
        { type_name: '本月讨论', type_id: '/comic/index/video?category=now_month_comment' },
        { type_name: '收藏最多', type_id: '/comic/index/video?category=max_collect' },
        { type_name: '91探花', type_id: '/comic/index/search?keyword=探花' },
        { type_name: '热门排行', type_id: '/comic/index/video?category=now_month_hot' },
        { type_name: '吃瓜爆料', type_id: '/comic/index/search?keyword=吃瓜+黑料+爆料' },
        { type_name: '换妻', type_id: '/comic/index/search?keyword=换妻' },
        { type_name: '无码', type_id: '/comic/av/relvideo?model=12&type=theme&order=week' },
        { type_name: '中文字幕', type_id: '/comic/av/relvideo?model=5&type=theme&order=week' },
        { type_name: '制服诱惑', type_id: '/comic/av/relvideo?model=6&type=theme&order=week' },
        { type_name: 'AI短剧', type_id: '/comic/index/search?keyword=ai短剧' },
        { type_name: 'AI漫剧', type_id: '/comic/index/search?keyword=ai漫剧' },
        { type_name: 'AI美女', type_id: '/comic/index/search?keyword=ai美女' },
        { type_name: 'AI换脸', type_id: '/comic/index/search?keyword=+ai换脸' },
    ];
    try {
        const v = await category(
            { body: { id: classes[0].type_id, page: 1 } },
            null,
        );
        return { class: classes, filters: {}, list: v.list || [] };
    } catch {
        return { class: classes, filters: {}, list: [] };
    }
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id || '';
    const pg = parseInt(inReq.body.page, 10) || 1;
    let url = tid.startsWith('http') ? tid : joinUrl(host, tid.replace(/^\//, ''));

    const u = new URL(url);
    if (pg > 1) u.searchParams.set('page', String(pg));
    else u.searchParams.delete('page');
    url = u.toString();

    const html = await getHtml(url);
    if (!html) {
        return { list: [], page: pg, pagecount: 0, limit: 30, total: 0 };
    }
    const $ = load(html);
    const videos = getList($);
    return { list: videos, page: pg, pagecount: 9999, limit: 30, total: 999999 };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    let url = `${host}/comic/index/search?keyword=${encodeURIComponent(key)}`;
    if (pg > 1) url += `&page=${pg}`;
    const html = await getHtml(url);
    const $ = load(html);
    return { list: getList($), page: pg, pagecount: 9999 };
}

async function detail(inReq, _outResp) {
    let vidUrl = inReq.body.id || '';
    vidUrl = vidUrl.startsWith('http') ? vidUrl : joinUrl(host, vidUrl.replace(/^\//, ''));

    let videoKey = '';
    try {
        videoKey = new URL(vidUrl).searchParams.get('video_key') || '';
    } catch {
        /* ignore */
    }

    const html = await getHtml(vidUrl);
    const $ = load(html);
    const h1 = $('h1').first();
    const title = h1.length ? h1.text().trim() : ($('title').text().trim() || videoKey);
    let desc = '';
    $('#detail, .detail, article, .post-content').each((_, el) => {
        desc += $(el).text().replace(/\s+/g, ' ').trim();
    });

    const [playUrl, playType] = await extractPlayUrl(videoKey, html);
    const play = `播放$${playUrl || vidUrl}`;

    const vod = {
        vod_id: vidUrl,
        vod_name: title,
        vod_play_from: '91porna',
        vod_play_url: play,
        vod_content: desc || title,
        vod_remarks: playType || '',
    };

    const aUser = $('a[href^="/comic/index/publicvideo?"]').first();
    if (aUser.length) {
        let href = aUser.attr('href') || '';
        const name = aUser.text().replace(/\s+/g, ' ').trim();
        if (href && !href.startsWith('http')) href = joinUrl(host, href.replace(/^\//, ''));
        if (name) vod.vod_director = cr(href, name);
    }

    let intro = '';
    const h2 = $('h2.bg-base1').first();
    if (h2.length) intro = h2.text().replace(/\s*\n\s*/g, '\n').trim();

    const tags = [];
    $('ul.flex.flex-wrap.text-default.mb-3 a[href^="/comic/index/search?"]').each((_, el) => {
        const ta = $(el);
        const name = ta.text().trim();
        let href = ta.attr('href') || '';
        if (href && !href.startsWith('http')) href = joinUrl(host, href.replace(/^\//, ''));
        if (name && href) tags.push(cr(href, name));
    });

    const parts = [];
    if (tags.length) parts.push('标签: ' + tags.join(' '));
    const baseDesc = (intro || desc || title).trim();
    if (baseDesc) parts.push(baseDesc);
    if (parts.length) vod.vod_content = parts.join('\n\n');

    return { list: [vod] };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id || '',
        header: { ...headers },
    };
}

async function imgProxy(inReq, reply) {
    try {
        const type = inReq.query.type || 'img';
        if (type === 'cache') {
            const key = inReq.query.key || '';
            const buf = imgCache.get(key);
            if (!buf) return reply.code(404).send('');
            return reply.header('Content-Type', 'image/jpeg').send(buf);
        }

        let raw = d64(inReq.query.url || '');
        if (!raw) return reply.code(404).send('');
        if (!raw.startsWith('http')) raw = joinUrl(host, raw);

        const resp = await http.get(raw, {
            headers,
            responseType: 'arraybuffer',
            timeout: 10000,
        });
        const decrypted = aesImg(Buffer.from(resp.data));
        let ct = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8') ct = 'image/gif';
        return reply.header('Content-Type', ct).send(decrypted);
    } catch (e) {
        console.error('[porna91] imgProxy:', e.message);
        return reply.code(500).send('');
    }
}

export default {
    meta: {
        key: META_KEY,
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
        fastify.get('/img', imgProxy);
    },
};
