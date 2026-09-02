import axios from 'axios';
import crypto from 'crypto';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/dys18/3';
const PUBLISH_URL = 'https://18dyw.net/';
const UA =
    'Mozilla/5.0 (Linux; Android 16; 2510DRK44C Build/BP2A.250605.031.A3) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/143.0.7499.192 Mobile Safari/537.36';
const AES_KEY = Buffer.from('f5d965df75336270');
const AES_IV = Buffer.from('97b60394abc2fbe1');
const RAND_CHARS = 'abcdefghjkmnpqrstuvwxy23456789';

const CATS = {
    video: {
        name: '精选AV',
        base: '/video',
        sorts: [
            { n: '近期最佳', v: 'best-recently' },
            { n: '最近更新', v: 'latest-updates' },
            { n: '最多观看', v: 'most-viewed' },
            { n: '最多收藏', v: 'most-favorites' },
        ],
        cates: [
            { n: '多人群P', v: 'drqp' },
            { n: '辛尤里', v: 'xyl' },
            { n: '按摩会所', v: 'amhs' },
            { n: '户外搭讪', v: 'hwds' },
            { n: '人妖伪娘', v: 'rywn' },
            { n: '网黄主播', v: 'whzb' },
            { n: '福利姬', v: 'flj' },
            { n: '白虎嫩穴', v: 'bhnx' },
            { n: '港台三级', v: 'gtsj' },
            { n: '制服诱惑', v: 'zfyh' },
            { n: '原创传媒', v: 'yccm' },
            { n: '偷拍自拍', v: 'tpzp' },
            { n: '萝莉少女', v: 'llsn' },
            { n: '母子乱伦', v: 'mzll' },
            { n: '成人动漫', v: 'crdm' },
            { n: '童颜巨乳', v: 'tyjr' },
            { n: '校园师生', v: 'xyss' },
            { n: '色情综艺', v: 'sqzy' },
            { n: '勾引偷情', v: 'gytq' },
            { n: '强奸迷奸', v: 'qjmj' },
            { n: '熟女少妇', v: 'snsf' },
            { n: '重口猎奇', v: 'zklq' },
            { n: '欧美性爱', v: 'omxa' },
            { n: '内射中出', v: 'nszc' },
            { n: '探花约啪', v: 'thyp' },
            { n: '野战车震', v: 'yzcz' },
            { n: 'SM调教', v: 'smdj' },
            { n: '绿帽换妻', v: 'lmhq' },
            { n: '日韩伦理', v: 'rhll' },
            { n: 'AI换脸', v: 'aihl' },
            { n: '黑人黑妹', v: 'hrhm' },
            { n: '足交肛交', v: 'zjgj' },
            { n: '玩偶姐姐', v: 'wojj' },
            { n: '同志男同', v: 'tznt' },
            { n: '女同拉拉', v: 'ntll' },
            { n: '自慰高潮', v: 'zwgc' },
            { n: 'AI短剧', v: 'aidj' },
        ],
    },
    melon: {
        name: '黑料吃瓜',
        base: '/melon',
        sorts: [
            { n: '推荐', v: 'recommend' },
            { n: '热门', v: 'hot' },
            { n: '最新', v: 'latest' },
        ],
        cates: [
            { n: '吃瓜新闻', v: 'cgxw' },
            { n: '领导干部', v: 'ldgb' },
            { n: '海外吃瓜', v: 'hwcg' },
            { n: '伦理道德', v: 'lldd' },
            { n: '每日大赛', v: 'mrds' },
            { n: '网黄合集', v: 'whhj' },
            { n: '明星黑料', v: 'mxhl' },
            { n: '网红黑料', v: 'whhl' },
            { n: '热门大瓜', v: 'rmdg' },
            { n: '学生校园', v: 'xsxy' },
            { n: '今日吃瓜', v: 'jrcg' },
            { n: '反差骚女', v: 'fcsn' },
            { n: '探花偷拍', v: 'thtp' },
            { n: 'AI短剧', v: 'aidj' },
            { n: '寸止调教', v: 'czdj' },
            { n: '世界杯狂欢', v: 'sjbkh' },
        ],
    },
    av: {
        name: 'AV影片',
        base: '/av',
        sorts: [
            { n: '最多搜索', v: 'trending' },
            { n: '最新上线', v: 'new' },
            { n: '最多观看', v: 'watching' },
            { n: '最新发布', v: 'release' },
        ],
    },
    av_theme: {
        name: '影片主题',
        base: '/av/theme',
        sorts: [
            { n: '近期最佳', v: 'best-recently' },
            { n: '最近更新', v: 'latest-updates' },
            { n: '最多观看', v: 'most-viewed' },
            { n: '最多收藏', v: 'most-favorites' },
        ],
    },
    av_actors: {
        name: 'AV女优',
        base: '/av/actors-list',
        actor_sorts: [
            { n: '热度优先', v: 'hot-first' },
            { n: '名称顺序', v: 'name-order' },
            { n: '最近更新', v: 'latest-updates' },
            { n: '最多影片', v: 'most-videos' },
        ],
    },
    av_tag: {
        name: 'AV标签',
        base: '/av/tag',
    },
};

let host = '';
let hostCacheTime = 0;
const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
};

function e64(s) {
    try {
        return Buffer.from(String(s || ''), 'utf8').toString('base64');
    } catch {
        return '';
    }
}

function d64(s) {
    try {
        return Buffer.from(String(s || ''), 'base64').toString('utf8');
    } catch {
        return '';
    }
}

function stripTags(s) {
    return String(s || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function uniqueById(list) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
        if (!seen.has(item.vod_id)) {
            seen.add(item.vod_id);
            out.push(item);
        }
    }
    return out;
}

function proxyImg(url, inReq) {
    if (!url) return '';
    const prefix = inReq?.server?.prefix || PREFIX;
    return `http://127.0.0.1:${PORT}${prefix}/img?url=${encodeURIComponent(e64(url))}`;
}

function decryptImage(buf) {
    try {
        const d = crypto.createDecipheriv('aes-128-cbc', AES_KEY, AES_IV);
        return Buffer.concat([d.update(buf), d.final()]);
    } catch {
        try {
            const d = crypto.createDecipheriv('aes-128-cbc', AES_KEY, AES_IV);
            d.setAutoPadding(false);
            let dec = Buffer.concat([d.update(buf), d.final()]);
            const pad = dec[dec.length - 1];
            if (pad >= 1 && pad <= 16 && dec.subarray(dec.length - pad).every((b) => b === pad)) {
                dec = dec.subarray(0, dec.length - pad);
            } else {
                let i = dec.length;
                while (i > 0 && dec[i - 1] === 0) i--;
                dec = dec.subarray(0, i);
            }
            return dec;
        } catch {
            return buf;
        }
    }
}

function imageMime(data) {
    if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50) return 'image/png';
    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
    if (data.length >= 6 && data.subarray(0, 3).toString() === 'GIF') return 'image/gif';
    if (data.length >= 12 && data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP') {
        return 'image/webp';
    }
    return 'image/jpeg';
}

async function httpGet(url, timeout = 15000) {
    if (!url) return '';
    try {
        const resp = await axios.get(url, {
            headers,
            timeout,
            responseType: 'text',
            validateStatus: () => true,
        });
        if (resp.status === 200) return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        /* ignore */
    }
    return '';
}

function randPrefix() {
    let s = '';
    for (let i = 0; i < 4; i++) s += RAND_CHARS[Math.floor(Math.random() * RAND_CHARS.length)];
    return s;
}

function bindHost(domain) {
    host = domain.replace(/\/$/, '');
    hostCacheTime = Date.now();
    headers.Referer = `${host}/`;
    headers.Origin = host;
}

async function resolveDomain() {
    const probe = await httpGet('https://dys18.com/', 3000);
    if (probe.length > 1000) {
        bindHost('https://dys18.com');
        return;
    }
    let mainDomain = '';
    let backupDomain = '';
    const pub = await httpGet(PUBLISH_URL, 10000);
    if (pub) {
        mainDomain = pub.match(/var\s+mainDomain\s*=\s*'([^']+)'/)?.[1] || '';
        backupDomain = pub.match(/var\s+backupDomain\s*=\s*'([^']+)'/)?.[1] || '';
    }
    for (let i = 0; i < 10; i++) {
        const prefix = randPrefix();
        for (const suffix of [mainDomain, backupDomain]) {
            if (!suffix) continue;
            const domain = `https://${prefix}.${suffix}`;
            const html = await httpGet(domain, 3000);
            if (html.length > 1000) {
                bindHost(domain);
                return;
            }
        }
    }
}

async function ensureHost() {
    if (host && Date.now() - hostCacheTime < 1800 * 1000) return;
    await resolveDomain();
}

async function req(url) {
    await ensureHost();
    if (!host && !/^https?:\/\//i.test(url)) return '';
    return httpGet(url);
}

function parseExt(ext) {
    if (!ext) return {};
    if (typeof ext === 'object') return ext;
    const s = String(ext).trim();
    if (!s || s === '{}' || s === 'null' || s === 'undefined') return {};
    try {
        return JSON.parse(s);
    } catch {
        const result = {};
        for (const part of s.split('&')) {
            if (!part.includes('=')) continue;
            const i = part.indexOf('=');
            result[part.slice(0, i)] = part.slice(i + 1);
        }
        return result;
    }
}

function extractMaxPage(html) {
    const total = html.match(/data-rec-total="(\d+)"/);
    const per = html.match(/data-rec-per-page="(\d+)"/);
    if (total && per) {
        const t = parseInt(total[1], 10);
        const p = parseInt(per[1], 10);
        if (p > 0) return Math.ceil(t / p);
    }
    if (/<link rel="next"/.test(html)) return 999;
    return 1;
}

function buildUrl(cid, cat, sort, pg) {
    const c = CATS[cid];
    const base = c.base;
    if (!cat) cat = c.cates?.[0]?.v || '';
    if (!sort) sort = c.sorts?.[0]?.v || '';
    return `${host}${base}/${cat}/${sort}/${pg}`;
}

function parseVideoList(html, inReq) {
    const result = [];
    const re = /<li>\s*<div class="video-item">([\s\S]*?)<\/li>/g;
    let m;
    while ((m = re.exec(html))) {
        const item = m[1];
        if (item.includes('rel="sponsored"') || item.includes('checkNum')) continue;
        const hrefM = item.match(/href="(\/(?:video|av)\/detail\/(\d+))"/);
        if (!hrefM) continue;
        const href = hrefM[1];
        const vid = hrefM[2];
        const kind = href.includes('/av/detail/') ? 'av' : 'video';
        const du = item.match(/data-url="([^"]+)"/);
        if (!du) continue;
        const alt = item.match(/alt="([^"]*)"/);
        const imgM = item.match(/data-src="([^"]+)"/);
        let duration = item.match(/<span class="text-sm ml-auto">([^<]+)<\/span>/)?.[1]?.trim() || '';
        if (!duration) {
            duration = item.match(/<div class="text-sm opacity-50[^"]*">\s*([^<]+)\s*<\/div>/)?.[1]?.trim() || '';
        }
        result.push({
            vod_id: `${kind}:${vid}:${e64(du[1])}`,
            vod_name: alt?.[1] || vid,
            vod_pic: proxyImg(imgM?.[1] || '', inReq),
            vod_remarks: duration,
        });
    }
    return result;
}

function parseMelonList(html, inReq) {
    const result = [];
    const re = /<li[^>]*>([\s\S]*?)<\/li>/g;
    let m;
    while ((m = re.exec(html))) {
        const item = m[1];
        const hrefM = item.match(/href="\/melon\/detail\/(\d+)"/);
        if (!hrefM) continue;
        const mid = hrefM[1];
        const imgM = item.match(/data-src="([^"]+)"/);
        const aM = item.match(/href="\/melon\/detail\/\d+"[^>]*>([\s\S]*?)<\/a>/);
        const title = aM ? stripTags(aM[1]) : mid;
        const date = item.match(/<span>(\d{4}-\d{2}-\d{2})/)?.[1] || '';
        result.push({
            vod_id: `melon:${mid}`,
            vod_name: title || mid,
            vod_pic: proxyImg(imgM?.[1] || '', inReq),
            vod_remarks: date,
        });
    }
    return uniqueById(result);
}

function parseActorList(html, inReq) {
    const result = [];
    const re = /<li[^>]*>([\s\S]*?)<\/li>/g;
    let m;
    while ((m = re.exec(html))) {
        const item = m[1];
        const hrefM = item.match(/href="(\/av\/actors-video\/(\d+)\/[^"]+)"/);
        if (!hrefM) continue;
        const aid = hrefM[2];
        const imgM = item.match(/data-src="([^"]+)"/);
        const alt = item.match(/alt="([^"]*)"/);
        const num = item.match(/(\d+)\s*(?:部|个|作品|视频)/);
        result.push({
            vod_id: `av_actors/${aid}`,
            vod_name: alt?.[1] || aid,
            vod_pic: proxyImg(imgM?.[1] || '', inReq),
            vod_remarks: num ? `${num[1]}部` : '',
            vod_tag: 'folder',
        });
    }
    return uniqueById(result);
}

function parseThemeList(html, inReq) {
    const result = [];
    const re = /<li[^>]*class="[^"]*theme-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
    let m;
    while ((m = re.exec(html))) {
        const item = m[1];
        const href = item.match(/href="([^"]+)"/)?.[1];
        if (!href) continue;
        const slug = href.match(/\/av\/theme\/([^/]+)\//)?.[1];
        if (!slug) continue;
        const alt = item.match(/alt="([^"]*)"/);
        const imgM = item.match(/data-src="([^"]+)"/);
        const rm = item.match(/<div[^>]*class="[^"]*dx-opacity-bg[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        result.push({
            vod_id: `av_theme/${slug}`,
            vod_name: alt?.[1] || slug,
            vod_pic: proxyImg(imgM?.[1] || '', inReq),
            vod_remarks: rm ? stripTags(rm[1]) : '',
            vod_tag: 'folder',
        });
    }
    return uniqueById(result);
}

function parseTagList(html) {
    const result = [];
    const re = /<li[^>]*>([\s\S]*?)<\/li>/g;
    let m;
    while ((m = re.exec(html))) {
        const item = m[1];
        const hrefM = item.match(/href="(\/av\/tag\/([^"]+))"/);
        if (!hrefM) continue;
        const tag = decodeURIComponent(hrefM[2]);
        const h3 = item.match(/<h3>([\s\S]*?)<\/h3>/);
        result.push({
            vod_id: `av_tag/${tag}`,
            vod_name: h3 ? stripTags(h3[1]) : tag,
            vod_pic: '',
            vod_remarks: '',
            vod_tag: 'folder',
        });
    }
    return uniqueById(result);
}

function unpackEval(code) {
    const m = code.match(/\('((?:[^'\\]|\\.)*)',(\d+),(\d+),'/);
    if (!m) return '';
    const template = m[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
    const base = parseInt(m[2], 10);
    const sm = code.match(/'([^']+)'\.split\('\|'\)/);
    if (!sm) return '';
    const parts = sm[1].split('|');
    let result = '';
    let i = 0;
    while (i < template.length) {
        const ch = template[i];
        if (/[0-9a-zA-Z_]/.test(ch)) {
            let j = i;
            while (j < template.length && /[0-9a-zA-Z_]/.test(template[j])) j++;
            const token = template.slice(i, j);
            let idx = 0;
            let valid = true;
            for (const c of token) {
                let d;
                if (c >= '0' && c <= '9') d = c.charCodeAt(0) - 48;
                else if (c >= 'a' && c <= 'z') d = c.charCodeAt(0) - 87;
                else if (c >= 'A' && c <= 'Z') d = c.charCodeAt(0) - 29;
                else {
                    valid = false;
                    break;
                }
                idx = idx * base + d;
            }
            result += valid && idx >= 0 && idx < parts.length && parts[idx] ? parts[idx] : token;
            i = j;
        } else {
            result += ch;
            i++;
        }
    }
    return result;
}

async function extractMelonPlay(detailHtml) {
    const evals = detailHtml.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\)\)/g) || [];
    for (const ev of evals) {
        const unpacked = unpackEval(ev);
        if (!unpacked) continue;
        const encM = unpacked.match(/encodeURIComponent\("([^"]+)"\)/);
        const cM = unpacked.match(/&c=(https?:\/\/[^"]+?)&t=/);
        if (!encM || !cM) continue;
        const t = Math.floor(Date.now() / 1000);
        const playUrl = `${host}/melon/melon-detail-play?u=${encodeURIComponent(encM[1])}&c=${encodeURIComponent(cM[1])}&t=${t}`;
        const playHtml = await req(playUrl);
        if (!playHtml) continue;
        const unpacked2 = unpackEval(playHtml);
        const src = (unpacked2 || playHtml).match(/src="(\/media\/m3u8[^"]+)"/);
        if (src) return src[1];
    }
    return '';
}

function pageResult(vods, pg, pc, extraTotal) {
    return {
        list: vods,
        page: pg,
        pagecount: pc,
        limit: 24,
        total: extraTotal != null ? extraTotal : pc * 24,
    };
}

async function init() {
    host = '';
    hostCacheTime = 0;
    await ensureHost();
    return {};
}

async function home(inReq) {
    const classes = [];
    const filters = {};
    for (const [cid, c] of Object.entries(CATS)) {
        classes.push({ type_id: cid, type_name: c.name });
        const f = [];
        if (cid === 'video' || cid === 'melon') {
            if (c.cates) f.push({ key: 'cat', name: '分类', value: c.cates });
            if (c.sorts) f.push({ key: 'sort', name: '排序', value: c.sorts });
        } else if (cid === 'av') {
            f.push({ key: 'cateId', name: '类型', value: c.sorts });
        } else if (cid === 'av_theme') {
            f.push({ key: 'by', name: '影片排序', value: c.sorts });
        } else if (cid === 'av_actors') {
            f.push({ key: 'by', name: '女优排序', value: c.actor_sorts });
        }
        filters[cid] = f;
    }
    await ensureHost();
    const html = await req(`${host}/video/drqp/best-recently/1`);
    return { class: classes, list: parseVideoList(html, inReq), filters };
}

async function category(inReq) {
    await ensureHost();
    let cid = String(inReq.body.id || '');
    const pg = parseInt(inReq.body.page, 10) || 1;
    const ext = parseExt(inReq.body.filters || inReq.body.extend);
    if (cid === 'video') {
        const html = await req(buildUrl(cid, ext.cat || '', ext.sort || '', pg));
        return pageResult(parseVideoList(html, inReq), pg, extractMaxPage(html));
    }
    if (cid === 'melon') {
        const html = await req(buildUrl(cid, ext.cat || '', ext.sort || '', pg));
        return pageResult(parseMelonList(html, inReq), pg, extractMaxPage(html));
    }
    if (cid === 'av') {
        const cateId = ext.cateId || 'trending';
        const html = await req(`${host}/av/${cateId}/${pg}`);
        return pageResult(parseVideoList(html, inReq), pg, extractMaxPage(html));
    }
    if (cid === 'av_theme') {
        const url = pg > 1 ? `${host}/av/theme/${pg}` : `${host}/av/theme`;
        const html = await req(url);
        const vods = parseThemeList(html, inReq);
        let pc = extractMaxPage(html);
        if (pc <= 1) pc = 1;
        return pageResult(vods, pg, pc, vods.length);
    }
    if (cid.startsWith('av_theme/')) {
        const slug = cid.slice(9);
        const by = ext.by || 'best-recently';
        const html = await req(`${host}/av/theme/${slug}/${by}/${pg}`);
        return pageResult(parseVideoList(html, inReq), pg, extractMaxPage(html));
    }
    if (cid === 'av_actors') {
        const by = ext.by || 'hot-first';
        const html = await req(`${host}/av/actors-list/${by}/${pg}`);
        return pageResult(parseActorList(html, inReq), pg, extractMaxPage(html));
    }
    if (cid.startsWith('av_actors/')) {
        const actorId = cid.slice(10);
        const html = await req(`${host}/av/actors-video/${actorId}/latest-updates/${pg}`);
        return pageResult(parseVideoList(html, inReq), pg, extractMaxPage(html));
    }
    if (cid === 'av_tag') {
        const html = await req(`${host}/av/tag`);
        const vods = parseTagList(html);
        return pageResult(vods, pg, 1, vods.length);
    }
    if (cid.startsWith('av_tag/')) {
        const tag = decodeURIComponent(cid.slice(7));
        const html = await req(`${host}/av/tag/${encodeURIComponent(tag)}/${pg}`);
        return pageResult(parseVideoList(html, inReq), pg, extractMaxPage(html));
    }
    return { list: [], page: pg, pagecount: 1, limit: 24, total: 0 };
}

async function detail(inReq) {
    await ensureHost();
    let rawId = inReq.body.id;
    if (Array.isArray(rawId)) rawId = rawId[0];
    rawId = String(rawId || '');
    const idx = rawId.indexOf(':');
    const kind = idx >= 0 ? rawId.slice(0, idx) : 'video';
    const payload = idx >= 0 ? rawId.slice(idx + 1) : rawId;
    let vid = payload;
    let dataUrl = '';
    let url = '';
    if (kind === 'video' || kind === 'av') {
        const seg = payload.split(':');
        vid = seg[0];
        dataUrl = seg[1] ? d64(seg[1]) : '';
        url = `${host}/${kind}/detail/${vid}`;
    } else if (kind === 'melon') {
        vid = payload;
        url = `${host}/melon/detail/${vid}`;
    } else {
        return { list: [] };
    }
    const html = await req(url);
    if (!html) return { list: [] };
    let title = html.match(/"title"\s*:\s*"([^"]+)"/)?.[1] || html.match(/"name"\s*:\s*"([^"]+)"/)?.[1] || '';
    if (!title) {
        const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
        if (h1) title = stripTags(h1[1]);
    }
    if (!title) title = html.match(/<title>([^<|]+)/)?.[1]?.trim() || '';
    let img = html.match(/"thumbnailUrl"\s*:\s*\[?"([^"]+)"/)?.[1] || '';
    if (!img) img = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || '';
    let desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1] || '';
    const durM = html.match(/"duration"\s*:\s*"PT(\d+)M(\d+)S"/);
    const duration = durM ? `${durM[1]}:${String(durM[2]).padStart(2, '0')}` : '';
    const tags = [];
    const tagRe = /href="\/video\/([a-z]+)\/best-recently"[^>]*>\s*([^<]+)/g;
    let tm;
    while ((tm = tagRe.exec(html))) {
        const tn = tm[2].trim();
        if (tn && !tags.includes(tn)) tags.push(tn);
    }
    const date = html.match(/"uploadDate"\s*:\s*"([^"]+)"/)?.[1]?.slice(0, 10) || '';
    let updateTime = '';
    if (kind === 'video' || kind === 'av') {
        updateTime = html.match(/icons\.svg#time"[^>]*>\s*<\/use>\s*<\/svg>\s*更新于\s*([^<]+)/)?.[1]?.trim() || '';
    }
    let playUrl = '';
    if ((kind === 'video' || kind === 'av') && dataUrl) playUrl = `正片$${dataUrl}`;
    if (!playUrl) {
        const du = html.match(/data-url="([^"]+)"/);
        if (du) playUrl = `正片$${du[1]}`;
    }
    if (kind === 'melon') {
        const bodyM = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
        if (bodyM) {
            const body = stripTags(bodyM[1]).slice(0, 500);
            if (body) desc = desc || body;
        }
        if (!playUrl) {
            const melonPlay = await extractMelonPlay(html);
            if (melonPlay) playUrl = `正片$${melonPlay}`;
        }
    }
    const remarks = [duration, date].filter(Boolean).join(' ');
    const contentParts = [];
    if (desc) contentParts.push(desc);
    if (updateTime) contentParts.push(`更新时间：${updateTime}`);
    return {
        list: [
            {
                vod_id: `${kind}:${vid}`,
                vod_name: title || vid,
                vod_pic: proxyImg(img, inReq),
                type_name: tags.slice(0, 5).join(', '),
                vod_remarks: remarks,
                vod_content: contentParts.join(' | ') || title,
                vod_play_from: playUrl ? 'm3u8' : '',
                vod_play_url: playUrl,
            },
        ],
    };
}

async function search(inReq) {
    await ensureHost();
    const key = String(inReq.body.wd || '').trim();
    const pg = parseInt(inReq.body.page, 10) || 1;
    if (pg > 1 || !key) return { list: [], page: pg, pagecount: 1, limit: 24, total: 0 };
    let html = await req(`${host}/search/${encodeURIComponent(key)}`);
    html = html.replace(/<a[^>]*class="[^"]*(?:guess-item|hot-item)[^"]*"[^>]*>[\s\S]*?<\/a>/g, '');
    let vods = parseVideoList(html, inReq);
    if (vods.length) return { list: vods, page: 1, pagecount: 1, limit: 24, total: vods.length };
    const kw = key.toUpperCase();
    for (const section of ['release', 'watching', 'new', 'trending']) {
        for (let p = 1; p <= 2; p++) {
            const u = p === 1 ? `${host}/av/${section}` : `${host}/av/${section}/${p}`;
            const h = await req(u);
            const titleRe = /href="(\/av\/detail\/(\d+))"[^>]*>\s*<h3>([\s\S]*?)<\/h3>/g;
            let hit = false;
            let tm;
            while ((tm = titleRe.exec(h))) {
                if (stripTags(tm[3]).toUpperCase().includes(kw)) {
                    hit = true;
                    break;
                }
            }
            if (!hit) continue;
            vods = parseVideoList(h, inReq).filter((v) => String(v.vod_name || '').toUpperCase().includes(kw));
            if (vods.length) return { list: vods, page: 1, pagecount: 1, limit: 24, total: vods.length };
        }
    }
    return { list: [], page: 1, pagecount: 1, limit: 24, total: 0 };
}

async function play(inReq) {
    await ensureHost();
    let url = String(inReq.body.id || '');
    if (url.startsWith('/')) url = `${host}${url}`;
    return {
        parse: 0,
        url,
        header: { 'User-Agent': UA, Referer: `${host}/` },
    };
}

async function imgProxy(inReq, reply) {
    try {
        const raw = d64(inReq.query.url);
        if (!raw) return reply.code(404).send('');
        const resp = await axios.get(raw, {
            headers,
            timeout: 10000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        if (resp.status !== 200) return reply.code(404).send('');
        const img = decryptImage(Buffer.from(resp.data));
        reply.header('Content-Type', imageMime(img)).send(img);
    } catch {
        reply.code(404).send('');
    }
}

export default {
    meta: {
        key: 'dys18',
        name: '🔥抖阴',
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
