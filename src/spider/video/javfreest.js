import axios from 'axios';
import { load } from 'cheerio';
import https from 'https';

const host = 'https://javfree.stream';

const UA_LIST = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

const FALLBACK_CLASSES = [
    { type_id: 'censored', type_name: '有码' },
    { type_id: 'uncensored', type_name: '无码' },
    { type_id: 'reduce-mosaic', type_name: '减码' },
    { type_id: 'ppv-amateur', type_name: 'PPV/素人' },
    { type_id: 'popular', type_name: '热门' },
    { type_id: 'latest', type_name: '最新' },
];

const CARD_SELECTORS = [
    'article.post',
    'article.type-post',
    'article',
    '.video-item',
    '.module-item',
    '.post-item',
    '.item',
    '.video-card',
    '.movie-item',
    '.content-item',
    '.thumb',
    '.cover',
    '.col-md-3',
    '.col-lg-3',
    '.col-6',
    "[class*='video']",
    "[class*='post']",
];

const TITLE_SELECTORS = [
    'h2',
    'h3',
    'h4',
    'h1',
    '.title',
    '.entry-title',
    '.video-title',
    '.name',
    '.post-title',
];

const REMARK_SELECTORS = ['.duration', '.time', '.label', '.tag', '.quality', '.cat', '.meta'];

const AD_KEYWORDS = [
    '#EXT-X-DISCONTINUITY',
    '#EXT-X-CUE-OUT',
    '#EXT-X-CUE-IN',
    '#EXT-X-SPLICEPOINT',
    '#EXTINF:0',
    '#EXTINF:1,',
    '#EXTINF:2,',
    '#EXTINF:3,',
    '#EXTINF:4,',
    '#EXTINF:5,',
    'ad.ts',
    'ads.ts',
    'advertisement',
    'scte35',
    'splice',
    'break',
    'promo',
    'trailer',
    'pre-roll',
    'mid-roll',
    'post-roll',
    'bumper',
    'overlay',
];


function pickUA() {
    return UA_LIST[Math.floor(Math.random() * UA_LIST.length)];
}

function baseHeaders() {
    return {
        'User-Agent': pickUA(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        Referer: `${host}/`,
    };
}

const http = axios.create({
    timeout: 30000,
    validateStatus: () => true,
});

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/javfreest/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = inReq?.headers?.['x-forwarded-proto'] || 'http';
        return `${proto}://${hostHeader}${prefix}/proxy`;
    }
    const port = process.env.DEV_HTTP_PORT || 9988;
    return `http://127.0.0.1:${port}${prefix}/proxy`;
}

function proxyUrl(url, inReq) {
    if (!url || !url.startsWith('http')) return url || '';
    return `${getProxyBase(inReq)}?url=${encodeURIComponent(url)}`;
}

async function fetchHtml(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const r = await http.get(url, { headers: baseHeaders() });
            if (r.status === 200) {
                return typeof r.data === 'string' ? r.data : String(r.data || '');
            }
        } catch {
            if (i === retries - 1) return '';
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
    return '';
}

function cleanTitle(title) {
    if (!title) return '';
    return String(title)
        .replace(/<[^>]+>/g, '')
        .replace(/[\n\t\r]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

function extractId(href) {
    if (!href) return '';
    const patterns = [
        /\/video\/([A-Za-z0-9-]+)/,
        /\/watch\/([A-Za-z0-9-]+)/,
        /\/movie\/([A-Za-z0-9-]+)/,
        /\/play\/([A-Za-z0-9-]+)/,
        /\/([A-Z]+-[0-9]+)/,
        /\/([A-Za-z0-9-]+)\.html/,
    ];
    for (const p of patterns) {
        const m = href.match(p);
        if (m) return m[1];
    }
    try {
        const parts = new URL(href, host).pathname.split('/').filter(Boolean);
        if (parts.length) return parts[parts.length - 1].replace(/\.html$/i, '').replace(/\.php$/i, '');
    } catch {
        /* ignore */
    }
    return '';
}

function fixPic(picUrl, inReq) {
    if (!picUrl) return '';
    let pic = picUrl;
    if (pic.startsWith('//')) pic = `https:${pic}`;
    if (!pic.startsWith('http')) {
        try {
            pic = new URL(pic, `${host}/`).href;
        } catch {
            return '';
        }
    }
    return proxyUrl(pic, inReq);
}

function parseCardsRegex(html, inReq) {
    const videos = [];
    const seen = new Set();

    const patternA =
        /<a[^>]+href=["']([^"']+)["'][^>]*>(?:[^<]*<(?!\/a>))*?<img[^>]+src=["']([^"']*)["'][^>]*>(?:[^<]*<(?!\/a>))*?<(?:h[1-6]|[^>]+class=["'][^"']*(?:title|name)["'])[^>]*>([^<]+)</gis;
    for (const m of html.matchAll(patternA)) {
        const vid = extractId(m[1]);
        if (vid && !seen.has(vid)) {
            seen.add(vid);
            videos.push({
                vod_id: vid,
                vod_name: cleanTitle(m[3]) || vid,
                vod_pic: fixPic(m[2], inReq),
                vod_remarks: '',
            });
        }
    }
    if (videos.length) return videos;

    const patternB =
        /<a[^>]+href=["']([^"']+)["'][^>]*>.*?<img[^>]+src=["']([^"']*)["'][^>]*>.*?<\/a>/gis;
    for (const m of html.matchAll(patternB)) {
        const vid = extractId(m[1]);
        if (!vid || seen.has(vid)) continue;
        let title = '';
        const tm = new RegExp(
            `${m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>.*?<img[^>]+>.*?(?:title=["']([^"']+)["']|>([^<]+)<)`,
            'is',
        ).exec(html);
        if (tm) title = tm[1] || tm[2] || '';
        seen.add(vid);
        videos.push({
            vod_id: vid,
            vod_name: cleanTitle(title) || vid,
            vod_pic: fixPic(m[2], inReq),
            vod_remarks: '',
        });
    }
    if (videos.length) return videos;

    const patternC =
        /href=["']([^"']*(?:video|movie|watch|play|\/)[^"']*)["'][^>]*>.*?<img[^>]+src=["']([^"']*)["']/gis;
    for (const m of html.matchAll(patternC)) {
        const vid = extractId(m[1]);
        if (!vid || seen.has(vid)) continue;
        seen.add(vid);
        videos.push({
            vod_id: vid,
            vod_name: vid,
            vod_pic: fixPic(m[2], inReq),
            vod_remarks: '',
        });
    }
    return videos;
}

function parseCards(html, inReq) {
    const videos = [];
    if (!html) return videos;

    try {
        const $ = load(html);
        let cards = [];
        for (const sel of CARD_SELECTORS) {
            cards = $(sel).toArray();
            if (cards.length >= 3) break;
        }

        for (const el of cards) {
            try {
                const card = $(el);
                let a = card.find('a[href]').first();
                if (!a.length && card.is('a') && card.attr('href')) a = card;
                if (!a.length) continue;

                const href = a.attr('href') || '';
                const img = card.find('img').first();
                let pic = '';
                if (img.length) {
                    for (const attr of ['data-src', 'data-original', 'src', 'data-lazy-src', 'data-srcset']) {
                        pic = img.attr(attr) || '';
                        if (pic) {
                            if (attr === 'data-srcset') pic = pic.split(',')[0].split(' ')[0];
                            break;
                        }
                    }
                }

                let title = '';
                for (const sel of TITLE_SELECTORS) {
                    const t = card.find(sel).first();
                    if (t.length) {
                        title = cleanTitle(t.text());
                        if (title) break;
                    }
                }
                if (!title) title = cleanTitle(a.attr('title') || a.text());

                let remark = '';
                for (const sel of REMARK_SELECTORS) {
                    const r = card.find(sel).first();
                    if (r.length) {
                        remark = cleanTitle(r.text());
                        if (remark) break;
                    }
                }

                const vid = extractId(href);
                if (vid) {
                    videos.push({
                        vod_id: vid,
                        vod_name: title || vid,
                        vod_pic: fixPic(pic, inReq),
                        vod_remarks: remark,
                    });
                }
            } catch {
                /* skip card */
            }
        }
    } catch {
        /* cheerio failed */
    }

    const list = videos.length ? videos : parseCardsRegex(html, inReq);
    const seen = new Set();
    return list.filter((v) => {
        if (seen.has(v.vod_id)) return false;
        seen.add(v.vod_id);
        return true;
    });
}

function extractClassId(href) {
    const m = href.match(/\/(?:category|tag|type)\/([^/"'?]+)/);
    return m ? m[1] : '';
}

function fetchClasses(html) {
    const classes = [];
    if (!html) return classes;
    try {
        const $ = load(html);
        const nav = $('nav, .nav, .menu, .navbar, #menu, .main-nav, .primary-menu').first();
        const collect = (root) => {
            root.find('a[href]').each((_, el) => {
                const href = $(el).attr('href') || '';
                const text = cleanTitle($(el).text());
                if ((href.includes('/category/') || href.includes('/tag/') || href.includes('/type/')) && text && text.length < 20) {
                    const tid = extractClassId(href);
                    if (tid) classes.push({ type_id: tid, type_name: text });
                }
            });
        };
        if (nav.length) collect(nav);
        if (!classes.length) {
            for (const sel of ['.category-list a', '.tags a', '.genres a', '.tax-list a', '.nav-menu a']) {
                $(sel).each((_, el) => {
                    const href = $(el).attr('href') || '';
                    const text = cleanTitle($(el).text());
                    const tid = extractClassId(href);
                    if (tid && text && text.length < 20) classes.push({ type_id: tid, type_name: text });
                });
                if (classes.length) break;
            }
        }
    } catch {
        /* ignore */
    }

    if (!classes.length) {
        const re = /href=["']([^"']*\/(?:category|tag|type)\/([^"'/]+))["'][^>]*>([^<]+)<\/a>/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            const text = cleanTitle(m[3]);
            if (text && text.length < 20) classes.push({ type_id: m[2], type_name: text });
        }
    }

    const seen = new Set();
    return classes.filter((c) => {
        if (seen.has(c.type_id)) return false;
        seen.add(c.type_id);
        return true;
    });
}

function buildPageUrls(tid, pg) {
    return [
        `${host}/category/${tid}/`,
        ...(pg > 1 ? [`${host}/${tid}/page/${pg}/`, `${host}/${tid}/?page=${pg}`] : []),
        `${host}/category/${tid}/page/${pg}/`,
        `${host}/category/${tid}/?page=${pg}`,
        `${host}/category/${tid}/${pg}.html`,
        `${host}/?cat=${tid}&paged=${pg}`,
        `${host}/type/${tid}-${pg}.html`,
        `${host}/tag/${tid}/page/${pg}/`,
        `${host}/${tid}/page/${pg}/`,
        `${host}/${tid}/?page=${pg}`,
        `${host}/page/${pg}/?cat=${tid}`,
    ];
}

function buildSearchUrls(key, pg) {
    const q = encodeURIComponent(key);
    return [
        `${host}/search/${q}/page/${pg}/`,
        `${host}/?s=${q}&paged=${pg}`,
        `${host}/search/?q=${q}&page=${pg}`,
        `${host}/vodsearch/${q}-${pg}.html`,
        `${host}/page/${pg}/?s=${q}`,
    ];
}

function pagecountFromHtml(html, pg, listLen) {
    let pagecount = pg + 1;
    try {
        const $ = load(html);
        const pagination = $('.pagination, .page-nav, .wp-pagenavi, nav[aria-label], .nav-links').first();
        if (pagination.length) {
            pagination.find('a[href]').each((_, el) => {
                const href = $(el).attr('href') || '';
                const m = href.match(/\/(\d+)\/?$/);
                if (m) {
                    const num = parseInt(m[1], 10);
                    if (num > pagecount) pagecount = num;
                }
            });
        }
    } catch {
        /* ignore */
    }
    return { pagecount, total: pagecount * (listLen || 0) };
}

function decryptUrl(encrypted) {
    if (!encrypted) return '';
    try {
        const decoded = Buffer.from(encrypted, 'base64').toString('utf8');
        if (decoded.startsWith('http')) return decoded;
    } catch {
        /* ignore */
    }
    try {
        const decoded = decodeURIComponent(encrypted);
        if (decoded.startsWith('http')) return decoded;
    } catch {
        /* ignore */
    }
    return encrypted;
}

async function extractFromIframe(iframeUrl) {
    const html = await fetchHtml(iframeUrl);
    if (!html) return '';
    let m = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
    if (m) return m[1];
    m = html.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/);
    return m ? m[1] : '';
}

async function getM3u8FromPlayPage(vid) {
    const playUrls = [
        `${host}/video/${vid}/`,
        `${host}/watch/${vid}`,
        `${host}/movie/${vid}`,
        `${host}/play/${vid}.html`,
        `${host}/${vid}.html`,
        `${host}/?p=${vid}`,
    ];
    for (const purl of playUrls) {
        try {
            const html = await fetchHtml(purl);
            if (!html) continue;

            let m = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
            if (m) return m[1];
            m = html.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/);
            if (m) return m[1];
            m = html.match(/var\s+player_[a-zA-Z]+\s*=\s*["']([^"']+)["']/);
            if (m) {
                const u = decryptUrl(m[1]);
                if (u) return u;
            }

            const $ = load(html);
            const src = $('video source[src], video[src]').first();
            if (src.length) {
                const u = src.attr('src') || '';
                if (u) return u;
            }
            const iframe = $('iframe[src]').first();
            if (iframe.length) {
                const iframeSrc = iframe.attr('src') || '';
                if (iframeSrc.startsWith('http')) {
                    const u = await extractFromIframe(iframeSrc);
                    if (u) return u;
                }
            }

            m = html.match(/data-[a-z]+=["'](https?:\/\/[^"']+\.m3u8)["']/i);
            if (m) return m[1];
            m = html.match(/"(?:url|src|file|video)"\s*:\s*"([^"]+\.m3u8[^"]*)"/);
            if (m) return m[1].replace(/\\/g, '');
            m = html.match(/base64,([A-Za-z0-9+/=]+)/);
            if (m) {
                try {
                    const decoded = Buffer.from(m[1], 'base64').toString('utf8');
                    m = decoded.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
                    if (m) return m[1];
                } catch {
                    /* ignore */
                }
            }
            m = html.match(/["'](\/[^"']*\.m3u8[^"']*)["']/);
            if (m) return new URL(m[1], `${host}/`).href;
            m = html.match(/var\s+(?:url|src|video)\s*=\s*["']([^"']+)["']/);
            if (m) return m[1];
            m = html.match(/(https?:\/\/[^"'\s]+(?:stream|video|cdn)[^"'\s]*)/);
            if (m) return m[1];
        } catch {
            continue;
        }
    }
    return '';
}

function formatPlayUrl(url) {
    if (!url) return '';
    if (url.includes('$')) {
        const parts = url.split('$');
        return parts.length > 1 ? parts[parts.length - 1] : url;
    }
    return url;
}

function fixKeyUri(line, baseUrl) {
    return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        let fixed = uri;
        if (!fixed.startsWith('http')) {
            try {
                fixed = new URL(fixed, baseUrl).href;
            } catch {
                /* keep */
            }
        }
        return `URI="${fixed}"`;
    });
}

function cleanM3u8(text, baseUrl) {
    const lines = String(text || '').trim().split(/\r?\n/);
    const cleaned = [];
    let skip = false;
    for (const line of lines) {
        const lineStripped = line.trim();
        if (AD_KEYWORDS.some((kw) => lineStripped.includes(kw))) {
            skip = true;
            continue;
        }
        if (lineStripped.startsWith('#EXTINF:')) {
            const dm = lineStripped.match(/#EXTINF:([0-9.]+)/);
            if (dm) {
                const duration = parseFloat(dm[1]);
                if (duration < 3.0) {
                    skip = true;
                    continue;
                }
            }
            skip = false;
        }
        if (!lineStripped.startsWith('#') && lineStripped) {
            if (skip) {
                skip = false;
                continue;
            }
            let seg = lineStripped;
            if (!seg.startsWith('http')) {
                try {
                    seg = new URL(seg, baseUrl).href;
                } catch {
                    /* keep */
                }
            }
            cleaned.push(seg);
            continue;
        }
        if (lineStripped.includes('URI="') && !skip) {
            cleaned.push(fixKeyUri(lineStripped, baseUrl));
        } else if (!skip) {
            cleaned.push(line);
        }
    }
    return cleaned.join('\n');
}

function playHeader() {
    return { Referer: `${host}/`, 'User-Agent': pickUA() };
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(inReq, _outResp) {
    try {
        let html = await fetchHtml(host);
        if (!html || parseCards(html, inReq).length < 3) {
            for (const path of ['/latest', '/popular', '/new', '/hot']) {
                const h = await fetchHtml(host + path);
                if (h && parseCards(h, inReq).length >= 3) {
                    html = h;
                    break;
                }
            }
        }
        const classes = html ? fetchClasses(html) : [];
        const videos = html ? parseCards(html, inReq) : [];
        return {
            class: classes.length ? classes : FALLBACK_CLASSES,
            list: videos,
            filters: {},
        };
    } catch {
        return { class: FALLBACK_CLASSES, filters: {}, list: [] };
    }
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || 'popular');
    const pg = parseInt(inReq.body.page, 10) || 1;
    try {
        const urls = buildPageUrls(tid, pg);
        let html = '';
        for (const url of urls) {
            const h = await fetchHtml(url);
            if (h && parseCards(h, inReq).length > 0) {
                html = h;
                break;
            }
        }
        if (!html) {
            return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
        }
        const videos = parseCards(html, inReq);
        const { pagecount, total } = pagecountFromHtml(html, pg, videos.length);
        return {
            list: videos,
            page: pg,
            pagecount,
            limit: videos.length,
            total,
        };
    } catch {
        return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
    }
}

async function detail(inReq, _outResp) {
    try {
        const vid = String(inReq.body.id || '');
        const urls = [
            `${host}/video/${vid}/`,
            `${host}/watch/${vid}`,
            `${host}/movie/${vid}`,
            `${host}/${vid}.html`,
            `${host}/?p=${vid}`,
        ];
        let html = '';
        for (const url of urls) {
            html = await fetchHtml(url);
            if (html) break;
        }
        if (!html) return { list: [] };

        const $ = load(html);
        let title = vid;
        for (const sel of ['h1', '.video-title', '.entry-title', 'title', '.post-title']) {
            const t = $(sel).first();
            if (t.length) {
                title = cleanTitle(t.text());
                if (title) break;
            }
        }

        let pic = '';
        for (const sel of ['.video-poster img', '.cover img', '.thumb img', "meta[property='og:image']", '.featured-image img']) {
            const el = $(sel).first();
            if (!el.length) continue;
            if (sel.startsWith('meta')) {
                pic = el.attr('content') || '';
            } else {
                for (const attr of ['src', 'data-src', 'data-original']) {
                    pic = el.attr(attr) || '';
                    if (pic) break;
                }
            }
            if (pic) break;
        }

        let desc = '';
        for (const sel of ['.description', '.video-desc', '.entry-content', '.summary', "meta[name='description']", '.content']) {
            const el = $(sel).first();
            if (!el.length) continue;
            desc = sel.startsWith('meta') ? el.attr('content') || '' : cleanTitle(el.text());
            if (desc) break;
        }

        const actors = [];
        for (const sel of ['.actress a', '.cast a', '.star a', '.actor a', '.performers a', '.actresses a']) {
            $(sel).each((_, el) => {
                const name = cleanTitle($(el).text());
                if (name) actors.push(name);
            });
        }

        const tags = [];
        for (const sel of ['.tags a', '.tag a', '.genre a', '.categories a', '.post-tags a']) {
            $(sel).each((_, el) => {
                const name = cleanTitle($(el).text());
                if (name) tags.push(name);
            });
        }

        let playUrl = await getM3u8FromPlayPage(vid);
        if (!playUrl) {
            const m = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
            if (m) playUrl = m[1];
        }
        playUrl = formatPlayUrl(playUrl);

        return {
            list: [
                {
                    vod_id: vid,
                    vod_name: title,
                    vod_pic: fixPic(pic, inReq),
                    vod_content: desc,
                    vod_actor: actors.join(','),
                    vod_tag: tags.join(','),
                    type_name: tags.slice(0, 1).join(','),
                    vod_play_from: 'JavFree',
                    vod_play_url: playUrl ? `${title}$${playUrl}` : '',
                },
            ],
        };
    } catch {
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    try {
        let url = formatPlayUrl(String(inReq.body.id || ''));
        if (!url) return { parse: 1, url: inReq.body.id || '', header: {} };

        if (url.includes('.m3u8')) {
            return {
                parse: 0,
                url: proxyUrl(url, inReq),
                header: playHeader(),
            };
        }
        if (url.includes('.mp4')) {
            return {
                parse: 0,
                url: proxyUrl(url, inReq),
                header: playHeader(),
            };
        }
        return { parse: 0, url, header: playHeader() };
    } catch {
        return { parse: 0, url: inReq.body.id || '', header: {} };
    }
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || '');
    const pg = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    try {
        const urls = buildSearchUrls(key, pg);
        let html = '';
        for (const url of urls) {
            const h = await fetchHtml(url);
            if (h && parseCards(h, inReq).length > 0) {
                html = h;
                break;
            }
        }
        if (!html) return { list: [], page: pg };
        return { list: parseCards(html, inReq), page: pg };
    } catch {
        return { list: [], page: pg };
    }
}

async function proxyHandler(inReq, outResp) {
    let url = inReq.query.url || '';
    if (Array.isArray(url)) url = url[0] || '';
    url = decodeURIComponent(url || '');
    if (!url.startsWith('http')) return outResp.code(404).type('text/plain').send('');

    try {
        const isM3u8 = url.includes('.m3u8');
        const resp = await http.get(url, {
            headers: {
                ...baseHeaders(),
                Accept: isM3u8 ? '*/*' : 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            },
            responseType: isM3u8 ? 'text' : 'arraybuffer',
            timeout: 30000,
        });
        if (resp.status !== 200) return outResp.code(resp.status).send('');

        if (isM3u8) {
            const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            const cleaned = cleanM3u8(text, url);
            return outResp
                .code(200)
                .type('application/vnd.apple.mpegurl')
                .header('Cache-Control', 'no-cache')
                .send(cleaned);
        }

        const ct = resp.headers['content-type'] || 'application/octet-stream';
        return outResp.type(ct).send(Buffer.from(resp.data));
    } catch {
        return outResp.code(500).type('text/plain').send('proxy error');
    }
}

export default {
    meta: {
        key: 'javfreest',
        name: '🌸JavFreeStream',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy', proxyHandler);
    },
};
