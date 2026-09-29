import req from '../../util/req.js';

/**
 * AVJOY · cn.avjoy.ws
 * 分类 videos + search:关键词
 */

const DEFAULT_HOST = 'https://cn.avjoy.ws';
const HOSTS = ['https://cn.avjoy.ws', 'https://www.avjoy.ws', 'https://avjoy.ws'];
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CLASS_LIST = [
    { type_id: 'videos', type_name: '最新视频' },
    { type_id: 'search:中文字幕', type_name: '中文字幕' },
    { type_id: 'search:无码', type_name: '无码' },
    { type_id: 'search:有码', type_name: '有码' },
    { type_id: 'search:自拍', type_name: '自拍' },
    { type_id: 'search:探花', type_name: '探花' },
    { type_id: 'search:国产', type_name: '国产' },
    { type_id: 'search:FC2', type_name: 'FC2' },
    { type_id: 'search:欧美', type_name: '欧美' },
    { type_id: 'search:韩国', type_name: '韩国' },
    { type_id: 'videos/amateur', type_name: 'Amateur・素人' },
    { type_id: 'videos/anal', type_name: 'Anal・アナル' },
    { type_id: 'videos/japan', type_name: 'Japan・日本' },
    { type_id: 'videos/jav', type_name: 'JAV' },
];

let host = DEFAULT_HOST;

function applyConfig(extend) {
    host = DEFAULT_HOST;
    if (!extend) return;
    const raw = String(extend).trim();
    if (raw.startsWith('http')) host = raw.replace(/\/$/, '');
}

function fetchHeaders() {
    return {
        'User-Agent': UA,
        Referer: `${host}/videos`,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
}

function normalizeHtml(text) {
    if (!text) return '';
    if (text.includes('\\/video') || text.includes('href=\\"')) {
        return text.replace(/\\\//g, '/').replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }
    return text;
}

async function fetchHtml(url, timeout = 25000) {
    if (!url) return '';
    let target = url;
    if (target.startsWith('/')) target = `${host}${target}`;

    for (const h of HOSTS) {
        if (target.replace(/\/$/, '') === h.replace(/\/$/, '')) {
            target = `${h}/videos`;
            break;
        }
    }

    const hostOrder = [host, ...HOSTS.filter((h) => h !== host)];
    const tried = new Set();

    for (const h of hostOrder) {
        let u = target;
        for (const hh of HOSTS) {
            if (target.startsWith(hh)) {
                u = h + target.slice(hh.length);
                break;
            }
        }
        if (tried.has(u)) continue;
        tried.add(u);

        try {
            const resp = await req.get(u, {
                headers: fetchHeaders(),
                timeout,
                responseType: 'text',
                validateStatus: () => true,
            });
            let text = resp.status === 200 ? (typeof resp.data === 'string' ? resp.data : String(resp.data || '')) : '';
            text = normalizeHtml(text);
            if (text.length > 800) {
                host = h;
                return text;
            }
        } catch {
            /* try next host */
        }
    }
    return '';
}

function parseList(html) {
    const results = [];
    const seen = new Set();
    if (!html) return results;

    const re = /href=["'](\/video\/(\d+)\/([^"']+))["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const path = m[1];
        const vid = m[2];
        const slug = m[3];
        if (seen.has(vid)) continue;
        seen.add(vid);

        const block = html.slice(Math.max(0, m.index - 100), m.index + 500);
        let pic = '';
        let pm = block.match(/(?:data-src|src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
        if (!pm) {
            pm = block.match(/(?:data-src|src)=["'](\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
        }
        if (pm) {
            pic = pm[1];
            if (pic.startsWith('/')) pic = `${host}${pic}`;
        }

        let title = (slug || '').replace(/-/g, ' ');
        const tm = block.match(/(?:alt|title)=["']([^"']{2,120})["']/i);
        if (tm) title = tm[1].trim();

        results.push({
            vod_id: path,
            vod_name: title.slice(0, 120),
            vod_pic: pic,
            vod_remarks: '',
        });
    }
    return results;
}

function buildCategoryUrl(tid, page) {
    let id = String(tid || 'videos').trim();
    if (['全部影片', '全部', 'all', '最新视频'].includes(id)) id = 'videos';
    if (id === 'amateur' || id === '素人') id = 'videos/amateur';

    if (id.startsWith('search:')) {
        const key = id.slice(7);
        let url = `${host}/search/videos/${encodeURIComponent(key)}`;
        if (page > 1) url += `?page=${page}`;
        return { url, id };
    }
    if (id.startsWith('videos/') || id.startsWith('/videos/')) {
        let url = `${host}/${id.replace(/^\/+/, '')}`;
        if (page > 1) url += `?page=${page}`;
        return { url, id };
    }
    let url = `${host}/videos`;
    if (page > 1) url += `?page=${page}`;
    return { url, id };
}

function extractPlays(html) {
    const plays = [];
    const seen = new Set();

    for (const m of String(html || '').matchAll(/<source[^>]+src=["']([^"']+)["']/gi)) {
        let u = m[1];
        if (!u.startsWith('http') || seen.has(u)) continue;
        seen.add(u);
        let label = 'MP4';
        const qm = u.match(/(\d{3,4})p/i);
        if (qm) label = `${qm[1]}P`;
        plays.push([label, u]);
    }

    for (const m of String(html || '').matchAll(/(https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8)[^"'\s<>]*)/gi)) {
        const u = m[1];
        if (seen.has(u)) continue;
        seen.add(u);
        plays.push(['直链', u]);
    }
    return plays;
}

async function init(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    return {};
}

async function home(_inReq, _outResp) {
    let list = [];
    try {
        list = parseList(await fetchHtml(`${host}/videos`)).slice(0, 24);
    } catch {
        list = [];
    }
    return { class: CLASS_LIST, list, filters: {} };
}

async function category(inReq, _outResp) {
    const page = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);
    const tid = inReq.body.tid ?? inReq.body.id ?? 'videos';
    const { url, id } = buildCategoryUrl(tid, page);

    let html = await fetchHtml(url);
    let vods = parseList(html);

    if (vods.length < 2 && !String(id).startsWith('search:')) {
        html = await fetchHtml(`${host}/videos`);
        vods = parseList(html);
    }

    return {
        list: vods,
        page,
        pagecount: vods.length >= 12 ? page + 1 : page,
        limit: 24,
        total: vods.length ? 9999 : 0,
    };
}

async function detail(inReq, _outResp) {
    let path = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '').trim();
    if (!path.startsWith('http')) {
        path = path.startsWith('/') ? `${host}${path}` : `${host}/video/${path}`;
    }

    const html = await fetchHtml(path);
    let name = '';
    let m = html.match(/<title>([^<]+)/i);
    if (m) name = m[1].replace(/\s*[-|].*AVJOY.*$/i, '').trim();

    let pic = '';
    m = html.match(/og:image["']\s+content=["']([^"']+)/i);
    if (m) pic = m[1];

    const plays = extractPlays(html);
    let playFrom;
    let playUrl;
    if (plays.length) {
        playFrom = plays.map(([label]) => label).join('$$$');
        playUrl = plays.map(([, u]) => `正片$${u}`).join('$$$');
    } else {
        playFrom = 'AVJOY';
        playUrl = `正片$${path}`;
    }

    return {
        list: [
            {
                vod_id: path,
                vod_name: name || 'AVJOY',
                vod_pic: pic,
                vod_play_from: playFrom,
                vod_play_url: playUrl,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    let url = String(inReq.body.id || '').trim();
    if (url.includes('$') && !url.startsWith('http')) url = url.split('$').pop().trim();

    const header = {
        'User-Agent': UA,
        Referer: `${host}/`,
    };

    if (/\.(m3u8|mp4)(\?|$)/i.test(url)) {
        return { parse: 0, jx: 0, url, header };
    }

    if (url.includes('/video/')) {
        const d = await detail({ body: { id: url } });
        const pu = d.list?.[0]?.vod_play_url || '';
        for (const part of pu.split('$$$')) {
            if (part.includes('$')) {
                const u = part.split('$').slice(1).join('$');
                if (/\.(m3u8|mp4)/i.test(u)) {
                    return { parse: 0, jx: 0, url: u, header };
                }
            }
        }
    }

    return { parse: 0, jx: 0, url: '', header };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const page = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);
    if (!key) {
        return { list: [], page: 1, pagecount: 1, limit: 24, total: 0 };
    }

    let url = `${host}/search/videos/${encodeURIComponent(key)}`;
    if (page > 1) url += `?page=${page}`;

    const vods = parseList(await fetchHtml(url));
    return {
        list: vods,
        page,
        pagecount: vods.length >= 12 ? page + 1 : page,
        limit: 24,
        total: vods.length ? 9999 : 0,
    };
}

export default {
    meta: {
        key: 'avjoy',
        name: '🌸AVJOY',
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
