import axios from 'axios';
import * as cheerio from 'cheerio';

const site = 'https://luyitian.com';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const http = axios.create({
    timeout: 10_000,
    headers: {
        'User-Agent':      UA,
        Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Connection:        'keep-alive',
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchHtml(url, referer = site) {
    const { data } = await http.get(url, { headers: { Referer: referer } });
    return data;
}

function absUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//'))   return 'https:' + url;
    return new URL(url, site).href;
}

// 解析视频卡片列表（category / search 共用）
function parseCards($) {
    const selectors = [
        'div#mdym > div',
        '.stui-vodlist__item',
        '.myui-vodlist__box',
        '.video-item',
        '.item',
        '.vodlist_item',
        '.video-img-box',
    ];

    let items = [];
    for (const sel of selectors) {
        const found = $(sel).toArray();
        if (found.length) { items = found; break; }
    }

    const list = [];
    for (const el of items) {
        const item = $(el);
        const a    = item.find('a').first();
        if (!a.length) continue;

        const href     = a.attr('href') || '';
        const vidMatch = href.match(/\/vodplay\/(\d+)/);
        const vid      = vidMatch ? vidMatch[1] : href;

        const img  = item.find('img').first();
        let name   = img.attr('alt')?.trim()
                  || a.attr('title')?.trim()
                  || item.find('.title, .name, .text').first().text().trim()
                  || a.text().trim()
                  || '未知标题';

        let pic = img.attr('data-src') || img.attr('src') || '';
        if (pic && !pic.startsWith('http')) pic = absUrl(pic);

        const remarkEl = item.find('.remarks, .note, .tag, .sub-title').first();
        let remark = remarkEl.text().trim();
        if (!remark) {
            const lines = item.text().split('\n').map((l) => l.trim()).filter(Boolean);
            remark = lines.length ? lines[lines.length - 1].slice(0, 20) : '';
        }

        list.push({ vod_id: vid, vod_name: name.trim(), vod_pic: pic, vod_remarks: remark });
    }
    return list;
}

// ─── JS 解码（atob / unescape / 直接提取 m3u8）─────────────────────────────

function jsDecode(js) {
    const b64 = js.match(/atob\s*\(\s*["']([^"']+)["']\s*\)/);
    if (b64) {
        try { return Buffer.from(b64[1], 'base64').toString('utf-8'); } catch { /* ignore */ }
    }
    const unesc = js.match(/unescape\s*\(\s*["']([^"']+)["']\s*\)/);
    if (unesc) {
        try { return decodeURIComponent(unesc[1]); } catch { /* ignore */ }
    }
    const direct = js.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
    return direct ? direct[1] : null;
}

function sniffM3u8(html, pageUrl) {
    const patterns = [
        /fetch\s*\(\s*["']([^"']+\.m3u8[^"']*)['"]/i,
        /XMLHttpRequest.*?\.open\s*\(\s*["']GET["']\s*,\s*["']([^"']+\.m3u8[^"']*)['"]/is,
        /\.get\s*\(\s*["']([^"']+\.m3u8[^"']*)['"]/i,
        /url\s*:\s*["']([^"']+\.m3u8[^"']*)['"]/i,
        /src\s*=\s*["']([^"']+\.m3u8[^"']*)['"]/i,
    ];
    for (const pat of patterns) {
        const m = html.match(pat);
        if (m) return absUrl(m[1]);
    }
    // script 标签逐个尝试 jsDecode
    for (const m of html.matchAll(/<script[^>]*>(.*?)<\/script>/gis)) {
        const found = jsDecode(m[1]);
        if (found?.includes('.m3u8')) return found;
    }
    return null;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '28', type_name: '中文字幕' },
        { type_id: '20', type_name: '国产'     },
        { type_id: '21', type_name: '日本有码' },
        { type_id: '22', type_name: '日本无码' },
        { type_id: '23', type_name: '欧美'     },
        { type_id: '24', type_name: '动漫'     },
        { type_id: '25', type_name: '伦理'     },
        { type_id: '36', type_name: '韩国'     },
        { type_id: '41', type_name: '另类'     },
    ];

    const filters = {
        '28': [{ key: 'tid', name: '子分类', value: [{ n: '全部', v: '28' }, { n: '日本中字', v: '51' }] }],
        '20': [{ key: 'tid', name: '子分类', value: [{ n: '全部', v: '20' }, { n: '国产精品', v: '26' }, { n: '国产剧情', v: '27' }, { n: '国产自拍', v: '29' }, { n: '国产主播', v: '35' }, { n: '国模私拍', v: '85' }, { n: '网红明星', v: '91' }, { n: '国产SM', v: '105' }, { n: '台湾辣妹', v: '107' }, { n: '香港正妹', v: '108' }] }],
        '21': [{ key: 'tid', name: '子分类', value: [{ n: '全部', v: '21' }, { n: '人妻', v: '31' }, { n: '素人', v: '44' }, { n: '口爆颜射', v: '46' }, { n: '萝莉少女', v: '47' }, { n: '美乳巨乳', v: '48' }, { n: '制服诱惑', v: '52' }, { n: '调教', v: '57' }, { n: '出轨', v: '58' }, { n: '有码精品', v: '101' }] }],
        '22': [{ key: 'tid', name: '子分类', value: [{ n: '全部', v: '22' }, { n: '无码精品', v: '102' }] }],
        '23': [{ key: 'tid', name: '子分类', value: [{ n: '全部', v: '23' }, { n: '欧美精品', v: '104' }] }],
        '24': [{ key: 'tid', name: '子分类', value: [{ n: '全部', v: '24' }, { n: '动漫精品', v: '103' }] }],
        '25': [{ key: 'tid', name: '子分类', value: [{ n: '全部', v: '25' }, { n: '综合三级', v: '39' }] }],
        '36': [{ key: 'tid', name: '子分类', value: [{ n: '全部', v: '36' }, { n: '韩国主播', v: '37' }] }],
        '41': [{ key: 'tid', name: '子分类', value: [{ n: '全部', v: '41' }, { n: 'Cosplay', v: '106' }] }],
    };

    return { class: classes, filters };
}

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const pg     = parseInt(inReq.body.page) || 1;
    const extend = inReq.body.extend || {};
    const realTid = extend.tid || tid;

    const result = { list: [], page: pg, pagecount: 999, limit: 20, total: 9999 };

    try {
        const html = await fetchHtml(`${site}/vodtype/${realTid}-${pg}/`);
        const $    = cheerio.load(html);
        result.list = parseCards($);

        // 尝试解析末页
        const pageLink = $('.page .page-link, .pagination a').first();
        if (pageLink.length) {
            const m = (pageLink.attr('href') || '').match(/(\d+)/);
            if (m) result.pagecount = Math.max(parseInt(m[1]), 1);
        }
    } catch (e) {
        console.error('category error:', e.message);
    }

    return result;
}

async function detail(inReq, _outResp) {
    const vid = inReq.body.id;
    try {
        const html  = await fetchHtml(`${site}/vodplay/${vid}-1-1/`);
        const $     = cheerio.load(html);
        const title = ($('title').text().split('|')[0] || '')
            .replace('在线播放在线观看', '')
            .replace(/[《》]/g, '')
            .trim();

        return {
            list: [{
                vod_id:        vid,
                vod_name:      title,
                vod_type:      '视频',
                vod_content:   '资源来自于网络',
                vod_play_from: 'Luyitian',
                vod_play_url:  `播放$${vid}-1-1`,
            }],
        };
    } catch (e) {
        console.error('detail error:', e.message);
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    const id      = inReq.body.id;
    const playUrl = `${site}/vodplay/${id}/`;

    try {
        const html = await fetchHtml(playUrl);
        let m3u8   = null;

       const match = html.match(
        /var\s+player_aaaa\s*=\s*({[\s\S]*?})\s*<\/script>/
        );
        
        // JS对象字符串
        const jsObject = match[1];
        // 转对象
        const data = JSON.parse(jsObject);
        m3u8 = data.url
        return {
            parse:  0,
            url:    m3u8,
            header: { 'User-Agent': UA, Referer: playUrl, Origin: site },
        };
    } catch (e) {
        console.error('play error:', e.message);
        return { parse: 1, url: playUrl };
    }
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg  = parseInt(inReq.body.pg) || 1;

    try {
        const html = await fetchHtml(`${site}/vodsearch/${encodeURIComponent(key)}----------${pg}---/`);
        const $    = cheerio.load(html);
        return { list: parseCards($) };
    } catch (e) {
        console.error('search error:', e.message);
        return { list: [] };
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'luyitian',
        name: '💋撸一天',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};