import axios from "axios";
import { load } from "cheerio";

const siteUrl = "https://supjav.com/zh";
const headers = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
};

// FlareSolverr
async function request(url) {
    const resp = await axios.post("http://192.168.31.245:8191/v1", {
        cmd: "request.get",
        url,
        maxTimeout: 60000,
    });
    return resp.data.solution.response;
}

function parseVods($) {
    const list = [];

    $(".post").each((_, e) => {
        const href = $(e).find("a").attr("href") || "";
        const title = $(e).find("a").attr("title") || "";
        const pic = $(e)
            .find("img")
            .attr("src")
            ?.replace("!320x216.jpg", "") || "";

        list.push({
            vod_id: href,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: "",
        });
    });

    return list;
}

async function init() {
    return {};
}

async function home() {
    const classes = [
        { type_id: "popular", type_name: "热门" },
        { type_id: "category/censored-jav", type_name: "有码" },
        { type_id: "category/uncensored-jav", type_name: "无码" },
        { type_id: "category/amateur", type_name: "素人" },
        { type_id: "category/chinese-subtitles", type_name: "中文字幕" },
    ];

    return { class: classes, filters: {} };
}

async function category(inReq) {
    const tid = inReq.body.id;
    const pg = inReq.body.page || 1;

    const url = `${siteUrl}/${tid}/page/${pg}`;

    const html = await request(url);

    const $ = load(html);

    const list = parseVods($);

    return {
        page: parseInt(pg),
        pagecount: parseInt(pg) + 1,
        limit: 20,
        total: (parseInt(pg) + 1) * 20,
        list,
    };
}

async function detail(inReq) {
    const id = inReq.body.id;

    const html = await request(id);

    const $ = load(html);

    const name = $("h1").text().trim();
    const pic = $(".post img").attr("src") || "";

    const tracks = [];

    $("a.btn-server").each((_, e) => {
        const name = $(e).text().trim();
        const data = $(e).attr("data-link");

        tracks.push(`${name}$${data}`);
    });

    return {
        list: [
            {
                vod_id: id,
                vod_name: name,
                vod_pic: pic,
                vod_play_from: "SupJav",
                vod_play_url: tracks.join("#"),
            },
        ],
    };
}

async function play(inReq) {
    const data = inReq.body.id;
    const name = inReq.body.flag || '';
    const param = data.split("").reverse().join("");

    const url = `https://lk1.supremejav.com/supjav.php?c=${param}`;

    const res = await axios.get(url, {
        headers: {
            "User-Agent": headers["User-Agent"],
            Referer: `https://lk1.supremejav.com/supjav.php?l=${data}&bg=undefined`,
        },
    });
    const m3u8 = []
    let playUrl = "";
    if (name === 'TV') {
        const $ = load(res.data);
        playUrl = $('#video_player').attr('data-hash')
        // const resm3U8 = await axios.get(playUrl, {
        //     headers: {
        //         "User-Agent": headers["User-Agent"],
        //         Referer: `https://turbovidhls.com/`,
        //     },
        // });
        
        // playUrl = getBestM3U8(resm3U8.data)

    } else if (name === 'FST') {
        const $ = load(res.data);
        $('script').each((_, e) => {
            if ($(e).text().includes('eval')) {
                const script = $(e).text().replace('eval', '');
                const result = eval(script);
                playUrl = 'https://fc2stream.tv' + result.match(/"hls4":"([^"]+)"/)[1] 
            }
        });
        // const resm3U8 = await axios.get(playUrl, {
        //     headers: {
        //         "User-Agent": headers["User-Agent"],
        //         Referer: `https://fc2stream.tv/`,
        //     },
        // });
        // playUrl = getBestM3U8(resm3U8.data)

    } else if (name === 'ST') {
        const $ = load(res);
        let robot = $('#robotlink').text();
        robot = robot.substring(0, robot.indexOf('&token=') + 7);
        $('script').each((_, e) => {
            const script = $(e).text();
            if (script.includes("getElementById('robotlink')")) {
                const token = script.split('&token=')[1].split("'")[0];
                playUrl = 'https:/' + robot + token + '&stream=1';
            }
        });

    } else if (name === 'VOE') {
        const location = res.match(/window\.location\.href = '(.*?)';/)[1];
        const locres = await request(location);
        playUrl = locres.match(/prompt\("Node", "(.*?)"\);/)[1];
    }


    return {
        parse: 0,
        url: playUrl,
        header: {
            Referer: name === 'TV'? "https://turbovidhls.com/" : "https://fc2stream.tv/",
            "User-Agent": headers["User-Agent"],
        },
    };
}

function getBestM3U8(text) {

    const lines = text.split('\n')

    let bestUrl = ''
    let bestHeight = 0

    for (let i = 0; i < lines.length; i++) {

        const line = lines[i]

        if (line.includes('#EXT-X-STREAM-INF')) {

            const m = line.match(/RESOLUTION=\d+x(\d+)/)

            if (m) {

                const height = parseInt(m[1])

                const url = lines[i + 1]?.trim()

                if (height > bestHeight) {
                    bestHeight = height
                    bestUrl = url
                }
            }
        }
    }

    return bestUrl
}

async function search(inReq) {
    const wd = encodeURIComponent(inReq.body.wd);

    const url = `${siteUrl}/page/1?s=${wd}`;

    const html = await request(url);

    const $ = load(html);

    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: "supjav",
        name: "SupjAV",
        type: 3,
    },
    api: async (fastify) => {
        fastify.post("/init", init);
        fastify.post("/home", home);
        fastify.post("/category", category);
        fastify.post("/detail", detail);
        fastify.post("/play", play);
        fastify.post("/search", search);
    },
};