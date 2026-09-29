import axios from 'axios';
import https from 'https';
import { load } from 'cheerio';

/**
 * owoav高清 - 多镜像自动探测 · folder 分类结构
 */

const PRESET_URLS = [
    'https://600kk.net',
    'https://owo1.cc',
    'https://owo2.cc',
    'https://owo3.cc',
    'https://owo4.cc',
    'https://ozzez.com',
    'https://owoav.com',
];

const PUBLISH_URL = 'https://www.owodz.com';
const PROTECTED_LINE_NAME = '\u98de\u9c7c\u9ad8\u6e05';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';


let siteUrl = PRESET_URLS[0];
let urlChecked = false;

const http = axios.create({
    timeout: 8000,
    validateStatus: () => true,
});

function getHeaders(referer) {
    return {
        'User-Agent': UA,
        Referer: referer || siteUrl,
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
}

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

async function fetchHtml(url, timeout = 8000) {
    try {
        const resp = await http.get(url, {
            headers: getHeaders(),
            responseType: 'text',
            timeout,
        });
        if (resp.status === 200) {
            return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        }
    } catch {
        /* ignore */
    }
    return '';
}

async function updateSiteUrl() {
    if (urlChecked) return;

    for (const url of PRESET_URLS) {
        const html = await fetchHtml(`${url}/`, 3000);
        if (html) {
            siteUrl = url.replace(/\/$/, '');
            urlChecked = true;
            return;
        }
    }

    const html = await fetchHtml(PUBLISH_URL, 5000);
    if (html) {
        const $ = load(html);
        let links = $('.m-listD-item.type3 a').toArray();
        if (!links.length) links = $('a').toArray();

        for (const el of links) {
            const href = String($(el).attr('href') || '').trim();
            if (
                !href.startsWith('http') ||
                ['github', 't.me', 'ymd168', 'mailto', 'owodz'].some((k) => href.includes(k))
            ) {
                continue;
            }

            try {
                const parsed = new URL(href);
                const origin = `${parsed.protocol}//${parsed.host}`;
                if (href.includes('owo')) {
                    siteUrl = origin;
                    break;
                }
                if (siteUrl === PRESET_URLS[0]) siteUrl = origin;
            } catch {
                /* skip */
            }
        }
    }

    urlChecked = true;
}

function verifyLineIntegrity(lineStr) {
    return String(lineStr).trim() === PROTECTED_LINE_NAME;
}

function formatSquarePic(imgSrc) {
    if (!imgSrc) return '';
    let src = imgSrc.replace(/size=\d+x\d+/g, 'size=max');
    if (src.includes('?')) return `${src}&style=fit&aspect=contain`;
    return `${src}?style=fit&aspect=contain`;
}

function fixUrl(href) {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return `https:${href}`;
    return new URL(href, `${siteUrl}/`).href;
}

function extractCountOnly($, item) {
    const cameraLi = item.find('.thumb-spot__data li i[class*="icon-camera"]').parent();
    if (cameraLi.length) {
        const m = cameraLi.text().match(/(\d+)/);
        if (m) return `${m[1]}个视频`;
    }

    const selectors = [
        '.videos-count', '.video-count', '.videos', '.count', '.v-count',
        '.item-videos', '.badge', '.num', '.info', '.sub-title',
    ];
    for (const sel of selectors) {
        const node = item.find(sel).first();
        if (node.length) {
            const txt = node.text().replace(/\d{1,2}:\d{2}(?::\d{2})?/g, '').trim();
            const m = txt.match(/(\d+)/);
            if (m) return `${m[1]}个视频`;
        }
    }

    for (const attr of ['data-videos', 'data-count', 'data-total', 'videos']) {
        const val = item.attr(attr);
        if (val && /^\d+$/.test(String(val))) return `${val}个视频`;
    }

    const firstLi = item.find('.thumb-spot__data li').first();
    if (firstLi.length) {
        const m = firstLi.text().match(/(\d+)/);
        if (m) return `${m[1]}个视频`;
    }

    const itemHtml = item.html() || '';
    const mHtml = itemHtml.match(/(\d+)\s*(?:个视频|videos|视频)/i);
    if (mHtml) return `${mHtml[1]}个视频`;

    const nodeTxt = item.text().replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' ');
    const mBracket = nodeTxt.match(/[\(（]\s*(\d+)\s*[\)）]/);
    if (mBracket) return `${mBracket[1]}个视频`;

    return '';
}

function extractDurationOnly($, item) {
    const selectors = ['.duration', '.time', '.thumb-spot__data li', '.label-duration'];
    for (const sel of selectors) {
        const node = item.find(sel).first();
        if (node.length) {
            const m = node.text().match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
            if (m) return m[1];
        }
    }
    const m = item.text().match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
    return m ? m[1] : '';
}

function isSquareUrl(rawUrl) {
    return ['/models/', '/categories/', '/channels/', '/tags/'].some((k) => rawUrl.includes(k));
}

function isFolderUrl(rawUrl) {
    return (
        !rawUrl.includes('/video/') &&
        !rawUrl.includes('/v/') &&
        isSquareUrl(rawUrl) &&
        rawUrl.split('/').filter(Boolean).length <= 5
    );
}

function squareStyle() {
    return {
        style: { type: 'rect', ratio: 1.0, crop: false },
        pic_style: { type: 'rect', ratio: 1.0, fill: 'fit' },
    };
}

function getItemTitle($, item, aTag) {
    let title = String(aTag.attr('title') || '').trim();
    if (!title) {
        const titleNode = item.find('.thumb-spot__title, .title, .name').first();
        if (titleNode.length) title = titleNode.text().trim();
    }
    if (title) title = title.replace(/[\(（\s]*\d+[\)）\s]*$/, '').trim();
    return title;
}

function getItemPic(item) {
    const imgTag = item.find('img').first();
    if (!imgTag.length) return '';
    const imgSrc = imgTag.attr('data-original') || imgTag.attr('data-src') || imgTag.attr('src') || '';
    if (imgSrc.startsWith('//')) return `https:${imgSrc}`;
    return imgSrc;
}

function selectItems($) {
    const selectors = [
        '.thumbs__list .item', '.thumbs__list .thumb', '.thumbs-models .item',
        '.thumbs-categories .item', '.thumbs-categories .thumb',
        '.list-categories .item', '.categories-list .item',
    ];
    for (const sel of selectors) {
        const items = $(sel);
        if (items.length) return items;
    }
    return $();
}

function parseTagContainer($, page, isCategories, isSecondLayer) {
    const videos = [];
    const tagNodes = $('.list-tags a, .models-list a, .categories-list a, .thumbs-models a').toArray();

    for (const el of tagNodes) {
        const aTag = $(el);
        const href = String(aTag.attr('href') || '').trim();
        if (!href) continue;

        const rawUrl = fixUrl(href);
        const fullText = aTag.text().trim();
        const numMatch = fullText.match(/[\(（\s]*(\d+)[\)）\s]*$/);
        let title;
        let remarks;
        if (numMatch) {
            title = fullText.replace(/[\(（\s]*\d+[\)）\s]*$/, '').trim();
            remarks = `${numMatch[1]}个视频`;
        } else {
            title = fullText;
            remarks = '进入查看';
        }
        if (!title) continue;

        const vItem = {
            vod_id: `folder_${rawUrl}`,
            vod_name: title,
            vod_pic: '',
            vod_remarks: remarks,
            vod_tag: 'folder',
        };
        if (isSquareUrl(rawUrl)) Object.assign(vItem, squareStyle());
        videos.push(vItem);
    }

    const result = {
        list: videos,
        page,
        pagecount: isCategories ? 1 : videos.length >= 12 ? page + 1 : page,
        limit: videos.length,
        total: isCategories ? videos.length : 9999,
    };

    if (isSecondLayer) {
        result.filter = false;
        result.filters = {};
    }

    return result;
}

function parseItemsList($, items, isCategories, page, isSecondLayer) {
    const videos = [];

    items.each((_, el) => {
        const item = $(el);
        const aTag = item.find('a').first();
        if (!aTag.length) return;

        const href = String(aTag.attr('href') || '').trim();
        if (!href) return;

        const rawUrl = fixUrl(href);
        const title = getItemTitle($, item, aTag);
        const imgSrc = getItemPic(item);
        const square = isSquareUrl(rawUrl);

        if (isFolderUrl(rawUrl)) {
            const vodDict = {
                vod_id: `folder_${rawUrl}`,
                vod_name: title || '目录',
                vod_pic: square ? formatSquarePic(imgSrc) : imgSrc,
                vod_remarks: extractCountOnly($, item) || '进入查看',
                vod_tag: 'folder',
            };
            if (square) Object.assign(vodDict, squareStyle());
            videos.push(vodDict);
        } else {
            videos.push({
                vod_id: rawUrl,
                vod_name: title || '视频',
                vod_pic: imgSrc,
                vod_remarks: extractDurationOnly($, item),
            });
        }
    });

    const result = {
        list: videos,
        page,
        pagecount: isCategories ? 1 : videos.length >= 12 ? page + 1 : page,
        limit: videos.length,
        total: isCategories ? videos.length : 9999,
    };

    if (isSecondLayer) {
        result.filter = false;
        result.filters = {};
    }

    return result;
}

function buildCategoryUrl(tid, page, extend) {
    let pureTid = String(tid).trim();
    while (pureTid.startsWith('folder_')) pureTid = pureTid.slice(7);

    const cleanTidPath = pureTid.replace(/^\/+|\/+$/g, '');
    const isSecondLayer = pureTid.startsWith('http');
    const ext = isSecondLayer ? {} : parseExtend(extend);

    const isCategories = cleanTidPath === 'categories' || cleanTidPath.endsWith('/categories');
    const isVideosCat = cleanTidPath === 'videos';
    const isModelsFirstLayer = pureTid === 'cate_models_root' || pureTid === 'models';

    if (page > 1 && isCategories) {
        return { skip: true, isCategories, isSecondLayer };
    }

    if (isSecondLayer) {
        const baseUrl = pureTid.replace(/\/$/, '');
        return {
            url: page > 1 ? `${baseUrl}/${page}/` : `${baseUrl}/`,
            isCategories,
            isSecondLayer,
        };
    }

    if (isVideosCat) {
        const byParam = (ext.by || 'post_date').trim();
        const paramStr = byParam ? `?by=${byParam}` : '';
        const url = page > 1
            ? `${siteUrl}/${cleanTidPath}/${page}/${paramStr}`
            : `${siteUrl}/${cleanTidPath}/${paramStr}`;
        return { url, isCategories, isSecondLayer };
    }

    if (isModelsFirstLayer) {
        const byParam = (ext.by || '').trim();
        const paramStr = byParam ? `?by=${byParam}` : '';
        const url = page > 1
            ? `${siteUrl}/models/${page}/${paramStr}`
            : `${siteUrl}/models/${paramStr}`;
        return { url, isCategories, isSecondLayer };
    }

    let baseUrl = `${siteUrl}/${cleanTidPath}`;
    let url;
    if (page === 1) {
        url = `${baseUrl}/`;
    } else {
        const parts = baseUrl.split('/');
        const rootTypes = ['tags', 'models', 'categories', 'channels', 'videos'];
        if (parts[parts.length - 1]?.match(/^\d+$/) && parts.length > 4 && !rootTypes.includes(parts[parts.length - 2])) {
            parts.pop();
            baseUrl = parts.join('/');
        }
        url = `${baseUrl}/${page}/`;
    }

    return { url, isCategories, isSecondLayer };
}

async function init(_inReq, _outResp) {
    urlChecked = false;
    await updateSiteUrl();
    return {};
}

async function home(_inReq, _outResp) {
    await updateSiteUrl();

    const classes = [
        { type_name: '视频', type_id: 'videos' },
        { type_name: '女优', type_id: 'cate_models_root' },
        { type_name: '分类', type_id: 'folder_categories' },
        { type_name: '频道', type_id: 'folder_channels' },
        { type_name: '标签', type_id: 'folder_tags' },
    ];

    const filters = {
        videos: [{
            key: 'by', name: '排序',
            value: [
                { n: '最新', v: 'post_date' },
                { n: '热门', v: 'video_viewed' },
                { n: '最受欢迎', v: 'rating' },
                { n: '最长', v: 'duration' },
            ],
        }],
        cate_models_root: [{
            key: 'by', name: '排序',
            value: [
                { n: '默认', v: 'model_viewed' },
                { n: '按字母排序', v: 'title' },
                { n: '评分最高', v: 'rating' },
                { n: '观看最多', v: 'model_viewed' },
                { n: '评论最多', v: 'comments_count' },
                { n: '收藏最多', v: 'subscribers_count' },
            ],
        }],
    };

    const cat = await category({ body: { id: 'videos', page: 1 } }, null);
    return { class: classes, filters, list: cat.list || [] };
}

async function category(inReq, _outResp) {
    await updateSiteUrl();

    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    let tid = String(inReq.body.id || 'videos');
    if (tid.startsWith('folder_')) tid = tid.slice(7);

    const built = buildCategoryUrl(tid, page, inReq.body.extend);
    if (built.skip) {
        return { list: [], page, pagecount: 1, limit: 0, total: 0 };
    }

    const html = await fetchHtml(built.url);
    if (!html) {
        return { list: [], page, pagecount: 1, limit: 0, total: 0 };
    }

    const $ = load(html);
    const tagsContainer = $('.list-tags, .models-list, .categories-list, .thumbs-models').first();
    const items = selectItems($);

    if (tagsContainer.length && !items.length) {
        return parseTagContainer($, page, built.isCategories, built.isSecondLayer);
    }

    return parseItemsList($, items, built.isCategories, page, built.isSecondLayer);
}

async function detail(inReq, _outResp) {
    await updateSiteUrl();

    if (!verifyLineIntegrity(PROTECTED_LINE_NAME)) {
        return { list: [] };
    }

    let cleanUrl = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '').trim();
    while (cleanUrl.startsWith('folder_')) cleanUrl = cleanUrl.slice(7);

    const url = cleanUrl.startsWith('http') ? cleanUrl : fixUrl(cleanUrl);
    const html = await fetchHtml(url);
    if (!html) return { list: [] };

    const $ = load(html);
    let title = ($('h1.title').first().text() || $('h1').first().text() || '视频详情').trim();

    let pic = '';
    const matchPic = html.match(/preview_url\s*:\s*'([^']+)'/);
    if (matchPic) {
        pic = matchPic[1].replace(/\\\//g, '/');
    } else {
        pic = $('.player-holder img').attr('src') || $('meta[property="og:image"]').attr('content') || '';
    }

    let desc = String(
        $('.media-desc .media-info__desc').first().text() ||
        $('.description').first().text() ||
        $('meta[name="description"]').attr('content') ||
        '',
    ).trim();

    const actorList = [];
    const matchModels = html.match(/video_models\s*:\s*'([^']+)'/);
    if (matchModels?.[1]?.trim()) {
        actorList.push(...matchModels[1].split(',').map((m) => m.trim()).filter(Boolean));
    }
    if (!actorList.length) {
        $('.media-model .media-box__title, .media-models a[href*="/models/"]').each((_, el) => {
            const name = $(el).text().trim();
            if (name && name !== '查看资料' && !actorList.includes(name)) actorList.push(name);
        });
    }

    const typeList = [];
    const matchCate = html.match(/video_categories\s*:\s*'([^']+)'/);
    if (matchCate?.[1]?.trim()) {
        typeList.push(...matchCate[1].split(',').map((c) => c.trim()).filter(Boolean));
    }
    if (!typeList.length) {
        $('.media-info__lists-row').each((_, row) => {
            if ($(row).find('.media-info__label').first().text().includes('分类')) {
                $(row).find('.media-info__buttons a').each((__, a) => {
                    const catText = $(a).text().trim();
                    if (catText && !typeList.includes(catText)) typeList.push(catText);
                });
            }
        });
    }

    const tagList = [];
    const matchTags = html.match(/video_tags\s*:\s*'([^']+)'/);
    if (matchTags?.[1]?.trim()) {
        tagList.push(...matchTags[1].split(',').map((t) => t.trim()).filter(Boolean));
    }
    if (!tagList.length) {
        $('.media-info__lists-row').each((_, row) => {
            if ($(row).find('.media-info__label').first().text().includes('标签')) {
                $(row).find('.media-info__buttons a').each((__, a) => {
                    const tagText = $(a).text().trim();
                    if (tagText && !tagList.includes(tagText)) tagList.push(tagText);
                });
            }
        });
    }
    if (!tagList.length) {
        $('meta[property="video:tag"]').each((_, meta) => {
            const tagContent = $(meta).attr('content')?.trim();
            if (tagContent && !tagList.includes(tagContent)) tagList.push(tagContent);
        });
    }

    const rawTypeStr = typeList.join(' ');
    const rawTagStr = tagList.join(' ');
    let combinedType = '未知';
    if (rawTypeStr && rawTagStr) combinedType = `${rawTypeStr} / ${rawTagStr}`;
    else if (rawTagStr) combinedType = rawTagStr;
    else if (rawTypeStr) combinedType = rawTypeStr;

    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            type_name: combinedType,
            vod_class: combinedType,
            vod_actor: actorList.join(' '),
            vod_content: desc,
            vod_play_from: PROTECTED_LINE_NAME,
            vod_play_url: `正片$${url}`,
        }],
    };
}

async function play(inReq, _outResp) {
    await updateSiteUrl();

    let cleanId = String(inReq.body.id || '').trim();
    while (cleanId.startsWith('folder_')) cleanId = cleanId.slice(7);

    const pageUrl = cleanId.startsWith('http') ? cleanId : fixUrl(cleanId);
    let playUrl = '';

    if (pageUrl.includes('/video/')) {
        const html = await fetchHtml(pageUrl);
        if (html) {
            const matchUrl = html.match(/video_url\s*:\s*['"]([^'"]+)['"]/);
            if (matchUrl) {
                playUrl = matchUrl[1];
            } else {
                const $ = load(html);
                const sourceTag = $('video source').first().length
                    ? $('video source').first()
                    : $('#download_list a[href*="get_file"]').first();
                playUrl = sourceTag.attr('src') || sourceTag.attr('href') || '';
            }
        }
    } else if (pageUrl.includes('.mp4') || pageUrl.includes('.m3u8')) {
        playUrl = pageUrl;
    }

    if (playUrl) {
        playUrl = playUrl.replace(/\\\//g, '/').replace(/\\/g, '').trim();
        if (playUrl.startsWith('//')) playUrl = `https:${playUrl}`;
        else if (!playUrl.startsWith('http')) playUrl = fixUrl(playUrl);
    }

    let refererDomain = siteUrl;
    try {
        const parsed = new URL(pageUrl);
        if (parsed.host) refererDomain = `${parsed.protocol}//${parsed.host}`;
    } catch {
        /* keep */
    }

    return {
        parse: 0,
        url: playUrl || pageUrl,
        header: { 'User-Agent': UA, Referer: refererDomain },
    };
}

async function search(inReq, _outResp) {
    await updateSiteUrl();

    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    if (!key) return { list: [], page: 1, pagecount: 1 };

    const encodedKey = encodeURIComponent(key);
    const url = page > 1
        ? `${siteUrl}/search/${encodedKey}/${page}/`
        : `${siteUrl}/search/${encodedKey}/`;

    const html = await fetchHtml(url);
    if (!html) return { list: [], page, pagecount: 1 };

    const $ = load(html);
    const items = selectItems($);
    const videos = [];

    items.each((_, el) => {
        const item = $(el);
        const aTag = item.find('a').first();
        if (!aTag.length) return;

        const href = String(aTag.attr('href') || '').trim();
        if (!href) return;

        const vodId = fixUrl(href);
        let title = String(aTag.attr('title') || '').trim();
        if (!title) {
            title = item.find('.thumb-spot__title, .title, .name').first().text().trim() || aTag.text().trim();
        }

        const imgSrc = getItemPic(item);
        const folder = isFolderUrl(vodId) || (isSquareUrl(vodId) && !vodId.includes('/video/'));
        const square = isSquareUrl(vodId);

        const itemDict = {
            vod_id: folder ? `folder_${vodId}` : vodId,
            vod_name: title || key,
            vod_pic: square ? formatSquarePic(imgSrc) : imgSrc,
            vod_remarks: folder ? extractCountOnly($, item) || '进入查看' : extractDurationOnly($, item),
        };

        if (folder) {
            itemDict.vod_tag = 'folder';
            if (square) Object.assign(itemDict, squareStyle());
        }

        videos.push(itemDict);
    });

    if (!videos.length) {
        for (const [, href, inner] of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
            if (!['/video/', '/models/', '/categories/', '/channels/', '/tags/'].some((k) => href.includes(k))) continue;
            const fullUrl = fixUrl(href);
            const cleanInner = inner.replace(/<[^>]+>/g, '').trim();
            if (!cleanInner) continue;

            const folder = !fullUrl.includes('/video/');
            const square = isSquareUrl(fullUrl);
            const itemDict = {
                vod_id: folder ? `folder_${fullUrl}` : fullUrl,
                vod_name: cleanInner,
                vod_pic: '',
                vod_remarks: folder ? '进入查看' : '',
            };
            if (folder) {
                itemDict.vod_tag = 'folder';
                if (square) Object.assign(itemDict, squareStyle());
            }
            videos.push(itemDict);
        }
    }

    return { list: videos, page, pagecount: videos.length >= 10 ? page + 1 : page };
}

export default {
    meta: { key: 'owoav', name: '💎owoav高清', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
