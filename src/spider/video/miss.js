import axios from 'axios';
import { load } from 'cheerio';
// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site = 'https://missav.live';

const tabs = [
    { name: '中文字幕', ext: { id: 'dm265/cn/chinese-subtitle' } },
    { name: '最近更新', ext: { id: 'dm513/cn/new' } },
    { name: '新作上市', ext: { id: 'dm509/cn/release' } },
    { name: '无码流出', ext: { id: 'dm561/cn/uncensored-leak' } },
    { name: 'VR', ext: { id: 'dm2091/cn/genres/VR' } },
    { name: '今日热门', ext: { id: 'dm242/cn/today-hot' } },
    { name: '本週热门', ext: { id: 'dm168/cn/weekly-hot' } },
    { name: '本月热门', ext: { id: 'dm207/cn/monthly-hot' } },
    { name: 'SIRO', ext: { id: 'dm23/cn/siro' } },
    { name: 'LUXU', ext: { id: 'dm20/cn/luxu' } },
    { name: 'GANA', ext: { id: 'dm17/cn/gana' } },
    { name: 'PRESTIGE PREMIUM', ext: { id: 'dm14/cn/maan' } },
    { name: 'S-CUTE', ext: { id: 'dm23/cn/scute' } },
    { name: 'ARA', ext: { id: 'dm19/cn/ara' } },
    { name: 'FC2', ext: { id: 'dm95/cn/fc2' } },
    { name: 'HEYZO', ext: { id: 'dm628/cn/heyzo' } },
    { name: '东京热', ext: { id: 'dm29/cn/tokyohot' } },
    { name: '一本道', ext: { id: 'dm58345/cn/1pondo' } },
    { name: 'Caribbeancom', ext: { id: 'dm124158/cn/caribbeancom' } },
    { name: 'Caribbeancompr', ext: { id: 'dm1442/cn/caribbeancompr' } },
    { name: '10musume', ext: { id: 'dm58632/cn/10musume' } },
    { name: 'pacopacomama', ext: { id: 'dm668/cn/pacopacomama' } },
    { name: 'Gachinco', ext: { id: 'dm135/cn/gachinco' } },
    { name: 'XXX-AV', ext: { id: 'dm26/cn/xxxav' } },
    { name: '人妻斩', ext: { id: 'dm24/cn/marriedslash' } },
    { name: '顽皮 4610', ext: { id: 'dm19/cn/naughty4610' } },
    { name: '顽皮 0930', ext: { id: 'dm22/cn/naughty0930' } },
    { name: '麻豆传媒', ext: { id: 'dm34/cn/madou' } },
    { name: 'TWAV AV', ext: { id: 'dm17/cn/twav' } },
    { name: 'Furuke AV', ext: { id: 'dm15/cn/furuke' } },
];

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA ,
            'Referer': 'https://missav.live/'
        },
        // httpsAgent: agent
    });
    return resp.data;
}

function parseVideos($, container) {
    let videos = [];
    container.each((_, e) => {
        const href = $(e).find('.text-secondary').attr('href');
        const title = $(e).find('.text-secondary').text().trim().replace(/\s+/g, ' ');
        const cover = $(e).find('.w-full').attr('data-src');
        const remarks = $(e).find('.left-1').text().trim();
        const duration = $(e).find('.right-1').text().trim();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: remarks,
                vod_duration: duration,
            });
        }
    });
    return videos;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        ...tabs.map(t => ({ type_id: t.ext.id, type_name: t.name })),
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const id = inReq.body.id;
    const page = inReq.body.page || 1;

    const url = `${site}/${id}?page=${page}`;
    const html = await request(url);
    const $ = load(html);

    const videos = parseVideos($, $('.thumbnail'));

    return { page: parseInt(page), videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);
    const $ = load(html);

    const title = $('h1,h2').first().text().trim();
    const pic = $('meta[property="og:image"]').attr('content') || '';

    const m3u8Prefix = 'https://surrit.com/';
    const m3u8Suffix = '/playlist.m3u8';
    let playUrls = [];

    const match = html.match(/nineyu\.com\\\/(.+)\\\/seek\\\/_0\.jpg/);
    if (match && match[1]) {
        const uuid = match[1];
        try {
            const m3u8Data = await request(`${m3u8Prefix}${uuid}${m3u8Suffix}`);
            const lines = m3u8Data.split('\n');
            const qualityLines = lines.filter(line => line.includes('/video.m3u8'));
            qualityLines.forEach(line => {
                const name = line.replace('/video.m3u8', '');
                playUrls.unshift(`${name}$${m3u8Prefix}${uuid}/${line}`);
            });
            // 追加自动画质
            playUrls.push(`自动$${m3u8Prefix}${uuid}${m3u8Suffix}`);
        } catch (e) {
            playUrls.push(`默认$${m3u8Prefix}${uuid}${m3u8Suffix}`);
        }
    }

    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_play_from: 'MissAV',
            vod_play_url: playUrls.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA, 'Referer': site },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/cn/search/${text}?page=${page}`;

    const html = await request(url);
    const $ = load(html);

    const videos = parseVideos($, $('.thumbnail'));

    return { list: videos };
}

export default {
    meta: {
        key: 'missav',
        name: 'MissAV',
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