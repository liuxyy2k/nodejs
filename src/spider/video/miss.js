import axios from 'axios';
import { load } from 'cheerio';
import { chromium } from 'playwright';
import 'dotenv/config';

const PROXY = process.env.HTTP_PROXY || null;
const UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site  = 'https://missav.ws';

function getAxiosProxy() {
    if (!PROXY) return {};
    const url = new URL(PROXY);
    return { proxy: { host: url.hostname, port: parseInt(url.port) } };
}

// axios 请求，用于 m3u8 等直接资源
async function fetch(url) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA },
        ...getAxiosProxy(),  // ✅ 从环境变量读，不硬编码
    });
    return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
}

let browserContext = null;

async function getContext() {
    if (browserContext) return browserContext;
    try {
        const browser = await chromium.launch({
            headless: true,
            ...(PROXY ? { proxy: { server: PROXY } } : {}),  // ✅ 从环境变量读
        });
        browserContext = await browser.newContext({ userAgent: UA });
        browser.on('disconnected', () => { browserContext = null; });
        return browserContext;
    } catch (e) {
        browserContext = null;
        throw e;
    }
}

// playwright 请求，过 CF
async function request(url) {
    let page;
    try {
        const context = await getContext();
        page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(
            () => !document.title.includes('Just a moment'),
            { timeout: 30000 }
        );
        return await page.content();
    } catch (e) {
        browserContext = null;
        throw e;
    } finally {
        await page?.close();
    }
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'dm265/cn/chinese-subtitle', type_name: '中文字幕' },
        { type_id: 'dm513/cn/new',              type_name: '最近更新' },
        { type_id: 'dm509/cn/release',          type_name: '新作上市' },
        { type_id: 'dm561/cn/uncensored-leak',  type_name: '无码流出' },
        { type_id: 'dm168/cn/weekly-hot',       type_name: '本週热门' },
        { type_id: 'dm207/cn/monthly-hot',      type_name: '本月热门' },
        { type_id: 'dm95/cn/fc2',               type_name: 'FC2'      },
        { type_id: 'dm34/cn/madou',             type_name: '麻豆传媒' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const id   = inReq.body.id;
    const page = inReq.body.page || 1;

    const html = await request(`${site}/${id}?page=${page}`);
    const $    = load(html);

    const videos = [];
    $('.thumbnail').each((_, e) => {
        const href    = $(e).find('a').eq(0).attr('href') || '';
        const title   = $(e).find('.text-secondary').text().trim().replace(/\s+/g, ' ');
        const cover   = $(e).find('.w-full').attr('data-src') || '';
        const remarks = $(e).find('.absolute').text().trim();
        if (href) videos.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: remarks });
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url  = inReq.body.id;
    const html = await request(url);

    const m3u8Prefix = 'https://surrit.com/';
    const m3u8Suffix = '/playlist.m3u8';

    const tracks = [];
    const match  = html.match(/nineyu\.com\\\/(.+)\\\/seek\\\/_0\.jpg/);
    if (match?.[1]) {
        const uuid = match[1];
        try {
            const playlist = await fetch(`${m3u8Prefix}${uuid}${m3u8Suffix}`);
            const lines    = playlist.split('\n');
            lines.filter(line => line.includes('/video.m3u8')).forEach(m => {
                const name = m.replace('/video.m3u8', '');
                tracks.unshift(`${name}$${m3u8Prefix}${uuid}/${m}`);
            });
        } catch (e) {
            console.error('m3u8 fetch error:', e.message);
        }
        tracks.push(`自动$${m3u8Prefix}${uuid}${m3u8Suffix}`);
    }

    const $     = load(html);
    const title = $('h1').first().text().trim();
    const pic   = $('meta[property="og:image"]').attr('content') || '';

    return {
        list: [{
            vod_id:        url,
            vod_name:      title,
            vod_pic:       pic,
            vod_play_from: '默认',
            vod_play_url:  tracks.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.url,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = inReq.body.pg || 1;

    const html = await request(`${site}/cn/search/${text}?page=${page}`);
    const $    = load(html);

    const videos = [];
    $('.thumbnail').each((_, e) => {
        const href    = $(e).find('.text-secondary').attr('href') || '';
        const title   = $(e).find('.text-secondary').text().trim().replace(/\s+/g, ' ');
        const cover   = $(e).find('.w-full').attr('data-src') || '';
        const remarks = $(e).find('.left-1').text().trim();
        if (href) videos.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: remarks });
    });

    return { list: videos };
}

export default {
    meta: { key: 'missav', name: 'MissAV', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
