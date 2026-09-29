import axios from 'axios';
import crypto from 'crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site = 'https://oqqlk02.hyoeiqyrcp.top';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// // 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const headers = {
    'User-Agent': UA,
    'Origin': site
};

async function request(reqUrl) {
    await ensureCookie();
    const resp = await axios.get(reqUrl, {
        headers: headers,
        // httpsAgent: agent
    });
    return resp.data;
}

function decrypt(encrypted, key = "mh_aes=19@#$@%@#") {
    const iv = Buffer.from("5e1y6w452uqw9jq8", "utf8");

    const decipher = crypto.createDecipheriv(
        "aes-128-cbc",
        Buffer.from(key, "utf8"),
        iv
    );

    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}

function createGuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x'
            ? r
            : (r & 0x3 | 0x8);

        return v.toString(16);
    });
}

function randomNonce(length = 16) {
    const chars = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";

    let result = "";

    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }

    return result;
}

function md5Upper(text) {
    return crypto
        .createHash("md5")
        .update(text)
        .digest("hex")
        .toUpperCase();
}
async function ensureCookie() {
    if (headers['Cookie']) return;
    try {
        const resp = await axios.get(site + '/', { headers, maxRedirects: 5 });
        const setCookie = resp.headers['set-cookie'];
        if (setCookie && setCookie[0]) {
            headers['Cookie'] = setCookie[0].split(';')[0];
        }
    } catch (e) {
        const setCookie = e.response?.headers?.['set-cookie'];
        if (setCookie && setCookie[0]) {
            headers['Cookie'] = setCookie[0].split(';')[0];
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRoom(r) {
    const age = r.display_age ? ` (${r.display_age})` : '';
    return {
        vod_id:      r.username,
        vod_name:    `${r.username}${age}`,
        vod_pic:     r.img || '',
        vod_remarks: r.num_users,
    };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: [
            { type_id: '5',        type_name: '成人精品' },
            { type_id: '6',          type_name: '精品AV' }
        ],
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const pg     = parseInt(inReq.body.page) || 0;
    let url = `https://zdap.gkquu.cn:4438/zd/sp/getLabelVideoList?plateId=${tid}&labelId=${tid}&page=${pg}&size=25`;
    const timestamp = Date.now().toString();
    const guid = "5bafc85d-3f0a-4f7a-9c91-89c6a59d3d84";
    const nonce = randomNonce(16);

    const sign = md5Upper(
        timestamp + guid + nonce + "@1243asd31**21#"
    );
    headers['Sign'] = sign;
    headers['Timestamp'] = timestamp; 
    headers['Token'] = guid; 
    headers['Nonce'] = nonce;
    headers['Content-Type'] = 'application/x-www-form-urlencoded'; 
    headers['Url'] = 'oqqlk02.hyoeiqyrcp.top';
    
    const data = await request(url);
    const videos = decrypt(data.returnData)
    const json = JSON.parse(videos)
    const list = json.videoList
    let video = []
    video = list.map(item => {
        return {
            vod_id: item.videoUrlOne,
            vod_name: item.videoTitle,
            vod_pic: item.videoCover,
            vod_remarks: item.duration,
        }
    })
    return { page: pg, list: video };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    return {
        list: [{
            vod_id:        id,
            vod_name:      '',
            vod_pic:       '',
            vod_play_from: '就爱蜜桃臀',
            vod_play_url:  `播放$${id}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA},
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg  = parseInt(inReq.body.pg) || 0;

    const { data } = await http.get(`${site}/api/ts/roomlist/room-list/`, {
        params: {
            enable_recommendations: false,
            limit:  90,
            offset: pg * 90,
            query:  key,
        },
    });

    const list = (data.rooms || []).map(formatRoom);
    return { list };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'jsmtt',
        name: '🍑就爱蜜桃臀',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};