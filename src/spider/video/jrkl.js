import axios from "axios";
import { load } from "cheerio";
// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134 Safari/537.36";

let HOST = "https://kanliao25.com";


function e64(t) {
  return Buffer.from(t).toString("base64");
}

function d64(t) {
  return Buffer.from(t, "base64").toString();
}

async function request(url) {
  const resp = await axios.get(url, {
    headers: {
      "User-Agent": UA,
      Referer: HOST,
      Origin: HOST,
    },
    // httpsAgent: agent,
    timeout: 15000,
  });
  return resp.data;
}

function isAd(title) {
  const ads = ["热搜HOT", "DNS设置", "手机链接", "修改DNS"];
  return ads.some((a) => title.includes(a));
}


function parseList($) {
  const list = [];

  $("#index article, #archive article").each((_, e) => {
      const el = $(e);
      const a = el.find("a").attr("href") || "";
      const title =
        el.find("h2").text() ||
        el.find(".post-card-title").text() ||
        el.find(".entry-title").text();

      if (!a || !title) return;

      if (isAd(title)) return;

     let pic = '';

      const style = el.find("script").html();

      if (style) {
        const match = style.match(/'([^']+\.(jpg|png|jpeg|webp|gif))'/i);
        if (match) {
          pic = match[1];
        }
      }
      const remark = el.find(".post-card-info span").eq(1).text();
      list.push({
        vod_id: a,
        vod_name: title.trim(),
        vod_pic: HOST + pic,
        vod_remarks: remark.trim(),
      });
    });

  return list;
}

async function init(_inReq, _outResp) {
  return {};
}

async function home() {
  const classes = [
    { type_id: "/category/rdgz/", type_name: "热点关注" },
    { type_id: "/category/dy/", type_name: "抖音" },
    { type_id: "/category/ks/", type_name: "快手" },
    { type_id: "/category/douyu/", type_name: "斗鱼" },
    { type_id: "/category/hy/", type_name: "虎牙" },
    { type_id: "/category/tt/", type_name: "推特" },
    { type_id: "/category/wh/", type_name: "网红" },
    { type_id: "/category/asmr/", type_name: "ASMR" },
    { type_id: "/category/xb/", type_name: "X播" },
    { type_id: "/category/xsp/", type_name: "小视频" },
  ];

  return {
    class: classes,
    filters: {},
  };
}

async function category(inReq) {
  const tid = inReq.body.id;
  const page = parseInt(inReq.body.page) || 1;

  let url = `${HOST}${tid}`;

  if (page > 1) url += `${page}/`;

  const html = await request(url);
  const $ = load(html);

  const list = parseList($);

  return {
    page,
    pagecount: page + 1,
    list,
  };
}

async function detail(inReq) {
  const id = inReq.body.id;

  const url = id.startsWith("http") ? id : `${HOST}${id}`;

  const html = await request(url);
  const $ = load(html);

  const vod = {
    vod_id: id,
    vod_name: $("h1").text() || $(".post-title").text(),
    vod_pic: $('meta[property="og:image"]').attr("content") || "",
  };

  const play = [];

  $(".dplayer").each((i, el) => {
    const cfg = $(el).attr("data-config");
    if (!cfg) return;

    try {
      const json = JSON.parse(cfg);
      const u = json.video?.url;
      if (u) play.push(`视频${i + 1}$${u}`);
    } catch {}
  });

  if (play.length === 0) {
    $("video source").each((i, e) => {
      const src = $(e).attr("src");
      if (src) play.push(`视频${i + 1}$${src}`);
    });
  }

  vod.vod_play_from = "今日看料";
  vod.vod_play_url = play.join("#");

  return { list: [vod] };
}

async function play(inReq) {
  const url = inReq.body.id;

  return {
    parse: 0,
    url,
    header: {
      "User-Agent": UA,
      Referer: HOST,
    },
  };
}

async function search(inReq) {
  const wd = encodeURIComponent(inReq.body.wd);

  const html = await request(`${HOST}/tag/${wd}/`);
  const $ = load(html);

  const list = parseList($);

  return { list };
}


export default {
  meta: {
    key: "kanliao",
    name: "🍉今日看料",
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