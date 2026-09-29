import axios from 'axios';
import { load } from 'cheerio';
import https from 'https';

/**
 * 887717 - https://887717.xyz
 * WordPress 分类 + video-block 列表 + 五层详情解析
 */

const site = 'https://887717.xyz';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FALLBACK_CLASSES = [
    { type_id: '91大神', type_name: '91' },
    { type_id: '国产自拍', type_name: '自拍' },
    { type_id: '探花', type_name: '探花' },
    { type_id: 'ribenyouma', type_name: '日韩' },
    { type_id: '自拍泄露', type_name: '网曝' },
    { type_id: '欧美中字', type_name: '欧美' },
    { type_id: '美女裸聊', type_name: '裸聊' },
    { type_id: '日本无码', type_name: '无码' },
    { type_id: 'fc2无码', type_name: 'FC2' },
];


const http = axios.create({
    timeout: 15_000,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        Referer: site,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
});

async function fetchHtml(url) {
    try {
        const resp = await http.get(url, { responseType: 'text' });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch (e) {
        console.log(`[887717] 请求失败: ${url} ${e.message}`);
        return '';
    }
}

function parseClasses(html) {
    const $ = load(html);
    const classes = [];
    const seen = new Set();

    $('#menu-main-menu li.menu-item-type-taxonomy').each((_, el) => {
        const a = $(el).find('a').first();
        const href = (a.attr('href') || '').trim();
        const title = (a.attr('title') || a.text().trim() || '').trim();
        if (!href || !title) return;

        const slug = decodeURIComponent(href.replace(/\/$/, '').split('/').pop() || '');
        if (slug && !seen.has(slug)) {
            seen.add(slug);
            classes.push({ type_id: slug, type_name: title });
        }
    });

    return classes.length ? classes : FALLBACK_CLASSES;
}

function toVid(href) {
    if (!href) return '';
    return href.startsWith(site) ? href.replace(site, '') : href;
}

function parseVideoBlocks(html, defaultRemark = '') {
    const $ = load(html);
    const videos = [];

    $('.video-block').each((_, el) => {
        const block = $(el);
        const aThumb = block.find('a.thumb').first();
        const aInfo = block.find('a.infos').first();
        const img = block.find('img.video-img').first();
        const views = block.find('.views-number').first();

        if (!aThumb.length || !aInfo.length) return;

        const href = aThumb.attr('href') || '';
        const name = (aInfo.attr('title') || aInfo.text().trim() || '').trim();
        const pic = img.attr('data-src') || img.attr('src') || '';
        const remark = views.text().trim() || defaultRemark;

        videos.push({
            vod_id: toVid(href),
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remark,
        });
    });

    return videos;
}

function detailUrl(vid) {
    if (vid.startsWith('http')) return vid;
    if (vid.startsWith('/')) return site + vid;
    return `${site}/${vid}`;
}

function extractPlayUrl(html) {
    if (!html) return '';

    let m = html.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)(?:\?[^\s"'<>]*)?)/i);
    if (m) return m[1];

    m = html.match(/<video[^>]+src=["']([^"']+)["']/i);
    if (m) return m[1];

    m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (m) return m[1];

    m = html.match(/(?:var|let|const)\s+(?:url|src|video_url|play_url)\s*=\s*["']([^"']+)["']/i);
    if (m) return m[1];

    m = html.match(/"url"\s*:\s*"([^"]+)"/);
    if (m) return m[1].replace(/\\\//g, '/');

    return '';
}

function isVideoFormat(url) {
    return ['.m3u8', '.mp4', '.flv', '.ts', '.mkv'].some((ext) => (url || '').toLowerCase().includes(ext));
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await fetchHtml(site);
    const classes = html ? parseClasses(html) : FALLBACK_CLASSES;
    return { class: classes, filters: {}, list: [] };
}

async function category(inReq, _outResp) {
    const tid = encodeURIComponent(String(inReq.body.id || ''));
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const pageStr = pg > 1 ? `page/${pg}/` : '';
    const url = `${site}/${tid}/${pageStr}`;

    const html = await fetchHtml(url);
    const videos = html ? parseVideoBlocks(html) : [];

    return {
        list: videos,
        page: pg,
        pagecount: 9999,
        limit: 24,
        total: 99999,
    };
}

async function detail(inReq, _outResp) {
    const vid = String(inReq.body.id || '');
    const html = await fetchHtml(detailUrl(vid));
    const playUrl = extractPlayUrl(html);

    return {
        list: [
            {
                vod_id: vid,
                vod_name: '视频详情',
                vod_play_from: '直链',
                vod_play_url: playUrl ? `第1集$${playUrl}` : '',
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    if (!id) return {};

    return {
        parse: isVideoFormat(id) ? 0 : 1,
        url: id,
        header: {
            'User-Agent': UA,
            Referer: site,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
    const url =
        pg > 1
            ? `${site}/page/${pg}/?s=${encodeURIComponent(key)}`
            : `${site}/?s=${encodeURIComponent(key)}`;

    const html = await fetchHtml(url);
    const videos = html ? parseVideoBlocks(html, '搜索') : [];

    return {
        list: videos,
        page: pg,
        pagecount: 9999,
        limit: 24,
        total: 99999,
    };
}

export default {
    meta: {
        key: '887717',
        name: '💋887717',
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
