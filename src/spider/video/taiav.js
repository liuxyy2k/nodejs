import axios from 'axios';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1';
const site = 'https://taiav.com';

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: JSON.stringify({ tip: 'category', class: '网红主播' }), type_name: '网红主播' },
        { type_id: JSON.stringify({ tip: 'category', class: '国产AV' }),   type_name: '国产AV' },
        { type_id: JSON.stringify({ tip: 'category', class: '有码' }),     type_name: '有码' },
        { type_id: JSON.stringify({ tip: 'category', class: '无码' }),     type_name: '无码' },
        { type_id: JSON.stringify({ tip: 'tag',      class: 'Onlyfans' }), type_name: 'Onlyfans' },
        { type_id: JSON.stringify({ tip: 'tag',      class: 'Korean Bj' }),type_name: 'Korean Bj' },
        { type_id: JSON.stringify({ tip: 'tag',      class: '探花' }),     type_name: '探花' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const { tip, class: cls } = JSON.parse(inReq.body.id);
    const page = inReq.body.page || 1;
    const text = encodeURIComponent(cls);
    const url = `${site}/api/getcontents?page=${page}&size=12&${tip}=${text}&type=movie,tv`;

    const data = await request(url);
    const list = typeof data === 'string' ? JSON.parse(data) : data;

    let videos = [];
    list.forEach((e) => {
        videos.push({
            vod_id: JSON.stringify({ url: `${site}/api/getmovie?type=1280&id=${e._id}` }),
            vod_name: e.originalname,
            vod_pic: `${site}${e.poster2.url}`,
            vod_remarks: 'HD',
        });
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const { url } = JSON.parse(inReq.body.id);
    const data = await request(url);
    const playlist = typeof data === 'string' ? JSON.parse(data) : data;

    const playUrl = `${site}${playlist.m3u8}`;

    return {
        list: [{
            vod_id: inReq.body.id,
            vod_name: playlist.originalname || '',
            vod_pic: '',
            vod_play_from: 'Taiav',
            vod_play_url: `播放$${playUrl}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: {
            'User-Agent': UA,
            'origin': site,
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/api/getcontents?page=${page}&size=48&q=${text}&type=movie,tv`;

    const data = await request(url);
    const list = typeof data === 'string' ? JSON.parse(data) : data;

    let videos = [];
    list.forEach((e) => {
        videos.push({
            vod_id: JSON.stringify({ url: `${site}/api/getmovie?type=1280&id=${e._id}` }),
            vod_name: e.originalname,
            vod_pic: `${site}${e.poster2.url}`,
            vod_remarks: 'HD',
        });
    });

    return { list: videos };
}

export default {
    meta: {
        key: 'taiav',
        name: '🔥Taiav',
        type: 3
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