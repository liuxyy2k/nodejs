const CLASSES = [
    { type_name: '电影台', type_id: 'TV电影台' },
    { type_name: '体育台', type_id: 'TV体育台' },
    { type_name: '18+直播台', type_id: '18+直播台' },
];

const CHANNELS = {
    TV电影台: [
        { name: 'CCTV6电影', url: 'http://107.150.60.122/live/cctv6hd.m3u8' },
        { name: 'NOW爆谷台', url: 'http://173.208.234.146/live/nowbg.m3u8' },
        { name: 'NOW星影台', url: 'http://173.208.234.146/live/nowxy.m3u8' },
        { name: '美亚电影HD', url: 'http://173.208.234.146/live/mymovie.m3u8' },
        { name: '龙华电影*线路1', url: 'https://cdn.qd.je/163189/lhdy' },
        { name: '龙华电影*线路2', url: 'http://iptv.4666888.xyz/iptv2A.php?id=45' },
        { name: '靖天电影', url: 'http://iptv.4666888.xyz/iptv2A.php?id=56' },
        { name: '東森电影', url: 'http://iptv.4666888.xyz/iptv2A.php?id=48' },
    ],
    TV体育台: [
        { name: 'CCTV5体育*线路1', url: 'http://173.208.212.130:8181/1080p/cctv5.m3u8' },
        { name: 'CCTV5体育*线路2', url: 'https://php.jdshipin.com:2096/TVOD/iptv.php?id=cctv5' },
        { name: 'CCTV5+体育赛事', url: 'http://107.150.60.122/live/cctv5p.m3u8' },
        { name: 'CCTV16奥林匹克*线路1', url: 'http://207.56.13.146:81/cdnlive/cctv16.m3u8' },
        { name: 'CCTV16奥林匹克*线路2', url: 'https://php.jdshipin.com:2096/TVOD/iptv.php?id=cctv16' },
    ],
    '18+直播台': [
        { name: '俄罗斯极限电影台', url: 'http://ef90a6cd.rossteleccom.net/iptv/2TBC4G2WWDG6RSUSN5SXSQEC/14158/index.m3u8' },
        { name: '惊艳台*线路1', url: 'http://15.204.105.50:25461/live/G2s9zK2n9m/xDtwVfWM8T/85.ts' },
        { name: '惊艳台*线路2', url: 'http://15.204.105.50:25461/live/G2s9zK2n9m/xDtwVfWM8T/87.ts' },
        { name: '潘多啦完美', url: 'http://15.204.105.50:25461/live/G2s9zK2n9m/xDtwVfWM8T/86.ts' },
        { name: '香蕉台', url: 'http://15.204.105.50:25461/live/G2s9zK2n9m/xDtwVfWM8T/117.ts' },
        { name: '松视1', url: 'http://15.204.105.50:25461/live/G2s9zK2n9m/xDtwVfWM8T/88.ts' },
        { name: '松视2', url: 'http://15.204.105.50:25461/live/G2s9zK2n9m/xDtwVfWM8T/89.ts' },
        { name: '松视3', url: 'http://15.204.105.50:25461/live/G2s9zK2n9m/xDtwVfWM8T/90.ts' },
        { name: '奧視', url: 'http://125.227.210.55:1022/VideoInput/play.ts' },
        { name: '奧視2', url: 'http://125.227.210.55:3031/VideoInput/play.ts' },
    ],
};

function parseVodId(id) {
    const s = String(id || '');
    const pos = s.lastIndexOf('_');
    if (pos === -1) return null;
    const tid = s.slice(0, pos);
    const idx = parseInt(s.slice(pos + 1), 10);
    if (Number.isNaN(idx)) return null;
    return { tid, idx };
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return { class: CLASSES };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const group = CHANNELS[tid] || [];
    const list = group.map((ch, idx) => ({
        vod_id: `${tid}_${idx}`,
        vod_name: ch.name,
        vod_pic: '',
        vod_remarks: tid,
        vod_play_url: ch.url,
    }));
    return {
        list,
        page: pg,
        pagecount: 1,
        limit: list.length,
        total: list.length,
    };
}

async function detail(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    const parsed = parseVodId(id);
    if (!parsed) return { list: [] };

    const group = CHANNELS[parsed.tid] || [];
    const ch = group[parsed.idx];
    if (!ch) return { list: [] };

    return {
        list: [
            {
                vod_id: id,
                vod_name: ch.name,
                vod_pic: '',
                vod_remarks: parsed.tid,
                vod_content: ch.name,
                vod_play_from: '直链',
                vod_play_url: '播放$' + ch.url,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const url = String(inReq.body.id || '');
    return {
        parse: 0,
        playUrl: '',
        url,
        header: {},
    };
}

export default {
    meta: {
        key: 'dszby',
        name: '🔥电视直播',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
    },
};
