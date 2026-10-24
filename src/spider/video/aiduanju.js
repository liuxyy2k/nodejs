import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const site = 'https://eactandand.aibyq.cc';

const headers = {
    'User-Agent': UA,
    Referer: `${site}/`,
};

async function request(reqUrl, extraHeaders = {}) {
    const resp = await req.get(reqUrl, {
        headers: { ...headers, ...extraHeaders },
        validateStatus: () => true,
    });
    if (resp.status >= 400) return '';
    return resp.data;
}

function absUrl(path) {
    const u = String(path || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return u.startsWith('/') ? `${site}${u}` : `${site}/${u}`;
}

function parseVods($) {
    const list = [];
    $('.vod-card').each((_, el) => {
        list.push({
            vod_id: $(el).find('a').eq(0).attr('href') || '',
            vod_name: $(el).find('.vod-name').text().trim() || '',
            vod_pic: $(el).find('img').attr('src') || '',
            vod_remarks: $(el).find('.vod-remarks').text().trim() || '',
        });
    });
    return list;
}

async function init() {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/aidj/AIchengrenduanju/', type_name: 'AI成人短剧' },
        { type_id: '/aidj/AIchengrenmanju/', type_name: 'AI成人漫剧' },
        { type_id: '/aidj/AIhuanlian/', type_name: 'AI换脸' },
        { type_id: '/aidj/AImogai/', type_name: 'AI魔改' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq) {
    const url = `${site}${inReq.body.id}page/${inReq.body.page || inReq.body.pg || 1}/`;
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(url));
    return { page, pagecount: 9999999, list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const $ = load(await request(`${site}${id}`));
    const playList = [];
    $('.episodes a').each((_, el) => {
        const name = $(el).text().trim();
        const url = $(el).attr('href');
        if (name && url) {
            playList.push(`${name}$${url}`);
        }
    });
    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content') || '',
            vod_pic: $('meta[property="og:image"]').attr('content') || '',
            vod_content: $('meta[property="og:description"]').attr('content') || '',
            vod_play_from: 'AI不花钱',
            vod_play_url: playList.join('#'),
        }],
    };
}

function parsePlayerData(html) {
    const match = String(html || '').match(/var\s+player_data\s*=\s*(\{[\s\S]*?\})\s*;?/);
    if (!match) return null;
    try {
        return JSON.parse(match[1]);
    } catch {
        return null;
    }
}

async function loadPlayPageHtml(idPath) {
    let path = String(idPath || '').split('$')[0].split('#')[0].trim();
    if (!path.startsWith('/')) path = `/${path.replace(/^\/+/, '')}`;

    let html = await request(`${site}${path}`, { Referer: `${site}${path}` });
    if (parsePlayerData(html)) return { html, path };

    if (/\/detail\//.test(path)) {
        const $ = load(html);
        const playHref = $('.episodes a').first().attr('href');
        if (playHref) {
            path = playHref.startsWith('/') ? playHref : `/${playHref}`;
            html = await request(`${site}${path}`, { Referer: `${site}${path}` });
        }
    }
    return { html, path };
}

async function play(inReq) {
    const { html, path: playPath } = await loadPlayPageHtml(inReq.body.id);
    const playerData = parsePlayerData(html);
    if (!playerData?.url) {
        return { parse: 0, url: '' };
    }

    const [vodId, ep] = String(playerData.url).split('|');
    const playerReferer = `${site}/static/player/huangguo.html?url=${encodeURIComponent(playerData.url)}`;
    const apiUrl = `${site}/huangguo.php?ac=play&id=${vodId}&ep=${ep}&_=${Date.now()}`;
    const playResp = await req.get(apiUrl, {
        headers: { 'User-Agent': UA, Referer: playerReferer },
        validateStatus: () => true,
    });
    const body = playResp.data;
    let m3u8 = typeof body === 'object' && body != null ? body.url : '';
    m3u8 = absUrl(m3u8);

    return {
        parse: 0,
        url: m3u8,
        header: {
            'User-Agent': UA,
            Referer: playerReferer,
        },
    };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search?q=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'aiduanju', name: '📖AI不花钱', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
