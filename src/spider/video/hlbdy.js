import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

const site = 'https://heiliao.com';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.7049.96 Safari/537.36',
    'Referer':    `${site}/`,
};

const SELECTORS = ['.video-item', '.video-list .item', '.list-item', '.post-item'];

const PORT = process.env.DEV_HTTP_PORT || 9988;

// ─── 工具函数 ──────────────────────────────────────────────────────────────

async function request(url) {
    const resp = await axios.get(url, { headers });
    return resp.data;
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

function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('//'))  return 'https:' + u;
    if (u.startsWith('/'))   return site + u;
    return u;
}

function shouldDecrypt(url) {
    const u = (url || '').toLowerCase();
    return ['pic.gylhaa.cn', 'new.slfpld.cn', '/upload_01/', '/upload/'].some(x => u.includes(x));
}

function extractImgFromOnload(onload) {
    const m = (onload || '').match(/load(?:Share)?Img\s*\([^,]+,\s*['"]([^'"]+)['"]/);
    return m ? m[1] : '';
}

function getImgUrl($el) {
    const src = $el.attr('src') || $el.attr('data-src') || '';
    const enc = extractImgFromOnload($el.attr('onload') || '');
    const t   = enc || src;
    if (!t) return '';
    if (enc || shouldDecrypt(t)) {
        return `http://127.0.0.1:${PORT}/spider/heiliao/3/img?url=${encodeURIComponent(e64(t))}`;
    }
    return absUrl(t);
}

function parseItems($) {
    for (const sel of SELECTORS) {
        const items = [];
        $(sel).each((_, el) => {
            const $el    = $(el);
            const title  = $el.find('.title, h3, h4, .video-title').text().trim();
            const link   = $el.find('a').attr('href');
            if (!title || !link) return;
            const imgEl  = $el.find('img');
            items.push({
                vod_id:      absUrl(link),
                vod_name:    title,
                vod_pic:     imgEl.length ? getImgUrl(imgEl) : '',
                vod_remarks: $el.find('.date, .time, .remarks, .duration').text().trim() || '',
            });
        });
        if (items.length) return items;
    }
    return [];
}

// ─── API 处理函数 ──────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const cateManual = {
        '最新黑料': 'hlcg', '今日热瓜': 'jrrs', '每日TOP10': 'mrrb',
        '周报精选': 'zbjx', '月榜热瓜': 'ybrg', '反差女友': 'fczq',
        '校园黑料': 'xycg', '网红黑料': 'whhl', '明星丑闻': 'mxcw',
        '原创社区': 'ycsq', '推特社区': 'ttsq', '社会新闻': 'shxw',
        '官场爆料': 'gchl', '影视短剧': 'ysdj', '全球奇闻': 'qqqw',
        '黑料课堂': 'hlkt', '每日大赛': 'mrds', '激情小说': 'jqxs',
        '桃图杂志': 'ttzz', '深夜综艺': 'syzy', '独家爆料': 'djbl',
    };
    return {
        class:   Object.entries(cateManual).map(([k, v]) => ({ type_name: k, type_id: v })),
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const pg   = parseInt(inReq.body.page) || 1;
    const url  = pg === 1 ? `${site}/${tid}/` : `${site}/${tid}/page/${pg}/`;
    const html = await request(url);
    const $    = load(html);
    const list = parseItems($);
    return { page: pg, pagecount: 9999, limit: 90, total: 999999, list };
}

async function detail(inReq, _outResp) {
    const tid  = inReq.body.id;
    const url  = tid.startsWith('http') ? tid : `${site}${tid}`;
    const resp = await axios.get(url, { headers, responseType: 'arraybuffer' });

    const htmlText = Buffer.from(resp.data).toString('utf-8');
    const $        = load(htmlText);

    // 标题
    let title = $('title').text().replace(' - 黑料网', '').trim();

    // 封面
    let pic = $('meta[property="og:image"]').attr('content') || '';
    if (!pic || (!pic.endsWith('.png') && !pic.endsWith('.jpg') && !pic.endsWith('.jpeg'))) {
        const imgEl = $('.video-item-img img');
        pic = imgEl.length ? getImgUrl(imgEl) : '';
    }

    // 简介
    let content = $('meta[name="description"]').attr('content') || '';
    if (!content) content = $('.content').text().slice(0, 200);

    // 播放地址
    const playFrom = [];
    const playUrl  = [];

    // 1. dplayer
    $('.dplayer').each((i, el) => {
        let cfg = $(el).attr('config') || '';
        let u   = '';
        try {
            cfg = cfg
                .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
                .replace(/&amp;/g,  '&').replace(/&#38;/g,  '&')
                .replace(/&lt;/g,   '<').replace(/&#60;/g,  '<')
                .replace(/&gt;/g,   '>').replace(/&#62;/g,  '>');
            u = (JSON.parse(cfg)?.video?.url || '');
        } catch {
            const m = cfg.match(/"url"\s*:\s*"([^"]+)"/);
            u = m ? m[1] : '';
        }
        if (u) {
            u = u.replace(/\\\//g, '/');
            playFrom.push(`视频${i + 1}`);
            playUrl.push(absUrl(u));
        }
    });

    // 2. 正则匹配 m3u8
    if (!playUrl.length) {
        const patterns = [
            /https:\/\/hls\.[^"']+\.m3u8[^"']*/g,
            /https:\/\/[^"']+\.m3u8\?auth_key=[^"']*/g,
            /\/\/hls\.[^"']+\.m3u8[^"']*/g,
        ];
        for (const pat of patterns) {
            const matches = [...htmlText.matchAll(pat)].map(m => absUrl(m[0]));
            for (const u of matches) {
                playFrom.push(`视频${playFrom.length + 1}`);
                playUrl.push(u);
                if (playUrl.length >= 3) break;
            }
            if (playUrl.length) break;
        }
    }

    // 3. JS 变量中提取
    if (!playUrl.length) {
        const jsPatterns = [
            /video[\s\S]{0,500}?url[\s"'`:=]+([^"'`\s]+)/g,
            /videoUrl[\s"'`:=]+([^"'`\s]+)/g,
            /src[\s"'`:=]+([^"'`\s]+\.m3u8[^"'`\s]*)/g,
        ];
        for (const pat of jsPatterns) {
            for (const m of htmlText.matchAll(pat)) {
                let u = m[1];
                if (!u.includes('.m3u8')) continue;
                if (u.startsWith('//'))     u = 'https:' + u;
                else if (u.startsWith('/')) u = site + u;
                else if (!u.startsWith('http')) u = 'https://' + u;
                playFrom.push(`视频${playFrom.length + 1}`);
                playUrl.push(u);
                if (playUrl.length >= 3) break;
            }
            if (playUrl.length) break;
        }
    }

    // 4. 兜底
    if (!playUrl.length) {
        playFrom.push('示例视频');
        playUrl.push('https://hls.obmoti.cn/videos5/b9699667fbbffcd464f8874395b91c81/b9699667fbbffcd464f8874395b91c81.m3u8?auth_key=1760372539-68ed273b94e7a-0-3a53bc0df110c5f149b7d374122ef1ed&v=2');
    }

    return {
        list: [{
            vod_id:        tid,
            vod_name:      title,
            vod_pic:       pic,
            vod_content:   content,
            vod_play_from: playFrom.join('$$$'),
            vod_play_url:  playUrl.join('$$$'),
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse:  0,
        url:    inReq.body.id,
        header: { 'User-Agent': headers['User-Agent'], 'Referer': `${site}/` },
    };
}

async function search(inReq, _outResp) {
    const keyword = encodeURIComponent(inReq.body.wd);
    const html    = await request(`${site}/index/search?word=${keyword}`);
    const $       = load(html);
    return { list: parseItems($) };
}

// ─── 图片代理 ──────────────────────────────────────────────────────────────

async function imgProxy(inReq, reply) {
    try {
        let url = d64(inReq.query.url);
        if (url.startsWith('//'))    url = 'https:' + url;
        else if (url.startsWith('/')) url = site + url;

        const resp = await axios.get(url, {
            headers:      { 'User-Agent': headers['User-Agent'], 'Referer': `${site}/` },
            responseType: 'arraybuffer',
            timeout:      15000,
        });
        if (resp.status !== 200) return reply.code(404).send('');

        const decrypted = aesDecrypt(Buffer.from(resp.data));
        let   ct        = 'image/jpeg';
        if (decrypted.slice(0, 4).toString('hex') === '89504e47') ct = 'image/png';
        else if (decrypted.slice(0, 4).toString()  === 'GIF8')    ct = 'image/gif';

        reply.header('Content-Type', ct).send(decrypted);
    } catch {
        reply.code(404).send('');
    }
}

// ─── 导出 ──────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'heiliao',
        name: '黑料不打烊',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
        fastify.get('/img',       imgProxy);
    },
};