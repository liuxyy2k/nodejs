import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1';
const site = 'https://javmove.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'release',  type_name: '最新AV' },
        { type_id: 'upcoming', type_name: '即将上映' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tag = inReq.body.id;
    const page = inReq.body.page || 1;
    const url = `${site}/${tag}?page=${page}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('#movie-list article').each((_, element) => {
        const href = $(element).find('a[rel="bookmark"]').attr('href');
        const title = $(element).find('.movie-info h2').attr('title')?.split(' ')[0];
        const cover = $(element).find('.movie-image').attr('data-srcset') || $(element).find('.movie-image').attr('src');
        const pubdate = $(element).find('time.tag').text();
        if (href) {
            videos.push({
                vod_id: JSON.stringify({ url: `${site}${href}`, ref: url }),
                vod_name: title,
                vod_pic: cover,
                vod_remarks: pubdate,
            });
        }
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const { url, ref } = JSON.parse(inReq.body.id);
    const html = await request(url, { 'Referer': ref });
    const $ = load(html);

    const id = $('#video-player').attr('data-id') || '';
    const title = $('h1').first().text().trim();
    const pic = $('meta[property="og:image"]').attr('content') || '';

    // 收集所有格式和分集
    let groups = [];
    const formatPriority = { FullHD: 1, HD: 2, SD: 3 };

    const promises = $('.video-format').toArray().map(async (element) => {
        const format = $(element).find('.video-format-header').text().trim();
        let tracks = [];

        const partElements = $(element).find('.video-source-btn').toArray();
        for (const partEl of partElements) {
            const href = $(partEl).attr('href') || '';
            const partMatch = $(partEl).attr('title')?.match(/part\s*(\d+)/i);
            const partNumber = partMatch ? parseInt(partMatch[1], 10) : 0;

            let dataID;
            if (href.includes('#')) {
                dataID = id;
            } else {
                const curl = `${site}${href}`;
                const data2 = await request(curl, { 'Referer': ref });
                const $2 = load(data2);
                dataID = $2('#video-player').attr('data-id');
            }

            tracks.push({ part: partNumber, name: `part ${partNumber}`, dataID });
        }

        tracks.sort((a, b) => a.part - b.part);
        groups.push({ format, tracks });
    });

    await Promise.all(promises);
    groups.sort((a, b) => (formatPriority[a.format] || 9) - (formatPriority[b.format] || 9));

    // 拼接 vod_play_from 和 vod_play_url
    const vod_play_from = groups.map(g => g.format).join('$$$');
    const vod_play_url = groups.map(g =>
        g.tracks.map(t => `${t.name}$${t.dataID}`).join('#')
    ).join('$$$');

    return {
        list: [{
            vod_id: inReq.body.id,
            vod_name: title,
            vod_pic: pic,
            vod_play_from,
            vod_play_url,
        }],
    };
}

async function play(inReq, _outResp) {
    const dataID = inReq.body.id;
    const url = `${site}/watch?token=${dataID}`;
    const data = await request(url, { 'Referer': 'https://javquick.com/' });
    return {
        parse: 0,
        url: data,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/search?q=${text}&page=${page}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('#movie-list article').each((_, element) => {
        const href = $(element).find('a[rel="bookmark"]').attr('href');
        const title = $(element).find('.movie-info h2').attr('title')?.split(' ')[0];
        const cover = $(element).find('.movie-image').attr('data-srcset') || $(element).find('.movie-image').attr('src');
        const pubdate = $(element).find('time.tag').text();
        if (href) {
            videos.push({
                vod_id: JSON.stringify({ url: `${site}${href}`, ref: url }),
                vod_name: title,
                vod_pic: cover,
                vod_remarks: pubdate,
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: 'javmove',
        name: '🌸JavMove',
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