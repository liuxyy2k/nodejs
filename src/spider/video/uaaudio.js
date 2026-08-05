import axios from 'axios';

/**
 * UAA[听] - https://www.uaa001.com
 * 有声小说 / ASMR 等音频 API
 */

const site = 'https://www.uaa001.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

const CLASSES = [
    { type_name: '有声小说', type_id: '有声小说' },
    { type_name: '淫词艳曲', type_id: '淫词艳曲' },
    { type_name: '激情骚麦', type_id: '激情骚麦' },
    { type_name: '寸止训练', type_id: '寸止训练' },
    { type_name: 'ASMR', type_id: 'ASMR' },
];

const http = axios.create({
    timeout: 15_000,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        Referer: `${site}/`,
    },
});

async function fetchJson(url) {
    try {
        const resp = await http.get(url, { responseType: 'json' });
        if (resp.status !== 200) return null;
        return resp.data;
    } catch (e) {
        console.log(`[uaaudio] fetch error: ${e.message}`);
        return null;
    }
}

function formatCount(count) {
    try {
        const n = parseInt(count, 10);
        if (Number.isNaN(n)) return String(count);
        if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
        return String(n);
    } catch {
        return String(count);
    }
}

function mapListItem(item) {
    return {
        vod_id: String(item.id || ''),
        vod_name: item.title || '',
        vod_pic: item.coverUrl || '',
        vod_remarks: item.categories || '',
    };
}

async function getChapterUrl(chapterId) {
    if (!chapterId) return '';
    const data = await fetchJson(`${site}/api/audio/app/audio/chapter?id=${chapterId}`);
    return data?.model?.chapterUrl || '';
}

async function buildPlayList(model) {
    const playList = [];

    if (Array.isArray(model.chapters) && model.chapters.length) {
        for (const chapter of model.chapters) {
            const chapterId = chapter.id || '';
            const chapterTitle = chapter.title || `第${chapter.order || 1}集`;
            const chapterUrl = await getChapterUrl(chapterId);
            if (chapterUrl) playList.push(`${chapterTitle}$${chapterUrl}`);
        }
    }

    if (!playList.length && model.latestReadChapterUrl) {
        playList.push(`第1集$${model.latestReadChapterUrl}`);
    }

    return playList.join('#');
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return { class: CLASSES, filters: {}, list: [] };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url = `${site}/api/audio/app/audio/search?category=${encodeURIComponent(tid)}&orderType=1&page=${pg}&searchType=1&size=42`;
    const data = await fetchJson(url);
    const items = data?.model?.data || [];
    const list = items.map(mapListItem);
    return { list, page: pg, pagecount: 9999, limit: 42, total: 999999 };
}

async function detail(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    const data = await fetchJson(`${site}/api/audio/app/audio/intro?id=${tid}`);
    const model = data?.model;
    if (!model) return { list: [] };

    const playUrl = await buildPlayList(model);

    const remarksParts = [];
    if (model.playCount != null) remarksParts.push(`收听:${formatCount(model.playCount)}`);
    if (model.collectCount != null) remarksParts.push(`收藏:${formatCount(model.collectCount)}`);

    return {
        list: [
            {
                vod_id: tid,
                vod_name: model.title || '',
                vod_pic: model.coverUrl || '',
                vod_content: model.intro || '',
                vod_actor: model.author || '未知',
                vod_area: model.categories || '',
                vod_remarks: remarksParts.length ? remarksParts.join(' | ') : model.updateState || '',
                vod_play_from: 'UAA',
                vod_play_url: playUrl,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    return {
        parse: 0,
        url: id,
        header: {
            'User-Agent': UA,
            Referer: `${site}/`,
        },
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
    const url = `${site}/api/audio/app/audio/search?category=&keyword=${encodeURIComponent(key)}&orderType=1&origin=&page=${pg}&searchType=1&size=32&tag=`;
    const data = await fetchJson(url);
    const items = data?.model?.data || [];
    return { list: items.map(mapListItem) };
}

export default {
    meta: {
        key: 'uaaudio',
        name: 'UAA[听]',
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
