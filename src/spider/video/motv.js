import axios from 'axios';
import https from 'https';

const BASE_URL = 'https://www.motv.app';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const HEADERS = {
    'User-Agent': UA,
    Referer: `${BASE_URL}/`,
    Accept: '*/*',
};

const CATES = [
    { type_name: '日本有碼', type_id: '20' },
    { type_name: '日本無碼', type_id: '50' },
    { type_name: '歐美风情', type_id: '25' },
    { type_name: '國產原創', type_id: '41' },
    { type_name: '動畫', type_id: '29' },
    { type_name: '水果AV', type_id: '35' },
    { type_name: '色情情燴', type_id: '30' },
    { type_name: '經典四級', type_id: '47' },
    { type_name: '鹹濕電台', type_id: '169' },
];


const http = axios.create({
    timeout: 15000,
    validateStatus: () => true,
    headers: HEADERS,
});

function toInt(value, def = 0) {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? def : n;
}

function match(text, pattern) {
    const m = String(text || '').match(pattern);
    return m ? m[1].trim() : '';
}

function clean(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function joinUrl(base, path) {
    if (!path) return base || '';
    try {
        return new URL(path, base).href;
    } catch {
        return path;
    }
}

async function getJson(url, extraHeaders = {}) {
    try {
        const r = await http.get(url, { headers: { ...HEADERS, ...extraHeaders } });
        return typeof r.data === 'object' ? r.data : JSON.parse(r.data);
    } catch {
        return {};
    }
}

async function getHtml(url, extraHeaders = {}) {
    try {
        const r = await http.get(url, { headers: { ...HEADERS, ...extraHeaders } });
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch {
        return '';
    }
}

function jsonList(data) {
    let arr = data?.list || data?.data || [];
    if (arr && typeof arr === 'object' && !Array.isArray(arr)) {
        arr = arr.list || arr.data || [];
    }
    if (!Array.isArray(arr)) arr = [];
    const result = [];
    const seen = new Set();
    for (const item of arr) {
        const vid = String(item.vod_id || item.id || item.vodid || '');
        const name = item.vod_name || item.name || item.title || '';
        const pic = item.vod_pic || item.pic || item.cover || item.vod_pic_thumb || '';
        const remarks =
            item.vod_remarks || item.remarks || item.note || item.vod_time || '';
        if (vid && name && !seen.has(vid)) {
            seen.add(vid);
            result.push({
                vod_id: vid,
                vod_name: clean(name),
                vod_pic: joinUrl(BASE_URL, pic),
                vod_remarks: clean(remarks),
            });
        }
    }
    return result;
}

async function ajaxJson(tid, pg) {
    tid = String(tid || '20');
    pg = String(pg || '1');
    const url = `${BASE_URL}/index.php/ajax/data?mid=1&tid=${encodeURIComponent(tid)}&page=${encodeURIComponent(pg)}&limit=20`;
    return getJson(url, { Referer: `${BASE_URL}/vodtype/${tid}/` });
}

async function ajaxList(tid, pg) {
    return jsonList(await ajaxJson(tid, pg));
}

function playUrls(html, vid) {
    const re = new RegExp(
        `href=["']([^"']*/vodplay/${vid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+-\\d+/?)["'][^>]*>(.*?)<`,
        'gs',
    );
    const rows = [...html.matchAll(re)];
    if (!rows.length) {
        return `第1集$${BASE_URL}/vodplay/${vid}-1-1/`;
    }
    const result = [];
    const seen = new Set();
    for (const m of rows) {
        const full = joinUrl(BASE_URL, m[1]);
        if (seen.has(full)) continue;
        seen.add(full);
        const name = clean(m[2]) || `第${result.length + 1}集`;
        result.push(`${name}$${full}`);
    }
    return result.join('#') || `第1集$${BASE_URL}/vodplay/${vid}-1-1/`;
}

function playerUrl(html) {
    let raw = match(html, /player_aaaa\s*=\s*(\{.*?\})/s);
    if (!raw) raw = match(html, /player_data\s*=\s*(\{.*?\})/s);
    if (raw) {
        const url =
            match(raw, /"url"\s*:\s*"([^"]+)"/) ||
            match(raw, /'url'\s*:\s*'([^']+)'/);
        if (url) return url.replace(/\\\//g, '/');
    }
    const iframe = match(html, /<iframe[^>]+src=["']([^"']+)/);
    return iframe ? joinUrl(BASE_URL, iframe) : '';
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: CATES,
        filters: {},
        list: await ajaxList('20', 1),
        parse: 0,
        jx: 0,
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id || '20';
    const pg = toInt(inReq.body.page, 1);
    const data = await ajaxJson(tid, pg);
    return {
        list: jsonList(data),
        page: pg,
        pagecount: toInt(data.pagecount || data.page_count || data.last_page, 999),
        limit: toInt(data.limit, 20),
        total: toInt(data.total, 9999),
    };
}

async function detail(inReq, _outResp) {
    const vid = inReq.body.id || '';
    const html = await getHtml(joinUrl(BASE_URL, `/voddetail/${vid}/`));
    const name =
        match(html, /<h1[^>]*>(.*?)<\/h1>/s) ||
        match(html, /vod_name\s*=\s*['"]([^'"]+)/);
    const pic = match(html, /vod_pic\s*=\s*['"]([^'"]+)/);
    const desc = clean(
        match(
            html,
            /<div[^>]+class="[^"]*(?:content|detail|desc|sketch)[^"]*"[^>]*>(.*?)<\/div>/s,
        ),
    );
    return {
        list: [
            {
                vod_id: vid,
                vod_name: clean(name) || vid,
                vod_pic: joinUrl(BASE_URL, pic || ''),
                type_name: '',
                vod_year: '',
                vod_area: '',
                vod_remarks: '',
                vod_actor: '',
                vod_director: '',
                vod_content: desc,
                vod_play_from: 'MOTV',
                vod_play_url: playUrls(html, vid),
            },
        ],
        parse: 0,
        jx: 0,
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = String(inReq.body.pg || inReq.body.page || '1');
    const url = `${BASE_URL}/index.php/ajax/data?mid=1&wd=${encodeURIComponent(key)}&page=${pg}&limit=20`;
    return { list: jsonList(await getJson(url)) };
}

async function play(inReq, _outResp) {
    const id = inReq.body.id || '';
    const playPage = joinUrl(BASE_URL, id);
    const page = await getHtml(playPage);
    const watch = playerUrl(page);
    if (watch) {
        const watchHtml = await getHtml(watch, {
            Referer: playPage,
            Origin: BASE_URL,
            Accept: '*/*',
        });
        let m3u8 =
            match(watchHtml, /var\s+src\s*=\s*['"]([^'"]+\.m3u8[^'"]*)/) ||
            match(watchHtml, /['"]([^'"]+\.m3u8[^'"]*)/);
        if (m3u8) {
            const real = joinUrl(watch, m3u8.replace(/\\\//g, '/'));
            let origin = BASE_URL;
            try {
                const u = new URL(watch);
                origin = `${u.protocol}//${u.host}`;
            } catch {
                /* keep */
            }
            return {
                parse: 0,
                playUrl: '',
                url: real,
                jx: 0,
                header: {
                    'User-Agent': UA,
                    Referer: watch,
                    Origin: origin,
                },
            };
        }
        return {
            parse: 0,
            playUrl: '',
            url: watch,
            jx: 0,
            header: {
                'User-Agent': UA,
                Referer: playPage,
                Origin: BASE_URL,
            },
        };
    }
    return {
        parse: 1,
        playUrl: '',
        url: playPage,
        jx: 0,
        header: {
            'User-Agent': UA,
            Referer: `${BASE_URL}/`,
        },
    };
}

export default {
    meta: {
        key: 'motv',
        name: '🎬MOTV',
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
