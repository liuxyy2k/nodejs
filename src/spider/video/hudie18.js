import req from '../../util/req.js';

const DEFAULT_HOST = 'https://t3.18j61.cc';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BRAND = '蝴蝶影视';
const SKIP_TITLES = new Set(['首页', '短视频', '演员', '标签', '图文', '黑料']);

const SORT_VALUES = [
    { n: '最近更新', v: 'time' },
    { n: '今日热播', v: 'hits_day' },
    { n: '今日点赞', v: 'up_day' },
    { n: '好评榜', v: 'up' },
];

const CLASSES = [
    { type_id: '1', type_name: '国产' },
    { type_id: '2', type_name: '日韩' },
    { type_id: '3', type_name: '欧美' },
    { type_id: '4', type_name: '伦理' },
    { type_id: '5', type_name: '动漫' },
    { type_id: '6', type_name: '另类' },
    { type_id: '9', type_name: '成人AI' },
];

const FILTERS = {
    1: [
        {
            key: 'sub_id',
            name: '子分类',
            value: [
                { n: '全部', v: '1' },
                { n: '国产自拍', v: '11' },
                { n: '吃瓜黑料', v: '12' },
                { n: '探花现场', v: '13' },
                { n: '乱伦系列', v: '14' },
                { n: '国产av', v: '15' },
                { n: '福利姬', v: '16' },
                { n: '自慰诱惑', v: '17' },
                { n: '成人主播', v: '18' },
            ],
        },
        { key: 'by', name: '排序', value: SORT_VALUES },
    ],
    2: [
        {
            key: 'sub_id',
            name: '子分类',
            value: [
                { n: '全部', v: '2' },
                { n: '无码中字', v: '19' },
                { n: 'JAV自拍', v: '20' },
                { n: '中文字幕', v: '21' },
                { n: 'jav无码', v: '22' },
                { n: 'AV解说', v: '23' },
            ],
        },
        { key: 'by', name: '排序', value: SORT_VALUES },
    ],
    3: [
        {
            key: 'sub_id',
            name: '子分类',
            value: [
                { n: '全部', v: '3' },
                { n: '欧美大片', v: '24' },
                { n: '黑人专区', v: '25' },
                { n: '留学生', v: '26' },
            ],
        },
        { key: 'by', name: '排序', value: SORT_VALUES },
    ],
    4: [
        {
            key: 'sub_id',
            name: '子分类',
            value: [
                { n: '全部', v: '4' },
                { n: '港台三级', v: '27' },
                { n: '日韩三级', v: '28' },
                { n: '欧美三级', v: '29' },
            ],
        },
        { key: 'by', name: '排序', value: SORT_VALUES },
    ],
    5: [
        {
            key: 'sub_id',
            name: '子分类',
            value: [
                { n: '全部', v: '5' },
                { n: '3D动漫', v: '30' },
                { n: '次元动漫', v: '31' },
            ],
        },
        { key: 'by', name: '排序', value: SORT_VALUES },
    ],
    6: [
        {
            key: 'sub_id',
            name: '子分类',
            value: [
                { n: '全部', v: '6' },
                { n: '男同GAY', v: '32' },
                { n: '女同百合', v: '33' },
                { n: '伪娘', v: '34' },
                { n: 'SM重口', v: '35' },
                { n: '东南亚', v: '45' },
            ],
        },
        { key: 'by', name: '排序', value: SORT_VALUES },
    ],
    9: [
        {
            key: 'sub_id',
            name: '子分类',
            value: [
                { n: '全部', v: '9' },
                { n: 'AI短剧', v: '36' },
                { n: '明星脸', v: '37' },
                { n: '成人漫剧', v: '46' },
            ],
        },
        { key: 'by', name: '排序', value: SORT_VALUES },
    ],
};

let host = DEFAULT_HOST;

function hdr() {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Connection: 'keep-alive',
        Referer: `${host}/`,
    };
}

function unescapeHtml(s) {
    return String(s || '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&amp;/g, '&');
}

function stripTags(s) {
    return unescapeHtml(String(s || '').replace(/<[^>]+>/g, '')).trim();
}

function absUrl(u) {
    if (!u) return '';
    u = String(u).trim();
    if (u.startsWith('//')) return `https:${u}`;
    if (/^https?:\/\//i.test(u)) return u;
    return host.replace(/\/+$/, '') + (u.startsWith('/') ? u : `/${u}`);
}

function parseExt(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(String(raw));
    } catch {
        return {};
    }
}

async function fetchHtml(url) {
    try {
        const resp = await req.get(url, {
            headers: hdr(),
            timeout: 10000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        const buf = Buffer.from(resp.data || []);
        for (const enc of ['utf8', 'gbk', 'gb2312', 'latin1']) {
            try {
                const text = buf.toString(enc);
                if (text) return text;
            } catch {
                /* next */
            }
        }
        return buf.toString('utf8');
    } catch {
        return '';
    }
}

function card(vodId, name, pic, remarks) {
    return {
        vod_id: vodId,
        vod_name: name,
        vod_pic: pic,
        vod_remarks: remarks,
        vod_actor: '🦋 TG群: @tvshare23',
        vod_director: `🦋 ${BRAND}`,
        style: { type: 'rect', ratio: 1.78 },
    };
}

function parseVodList(htmlData) {
    const cards = [];
    if (!htmlData) return cards;
    let itemBlocks = [...htmlData.matchAll(/<li[^>]*>(.*?)<\/li>/gi)].map((m) => m[1]);
    if (!itemBlocks.length) {
        itemBlocks = [...htmlData.matchAll(
            /<div[^>]*class=["'][^"']*(?:vodlist_item|video-item|box-item|item)[^"']*["'][^>]*>(.*?)<\/div>\s*<\/div>/gi,
        )].map((m) => m[1]);
    }
    const seen = new Set();
    for (const block of itemBlocks) {
        const vLink = block.match(/href=["'](\/v\/[^"']+)["']/i);
        if (!vLink) continue;
        const href = vLink[1].trim();
        if (seen.has(href)) continue;

        let title = '';
        const tMatch = block.match(
            /<(?:a|div|span|h\d)[^>]*class=["'][^"']*(?:vodlist_title|title|name)[^"']*["'][^>]*>(.*?)<\/(?:a|div|span|h\d)>/is,
        );
        if (tMatch) title = stripTags(tMatch[1]);
        if (!title) {
            for (const t of [...block.matchAll(/title=["']([^"']+)["']/gi)].map((m) => m[1].trim())) {
                if (t.length > title.length && !SKIP_TITLES.has(t)) title = t;
            }
        }
        if (!title) {
            for (const at of [...block.matchAll(/<a[^>]+href=["']\/v\/[^"']+["'][^>]*>(.*?)<\/a>/gis)].map((m) => stripTags(m[1]))) {
                if (at.length > title.length) title = at;
            }
        }
        if (!title) continue;
        title = unescapeHtml(title);

        let pic = '';
        const picMatch = block.match(/(?:data-original|data-src|src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
        if (picMatch) pic = absUrl(picMatch[1]);

        const remMatch = block.match(
            /<span[^>]*class=["'][^"']*(?:pic-text|duration|remarks|tag)[^"']*["'][^>]*>(.*?)<\/span>/is,
        );
        const remarksRaw = remMatch ? stripTags(remMatch[1]) : '';
        seen.add(href);
        cards.push(card(href, title, pic, remarksRaw ? `${BRAND} | ${remarksRaw}` : BRAND));
    }

    if (!cards.length) {
        const matches = htmlData.matchAll(/<a[^>]+href=["'](\/v\/[^"']+)["'][^>]*title=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis);
        for (const m of matches) {
            const href = m[1].trim();
            if (seen.has(href)) continue;
            const tClean = unescapeHtml(m[2].trim());
            if (!tClean || tClean.length <= 4) continue;
            let pic = '';
            const pM = m[3].match(/(?:data-original|data-src|src)=["']([^"']+)["']/i);
            if (pM) pic = absUrl(pM[1]);
            seen.add(href);
            cards.push(card(href, tClean, pic, BRAND));
        }
    }
    return cards;
}

async function init(inReq) {
    host = DEFAULT_HOST;
    const ext = String(inReq?.body?.extend || '').trim();
    if (ext.startsWith('http')) host = ext.replace(/\/+$/, '');
    else if (ext.startsWith('{')) {
        try {
            const cfg = JSON.parse(ext);
            if (cfg.host) host = String(cfg.host).replace(/\/+$/, '');
        } catch {
            /* keep */
        }
    }
    return {};
}

async function home() {
    return { class: CLASSES, filters: FILTERS, list: [] };
}

async function category(inReq) {
    const pg = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    const tid = String(inReq.body.id || inReq.body.tid || '1');
    const ext = parseExt(inReq.body.filters || inReq.body.filter || inReq.body.extend);
    const actualTid = ext.sub_id || tid;
    const sortBy = ext.by || 'time';
    let reqUrl;
    if (sortBy === 'time') {
        reqUrl = pg <= 1 ? `${host}/t/${actualTid}/` : `${host}/show/${actualTid}/page/${pg}/`;
    } else {
        reqUrl = pg <= 1
            ? `${host}/show/${actualTid}/by/${sortBy}/`
            : `${host}/show/${actualTid}/by/${sortBy}/page/${pg}/`;
    }
    const cards = parseVodList(await fetchHtml(reqUrl));
    return {
        list: cards,
        page: pg,
        pagecount: cards.length >= 15 ? pg + 1 : pg,
        limit: cards.length,
        total: 9999,
    };
}

function pickMedia(htmlData, re) {
    const ms = [...htmlData.matchAll(re)].map((m) => m[1]);
    for (const u of ms) {
        if (!/sample|test/i.test(u)) return u;
    }
    return '';
}

async function detail(inReq) {
    let vodId = inReq.body.id;
    if (Array.isArray(vodId)) vodId = vodId[0];
    vodId = String(vodId || '');
    const detailUrl = absUrl(vodId);
    const htmlData = await fetchHtml(detailUrl);

    let title = '';
    const tM = htmlData.match(/<h1[^>]*>(.*?)<\/h1>/is);
    if (tM) title = stripTags(tM[1]);

    let pic = '';
    const pM = htmlData.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (pM) pic = pM[1].trim();
    else {
        const pM2 = htmlData.match(/<img[^>]+(?:data-original|data-src|src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
        if (pM2) pic = pM2[1].trim();
    }
    pic = absUrl(pic);

    let playUrl = pickMedia(htmlData, /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi);
    if (!playUrl) playUrl = pickMedia(htmlData, /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/gi);
    if (!playUrl) {
        const art = htmlData.match(/url\s*:\s*["']([^"']+)["']/i);
        if (art && !/sample|test/i.test(art[1])) playUrl = art[1].trim();
    }
    if (!playUrl && pic) {
        const inferred = pic.replace(/poster\d*\.(?:webp|jpg|png)/i, 'index.m3u8');
        if (inferred !== pic) playUrl = inferred;
    }

    return {
        list: [{
            vod_id: vodId,
            vod_name: title || BRAND,
            vod_pic: pic,
            type_name: '蝴蝶精选',
            vod_year: '',
            vod_area: '',
            vod_remarks: BRAND,
            vod_actor: '🦋 TG群: @tvshare23',
            vod_director: BRAND,
            vod_content: '🦋 官方交流群: @tvshare23 | 请勿相信视频内任何广告！',
            vod_play_from: '蝴蝶专线',
            vod_play_url: `正片$${playUrl || detailUrl}`,
        }],
    };
}

async function play(inReq) {
    let id = String(inReq.body.id || '').trim();
    if (id.includes('$')) id = id.split('$').pop().trim();
    return {
        parse: 0,
        url: id,
        header: { 'User-Agent': UA, Referer: `${host}/` },
    };
}

async function search(inReq) {
    const pg = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    const key = encodeURIComponent(String(inReq.body.wd || inReq.body.key || ''));
    const url = pg <= 1 ? `${host}/s/wd/${key}/` : `${host}/s/wd/${key}/page/${pg}/`;
    const cards = parseVodList(await fetchHtml(url));
    return {
        list: cards,
        page: pg,
        pagecount: cards.length >= 15 ? pg + 1 : pg,
        limit: cards.length,
        total: 9999,
    };
}

export default {
    meta: {
        key: 'hudie18',
        name: '💋18Jtv',
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
