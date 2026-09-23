import axios from 'axios';
import https from 'https';
import { load } from 'cheerio';

const SITE = 'https://103.51.147.112:51120';
const IMG_CDN = 'https://vres.esadj.com';
const TG_GROUP = 'https://t.me/tvshare23';
const BRAND = '蝴蝶影视';

const HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: `${SITE}/`,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
};

const CLASSES = [
    { type_id: '1', type_name: '电影' },
    { type_id: '2', type_name: '连续剧' },
    { type_id: '3', type_name: '动漫' },
    { type_id: '4', type_name: '综艺纪录' },
    { type_id: '6', type_name: '短剧' },
];

const http = axios.create({
    timeout: 20000,
    validateStatus: () => true,
    headers: HEADERS,
});

function formatRemarks(meta = '') {
    const clean = String(meta || '').replace(/[\r\n\t]+/g, ' ').trim();
    return clean ? `${BRAND} | ${clean}` : BRAND;
}

function absPic(pic) {
    if (!pic) return '';
    const raw = String(pic).trim();
    if (raw.startsWith('http')) return raw;
    if (raw.startsWith('/')) return `${IMG_CDN}${raw}`;
    return raw;
}

function getVid(url) {
    if (!url) return '';
    const m1 = String(url).match(/\/detail\/(\d+)\.html/);
    if (m1) return m1[1];
    const m2 = String(url).match(/\/play\/(\d+)-/);
    if (m2) return m2[1];
    return '';
}

function cleanTitle(raw) {
    return String(raw || '')
        .split('-')[0]
        .replace(/[𝕜𝕜𝕪𝕤𝟘𝟙𝕔𝕠𝕞.\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function getHtml(url) {
    try {
        const resp = await http.get(url, { responseType: 'text' });
        if (resp.status >= 400) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function getCleanTitle($, item) {
    let title = '';
    item.find('.v-item-title').each((_, el) => {
        const elem = $(el);
        const style = elem.attr('style') || '';
        if (/display\s*:\s*none/i.test(style)) return;
        const t = elem.text().trim();
        if (t && !t.includes('kekys.com')) title = t;
    });
    return title;
}

function getCleanPic($, item) {
    let pic = '';
    item.find('img').each((_, el) => {
        const img = $(el);
        const src = img.attr('data-original') || img.attr('src') || '';
        if (src && !src.includes('placeholder') && !src.includes('logo_placeholder')) {
            pic = src;
        }
    });
    return absPic(pic);
}

function extractListItems(html, limit = 0) {
    const $ = load(html);
    const out = [];
    const seen = new Set();

    $('.module-item').each((_, element) => {
        const item = $(element);
        const href = item.find('.v-item').attr('href') || '';
        const vid = getVid(href);
        if (!vid || seen.has(vid)) return;
        seen.add(vid);

        const title = getCleanTitle($, item);
        const pic = getCleanPic($, item);
        const note = item.find('.v-item-bottom span').first().text().trim();

        if (title) {
            out.push({
                vod_id: vid,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: formatRemarks(note),
            });
        }
    });

    return limit > 0 ? out.slice(0, limit) : out;
}

function extractSearchItems(html) {
    const $ = load(html);
    const out = [];
    const seen = new Set();

    $('.search-result-item').each((_, element) => {
        const item = $(element);
        const href = item.attr('href') || '';
        const vid = getVid(href);
        if (!vid || seen.has(vid)) return;
        seen.add(vid);

        let title = item.find('.title').first().text().trim();
        if (!title) {
            const img = item.find('img').first();
            title = (img.attr('alt') || img.attr('title') || '').trim();
        }
        const pic = getCleanPic($, item);
        if (title) {
            out.push({
                vod_id: vid,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: BRAND,
            });
        }
    });
    return out;
}

function extractPlayLines(html) {
    const playFrom = [];
    const playUrl = [];
    const episodesBySid = {};
    const sidsInOrder = [];
    const seenSids = new Set();

    const patterns = [
        /<a[^>]+href="(\/play\/\d+-(\d+)-(\d+)\.html)"[^>]*class="episode-item"[^>]*>([\s\S]*?)<\/a>/gi,
        /<a[^>]+class="episode-item"[^>]+href="(\/play\/\d+-(\d+)-(\d+)\.html)"[^>]*>([\s\S]*?)<\/a>/gi,
    ];

    for (const re of patterns) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(html)) !== null) {
            const href = m[1];
            const sid = m[2];
            const text = m[4].replace(/<[^>]+>/g, '').trim();
            if (!text) continue;
            if (!episodesBySid[sid]) episodesBySid[sid] = [];
            episodesBySid[sid].push(`${text}$${href}`);
            if (!seenSids.has(sid)) {
                seenSids.add(sid);
                sidsInOrder.push(sid);
            }
        }
        if (sidsInOrder.length) break;
    }

    const sourceLabels = [];
    const labelRe = /class="source-item-label"[^>]*>([^<]+)</gi;
    let lm;
    while ((lm = labelRe.exec(html)) !== null) {
        const label = lm[1].trim();
        if (label) sourceLabels.push(label);
    }

    for (let i = 0; i < sidsInOrder.length; i += 1) {
        const sid = sidsInOrder[i];
        const eps = episodesBySid[sid];
        if (!eps?.length) continue;
        const lineName = sourceLabels[i] || `线路${sid}`;
        if (lineName === '4K') continue;
        playFrom.push(lineName);
        playUrl.push(eps.join('#'));
    }

    return { playFrom, playUrl };
}

function extractVideoUrl(html) {
    const patterns = [
        /src:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        /"url"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/i,
        /url\s*:\s*'([^']+\.(?:m3u8|mp4)[^']*)'/i,
    ];
    for (const pat of patterns) {
        const m = html.match(pat);
        if (m) return m[1].replace(/\\\//g, '/');
    }
    const all = [...html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/gi)];
    for (const m of all) {
        const u = m[0];
        if (/index\.m3u8|video\.m3u8|\.mp4/i.test(u)) return u;
    }
    return all[0]?.[0] || '';
}

async function init() {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await getHtml(`${SITE}/channel/1.html`);
    return {
        class: CLASSES,
        list: html ? extractListItems(html, 24) : [],
    };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '1');
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const html = await getHtml(`${SITE}/channel/${tid}.html?page=${pg}`);
    const list = html ? extractListItems(html) : [];
    return {
        list,
        page: pg,
        pagecount: list.length ? pg + 1 : pg,
        limit: list.length,
        total: list.length,
    };
}

async function detail(inReq, _outResp) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    vid = String(vid || '').trim();
    if (!vid) return { list: [] };

    const html = await getHtml(`${SITE}/detail/${vid}.html`);
    if (!html) return { list: [] };

    let title = html.match(/<title>(.+?)<\/title>/i)?.[1] || '';
    title = cleanTitle(title);

    let pic = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1] || '';
    pic = absPic(pic);

    const desc = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1]?.trim() || '';
    const { playFrom, playUrl } = extractPlayLines(html);

    return {
        list: [{
            vod_id: vid,
            vod_name: title || vid,
            vod_pic: pic,
            vod_remarks: BRAND,
            vod_actor: '🦋 TG群: @tvshare23',
            vod_director: '🦋 蝴蝶影视',
            vod_content: `【🔥 官方交流群: ${TG_GROUP}】\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${desc}`,
            vod_play_from: playFrom.length ? playFrom.join('$$$') : '',
            vod_play_url: playUrl.length ? playUrl.join('$$$') : '',
        }],
    };
}

async function search(inReq, _outResp) {
    const wd = String(inReq.body.wd || '').trim();
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    if (!wd) return { list: [], page: pg };

    let html = await getHtml(`${SITE}/search?k=${encodeURIComponent(wd)}`);
    const t = html.match(/name="t"\s+value="([^"]+)"/i)?.[1] || '';
    if (t) {
        let url = `${SITE}/search?k=${encodeURIComponent(wd)}&t=${encodeURIComponent(t)}`;
        if (pg > 1) url += `&page=${pg}`;
        html = await getHtml(url);
    }

    const list = html ? extractSearchItems(html) : [];
    return {
        list,
        page: pg,
        pagecount: list.length ? pg + 1 : pg,
        limit: list.length,
        total: list.length,
    };
}

async function play(inReq, _outResp) {
    let id = inReq.body.id;
    if (Array.isArray(id)) id = id[0];
    id = String(id || '').trim();
    if (!id) return { parse: 0, url: '', header: HEADERS };

    const playPage = id.startsWith('http') ? id : `${SITE}${id.startsWith('/') ? id : `/${id}`}`;
    const html = await getHtml(playPage);
    const videoUrl = extractVideoUrl(html);

    if (videoUrl) {
        return { parse: 0, url: videoUrl, header: HEADERS };
    }
    return { parse: 1, url: playPage, header: HEADERS };
}

export default {
    meta: {
        key: 'hudie',
        name: '🔥可可影视',
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
