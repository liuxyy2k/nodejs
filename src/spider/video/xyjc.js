import axios from 'axios';
import https from 'https';

/**
 * 性运机场 - https://xyjc8.cfd/
 * 苹果 CMS · /frim/index · player_aaaa
 */

const site = 'https://xyjc8.cfd';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CLASSES = [
    { type_id: '25', type_name: '国产视频' },
    { type_id: '26', type_name: '中文字幕' },
    { type_id: '27', type_name: '国产传媒' },
    { type_id: '28', type_name: '日本有码' },
    { type_id: '29', type_name: '日本无码' },
    { type_id: '30', type_name: '欧美无码' },
    { type_id: '31', type_name: '强奸乱伦' },
    { type_id: '32', type_name: '制服诱惑' },
    { type_id: '33', type_name: '国产主播' },
    { type_id: '34', type_name: '激情动漫' },
    { type_id: '35', type_name: '明星换脸' },
    { type_id: '36', type_name: '抖阴视频' },
    { type_id: '37', type_name: '女优明星' },
    { type_id: '38', type_name: '网曝黑料' },
    { type_id: '39', type_name: '伦理三级' },
    { type_id: '40', type_name: 'AV解说' },
    { type_id: '41', type_name: 'SM调教' },
    { type_id: '42', type_name: '萝莉少女' },
    { type_id: '43', type_name: '极品媚黑' },
    { type_id: '44', type_name: '女同性恋' },
    { type_id: '45', type_name: '网红头条' },
    { type_id: '46', type_name: '人妖系列' },
    { type_id: '47', type_name: '韩国主播' },
    { type_id: '48', type_name: 'VR视角' },
];

const LIST_RE =
    /<div class="col-md-2 col-sm-3 col-xs-4[^"]*">[\s\S]*?<a class="videopic lazy"[^>]*href="([^"]+)"[^>]*title="([^"]*)"[^>]*data-original="([^"]*)"[^>]*>[\s\S]*?<span class="score">([^<]*)<\/span>[\s\S]*?<\/div>\s*<\/div>/g;

const SEARCH_RE =
    /<div class="hy-video-details active clearfix">[\s\S]*?<a class="videopic"[^>]*href="([^"]+)"[^>]*style="[^"]*url\(([^)]+)\)[^"]*"[^>]*>[\s\S]*?<h3><a[^>]*href="[^"]+"[^>]*>([^<]*)<\/a><\/h3>[\s\S]*?<span class="branch">([^<]*)<\/span>/g;


const http = axios.create({
    timeout: 15_000,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        Referer: `${site}/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    },
});

function getHeaders(extra = {}) {
    return {
        'User-Agent': UA,
        Referer: `${site}/`,
        ...extra,
    };
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

async function postHtml(url, data) {
    try {
        const resp = await http.post(url, data, {
            headers: getHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
            responseType: 'text',
        });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function parseVid(href) {
    const m = href.match(/\/movie\/index(\d+)\.html/);
    return m ? m[1] : '';
}

function parseList(html) {
    if (!html) return [];
    const items = [];

    for (const m of html.matchAll(LIST_RE)) {
        const href = m[1];
        const title = (m[2] || '').trim();
        const pic = m[3] || '';
        const score = (m[4] || '').trim();
        const vid = parseVid(href);
        if (!vid || !title) continue;
        items.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: score ? `${score}分` : '',
        });
    }
    if (items.length) return items;

    for (const m of html.matchAll(SEARCH_RE)) {
        const href = m[1];
        const pic = m[2] || '';
        const title = (m[3] || '').trim();
        const score = (m[4] || '').trim();
        const vid = parseVid(href);
        if (!vid || !title) continue;
        items.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: score ? `${score}分` : '',
        });
    }
    return items;
}

function parseTotalPages(html, tid) {
    const tail = html.match(new RegExp(`<a href="[^"]*index${tid}-(\\d+)\\.html">尾页</a>`));
    if (tail) return parseInt(tail[1], 10);

    const pages = [...html.matchAll(new RegExp(`<a href="[^"]*index${tid}-(\\d+)\\.html">(\\d+)</a>`, 'g'))];
    if (pages.length) return Math.max(...pages.map((p) => parseInt(p[1], 10)));
    return 1;
}

function extractPlayUrl(html) {
    let playUrl = '';
    let start = html.indexOf('var player_aaaa=');
    if (start === -1) start = html.indexOf('var player_aaaa =');
    if (start !== -1) {
        const segment = html.slice(start, start + 2000);
        const urlMatch = segment.match(/"url"\s*:\s*"([^"]+)"/);
        if (urlMatch) {
            playUrl = urlMatch[1].replace(/\\\//g, '/');
            if (playUrl.includes('test.cn')) playUrl = '';
        }
    }
    return playUrl;
}

function isDirectMedia(url) {
    return /\.(m3u8|mp4|m3u)(\?|$)/i.test(url || '');
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await fetchHtml(`${site}/`);
    const list = html ? parseList(html).slice(0, 20) : [];
    return { class: CLASSES, filters: {}, list };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '25');
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url =
        page > 1 ? `${site}/frim/index${tid}-${page}.html` : `${site}/frim/index${tid}.html`;

    const html = await fetchHtml(url);
    if (!html) {
        return { list: [], page, pagecount: 0, limit: 20, total: 0 };
    }

    return {
        list: parseList(html),
        page,
        pagecount: parseTotalPages(html, tid) || 99,
        limit: 20,
        total: 0,
    };
}

async function detail(inReq, _outResp) {
    const vid = String(inReq.body.id || '');
    if (!vid) return { list: [] };

    const url = `${site}/movie/index${vid}.html`;
    const html = await fetchHtml(url);
    if (!html) return { list: [] };

    const titleMatch = html.match(/<title>(.*?)在线播放.*?<\/title>/s);
    const vodName = titleMatch ? titleMatch[1].trim() : '视频';

    const picMatch = html.match(/<a class="videopic"[^>]*style="background: url\(([^)]+)\)/);
    const vodPic = picMatch ? picMatch[1].trim() : '';

    let playUrl = extractPlayUrl(html);

    if (!playUrl) {
        const playHtml = await fetchHtml(`${site}/play/${vid}-0-0.html`);
        if (playHtml) {
            const nowMatch = playHtml.match(/var now="([^"]+)"/);
            if (nowMatch) playUrl = nowMatch[1];
        }
    }

    if (playUrl && playUrl.startsWith('http')) {
        return {
            list: [
                {
                    vod_id: vid,
                    vod_name: vodName,
                    vod_pic: vodPic,
                    vod_remarks: '',
                    vod_content: '',
                    vod_play_from: '直链',
                    vod_play_url: `直链$${playUrl}`,
                },
            ],
        };
    }

    return {
        list: [
            {
                vod_id: vid,
                vod_name: vodName,
                vod_pic: vodPic,
                vod_remarks: '',
                vod_content: '',
                vod_play_from: '嗅探',
                vod_play_url: `嗅探$${url}`,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    if (!id) return { parse: 1, url: '', header: getHeaders() };

    const header = getHeaders();
    if (isDirectMedia(id) || id.startsWith('http://') || id.startsWith('https://')) {
        return { parse: 0, url: id, header };
    }
    return { parse: 1, url: id, header };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const page = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
    if (!key) return { list: [], page };

    const html = await postHtml(`${site}/search.php`, `searchword=${encodeURIComponent(key)}`);
    if (!html || html.includes('关键字不能为空')) {
        return { list: [], page };
    }

    return { list: parseList(html), page };
}

export default {
    meta: {
        key: 'xyjc',
        name: '💋性运机场',
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
