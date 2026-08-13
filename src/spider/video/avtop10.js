import axios from 'axios';
import GENRE_NAMES from './avtop10-genres.js';

/**
 * AVTOP10 - https://avtop10.com
 * 列表 regex 解析；详情 Dean Edwards packer 解密；封面/播放走代理域名。
 */

const DEFAULT_HOST = 'https://avtop10.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const SKIP_IDS = new Set([
    'login',
    'history',
    'new',
    'release',
    'genres',
    'actresses',
    'makers',
    'today-hot',
    'weekly-hot',
    'monthly-hot',
]);

const CLASSES = [
    { type_name: '中文字幕', type_id: 'chinese-subtitle' },
    { type_name: '国产AV', type_id: 'madou' },
    { type_name: '欧美大片', type_id: 'genres/%E5%A4%96%E5%9B%BD%E5%A5%B3%E4%BC%98' },
    { type_name: '最近更新', type_id: 'new' },
    { type_name: '無碼流出', type_id: 'uncensored-leak' },
    { type_name: '女優排行', type_id: 'actresses/ranking' },
    { type_name: '类型', type_id: 'genres' },
    { type_name: 'VR', type_id: 'VR' },
    { type_name: 'SIRO', type_id: 'siro' },
    { type_name: 'LUXU', type_id: 'luxu' },
    { type_name: 'PRESTIGE PREMIUM', type_id: 'maan' },
    { type_name: 'S-CUTE', type_id: 'scute' },
    { type_name: 'ARA', type_id: 'ara' },
    { type_name: 'FC2', type_id: 'fc2' },
    { type_name: 'HEYZO', type_id: 'heyzo' },
    { type_name: '東京熱', type_id: 'tokyohot' },
    { type_name: '一本道', type_id: '1pondo' },
    { type_name: 'Caribbeancom', type_id: 'caribbeancom' },
    { type_name: 'Caribbeancompr', type_id: 'caribbeancompr' },
    { type_name: 'Gachinco', type_id: 'gachinco' },
    { type_name: 'XXX-AV', type_id: 'xxxav' },
    { type_name: '人妻斬', type_id: 'marriedslash' },
    { type_name: '頑皮 4610', type_id: 'naughty4610' },
    { type_name: '頑皮 0930', type_id: 'naughty0930' },
    { type_name: '麻豆傳媒', type_id: 'madou' },
    { type_name: 'TWAV', type_id: 'twav' },
    { type_name: 'Furuke', type_id: 'furuke' },
    { type_name: '韓國直播', type_id: 'klive' },
    { type_name: '中國直播', type_id: 'clive' },
];

const GENRE_FILTER = {
    genres: [
        {
            key: 'genre',
            name: '类型',
            value: GENRE_NAMES.map((n) => ({ n, v: n })),
        },
    ],
};

let host = DEFAULT_HOST;
let headers = {
    'User-Agent': UA,
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: `${DEFAULT_HOST}/`,
};

const http = axios.create({
    timeout: 20_000,
    validateStatus: () => true,
});

function getHeaders(referer) {
    return {
        ...headers,
        Referer: referer || `${host}/`,
        referer: referer || `${host}/`,
    };
}

function mediaHeaders() {
    return {
        'User-Agent': headers['User-Agent'] || UA,
        Referer: `${host}/`,
        'Accept-Language': 'zh-CN,zh;q=0.9',
    };
}

function playResult(url, parse = 0) {
    return {
        parse,
        jx: 0,
        playUrl: '',
        url,
        header: mediaHeaders(),
    };
}

function unescapeHtml(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x2F;/gi, '/')
        .replace(/&#x3D;/gi, '=');
}

function clean(text) {
    return unescapeHtml(String(text || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function titleClean(text) {
    return clean(text).replace(/\s+\d{1,3}(?:,\d{3})*(?:\s+\d{1,4}){0,3}$/, '').trim();
}

function absUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (u.startsWith('http')) return u;
    if (u.startsWith('//')) return `https:${u}`;
    return `${host.replace(/\/$/, '')}/${u.replace(/^\//, '')}`;
}

function picProxy(url) {
    let u = unescapeHtml(url || '');
    let q = u;
    if (u.includes('api/proxy') && u.includes('url=')) {
        try {
            q = new URL(u, host).searchParams.get('url') || u;
        } catch {
            q = u;
        }
    }
    if (q.startsWith('//')) q = `https:${q}`;
    if (q.startsWith('http')) {
        return `https://ig2.pppppppp.top/api/proxy?url=${encodeURIComponent(q)}`;
    }
    return u;
}

function field(html, label) {
    const re = new RegExp(
        `<span>\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*</span>\\s*(?:<time[^>]*datetime="([^"]*)"[^>]*>.*?</time>|<span[^>]*>(.*?)</span>|<a[^>]*>(.*?)</a>)`,
        'is',
    );
    const m = html.match(re);
    if (!m) return '';
    return clean(m[1] || m[2] || m[3]);
}

function b36(n) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    n = parseInt(n, 10);
    if (n === 0) return '0';
    let r = '';
    while (n) {
        r = chars[n % 36] + r;
        n = Math.floor(n / 36);
    }
    return r;
}

function unpackSources(html) {
    const out = [];
    const p = html.match(
        /eval\(function\(p,a,c,k,e,d\).*?\('(.*?)',\s*(\d+),\s*(\d+),\s*'([^']*)'\.split\('\|'\)/s,
    );
    if (!p) return out;

    let s = p[1].replace(/\\'/g, "'");
    const count = parseInt(p[3], 10);
    const keys = p[4].split('|');
    const labels = { source: '原画', source842: '842x480', source1280: '1280x720' };

    for (let c = count - 1; c >= 0; c--) {
        const k = c < keys.length ? keys[c] : '';
        if (k) {
            const key = b36(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            s = s.replace(new RegExp(`\\b${key}\\b`, 'g'), k);
        }
    }

    for (const m of s.matchAll(/(source(?:842|1280)?)='(https?:\/\/[^']+?\.m3u8)'/g)) {
        out.push([labels[m[1]] || m[1], `https://pl3.vvvvvvvv.top/api/play?url=${encodeURIComponent(m[2])}`]);
    }
    return out;
}

function parseExtend(body) {
    let ext = body?.extend ?? body?.filter ?? {};
    if (typeof ext === 'string') {
        try {
            ext = JSON.parse(ext || '{}');
        } catch {
            ext = {};
        }
    }
    return ext && typeof ext === 'object' ? ext : {};
}

async function fetchHtml(url, referer) {
    const resp = await http.get(url, {
        headers: getHeaders(referer),
        responseType: 'text',
    });
    if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function parseList(html) {
    const arr = [];
    const seen = new Set();
    const re = /<a\s+href="\/([a-z0-9][a-z0-9_-]{2,})"[^>]*>/gis;

    for (const m of html.matchAll(re)) {
        const vid = m.group(1);
        if (seen.has(vid) || SKIP_IDS.has(vid)) continue;

        const block = html.slice(m.index, m.index + 2600);
        let title = vid.toUpperCase();
        const tm = block.match(
            new RegExp(`<a class="text-secondary[^>]*href="/${vid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>(.*?)</a>`, 'is'),
        );
        if (tm) title = titleClean(tm[1]);
        if (title.length < 2 || title.includes('更多')) continue;

        let pic = '';
        const pm = block.match(/(?:data-src|src)="([^"]*(?:cover-[tn]\.jpg|cover\.jpg|\/1\.jpg)[^"]*)"/i);
        if (pm) pic = picProxy(pm[1]);
        if (!pic) pic = picProxy(`https://fourhoi.com/${vid}/cover-t.jpg`);

        let dur = '';
        const dm = block.match(/<span[^>]*>(\s*\d{1,2}:\d{2}(?::\d{2})?\s*)<\/span>/is);
        if (dm) dur = dm[1].trim();

        arr.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: dur,
            style: { type: 'rect', ratio: 1.33 },
        });
        seen.add(vid);
    }
    return arr;
}

async function categoryContent(tid, pg, extend) {
    let url;
    if (tid === 'genres') {
        const g = extend.genre || '独家';
        url = `${host}/genres/${encodeURIComponent(g)}`;
    } else {
        url = `${host}/${tid}`;
    }
    if (String(pg) !== '1') url += `?page=${pg}`;
    const html = await fetchHtml(url);
    return {
        page: parseInt(pg, 10) || 1,
        pagecount: 999,
        limit: 24,
        total: 999 * 24,
        list: parseList(html),
    };
}

async function init(inReq, _outResp) {
    let cfg = inReq.body?.extend ?? {};
    if (typeof cfg === 'string') {
        try {
            cfg = JSON.parse(cfg || '{}');
        } catch {
            cfg = {};
        }
    }
    host = String(cfg.site || DEFAULT_HOST).replace(/\/$/, '') || DEFAULT_HOST;
    headers.Referer = `${host}/`;
    headers.referer = `${host}/`;
    return {};
}

async function home(_inReq, _outResp) {
    try {
        const d = await categoryContent('new', '1', {});
        return {
            class: CLASSES,
            filters: GENRE_FILTER,
            list: d.list,
        };
    } catch {
        return { class: CLASSES, filters: GENRE_FILTER, list: [] };
    }
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '').trim();
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const extend = parseExtend(inReq.body);

    try {
        return await categoryContent(tid, String(pg), extend);
    } catch {
        return { page: pg, pagecount: 1, limit: 24, total: 0, list: [] };
    }
}

async function detail(inReq, _outResp) {
    try {
        let vid = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
        vid = String(vid || '').trim().replace(/^\/+|\/+$/g, '');
        if (!vid) return { list: [] };

        const html = await fetchHtml(`${host}/${vid}`);
        const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/i);
        const titleTag = html.match(/<title>(.*?)<\/title>/is);
        const title = clean((ogTitle && ogTitle[1]) || (titleTag && titleTag[1]) || '');

        const pm = html.match(/<meta property="og:image" content="([^"]*)"/i);
        const pic = pm ? unescapeHtml(pm[1]) : '';

        const dm = html.match(/<meta property="og:description"\s*content="([^"]*)"/is);
        const desc = clean((dm && dm[1]) || '');

        const year = field(html, '发行日期') || field(html, '發行日期');
        const code = field(html, '番号');
        const title2 = field(html, '标题') || title;
        const actresses = field(html, '女优');
        const series = field(html, '系列');
        const maker = field(html, '发行商');
        const director = field(html, '导演');

        const tags = [...html.matchAll(/href="\/[^"]*(?:genres|labels)\/[^"]+"[^>]*>(.*?)<\/a>/gis)]
            .map((x) => clean(x[1]))
            .filter(Boolean)
            .slice(0, 12)
            .join(',');

        const sources = unpackSources(html);
        const play = [];
        if (sources.length) {
            for (const [k, u] of sources) play.push(`${k}$${u}`);
        } else {
            play.push(`播放$${host}/${vid}`);
        }

        const contentLines = [
            desc,
            code ? `番号：${code}` : '',
            actresses ? `女优：${actresses}` : '',
            series ? `系列：${series}` : '',
            maker ? `发行商：${maker}` : '',
            director ? `导演：${director}` : '',
        ].filter(Boolean);

        return {
            list: [
                {
                    vod_id: vid,
                    vod_name: title2 || title || vid.toUpperCase(),
                    vod_pic: pic,
                    type_name: tags,
                    vod_year: year,
                    vod_area: maker,
                    vod_director: director,
                    vod_actor: actresses,
                    vod_content: contentLines.join('\n'),
                    vod_play_from: play.map((x) => x.split('$')[0]).join('$$$'),
                    vod_play_url: play.join('$$$'),
                },
            ],
        };
    } catch {
        return { list: [] };
    }
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    if (!key) return { list: [] };

    try {
        const html = await fetchHtml(`${host}/search/${encodeURIComponent(key)}`);
        return { list: parseList(html) };
    } catch {
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    try {
        let id = String(inReq.body.id || '').trim();
        if (id.startsWith('http') && id.includes('.m3u8')) {
            return playResult(id, 0);
        }

        const did = id.split('/').pop();
        const d = (await detail({ body: { id: did } }, null)).list[0];
        if (!d) return playResult(id, 1);

        const u = d.vod_play_url.split('$').pop().split('$$$')[0];
        return playResult(u, 0);
    } catch {
        return playResult(String(inReq.body.id || ''), 1);
    }
}

export default {
    meta: {
        key: 'avtop10',
        name: '🔥AVTOP10',
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
