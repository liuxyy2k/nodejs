import axios from 'axios';
import { load } from 'cheerio';

const SITE = 'https://hubff.com/';
const UA =
    'Mozilla/5.0 (Linux; Android 15; 2407FRK8EC Build/AP3A.240617.008; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36';

const HEADERS = {
    'User-Agent': UA,
    Origin: SITE,
    Referer: SITE,
};

const PLAY_HEADERS = {
    'User-Agent': UA,
    Referer: SITE,
    Origin: SITE.replace(/\/$/, ''),
};

const SKIP_CATS = new Set(['首頁', '網站首頁', '免費註冊', '會員登錄']);

function absUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    try {
        return new URL(url, SITE).href;
    } catch {
        return url;
    }
}

async function getHtml(url, hdr = HEADERS) {
    const resp = await axios.get(url, {
        headers: hdr,
        timeout: 22000,
        responseType: 'text',
        validateStatus: () => true,
    });
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function parseVideoList(html) {
    const $ = load(html);
    const videos = [];
    $('.list_box ul').each((_, el) => {
        const $ul = $(el);
        const link = $ul.find('a').attr('href') || '';
        if (!link || link.replace(/\/+$/, '') === SITE.replace(/\/+$/, '')) return;
        const title = $ul.find('.title').text().trim();
        if (title.includes('廣告') || title.includes('广告')) return;
        if (!link.includes('view.php')) return;

        const $img = $ul.find('img').first();
        const pic = $img.attr('img') || $img.attr('src') || '';
        const views = $ul.find('.intro .view').text().trim();
        const timeago = $ul.find('.intro .timeago').attr('title') || '';
        const pubTime = timeago.length >= 10 ? timeago.slice(5, 10) : $ul.find('.intro .time').text().trim();
        const remarks = views && pubTime ? `👁 ${views} | ${pubTime}` : views || pubTime;

        if (title && link) {
            videos.push({
                vod_id: absUrl(link),
                vod_name: title,
                vod_pic: absUrl(pic),
                vod_remarks: remarks,
            });
        }
    });
    return videos;
}

async function init() {
    return {};
}

async function home() {
    let classes = [];
    let list = [];
    try {
        const html = await getHtml(SITE);
        const $ = load(html);
        $('.dropdown-content a, #class a').each((_, el) => {
            const $a = $(el);
            const title = $a.text().trim();
            const href = $a.attr('href') || '';
            if (!title || !href || SKIP_CATS.has(title)) return;
            classes.push({
                type_name: title,
                type_id: href.replace(SITE, '').replace(/^\//, ''),
            });
        });
        list = parseVideoList(html);
    } catch (e) {
        console.log(`home error: ${e.message}`);
    }
    if (!classes.length) {
        classes = [
            { type_name: '最新', type_id: 'update.php?tags=latest' },
            { type_name: '热门', type_id: 'update.php?tags=hot' },
            { type_name: '国产', type_id: 'tag.php?tags=國產' },
        ];
    }
    return { class: classes, filters: {}, list };
}

async function category(inReq) {
    let tid = String(inReq.body.id || '');
    const pg = parseInt(inReq.body.page || 1, 10) || 1;
    let videos = [];
    try {
        if (!tid || tid === '首頁' || tid === '/') tid = 'update.php?tags=latest';
        let url = absUrl(tid);
        if (/page=\d+/.test(url)) url = url.replace(/page=\d+/, `page=${pg}`);
        else url += (url.includes('?') ? '&' : '?') + `page=${pg}`;
        videos = parseVideoList(await getHtml(url));
    } catch (e) {
        console.log(`category error: ${e.message}`);
    }
    return {
        list: videos,
        page: pg,
        pagecount: videos.length ? 9999 : pg,
        limit: videos.length,
        total: 999999,
    };
}

async function detail(inReq) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    vid = String(vid || '');
    try {
        const html = await getHtml(vid);
        const iframe = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        let playUrl = iframe ? iframe[1] : vid;
        if (playUrl && !/^https?:\/\//i.test(playUrl)) playUrl = absUrl(playUrl);

        const titleM = html.match(/<title>([^<]+)<\/title>/i);
        const title = titleM ? titleM[1].trim() : '未知';

        let imgM = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*poster/i);
        if (!imgM) imgM = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        const pic = imgM ? imgM[1] : '';

        return {
            list: [
                {
                    vod_id: vid,
                    vod_name: title,
                    vod_pic: absUrl(pic),
                    vod_remarks: '',
                    vod_content: vid,
                    vod_play_from: '飞鱼',
                    vod_play_url: `高清$${playUrl}`,
                },
            ],
        };
    } catch (e) {
        console.log(`detail error: ${e.message}`);
        return { list: [] };
    }
}

async function search(inReq) {
    const key = encodeURIComponent(String(inReq.body.wd || ''));
    const pg = parseInt(inReq.body.page || 1, 10) || 1;
    let videos = [];
    try {
        const url = `${SITE}tag.php?tags=${key}&page=${pg}`;
        videos = parseVideoList(await getHtml(url));
    } catch (e) {
        console.log(`search error: ${e.message}`);
    }
    return {
        list: videos,
        page: pg,
        pagecount: videos.length ? pg + 1 : pg,
    };
}

async function play(inReq) {
    const id = String(inReq.body.id || '');
    const sniff = { parse: 1, playUrl: '', url: id, header: PLAY_HEADERS };
    try {
        if (!/^https?:\/\//i.test(id)) return sniff;
        const html = await getHtml(id, { 'User-Agent': UA, Referer: SITE });
        const clean = html.replace(/<!--[\s\S]*?-->/g, '');
        const ali = clean.match(/source:\s*["']([^"']+)["']/i);
        if (!ali) return sniff;
        let realUrl = ali[1].trim();
        if (realUrl.startsWith('//')) realUrl = 'https:' + realUrl;
        return {
            parse: 0,
            playUrl: '',
            url: realUrl,
            header: PLAY_HEADERS,
        };
    } catch (e) {
        console.log(`play error: ${e.message}`);
        return sniff;
    }
}

export default {
    meta: {
        key: 'hubff',
        name: '🔥HubFF',
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
