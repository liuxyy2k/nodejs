import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

const site = 'https://xiang512.xiang.party/xcpd';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

const http = axios.create({
    timeout: 15_000,
    headers: { 'User-Agent': UA, Referer: site },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function absUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return new URL(url, site).href;
}

// 解析视频卡片（home / category / search 共用）
function parseCards($) {
    const list = [];
    $('ul.thumbnail-group.clearfix li').each((_, el) => {
        try {
            const item  = $(el);
            const a     = item.find('a.thumbnail');
            if (!a.length) return;

            const href  = a.attr('href') || '';
            const idMatch = href.match(/\/vod(?:detail|play)\/(\d+)/);
            if (!idMatch) return;
            const vod_id = idMatch[1];

            const pic  = a.find('img').attr('src') || '';
            const info = item.find('.video-info');
            let name = '', remarks = '';

            if (info.length) {
                const h5a = info.find('h5 a');
                name    = h5a.attr('title')?.trim() || h5a.text().trim();
                remarks = info.find('p').text().trim();
            } else {
                name = a.attr('title') || '';
            }

            list.push({ vod_id, vod_name: name, vod_pic: pic, vod_remarks: remarks });
        } catch { /* ignore */ }
    });
    return list;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '1', type_name: '在线看片' },
        { type_id: '2', type_name: '无需等待' },
        { type_id: '3', type_name: '不用下载' },
        { type_id: '4', type_name: '全部免费' },
    ];

    let list = [];
    try {
        const { data } = await http.get(`${site}/`);
        const $  = cheerio.load(data);
        list     = parseCards($).slice(0, 20);
    } catch { /* ignore */ }

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;

    const { data } = await http.get(`${site}/vodtype/${tid}-${pg}.html`);
    const $ = cheerio.load(data);

    // 解析总页数：共XX条数据,当前X/N页
    let pagecount = pg;
    $('*').contents().filter((_, n) => n.type === 'text').each((_, n) => {
        const m = n.data?.match(/\/(\d+)页/);
        if (m) { pagecount = parseInt(m[1]); return false; }
    });

    return { page: pg, pagecount, list: parseCards($) };
}

async function detail(inReq, _outResp) {
    const vid = Array.isArray(inReq.body.id) ? inReq.body.id[0] : String(inReq.body.id).split(',')[0];

    const { data } = await http.get(`${site}/voddetail/${vid}.html`);
    const $ = cheerio.load(data);

    const title = $('h1.appel-title').text().trim()
               || $('title').text().replace('视频介绍--香肠派对', '').trim();

    const pic = $('img.appel-img').attr('src')
             || $('.detail-poster img').attr('src')
             || '';

    const desc = $('.detail-content').text().trim()
              || $('.appel-content').text().trim();

    const fromList = [];
    const urlList  = [];

    // 方案一：.detail-tab + ul.detail-play-list
    const tabs1  = $('.detail-tab li a');
    const blocks = $('ul.detail-play-list').toArray();
    if (blocks.length) {
        blocks.forEach((block, i) => {
            const lineName = tabs1.eq(i).text().trim() || `线路${i + 1}`;
            const urls = [];
            $(block).find('a').each((_, a) => {
                const href = $(a).attr('href') || '';
                if (!href) return;
                const name = $(a).text().trim() || `第${urls.length + 1}集`;
                urls.push(`${name}$${absUrl(href)}`);
            });
            if (urls.length) { fromList.push(lineName); urlList.push(urls.join('#')); }
        });
    }

    // 方案二：.ff-playurl-tab
    if (!fromList.length) {
        const tabs2 = $('.ff-playurl-tab li a');
        $('.ff-playurl-tab-pane').each((i, block) => {
            const lineName = tabs2.eq(i).text().trim() || `线路${i + 1}`;
            const urls = [];
            $(block).find('a').each((_, a) => {
                const href = $(a).attr('href') || '';
                if (!href) return;
                const name = $(a).text().trim() || `第${urls.length + 1}集`;
                urls.push(`${name}$${absUrl(href)}`);
            });
            if (urls.length) { fromList.push(lineName); urlList.push(urls.join('#')); }
        });
    }

    return {
        list: [{
            vod_id:        vid,
            vod_name:      title,
            vod_pic:       pic,
            vod_content:   desc,
            vod_play_from: fromList.join('$$$'),
            vod_play_url:  urlList.join('$$$'),
        }],
    };
}

async function play(inReq, _outResp) {
    const id      = inReq.body.id;
    const playUrl = id.startsWith('http') ? id : absUrl(id);

    let html = '';
    try {
        const { data } = await http.get(playUrl);
        html = data;
    } catch {
        return { parse: 1, url: playUrl };
    }

    // 方法1：player_aaaa JSON
    const aaaMatch = html.match(/var\s+player_aaaa\s*=\s*(\{.*?\});/s);
    if (aaaMatch) {
        try {
            const fixed = aaaMatch[1].replace(/(\w+):/g, '"$1":');
            const obj   = JSON.parse(fixed);
            if (obj.url) return { parse: 0, url: obj.url };
        } catch { /* ignore */ }
    }

    // 方法2：playleft td 内的 iframe
    const ifr1 = html.match(/<td[^>]*id="playleft"[^>]*>.*?<iframe[^>]+src="([^"]+)"/s);
    if (ifr1) {
        const m = ifr1[1].match(/[?&]url=([^&]+)/);
        if (m) return { parse: 0, url: decodeURIComponent(m[1]) };
        if (ifr1[1].includes('.m3u8')) return { parse: 0, url: ifr1[1] };
    }

    // 方法3：任意 iframe
    const ifr2 = html.match(/<iframe[^>]+src="([^"]+)"/);
    if (ifr2) {
        const m = ifr2[1].match(/[?&]url=([^&]+)/);
        if (m) return { parse: 0, url: decodeURIComponent(m[1]) };
    }

    // 方法4：直接提取 m3u8
    const m3u8 = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
    if (m3u8) return { parse: 0, url: m3u8[0] };

    // 方法5：交给解析器
    return { parse: 1, url: playUrl };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    const pg  = parseInt(inReq.body.pg) || 1;

    const { data } = await http.get(
        `${site}/vodsearch/-------------.html?wd=${key}&page=${pg}`
    );
    const $ = cheerio.load(data);
    return { list: parseCards($), page: pg };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'xcpd',
        name: '🔥香肠派对',
        type: 1,
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