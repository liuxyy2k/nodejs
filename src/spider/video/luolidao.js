import axios from 'axios';
import https from 'https';

const H = 'https://dag29jmgma1g.site';
const U =
    'Mozilla/5.0 (Linux; Android 12; TFY-AN00 Build/HONORTFY-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/92.0.4515.105 Mobile Safari/537.36 uni-app Html5Plus/1.0 (Immersed/33.0)';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const http = axios.create({
    timeout: 10000,
    httpsAgent,
    validateStatus: () => true,
    headers: {
        'User-Agent': U,
        'Accept-Encoding': 'gzip',
        'Content-Type': 'application/x-www-form-urlencoded',
    },
});

let token = '';

function parseExtend(extend) {
    if (!extend) return {};
    if (typeof extend === 'string') {
        try {
            return JSON.parse(extend);
        } catch {
            return {};
        }
    }
    return typeof extend === 'object' ? extend : {};
}

async function register() {
    try {
        const r = await http.post(
            `${H}/api/newreg.php`,
            new URLSearchParams({
                device: 'android',
                ntoken: '',
                channel_code: 'vbtQg9D8',
            }).toString(),
        );
        const data = typeof r.data === 'object' ? r.data : JSON.parse(r.data);
        token = data?.user?.token || '';
    } catch (e) {
        console.log('[REGISTER]', e.message || e);
    }
}

async function init(_inReq, _outResp) {
    token = '';
    await register();
    return {};
}

async function home(_inReq, _outResp) {
    try {
        const r = await http.get(`${H}/api/setapp.php`);
        const data = typeof r.data === 'object' ? r.data : JSON.parse(r.data);
        const classes = [];
        const filters = {};
        const tabs = [...(data.vodtab || []), ...(data.vodtaban || [])];
        for (const tab of tabs) {
            const tid = tab.type_id;
            classes.push({ type_id: tid, type_name: tab.type_name });
            const tags = tab.vodtags || [];
            if (tags.length) {
                const tagValues = [{ n: '全部', v: '' }];
                for (const tag of tags) {
                    tagValues.push({ n: tag.name, v: tag.name });
                }
                filters[tid] = [{ key: 'class', name: '标签', value: tagValues }];
            }
        }
        return { class: classes, filters };
    } catch (e) {
        console.log('[HOME]', e.message || e);
        return { class: [], filters: {} };
    }
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = parseInt(inReq.body.page, 10) || 1;
    const extend = parseExtend(inReq.body.extend);
    const num = (pg - 1) * 30;
    try {
        if (!token) await register();
        const r = await http.post(
            `${H}/api/vlist.php`,
            new URLSearchParams({
                num: String(num),
                pid: String(tid),
                area: '全部',
                vodclass: extend.class || '',
                vodyear: '全部',
                sort: '1',
                token,
            }).toString(),
        );
        const data = typeof r.data === 'object' ? r.data : JSON.parse(r.data);
        const videos = (data.list || []).map((item) => ({
            vod_id: String(item.vod_id || ''),
            vod_name: item.vod_name || '',
            vod_pic: item.vod_pic || '',
            vod_remarks: item.vod_class || item.vod_remarks || '',
        }));
        return { list: videos, page: pg };
    } catch (e) {
        console.log('[CATEGORY]', e.message || e);
        return { list: [] };
    }
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    try {
        if (!token) await register();
        const r = await http.post(
            `${H}/api/Get_vod_list.php`,
            new URLSearchParams({
                id: String(id),
                token,
                channel: '',
            }).toString(),
        );
        const res = typeof r.data === 'object' ? r.data : JSON.parse(r.data);
        const data = res.data || {};
        let playUrl = data.vod_play_url || '';
        if (!playUrl) {
            playUrl = '预览$' + (data.preview_url || '');
        }
        return {
            list: [
                {
                    vod_id: String(data.vod_id || id),
                    vod_name: data.vod_name || '',
                    vod_pic: data.vod_pic || '',
                    vod_remarks: data.vod_remarks || '',
                    vod_content: data.vod_blurb || '暂无简介',
                    vod_play_from: '萝莉岛',
                    vod_play_url: playUrl,
                },
            ],
        };
    } catch (e) {
        console.log('[DETAIL]', e.message || e);
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id || '',
        header: { 'User-Agent': U },
    };
}

async function search(_inReq, _outResp) {
    return { list: [] };
}

export default {
    meta: {
        key: 'luolidao',
        name: '🔥萝莉岛',
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
