import axios from 'axios';
import https from 'https';

/**
 * 夜色 - https://yese.co
 * MacCMS · player_aaaa · AJAX 搜索
 */

const DEFAULT_HOST = 'https://yese.co';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

const CLASSES = [
    { type_name: '亚洲情色', type_id: '亚洲情色' },
    { type_name: '中文字幕', type_id: '中文字幕' },
    { type_name: '国产主播', type_id: '国产主播' },
    { type_name: '国产自拍', type_id: '国产自拍' },
    { type_name: '无码专区', type_id: '无码专区' },
    { type_name: '欧美性爱', type_id: '欧美性爱' },
    { type_name: '熟女人妻', type_id: '熟女人妻' },
    { type_name: '强奸乱伦', type_id: '强奸乱伦' },
    { type_name: '巨乳美乳', type_id: '巨乳美乳' },
    { type_name: '制服诱惑', type_id: '制服诱惑' },
    { type_name: '女同性恋', type_id: '女同性恋' },
    { type_name: '卡通动画', type_id: '卡通动画' },
    { type_name: '丝袜长腿', type_id: '丝袜长腿' },
    { type_name: '少女萝莉', type_id: '少女萝莉' },
    { type_name: '重口色情', type_id: '重口色情' },
];


let host = DEFAULT_HOST;

const http = axios.create({
    timeout: 10_000,
    validateStatus: () => true,
});

function getHeaders(referer) {
    return {
        'User-Agent': UA,
        Referer: referer || `${host}/`,
    };
}

function fixUrl(path) {
    const v = String(path || '').trim();
    if (!v) return '';
    if (v.startsWith('http')) return v;
    if (v.startsWith('//')) return `https:${v}`;
    return new URL(v, `${host}/`).href;
}

function cleanText(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function fetchHtml(url) {
    try {
        const resp = await http.get(url, { headers: getHeaders(), responseType: 'text' });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

async function fetchJson(url) {
    try {
        const resp = await http.get(url, { headers: getHeaders() });
        if (resp.status !== 200) return null;
        return resp.data;
    } catch {
        return null;
    }
}

function parseVideoList(html) {
    const videos = [];
    const seen = new Set();
    if (!html) return videos;

    const pattern =
        /<a href="(\/vod\/play\/id\/(\d+)\/sid\/\d+\/nid\/\d+\/)">\s*<img[^>]+src="([^"]+)"[^>]+title="([^"]+)"/gi;

    let match;
    while ((match = pattern.exec(html)) !== null) {
        const vodId = match[2];
        if (seen.has(vodId)) continue;
        seen.add(vodId);

        videos.push({
            vod_id: vodId,
            vod_name: cleanText(match[4]),
            vod_pic: match[3],
            vod_remarks: '',
        });
    }

    return videos;
}

async function init(inReq, _outResp) {
    const extend = inReq.body?.extend ?? '';
    if (extend && String(extend).startsWith('http')) {
        host = String(extend).replace(/\/$/, '');
    } else if (typeof extend === 'object' && extend?.host) {
        host = String(extend.host).replace(/\/$/, '');
    } else {
        host = DEFAULT_HOST;
    }
    return {};
}

async function home(_inReq, _outResp) {
    const cat = await category({ body: { id: '', page: 1 } }, null);
    return { class: CLASSES, filters: {}, list: cat.list || [] };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '').trim();
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);

    const url = tid
        ? `${host}/vod/show/class/${encodeURIComponent(tid)}/id/1/page/${page}/`
        : `${host}/vod/show/id/1/page/${page}/`;

    const html = await fetchHtml(url);
    const videos = parseVideoList(html);
    const pagecount = html.includes('下一页') ? page + 1 : page;

    return {
        page,
        pagecount,
        limit: 24,
        total: pagecount * 24,
        list: videos,
    };
}

async function detail(inReq, _outResp) {
    const vodId = String(
        Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '',
    );

    const html = await fetchHtml(`${host}/vod/detail/id/${vodId}/`);

    let name = '';
    let pic = '';
    let remarks = '';
    let content = '';
    let typeName = '';

    const titleM = html.match(/<h1[^>]*class="title"[^>]*>([\s\S]*?)<\/h1>/i);
    if (titleM) name = cleanText(titleM[1]);

    let picM = html.match(/data-original="([^"]+)"/);
    if (!picM) picM = html.match(/<img[^>]+src="([^"]+)"[^>]+data-original=/);
    if (picM) pic = picM[1];

    const remarkM = html.match(/更新：\s*<\/span>\s*([^<]+)/);
    if (remarkM) remarks = cleanText(remarkM[1]);

    const typeM = html.match(/●分類\s*:\s*<a[^>]*>([\s\S]*?)<\/a>/);
    if (typeM) typeName = cleanText(typeM[1]);

    const contentM = html.match(/<span class="data"[^>]*>([\s\S]*?)<\/span>/);
    if (contentM) content = cleanText(contentM[1]);
    if (!content) content = name;

    let playList =
        [...html.matchAll(
            /<li[^>]*class="[^"]*col-lg-10[^"]*"[^>]*>\s*<a[^>]+href="(\/vod\/play\/id\/\d+\/sid\/\d+\/nid\/\d+\/)"[^>]*>([\s\S]*?)<\/a>/gi,
        )].map((m) => [m[1], m[2]]) || [];

    if (!playList.length) {
        playList = [
            ...html.matchAll(
                /<a[^>]+class="btn btn-default"[^>]+href="(\/vod\/play\/id\/\d+\/sid\/\d+\/nid\/\d+\/)"[^>]*>([\s\S]*?)<\/a>/gi,
            ),
        ].map((m) => [m[1], m[2]]);
    }

    const playUrls = playList.map(([href, title]) => {
        const epName = cleanText(title) || '播放';
        return `${epName}$${fixUrl(href)}`;
    });

    if (!playUrls.length) {
        playUrls.push(`播放$${host}/vod/play/id/${vodId}/sid/1/nid/1/`);
    }

    return {
        list: [{
            vod_id: vodId,
            vod_name: name,
            vod_pic: pic,
            type_name: typeName,
            vod_year: '',
            vod_area: '',
            vod_remarks: remarks,
            vod_actor: '',
            vod_director: '',
            vod_content: content,
            vod_play_from: '夜色',
            vod_play_url: playUrls.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    let playUrl = id;

    try {
        const url = id.startsWith('http') ? id : fixUrl(id);
        const html = await fetchHtml(url);

        if (html) {
            const playerM = html.match(/var\s+player_aa\w*\s*=\s*(\{[\s\S]*?\});/);
            if (playerM) {
                try {
                    const playerInfo = JSON.parse(playerM[1]);
                    const rawUrl = playerInfo.url || '';
                    if (rawUrl) playUrl = decodeURIComponent(rawUrl);
                } catch {
                    /* keep */
                }
            }

            if (!playUrl.startsWith('http') || !playUrl.includes('.m3u8')) {
                const m3u8M = html.match(/(https?:\/\/[^'"]+\.m3u8[^'"]*)/);
                if (m3u8M) playUrl = m3u8M[1];
            }

            playUrl = playUrl.replace(/\\\//g, '/');
        }
    } catch {
        /* fallback to id */
    }

    return {
        parse: 0,
        playUrl: '',
        url: playUrl,
        header: getHeaders(),
    };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);

    if (!key) return { list: [] };

    const api = `${host}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(key)}&page=${page}`;
    const data = await fetchJson(api);
    const videos = (data?.list || []).map((item) => ({
        vod_id: String(item.id || ''),
        vod_name: item.name || '',
        vod_pic: item.pic || '',
        vod_remarks: '',
    }));

    return { list: videos };
}

export default {
    meta: {
        key: 'yese',
        name: '🔥夜色',
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
