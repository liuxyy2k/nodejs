import axios from 'axios';

const m3uUrl = 'https://gh-proxy.org/https://raw.githubusercontent.com/cluntop/tvbox/refs/heads/main/lib/sbjh.m3u';

async function parseM3U() {
    const resp = await axios.get(m3uUrl, { timeout: 15000, responseType: 'text' });
    const text = typeof resp.data === 'string' ? resp.data : String(resp.data);
    // console.log('[sbjh] m3u fetched, length:', text.length, 'first 200 chars:', text.substring(0, 200));
    const lines = text.split(/\r?\n/);
    const data = {};

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXTINF')) {
            const info = lines[i];
            const group = info.match(/group-title="(.*?)"/)?.[1] || '直播';
            const name = info.split(',')[1]?.trim() || '未知';
            const url = lines[i + 1]?.trim();

            if (!url || url.startsWith('#')) continue;
            if (!data[group]) data[group] = [];

            data[group].push({ name, url });
        }
    }
    // console.log('[sbjh] parsed groups:', Object.keys(data), 'total channels:', Object.values(data).reduce((s, v) => s + v.length, 0));
    return data;
}

let liveData = null;

async function getLiveData() {
    if (!liveData) {
        try {
            liveData = await parseM3U();
        } catch (e) {
            console.error('[sbjh] m3u fetch failed:', e.message);
            return {};
        }
    }
    return liveData;
}

async function init() {
    await getLiveData();
    return {};
}

async function home() {
    const data = await getLiveData();
    const groups = Object.keys(data);
    console.log('[sbjh] home called, groups:', groups.length, groups);
    const classes = groups.map(g => ({ type_id: g, type_name: g }));
    return { class: classes, filters: {} };
}

async function category(inReq) {
    const data = await getLiveData();
    const tid = inReq.body.id;
    const page = inReq.body.page || 1;
    console.log('[sbjh] category called, tid:', tid, 'exists:', !!data[tid], 'count:', (data[tid] || []).length);

    const list = (data[tid] || []).map(i => ({
        vod_id: i.url,
        vod_name: i.name,
        vod_pic: '',
        vod_remarks: '直播'
    }));

    return {
        page: parseInt(page),
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