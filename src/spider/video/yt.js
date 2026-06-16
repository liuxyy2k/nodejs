import axios from 'axios';
import crypto from 'crypto';

const FIXED_CONFIG = {
    host:   'http://pgcms.lyyytv.cn',
    cmskey: 'wP5btxoc3yv8FoBQENFZumF0EUYr4LTy',
};

const UA = 'okhttp/4.12.0';

const http = axios.create({
    timeout: 10_000,
    headers: { 'User-Agent': UA },
});

// ─── 配置 ─────────────────────────────────────────────────────────────────────

const EXTERNAL_PARSER  = 'http://yoyo.ovg.sh/yt/ttjx.php?url=';
const NEED_PARSE_LINES = ['藤藤', '茫茫', '小爱', '小优', '小哩'];

const NEW_PARSERS = [
    'http://nm.4688888.xyz/jiexi.php?data=093207528aec95afa4616e7afb8e2649&url=',
    'http://120.46.190.255//jiexi.php?data=f603bb5f52a0cc1db4064599c3cc9abf&url=',
    'http://8.155.50.80/xiayexk.php?url=',
    'https://qsy.wya6.cn/parse.php?url=',
    'http://yoyo168.zabc.net/getjx.php?host=http://154.222.26.58:7788&key=guodan2004031600&api=6d735c167eeda72b836cf382e4863f3f&v=',
    'https://cachem3u8.2s0.cn:8899/Th_JsonApi.php?url=',
    'http://mg.itufm.top/mg.php?url=',
    'https://jx.xmflv.com/?url=',
    'https://pp1301239612013983305599.tai2tai.sbs/?url=',
    'https://jx.m3u8.tv/jiexi/?url=',
];

const DIRECT_SNIFF_KEYS = ['tai2tai.sbs', 'xmflv.com', 'm3u8.tv'];

const LINE_NAME_MAPPING = {
    '移动云': '移不动', '天翼云': '天意也', '联通云': '联不通',
    '蓝奏云': '拦着揍', '腾讯': '藤藤', '芒果': '茫茫',
    '爱奇艺': '小爱', '优酷': '小优', 'BL线路': '小哩',
};

const LINE_ORDER = ['移不动', '天意也', '联不通', '拦着揍', '藤藤', '茫茫', '小爱', '小优', '小哩'];

const LINE_HEADERS = {
    '藤藤': { 'User-Agent': UA, Referer: 'https://v.qq.com'          },
    '茫茫': { 'User-Agent': UA, Referer: ''                           },
    '小爱': { 'User-Agent': UA, Referer: 'https://www.iqiyi.com'      },
    '小优': { 'User-Agent': UA, Referer: 'https://v.youku.com'        },
    '小哩': { 'User-Agent': UA, Referer: 'https://www.bilibili.com'   },
};

const TEST_PATTERNS = [
    'oplist.wya6.cn', 'web.wya6.com', 'k0udeyaayccydz.djvod.ndcimgs.com',
    'pan.baidu.re', 'www.panurl.cn', 'test.mp4', 'demo.mp4', 'sample.mp4',
    'short.mp4', 'preview.mp4', 'trailer.mp4', 'ad.mp4', 'error.html', '404.mp4',
];

// ─── Crypto ───────────────────────────────────────────────────────────────────

function lvdou(text) {
    if (!text.startsWith('lvdou+')) return text;
    try {
        const key  = Buffer.from(FIXED_CONFIG.cmskey.slice(0, 16), 'utf-8');
        const iv   = Buffer.from(FIXED_CONFIG.cmskey.slice(-16),    'utf-8');
        const ct   = Buffer.from(text.slice('lvdou+'.length), 'base64');
        const dec  = crypto.createDecipheriv('aes-128-cbc', key, iv);
        const pt   = Buffer.concat([dec.update(ct), dec.final()]);
        // 去掉 PKCS7 padding
        const pad  = pt[pt.length - 1];
        return pt.slice(0, pt.length - pad).toString('utf-8');
    } catch {
        return text;
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lineHeader(flag) {
    return LINE_HEADERS[flag] || { 'User-Agent': UA };
}

function isTestVideo(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return TEST_PATTERNS.some((p) => lower.includes(p));
}

function extractVideoUrlFromJson(data) {
    if (!data) return null;
    const fields = ['url', 'm3u8', 'play_url', 'video_url', 'src', 'link'];
    for (const f of fields) {
        if (typeof data[f] === 'string' && data[f]) return data[f];
    }
    if (data.data && typeof data.data === 'object') {
        for (const f of fields) {
            if (typeof data.data[f] === 'string' && data.data[f]) return data.data[f];
        }
    }
    return null;
}

function sortPlayLines(showList, urlList) {
    if (showList.length !== urlList.length) return [showList, urlList];
    const origOrder = Object.fromEntries(showList.map((n, i) => [n, i]));
    const lineMap   = Object.fromEntries(showList.map((n, i) => [n, urlList[i]]));

    const sortedShow = [], sortedUrls = [];
    for (const name of LINE_ORDER) {
        if (lineMap[name] !== undefined) {
            sortedShow.push(name);
            sortedUrls.push(lineMap[name]);
            delete lineMap[name];
        }
    }
    const remaining = Object.entries(lineMap)
        .sort((a, b) => origOrder[a[0]] - origOrder[b[0]]);
    for (const [name, url] of remaining) {
        sortedShow.push(name);
        sortedUrls.push(url);
    }
    return [sortedShow, sortedUrls];
}

// ─── 解析器 ───────────────────────────────────────────────────────────────────

async function tryParsers(videoUrl, parsers, flag) {
    const header = lineHeader(flag);
    const VIDEO_RE = [
        /src=["']([^"']+\.(?:m3u8|mp4)[^"']*)['"]/gi,
        /url["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)['"]/gi,
        /video["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)['"]/gi,
        /file["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)['"]/gi,
    ];

    for (const parser of parsers) {
        try {
            const parsedUrl  = parser + encodeURIComponent(videoUrl);
            const isSniff    = DIRECT_SNIFF_KEYS.some((k) => parser.includes(k));

            if (isSniff) return { parse: 1, url: parsedUrl, header };

            const { data: content, status, headers: resHeaders } =
                await http.get(parsedUrl, { responseType: 'text', headers: header });
            if (status !== 200) continue;

            if (isTestVideo(content)) continue;

            // m3u8 内容
            if (content.includes('#EXTM3U')) {
                const ct = resHeaders['content-type'] || '';
                return { parse: /\.m3u8/.test(content) || ct.includes('video/') ? 0 : 1, jx: 0, url: parsedUrl, header };
            }

            // JSON
            if (content.trim().startsWith('{')) {
                try {
                    const j = JSON.parse(content);
                    const u = extractVideoUrlFromJson(j);
                    if (u) return { parse: 0, jx: 0, url: u, header };
                } catch { continue; }
            }

            // 正则提取
            for (const re of VIDEO_RE) {
                re.lastIndex = 0;
                for (const m of content.matchAll(re)) {
                    if (m[1].startsWith('http')) return { parse: 0, jx: 0, url: m[1], header };
                }
            }

            // 直接找链接
            const direct = content.match(/https?:\/\/[^\s<>"']+\.(?:m3u8|mp4)[^\s<>"']*/);
            if (direct) return { parse: 0, jx: 0, url: direct[0], header };

        } catch { continue; }
    }

    return { parse: 1, jx: 1, url: videoUrl, header };
}

async function parseExternalDirect(videoUrl, flag) {
    const header = lineHeader(flag);
    try {
        const parsedUrl    = EXTERNAL_PARSER + encodeURIComponent(videoUrl);
        const { data: content, status } = await http.get(parsedUrl, {
            responseType: 'text', maxRedirects: 5, headers: header,
        });
        if (status !== 200) return { parse: 1, jx: 1, url: videoUrl, header };

        if (content.trim().startsWith('{')) {
            try {
                const j = JSON.parse(content);
                const u = extractVideoUrlFromJson(j);
                if (u) return { parse: 0, jx: 0, url: u, header };
            } catch { /* ignore */ }
        }

        if (content.includes('#EXTM3U')) return { parse: 0, jx: 0, url: parsedUrl, header };

        const m = content.match(/https?:\/\/[^\s<>"']+\.(?:m3u8|mp4)[^\s<>"']*/);
        if (m) return { parse: 0, jx: 0, url: m[0], header };
    } catch { /* ignore */ }

    return { parse: 1, jx: 1, url: videoUrl, header };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const { data } = await http.get(`${FIXED_CONFIG.host}/api.php/app/nav?token=`);
    const keys    = ['class', 'area', 'lang', 'year', 'letter', 'by', 'sort'];
    const classes = [];
    const filters = {};

    for (const item of data.list || []) {
        const tid = String(item.type_id);
        classes.push({ type_id: tid, type_name: item.type_name });

        const ext = item.type_extend || {};
        const filterList = [];
        for (const key of keys) {
            if (ext[key]?.trim()) {
                const values = ext[key].split(',')
                    .filter((v) => v.trim())
                    .map((v) => ({ n: v.trim(), v: v.trim() }));
                filterList.push({ key, name: key, value: values });
            }
        }
        if (filterList.length) filters[tid] = filterList;
    }

    // 首页推荐
    let list = [];
    try {
        const { data: homeData } = await http.get(`${FIXED_CONFIG.host}/api.php/app/index_video?token=`);
        for (const item of homeData.list || []) list.push(...(item.vlist || []));
    } catch { /* ignore */ }

    return { class: classes, filters, list };
}

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const pg     = inReq.body.page || '1';
    const extend = inReq.body.extend || {};

    const { data } = await http.get(`${FIXED_CONFIG.host}/api.php/app/video`, {
        params: {
            tid,
            class: extend.class || '',
            area:  extend.area  || '',
            lang:  extend.lang  || '',
            year:  extend.year  || '',
            limit: '18',
            pg,
        },
    });
    return data;
}

async function detail(inReq, _outResp) {
    const { data } = await http.get(
        `${FIXED_CONFIG.host}/api.php/app/video_detail?id=${inReq.body.id}`
    );
    const vod = data.data;

    const show = [], playUrls = [];

    for (const i of vod.vod_url_with_player || []) {
        const origName = (i.name || '').trim();
        if (LINE_NAME_MAPPING[origName] === '') continue;

        const displayName = LINE_NAME_MAPPING[origName] || origName;
        const urls = (i.url || '').split('#').filter(Boolean).map((j) => {
            let u = j.startsWith('lvdou+') ? lvdou(j) : j;
            const parts = u.split('$', 2);
            return parts.length === 2 ? `${parts[0]}$${parts[1]}` : u;
        });

        playUrls.push(urls.join('#'));
        show.push(displayName);
    }

    delete vod.vod_url_with_player;

    const [sortedShow, sortedUrls] = sortPlayLines(show, playUrls);
    vod.vod_play_from = sortedShow.join('$$$');
    vod.vod_play_url  = sortedUrls.join('$$$');

    return { list: [vod] };
}

async function play(inReq, _outResp) {
    const flag     = inReq.body.flag || '';
    let   videoId  = inReq.body.id   || '';

    videoId = videoId.startsWith('lvdou+') ? lvdou(videoId) : videoId;
    const header = lineHeader(flag);

    // 已是 m3u8
    if (videoId.endsWith('.m3u8') || videoId.includes('.m3u8?') || videoId.includes('#EXTM3U')) {
        return { parse: 0, jx: 0, url: videoId, header };
    }

    // 需要新解析器的线路
    if (NEED_PARSE_LINES.includes(flag) ||
        /(?:www\.iqiyi|v\.qq|v\.youku|www\.mgtv|www\.bilibili)\.com/.test(videoId)) {
        return tryParsers(videoId, NEW_PARSERS, flag);
    }

    return parseExternalDirect(videoId, flag);
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg  = inReq.body.pg || '1';

    const { data } = await http.get(
        `${FIXED_CONFIG.host}/api.php/app/search?text=${encodeURIComponent(key)}&pg=${pg}`
    );
    for (const item of data.list || []) delete item.type;
    return { list: data.list || [], page: pg };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'lyyytv',
        name: '🔥小心儿悠悠',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};