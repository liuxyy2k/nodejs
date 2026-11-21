import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://snos.cc';

/* ------------------------------------------------------------------
 * 站点特征：所有页面都是「壳页 + 加密载荷」
 *   <script>const CRYPT_KEY="Flux2024!@#";</script>
 *   <script>decryptPage('BASE64_XOR_PAYLOAD')</script>
 * 浏览器由 utils.js 解密后写入 #_app，直接抓 HTML 拿不到任何链接和标题。
 * 这里用等价算法在 Node 侧还原：base64 → 按 key 循环 XOR → UTF-8。
 * ------------------------------------------------------------------ */
const CRYPT_KEY = 'Flux2024!@#';
const B64_TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(str) {
    const clean = String(str || '').replace(/[^A-Za-z0-9+/=]/g, '');
    const bytes = [];
    for (let i = 0; i < clean.length; i += 4) {
        const c1 = B64_TABLE.indexOf(clean.charAt(i));
        const c2 = B64_TABLE.indexOf(clean.charAt(i + 1));
        const c3 = B64_TABLE.indexOf(clean.charAt(i + 2));
        const c4 = B64_TABLE.indexOf(clean.charAt(i + 3));
        if (c1 < 0 || c2 < 0) break;
        const n = (c1 << 18) | (c2 << 12) | ((c3 < 0 ? 0 : c3) << 6) | (c4 < 0 ? 0 : c4);
        bytes.push((n >> 16) & 0xff);
        if (clean.charAt(i + 2) !== '=' && c3 >= 0) bytes.push((n >> 8) & 0xff);
        if (clean.charAt(i + 3) !== '=' && c4 >= 0) bytes.push(n & 0xff);
    }
    return bytes;
}

function decodeUtf8(bytes) {
    let out = '';
    let i = 0;
    while (i < bytes.length) {
        const b = bytes[i++];
        if (b < 0x80) {
            out += String.fromCharCode(b);
        } else if (b < 0xe0) {
            out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
        } else if (b < 0xf0) {
            const b2 = bytes[i++], b3 = bytes[i++];
            out += String.fromCharCode(((b & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
        } else {
            const b2 = bytes[i++], b3 = bytes[i++], b4 = bytes[i++];
            let cp = ((b & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
            cp -= 0x10000;
            out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        }
    }
    return out;
}

function decrypt(enc) {
    const bytes = base64ToBytes(enc);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] ^= CRYPT_KEY.charCodeAt(i % CRYPT_KEY.length);
    }
    return decodeUtf8(bytes);
}

/** 壳页还原成真实 HTML；非加密页面原样返回 */
function decodeHtml(raw) {
    const text = String(raw || '');
    const m = text.match(/decryptPage\('([^']+)'\)/);
    if (!m) return text;
    try {
        return decrypt(m[1]);
    } catch (e) {
        return text;
    }
}

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, Referer: site + '/', ...headers },
        timeout: 20000,
        responseType: 'text',
        transformResponse: [(d) => d],
    });
    return resp.data;
}

async function loadPage(reqUrl) {
    const raw = await request(reqUrl);
    return load(decodeHtml(raw));
}

function absUrl(u) {
    const s = String(u || '').trim();
    if (!s) return '';
    if (s.startsWith('//')) return 'https:' + s;
    if (s.startsWith('http')) return s;
    if (s.startsWith('/')) return site + s;
    return site + '/' + s;
}

/** 列表卡片：a.video-card > img.thumb-img + .video-title */
function parseVods($) {
    const videos = [];
    $('a.video-card').each((_, element) => {
        const pic = $(element).find('img.thumb-img').attr('src')
        || $(element).find('.thumbnail img').attr('src') || '';
    const url = $(element).attr('href') || '';
    const name = $(element).find('.video-title').text().trim();
    if (!name) return;
    const idMatch = url.match(/[?&]id=(\d+)/);
    const id = idMatch ? idMatch[1] : url;
    if (!id) return;
    videos.push({
        vod_id: id,
        vod_name: name,
        vod_pic: absUrl(pic),
        vod_remarks: $(element).find('.video-meta span').first().text().trim(),
    });
});
return videos;
}

/** 从分页条取最大页码，抓不到返回 0 */
function maxPage($) {
let max = 0;
$('a').each((_, el) => {
    const text = $(el).text().trim();
    if (/^\d+$/.test(text)) {
        const n = parseInt(text, 10);
        if (n > max) max = n;
    }
    const href = $(el).attr('href') || '';
    const m = href.match(/[?&]page=(\d+)/);
    if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
    }
});
return max;
}

/** 分类表：/browse 的 a.category-card，type_id 用 label:ID */
async function getClasses() {
const classes = [{ type_id: 'home', type_name: '最新更新' }];
try {
    const $ = await loadPage(site + '/browse');
    $('a.category-card').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/[?&]id=(\d+)/);
        const name = $(el).find('.cat-card-name').text().trim();
        if (!m || !name) return;
        classes.push({ type_id: 'label:' + m[1], type_name: name });
    });
} catch (e) {
    // 分类接口异常时保留最小可用分类，避免 home 整体失败
}
return classes;
}

async function init(_inReq, _outResp) {
return {};
}

async function home(_inReq, _outResp) {
const classes = await getClasses();
const $ = await loadPage(site + '/home');
const list = parseVods($);

return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
const tid = String(inReq.body.id || 'home');
const page = parseInt(inReq.body.page) || 1;

let url;
if (/^\d+$/.test(tid)) {
    url = `${site}/label?id=${tid}&page=${page}`;
} else if (tid.indexOf('label:') === 0) {
    url = `${site}/label?id=${tid.slice(6)}&page=${page}`;
} else {
    url = `${site}/home?page=${page}`;
}

const $ = await loadPage(url);
const list = parseVods($);

let pagecount = maxPage($);
if (!pagecount || pagecount < page) {
    pagecount = list.length > 0 ? page + 1 : page;
}

return { page, pagecount, list };
}

async function detail(inReq, _outResp) {
const id = String(inReq.body.id || '');
const url = `${site}/player?id=${encodeURIComponent(id)}`;
const raw = await request(url);
const plain = decodeHtml(raw);
const $ = load(plain);

const name = $('#detailTitle').text().trim()
    || $('.player-title').text().trim()
    || $('meta[property="og:title"]').attr('content') || '';

const pic = absUrl(
    $('#playerBg img').attr('src')
    || $('.player-thumb-img img').attr('src')
    || $('meta[property="og:image"]').attr('content') || ''
);

// 播放地址直接挂在播放按钮的属性上，本身就是 m3u8，无需二次解析
let playUrl = $('#playBtn').attr('data-video-url')
    || $('[data-video-url]').attr('data-video-url') || '';

if (!playUrl) {
    const m = plain.match(/(https?:\/\/[^"'\s\\]+\.m3u8)/);
    if (m) playUrl = m[1];
}

const typeName = $('#detailTag a').first().text().trim()
    || $('.video-meta-bar a.tag-link').first().text().trim() || '';
const dateText = $('#detailViews').text().trim();
const yearMatch = dateText.match(/(\d{4})/);
const content = $('.video-desc, .detail-desc, .video-intro').text().trim();

return {
    list: [{
        vod_id: id,
        vod_name: name,
        vod_pic: pic,
        vod_year: yearMatch ? yearMatch[1] : '',
        vod_area: '',
        vod_remarks: dateText.slice(0, 10),
        type_name: typeName,
        vod_content: content || (typeName ? `${typeName} · ${name}` : name),
        vod_play_from: 'Snos',
        vod_play_url: playUrl ? `第1集$${playUrl}` : '',
    }],
};
}

async function play(inReq, _outResp) {
return {
    parse: 0,
    url: inReq.body.id,
    header: {
        'User-Agent': UA,
        Referer: site + '/',
    },
};
}

async function search(inReq, _outResp) {
const text = encodeURIComponent(inReq.body.wd || inReq.body.key || '');
const $ = await loadPage(`${site}/explore?q=${text}`);
return { list: parseVods($) };
}

export default {
meta: {
    key: 'snos',
    name: '🌸Snos',
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

