import axios from 'axios';

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36';
const WEB = 'https://www.myfreecams.com';
const API = 'https://api-edge.myfreecams.com/';
const MOBILE = 'https://m.myfreecams.com';

let host = 'https://app.myfreecams.com';
let cache = { ts: 0, rooms: [] };

function headers(extra = {}) {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/json',
        Origin: host,
        Connection: 'keep-alive',
        ...extra,
    };
}

async function getText(url, extra = {}) {
    try {
        const resp = await axios.get(url, {
            headers: headers(extra),
            timeout: 15000,
            responseType: 'text',
            validateStatus: () => true,
        });
        return { code: resp.status, text: typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data || '') };
    } catch {
        return { code: 0, text: '' };
    }
}

function avatar(rid) {
    rid = String(rid || '');
    if (!/^\d+$/.test(rid)) return '';
    return `https://img.mfcimg.com/photos2/${rid.slice(0, 3)}/${rid}/avatar.90x90.jpg`;
}

function cover(rid, snap = '', server = '') {
    if (snap) return snap;
    rid = String(rid || '');
    const m = String(server || '').match(/(\d+)$/);
    if (/^\d+$/.test(rid) && m) {
        const streamId = String(100000000 + parseInt(rid, 10));
        return `https://snap.mfcimg.com/snapimg/${m[1]}/853x480/mfc_a_${streamId}`;
    }
    return avatar(rid);
}

function unescapeHtml(s) {
    return String(s || '')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'");
}

function nextData(text) {
    const m = String(text).match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m) return {};
    try {
        return JSON.parse(unescapeHtml(m[1]));
    } catch {
        return {};
    }
}

async function apiJson(path) {
    const { text } = await getText(API + path, {
        Accept: 'application/json',
        Referer: host + '/',
    });
    try {
        const obj = JSON.parse(text);
        return obj.result || [];
    } catch {
        return [];
    }
}

function toVod(room) {
    const rid = String(room.id);
    const name = room.name || rid;
    let remark = room.topic || '在线直播';
    if (room.viewers) remark = `${remark} · ${room.viewers}人`;
    return {
        vod_id: rid,
        vod_name: name,
        vod_pic: room.pic || '',
        vod_remarks: remark,
        vod_tag: '直播',
        vod_year: '2026',
        vod_play_from: 'MyFreeCams',
        vod_play_url: `${name}$${rid}`,
    };
}

function parseRooms(text) {
    const found = {};
    const blobs = [];
    for (const key of ['__MFC_APP_USERS__', '__MFC_APP_LISTS__', 'users']) {
        const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^=]*=\\s*([^;]+)', 'g');
        let m;
        while ((m = re.exec(text))) blobs.push(m[1]);
    }

    const add = (x) => {
        if (!x || typeof x !== 'object') return;
        const users = x.users && typeof x.users === 'object' ? x.users : x;
        if (!users || typeof users !== 'object' || Array.isArray(users)) return;
        for (const [rid, u] of Object.entries(users)) {
            if (!u || typeof u !== 'object') continue;
            const name = u.name || u.username || u.slug;
            if (!name || !/^\d+$/.test(String(rid)) || u.isModel === false) continue;
            const online = Boolean(u.isOnline || u.isBroadcasting || u.isPublicShow);
            found[String(rid)] = {
                id: String(rid),
                name: String(name),
                slug: u.slug || String(name),
                pic: cover(rid, '', u.server || ''),
                status: online ? 'live' : 'offline',
                topic: u.topic || '',
                viewers: u.viewers || 0,
                score: u.rankingScore || 0,
            };
        }
    };

    for (const b of blobs) {
        try {
            add(JSON.parse(String(b).trim()));
        } catch {
            /* ignore */
        }
    }
    add(nextData(text));

    const tileRe = /tile-(\d+).*?slug["']?\s*[:=]\s*["']([A-Za-z0-9_]+)/gis;
    let tm;
    while ((tm = tileRe.exec(text))) {
        const rid = tm[1];
        if (!found[rid]) {
            found[rid] = {
                id: rid,
                name: tm[2],
                slug: tm[2],
                pic: avatar(rid),
                status: 'live',
                topic: '',
            };
        }
    }
    return Object.values(found);
}

async function onlineRooms() {
    if (cache.rooms.length && Date.now() - cache.ts < 45000) return cache.rooms;
    const rows = await apiJson('online_models');
    const out = [];
    for (const u of Array.isArray(rows) ? rows : []) {
        const rid = String(u.user_id || '');
        const name = u.username || rid;
        if (!rid || !name) continue;
        const snap = u.snap_url || '';
        out.push({
            id: rid,
            name,
            slug: name,
            pic: cover(rid, snap, u.server_name || ''),
            status: 'live',
            topic: u.topic || '',
            viewers: u.room_count || 0,
            score: u.cam_score || 0,
            server: u.server_name || '',
            rank: u.rank || 0,
            vidserver: u.vidserver_id || 0,
            server_type: u.video_server_type || '',
            snap_url: snap,
        });
    }
    cache = { ts: Date.now(), rooms: out };
    return out;
}

function roomInfo(rid, rooms) {
    rid = String(rid);
    const hit = rooms.find((x) => String(x.id) === rid);
    return hit || { id: rid, name: rid, slug: rid, pic: avatar(rid) };
}

async function init(inReq) {
    const extend = inReq?.body?.extend;
    if (typeof extend === 'string' && extend.trim()) {
        try {
            const cfg = JSON.parse(extend);
            if (cfg && typeof cfg === 'object' && cfg.host) host = String(cfg.host).replace(/\/$/, '');
        } catch {
            /* ignore */
        }
    }
    return {};
}

async function home() {
    let rooms = await onlineRooms();
    if (!rooms.length) {
        const { code, text } = await getText(host + '/?r=1');
        rooms = code ? parseRooms(text) : [];
    }
    return {
        class: [
            { type_id: 'live', type_name: '在线直播' },
            { type_id: 'all', type_name: '全部房间' },
        ],
        list: rooms.map(toVod),
        page: 1,
        pagecount: 1,
        limit: 50,
        total: rooms.length,
    };
}

async function category(inReq) {
    const tid = String(inReq.body.id || '');
    const pg = parseInt(inReq.body.page || 1, 10) || 1;
    let rooms = await onlineRooms();
    if (!rooms.length) return home();
    if (tid === 'live') rooms = rooms.filter((x) => x.status === 'live');
    return {
        list: rooms.map(toVod),
        page: pg,
        pagecount: 1,
        limit: 50,
        total: rooms.length,
    };
}

async function detail(inReq) {
    let rid = inReq.body.id;
    if (Array.isArray(rid)) rid = rid[0];
    rid = String(rid || '');
    const rooms = await onlineRooms();
    const info = roomInfo(rid, rooms);
    const slug = info.slug || rid;
    const url = `${WEB}/${encodeURIComponent(slug)}`;
    return {
        list: [
            {
                vod_id: rid,
                vod_name: slug,
                vod_pic: info.pic || avatar(rid),
                vod_content: '官方直播房间：' + url,
                vod_play_from: 'MyFreeCams',
                vod_play_url: `进入直播$${rid}`,
            },
        ],
    };
}

async function search(inReq) {
    const key = String(inReq.body.wd || '').trim().toLowerCase();
    const pg = parseInt(inReq.body.page || 1, 10) || 1;
    let rooms = await onlineRooms();
    if (key) {
        rooms = rooms.filter((x) => `${x.name || ''} ${x.topic || ''}`.toLowerCase().includes(key));
    }
    const rows = rooms.map(toVod);
    return { list: rows, page: pg, pagecount: 1, total: rows.length };
}

async function play(inReq) {
    let rid = inReq.body.id;
    if (Array.isArray(rid)) rid = rid[0];
    rid = String(rid || '');
    const rooms = await onlineRooms();
    const info = roomInfo(rid, rooms);
    const slug = info.slug || rid;
    const server = String(info.server || '');
    const vnum = server.match(/(\d+)$/);
    if (vnum) {
        const stream = /^\d+$/.test(rid) ? `mfc_a_${100000000 + parseInt(rid, 10)}` : `mfc_a_${rid}`;
        const url = `https://edgevideo.myfreecams.com/llhls/NxServer/${vnum[1]}/ngrp:${stream}.f4v_cmaf/playlist_sfm4s.m3u8`;
        return {
            parse: 0,
            jx: 0,
            url,
            format: 'application/x-mpegURL',
            header: {
                'User-Agent': UA,
                Referer: `${MOBILE}/${encodeURIComponent(slug)}`,
            },
        };
    }
    return {
        parse: 0,
        jx: 0,
        url: `${MOBILE}/models/${encodeURIComponent(slug)}`,
        header: { 'User-Agent': UA, Referer: MOBILE + '/' },
    };
}

export default {
    meta: {
        key: 'myfreecams',
        name: '🔴MyFreeCams',
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
