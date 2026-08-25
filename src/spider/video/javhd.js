import axios from 'axios';

const SITE = 'https://javhd.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const JSON_HEADERS = {
    'User-Agent': UA,
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
};

const HTML_HEADERS = {
    'User-Agent': UA,
};

const CLASSES = [
    { type_id: 'justadded', type_name: '最新' },
    { type_id: 'popular', type_name: '热门' },
    { type_id: 'top', type_name: '最多播放' },
];

function pickThumb(th) {
    if (!th || typeof th !== 'object') return '';
    for (const k of ['1130x706', '940x530', '468x264', '374x233']) {
        if (th[k]) return th[k];
    }
    const vals = Object.values(th);
    return vals.length ? String(vals[0]) : '';
}

async function getText(url, { jsonMode = false, html = false } = {}) {
    const headers = html ? HTML_HEADERS : JSON_HEADERS;
    let current = url;
    for (let i = 0; i < 4; i++) {
        try {
            const resp = await axios.get(current, {
                headers,
                timeout: 20000,
                validateStatus: () => true,
                responseType: 'text',
                maxRedirects: 5,
            });
            const txt = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data || '');
            const refresh = txt.match(/<meta\s+http-equiv="refresh"\s+content="0;url='([^']+)'"/i);
            if (refresh) {
                current = refresh[1].startsWith('http') ? refresh[1] : `${SITE}${refresh[1]}`;
                continue;
            }
            if (jsonMode) {
                try {
                    return typeof resp.data === 'object' && resp.data ? resp.data : JSON.parse(txt);
                } catch {
                    return {};
                }
            }
            return txt;
        } catch {
            return jsonMode ? {} : '';
        }
    }
    return jsonMode ? {} : '';
}

function parseCards(t) {
    const out = [];
    const re =
        /<thumb-component\s+type-thumb="video"\s+(?:item-id="\d+"\s+)?video-id="(\d+)"\s+link-content="([^"]+)"\s+url-thumb="([^"]+)"\s+video-preview="([^"]*)"(?:\s+has-label="([^"]*)")?\s+title="([^"]+)"/g;
    let m;
    while ((m = re.exec(t))) {
        out.push({
            vid: m[1],
            link: m[2],
            pic: m[3],
            preview: m[4],
            label: m[5] || 'free',
            title: m[6],
        });
    }
    return out;
}

function cardToVod(i) {
    return {
        vod_id: i.link,
        vod_name: i.title,
        vod_pic: i.pic,
        vod_remarks: i.label !== 'free' ? 'VIP' : '',
        vod_content: i.label,
    };
}

async function init() {
    return {};
}

async function home() {
    const j = await getText(
        `${SITE}/en/api/content_block?block=custom&pgid=1339887660&isCasting=1&count=24&offset=0&castingPosition=8`,
        { jsonMode: true },
    );
    const list = [];
    for (const i of j.template || []) {
        if (i && typeof i === 'object' && i.id) {
            list.push({
                vod_id: SITE + (i.studioUrl || ''),
                vod_name: i.title || '',
                vod_pic: pickThumb(i.thumbs),
                vod_remarks: '',
            });
        }
    }
    return { class: CLASSES, list };
}

async function category(inReq) {
    const tid = String(inReq.body.id || 'justadded');
    const pg = String(inReq.body.page || 1);
    const j = await getText(`${SITE}/en/japanese-porn-videos/${tid}/all/${pg}`, { jsonMode: true });
    if (!j || typeof j !== 'object') return { list: [] };
    const items = parseCards(String(j.template || ''));
    const per = Math.max(1, parseInt(j.per_page, 10) || 24);
    const total = parseInt(j.results_count, 10) || 0;
    const pagecount = Math.max(1, Math.ceil(total / per));
    return {
        list: items.map(cardToVod),
        page: parseInt(pg, 10) || 1,
        pagecount,
        limit: per,
        total,
    };
}

async function detail(inReq) {
    let u = inReq.body.id;
    if (Array.isArray(u)) u = u[0];
    u = String(u || '');
    if (/^\d+$/.test(u)) u = `${SITE}/en/id/${u}/`;
    const h = await getText(u, { html: true });
    if (!h) return { list: [] };
    let m = h.match(/content-path="\/en\/player_api\?videoId=(\d+)&amp;is_trailer=\d+"/);
    if (!m) m = h.match(/content-id="(\d+)"/);
    if (!m) return { list: [] };
    const cid = m[1];
    const title = h.match(/<title>([^<]*)<\/title>/i)?.[1]?.split('|')[0].trim() || '';
    const pic = h.match(/--playerPoster:\s*url\(([^)]+)\)/)?.[1] || '';
    const desc = h.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] || '';
    return {
        list: [
            {
                vod_id: u,
                vod_name: title,
                vod_pic: pic,
                vod_content: desc,
                vod_play_from: 'javhd',
                vod_play_url: `完整版$${SITE}/en/player_api?videoId=${cid}&is_trailer=0`,
            },
        ],
    };
}

async function search(inReq) {
    const key = encodeURIComponent(String(inReq.body.wd || ''));
    const j = await getText(`${SITE}/en/search?q=${key}`, { jsonMode: true });
    if (!j || typeof j !== 'object') return { list: [] };
    return { list: parseCards(String(j.template || '')).map(cardToVod) };
}

async function play(inReq) {
    const id = String(inReq.body.id || '');
    const j = await getText(id, { jsonMode: true });
    if (!j?.sources?.length) return {};
    const s = [...j.sources].sort((a, b) => (b.res || 0) - (a.res || 0))[0];
    return {
        parse: 0,
        url: s?.src || '',
        header: { 'User-Agent': UA, Referer: `${SITE}/` },
    };
}

export default {
    meta: {
        key: 'javhd',
        name: '🔥JAVHD',
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
