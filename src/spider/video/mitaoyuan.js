import axios from 'axios';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const HOST = 'http://cl2.xbl2.pro';
const IMG_KEY = Buffer.from('OzoTeoS7D>6Y^@z39JmD');

const HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: `${HOST}/`,
};

const CLASSES = [
    { type_id: '5', type_name: '国产精选' },
    { type_id: '3', type_name: '黑料吃瓜' },
    { type_id: '4', type_name: '厂牌原创' },
    { type_id: '6', type_name: '明星换脸' },
    { type_id: '7', type_name: 'AV解说' },
    { type_id: '8', type_name: '禁漫精选' },
    { type_id: '28', type_name: '国产大片' },
    { type_id: '87', type_name: '日韩大片' },
    { type_id: '31', type_name: '欧美大片' },
    { type_id: '32', type_name: '网红直播' },
    { type_id: '33', type_name: '探花约炮' },
    { type_id: '88', type_name: 'SM调教' },
    { type_id: '34', type_name: '三级伦理' },
    { type_id: '35', type_name: '萝莉开苞' },
    { type_id: '10', type_name: '父女' },
    { type_id: '11', type_name: '母子' },
    { type_id: '12', type_name: '兄妹' },
    { type_id: '13', type_name: '学生' },
    { type_id: '14', type_name: '嫂子' },
    { type_id: '15', type_name: '姐夫' },
    { type_id: '16', type_name: '师生' },
    { type_id: '17', type_name: '全家' },
    { type_id: '79', type_name: '真实缅北' },
    { type_id: '80', type_name: '恶心恐怖' },
    { type_id: '81', type_name: '黄金圣水' },
    { type_id: '82', type_name: '校园霸凌' },
    { type_id: '83', type_name: '战场实录' },
    { type_id: '84', type_name: '人兽乱交' },
    { type_id: '85', type_name: '灵异视频' },
    { type_id: '86', type_name: 'N号房' },
];

const http = axios.create({
    headers: HEADERS,
    timeout: 10000,
    validateStatus: () => true,
});

function fixUrl(url) {
    url = String(url || '').trim();
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    try {
        return new URL(url, `${HOST}/`).href;
    } catch {
        return url;
    }
}

function proxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/mitaoyuan/3';
    return `http://127.0.0.1:${PORT}${prefix}/img`;
}

function proxyPic(url, inReq) {
    return url ? `${proxyBase(inReq)}?url=${encodeURIComponent(url)}` : '';
}

async function fetchDecoded(url) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await http.get(url, { responseType: 'text' });
            if (response.status !== 200) continue;
            const html = typeof response.data === 'string' ? response.data : String(response.data || '');
            const match = html.match(/var\s+str\s*=\s*'([^']+)'/);
            if (match?.[1]?.length > 1000) {
                try {
                    const first = Buffer.from(match[1], 'base64').toString('utf8');
                    return Buffer.from(first, 'base64').toString('utf8');
                } catch {
                    // Return the original document if its wrapper cannot be decoded.
                }
            }
            return html;
        } catch {
            // Retry once.
        }
    }
    return '';
}

function parseItems(html, inReq) {
    const videos = [];
    const pattern =
        /<li class="content-item"[^>]*>.*?<a[^>]*href="(\/index\.php\/vod\/detail\/id\/(\d+)\.html)"[^>]*title="([^"]*)"[^>]*>(.*?)<\/a>.*?<\/li>/gis;
    let match;
    while ((match = pattern.exec(html))) {
        const [, , vid, rawTitle, inner] = match;
        const images = [...inner.matchAll(/<img[^>]*src="([^"]*)"/gi)].map((item) => item[1]);
        const selected =
            images.find((image) => !image.includes('faiusr.com') && !image.toLowerCase().includes('.gif')) ||
            images.at(-1) ||
            '';
        videos.push({
            vod_id: vid,
            vod_name: rawTitle.trim(),
            vod_pic: proxyPic(fixUrl(selected), inReq),
            vod_remarks: '',
        });
    }
    return videos;
}

function parsePlayerData(html) {
    const match = String(html).match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*;?/);
    if (!match) return null;
    try {
        return JSON.parse(match[1]);
    } catch {
        return null;
    }
}

function decodePlayerUrl(player) {
    if (!player) return '';
    let url = String(player.url || '').replace(/\\\//g, '/');
    try {
        if (Number(player.encrypt) === 1) {
            url = decodeURIComponent(url);
        } else if (Number(player.encrypt) === 2) {
            url = decodeURIComponent(Buffer.from(url, 'base64').toString('utf8'));
        }
    } catch {
        // Keep the undecoded URL.
    }
    return fixUrl(url);
}

function isDirectMedia(url) {
    return /\.(?:m3u8|mp4|ts|flv)(?:$|[?#])/i.test(String(url || ''));
}

async function probeLine(playPage) {
    const html = await fetchDecoded(playPage);
    const url = decodePlayerUrl(parsePlayerData(html));
    if (!/^https?:\/\//i.test(url)) return false;
    try {
        const response = await http.get(url, {
            headers: { ...HEADERS, Range: 'bytes=0-1' },
            timeout: 4000,
            responseType: 'arraybuffer',
            maxContentLength: 1024 * 1024,
        });
        return response.status === 200 || response.status === 206;
    } catch {
        return false;
    }
}

async function init() {
    return {};
}

async function home() {
    return { class: CLASSES, filters: {} };
}

async function category(inReq) {
    const tid = String(inReq.body.id || '5');
    const page = Math.max(parseInt(inReq.body.page, 10) || 1, 1);
    const url =
        page === 1
            ? `${HOST}/index.php/vod/type/id/${tid}.html`
            : `${HOST}/index.php/vod/type/id/${tid}/page/${page}.html`;
    const html = await fetchDecoded(url);
    const list = html ? parseItems(html, inReq) : [];
    const pages = [...html.matchAll(/href="\/index\.php\/vod\/type\/id\/\d+\/page\/(\d+)\.html"/g)]
        .map((item) => parseInt(item[1], 10))
        .filter(Number.isFinite);
    const pagecount = pages.length ? Math.max(page, ...pages) : page;
    return { list, page, pagecount, limit: 20, total: pagecount * 20 };
}

async function detail(inReq) {
    let vodId = inReq.body.id;
    if (Array.isArray(vodId)) vodId = vodId[0];
    vodId = String(vodId || '').split('|$|')[0];
    if (!vodId) return { list: [] };

    const html = await fetchDecoded(`${HOST}/index.php/vod/detail/id/${vodId}.html`);
    if (!html) return { list: [] };

    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const title = (titleMatch?.[1] || '').split('-')[0].replace(/详情介绍$/, '').trim();
    const picMatch = html.match(/<img[^>]*src="(https?:\/\/aisearch\.cdn\.bcebos\.com\/[^"]*)"/i);
    const links =
        [...html.matchAll(/href="(\/index\.php\/vod\/play\/id\/\d+\/sid\/(\d+)\/nid\/(\d+)\.html)"[^>]*>([^<]*)<\/a>/gi)];
    const sources = new Map();

    for (const [, href, sidText, nid, name] of links) {
        const sid = parseInt(sidText, 10);
        if (!sources.has(sid)) sources.set(sid, []);
        sources.get(sid).push({
            name: name.trim() || `第${nid}集`,
            url: fixUrl(href),
        });
    }

    let sids = [...sources.keys()].sort((a, b) => a - b);
    if (sids.length > 1 && !(await probeLine(sources.get(sids[0])[0].url))) {
        sids = [...sids.slice(1), sids[0]];
    }
    const sourceNames = sids.map((sid) => `线路${sid}`);
    const sourceUrls = sids.map((sid) =>
        sources
            .get(sid)
            .map((episode) => `${episode.name.replace(/[#$]/g, ' ')}$${episode.url}`)
            .join('#'),
    );

    return {
        list: [
            {
                vod_id: vodId,
                vod_name: title,
                vod_pic: picMatch ? proxyPic(picMatch[1], inReq) : '',
                vod_remarks: '',
                vod_content: title,
                vod_play_from: sourceNames.length ? sourceNames.join('$$$') : '蜜桃源',
                vod_play_url: sourceUrls.join('$$$'),
            },
        ],
    };
}

async function search(inReq) {
    const page = Math.max(parseInt(inReq.body.page, 10) || 1, 1);
    const keyword = encodeURIComponent(String(inReq.body.wd || ''));
    const url =
        page === 1
            ? `${HOST}/index.php/vod/search.html?wd=${keyword}`
            : `${HOST}/index.php/vod/search/page/${page}.html?wd=${keyword}`;
    const html = await fetchDecoded(url);
    return { list: html ? parseItems(html, inReq) : [], page };
}

async function play(inReq) {
    let playUrl = fixUrl(inReq.body.id);
    if (isDirectMedia(playUrl)) return { parse: 0, url: playUrl, header: HEADERS };

    const html = await fetchDecoded(playUrl);
    if (!html) return { parse: 1, url: playUrl, header: HEADERS };

    const realUrl = decodePlayerUrl(parsePlayerData(html));
    if (realUrl && isDirectMedia(realUrl)) {
        return { parse: 0, url: realUrl, header: HEADERS };
    }
    const media = html.match(/https?:\/\/[^\s"'\\;]+\.(?:m3u8|mp4|ts|flv)(?:\?[^\s"'\\;]*)?/i);
    if (media) return { parse: 0, url: media[0], header: HEADERS };

    const iframe = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframe) playUrl = fixUrl(iframe[1]);
    return { parse: 1, url: playUrl, header: HEADERS };
}

async function imgProxy(inReq, reply) {
    try {
        const url = fixUrl(inReq.query.url);
        if (!/^https?:\/\//i.test(url)) return reply.code(400).send('');
        const response = await http.get(url, { responseType: 'text', timeout: 15000 });
        if (response.status !== 200) return reply.code(404).send('');
        const encoded = String(response.data || '').trim();
        const encrypted = Buffer.from(encoded, 'base64');
        const image = Buffer.allocUnsafe(encrypted.length);
        for (let i = 0; i < encrypted.length; i++) {
            image[i] = encrypted[i] ^ IMG_KEY[i % IMG_KEY.length];
        }
        let mime = 'image/jpeg';
        if (image.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) mime = 'image/png';
        else if (image.slice(0, 3).toString('ascii') === 'GIF') mime = 'image/gif';
        else if (image.slice(0, 4).toString('ascii') === 'RIFF') mime = 'image/webp';
        reply.header('Content-Type', mime).send(image);
    } catch {
        reply.code(404).send('');
    }
}

export default {
    meta: {
        key: 'mitaoyuan',
        name: '🔥蜜桃源',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img', imgProxy);
    },
};
