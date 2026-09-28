import crypto from 'crypto';
import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://javleak.com';
const playerReferer = 'https://player.abyssplayer.com/';

function buildListUrl(tid, page) {
    let path = String(tid || '/').trim();
    if (!path.startsWith('/')) path = `/${path}`;
    if (!path.endsWith('/')) path += '/';
    const base = `${site}${path === '//' ? '/' : path}`;
    if (page <= 1) return base;
    return `${base.replace(/\/$/, '')}/page/${page}/`;
}

function parsePageCount($, page) {
    let max = page;
    $('a[href*="/page/"]').each((_, el) => {
        const m = ($(el).attr('href') || '').match(/\/page\/(\d+)\//);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max;
}

async function request(url, referer = '') {
    const resp = await req.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: referer || `${site}/`,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        },
    });
    return resp.data;
}

function parseVods($) {
    const list = [];
    const seen = new Set();
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
        if (!/dmm\.co\.jp|pics\./.test(img)) return;
        if (!/^https:\/\/javleak\.com\/.+\/$/i.test(href) || seen.has(href)) return;
        seen.add(href);
        const name = $(el).parent().find('h2').text().trim()
            || $(el).closest('div').find('h2').text().trim()
            || $(el).attr('title')
            || '';
        list.push({
            vod_id: href,
            vod_name: name,
            vod_pic: img,
            vod_remarks: '',
        });
    });
    return list;
}

function parseDatasFromPlayer(html) {
    const m = String(html).match(/const\s+datas\s*=\s*"([^"]+)"/);
    if (!m) return null;
    return JSON.parse(Buffer.from(m[1], 'base64').toString('latin1'));
}

function decryptMedia(datas) {
    const mediaKeyStr = `${datas.user_id}:${datas.slug}:${datas.md5_id}`;
    const keyHex = crypto.createHash('md5').update(mediaKeyStr, 'utf8').digest('hex');
    const keyBytes = Buffer.from(keyHex, 'utf8');
    const iv = Buffer.from(keyHex.slice(0, 16), 'utf8');
    const inputBytes = Buffer.from(datas.media, 'latin1');
    const plain = Buffer.concat([
        crypto.createDecipheriv('aes-256-ctr', keyBytes, iv).update(inputBytes),
        crypto.createDecipheriv('aes-256-ctr', keyBytes, iv).final(),
    ]);
    return JSON.parse(plain.toString('utf8'));
}

function pickPlayUrl(manifest) {
    const items = manifest?.mp4?.fristDatas || [];
    if (!items.length) return '';
    const prefer = items.find((x) => x.res_id === 4)
        || items.find((x) => /h264/i.test(x.codec))
        || items[0];
    return prefer?.url || '';
}

async function resolvePlayUrl(detailUrl) {
    const detailHtml = await request(detailUrl);
    const iframe = String(detailHtml).match(/iframe[^>]+src=["']([^"']+)["']/i)?.[1];
    if (!iframe) return '';
    const playerHtml = await request(iframe, detailUrl);
    const datas = parseDatasFromPlayer(playerHtml);
    if (!datas?.media) return '';
    const manifest = decryptMedia(datas);
    return pickPlayUrl(manifest);
}

async function init() {
    return {};
}

async function home() {
    return {
        class: [
            { type_id: '/', type_name: '最新' },
            { type_id: '/beautiful-girl/', type_name: 'Beautiful Girl' },
            { type_id: '/big-tits/', type_name: 'Big Tits' },
            { type_id: '/creampie/', type_name: 'Creampie' },
            { type_id: '/censored/', type_name: 'Censored' },
            { type_id: '/cosplay/', type_name: 'Cosplay' },
            { type_id: '/married-woman/', type_name: 'Married Woman' },
            { type_id: '/school-girls/', type_name: 'School Girls' },
            { type_id: '/anal/', type_name: 'Anal' },
            { type_id: '/deep-throat/', type_name: 'Deep Throat' },
            { type_id: '/amateur/', type_name: 'Amateur' },
            { type_id: '/milf/', type_name: 'MILF' },
            { type_id: '/nurse/', type_name: 'Nurse' },
            { type_id: '/office-lady/', type_name: 'Office Lady' },
            { type_id: '/teacher/', type_name: 'Teacher' },
        ],
        filters: {},
    };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(buildListUrl(inReq.body.id, page)));
    return { page, pagecount: parsePageCount($, page), list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const detailUrl = id.startsWith('http') ? id : `${site}${id.startsWith('/') ? id : `/${id}`}`;
    const $ = load(await request(detailUrl));
    const playUrl = await resolvePlayUrl(detailUrl);
    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content') || '',
            vod_pic: $('meta[property="og:image"]').attr('content')
                || $('img[src*="dmm.co.jp"]').first().attr('src')
                || '',
            vod_content: $('meta[property="og:description"]').attr('content') || '',
            vod_play_from: 'javleak',
            vod_play_url: playUrl ? `正片$${playUrl}` : '',
        }],
    };
}

async function play(inReq) {
    return { parse: 0, url: inReq.body.id, header: { 'User-Agent': UA, Referer: playerReferer } };
}

async function search(inReq) {
    const wd = encodeURIComponent(inReq.body.wd || '');
    const $ = load(await request(`${site}/?s=${wd}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'javleak', name: 'JAVLeak', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
