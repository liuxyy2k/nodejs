
const m3uUrl = 'https://gh-proxy.org/https://github.com/cluntop/tvbox/blob/main/lib/sbjh.m3u';

// 解析m3u
async function parseM3U() {
    const response = await fetch(m3uUrl);
    if (!response.ok) throw new Error(`请求失败: ${response.status}`);
    const text = await response.text();
    const lines = text.split('\n');
    const data = {};

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXTINF')) {
            const info = lines[i];
            const group = info.match(/group-title="(.*?)"/)?.[1] || "直播";
            const name = info.split(',')[1]?.trim() || "未知";
            const url = lines[i + 1]?.trim();

            if (!url) continue;
            if (!data[group]) data[group] = [];

            data[group].push({ name, url });
        }
    }
    return data;
}

// 懒加载：首次使用时才初始化，避免模块加载时阻塞
let liveData = null;

async function getLiveData() {
    if (!liveData) {
        liveData = await parseM3U();
    }
    return liveData;
}

async function init() {
    await getLiveData(); // 提前加载缓存
    return {};
}

async function home() {
    const data = await getLiveData();
    const classes = [];

    for (const g in data) {
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
    const data = await getLiveData();
    const tid = inReq.body.id;

    const list = (data[tid] || []).map(i => ({
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
    const data = await getLiveData();

    let channelName = '直播';
    for (const group in data) {
        const ch = data[group].find(i => i.url === url);
        if (ch) { channelName = ch.name; break; }
    }

    return {
        list: [{
            vod_id: url,
            vod_name: channelName,
            vod_pic: "",
            vod_play_from: "live",
            vod_play_url: channelName + "$" + url
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
        name: '色播聚合',
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