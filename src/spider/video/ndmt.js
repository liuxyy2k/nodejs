import axios from 'axios';

const HOST = 'https://hqg.ndmt3.life';
const BASE = '/cn/home/web';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const CATEGORIES = {
    20: '日韩',
    21: '偷拍',
    22: '无码',
    23: '自拍',
    24: '巨乳',
    25: '华人',
    26: '嫩模',
    27: '剧情',
    28: '动漫',
};

const HEADERS = {
    'User-Agent': UA,
    Referer: HOST + '/',
};

async function getHtml(url, timeout = 30000) {
    const resp = await axios.get(url, {
        headers: HEADERS,
        timeout,
        responseType: 'text',
        validateStatus: () => true,
    });
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function parseItems(html) {
    const items = [];
    const seen = new Set();
    const re = /<a href="([^"]*\/vod\/play\/id\/(\d+)\/sid\/\d+\/nid\/\d+\.html)"[^>]*class="videoListStyle"([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html))) {
        const vid = m[2];
        if (seen.has(vid)) continue;
        const seg = m[3];
        const name = seg.match(/class="title">([^<]+)<\/p>/);
        const img = seg.match(/<img[^>]+src="(https?:\/\/[^"]+)"/);
        const cnt = seg.match(/class="one">([^<]+)<\/p>/);
        const tag = seg.match(/class="three">([^<]+)<\/p>/);
        const rm = (cnt ? cnt[1].trim() : '') + (tag ? '·' + tag[1].trim() : '');
        seen.add(vid);
        items.push({
            vod_id: vid,
            vod_name: (name ? name[1].trim() : '').slice(0, 50),
            vod_pic: img ? img[1] : '',
            vod_remarks: rm.slice(0, 20),
        });
    }
    return items;
}

function parsePlayerUrl(html) {
    const pm = html.match(/player_data\s*=\s*(\{[^;]+})/);
    if (!pm) return '';
    const pu = pm[1].match(/"url"\s*:\s*"([^"]+)"/);
    return pu ? pu[1].replace(/\\\//g, '/') : '';
}

async function init() {
    return {};
}

async function home() {
    let list = [];
    try {
        list = parseItems(await getHtml(HOST + BASE + '/', 15000));
    } catch {
        list = [];
    }
    return {
        class: Object.entries(CATEGORIES).map(([type_id, type_name]) => ({ type_id, type_name })),
        list,
    };
}

async function category(inReq) {
    let pn = parseInt(inReq.body.page || 1, 10);
    if (!Number.isFinite(pn) || pn < 1) pn = 1;
    let cat = String(inReq.body.id || '20');
    if (!CATEGORIES[cat]) cat = '20';
    try {
        const h = await getHtml(`${HOST}${BASE}/index.php/vod/type/id/${cat}/page/${pn}.html`);
        const items = parseItems(h);
        const pcs = [...h.matchAll(new RegExp(`/vod/type/id/${cat}/page/(\\d+)\\.html`, 'g'))]
            .map((x) => parseInt(x[1], 10))
            .filter((n) => Number.isFinite(n));
        return {
            page: pn,
            pagecount: pcs.length ? Math.max(...pcs) : 1,
            limit: items.length,
            total: 0,
            list: items,
        };
    } catch {
        return { page: pn, pagecount: 1, limit: 0, total: 0, list: [] };
    }
}

async function detail(inReq) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    const m = String(vid || '').match(/(\d+)/);
    vid = m ? m[1] : '';
    if (!vid) return { list: [] };
    let h = '';
    try {
        h = await getHtml(`${HOST}${BASE}/index.php/vod/play/id/${vid}/sid/1/nid/1.html`);
    } catch {
        return { list: [] };
    }
    const d = {
        vod_id: vid,
        vod_name: '',
        vod_pic: '',
        vod_year: '',
        vod_area: '',
        vod_class: '',
        vod_director: '',
        vod_actor: '',
        vod_content: '',
        vod_remarks: '',
        vod_play_from: '高清',
        vod_play_url: '',
    };
    const tn = h.match(/<title>([^<]+)<\/title>/);
    if (tn) {
        d.vod_name = tn[1].split('-')[0].replace(/在线播放/g, '').replace(/\s*第\d+集$/, '').trim();
    }
    const pu = parsePlayerUrl(h);
    if (pu) d.vod_play_url = '1$' + pu;
    const im = h.match(/<img[^>]+src="(https?:\/\/[^"]+\/upload\/vod\/[^"]+)"/);
    if (im) d.vod_pic = im[1];
    return { list: [d] };
}

async function search(inReq) {
    const key = encodeURIComponent(String(inReq.body.wd || ''));
    try {
        const h = await getHtml(`${HOST}${BASE}/index.php/vod/search.html?wd=${key}`);
        return { list: parseItems(h), page: 1 };
    } catch {
        return { list: [] };
    }
}

async function play(inReq) {
    let url = String(inReq.body.id || '');
    if (/^https?:\/\//i.test(url)) return { parse: 0, url, header: HEADERS };
    const m = url.match(/(\d+)/);
    if (!m) return { parse: 0, url: '' };
    try {
        const h = await getHtml(`${HOST}${BASE}/index.php/vod/play/id/${m[1]}/sid/1/nid/1.html`);
        const pu = parsePlayerUrl(h);
        if (pu) return { parse: 0, url: pu, header: HEADERS };
    } catch {
        /* empty */
    }
    return { parse: 0, url: '' };
}

export default {
    meta: {
        key: 'ndmt',
        name: '🔥Hqg',
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
