import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'node:crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const site = 'https://yvy25e.jwigrcjsr.cc';

/**
 * 站点封面走 crypto-image 加密：AES-128-CBC / NoPadding
 * 参数来自 /static/web/js/plugins/crypto-image-protocol.js
 *   decryptKey: f5d965df75336270
 *   decryptIV : 97b60394abc2fbe1
 *
 * IMG_MODE 控制 vod_pic 返回什么：
 *   data  （默认）服务端解密后转 data:image/jpeg;base64，一定能显示，但列表 JSON 会变大
 *   raw           直接返回加密地址（前台 <img> 显示不出来，只适合你自己再处理）
 *   empty         不返回封面，只出标题/播放地址
 */
const IMG_KEY = Buffer.from('f5d965df75336270');
const IMG_IV = Buffer.from('97b60394abc2fbe1');
const IMG_MODE = (process.env.IMG_MODE || 'data').toLowerCase();

const imgCache = new Map();

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, Referer: `${site}/`, ...headers },
        timeout: 25000,
    });
    return resp.data;
}

async function fetchBuffer(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, Referer: `${site}/` },
        responseType: 'arraybuffer',
        timeout: 25000,
    });
    return Buffer.from(resp.data);
}

/** 解密；不是 16 倍数或解出来不是图片就原样返回（有些图本来就是明文） */
function decryptImage(buf) {
    if (!buf || !buf.length) return buf;
    const looksImage = (b) =>
        (b[0] === 0xff && b[1] === 0xd8) || // jpeg
        (b[0] === 0x89 && b[1] === 0x50) || // png
        (b.slice(0, 4).toString('ascii') === 'RIFF'); // webp

    if (looksImage(buf)) return buf;
    if (buf.length % 16 !== 0) return buf;

    try {
        const d = crypto.createDecipheriv('aes-128-cbc', IMG_KEY, IMG_IV);
        d.setAutoPadding(false);
        const out = Buffer.concat([d.update(buf), d.final()]);
        return looksImage(out) ? out : buf;
    } catch (e) {
        return buf;
    }
}

function mimeOf(buf) {
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf.slice(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
    return 'image/jpeg';
}

/** 按 IMG_MODE 生成 vod_pic */
async function buildPic(url) {
    if (!url || IMG_MODE === 'empty') return '';
    if (IMG_MODE === 'raw') return url;

    if (imgCache.has(url)) return imgCache.get(url);

    try {
        const raw = await fetchBuffer(url);
        const out = decryptImage(raw);
        const data = `data:${mimeOf(out)};base64,${out.toString('base64')}`;
        if (imgCache.size > 120) imgCache.delete(imgCache.keys().next().value);
        imgCache.set(url, data);
        return data;
    } catch (e) {
        return '';
    }
}

/**
 * 列表解析
 * 真实 DOM：
 *   <li><div class="video-item">
 *     <a class="flex aspect-w-16 aspect-h-9" href="/videos/8574/">
 *       <div class="poster" data-url="https://.../xxx.m3u8?auth_key=...">
 *         <img src="加载图" data-src="https://pic.../xxx.png?auth_key=..." data-cache="1" alt="标题">
 *         <div>10:08</div>   ← 时长
 *       </div>
 *     </a>
 *     <h3><a href="/videos/8574/">标题</a></h3>
 *   </div></li>
 */
function parseNodes(html) {
    const $ = load(html);
    const out = [];
    const seen = new Set();

    /**
     * 两个页面用两套卡片结构，但都以 div.poster[data-url] 为锚点：
     *   首页：  li > div.video-item > a[href] > div.poster[data-url] > img[data-src]
     *   标签页：article.tagd-card > a.tagd-poster-link > div.poster.tagd-poster[data-url] > img[data-src]
     */
    $('div.poster[data-url]').each((_, el) => {
        const $p = $(el);
        const $link = $p.closest('a[href*="/videos/"]').length
            ? $p.closest('a[href*="/videos/"]')
            : $p.closest('a');
        const href = $link.attr('href') || '';
        const hit = href.match(/\/videos\/(\d+)\//);
        if (!hit) return;

        const id = hit[1];
        if (seen.has(id)) return;
        seen.add(id);

        const $card = $p.closest('article, li, .video-item');
        const $img = $p.find('img').first();

        const name =
            $card.find('h3 a').first().text().trim() ||
            ($img.attr('alt') || '').trim();

        // 时长：标签页 span.tagd-duration，首页是 poster 里一个裸 div
        const dur =
            $p.find('.tagd-duration').first().text().trim() ||
            ($p.text().match(/\d{1,2}:\d{2}(?::\d{2})?/) || [''])[0];

        out.push({
            id,
            name: name.replace(/\s+/g, ' ').trim(),
            pic: ($img.attr('data-src') || '').trim(),
            hls: ($p.attr('data-url') || '').trim(),
            dur,
        });
    });

    return out;
}

async function parseVods(html) {
    const nodes = parseNodes(html);
    const list = [];

    for (const n of nodes) {
        list.push({
            vod_id: n.id,
            vod_name: n.name,
            vod_pic: await buildPic(n.pic),
            vod_remarks: n.dur,
            // 列表里就带 m3u8，直接塞进播放串，play 不用再请求
            vod_play_url: n.hls ? `正片$${n.hls}` : '',
        });
    }

    return list;
}

function parsePageCount(html, page) {
    let max = page;
    const re = /\/page\/(\d+)\//g;
    let m;
    while ((m = re.exec(html))) {
        const n = parseInt(m[1]);
        if (n > max && n < 10000) max = n;
    }
    // 站点只渲染前后页链接，取到最大就是"还有下一页"
    return max;
}

async function init(_inReq, _outResp) {
    return {};
}

const TAGS = [
    ['toupai', '偷拍'], ['toukui', '偷窥'], ['weisui-2', '尾随'],
    ['weisuitoupai', '尾随偷拍'], ['wumacepai', '无码厕拍'], ['jieshe', '街射'],
    ['jiepai', '街拍'], ['chaodi', '抄底'], ['qundi', '裙底'],
    ['zouguang', '走光'], ['luchu', '露出'], ['huwai', '户外'],
    ['meitui', '美腿'], ['qinglv', '情侣'], ['liuchu', '流出'],
    ['cos', 'cos'], ['onlyfans', 'onlyfans'], ['3d', '3D'],
    ['3p', '3P'], ['69shi', '69式'], ['ai', 'AI'],
    ['aichengrenjuqing', 'AI成人剧情'], ['aihuanlian', 'AI换脸'],
    ['aihuanlianshipin', 'AI换脸视频'], ['aimingxinghuanlian', 'AI明星换脸'],
    ['aizhenrenhuanlian', 'AI真人换脸'], ['aizhenrenduanju', 'AI真人短剧'],
    ['aiduanju', 'AI短剧'], ['aiduanjutuijian', 'AI短剧推荐'],
    ['aiduanjuziyuan', 'AI短剧资源'], ['aijuqingshipin', 'AI剧情视频'],
    ['aidongmanjuqing', 'AI动漫剧情'], ['aishipinduanju', 'AI视频短剧'],
];

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'new', type_name: '最近更新' },
        ...TAGS.map(([k, n]) => ({ type_id: `tag:${k}`, type_name: n })),
    ];

    const html = await request(site);
    const list = await parseVods(html);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || inReq.body.tid || '').trim();
    const page = parseInt(inReq.body.page) || 1;

    if (!tid) return { page: 1, pagecount: 0, list: [] };

    // new = /videos/new/，其余一律当标签页 /tag/{key}/
    let url;
    if (tid === 'new') {
        url = page > 1 ? `${site}/videos/new/page/${page}/` : `${site}/videos/new/`;
    } else {
        const key = tid.startsWith('tag:') ? tid.slice(4) : tid;
        url = page > 1 ? `${site}/tag/${key}/page/${page}/` : `${site}/tag/${key}/`;
    }

    const html = await request(url);
    const list = await parseVods(html);

    return { page, pagecount: parsePageCount(html, page), list };
}

/**
 * 详情页内联的完整视频数据（页尾 <script> 里）：
 *   {"author":"...","id":2331,"title":"...","coverSrc":"https://pic...",
 *    "videoSrc":"https://.../xxx.m3u8?auth_key=...","tags":[...],
 *    "cdnAuthKey":"x-cdn-auth","cdnAuthValue":"...","cdnM3u8Enabled":false}
 * 注意：页面里 div.poster[data-url] 是"推荐视频"的地址，不是当前视频的，
 * 必须从这里取 videoSrc 才正确。
 */
function parseVideoJson(html) {
    const start = html.indexOf('{"author":');
    if (start < 0) return null;

    let depth = 0;
    let inStr = false;
    let esc = false;

    for (let i = start; i < html.length; i++) {
        const c = html[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(html.slice(start, i + 1));
                } catch (e) {
                    return null;
                }
            }
        }
    }
    return null;
}

async function detail(inReq, _outResp) {
    const raw = String(inReq.body.id || '').trim();
    const hit = raw.match(/(\d+)/);
    const id = hit ? hit[1] : raw;

    const html = await request(`${site}/videos/${id}/`);
    const data = parseVideoJson(html) || {};

    const title =
        data.title ||
        ((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    const desc =
        data.description ||
        (html.match(/property="og:description"\s+content="([^"]*)"/) || [])[1] ||
        '';

    const tags = Array.isArray(data.tags) ? data.tags.join(',') : '';

    const hls = String(data.videoSrc || '').replace(/&amp;/g, '&');
    const cover = String(data.coverSrc || data.posterSrc || '').replace(/&amp;/g, '&');
    const pic = await buildPic(cover);

    return {
        list: [{
            vod_id: id,
            vod_name: title,
            vod_pic: pic,
            vod_content: desc,
            vod_remarks: '',
            vod_actor: data.author || '',
            type_name: tags,
            vod_play_from: '痴汉俱乐部',
            vod_play_url: hls ? `正片$${hls}` : '',
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

    // 已经是 m3u8
    if (/\.(m3u8|mp4)(\?|#|$)/i.test(id)) {
        return { parse: 0, url: id.replace(/&amp;/g, '&'), header };
    }

    // 否则是视频 id，回详情页取内联数据里的 videoSrc
    try {
        const hit = id.match(/(\d+)/);
        if (hit) {
            const html = await request(`${site}/videos/${hit[1]}/`);
            const data = parseVideoJson(html);
            if (data && data.videoSrc) {
                return { parse: 0, url: String(data.videoSrc).replace(/&amp;/g, '&'), header };
            }
        }
    } catch (e) {
        // 落到兜底
    }

    return { parse: 1, url: `${site}/videos/${id}/`, header };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);

    if (!key) return { list: [], page: 1 };

    let url = `${site}/search/?keyword=${encodeURIComponent(key)}`;
    if (pg > 1) url += `&page=${pg}`;

    const html = await request(url);
    const list = await parseVods(html);

    return { list, page: pg, pagecount: parsePageCount(html, pg) };
}

export default {
    meta: {
        key: 'chihan',
        name: '👀痴汉俱乐部',
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
