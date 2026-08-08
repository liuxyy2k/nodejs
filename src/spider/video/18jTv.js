import axios from 'axios';

const site = 'https://18j.tv';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36',
    Referer: `${site}/`,
};

const httpClient = axios.create({
    timeout: 12_000,
    headers: HEADERS,
});

async function fetchHtml(url) {
    const fullUrl = url.startsWith('http') ? url : site + url;
    try {
        const { data } = await httpClient.get(fullUrl);
        return data || '';
    } catch {
        return '';
    }
}

function stripText(s) {
    return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function parseList(html) {
    const out = [];
    const seen = new Set();
    const blocks = [...String(html || '').matchAll(/<div class="box">(.*?)<\/li>/gis)];
    for (const [, block] of blocks) {
        const m = block.match(/<a[^>]+href=["'](\/v\/(\d+)\/?)["'][^>]*title=["']([^"']+)["']/is);
        if (!m || seen.has(m[2])) continue;
        seen.add(m[2]);
        const im = block.match(/<img[^>]+(?:data-original|data-src|src)=["']([^"']+)["']/is);
        const tag = block.match(/<div class="vodlist_img">.*?<span[^>]*>(.*?)<\/span>/is);
        out.push({
            vod_id: m[2],
            vod_name: stripText(m[3]),
            vod_pic: im ? im[1].trim() : '',
            vod_remarks: tag ? stripText(tag[1]) : '',
        });
    }
    return out;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_name: '国产', type_id: '1' },
        { type_name: '日韩', type_id: '2' },
        { type_name: '欧美', type_id: '3' },
        { type_name: '伦理', type_id: '4' },
        { type_name: '成人AI', type_id: '41' },
        { type_name: '动漫', type_id: '5' },
        { type_name: '另类', type_id: '6' },
    ];
    const vods = parseList(await fetchHtml('/'));
    return { class: classes, list: vods };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = parseInt(inReq.body.page) || 1;
    const path = pg === 1 ? `/t/${tid}/` : `/t/${tid}/page/${pg}/`;
    const vods = parseList(await fetchHtml(path));
    return {
        page: pg,
        pagecount: vods.length ? pg + 1 : pg,
        limit: vods.length,
        total: vods.length ? 999999 : 0,
        list: vods,
    };
}

async function detail(inReq, _outResp) {
    const raw = inReq.body.id;
    const vid = String(Array.isArray(raw) ? raw[0] : raw).trim();
    const url = `${site}/v/${vid}/`;
    const html = await fetchHtml(url);

    const name =
        html.match(/<h1[^>]*class=["'][^"']*play-title[^"']*["'][^>]*>(.*?)<\/h1>/is) ||
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i);
    const pic = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i);
    const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i);
    const genre = html.match(/["']genre["']\s*:\s*["']([^"']+)/i);
    const date = html.match(/["']uploadDate["']\s*:\s*["'](\d{4})/i);

    return {
        list: [{
            vod_id: vid,
            vod_name: name ? stripText(name[1]) : vid,
            vod_pic: pic ? pic[1] : '',
            type_name: genre ? genre[1] : '',
            vod_year: date ? date[1] : '',
            vod_content: desc ? desc[1].trim() : '',
            vod_play_from: '直连',
            vod_play_url: `播放$${url}`,
        }],
    };
}

async function play(inReq, _outResp) {
    let page = String(inReq.body.id || '').trim();
    if (!page.startsWith('http')) {
        const id = page.replace(/^\/+|\/+$/g, '').split('/').pop();
        page = `${site}/v/${id}/`;
    }
    const html = await fetchHtml(page);
    let m = html.match(/const\s+source\s*=\s*["']([^"']+)["']/i);
    if (!m) m = html.match(/https?:\/\/[^"'\s<>]+\.m3u8(?:\?[^"'\s<>]*)?/i);
    const url = m ? (m[1] ?? m[0]) : '';
    return {
        parse: url ? 0 : 1,
        playUrl: '',
        url: url || page,
        header: HEADERS,
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page) || 1;
    const wd = encodeURIComponent(String(key));
    const path = pg === 1 ? `/s/wd/${wd}/` : `/s/wd/${wd}/page/${pg}/`;
    const vods = parseList(await fetchHtml(path));
    return {
        page: pg,
        pagecount: vods.length ? pg + 1 : pg,
        limit: vods.length,
        total: vods.length ? 999999 : 0,
        list: vods,
    };
}

export default {
    meta: {
        key: '18jtv',
        name: '🔥18J',
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
