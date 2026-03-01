import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const site = 'https://kdn9m.zqcvioh.xyz';

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
    });
    return resp.data;
}

function parseVodList($) {
    const list = [];

    $('.video-item').each((_, element) => {
        try {
            const url  = $(element).find('a').attr('href') || '';
            const name = $(element).find('h3').text().trim();
            if (!name || !url) return;

            // 从 URL 中提取纯数字 ID
            const id = url.split('/').find(p => /^\d+$/.test(p)) || '';

            // 图片从 img 的 html 内容里正则提取
            const imgHtml = $(element).find('img').toString();
            const match   = imgHtml.match(/'(https?:\/\/[^']+)/);
            const pic     = match ? match[1] : '';

            list.push({ vod_id: id, vod_name: name, vod_pic: pic, vod_remarks: '' });
        } catch (e) {}
    });

    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'hlcg', type_name: '最新黑料' },
        { type_id: 'jrrs', type_name: '今日热瓜' },
        { type_id: 'jqrm', type_name: '热门黑料' },
        { type_id: 'lsdg', type_name: '经典黑料' },
        { type_id: 'mrrb', type_name: '日榜黑料' },
        { type_id: 'zbjx', type_name: '周榜精选' },
        { type_id: 'ybrg', type_name: '月榜热瓜' },
        { type_id: 'ycsq', type_name: '原创社区' },
        { type_id: 'qqqw', type_name: '全球奇闻' },
        { type_id: 'xycg', type_name: '校园黑料' },
    ];

    const html = await request(site);
    const $    = load(html);
    const list = parseVodList($);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    // 分类 URL 规则：第1页 /tid/，后续 /tid/page/N/
    const url  = page > 1
        ? `${site}/${tid}/page/${page}/`
        : `${site}/${tid}/`;

    const html = await request(url);
    const $    = load(html);
    const list = parseVodList($);

    return { page, pagecount: 999, list };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const html = await request(`${site}/archives/${id}`);
    const $    = load(html);

    const name    = $('meta[property="og:title"]').attr('content') || '';
    const pic     = $('meta[property="og:image"]').attr('content') || '';
    const year    = $('meta[property="video:release_date"]').attr('content') || '';
    const content = $('meta[property="og:description"]').attr('content') || '';

    const playParts = [];
    let index = 1;

    // 方法1：dplayer config 属性
    $('div.dplayer').each((_, el) => {
        try {
            const dataConfig = $(el).attr('config') || '';
            const m = dataConfig.match(/"url"\s*:\s*"([^"]+)"/);
            if (m) {
                playParts.push(`第${index}集$${m[1]}`);
                index++;
            }
        } catch (e) {}
    });

    // 方法2：video source 标签
    if (playParts.length === 0) {
        $('video source').each((_, el) => {
            const src = $(el).attr('src') || '';
            if (src) {
                playParts.push(`第${index}集$${src}`);
                index++;
            }
        });
    }

    // 方法3：从 script 中提取视频链接
    if (playParts.length === 0) {
        const patterns = [
            /"url"\s*:\s*"(https?:\/\/[^"]+\.(?:mp4|m3u8)[^"]*?)"/,
            /src\s*:\s*"(https?:\/\/[^"]+\.(?:mp4|m3u8)[^"]*?)"/,
            /'(https?:\/\/[^']+\.(?:mp4|m3u8)[^']*?)'/,
        ];
        $('script').each((_, el) => {
            if (playParts.length > 0) return;
            const scriptContent = $(el).html() || '';
            for (const pattern of patterns) {
                const m = scriptContent.match(pattern);
                if (m) {
                    playParts.push(`第${index}集$${m[1]}`);
                    index++;
                    break;
                }
            }
        });
    }

    return {
        list: [{
            vod_id:        id,
            vod_name:      name,
            vod_pic:       pic,
            vod_year:      year,
            vod_content:   content,
            vod_play_from: 'Hl51',
            vod_play_url:  playParts.join('#').replace(/\\/g, '/'),
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const html = await request(`${site}/search?keywords=${text}`);
    const $    = load(html);
    const list = parseVodList($);

    return { list };
}

export default {
    meta: {
        key: 'hlw',
        name: '黑料网',
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