import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const site = 'https://www.xhy11.sbs';

/**
 * 站点所有页面都被包了一层：
 *   <script>document.write(decodeURIComponent(atob("...")))</script>
 * 必须解两层：base64 -> URIComponent
 */
function decodeHtml(raw) {
    if (typeof raw !== 'string') return raw;
    const match = raw.match(/atob\("([^"]+)"\)/);
    if (!match) return raw;
    try {
        const base = Buffer.from(match[1], 'base64').toString('utf8');
        return decodeURIComponent(base);
    } catch (e) {
        return raw;
    }
}

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, Referer: `${site}/`, ...headers },
        timeout: 25000,
    });
    return decodeHtml(resp.data);
}

function parseVods($) {
    const videos = [];
    $('ul.img-list li a').each((_, element) => {
        const $a = $(element);
        const url = $a.attr('href') || '';
        const name = $a.find('p.txt-ov').text().trim() || $a.find('h2').text().trim();
        const pic = $a.find('img').attr('data-original') || $a.find('img').attr('src') || '';
        const hit = url.match(/\/detail\/id\/(\d+)\.html/);
        const id = (hit && hit[1]) || '';
        if (!id || !name) return;
        if (pic.includes('/template/dhseo/images/load.png')) return;
        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
        });
    });
    return videos;
}

function parsePageCount($, page) {
    let pagecount = page;
    $('div.mac_pages a').each((_, element) => {
        const href = $(element).attr('href') || '';
        const match = href.match(/\/page\/(\d+)\.html/);
        if (!match) return;
        const n = parseInt(match[1]);
        if (n > pagecount) pagecount = n;
    });
    return pagecount;
}

/**
 * 播放页里挂着 var player_aaaa = {...}，真实地址在 url 字段
 */
function parsePlayerUrl(html) {
    const match = html.match(/player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
    if (match) {
        try {
            const data = JSON.parse(match[1]);
            if (data && data.url) return data.url;
        } catch (e) {
            // JSON 里带转义字符时可能失败，走下面的正则兜底
        }
    }
    const fallback = html.match(/"url"\s*:\s*"([^"]+?\.(?:m3u8|mp4)[^"]*)"/);
    return fallback ? fallback[1].replace(/\\\//g, '/') : '';
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '45', type_name: '自拍偷拍' },
        { type_id: '46', type_name: '伦理禁忌' },
        { type_id: '47', type_name: '网爆黑料' },
        { type_id: '48', type_name: '绿帽淫妻' },
        { type_id: '49', type_name: '制服诱惑' },
        { type_id: '50', type_name: '国产制作' },
        { type_id: '51', type_name: '国产直播' },
        { type_id: '52', type_name: '韩国直播' },
        { type_id: '53', type_name: '会所技师' },
        { type_id: '54', type_name: '淫乱学生' },
        { type_id: '55', type_name: '主播网红' },
        { type_id: '56', type_name: '国产推荐' },
        { type_id: '57', type_name: '探花大神' },
        { type_id: '58', type_name: '中文字幕' },
        { type_id: '59', type_name: '高清无码' },
        { type_id: '60', type_name: '高清有码' },
        { type_id: '61', type_name: '日本素人' },
        { type_id: '62', type_name: '无码流出' },
        { type_id: '63', type_name: 'FC2' },
        { type_id: '64', type_name: '东京热' },
        { type_id: '65', type_name: '一本道' },
        { type_id: '66', type_name: '欧美精品' },
        { type_id: '67', type_name: '重口猎奇' },
    ];

    const html = await request(site);
    const $ = load(html);
    const list = parseVods($);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    let url = `${site}/index.php/vod/type/id/${tid}.html`;
    if (page > 1) {
        url = `${site}/index.php/vod/type/id/${tid}/page/${page}.html`;
    }

    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: parsePageCount($, page), list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = `${site}/index.php/vod/detail/id/${id}.html`;
    const html = await request(url);
    const $ = load(html);

    const name = $('div.content-info').first().text().trim() || $('title').text().split('小黄鸭')[0].trim();
    const pic = $('div.detail-pic img').attr('src') || '';

    let playUrl = '';
    try {
        const playLink = $('div.play-btn a').attr('href') || `/index.php/vod/play/id/${id}/sid/1/nid/1.html`;
        const playHtml = await request(playLink.startsWith('http') ? playLink : `${site}${playLink}`);
        const src = parsePlayerUrl(playHtml);
        if (src) playUrl = `第1集$${src}`;
    } catch (e) {
        playUrl = '';
    }

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: '',
            vod_play_from: '小黄鸭',
            vod_play_url: playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    let url = id;

    if (/^\d+$/.test(id)) {
        try {
            const html = await request(`${site}/index.php/vod/play/id/${id}/sid/1/nid/1.html`);
            url = parsePlayerUrl(html);
        } catch (e) {
            url = '';
        }
    }

    return {
        parse: 0,
        url,
        header: { 'User-Agent': UA, Referer: `${site}/` },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const url = `${site}/index.php/vod/search.html?wd=${text}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'xhy11',
        name: '🦆小黄鸭',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
