import axios from 'axios';
import { load } from 'cheerio';

/**
 * 绅士漫画 - https://www.wnacg.com
 */

const site = 'https://www.wnacg.com';
const UA =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

const CLASSES = [
    { type_name: '同人/汉化', type_id: '1' },
    { type_name: '单行/汉化', type_id: '9' },
    { type_name: '短篇/汉化', type_id: '10' },
    { type_name: '韩漫/汉化', type_id: '20' },
    { type_name: 'Cosplay', type_id: '3' },
    { type_name: 'CG画集', type_id: '2' },
    { type_name: '3D漫画', type_id: '23' },
];

const http = axios.create({
    timeout: 15_000,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Connection: 'keep-alive',
        Cookie: 'age_verify=1; popup_agreement=1',
    },
});

function getHeader(url) {
    return {
        'User-Agent': UA,
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Connection: 'keep-alive',
        Cookie: 'age_verify=1; popup_agreement=1',
        Referer: url || `${site}/`,
    };
}

function absUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    return url.startsWith('/') ? site + url : `${site}/${url}`;
}

async function getHtml(url) {
    try {
        const resp = await http.get(url, { headers: getHeader(url), responseType: 'text' });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch (e) {
        console.log(`[wnacg] getHtml error: ${e.message}`);
        return '';
    }
}

function parseList(html, pg) {
    const $ = load(html);
    const box = $('.gallary_wrap').first().length ? $('.gallary_wrap').first() : $('#classify_container').first();
    const items = box.length ? box.find('li') : $('.gallary_item');

    const videos = [];
    items.each((_, el) => {
        const item = $(el);
        const a = item.find('a').first();
        if (!a.length) return;

        const href = a.attr('href') || '';
        if (href.includes('page-')) return;

        let title = a.attr('title') || a.text().trim();
        title = title.replace(/^\s*\[[^\]]+\]|\d{4}-\d{2}-\d{2}.*/, '').trim();

        const img = item.find('img').first();
        let pic = img.attr('src') || img.attr('data-src') || '';
        pic = absUrl(pic);

        const infoText = item.text();
        const countM = infoText.match(/(\d+)\s*[张張P]/);
        const count = countM ? `${countM[1]}P` : '';
        const dateM = infoText.match(/(\d{4}-\d{2}-\d{2})/);
        const remark = `${dateM?.[1] || ''} ${count}`.trim();

        videos.push({
            vod_id: href,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remark,
        });
    });

    return {
        list: videos,
        page: pg,
        pagecount: 999,
        limit: videos.length,
        total: 9999,
    };
}

function toGalleryUrl(vid) {
    let playUrl = String(vid || '').replace('index', 'gallery');
    if (!playUrl.startsWith('http')) playUrl = absUrl(playUrl);
    return playUrl;
}

function extractImages(html) {
    const normalized = html.replace(/\\\//g, '/');
    const imgList = [];
    const seen = new Set();
    const re = /((?:https?:|\/\/)[^"'\s<>\[\]{}]+?\.(?:jpg|png|webp|jpeg))/gi;

    for (const m of normalized.matchAll(re)) {
        let url = m[1].startsWith('//') ? `https:${m[1]}` : m[1];
        const low = url.toLowerCase();
        if (['logo', 'icon', 'avatar', 'banner', 'button'].some((x) => low.includes(x))) continue;
        if (low.includes('thumb')) {
            url = url.replace(/thumb_/gi, '').replace(/_thumb/gi, '');
        }
        if (!seen.has(url)) {
            seen.add(url);
            imgList.push(url);
        }
    }
    return imgList;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const url = `${site}/albums-index-page-1-cate-1.html`;
    const html = await getHtml(url);
    const { list } = html ? parseList(html, 1) : { list: [] };
    return { class: CLASSES, filters: {}, list };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '1');
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url = `${site}/albums-index-page-${pg}-cate-${tid}.html`;
    const html = await getHtml(url);
    if (!html) return { list: [], page: pg, pagecount: 999, limit: 0, total: 9999 };
    return parseList(html, pg);
}

async function detail(inReq, _outResp) {
    const vid = String(inReq.body.id || '');
    const url = vid.startsWith('/') ? site + vid : vid.startsWith('http') ? vid : absUrl(vid);

    try {
        const html = await getHtml(url);
        if (!html) throw new Error('empty html');

        const $ = load(html);
        const h = $('h2').first().length ? $('h2').first() : $('h1').first();
        const title = h.length ? h.text().trim() : '未知标题';

        const img = $('.pic_box img').first();
        let cover = img.attr('src') || '';
        cover = absUrl(cover);

        const playUrl = toGalleryUrl(vid);

        return {
            list: [
                {
                    vod_id: vid,
                    vod_name: title,
                    vod_pic: cover,
                    vod_type: '漫画',
                    vod_play_from: '绅士漫画',
                    vod_play_url: `全集$${playUrl}`,
                    vod_tag: 'image',
                },
            ],
        };
    } catch (e) {
        console.log(`[wnacg] detail error: ${e.message}`);
        return {
            list: [
                {
                    vod_id: vid,
                    vod_name: '加载失败',
                    vod_play_from: '绅士漫画',
                    vod_play_url: `全集$${url}`,
                },
            ],
        };
    }
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');

    if (id.startsWith('pics://')) {
        return { parse: 0, url: id, header: getHeader(id) };
    }

    const galleryUrl = id.startsWith('http') ? id : toGalleryUrl(id);

    try {
        const html = await getHtml(galleryUrl);
        const imgList = extractImages(html);

        if (!imgList.length) {
            return { parse: 0, url: '', msg: '未找到图片' };
        }

        return {
            parse: 0,
            url: `pics://${imgList.join('&&')}`,
            header: getHeader(galleryUrl),
        };
    } catch (e) {
        return { parse: 0, url: '', msg: `Err:${e.message}` };
    }
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
    const url = `${site}/search/?q=${encodeURIComponent(key)}&f=_all&s=create_time_DESC&p=${pg}`;
    const html = await getHtml(url);
    if (!html) return { list: [], page: pg, pagecount: 999, limit: 0, total: 9999 };
    return parseList(html, pg);
}

export default {
    meta: {
        key: 'wnacg',
        name: '绅士漫画',
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
