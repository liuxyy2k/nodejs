import fs from 'fs';

const m3uFile = '../nodejs/src/spider/sbjh.m3u';

// 解析m3u
function parseM3U() {

    const text = fs.readFileSync(m3uFile, 'utf8');
    const lines = text.split('\n');

    const data = {};

    for (let i = 0; i < lines.length; i++) {

        if (lines[i].startsWith('#EXTINF')) {

            const info = lines[i];

            const group = info.match(/group-title="(.*?)"/)?.[1] || "直播";
            const name = info.split(',')[1] || "未知";

            const url = lines[i + 1]?.trim();

            if (!url) continue;

            if (!data[group]) data[group] = [];

            data[group].push({
                name,
                url
            });

        }

    }

    return data;
}

let liveData = parseM3U();

async function init() {
    return {};
}

async function home() {

    const classes = [];

    for (const g in liveData) {

        classes.push({
            type_id: g,
            type_name: g
        });

    }

    return {
        class: classes,
        filters: {}
    };

}

async function category(inReq) {

    const tid = inReq.body.id;

    const list = (liveData[tid] || []).map(i => ({
        vod_id: i.url,
        vod_name: i.name,
        vod_pic: "",
        vod_remarks: "直播"
    }));

    return {
        page: 1,
        pagecount: 1,
        limit: list.length,
        total: list.length,
        list
    };

}

async function detail(inReq) {

    const url = inReq.body.id;

    return {
        list: [{
            vod_id: url,
            vod_name: "直播",
            vod_pic: "",
            vod_play_from: "live",
            vod_play_url: "播放$" + url
        }]
    };

}

async function play(inReq) {

    return {
        parse: 0,
        url: inReq.body.id
    };

}

async function search() {
    return { list: [] };
}

export default {

    meta: {
        key: 'm3uLive',
        name: 'M3U直播',
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