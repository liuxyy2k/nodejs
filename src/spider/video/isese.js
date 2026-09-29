import axios from 'axios';
import https from 'https';

const SITE = 'https://830556.iseseav101.buzz';

const UA =
    'Mozilla/5.0 (Linux; Android 13; SM-S9080) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const SKIP_WORDS = [
    '首页',
    '登录',
    '注册',
    '会员',
    '充值',
    'APP',
    '下载',
    '搜索',
    '排行',
    '最新',
    '热门',
    '专题',
    '资讯',
    '留言',
    '求片',
    '全部',
];

const FALLBACK_CATS = [
    ['26', '国产乱伦'],
    ['27', '网曝黑料'],
    ['28', '自拍偷拍'],
    ['29', '国产传媒'],
    ['30', '国产精品'],
    ['31', '探花精品'],
    ['32', '网红主播'],
    ['33', 'AI换脸'],
    ['34', '同性恋'],
    ['35', '3D动漫'],
    ['36', '欧美精品'],
    ['37', '韩国主播'],
];


const http = axios.create({
    timeout: 12000,
    maxRedirects: 5,
    validateStatus: () => true,
});

let homeHtml = null;

function headers(referer = SITE) {
    return {
        'User-Agent': UA,
        Referer: referer,
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };
}

function unescapeHtml(s) {
    return String(s || '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function siteOrigin() {
    const m = SITE.match(/^(https?:\/\/[^/]+)/);
    return m ? m[1] : SITE;
}

function abs(u) {
    if (!u) return u;
    const s = u.trim();
    if (s.startsWith('//')) return `https:${s}`;
    if (s.startsWith('http')) return s;
    if (s.startsWith('/')) return `${siteOrigin()}${s}`;
    return `${SITE.replace(/\/$/, '')}/${s.replace(/^\/+/, '')}`;
}

async function fetchHtml(url, referer = SITE) {
    const full = abs(url);
    try {
        const r = await http.get(full, { headers: headers(referer) });
        if (r.status >= 400) return '';
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch {
        return '';
    }
}

function extractPlayer(html) {
    let start = html.indexOf('var player_aaaa=');
    if (start === -1) start = html.indexOf('var player_aaaa =');
    if (start === -1) return null;
    start = html.indexOf('{', start);
    if (start === -1) return null;

    let braceCount = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < html.length; i++) {
        const ch = html[i];
        if (escape) {
            escape = false;
            continue;
        }
        if (ch === '\\') {
            escape = true;
            continue;
        }
        if (ch === '"' && !inString) inString = true;
        else if (ch === '"' && inString) inString = false;
        else if (ch === '{' && !inString) braceCount++;
        else if (ch === '}' && !inString) {
            braceCount--;
            if (braceCount === 0) {
                try {
                    return JSON.parse(html.slice(start, i + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

function parseCats(html) {
    const out = [];
    const seen = new Set();
    const add = (href, name) => {
        name = unescapeHtml(name.trim());
        if (!name || seen.has(name) || SKIP_WORDS.some((w) => name.includes(w))) return;
        seen.add(name);
        out.push({ type_id: abs(href), type_name: name });
    };

    let m;
    const pat1 =
        /<a[^>]+href="(\/aise\/index\.php\/vod\/type\/id\/(\d+)\.html)"[^>]*>[\s\S]*?<span[^>]*class="name"[^>]*>([^<]+)<\/span>/g;
    while ((m = pat1.exec(html)) !== null) add(m[1], m[3]);

    if (!out.length) {
        const pat2 = /<a[^>]+href="(\/aise\/index\.php\/vod\/type\/id\/(\d+)\.html)"[^>]*>([^<]{1,12})<\/a>/g;
        while ((m = pat2.exec(html)) !== null) add(m[1], m[3]);
    }

    if (!out.length) {
        for (const [cid, cname] of FALLBACK_CATS) {
            if (!seen.has(cname)) {
                seen.add(cname);
                out.push({
                    type_id: `${SITE}/aise/index.php/vod/type/id/${cid}.html`,
                    type_name: cname,
                });
            }
        }
    }
    return out;
}

function extractItemsFromBlock(blockHtml, seen) {
    const out = [];
    const re = /<li[^>]*>([\s\S]{20,5000}?)<\/li>/g;
    let bm;
    while ((bm = re.exec(blockHtml)) !== null) {
        const block = bm[1];
        let hm = block.match(/href="(\/aise\/index\.php\/vod\/play\/id\/\d+\/sid\/\d+\/nid\/\d+\.html)"/);
        if (!hm) hm = block.match(/href="(\/aise\/index\.php\/vod\/play\/[^"]+)"/);
        if (!hm) continue;

        const vid = abs(hm[1]);
        let pic = '';
        let im = block.match(/<img[^>]+data-original="([^"]+)"/);
        if (im) pic = abs(im[1]);
        else {
            im = block.match(/<img[^>]+src="([^"]+)"/);
            if (im) pic = abs(im[1]);
        }

        let title = '';
        let tm = block.match(/<h5[^>]*>[\s\S]*?<a[^>]*>([^<]{2,120})<\/a>[\s\S]*?<\/h5>/);
        if (tm) title = unescapeHtml(tm[1]).trim();
        else {
            tm = block.match(/(?:title|alt)="([^"]{2,120})"/);
            if (tm) title = unescapeHtml(tm[1]).trim();
        }
        if (!title || seen.has(vid)) continue;
        seen.add(vid);

        let remarks = '';
        const rm = block.match(/<p[^>]*class="vodtitle"[^>]*>([\s\S]{2,200}?)<\/p>/);
        if (rm) {
            remarks = rm[1]
                .replace(/<[^>]+>/g, '')
                .replace(/[\n\t]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        out.push({ vod_id: vid, vod_name: title, vod_pic: pic, vod_remarks: remarks });
    }
    return out;
}

function parseItems(html, skip = 0) {
    const out = [];
    const seen = new Set();
    if (!html) return out;

    if (skip > 0) {
        const ulMatches = [...html.matchAll(/<ul[^>]*>[\s\S]*?<\/ul>/g)];
        let hasVideoUl = false;
        for (const um of ulMatches) {
            const ulHtml = um[0];
            if (!/\/aise\/index\.php\/vod\/play\//.test(ulHtml)) continue;
            hasVideoUl = true;
            const blockResults = extractItemsFromBlock(ulHtml, seen);
            if (blockResults.length > skip) out.push(...blockResults.slice(skip));
        }
        if (!hasVideoUl) out.push(...extractItemsFromBlock(html, seen).slice(skip));
    } else {
        out.push(...extractItemsFromBlock(html, seen));
    }
    return out;
}

function buildCategoryUrl(tid, pg) {
    let url = String(tid);
    if (url.includes('type/id/')) {
        if (url.endsWith('.html')) {
            url = `${url.replace(/\.html$/, '')}/page/${pg}.html`;
        } else if (url.includes('/page/')) {
            url = url.replace(/\/page\/\d+\.html/, `/page/${pg}.html`);
        } else {
            url = `${url.replace(/\/$/, '')}/page/${pg}.html`;
        }
    } else {
        url = `${SITE}/aise/index.php/vod/type/id/${tid}/page/${pg}.html`;
    }
    return abs(url);
}

function pagecountFromHtml(html) {
    let m = html.match(/共\s*(\d+)\s*页/);
    if (!m) m = html.match(/pagecount[=:]\s*(\d+)/s);
    if (!m) m = html.match(/totalpage[=:]\s*(\d+)/s);
    if (m) return parseInt(m[1], 10);
    const pages = [...html.matchAll(/\/page\/(\d+)\.html/g)].map((x) => parseInt(x[1], 10));
    return pages.length ? Math.max(...pages) : 1;
}

function isVideoFormat(url) {
    if (!url) return false;
    const u = String(url).toLowerCase();
    return /\.(m3u8|mp4|flv|mkv|ts|avi)(\?|$)/.test(u) || u.includes('m3u8');
}

async function init(_inReq, _outResp) {
    homeHtml = null;
    return {};
}

async function home(_inReq, _outResp) {
    if (!homeHtml) homeHtml = await fetchHtml(SITE);
    const cats = parseCats(homeHtml || '');
    return {
        class: cats,
        list: parseItems(homeHtml, 6),
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id || '';
    let pg = parseInt(inReq.body.page, 10) || 1;
    const url = buildCategoryUrl(tid, pg);
    const html = await fetchHtml(url);
    if (!html) {
        return { list: [], page: pg, pagecount: 1, limit: 24, total: 0 };
    }
    const list = parseItems(html, 6);
    return {
        list,
        page: pg,
        pagecount: pagecountFromHtml(html),
        limit: 24,
        total: list.length,
    };
}

async function detail(inReq, _outResp) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0] || '';
    vid = String(vid || '').trim();
    if (!vid) return { list: [] };

    const url = abs(vid);
    const html = await fetchHtml(url);
    if (!html) return { list: [] };

    let title = '';
    let pic = '';
    let desc = '';
    const pdata = extractPlayer(html);
    if (pdata?.vod_data) {
        title = pdata.vod_data.vod_name || '';
        desc = pdata.vod_data.vod_class || '';
    }
    if (!title) {
        const tm = html.match(/<title[^>]*>([^<]{2,60})<\/title>/);
        if (tm) {
            title = unescapeHtml(tm[1])
                .trim()
                .replace('在线播放--iSeseAV影库', '')
                .replace('--iSeseAV影库', '')
                .replace(' - iSeseAV影库', '');
        }
    }
    if (!pic) {
        for (const pat of [
            /<img[^>]+data-original="([^"]+)"/,
            /<img[^>]+src="([^"]+)"/,
            /<img[^>]+data-poster="([^"]+)"/,
        ]) {
            const im = html.match(pat);
            if (im) {
                pic = abs(im[1]);
                break;
            }
        }
    }
    if (!desc) {
        const dm = html.match(
            /<div[^>]*class="[^"]*(content|desc|intro|summary)[^"]*"[^>]*>([\s\S]{10,500}?)<\/div>/,
        );
        if (dm) desc = dm[2].replace(/<[^>]+>/g, '').trim();
    }

    return {
        list: [
            {
                vod_id: vid,
                vod_name: title,
                vod_pic: pic,
                vod_content: desc,
                vod_play_from: 'iSese影库',
                vod_play_url: `第1集$${vid}`,
            },
        ],
    };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    const pg = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    let url = `${SITE}/aise/index.php/vod/search.html?wd=${key}`;
    if (pg > 1) url += `&page=${pg}`;
    const html = await fetchHtml(url);
    if (!html) return { list: [] };
    return { list: parseItems(html) };
}

async function play(inReq, _outResp) {
    let url = inReq.body.id;
    if (Array.isArray(url)) url = url[0] || '';
    url = String(url || '').trim();
    const hdr = headers();
    if (!url) return { parse: 0, url: '', header: hdr };
    if (!url.startsWith('http')) url = abs(url);
    if (isVideoFormat(url)) return { parse: 0, url, header: hdr };

    const html = await fetchHtml(url, SITE);
    if (!html) return { parse: 0, url: '', header: hdr };

    let found = '';
    const pdata = extractPlayer(html);
    if (pdata) {
        found = pdata.url || pdata.link || pdata.video || '';
    }
    if (!found) {
        const m = html.match(/(https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*)/);
        if (m) found = m[1];
    }
    if (!found) {
        const m = html.match(/(https?:\/\/[^\s"'\\]+\.mp4[^\s"'\\]*)/);
        if (m) found = m[1];
    }
    if (!found) return { parse: 0, url: '', header: hdr };

    found = found.trim().replace(/\\\//g, '/');
    if (found.startsWith('//')) found = `https:${found}`;
    else if (!found.startsWith('http')) found = abs(found);

    return { parse: 0, url: found, header: hdr };
}

async function proxyHandler(inReq, outResp) {
    const u = decodeURIComponent(inReq.query.url || '');
    if (!u) return outResp.code(403).send('');
    try {
        const resp = await http.get(u, {
            headers: headers(),
            responseType: 'arraybuffer',
            timeout: 15000,
        });
        const ct = resp.headers['content-type'] || 'application/octet-stream';
        return outResp.code(200).type(ct).send(Buffer.from(resp.data));
    } catch {
        return outResp.code(403).send('');
    }
}

export default {
    meta: {
        key: 'isese',
        name: '🌸iSese影库',
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
