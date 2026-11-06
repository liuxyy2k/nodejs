import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const site = 'https://51xz.vip';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, Referer: `${site}/`, ...headers },
        timeout: 25000,
    });
    return resp.data;
}

/**
 * 这站是 Next.js App Router，正文 DOM 里封面是懒加载骨架（没有 img src），
 * 全部数据都在 RSC flight 流里：
 *   self.__next_f.push([1,"1:\"$Sreact.fragment\"\n2:I[...]"])
 * 先 unescape，再从里面抠出每个视频对象。
 */
function getFlight(html) {
    let out = '';
    const re = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;
    let match;
    while ((match = re.exec(html))) {
        try {
            out += JSON.parse('"' + match[1] + '"');
        } catch (e) {
            // 单个块坏了不影响其它块
        }
    }
    return out;
}

/** 从 flight 文本里平衡括号抠出所有对象，只保留真正的视频 */
function extractVideos(str) {
    if (!str) return [];
    const out = [];
    const seen = new Set();
    const re = /\{"id":"(c[a-z0-9]{15,})","slug":"/g;
    let match;

    while ((match = re.exec(str))) {
        const start = match.index;
        let depth = 0;
        let inStr = false;
        let esc = false;
        let closed = false;

        for (let i = start; i < str.length; i++) {
            const ch = str[i];
            if (inStr) {
                if (esc) esc = false;
                else if (ch === '\\') esc = true;
                else if (ch === '"') inStr = false;
                continue;
            }
            if (ch === '"') { inStr = true; continue; }
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    try {
                        const obj = JSON.parse(str.slice(start, i + 1));
                        // 视频对象一定同时有封面和 hls；分类/模块对象没有
                        if (obj.id && obj.coverUrl && obj.hlsUrl && !seen.has(obj.id)) {
                            seen.add(obj.id);
                            out.push(obj);
                        }
                    } catch (e) {
                        // 跳过坏对象
                    }
                    closed = true;
                    break;
                }
            }
        }
        if (closed) re.lastIndex = start + 1;
    }
    return out;
}

/** 时长 1974 -> 32:54 */
function fmtDuration(sec) {
    const n = parseInt(sec, 10);
    if (!Number.isFinite(n) || n <= 0) return '';
    const m = Math.floor(n / 60);
    const s = n % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function parseVods(html) {
    const videos = extractVideos(getFlight(html));
    return videos.map((v) => ({
        vod_id: `${v.id}/${v.slug || 'x'}`,
        vod_name: v.titleZh || v.titleEn || '',
        vod_pic: v.coverUrl || '',
        vod_remarks: fmtDuration(v.duration),
    }));
}

function parsePageCount(html, page) {
    let pagecount = page;
    const re = /[?&]page=(\d+)/g;
    let m;
    while ((m = re.exec(html))) {
        const n = parseInt(m[1]);
        if (n > pagecount && n < 10000) pagecount = n;
    }
    return pagecount;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'x-av', type_name: 'X-AV' },
        { type_id: '国产av', type_name: '国产AV' },
        { type_id: '国产精品', type_name: '国产精品' },
        { type_id: '日本无码', type_name: '日本无码' },
        { type_id: '欧美av', type_name: '欧美AV' },
        { type_id: '动漫av', type_name: '动漫AV' },
        { type_id: '真实自拍', type_name: '真实自拍' },
        { type_id: '网红女神', type_name: '网红女神' },
        { type_id: '网红黑料', type_name: '网红黑料' },
        { type_id: '今日吃瓜', type_name: '今日吃瓜' },
        { type_id: '娱乐吃瓜', type_name: '娱乐吃瓜' },
        { type_id: '海外吃瓜', type_name: '海外吃瓜' },
        { type_id: 'x吃瓜', type_name: 'X吃瓜' },
        { type_id: 'x视频', type_name: 'X视频' },
        { type_id: '短剧', type_name: '短剧' },
        { type_id: '古装历史', type_name: '古装历史' },
        { type_id: '年代农村', type_name: '年代农村' },
        { type_id: '情感剧场', type_name: '情感剧场' },
        { type_id: '穿越重生', type_name: '穿越重生' },
        { type_id: '爱好男同-1', type_name: '爱好男同' },
        { type_id: '成人小说', type_name: '成人小说' },
        { type_id: '连载完结', type_name: '连载完结' },
        { type_id: '阅读时光', type_name: '阅读时光' },
        { type_id: 'x小说', type_name: 'X小说' },
    ];

    const html = await request(site);
    const list = parseVods(html);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || inReq.body.tid || '').trim();
    const page = parseInt(inReq.body.page) || 1;

    if (!tid) return { page: 1, pagecount: 0, list: [] };

    let url = `${site}/m/${encodeURIComponent(tid)}`;
    if (page > 1) {
        url += `?page=${page}`;
    }

    const html = await request(url);
    const list = parseVods(html);

    return { page, pagecount: parsePageCount(html, page), list };
}

async function detail(inReq, _outResp) {
    const raw = String(inReq.body.id || '').trim();

    // vod_id 是 "id/slug"，缺 slug 会 404（slug 写错反而不影响）
    let id = raw;
    if (!id.includes('/')) id = `${id}/x`;

    const url = `${site}/video/${id}`;
    const html = await request(url);

    const videos = extractVideos(getFlight(html));
    const v = videos.find((x) => raw.startsWith(x.id)) || videos[0];

    if (!v) {
        return {
            list: [{
                vod_id: raw,
                vod_name: '',
                vod_pic: '',
                vod_year: '',
                vod_play_from: '51X',
                vod_play_url: '',
            }],
        };
    }

    const desc = v.descriptionZh || v.titleZh || '';

    return {
        list: [{
            vod_id: `${v.id}/${v.slug || 'x'}`,
            vod_name: v.titleZh || v.titleEn || '',
            vod_pic: v.coverUrl || '',
            vod_content: desc,
            vod_remarks: fmtDuration(v.duration),
            vod_year: (v.publishedAt || '').slice(0, 4),
            vod_play_from: '51X',
            vod_play_url: `正片$${v.hlsUrl}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '').trim();
    const header = {
        'User-Agent': UA,
        Referer: `${site}/`,
    };

    if (!id) return { parse: 1, url: '', header: {} };

    // 已经是 m3u8 就直接播
    if (/\.(m3u8|mp4)(\?|#|$)/i.test(id)) {
        return { parse: 0, url: id, header };
    }

    // 否则当成 vod_id，回详情页取 hls
    try {
        const detailId = id.includes('/') ? id : `${id}/x`;
        const html = await request(`${site}/video/${detailId}`);
        const videos = extractVideos(getFlight(html));
        const v = videos.find((x) => id.startsWith(x.id)) || videos[0];
        if (v && v.hlsUrl) {
            return { parse: 0, url: v.hlsUrl, header };
        }
    } catch (e) {
        // 落到下面的兜底
    }

    return { parse: 1, url: `${site}/video/${id}`, header };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);

    if (!key) return { list: [], page: 1 };

    let url = `${site}/search?q=${encodeURIComponent(key)}`;
    if (pg > 1) url += `&page=${pg}`;

    const html = await request(url);
    return { list: parseVods(html), page: pg, pagecount: parsePageCount(html, pg) };
}

export default {
    meta: {
        key: '51xz',
        name: '🌸51X',
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
