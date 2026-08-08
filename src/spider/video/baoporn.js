import axios from 'axios';
import https from 'https';

/**
 * BaoPorn - https://baoporn.com
 * MP4 直链 (data-url 反转 base64 解密)
 */

const host = 'https://baoporn.com';
const UA = 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36';

const CATS = [
    [1, '最新视频', 'video'],
    [2, '国产', 'tag/%E5%9B%BD%E4%BA%A7'],
    [3, '日本', 'tag/%E6%97%A5%E6%9C%AC'],
    [4, '自拍', 'tag/%E8%87%AA%E6%8B%8D'],
    [5, '剧情', 'tag/%E5%89%A7%E6%83%85'],
    [6, '探花', 'tag/%E6%8E%A2%E8%8A%B1'],
    [7, '酒店', 'tag/%E9%85%92%E5%BA%97'],
    [8, '约炮', 'tag/%E7%BA%A6%E7%82%AE'],
    [9, '台湾', 'tag/%E5%8F%B0%E6%B9%BE'],
    [10, '人妻', 'tag/%E4%BA%BA%E5%A6%BB'],
    [11, '美女', 'tag/%E7%BE%8E%E5%A5%B3'],
    [12, '麻豆传媒', 'tag/%E9%BA%BB%E8%B1%86%E4%BC%A0%E5%AA%92'],
    [13, '制服', 'tag/%E5%88%B6%E6%9C%8D'],
    [14, '3P', 'tag/3P'],
    [15, '巨乳', 'tag/%E5%B7%A8%E4%B9%B3'],
    [16, '口爆', 'tag/%E5%8F%A3%E7%88%86'],
    [17, '极品', 'tag/%E6%9E%81%E5%93%81'],
    [18, '中出', 'tag/%E4%B8%AD%E5%87%BA'],
    [19, '推特', 'tag/%E6%8E%A8%E7%89%B9'],
    [20, '多P', 'tag/%E5%A4%9AP'],
    [21, '加勒比', 'tag/%E5%8A%A0%E5%8B%92%E6%AF%94'],
    [22, '无毛', 'tag/%E6%97%A0%E6%AF%9B'],
    [23, '高颜值', 'tag/%E9%AB%98%E9%A2%9C%E5%80%BC'],
    [24, 'FansOne', 'tag/FansOne'],
    [25, '素人', 'tag/%E7%B4%A0%E4%BA%BA'],
    [26, '粉嫩', 'tag/%E7%B2%89%E5%AB%A9'],
    [27, '私拍', 'tag/%E7%A7%81%E6%8B%8D'],
    [28, '调教', 'tag/%E8%B0%83%E6%95%99'],
    [29, '一本道', 'tag/%E4%B8%80%E6%9C%AC%E9%81%93'],
    [30, '白虎', 'tag/%E7%99%BD%E8%99%8E'],
    [31, '露出', 'tag/%E9%9C%B2%E5%87%BA'],
    [32, '裸体', 'tag/%E8%A3%B8%E4%BD%93'],
    [33, '少妇', 'tag/%E5%B0%91%E5%A6%87'],
    [34, '网红', 'tag/%E7%BD%91%E7%BA%A2'],
    [35, '女同', 'tag/%E5%A5%B3%E5%90%8C'],
    [36, '御姐', 'tag/%E5%BE%A1%E5%A7%90'],
    [37, '继母', 'tag/%E7%BB%A7%E6%AF%8D'],
    [38, '吞精', 'tag/%E5%90%9E%E7%B2%BE'],
    [39, '双飞', 'tag/%E5%8F%8C%E9%A3%9E'],
    [40, 'VIP', 'tag/VIP'],
    [41, 'OnlyFans', 'tag/onlyfans'],
    [42, 'Fansly', 'tag/Fansly'],
];

const CAT_MAP = Object.fromEntries(CATS.map(([cid, , path]) => [String(cid), path]));
const CLASSES = CATS.map(([cid, name]) => ({ type_id: String(cid), type_name: name }));

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const http = axios.create({
    timeout: 20_000,
    httpsAgent,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    },
});

function getHeaders() {
    return {
        'User-Agent': UA,
        Referer: `${host}/`,
    };
}

async function fetchText(url, retries = 2) {
    for (let i = 0; i < retries; i++) {
        try {
            const resp = await http.get(url, { headers: getHeaders(), responseType: 'text' });
            if (resp.status === 200) {
                return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            }
        } catch {
            /* retry */
        }
        if (i < retries - 1) await new Promise((r) => setTimeout(r, 1000));
    }
    return '';
}

function decryptDataUrl(encoded) {
    try {
        let s = String(encoded || '').split('').reverse().join('');
        const pad = s.length % 4;
        if (pad) s += '='.repeat(4 - pad);
        return Buffer.from(s, 'base64').toString('utf8');
    } catch {
        return '';
    }
}

function parseCards(html) {
    const items = [];
    const parts = html.split('class="video-card group"');

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        const vidMatch = part.match(/href="\/video\/([A-Za-z0-9]+)"/);
        if (!vidMatch) continue;

        const vid = vidMatch[1];
        const imgMatch = part.match(/<img src="([^"]+)" alt="([^"]*)"/);
        let pic = imgMatch?.[1] || '';
        let title = imgMatch?.[2] || '';

        if (!title) {
            const titleMatch = part.match(/<p class="text-sm[^"]*">([^<]+)<\/p>/);
            title = titleMatch?.[1]?.trim() || vid;
        }

        const durMatch = part.match(/right-1 bg-black[^>]*>([^<]+)<\/span>/);
        const duration = durMatch?.[1] || '';
        const viewMatch = part.match(/fa-eye[^>]*><\/i>([\d.]+[KMW]?)/);
        const views = viewMatch?.[1] || '';

        let remark = duration;
        if (views) remark = remark ? `${remark} | ${views}播放` : `${views}播放`;

        items.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remark,
        });
    }

    return items;
}

function parseMaxPage(html) {
    let maxPg = 1;
    for (const m of html.matchAll(/\/page\/(\d+)/g)) {
        const n = parseInt(m[1], 10);
        if (n > maxPg) maxPg = n;
    }
    return maxPg;
}

function buildCategoryUrl(tid, pg) {
    const path = CAT_MAP[String(tid)] || 'video';
    const page = parseInt(pg, 10) || 1;
    if (page <= 1) return `${host}/${path}`;
    return `${host}/${path}/page/${page}`;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await fetchText(`${host}/video`);
    const list = html ? parseCards(html) : [];
    return { class: CLASSES, filters: {}, list };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '1');
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url = buildCategoryUrl(tid, pg);

    const html = await fetchText(url);
    if (!html) {
        return { page: pg, pagecount: 1, limit: 16, total: 0, list: [] };
    }

    const items = parseCards(html);
    return {
        page: pg,
        pagecount: parseMaxPage(html),
        limit: 16,
        total: items.length,
        list: items,
    };
}

async function detail(inReq, _outResp) {
    const did = String(inReq.body.id || '');
    if (!did) return { list: [] };

    const html = await fetchText(`${host}/video/${did}`);
    if (!html) return { list: [] };

    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const title = titleMatch?.[1]?.trim() || '';

    const picMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    const pic = picMatch?.[1] || '';

    const dataMatch = html.match(/data-url="([^"]+)"/);
    const playUrl = dataMatch ? decryptDataUrl(dataMatch[1]) : '';
    if (!playUrl) return { list: [] };

    const tags = [...html.matchAll(/href="\/tag\/[^"]+"[^>]*>#([^<]+)<\/a>/g)]
        .map((m) => m[1])
        .slice(0, 8);
    const tagStr = tags.length ? tags.join('、') : '';

    let content = title || '';
    if (tagStr) content += `\n\n标签: ${tagStr}`;

    return {
        list: [
            {
                vod_id: did,
                vod_name: title || did,
                vod_pic: pic,
                vod_content: content,
                vod_play_from: 'BaoPorn',
                vod_play_url: `播放$${playUrl}`,
                vod_remarks: 'MP4',
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    return {
        parse: 0,
        url: id,
        header: getHeaders(),
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;

    let url = `${host}/search?q=${encodeURIComponent(key)}`;
    if (pg > 1) url += `&page=${pg}`;

    const html = await fetchText(url);
    const items = html ? parseCards(html) : [];

    return {
        list: items,
        page: pg,
        pagecount: 1,
    };
}

export default {
    meta: {
        key: 'baoporn',
        name: '🔥BaoPorn',
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
