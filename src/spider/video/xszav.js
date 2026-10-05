import { load } from 'cheerio';
import req from '../../util/req.js';

const site = 'https://xsz-av.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

const CLASSES = [
    { type_id: '/videos/japanese', type_name: '最新更新' },
    { type_id: '/videos/japanese?o=bw', type_name: '正在观看' },
    { type_id: '/videos/japanese?o=mv', type_name: '最多观看' },
    { type_id: '/videos/japanese?o=tf', type_name: '最受欢迎' },
    { type_id: '/videos/japanese?o=lg', type_name: '最长' },
    { type_id: '/videos/uncensored-leak', type_name: '无码流出' },
    { type_id: '/videos/uncensored', type_name: '无码影片' },
    { type_id: '/videos/amateur', type_name: '素人' },
    { type_id: '/tags/fc2ppv', type_name: 'FC2' },
    { type_id: '/tags/heyzo', type_name: 'HEYZO' },
    { type_id: '/tags/1pondo', type_name: '一本道' },
    { type_id: '/tags/caribbeancom', type_name: 'Caribbean' },
    { type_id: '/videos/chinese', type_name: '中国' },
    { type_id: '/videos/korean', type_name: '韩国' },
    { type_id: '/videos/western', type_name: '欧美' },
    { type_id: '/videos/hanime', type_name: '动漫' },
];

// async function request(url) {
//     const resp = await axios.post(FLARE_URL, {
//         cmd: 'request.get',
//         url: url,
//         maxTimeout: 60000,
//     });
//     return resp.data.solution.response;
// }

async function request(url, referer = '') {
    const headers = {
        'User-Agent': UA,
        Referer: referer || `${site}/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Upgrade-Insecure-Requests': '1',
    };
    // 走 req.js：自动带上 cookie.json 里的 Cookie，并保存响应 Set-Cookie
    const resp = await req.get(url, { headers });
    return resp.data;
}

function pageUrl(path, page) {
    const u = new URL(path, site);
    if (page > 1) u.searchParams.set('page', String(page));
    return u.href;
}

function parseVods(html) {
    const $ = load(html);
    const list = [];
    const seen = new Set();
    $('div.thumbnail').each((_, el) => {
        const $el = $(el);
        const href = $el.find('a[href^="/video/"]').first().attr('href') || '';
        const name = ($el.find('a.line-clamp-1').text() || $el.find('img').attr('alt') || '').replace(/\s+/g, ' ').trim();
        if (!href || !name || seen.has(href)) return;
        seen.add(href);
        const pic = $el.find('img').attr('data-src') || $el.find('img').attr('src') || '';
        const remark = ($el.find('span').last().text() || '').replace(/\s+/g, ' ').trim();
        list.push({
            vod_id: href,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remark,
        });
    });
    return list;
}

async function home() {
    let list = [];
    try {
        list = parseVods(await request(site + '/'));
    } catch {
        list = [];
    }
    return { class: CLASSES, filters: {}, list };
}

async function category(inReq) {
    const tid = String(inReq.body.id || '/videos/japanese');
    const page = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);
    try {
        const list = parseVods(await request(pageUrl(tid, page),site + tid));
        return { page, pagecount: list.length ? page + 1 : page, list };
    } catch {
        return { page, pagecount: page, list: [] };
    }
}

async function detail(inReq) {
    const id = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '');
    if (!id) return { list: [] };
    const page = id.startsWith('http') ? id : site + (id.startsWith('/') ? id : `/video/${id}`);
    const html = await request(page);
    const $ = load(html);
    const name = $('h1').first().text().replace(/\s+/g, ' ').trim() || $('meta[name="og:title"]').attr('content') || '';
    const pic = $('meta[name="og:image"]').attr('content') || $('img[src*="tmb"]').first().attr('src') || '';
    const desc = $('meta[name="description"]').attr('content') || '';
    const src = $('video[src*=".m3u8"]').attr('src') || '';
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_content: desc,
            vod_play_from: 'XSZ',
            vod_play_url: src ? `播放$${src}` : '',
        }],
    };
}

function bestVariant(text) {
    const lines = text.split('\n').map((line) => line.trim());
    let best = '';
    let height = -1;
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
        const match = lines[i].match(/RESOLUTION=\d+x(\d+)/);
        const h = match ? parseInt(match[1], 10) : 0;
        const next = lines[i + 1] || '';
        if (next.startsWith('http') && h >= height) {
            height = h;
            best = next;
        }
    }
    return best;
}

async function play(inReq) {
    let id = String(inReq.body.id || '');
    const referer = `${site}/`;
    if (!id.includes('.m3u8')) {
        const page = id.startsWith('http') ? id : site + (id.startsWith('/') ? id : `/video/${id}`);
        const html = await request(page);
        const match = html.match(/<video[^>]*\ssrc="([^"]+\.m3u8)"/i);
        id = match ? match[1] : '';
    }
    const header = { 'User-Agent': UA, Referer: referer };
    if (!id) return { parse: 0, url: '', header };
    const master = await request(id, referer);
    const variant = bestVariant(master);
    const url = variant || (id.startsWith('http') ? id : new URL(id, site).href);
    return { parse: 0, url, header };
}

async function search(inReq) {
    const wd = String(inReq.body.wd || '').trim();
    const page = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);
    if (!wd) return { list: [], page };
    try {
        const list = parseVods(await request(pageUrl(`/search/${encodeURIComponent(wd)}`, page)));
        return { list, page };
    } catch {
        return { list: [], page };
    }
}

export default {
    meta: {
        key: 'xszav',
        name: '🌸XSZ-AV',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
