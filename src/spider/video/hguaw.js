import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const site = 'https://www.hguaw.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, Referer: `${site}/`, ...headers },
        timeout: 25000,
        maxRedirects: 5,
    });
    return resp.data;
}

/**
 * 列表卡片：
 *   <article class="card">
 *     <a class="card-cover-link" href="/archives/1002350/">
 *       <picture><source srcset="...650x225.webp"><img src="https://img...jpg" alt="标题"></picture>
 *     </a>
 *     <h2 class="card-title"><a class="card-title-link" href="/archives/1002350/">标题</a></h2>
 *     <time class="card-date">2026-09-23</time>
 *     <a class="card-author">作者</a>
 *   </article>
 */
function parseVods($) {
    const videos = [];
    $('article.card').each((_, element) => {
        const $el = $(element);
        const $link = $el.find('a.card-title-link').first();
        const url = $link.attr('href') || $el.find('a.card-cover-link').attr('href') || '';
        const name = $el.find('h2.card-title').text().trim() || $link.text().trim();

        const $img = $el.find('picture img').first();
        let pic = $img.attr('data-original-src') || $img.attr('src') || '';
        // src 可能是占位图，优先 webp 源
        if (!pic || pic.includes('placeholders')) {
            const srcset = $el.find('picture source').attr('srcset') || '';
            pic = srcset.split(',')[0].trim().split(/\s+/)[0] || pic;
        }

        const date = $el.find('time.card-date').text().trim();
        const hit = url.match(/\/archives\/(\d+)\//);
        const id = hit ? hit[1] : '';

        if (!id || !name) return;
        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: date,
        });
    });
    return videos;
}

/** 分页总数：优先读跳页表单的 max，其次读最后一个页码链接 */
function parsePageCount($, page) {
    let max = page;

    const maxAttr = $('input[max]').attr('max');
    const n1 = parseInt(maxAttr);
    if (Number.isFinite(n1) && n1 > max) max = n1;

    $('a.pagination-page').each((_, el) => {
        const t = $(el).text().trim();
        const n = parseInt(t);
        if (Number.isFinite(n) && n > max) max = n;
    });

    return max;
}

/** 详情页里的视频 id：<video data-chigua-media="32位hex" data-media-id="同一个"> */
function parseMediaId(html) {
    const m = html.match(/data-chigua-media="([a-f0-9]{16,})"/i) || html.match(/data-media-id="([a-f0-9]{16,})"/i);
    return m ? m[1] : '';
}

/**
 * 播放地址：站点自己的 /api/play/{mediaId}/master.m3u8 会 302 到签名 m3u8
 *   -> https://v.shuguowei.com/api/chigua-media/{id}/output/g3/master.m3u8?auth_key=...
 * 这个入口每次请求都重新签名，不会过期，比直接存签名地址稳。
 */
async function resolveStream(mediaId) {
    const api = `${site}/api/play/${mediaId}/master.m3u8`;
    try {
        const resp = await axios.get(api, {
            headers: { 'User-Agent': UA, Referer: `${site}/` },
            timeout: 25000,
            maxRedirects: 5,
        });
        const finalUrl = resp.request?.res?.responseUrl || resp.request?._redirectable?._currentUrl || '';
        if (finalUrl && /\.m3u8/i.test(finalUrl)) return finalUrl;
    } catch (e) {
        // 跟随失败就退回入口地址，交给播放器自己 302
    }
    return api;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'recent', type_name: '今日鲜瓜' },
        { type_id: 'rebang', type_name: '黄瓜热榜' },
        { type_id: 'baoliao', type_name: '吃瓜爆料' },
        { type_id: 'hot', type_name: '热门爆料' },
        { type_id: 'wanghong', type_name: '网红吃瓜' },
        { type_id: 'mingxing', type_name: '明星吃瓜' },
        { type_id: 'campus', type_name: '校园话题' },
        { type_id: 'haiwai', type_name: '海外吃瓜' },
        { type_id: 'guanchang', type_name: '官场秘闻' },
        { type_id: 'shehui', type_name: '社会奇闻' },
        { type_id: 'yingshi', type_name: '影视专区' },
        { type_id: 'chengren', type_name: '成人影视' },
        { type_id: 'juqing', type_name: '国产剧情' },
        { type_id: 'lunli', type_name: '伦理道德' },
        { type_id: 'wanghuang', type_name: '网黄专区' },
        { type_id: 'whjx', type_name: '网黄精选' },
        { type_id: 'tanhua', type_name: '探花精选' },
        { type_id: 'aiduanju', type_name: 'AI短剧' },
        { type_id: 'aimingxing', type_name: 'AI明星' },
        { type_id: 'simi', type_name: '私密精选' },
        { type_id: 'tese', type_name: '特色专区' },
        { type_id: 'pincha', type_name: '黄瓜品茶' },
        { type_id: 'cabian', type_name: '擦边专区' },
        { type_id: 'taose', type_name: '桃色图集' },
        { type_id: 'dasai', type_name: '每日大赛' },
        { type_id: 'tougao', type_name: '瓜友投稿' },
    ];

    const html = await request(site);
    const $ = load(html);
    const list = parseVods($);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    // 首页用 /page/N/，分类用 /category/{slug}/{N}/
    let url;
    if (!tid || tid === 'index') {
        url = page > 1 ? `${site}/page/${page}/` : `${site}/`;
    } else {
        url = page > 1 ? `${site}/category/${tid}/${page}/` : `${site}/category/${tid}/`;
    }

    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: parsePageCount($, page), list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = `${site}/archives/${id}/`;
    const html = await request(url);
    const $ = load(html);

    const name = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const desc = $('meta[property="og:description"]').attr('content') || '';
    const date = $('time[datetime]').first().attr('datetime') || '';

    const tags = [];
    $('section.post-tags a.tag').each((_, el) => {
        const t = $(el).text().trim();
        if (t && !tags.includes(t)) tags.push(t);
    });

    const mediaId = parseMediaId(html);
    const playUrl = mediaId ? `正片$${site}/api/play/${mediaId}/master.m3u8` : '';

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_content: desc,
            vod_remarks: String(date).slice(0, 10),
            vod_year: String(date).slice(0, 4),
            type_name: tags.join(','),
            vod_play_from: '黄瓜网',
            vod_play_url: playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '').trim();
    const header = {
        'User-Agent': UA,
        Referer: `${site}/`,
    };

    if (!id) return { parse: 0, url: '', header: {} };

    // 1) 已经是 /api/play/ 入口或 /output/ 签名地址
    if (/\/api\/play\//.test(id) || /\.m3u8(\?|$)/i.test(id)) {
        if (/\/api\/play\/([a-f0-9]{16,})\//i.test(id)) {
            const mid = id.match(/\/api\/play\/([a-f0-9]{16,})\//i)[1];
            return { parse: 0, url: await resolveStream(mid), header };
        }
        return { parse: 0, url: id, header };
    }

    // 2) 32 位 hex 直接当 mediaId
    if (/^[a-f0-9]{16,}$/i.test(id)) {
        return { parse: 0, url: await resolveStream(id), header };
    }

    // 3) 否则当 archive id，回详情页取 mediaId
    try {
        const hit = id.match(/(\d+)/);
        if (hit) {
            const html = await request(`${site}/archives/${hit[1]}/`);
            const mediaId = parseMediaId(html);
            if (mediaId) {
                return { parse: 0, url: await resolveStream(mediaId), header };
            }
        }
    } catch (e) {
        // 落到兜底
    }

    return { parse: 1, url: `${site}/archives/${id}/`, header };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);

    if (!key) return { list: [], page: 1 };

    // 搜索分页是 /search/{kw}/page/{N}/
    let url = `${site}/search/${encodeURIComponent(key)}/`;
    if (pg > 1) url = `${site}/search/${encodeURIComponent(key)}/page/${pg}/`;

    const html = await request(url);
    const $ = load(html);

    return { list: parseVods($), page: pg, pagecount: parsePageCount($, pg) };
}

export default {
    meta: {
        key: 'hguaw',
        name: '🥒黄瓜网',
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
