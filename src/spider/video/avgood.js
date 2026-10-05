import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const DEFAULT_HOST = 'https://avgood.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const PREFIX = '/spider/avgood/3';
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const CATEGORIES = {
    '664': '在线视频',
    '665': '91精选',
    '511': '有码',
    '512': '无码',
    '513': '欧美',
    '804': '麻豆传媒',
    '673': '三级伦理',
    '675': '亚洲无码',
    '676': '亚洲有码',
    '682': '中文字幕',
    '760': '精品推荐',
    '761': '国产色情',
    '762': '主播直播',
    '766': '巨乳美乳',
    '767': '人妻熟女',
    '770': '萝莉少女',
    '776': '日本精品',
    '779': '台湾辣妹',
    '780': '韩国御姐',
    '743': '韩国精品',
    '723': '福利姬',
    '724': '主播大秀',
    '786': '91探花',
    '787': '网红流出',
    '704': '动漫',
    '679': '动漫卡通',
    '714': '美女写真',
    '520': '字幕',
    '521': '高清',
    '523': '特别福利',
};


let host = DEFAULT_HOST;

const http = axios.create({
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: () => true,
});

function headers() {
    return { 'User-Agent': UA, Referer: `${host}/` };
}

function abs(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    try {
        return new URL(url, `${host}/`).href;
    } catch {
        return url;
    }
}

function cleanHtml(s) {
    return String(s || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function get(url, extra = {}) {
    const opts = { headers: headers(), ...extra };
    try {
        const r = await http.get(url, opts);
        if (r.status >= 200 && r.status < 400) return r;
    } catch {}
    return http.get(url, { ...opts, proxy: false });
}

async function fetchHtml(url) {
    try {
        const r = await get(url);
        if (r.status < 200 || r.status >= 400) return '';
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch {
        return '';
    }
}

async function fetchFinalUrl(url) {
    try {
        const r = await get(url);
        return r.request?.res?.responseUrl || r.config?.url || url;
    } catch {
        return url;
    }
}

function requestOrigin(inReq) {
    const proto = String(inReq?.headers?.['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const reqHost = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host || `127.0.0.1:${process.env.DEV_HTTP_PORT || 9988}`;
    return `${proto}://${reqHost}`;
}

function rewritePlaylist(text, baseUrl) {
    const absLine = (u) => {
        try { return new URL(u, baseUrl).href; } catch { return u; }
    };
    return text.split('\n').map((line) => {
        if (line.includes('URI="')) {
            return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${absLine(uri)}"`);
        }
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) return absLine(trimmed);
        return line;
    }).join('\n');
}

async function resolveHost() {
    try {
        const r = await http.get(DEFAULT_HOST, { headers: headers(), maxRedirects: 5 });
        const finalUrl = r.request?.res?.responseUrl || r.config?.url || DEFAULT_HOST;
        if (finalUrl && finalUrl.replace(/\/$/, '') !== DEFAULT_HOST) {
            host = String(finalUrl).replace(/\/$/, '');
        }
    } catch {
        host = DEFAULT_HOST;
    }
}

function pagecount(html, currentPage = 1) {
    const m = html.match(/page-total">(\d+)</);
    if (m) return parseInt(m[1], 10);
    const pages = [...html.matchAll(/href="\/c\/\d+\/(\d+)\/"/g)].map((x) => parseInt(x[1], 10));
    let maxPage = currentPage;
    for (const n of pages) {
        if (!Number.isNaN(n) && n > maxPage) maxPage = n;
    }
    if (/class="page-btn page-next"/.test(html) && maxPage <= currentPage + 5) {
        maxPage = currentPage + 5;
    }
    return maxPage;
}

function parseItems(html) {
    const items = [];
    const seen = new Set();

    let m;
    const cardRe = /<a class="card" href="\/c\/(\d+)\.html">([\s\S]*?)<\/a>/g;
    while ((m = cardRe.exec(html)) !== null) {
        const vid = m[1];
        if (seen.has(vid)) continue;
        const block = m[2];
        const nm = block.match(/<h3 class="card-title">\s*<b>([\s\S]*?)<\/b>/);
        let name = nm ? cleanHtml(nm[1]) : '';
        if (!name || name.length > 100) continue;
        const cover = block.match(/data-original="([^"]+)"/);
        let pic = cover ? cover[1] : '';
        if (pic.startsWith('/')) pic = abs(pic);
        const tags = [...block.matchAll(/class="tag tag-category"[^>]*>([^<]*)</g)].map((x) => x[1].trim());
        let remark = tags.join(',');
        if (block.includes('今日新种')) remark = `${remark} 新种`.trim();
        const du = name.match(/\[(\d+:\d+)\]/);
        if (du) remark = `${remark} ${du[1]}`.trim();
        seen.add(vid);
        items.push({
            vod_id: vid,
            vod_name: name.slice(0, 50),
            vod_pic: pic,
            vod_remarks: remark,
        });
    }

    if (items.length) return items;

    const resultRe = /<div class="result-card">([\s\S]*?)<\/div>\s*<\/div>/g;
    while ((m = resultRe.exec(html)) !== null) {
        const block = m[1];
        const link = block.match(/href="\/c\/(\d+)\.html"/);
        if (!link) continue;
        const vid = link[1];
        if (seen.has(vid)) continue;
        const nm = block.match(/<h3 class="result-title">\s*<a[^>]*>([\s\S]*?)<\/a>/);
        let name = nm ? cleanHtml(nm[1]) : '';
        if (!name || name.length > 100) continue;
        const cover = block.match(/<img src="([^"]+)"/);
        let pic = cover ? cover[1] : '';
        if (pic.startsWith('/')) pic = abs(pic);
        const date = block.match(/result-date">([^<]*)</);
        const remark = date ? date[1].trim() : '';
        seen.add(vid);
        items.push({
            vod_id: vid,
            vod_name: name.slice(0, 50),
            vod_pic: pic,
            vod_remarks: remark,
        });
    }
    return items;
}

async function init(_inReq, _outResp) {
    await resolveHost();
    return {};
}

async function home(_inReq, _outResp) {
    const classes = Object.entries(CATEGORIES).map(([type_id, type_name]) => ({ type_id, type_name }));
    let list = [];
    try {
        const html = await fetchHtml(`${host}/c/664/`);
        list = parseItems(html);
    } catch {
        list = [];
    }
    return { class: classes, list };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '664');
    let pn = parseInt(inReq.body.page, 10) || 1;
    if (pn < 1) pn = 1;
    try {
        const url = pn <= 1 ? `${host}/c/${tid}/` : `${host}/c/${tid}/${pn}/`;
        const html = await fetchHtml(url);
        const list = parseItems(html);
        return {
            page: pn,
            pagecount: pagecount(html, pn),
            limit: 24,
            total: list.length,
            list,
        };
    } catch {
        return { page: pn, pagecount: 1, limit: 24, total: 0, list: [] };
    }
}

async function detail(inReq, _outResp) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0] || '';
    const idM = String(vid || '').match(/(\d+)/);
    vid = idM ? idM[1] : '';
    if (!vid) return { list: [] };

    const h = await fetchHtml(`${host}/c/${vid}.html`);
    if (!h) return { list: [] };

    const d = {
        vod_id: vid,
        vod_name: '',
        vod_pic: '',
        vod_year: '',
        vod_area: '',
        vod_class: '',
        vod_director: '',
        vod_actor: '',
        vod_content: '',
        vod_remarks: '',
        vod_play_from: '',
        vod_play_url: '',
    };

    const tn = h.match(/<title>(.*?)<\/title>/);
    if (tn) d.vod_name = tn[1].split('_')[0].trim();

    let p =
        h.match(/desc-img-box" href="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/i) ||
        h.match(/(?:data-original|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/i);
    if (!p) {
        const pp = h.match(/desc-img-box" href="([^"]+)"/);
        if (pp) p = pp;
    }
    if (p) d.vod_pic = p[1].startsWith('http') ? p[1] : abs(p[1]);

    const cm = h.match(/<span class="header">类别：<\/span>([^<]+)</);
    if (cm) d.vod_class = cm[1].trim();
    const rm = h.match(/<span class="header">时长：<\/span>([^<]+)</);
    if (rm) d.vod_remarks = rm[1].trim();

    const descM = h.match(/内容简介<\/h4>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
    if (descM) d.vod_content = cleanHtml(descM[1]).slice(0, 500);

    d.vod_play_from = 'avgood';
    d.vod_play_url = `在线播放$${abs(`/c/${vid}.html`)}`;

    const pid = h.match(/<iframe[^>]*class="video-iframe"[^>]*src="([^"]+)"/);
    if (!pid) {
        const mags = [...h.matchAll(/<a class="magnet-link"[^>]*href="(magnet:[^"]+)"[^>]*>\s*<span class="magnet-text">([^<]*)<\/span>/g)];
        if (mags.length) {
            const sizes = [...h.matchAll(/magnet-size">([^<]*)</g)].map((x) => x[1]);
            const froms = [];
            const urls = [];
            const parts = [];
            for (let i = 0; i < Math.min(mags.length, 10); i++) {
                let [url, name] = [mags[i][1], mags[i][2].trim()];
                let nm = name.replace(/[$#|]/g, ' ').slice(0, 30);
                if (nm.startsWith('magnet:')) {
                    const mh = url.match(/btih:([0-9A-Fa-f]{40})/);
                    nm = mh ? mh[1].slice(-8).toUpperCase() : nm.slice(0, 20);
                }
                if (i < sizes.length && sizes[i].trim()) nm += ` [${sizes[i].trim()}]`;
                if (url.includes('&dn=')) {
                    const [base, dn] = url.split('&dn=', 2);
                    url = `${base}&dn=${encodeURIComponent(dn)}`;
                }
                parts.push(`${nm}$${url}`);
            }
            froms.push('磁力');
            urls.push(parts.join('#'));
            const tr = h.match(/href="([^"]+\.torrent)"/);
            if (tr) {
                froms.push('种子');
                urls.push(`种子下载$${abs(tr[1])}`);
            }
            d.vod_play_from = froms.join('$$$');
            d.vod_play_url = urls.join('$$$');
        }
    }
    return { list: [d] };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    try {
        const html = await fetchHtml(`${host}/c/s/?q=${key}`);
        return { list: parseItems(html) };
    } catch {
        return { list: [] };
    }
}

async function resolvePlayUrl(input) {
    let url = String(input || '');
    if (!url) return '';
    if (url.startsWith('magnet:') || url.endsWith('.torrent')) return url;
    if (url.startsWith('http') && (/\.m3u8/i.test(url) || /\.mp4/i.test(url))) return url;

    const fullUrl = url.startsWith('http') ? url : abs(url.startsWith('/') ? url : `/${url}`);
    const h = await fetchHtml(fullUrl);
    if (!h) return '';

    const iframe = h.match(/<iframe\b[^>]*>/i);
    const pid = iframe && iframe[0].match(/\bsrc="([^"]+)"/i);
    if (!pid || !/video-iframe|remote_play|play/i.test(iframe[0] + pid[1])) return '';

    let src = pid[1];
    if (!src.startsWith('http')) src = abs(src);
    const playUrl = await fetchFinalUrl(src);

    const ph = await fetchHtml(playUrl);
    if (!ph) return '';

    const ajaxM = ph.match(/ajax_url\s*=\s*([^\s;]+)/);
    if (!ajaxM) return '';

    let ajax = ajaxM[1].trim().replace(/^['"]|['"]$/g, '');
    if (!ajax.startsWith('http')) ajax = abs(ajax);

    try {
        const r = await get(ajax, { headers: { ...headers(), Referer: playUrl } });
        const obj = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
        let link = obj.playlink || '';
        if (!link) return '';
        link = link.replace(/\\\//g, '/');
        if (link.startsWith('/')) link = abs(link);
        return link;
    } catch {
        return '';
    }
}

async function play(inReq, _outResp) {
    const url = String(inReq.body.id || inReq.body.flag || '');
    if (url.startsWith('magnet:') || url.endsWith('.torrent')) {
        return { parse: 0, url, header: headers() };
    }
    const playUrl = await resolvePlayUrl(url);
    if (/\.m3u8/i.test(playUrl)) {
        return {
            parse: 0,
            url: `${requestOrigin(inReq)}${PREFIX}/proxy.m3u8?url=${encodeURIComponent(playUrl)}`,
            header: headers(),
        };
    }
    return {
        parse: playUrl && /\.mp4/i.test(playUrl) ? 0 : 1,
        url: playUrl,
        header: headers(),
    };
}

async function m3u8Proxy(inReq, reply) {
    const target = String(inReq.query.url || '');
    if (!target) return reply.code(404).type('text/plain').send('');
    try {
        const r = await get(target, { headers: headers(), responseType: 'text' });
        const text = typeof r.data === 'string' ? r.data : String(r.data || '');
        if (r.status < 200 || r.status >= 400 || !text.includes('#EXTM3U')) {
            return reply.code(502).type('text/plain').send('');
        }
        return reply
            .type('application/vnd.apple.mpegurl')
            .header('Cache-Control', 'no-cache')
            .send(rewritePlaylist(text, target));
    } catch {
        return reply.code(502).type('text/plain').send('');
    }
}

export default {
    meta: {
        key: 'avgood',
        name: '🌸AVGood',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy.m3u8', m3u8Proxy);
    },
};
