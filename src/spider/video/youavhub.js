import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import https from 'https';
import { load } from 'cheerio';

/**
 * YouAVHub - https://youavhub.com
 * MacCMS · player_aaaa · 多线路播放
 */

const BASE_URL = 'https://youavhub.com';
const PAGE_SIZE = 20;
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const CLASS_NAME = [
    '日本AV', '巨乳', '熟女人妻', '中文字幕', '少女蘿莉',
    '翹臀美尻', '亂倫、誘惑', '制服誘惑', '高潮潮吹', '多P群交',
    'SM調教', '抖陰短片', '激情口交', 'AV女優無碼', '野外性愛',
    '麻豆', '歐美無碼', '國產素人自拍', '同性戀', '18+成人激情電影',
];

const CLASS_URL = [
    '22', '20', '21', '23', '24',
    '26', '29', '34', '27', '41',
    '38', '25', '39', '33', '40',
    '37', '28', '30', '32', '43',
];

const jar = new CookieJar();

const http = wrapper(
    axios.create({
        timeout: 10_000,
        jar,
        validateStatus: () => true,
    }),
);

function getHeaders(referer) {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: referer || `${BASE_URL}/`,
        Connection: 'keep-alive',
    };
}

function fixUrl(url) {
    const v = String(url || '').trim();
    if (!v) return '';
    if (v.startsWith('http')) return v;
    if (v.startsWith('//')) return `https:${v}`;
    return new URL(v, `${BASE_URL}/`).href;
}

async function fetchHtml(url, referer) {
    try {
        const resp = await http.get(url, {
            headers: getHeaders(referer),
            responseType: 'text',
        });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function parseList(html) {
    const vodList = [];
    if (!html) return vodList;

    const $ = load(html);
    const items = $('.vodlist_item, .searchlist_item, .pack-yg');

    items.each((_, el) => {
        const item = $(el);

        const aTag =
            item.find('.searchlist_titbox h4 a').first().length
                ? item.find('.searchlist_titbox h4 a').first()
                : item.find('a.vodlist_thumb').first().length
                  ? item.find('a.vodlist_thumb').first()
                  : item.find('a.searchlist_thumb').first().length
                    ? item.find('a.searchlist_thumb').first()
                    : item.find('.pack-yg-tit a').first().length
                      ? item.find('.pack-yg-tit a').first()
                      : item.find('a').first();

        const imgTag =
            item.find('.searchlist_img a').first().length
                ? item.find('.searchlist_img a').first()
                : item.find('a.vodlist_thumb').first().length
                  ? item.find('a.vodlist_thumb').first()
                  : item.find('a.searchlist_thumb').first().length
                    ? item.find('a.searchlist_thumb').first()
                    : item.find('img').first();

        const subTag = item.find('.pic_text, .pic-text, .vodlist_sub, .pack-subtitle').first();

        if (!aTag.length) return;

        const href = aTag.attr('href') || '';
        if (!href) return;

        const match = href.match(/\/id\/(\d+)/);
        const vodId = match ? match[1] : href;

        let title = (aTag.attr('title') || '').trim();
        if (!title) {
            const clone = aTag.clone();
            clone.find('span').remove();
            title = clone.text().trim();
        }

        let pic = '';
        if (imgTag.length) {
            pic = (
                imgTag.attr('data-original') ||
                imgTag.attr('data-src') ||
                imgTag.attr('data-lazyload') ||
                imgTag.attr('src') ||
                ''
            ).trim();
            if (pic) pic = fixUrl(pic);
        }

        const remarks = subTag.length ? subTag.text().trim() : '';

        if (vodId && title) {
            vodList.push({
                vod_id: String(vodId),
                vod_name: title,
                vod_pic: pic,
                vod_remarks: remarks,
            });
        }
    });

    return vodList;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = CLASS_NAME.map((name, i) => ({
        type_name: name,
        type_id: CLASS_URL[i] || String(i),
    }));

    const html = await fetchHtml(BASE_URL);
    return { class: classes, filters: {}, list: parseList(html) };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);

    const url = `${BASE_URL}/index.php/vod/show/id/${tid}/page/${pg}/`;
    const html = await fetchHtml(url);

    return {
        list: parseList(html),
        page: pg,
        pagecount: 99,
        limit: PAGE_SIZE,
        total: 999,
    };
}

async function detail(inReq, _outResp) {
    const rawId = inReq.body.id;
    let vodId = String(Array.isArray(rawId) ? rawId[0] : rawId || '').trim();

    let url;
    if (vodId.startsWith('http')) url = vodId;
    else if (/^\d+$/.test(vodId)) url = `${BASE_URL}/index.php/vod/play/id/${vodId}/sid/1/nid/1/`;
    else url = fixUrl(vodId);

    const html = await fetchHtml(url);
    if (!html) return { list: [] };

    const $ = load(html);

    let title = '';
    const playerMatch = html.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\});/);
    if (playerMatch) {
        try {
            const pdata = JSON.parse(playerMatch[1]);
            title = pdata?.vod_data?.vod_name || '';
        } catch {
            /* ignore */
        }
    }

    if (!title) {
        title =
            $('.play_namebox .title').first().text().trim() ||
            $('h1').first().text().trim() ||
            $('.vodlist_title').first().text().trim() ||
            '';
    }

    const picEl = $('.play_vlist_thumb, .vodlist_thumb, img').first();
    let pic = '';
    if (picEl.length) {
        const picSrc =
            picEl.attr('data-original') || picEl.attr('data-src') || picEl.attr('src') || '';
        if (picSrc) pic = fixUrl(picSrc);
    }

    const playFromList = [];
    const playUrlList = [];

    const bofyEl = $('#bofy');
    if (bofyEl.length) {
        const tabs = bofyEl
            .find('ul.title_nav li.tab-play')
            .map((_, el) => $(el).text().trim())
            .get()
            .filter(Boolean);

        bofyEl.find('ul.content_playlist').each((i, playlist) => {
            const fromName = tabs[i] || `线路${i + 1}`;
            playFromList.push(fromName);

            const episodes = [];
            $(playlist)
                .find('a')
                .each((_, a) => {
                    const epTitle = $(a).text().trim() || '播放';
                    const epUrl = fixUrl($(a).attr('href') || '');
                    if (epUrl) episodes.push(`${epTitle}$${epUrl}`);
                });

            playUrlList.push(episodes.join('#'));
        });
    }

    if (!playUrlList.length) {
        playFromList.push('默认线路');
        playUrlList.push(`正片$${url}`);
    }

    return {
        list: [
            {
                vod_id: vodId,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: '',
                vod_content: '',
                vod_play_from: playFromList.join('$$$'),
                vod_play_url: playUrlList.join('$$$'),
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '').trim();
    const header = { 'User-Agent': UA, Referer: `${BASE_URL}/` };

    const result = { parse: 0, url: id, header };

    try {
        const url = id.startsWith('http') ? id : fixUrl(id);
        const html = await fetchHtml(url, url);

        if (html) {
            const match = html.match(
                /var\s+(?:player_a+a|player_data|MacPlayer)\s*=\s*(\{[\s\S]*?\});/,
            );
            if (match) {
                try {
                    const playerInfo = JSON.parse(match[1]);
                    let playUrl = playerInfo.url || '';
                    if (playUrl) {
                        playUrl = decodeURIComponent(playUrl).replace(/\\\//g, '/');
                        result.url = playUrl;
                        result.parse = /\.m3u8|\.mp4/i.test(playUrl) ? 0 : 1;
                        return result;
                    }
                } catch {
                    /* fallback */
                }
            }

            const m3u8Match = html.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/);
            if (m3u8Match) {
                result.parse = 0;
                result.url = m3u8Match[1].replace(/\\\//g, '/');
                return result;
            }
        }

        if (/\.m3u8|\.mp4/i.test(id)) {
            result.parse = 0;
        } else {
            result.parse = 1;
        }
    } catch {
        result.parse = 1;
    }

    return result;
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);

    if (!key) {
        return { list: [], page: pg, pagecount: 1, limit: PAGE_SIZE, total: 0 };
    }

    const encodedKey = key.includes('%') ? key : encodeURIComponent(key);

    try {
        await fetchHtml(BASE_URL);

        let url = `${BASE_URL}/vodsearch/-------------/?wd=${encodedKey}&page=${pg}`;
        let html = await fetchHtml(url);

        if (
            !html ||
            (!html.includes('searchlist_item') &&
                !html.includes('vodlist_item') &&
                !html.includes('pack-yg'))
        ) {
            url = `${BASE_URL}/index.php/vod/search/?wd=${encodedKey}&page=${pg}`;
            html = await fetchHtml(url);
        }

        return {
            list: parseList(html),
            page: pg,
            pagecount: 1,
            limit: PAGE_SIZE,
            total: 0,
        };
    } catch {
        return { list: [], page: pg, pagecount: 1, limit: PAGE_SIZE, total: 0 };
    }
}

export default {
    meta: {
        key: 'youavhub',
        name: '🌸YouAVHub',
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
