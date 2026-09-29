import axios from 'axios';
import { load } from 'cheerio';

const DEFAULT_SITE = 'https://jlj.xbsp6.boats';
const PUBLISH_PAGE = 'https://ruv.xxkk7.com/323/';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let siteUrl = DEFAULT_SITE;
let siteChecked = false;

function headers() {
    return {
        'User-Agent': UA,
        Referer: siteUrl.endsWith('/') ? siteUrl : siteUrl + '/',
    };
}

async function checkSiteAvailable(url) {
    try {
        const resp = await axios.head(url, {
            headers: headers(),
            timeout: 3000,
            maxRedirects: 5,
            validateStatus: () => true,
        });
        return resp.status === 200;
    } catch {
        return false;
    }
}

async function getLatestSiteUrl() {
    try {
        const resp = await axios.get(PUBLISH_PAGE, {
            headers: headers(),
            timeout: 10000,
            responseType: 'text',
            validateStatus: () => true,
        });
        const html = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        const sub = html.match(/sub_domain\s*=\s*['"]([^'"]+)['"]/);
        const prefix = html.match(/prefix\s*=\s*['"]([^'"]+)['"]/);
        const suffix = html.match(/suffix\s*=\s*['"]([^'"]+)['"]/);
        if (sub && prefix && suffix) {
            siteUrl = `https://${sub[1]}.${prefix[1]}.${suffix[1]}`.replace(/\/+$/, '');
        }
    } catch (e) {
        console.log('xingba get_latest_site_url:', e.message);
    }
}

async function ensureSite() {
    if (siteChecked) return;
    if (!(await checkSiteAvailable(siteUrl))) {
        await getLatestSiteUrl();
    }
    siteChecked = true;
}

async function getHtml(url) {
    const resp = await axios.get(url, {
        headers: headers(),
        timeout: 10000,
        responseType: 'text',
        validateStatus: () => true,
    });
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function parseItems(html, baseUrl = '') {
    const $ = load(html);
    const videos = [];
    $('#posts article').each((_, el) => {
        const $el = $(el);
        const title = $el.find('h2').text().trim();
        let href = $el.find('a').attr('href') || '';
        const img = $el.find('img').attr('data-src') || $el.find('img').attr('src') || '';
        const remark = $el.find('.meta-content').text().trim();
        if (!title && !href) return;
        if (href && !/^https?:\/\//i.test(href)) {
            href = baseUrl + (href.startsWith('/') ? '' : '/') + href;
        }
        videos.push({
            vod_id: href,
            vod_name: title,
            vod_pic: img,
            vod_remarks: remark,
        });
    });
    return videos;
}

async function init() {
    siteChecked = false;
    siteUrl = DEFAULT_SITE;
    await ensureSite();
    return {};
}

async function home() {
    await ensureSite();
    const classes = [
        { type_id: '20', type_name: '熟母少妇' },
        { type_id: '21', type_name: '网红直播' },
        { type_id: '22', type_name: '自拍偷拍' },
        { type_id: '23', type_name: '强奸乱伦' },
        { type_id: '24', type_name: '高清国产' },
        { type_id: '25', type_name: '韩国专区' },
        { type_id: '26', type_name: '日本有码' },
        { type_id: '27', type_name: '日本无码' },
        { type_id: '28', type_name: '欧美情色' },
        { type_id: '29', type_name: '动漫卡通' },
        { type_id: '30', type_name: '三级伦理' },
    ];
    let list = [];
    try {
        list = parseItems(await getHtml(`${siteUrl}/xbsp/`), siteUrl);
    } catch (e) {
        console.log('xingba home:', e.message);
    }
    return { class: classes, list };
}

async function category(inReq) {
    await ensureSite();
    const tid = inReq.body.id;
    const pg = String(inReq.body.page || 1);
    let videos = [];
    try {
        videos = parseItems(await getHtml(`${siteUrl}/vodtype/${tid}-${pg}.html`), siteUrl);
    } catch (e) {
        console.log('xingba category:', e.message);
    }
    return {
        list: videos,
        page: pg,
        pagecount: 9999,
        limit: 20,
        total: 9999,
    };
}

async function detail(inReq) {
    let url = inReq.body.id;
    if (Array.isArray(url)) url = url[0];
    url = String(url || '');
    return {
        list: [
            {
                vod_id: url,
                vod_name: '在线播放',
                type_name: '福利',
                vod_play_from: '杏吧播放',
                vod_play_url: `正片$${url}`,
            },
        ],
    };
}

async function search(inReq) {
    await ensureSite();
    const key = encodeURIComponent(String(inReq.body.wd || ''));
    const pg = String(inReq.body.page || 1);
    let videos = [];
    try {
        videos = parseItems(await getHtml(`${siteUrl}/s/${key}/page/${pg}.html`), siteUrl);
    } catch (e) {
        console.log('xingba search:', e.message);
    }
    return { list: videos, page: parseInt(pg, 10) || 1 };
}

async function play(inReq) {
    await ensureSite();
    let playUrl = String(inReq.body.id || '');
    try {
        const html = await getHtml(playUrl);
        const raw = html.match(/const\s+rawUrl\s*=\s*['"]([^'"]+\.m3u8[^'"]*)['"]/);
        if (raw) {
            playUrl = raw[1];
        } else {
            const m3u8 = html.match(/https?:\/\/[^\s$#'"]+\.m3u8(?:\?[^\s#'"]*)?/i);
            if (m3u8) playUrl = m3u8[0];
        }
    } catch (e) {
        console.log('xingba play:', e.message);
    }
    return {
        parse: 0,
        url: playUrl,
        header: headers(),
    };
}

export default {
    meta: {
        key: 'xingba',
        name: '💋杏吧视频',
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
