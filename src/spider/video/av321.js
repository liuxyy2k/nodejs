import req from '../../util/req.js';

/**
 * 321AV · 321av.net
 * 列表 /vodtype/{id}.html  播放 player_aaaa → /private-getvideo/{code}
 */

const DEFAULT_HOST = 'https://321av.net';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CLASS_LIST = [
    { type_id: '20', type_name: '有码影片' },
    { type_id: '21', type_name: '无码影片' },
    { type_id: '22', type_name: '中文字幕' },
    { type_id: 'home', type_name: '首页推荐' },
];

let host = DEFAULT_HOST;

function applyConfig(extend) {
    host = DEFAULT_HOST;
    if (!extend) return;
    const raw = String(extend).trim();
    if (raw.startsWith('http')) host = raw.replace(/\/$/, '');
}

function fixTxt(s) {
    if (!s) return '';
    let text = String(s);
    if (/\\u[0-9a-fA-F]{4}/.test(text)) {
        try {
            text = JSON.parse(`"${text.replace(/"/g, '\\"')}"`);
        } catch {
            /* ignore */
        }
    }
    text = text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
    return text.trim();
}

function fetchHeaders(referer) {
    return {
        'User-Agent': UA,
        Referer: referer || `${host}/index.php`,
        Accept: 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
    };
}

function normalizeHtml(html) {
    if (!html) return '';
    let text = String(html);
    if (text.startsWith('"') && text.slice(0, 200).includes('\\n')) {
        try {
            text = JSON.parse(text);
        } catch {
            /* ignore */
        }
    }
    if (text.includes('\\/vodplay') || text.includes('href=\\"')) {
        text = text
            .replace(/\\\//g, '/')
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\u003c/g, '<')
            .replace(/\\u003e/g, '>');
        if (/\\u[0-9a-fA-F]{4}/.test(text)) {
            try {
                text = JSON.parse(`"${text.replace(/"/g, '\\"')}"`);
            } catch {
                /* ignore */
            }
        }
    }
    return text;
}

async function fetchHtml(url, timeout = 25000) {
    let target = url;
    if (target.startsWith('/')) target = `${host}${target}`;
    if (/321av\.net\/?$/.test(target.replace(/\/$/, ''))) {
        target = `${host}/index.php`;
    }

    for (const t of [timeout, 35000]) {
        try {
            const resp = await req.get(target, {
                headers: fetchHeaders(),
                timeout: t,
                responseType: 'text',
                validateStatus: () => true,
            });
            if (resp.status === 200) {
                const text = normalizeHtml(typeof resp.data === 'string' ? resp.data : String(resp.data || ''));
                if (text.length > 500) return text;
            }
        } catch {
            /* retry */
        }
    }
    return '';
}

function parseList(html) {
    const results = [];
    const seen = new Set();
    const source = normalizeHtml(html);
    if (!source) return results;

    const cardRe =
        /href=["']\/vodplay\/(\d+)-\d+-\d+\.html["'][\s\S]{0,900}?(?:data-src|src)=["']([^"']+)["'][\s\S]{0,300}?alt=["']([^"']*)["']/gi;
    let m;
    while ((m = cardRe.exec(source)) !== null) {
        const vid = m[1];
        if (seen.has(vid)) continue;
        seen.add(vid);
        let pic = m[2];
        if (pic.startsWith('//')) pic = `https:${pic}`;
        else if (pic.startsWith('/')) pic = `${host}${pic}`;
        const title = fixTxt((m[3] || '').replace(/\s+/g, ' '));
        if (/loading/i.test(pic)) pic = '';
        results.push({ vod_id: vid, vod_name: title || vid, vod_pic: pic, vod_remarks: '' });
    }

    if (results.length < 8) {
        const linkRe = /href=["']\/vodplay\/(\d+)-\d+-\d+\.html["'][^>]*>\s*([^<]{2,80})\s*</gi;
        while ((m = linkRe.exec(source)) !== null) {
            const vid = m[1];
            if (seen.has(vid)) continue;
            const title = fixTxt(m[2]);
            if (!title || /^\d+$/.test(title)) continue;
            seen.add(vid);
            results.push({ vod_id: vid, vod_name: title, vod_pic: '', vod_remarks: '' });
        }
    }

    if (results.length < 5) {
        const idRe = /\/vodplay\/(\d+)-\d+-\d+\.html/g;
        while ((m = idRe.exec(source)) !== null) {
            const vid = m[1];
            if (seen.has(vid)) continue;
            seen.add(vid);
            const block = source.slice(Math.max(0, m.index - 50), m.index + 500);
            let title = vid;
            const am = block.match(/alt=["']([^"']{2,100})["']/i);
            if (am) title = fixTxt(am[1]);
            let pic = '';
            const pm = block.match(/data-src=["']([^"']+)["']/i);
            if (pm) {
                pic = pm[1].replace(/\\\//g, '/');
                if (pic.startsWith('//')) pic = `https:${pic}`;
            }
            results.push({ vod_id: vid, vod_name: title || vid, vod_pic: pic, vod_remarks: '' });
        }
    }
    return results;
}

function parsePlayerAaaa(html) {
    const source = normalizeHtml(html);
    if (!source) return null;

    const candidates = [];
    let m = source.match(/player_aaaa\s*=\s*(\{.*?\})\s*;?\s*</s);
    if (m) candidates.push(m[1]);
    m = source.match(/player_aaaa\s*=\s*(\{.*?\})/s);
    if (m) candidates.push(m[1]);

    const startIdx = source.search(/player_aaaa\s*=\s*\{/);
    if (startIdx >= 0) {
        const start = source.indexOf('{', startIdx);
        let depth = 0;
        for (let i = start; i < Math.min(source.length, start + 8000); i++) {
            const c = source[i];
            if (c === '{') depth++;
            else if (c === '}') {
                depth--;
                if (depth === 0) {
                    candidates.push(source.slice(start, i + 1));
                    break;
                }
            }
        }
    }

    for (const raw of candidates) {
        for (const attempt of [raw, raw.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\')]) {
            try {
                const data = JSON.parse(attempt);
                if (data && typeof data === 'object' && ('url' in data || 'encrypt' in data)) return data;
            } catch {
                /* try next */
            }
        }
    }
    return null;
}

function decodePlayerUrl(raw) {
    if (!raw) return '';
    let s = decodeURIComponent(String(raw).trim());
    try {
        const pad = (4 - (s.length % 4)) % 4;
        const data = JSON.parse(Buffer.from(s + '='.repeat(pad), 'base64').toString('utf8'));
        const ss = data?.ss;
        if (Array.isArray(ss)) {
            for (const row of ss) {
                if (Array.isArray(row) && row.length >= 2) {
                    const hit = String(row[1]).match(/\/cn\/([^/?#]+)/i);
                    if (hit) return hit[1];
                } else if (typeof row === 'string') {
                    const hit = row.match(/\/cn\/([^/?#]+)/i);
                    if (hit) return hit[1];
                }
            }
        }
    } catch {
        /* ignore */
    }
    return '';
}

async function playFromCode(code) {
    const plays = [];
    if (!code) return plays;

    const url = `${host}/private-getvideo/${encodeURIComponent(code)}`;
    let data;
    try {
        const resp = await req.get(url, {
            headers: fetchHeaders(),
            timeout: 20000,
            validateStatus: () => true,
        });
        data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
    } catch {
        return plays;
    }

    const playlist = data?.playlist;
    if (!Array.isArray(playlist)) return plays;

    const seen = new Set();
    for (const item of playlist) {
        if (!item || typeof item !== 'object') continue;
        const u = item.url || '';
        if (!u.startsWith('http') || seen.has(u)) continue;
        if (!/\.(m3u8|mp4)(\?|$)/i.test(u)) continue;
        seen.add(u);
        let name = /\.m3u8/i.test(u) ? 'HLS' : 'MP4';
        const qm = u.match(/(\d{3,4})p/i);
        if (qm) name = `${qm[1]}P`;
        if (item.playMode === 'streampipe') name = '自适应';
        plays.push([name, u]);
    }
    return plays;
}

async function init(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    return {};
}

async function home(_inReq, _outResp) {
    const html = await fetchHtml(`${host}/index.php`);
    return {
        class: CLASS_LIST,
        list: parseList(html).slice(0, 24),
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const page = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);
    const tid = String(inReq.body.tid ?? inReq.body.id ?? 'home').trim();

    const urls = [];
    if (tid === 'home') {
        urls.push(`${host}/index.php${page > 1 ? `?page=${page}` : ''}`);
        urls.push(`${host}/enter`);
    } else if (page <= 1) {
        urls.push(`${host}/vodtype/${tid}.html`);
    } else {
        urls.push(`${host}/vodtype/${tid}-${page}.html`);
        urls.push(`${host}/vodtype/${tid}.html?page=${page}`);
        urls.push(`${host}/vodtype/${tid}.html`);
    }

    let vods = [];
    for (const url of urls) {
        vods = parseList(await fetchHtml(url));
        if (vods.length >= 5) break;
    }
    if (!vods.length && tid !== 'home') {
        vods = parseList(await fetchHtml(`${host}/index.php`));
    }

    return {
        list: vods,
        page,
        pagecount: vods.length >= 10 ? page + 1 : page,
        limit: 24,
        total: vods.length ? 9999 : 0,
    };
}

async function detail(inReq, _outResp) {
    const raw = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    const vm = String(raw || '').match(/(\d+)/);
    const vid = vm ? vm[1] : '';
    if (!vid) return { list: [] };

    const page = `${host}/vodplay/${vid}-1-1.html`;
    const html = await fetchHtml(page);

    let name = '';
    let m = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || html.match(/<h1[^>]*>([^<]+)/i);
    if (m) name = fixTxt(m[1]);
    if (!name) {
        m = html.match(/<title>([^<]+)/i);
        if (m) {
            name = fixTxt(m[1])
                .replace(/\s*[-|].*$/, '')
                .replace(/^在线播放/, '')
                .trim();
        }
    }

    let pic = '';
    m = html.match(/og:image["']\s+content=["']([^"']+)/i);
    if (m) pic = m[1].replace(/\\\//g, '/');

    let code = '';
    const playerData = parsePlayerAaaa(html);
    if (playerData) code = decodePlayerUrl(playerData.url || '');
    if (!code) {
        const tm = html.match(/([A-Z]{2,10}-?\d{2,5})/i);
        if (tm) code = tm[1].toLowerCase().replace(/_/g, '-');
    }

    const plays = await playFromCode(code);
    let playFrom;
    let playUrl;
    if (plays.length) {
        playFrom = plays.map(([n]) => n).join('$$$');
        playUrl = plays.map(([, u]) => `正片$${u}`).join('$$$');
    } else {
        playFrom = '321AV';
        playUrl = `正片$${page}`;
    }

    return {
        list: [
            {
                vod_id: vid,
                vod_name: name || vid,
                vod_pic: pic,
                vod_play_from: playFrom,
                vod_play_url: playUrl,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    let url = String(inReq.body.id || '').trim();
    const header = {
        'User-Agent': UA,
        Referer: `${host}/`,
        Origin: host,
    };

    if (/\.(m3u8|mp4)(\?|$)/i.test(url)) {
        return { parse: 0, jx: 0, url, header };
    }

    let vid = '';
    const m = url.match(/\/vodplay\/(\d+)/);
    if (m) vid = m[1];
    else if (/^\d+$/.test(url)) vid = url;

    if (vid) {
        const d = await detail({ body: { id: vid } });
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

    const q = encodeURIComponent(key);
    let url = `${host}/index.php/vod/search.html?wd=${q}`;
    if (page > 1) url += `&page=${page}`;

    let vods = parseList(await fetchHtml(url));
    if (!vods.length) {
        vods = parseList(await fetchHtml(`${host}/vodsearch/-------------.html?wd=${q}`));
    }

    return {
        list: vods,
        page,
        pagecount: vods.length >= 10 ? page + 1 : page,
        limit: 24,
        total: vods.length ? 9999 : 0,
    };
}

export default {
    meta: {
        key: 'av321',
        name: '🌸321AV',
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
