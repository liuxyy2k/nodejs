import axios from 'axios';
import { load } from 'cheerio';

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DOMAINS = ['https://missav02.xyz', 'https://missav.app'];

const HEADERS = { 'User-Agent': UA };

const CLASSES = [
    { type_name: '国产', type_id: '20' },
    { type_name: '日本有码', type_id: '21' },
    { type_name: '日本无码', type_id: '22' },
    { type_name: '中文字幕', type_id: '28' },
    { type_name: '欧美', type_id: '23' },
    { type_name: '动漫', type_id: '24' },
    { type_name: '伦理', type_id: '25' },
];

const FILTERS = {
    20: [
        {
            key: 'cateId',
            name: '分类',
            value: [
                { v: '20', n: '全部' },
                { v: '26', n: '国产精品' },
                { v: '27', n: '国产剧情' },
                { v: '29', n: '国产自拍' },
                { v: '35', n: '国产主播' },
                { v: '85', n: '国模私拍' },
                { v: '91', n: '网红明星' },
                { v: '105', n: '国产SM' },
                { v: '107', n: '台湾辣妹' },
                { v: '108', n: '香港正妹' },
            ],
        },
    ],
    21: [
        {
            key: 'cateId',
            name: '分类',
            value: [
                { v: '21', n: '全部' },
                { v: '31', n: '人妻' },
                { v: '44', n: '素人' },
                { v: '46', n: '口爆颜射' },
                { v: '47', n: '萝莉少女' },
                { v: '48', n: '美乳巨乳' },
                { v: '52', n: '制服诱惑' },
                { v: '57', n: '调教' },
                { v: '58', n: '出轨' },
                { v: '101', n: '有码精品' },
            ],
        },
    ],
    22: [{ key: 'cateId', name: '分类', value: [{ v: '22', n: '全部' }, { v: '102', n: '无码精品' }] }],
    23: [{ key: 'cateId', name: '分类', value: [{ v: '23', n: '全部' }, { v: '104', n: '欧美精品' }] }],
    24: [{ key: 'cateId', name: '分类', value: [{ v: '24', n: '全部' }, { v: '103', n: '动漫精品' }] }],
    25: [{ key: 'cateId', name: '分类', value: [{ v: '25', n: '全部' }, { v: '39', n: '综合三级' }] }],
    28: [{ key: 'cateId', name: '分类', value: [{ v: '28', n: '全部' }, { v: '51', n: '日本中字' }] }],
};

function absUrl(link, base) {
    if (!link) return '';
    try {
        return new URL(link, base).href;
    } catch {
        return link;
    }
}

function toPath(url) {
    let path = String(url || '');
    for (const d of DOMAINS) {
        if (path.startsWith(d)) {
            path = path.slice(d.length) || '/';
            break;
        }
    }
    return path;
}

async function fetchWithFallback(path) {
    for (const domain of DOMAINS) {
        const fullUrl = absUrl(path, domain);
        try {
            const rsp = await axios.get(fullUrl, {
                headers: HEADERS,
                timeout: 20000,
                responseType: 'text',
                validateStatus: () => true,
            });
            const html = typeof rsp.data === 'string' ? rsp.data : String(rsp.data || '');
            if (rsp.status === 200 && html && !html.includes('Just a moment...')) {
                return { html, domain };
            }
        } catch {
            /* next domain */
        }
    }
    return { html: '', domain: DOMAINS[0] };
}

function parseCards(html, baseDomain) {
    const $ = load(html);
    const videos = [];
    $('body .gap-5 .group').each((_, el) => {
        const $el = $(el);
        const link = $el.find('a').attr('href');
        if (!link) return;
        const abs = $el.find('.absolute');
        let remarks = '';
        if (abs.length >= 2) {
            remarks = `${$(abs[1]).text().trim()} ${$(abs[0]).text().trim()}`.trim();
        } else if (abs.length === 1) {
            remarks = $(abs[0]).text().trim();
        }
        videos.push({
            vod_id: absUrl(link, baseDomain),
            vod_name: $el.find('.text-nord4').text().trim(),
            vod_pic: $el.find('img').attr('data-src') || $el.find('img').attr('src') || '',
            vod_remarks: remarks,
        });
    });
    return videos;
}

function parseFilters(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

async function init() {
    return {};
}

async function home() {
    const { html, domain } = await fetchWithFallback('/label/new/');
    return {
        class: CLASSES,
        filters: FILTERS,
        list: html ? parseCards(html, domain) : [],
    };
}

async function category(inReq) {
    const tid = String(inReq.body.id || '');
    const pg = parseInt(inReq.body.page || 1, 10) || 1;
    const ext = parseFilters(inReq.body.filters);
    const cateId = ext.cateId || tid;
    const { html, domain } = await fetchWithFallback(`/vodtype/${cateId}-${pg}/`);
    const list = html ? parseCards(html, domain) : [];
    return {
        list,
        page: pg,
        pagecount: list.length ? pg + 1 : pg,
        limit: 20,
        total: 9999,
    };
}

async function detail(inReq) {
    let vodId = inReq.body.id;
    if (Array.isArray(vodId)) vodId = vodId[0];
    vodId = String(vodId || '');
    const path = toPath(vodId);
    const { html, domain } = await fetchWithFallback(path);
    if (!html) return { list: [] };

    const $ = load(html);
    const title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    const pic = $('img.w-full').attr('src') || $('img').attr('data-src') || '';
    const typeName = $('.text-muted a').text() || '';

    let actor = '';
    if (html.includes('</a>：') && html.includes('</p>')) {
        actor = html.split('</a>：')[1].split('</p>')[0].replace(/<\/?a>/g, '').trim();
    }
    let remarks = '';
    if (html.includes('概要：</span>') && html.includes('</p>')) {
        remarks = html.split('概要：</span>')[1].split('</p>')[0].trim();
    }

    const playUrl = absUrl(path, domain);
    return {
        list: [
            {
                vod_id: vodId,
                vod_name: title,
                vod_pic: pic,
                type_name: typeName,
                vod_actor: actor,
                vod_content: remarks,
                vod_play_from: 'MissAV直连',
                vod_play_url: `正片播放$${playUrl}`,
            },
        ],
    };
}

async function search(inReq) {
    const wd = encodeURIComponent(String(inReq.body.wd || ''));
    const pg = parseInt(inReq.body.page || 1, 10) || 1;
    const path = pg > 1 ? `/vodsearch/${wd}----------${pg}---/` : `/vodsearch/${wd}-------------/`;
    const { html, domain } = await fetchWithFallback(path);
    const list = html ? parseCards(html, domain) : [];
    return { list, page: pg, pagecount: list.length ? pg + 1 : pg };
}

async function play(inReq) {
    const id = String(inReq.body.id || '');
    const result = {
        parse: 1,
        playUrl: '',
        url: id,
        header: HEADERS,
    };
    try {
        const rsp = await axios.get(id, {
            headers: HEADERS,
            timeout: 20000,
            responseType: 'text',
            validateStatus: () => true,
        });
        const html = typeof rsp.data === 'string' ? rsp.data : String(rsp.data || '');
        const match = html.match(/var\s+player_aaaa\s*=\s*(\{.*?\});/);
        if (!match) return result;

        const player = JSON.parse(match[1]);
        let rawUrl = player.url || '';
        const encrypt = Number(player.encrypt || 0);
        if (encrypt === 1) {
            rawUrl = decodeURIComponent(rawUrl);
        } else if (encrypt === 2) {
            rawUrl = decodeURIComponent(Buffer.from(rawUrl, 'base64').toString('utf8'));
        }
        if (rawUrl && (rawUrl.includes('.m3u8') || rawUrl.includes('.mp4') || rawUrl.includes('http'))) {
            result.parse = 0;
            result.url = rawUrl;
        }
    } catch {
        /* sniff */
    }
    return result;
}

export default {
    meta: {
        key: 'missav02',
        name: '🌸MissAV02',
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
