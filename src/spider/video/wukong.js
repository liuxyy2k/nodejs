import axios from 'axios';
import https from 'https';

/**
 * 悟空视频 - https://a4j665s.bingyu4.sbs
 * 视频 / 小说 / 图片 三类
 */

const site = 'https://a4j665s.bingyu4.sbs';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const VIDEO_CATS = [
    { type_id: 'shipin/1', type_name: '国产' },
    { type_id: 'shipin/6', type_name: '自拍' },
    { type_id: 'shipin/7', type_name: '乱伦' },
    { type_id: 'shipin/8', type_name: '强奸' },
    { type_id: 'shipin/9', type_name: '传媒' },
    { type_id: 'shipin/10', type_name: '反差婊' },
    { type_id: 'shipin/11', type_name: '网爆门' },
    { type_id: 'shipin/12', type_name: '偷拍' },
    { type_id: 'shipin/30', type_name: '兄弟姐妹' },
    { type_id: 'shipin/31', type_name: '禁忌母子' },
    { type_id: 'shipin/32', type_name: '狂操小姨' },
    { type_id: 'shipin/33', type_name: '猛干嫂子' },
    { type_id: 'shipin/34', type_name: '野外车震' },
    { type_id: 'shipin/35', type_name: '夫妻交换' },
    { type_id: 'shipin/36', type_name: '淫荡儿媳' },
    { type_id: 'shipin/37', type_name: '学生下海' },
    { type_id: 'shipin/2', type_name: '网红' },
    { type_id: 'shipin/3', type_name: '萝莉' },
    { type_id: 'shipin/13', type_name: '福利姬' },
    { type_id: 'shipin/14', type_name: '吃瓜' },
    { type_id: 'shipin/15', type_name: '大学生' },
    { type_id: 'shipin/16', type_name: '人兽' },
    { type_id: 'shipin/5', type_name: '探花' },
    { type_id: 'shipin/4', type_name: '大秀' },
    { type_id: 'shipin/38', type_name: '瑜伽裤' },
    { type_id: 'shipin/39', type_name: '兽耳系列' },
    { type_id: 'shipin/40', type_name: '多人群P' },
    { type_id: 'shipin/41', type_name: 'Cosplay' },
    { type_id: 'shipin/17', type_name: '人妖' },
    { type_id: 'shipin/18', type_name: 'OnlyFans' },
    { type_id: 'shipin/20', type_name: '喷水' },
    { type_id: 'shipin/21', type_name: '裸贷' },
    { type_id: 'shipin/22', type_name: '性虐' },
    { type_id: 'shipin/23', type_name: 'AI换脸' },
    { type_id: 'shipin/24', type_name: '无码' },
    { type_id: 'shipin/25', type_name: '中字' },
    { type_id: 'shipin/26', type_name: '欧美' },
    { type_id: 'shipin/27', type_name: '动漫' },
    { type_id: 'shipin/28', type_name: '三级片' },
    { type_id: 'shipin/29', type_name: 'AV解说' },
];

const NOVEL_CATS = [
    { type_id: 'wenzhang/42', type_name: '都市小说' },
    { type_id: 'wenzhang/43', type_name: '乱伦小说' },
    { type_id: 'wenzhang/44', type_name: '学生小说' },
    { type_id: 'wenzhang/45', type_name: '仙侠小说' },
];

const IMAGE_CATS = [
    { type_id: 'wenzhang/46', type_name: '自拍图片' },
    { type_id: 'wenzhang/47', type_name: '亚洲色图' },
    { type_id: 'wenzhang/48', type_name: '欧美色图' },
    { type_id: 'wenzhang/49', type_name: '卡通色图' },
];

const NOVEL_IDS = new Set(NOVEL_CATS.map((c) => c.type_id));
const IMAGE_IDS = new Set(IMAGE_CATS.map((c) => c.type_id));
const VIDEO_IDS = new Set(VIDEO_CATS.map((c) => c.type_id));

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: `${site}/`,
};

const http = axios.create({
    timeout: 20_000,
    httpsAgent,
    headers,
    validateStatus: () => true,
});

function fixSlash(u) {
    return String(u || '').replace(/\\\//g, '/');
}

function isVideoFormat(url) {
    if (!url) return false;
    return /\.m3u8|\.mp4|\.ts/i.test(url);
}

function imgUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return url.startsWith('/') ? site + url : `${site}/${url}`;
}

function absUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    return url.startsWith('/') ? site + url : `${site}/${url}`;
}

async function fetchText(url, timeout = 20_000, extraHeaders = {}) {
    try {
        let u = url;
        if (!u.startsWith('http')) u = site + (u.startsWith('/') ? u : `/${u}`);
        const resp = await http.get(u, {
            timeout,
            responseType: 'text',
            headers: { ...headers, ...extraHeaders },
        });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function buildCatUrl(tid, page) {
    return page === 1 ? `/${tid}.html` : `/${tid}-${page}.html`;
}

function parseVideoList(text) {
    const items = [];
    const cards = [...text.matchAll(/<div class="card">([\s\S]*?)<\/div>\s*<\/div>/g)].map((m) => m[1]);
    for (const card of cards) {
        const m = card.match(
            /<a class="pic" href="([^"]+)" title="([^"]*)"[^>]*style="background-image:url\(([^)]+)\)"/,
        );
        if (!m) continue;
        const [, href, title, pic] = m;
        const m2 = card.match(/<a class="title"[^>]*>([^<]+)<\/a>/);
        const title2 = m2 ? m2[1].trim() : title;
        const m3 = card.match(/<div class="sub">([^<]+)<\/div>/);
        const sub = m3 ? m3[1].trim() : '';
        const mm = href.match(/\/shipinnr\/(\d+)\.html/);
        if (!mm) continue;
        items.push({
            vod_id: `video#${mm[1]}`,
            vod_name: (title || '').trim() || title2,
            vod_pic: imgUrl(pic.trim()),
            vod_remarks: sub,
        });
    }
    return items;
}

function parseTextList(text, tid) {
    const items = [];
    const prefix = NOVEL_IDS.has(tid) ? 'novel' : 'image';
    const lis = [
        ...text.matchAll(
            /<li>\s*<a href="([^"]+)" title="([^"]*)">\s*<span class="art-title">([^<]+)<\/span>\s*<span class="art-time">([^<]+)<\/span>\s*<\/a>\s*<\/li>/g,
        ),
    ];
    for (const [, href, title, title2, date] of lis) {
        const mm = href.match(/\/wenzhangs-(\d+)\.html/);
        if (!mm) continue;
        items.push({
            vod_id: `${prefix}#${mm[1]}`,
            vod_name: (title || '').trim() || title2.trim(),
            vod_pic: '',
            vod_remarks: date.trim(),
        });
    }
    return items;
}

function stripTags(s) {
    return String(s || '')
        .replace(/<[^>]+>/g, '')
        .trim();
}

async function deepExtractVideo(html, baseReferer = '') {
    if (!html) return '';

    let m = html.match(/(https?:\/\/[^\s"<>']+?\.(?:m3u8|mp4)[^\s"<>']*)/i);
    if (m) return fixSlash(m[1]);

    m = html.match(/var\s+player_data\s*=\s*(\{[\s\S]*?\});/);
    if (m) {
        try {
            const data = JSON.parse(fixSlash(m[1]));
            for (const key of ['url', 'url_next', 'link', 'video']) {
                const u = data[key] || '';
                if (u && (/\.m3u8|\.mp4/.test(u))) return fixSlash(u);
            }
        } catch {
            /* ignore */
        }
    }

    for (const p of [
        /(?:url|src|video|play|source|m3u8|mp4)\s*=\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)/i,
        /var\s+(?:vid|v_url|vsrc|movie|stream)\s*=\s*["']([^"']+\.(?:m3u8|mp4))/i,
    ]) {
        m = html.match(p);
        if (m) return fixSlash(m[1]);
    }

    m = html.match(/<(?:video|source)[^>]+src=["']([^"']+\.(?:m3u8|mp4)[^"']*)/i);
    if (m) return fixSlash(m[1]);

    m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (m) {
        let iframeUrl = fixSlash(m[1]);
        if (!iframeUrl.startsWith('http')) {
            if (iframeUrl.startsWith('//')) iframeUrl = `https:${iframeUrl}`;
            else if (iframeUrl.startsWith('/')) iframeUrl = site + iframeUrl;
        }
        try {
            const resp = await http.get(iframeUrl, {
                headers,
                timeout: 10_000,
                responseType: 'text',
            });
            if (resp.status === 200) {
                const text = typeof resp.data === 'string' ? resp.data : '';
                const nested = await deepExtractVideo(text, iframeUrl);
                if (nested) return nested;
            }
        } catch {
            /* ignore */
        }
    }

    m = html.match(/data-(?:src|url|video)=["']([^"']+\.(?:m3u8|mp4)[^"']*)/i);
    if (m) return fixSlash(m[1]);

    m = html.match(
        /<meta[^>]+(?:property|name)=["'](?:og:video|twitter:player)[^>]+content=["']([^"']+\.(?:m3u8|mp4))/i,
    );
    if (m) return fixSlash(m[1]);

    m = html.match(/(?:window\.location\.href|document\.write)\s*=\s*["']([^"']+\.(?:m3u8|mp4))/i);
    if (m) return fixSlash(m[1]);

    m = html.match(/(?:eval|atob)\s*\(\s*["']([^"']+)["']/i);
    if (m) {
        try {
            const decoded = Buffer.from(m[1], 'base64').toString('utf-8');
            const sub = await deepExtractVideo(decoded, baseReferer);
            if (sub) return fixSlash(sub);
        } catch {
            /* ignore */
        }
    }

    m = html.match(/<!--[\s\S]*?(https?:\/\/[^\s]+?\.(?:m3u8|mp4))[\s\S]*?-->/);
    if (m) return fixSlash(m[1]);

    m = html.match(/JSON\.parse\(['"](\{[\s\S]*?\})['"]/);
    if (m) {
        try {
            const data = JSON.parse(fixSlash(m[1]));
            for (const k of Object.keys(data)) {
                if (typeof data[k] === 'string' && (/\.m3u8|\.mp4/.test(data[k]))) {
                    return fixSlash(data[k]);
                }
            }
        } catch {
            /* ignore */
        }
    }

    const allUrls = [...html.matchAll(/["']([^"']+\.(?:m3u8|mp4)[^"']*)/g)].map((x) => fixSlash(x[1]));
    for (const u of allUrls) {
        if (u.includes('http')) return u;
    }

    if (baseReferer) {
        m = html.match(/["']([^"']+\.(?:m3u8|mp4))/);
        if (m) {
            const path = fixSlash(m[1]);
            return `${baseReferer.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
        }
    }
    return '';
}

async function videoDetail(vid) {
    const text = await fetchText(`/shipinnr/${vid}.html`);
    if (!text) return { list: [] };

    let title = '';
    let m = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (m) title = stripTags(m[1]);
    if (!title) {
        m = text.match(/<title>([^<]+)<\/title>/);
        if (m) title = m[1].trim();
    }

    let cover = '';
    m = text.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
    if (m) cover = m[1];
    if (!cover) {
        m = text.match(/<div class="post"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/);
        if (m) cover = m[1];
    }

    const playLinks = [...text.matchAll(/<a[^>]*href="(\/shipinlay\/\d+-\d+-\d+\.html)"[^>]*>([^<]+)<\/a>/g)];
    const urls = [];
    let vodPlayFrom = '悟空视频';

    if (playLinks.length) {
        const seen = new Set();
        for (const [, link, name] of playLinks) {
            if (seen.has(link)) continue;
            seen.add(link);
            const cleanName = stripTags(name) || `线路${seen.size}`;
            urls.push(`${cleanName}$${site}${link}`);
        }
        vodPlayFrom = '悟空视频多线';
    } else {
        let m3u8 = '';
        m = text.match(/var\s+player_data\s*=\s*(\{[\s\S]*?\});/);
        if (m) {
            try {
                m3u8 = JSON.parse(m[1])?.url || '';
            } catch {
                /* ignore */
            }
        }
        if (!m3u8) {
            m = text.match(/(https?:\/\/[^\s"<>']+?\.(?:m3u8|mp4))/);
            if (m) m3u8 = m[1];
        }
        if (!m3u8) {
            m = text.match(/var\s+(?:url|src|video|play|source)\s*=\s*["']([^"']+)/i);
            if (m && (/\.m3u8|\.mp4/.test(m[1]))) m3u8 = m[1];
        }
        if (!m3u8) {
            m = text.match(/<(?:video|source)[^>]*src="([^"]+)"/);
            if (m) m3u8 = m[1];
        }
        if (!m3u8) {
            m = text.match(/data-(?:src|url|video)="([^"]+)"/);
            if (m) m3u8 = m[1];
        }
        if (m3u8) {
            urls.push(`正片$${fixSlash(m3u8)}`);
        } else {
            urls.push(`正片$${site}/shipinnr/${vid}.html`);
        }
    }

    return {
        list: [
            {
                vod_id: `video#${vid}`,
                vod_name: title,
                vod_pic: imgUrl(cover),
                vod_content: '',
                vod_remarks: '',
                vod_play_from: vodPlayFrom,
                vod_play_url: urls.join('#'),
            },
        ],
    };
}

async function novelDetail(vid) {
    const text = await fetchText(`/wenzhangs-${vid}.html`);
    if (!text) return { list: [] };

    let title = '';
    let m = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (m) title = stripTags(m[1]);
    if (!title) {
        m = text.match(/<title>([^<]+)<\/title>/);
        if (m) title = m[1].trim();
    }

    let content = '';
    for (const pattern of [
        /<div class="content[^"]*">([\s\S]*?)<\/div>/,
        /<div class="article[^"]*">([\s\S]*?)<\/div>/,
        /<article[^>]*>([\s\S]*?)<\/article>/,
        /<div class="txt[^"]*">([\s\S]*?)<\/div>/,
        /<div class="novel[^"]*">([\s\S]*?)<\/div>/,
        /<div class="detail[^"]*">([\s\S]*?)<\/div>/,
        /<div[^>]*class="[^"]*(?:text|body|main)[^"]*"[^>]*>([\s\S]*?)<\/div>/,
    ]) {
        m = text.match(pattern);
        if (!m) continue;
        content = stripTags(m[1])
            .replace(/&nbsp;/g, ' ')
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();
        if (content.length > 100) break;
    }
    if (content.length > 8000) content = `${content.slice(0, 8000)}...`;

    const novelJson = JSON.stringify({ title, content });
    return {
        list: [
            {
                vod_id: `novel#${vid}`,
                vod_name: title,
                vod_pic: '',
                vod_content: content ? content.slice(0, 300) : '',
                vod_remarks: '',
                vod_play_from: '小说',
                vod_play_url: `阅读$novel://${novelJson}`,
                vod_tag: 'text',
            },
        ],
    };
}

async function imageDetail(vid) {
    const text = await fetchText(`/wenzhangs-${vid}.html`);
    if (!text) return { list: [] };

    let title = '';
    let m = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (m) title = stripTags(m[1]);
    if (!title) {
        m = text.match(/<title>([^<]+)<\/title>/);
        if (m) title = m[1].trim();
    }

    const imgs = [...text.matchAll(/<img[^>]*src="([^"]+)"[^>]*>/g)].map((x) => x[1].trim());
    const bigImgs = [];
    const seen = new Set();
    for (const img of imgs) {
        if (!img || seen.has(img)) continue;
        seen.add(img);
        const low = img.toLowerCase();
        if (['logo', 'icon', 'avatar', 'emoji', 'advert', 'ad.', 'banner', 'button'].some((x) => low.includes(x))) {
            continue;
        }
        bigImgs.push(imgUrl(img));
    }
    if (!bigImgs.length) return { list: [] };

    return {
        list: [
            {
                vod_id: `image#${vid}`,
                vod_name: title,
                vod_pic: bigImgs[0],
                vod_content: `共 ${bigImgs.length} 张图片`,
                vod_remarks: `${bigImgs.length}P`,
                vod_play_from: '图片',
                vod_play_url: `查看$pics://${bigImgs.join('&&')}`,
                vod_tag: 'image',
            },
        ],
    };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    // 全部视频分类 + 小说 + 图片（比原版前 12 个更完整）
    const classes = [...VIDEO_CATS, ...NOVEL_CATS, ...IMAGE_CATS];
    const text = await fetchText('/shipin/1.html');
    const list = text ? parseVideoList(text) : [];
    return { class: classes, filters: {}, list };
}

async function category(inReq, _outResp) {
    try {
        const tid = String(inReq.body.id || '');
        const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
        const text = await fetchText(buildCatUrl(tid, page));
        const items = VIDEO_IDS.has(tid) ? parseVideoList(text) : parseTextList(text, tid);

        let pagecount = page + 1;
        const m = text.match(/共\d+条，\d+\/(\d+)页/);
        if (m) pagecount = parseInt(m[1], 10);

        return {
            list: items,
            page,
            pagecount,
            limit: items.length,
            total: page * items.length + 1,
        };
    } catch {
        return { list: [], page: 1, pagecount: 1, limit: 0, total: 0 };
    }
}

async function detail(inReq, _outResp) {
    try {
        const vid = String(inReq.body.id || '');
        const [prefix, num] = vid.split('#', 2);
        if (prefix === 'video') return await videoDetail(num);
        if (prefix === 'novel') return await novelDetail(num);
        if (prefix === 'image') return await imageDetail(num);
        return { list: [] };
    } catch {
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    try {
        const id = fixSlash(String(inReq.body.id || ''));
        if (id.startsWith('novel://')) {
            return { parse: 0, url: id, header: {} };
        }
        if (id.startsWith('pics://')) {
            return { parse: 0, url: id, header: { ...headers } };
        }

        if (id.startsWith('http') && id.includes('/shipinlay/')) {
            const vidMatch = id.match(/\/shipinlay\/(\d+)-\d+-\d+\.html/);
            const referer = vidMatch ? `${site}/shipinnr/${vidMatch[1]}.html` : `${site}/`;
            const reqHeaders = { ...headers, Referer: referer };

            try {
                const resp = await http.get(id, {
                    headers: reqHeaders,
                    timeout: 15_000,
                    maxRedirects: 0,
                    responseType: 'text',
                    validateStatus: () => true,
                });
                if ([301, 302, 303, 307, 308].includes(resp.status)) {
                    const loc = fixSlash(resp.headers.location || '');
                    if (loc && isVideoFormat(loc)) {
                        return {
                            parse: 0,
                            url: absUrl(loc),
                            header: { Referer: referer, 'User-Agent': UA },
                        };
                    }
                }

                let text = '';
                if (resp.status === 200) {
                    text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
                } else {
                    text = await fetchText(id, 15_000, { Referer: referer });
                }

                const videoUrl = await deepExtractVideo(text, id);
                if (isVideoFormat(videoUrl)) {
                    return {
                        parse: 0,
                        url: fixSlash(videoUrl),
                        header: { Referer: referer, 'User-Agent': UA },
                    };
                }
            } catch {
                /* fallthrough */
            }

            return {
                parse: 1,
                url: id,
                header: { Referer: referer, 'User-Agent': UA },
            };
        }

        if (id.startsWith('http')) {
            return {
                parse: 0,
                url: id,
                header: { Referer: `${site}/`, 'User-Agent': UA },
            };
        }

        return {
            parse: 0,
            url: id,
            header: { Referer: `${site}/`, 'User-Agent': UA },
        };
    } catch {
        return { parse: 0, url: '', header: {} };
    }
}

async function search(inReq, _outResp) {
    try {
        const key = inReq.body.wd || '';
        const page = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
        let url = `/vodsearch/-------------.html?wd=${encodeURIComponent(key)}`;
        if (page > 1) url = `/vodsearch/${encodeURIComponent(key)}-${page}.html`;
        const text = await fetchText(url);
        const items = parseVideoList(text);
        return {
            list: items,
            page,
            pagecount: page + 1,
            limit: items.length,
            total: page * items.length + 1,
        };
    } catch {
        return { list: [], page: 1, pagecount: 1, limit: 0, total: 0 };
    }
}

export default {
    meta: {
        key: 'wukong',
        name: '🔥悟空',
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
