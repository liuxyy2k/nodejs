ction th(e) {
  return (await se.get(e, {
    headers: {
      "User-Agent": UM,
      Referer: "https://ppp.porn/pp1/"
    }
  })).data
}
async function Iye(e, t) {
  let a = `${VM}/categories/`,
    s = await th(a),
    i = me(s),
    r = [];
  return i("section.padding-bottom-xl .card-cat-v2").each((n, o) => {
    let c = i(o).find(".card-cat-v2__title").text().trim(),
      l = i(o).find(".card-cat-v2__count").text().trim(),
      u = `${c}(${l})`,
      d = i(o).find("a").attr("href");
    r.push({
      type_id: d,
      type_name: u
    })
  }), {
    class: r
  }
}
async function Nye(e, t) {
  let a = e.body.id,
    i = e.body.page || 1;
  i == 0 && (i = 1);
  let r = `${a}?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=post_date&from=${i}`,
    n = await th(r),
    o = me(n),
    c = [];
  return o("#list_videos_common_videos_list_items .item").each((l, u) => {
    let d = o(u).find("h4 a").text().trim(),
      f = o(u).find("img").attr("data-src"),
      m = o(u).find("h4 a").attr("href"),
      p = o(u).find(".card-video__duration").text();
    c.push({
      vod_id: m,
      vod_name: d,
      vod_pic: f,
      vod_duration: p,
      vod_remarks: ""
    })
  }), {
    page: i,
    pagecount: c.length < 20 ? i : i + 1,
    list: c,
    filter: []
  }
}
async function Oye(e, t) {
  let a = e.body.id,
    s = await th(a),
    i = me(s),
    r = null;
  i("script").each((l, u) => {
    let d = i(u).html();
    if (d && d.includes(".m3u8")) {
      let f = d.match(/https?:\/\/[\w./-]+\.m3u8/);
      f && (r = f[0])
    }
  });
  let n = i("h1").text().trim() || i('meta[property="og:title"]').attr("content") || "",
    o = i('meta[property="og:image"]').attr("content") || i("img.video-thumb").attr("src") || "";
  return {
    list: [{
      vod_id: a,
      vod_name: n,
      vod_pic: o,
      vod_play_from: "PPP",
      vod_play_url: "\u64AD\u653E$" + r
    }]
  }
}
async function Pye(e, t) {
  return {
    url: e.body.id,
    header: {
      "User-Agent": UM,
      Referer: "https://ppp.porn/pp1/"
    }
  }
}
async function Dye(e, t) {
  let a = e.body.page,
    s = e.body.wd,
    i = a || 1;
  i == 0 && (i = 1);
  try {
    s = decodeURIComponent(s)
  } catch {}
  let r = encodeURIComponent(Xb(s)),
    n = `${VM}/search/${r}/?mode=async&function=get_block&block_id=list_videos_videos_list_search_result&q=${r}&category_ids=&sort_by=&from_videos=${i}&from_albums=${i}`,
    o = await th(n),
    c = me(o),
    l = [];
  return c("#list_videos_videos_list_search_result_items .item").each((u, d) => {
    let f = c(d).find("h4 a").text().trim(),
      m = c(d).find("img").attr("data-src"),
      p = c(d).find("h4 a").attr("href"),
      b = c(d).find(".card-video__duration").text();
    l.push({
      vod_id: p,
      vod_name: f,
      vod_pic: m,
      vod_duration: b,
      vod_remarks: ""
    })
  }), {
    page: i,
    pagecount: l.length < 20 ? i : i + 1,
    list: l
  }
}
var WM = {
  meta: {
    key: "ppp",
    name: "PPPHub",
    type: 3
  },
  api: async e => {
    e.post("/init", async () => ({})), e.post("/home", Iye), e.post("/category", Nye), e.post("/detail", Oye), e.post("/play", Pye), e.post("/search", Dye)
  }
};
dt();
ih();
var dq = Fc,
  iy = "https://missav.live",
  lxe = "/missavSite",
  dxe = "/missavCookie";
var rh = iy;
async function fxe(e) {
  try {
    let a = (await e.getData(lxe)).missav || "";
    return a ? a.startsWith("http") ? a : `https://${a}` : iy
  } catch {
    return iy
  }
}
async function pxe(e) {
  try {
    return await e.getData(dxe) || ""
  } catch {
    return ""
  }
}
async function mxe(e) {
  let t = {
      "User-Agent": dq,
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, compress, deflate, br"
    },
    a = await pxe(e);
  return a && (t.Cookie = a), t
}
async function ry(e, t, a = {}) {
  let s = await mxe(t);
  return (await se.get(e, {
    headers: {
      ...s,
      ...a
    }
  })).data
}
async function bxe(e, t) {
  rh = await fxe(e.server.db);
  let a = [{
      type_id: "dm278/cn/chinese-subtitle",
      type_name: "\u4E2D\u6587\u5B57\u5E55"
    }, {
      type_id: "dm539/cn/new",
      type_name: "\u6700\u8FD1\u66F4\u65B0"
    }, {
      type_id: "dm634/cn/release",
      type_name: "\u65B0\u4F5C\u4E0A\u5E02"
    }, {
      type_id: "dm817/cn/uncensored-leak",
      type_name: "\u65E0\u7801"
    }, {
      type_id: "dm170/cn/weekly-hot",
      type_name: "\u672C\u9031\u70ED\u95E8"
    }, {
      type_id: "dm270/cn/monthly-hot",
      type_name: "\u672C\u6708\u70ED\u95E8"
    }, {
      type_id: "dm541/cn/fc2",
      type_name: "FC2"
    }, {
      type_id: "dm63/cn/madou",
      type_name: "\u9EBB\u8C46"
    }],
    s = [];
  try {
    s = (await e.server.db.getData("/missavActors") || []).filter(o => o.enabled).map(o => o.name)
  } catch {
    s = []
  }
  let i = [{
      key: "filt",
      name: "\u7B5B\u9009",
      init: "all",
      value: [{
        n: "\u5168\u90E8",
        v: "all"
      }, {
        n: "\u5355\u4EBA\u4F5C\u54C1",
        v: "individual"
      }, {
        n: "\u591A\u4EBA\u4F5C\u54C1",
        v: "multiple"
      }, {
        n: "\u4E2D\u6587\u5B57\u5E55",
        v: "chinese-subtitle"
      }]
    }, {
      key: "sort",
      name: "\u6392\u5E8F",
      init: "released_at",
      value: [{
        n: "\u53D1\u884C\u65F6\u95F4",
        v: "released_at"
      }, {
        n: "\u6700\u8FD1\u66F4\u65B0",
        v: "published_at"
      }, {
        n: "\u6536\u85CF\u6570",
        v: "saved"
      }, {
        n: "\u4ECA\u65E5\u6D4F\u89C8\u6570",
        v: "today_views"
      }, {
        n: "\u672C\u5468\u6D4F\u89C8\u6570",
        v: "weekly_views"
      }, {
        n: "\u672C\u6708\u6D4F\u89C8\u6570",
        v: "monthly_views"
      }, {
        n: "\u603B\u6D4F\u89C8\u6570",
        v: "views"
      }]
    }, {
      key: "actor",
      name: "\u6F14\u5458\u7B5B\u9009",
      init: "all",
      value: [{
        n: "\u5168\u90E8",
        v: "all"
      }, ...s.map(n => ({
        n,
        v: n
      }))]
    }],
    r = {};
  for (let n of a) r[n.type_id] = i;
  return {
    class: a,
    filters: r
  }
}
async function hxe(e, t) {
  let a = e.body.id,
    s = e.body.page,
    i = e.body.filters || {},
    r = s || 1;
  if (r == 0 && (r = 1), i.actor && i.actor !== "all" && (a = `dm74/cn/actresses/${encodeURIComponent(i.actor)}`), i.filt && i.filt !== "all" && (a += `?filters=${i.filt}`), i.sort) {
    let u = a.includes("?") ? "&" : "?";
    a += `${u}sort=${i.sort}`
  }
  a.includes("?") ? a += `&page=${r}` : a += `?page=${r}`;
  let n = `${rh}/${a}`,
    o = await ry(n, e.server.db),
    c = me(o),
    l = [];
  return c(".thumbnail").each((u, d) => {
    let f = c(d).find(".text-secondary").attr("href"),
      m = c(d).find(".text-secondary").text().trim().replace(/\s+/g, " "),
      p = c(d).find(".w-full").attr("data-src"),
      b = c(d).find(".left-1").text().trim(),
      y = c(d).find(".right-1").text().trim();
    l.push({
      vod_id: f,
      vod_name: m,
      vod_pic: p || "",
      vod_remarks: b,
      vod_duration: y
    })
  }), {
    page: r,
    pagecount: l.length < 12 ? r : r + 1,
    list: l
  }
}
async function gxe(e, t) {
  let a = e.body.id,
    i = (await ry(a, e.server.db)).match(/surrit\.com\\\/(.+?)\\\/seek\\\/_0\.jpg/),
    r = [];
  if (i && i[1]) {
    let o = i[1];
    r.push({
      name: o.slice(0, 4).toUpperCase() + " Master",
      url: `https://surrit.com/${o}/playlist.m3u8`
    })
  }
  return {
    list: [{
      vod_id: a,
      vod_name: "",
      vod_pic: "",
      vod_play_from: "MissAV",
      vod_play_url: r.map(o => `${o.name}$${o.url}`).join("#")
    }]
  }
}
async function vxe(e, t) {
  return {
    url: e.body.id,
    header: {
      "User-Agent": dq,
      Referer: rh
    }
  }
}
async function yxe(e, t) {
  let a = e.body.page,
    s = e.body.wd,
    i = a || 1;
  i == 0 && (i = 1);
  let r = encodeURIComponent(s),
    n = `${rh}/cn/search/${r}?page=${i}`,
    o = await ry(n, e.server.db),
    c = me(o),
    l = [];
  return c(".thumbnail").each((u, d) => {
    let f = c(d).find(".text-secondary").attr("href"),
      m = c(d).find(".text-secondary").text().trim().replace(/\s+/g, " "),
      p = c(d).find(".w-full").attr("data-src"),
      b = c(d).find(".left-1").text().trim(),
      y = c(d).find(".right-1").text().trim();
    l.push({
      vod_id: f,
      vod_name: m,
      vod_pic: p || "",
      vod_remarks: b,
      vod_duration: y
    })
  }), {
    page: i,
    pagecount: l.length < 12 ? i : i + 1,
    list: l
  }
}
var fq = {
  meta: {
    key: "missav",
    name: "MissAV",
    type: 3
  },
  api: async e => {
    e.post("/init", async () => ({})), e.post("/home", bxe), e.post("/category", hxe), e.post("/detail", gxe), e.post("/play", vxe), e.post("/search", yxe)
  }
};
dt();
var pq = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)",
  Vr = "https://jable.tv",
  Td = [];
async function nh(e, t = "") {
  let a = e.includes("mode=async"),
    s = {
      "User-Agent": pq,
      Referer: t || Vr,
      "Accept-Language": "zh-CN,zh-Hans;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive"
    };
  return a ? (s.Accept = "application/json, text/plain, */*", s["X-Requested-With"] = "XMLHttpRequest", s["Sec-Fetch-Dest"] = "empty", s["Sec-Fetch-Mode"] = "cors", s["Sec-Fetch-Site"] = "same-origin") : (s.Accept = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8", s["Sec-Fetch-Dest"] = "document", s["Sec-Fetch-Mode"] = "navigate", s["Sec-Fetch-Site"] = t ? "same-origin" : "none", s["Sec-Fetch-User"] = "?1", s["Upgrade-Insecure-Requests"] = "1"), (await se.get(e, {
    headers: s
  })).data
}
async function xxe(e, t) {
  let a = [],
    s = ["\u9996\u9875"];
  a.push({
    type_id: Vr + "/models/",
    type_name: "\u6F14\u5458\u5217\u8868"
  }, {
    type_id: Vr + "/hot/",
    type_name: "\u70ED\u5EA6\u6392\u884C"
  });
  try {
    Td = (await e.server.db.getData("/jableActors") || []).filter(m => m.enabled).map(m => ({
      n: m.name,
      v: m.link
    }))
  } catch {
    Td = []
  }
  let i = `${Vr}/categories/?mode=async&function=get_block&block_id=list_categories_video_categories_list&sort_by=avg_videos_popularity`,
    r = await nh(i, Vr),
    n = me(r);
  n(".container .col-6.col-sm-4.col-lg-3").each((d, f) => {
    let m = n(f).find("h4").text(),
      p = n(f).find("a").attr("href");
    s.includes(m) || a.push({
      type_id: p,
      type_name: m
    })
  });
  let o = [{
      key: "sort",
      name: "\u6392\u5E8F",
      init: "video_viewed_month",
      value: [{
        n: "\u6240\u6709\u65F6\u95F4",
        v: "video_viewed"
      }, {
        n: "\u672C\u6708\u70ED\u95E8",
        v: "video_viewed_month"
      }, {
        n: "\u672C\u5468\u70ED\u95E8",
        v: "video_viewed_week"
      }, {
        n: "\u4ECA\u65E5\u70ED\u95E8",
        v: "video_viewed_today"
      }]
    }],
    c = [{
      key: "sort",
      name: "\u6392\u5E8F",
      init: "post_date",
      value: [{
        n: "\u8FD1\u671F\u6700\u4F73",
        v: "post_date_and_popularity"
      }, {
        n: "\u6700\u8FD1\u66F4\u65B0",
        v: "post_date"
      }, {
        n: "\u6700\u591A\u89C2\u770B",
        v: "video_viewed"
      }, {
        n: "\u6700\u9AD8\u6536\u85CF",
        v: "most_favourited"
      }]
    }],
    l = [c[0], {
      key: "actor",
      name: "\u6F14\u5458",
      init: Td.length > 0 ? Td[0].v : "",
      value: [...Td]
    }],
    u = {};
  for (let d of a) d.type_id === Vr + "/hot/" ? u[d.type_id] = o : d.type_id === Vr + "/models/" ? u[d.type_id] = l : u[d.type_id] = c;
  return {
    class: a,
    filters: u
  }
}
async function wxe(e, t) {
  let a = e.body.id,
    s = e.body.page || 1,
    i = s == 0 ? 1 : s,
    r = e.body.filters || {},
    n = a;
  r.actor ? n = `${a}/${r.actor}/` : n = a;
  let o = r.sort || "post_date",
    c = `${n}?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=${o}&from=${i}&_=${Date.now()}`,
    l = await nh(c, a),
    u = me(l),
    d = [];
  return u("#list_videos_common_videos_list .container .row > div").each((f, m) => {
    let p = u(m).find(".title a").attr("href"),
      b = u(m).find(".title a").text(),
      y = u(m).find(".img-box img").attr("data-src"),
      v = u(m).find(".label").text();
    d.push({
      vod_id: p + "?referer=" + a,
      vod_name: b,
      vod_pic: y,
      vod_remarks: v
    })
  }), {
    page: i,
    pagecount: d.length < 12 ? i : i + 1,
    list: d
  }
}
async function jxe(e, t) {
  let s = e.body.id.split("?referer="),
    i = s[0],
    r = s.length > 1 ? s[1] : "",
    n = await nh(i, r),
    l = me(n)("#site-content .container .col").eq(0).find("section").eq(0).find("script:last").text().match(/var hlsUrl = '(.*)';/)[1];
  return {
    list: [{
      vod_id: i,
      vod_name: "",
      vod_pic: "",
      vod_play_from: "Jable",
      vod_play_url: "\u64AD\u653E$" + l
    }]
  }
}
async function Exe(e, t) {
  let a = e.body.flag;
  return {
    url: e.body.id,
    header: {
      "User-Agent": pq
    }
  }
}
async function kxe(e, t) {
  let a = e.body.page,
    s = e.body.wd,
    i = a || 1;
  i == 0 && (i = 1);
  let r = encodeURIComponent(s),
    n = await nh(`${Vr}/search/${r}/?mode=async&function=get_block&block_id=list_videos_videos_list_search_result&q=${r}&sort_by=&from=${i}&_=${Date.now()}`),
    o = me(n),
    c = [];
  return o("#list_videos_videos_list_search_result .container .row > div").each((l, u) => {
    let d = o(u).find(".title a").attr("href"),
      f = o(u).find(".title a").text(),
      m = o(u).find(".img-box img").attr("data-src"),
      p = o(u).find(".label").text();
    c.push({
      vod_id: d,
      vod_name: f,
      vod_pic: m,
      vod_remarks: p
    })
  }), {
    page: i,
    pagecount: c.length < 12 ? i : i + 1,
    list: c
  }
}
var mq = {
  meta: {
    key: "jable",
    name: "Jable",
    type: 3
  },
  api: async e => {
    e.post("/init", async () => ({})), e.post("/home", xxe), e.post("/category", wxe), e.post("/detail", jxe), e.post("/play", Exe), e.post("/search", kxe)
  }
};
var bq = ne(require("os"), 1);

function _xe(e) {
  if (e.startsWith("192.168.")) return !0;
  let t = e.split(".");
  return t[0] === "172" && t[1] >= 16 && t[1] <= 31
}

function oh() {
  let e = bq.default.networkInterfaces(),
    t = null,
    a = null;
  for (let s of Object.keys(e))
    for (let i of e[s]) i.family === "IPv4" && !i.internal && (_xe(i.address) && (t = i.address), a || (a = i.address));
  return t || "127.0.0.1"
}

function hq(e) {
  let t = e.address().port;
  return `http://${oh()}:${t}/website/`
}
var Txe = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iI2ZmZmZmZiIvPjwvc3ZnPg==";
async function Sxe(e, t) {
  return {
    class: [{
      type_id: "qrcode",
      type_name: hq(e.server)
    }]
  }
}
async function Axe(e, t) {
  let s = e.body.page || 1;
  return s == 0 && (s = 1), {
    page: 1,
    pagecount: 1,
    limit: 1,
    total: 1,
    list: [{
      vod_id: "openInternalWebsite",
      vod_name: "\u70B9\u51FB\u914D\u7F6E",
      vod_pic: Txe
    }]
  }
}
async function Cxe(e, t) {
  return await e.server.messageToDart({
    action: "openInternalWebview",
    opt: {
      url: hq(e.server)
    }
  }), {
    list: [{
      vod_name: "",
      vod_content: ""
    }]
  }
}
async function Rxe(e, t) {
  return {
    url: ""
  }
}
async function Ixe(e, t) {
  return {
    page: 1,
    pagecount: 1,
    list: []
  }
}
async function Nxe(e, t) {
  return {}
}
var gq = {
  meta: {
    key: "qrcode",
    name: "\u914D\u7F6E\u9875\u9762",
    type: 3
  },
  api: async e => {
    e.post("/init", Nxe), e.post("/home", Sxe), e.post("/category", Axe), e.post("/detail", Cxe), e.post("/play", Rxe), e.post("/search", Ixe)
  }
};
cm();
var vq = new Map,
  Oxe = 5 * 60 * 1e3;
async function ny(e, t) {
  let a = vq.get(e);
  if (a && Date.now() - a.timestamp < Oxe) return a.channels;
  try {
    let r = (await Sr.get(e, {
        timeout: 1e4,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      })).data.split(`
`),
      n = [],
      o = 0,
      c = 0;
    for (let l of r) {
      let u = l;
      if (l = l.trim(), !l || l.startsWith("#")) continue;
      if (l.startsWith("http")) {
        o++, n.push({
          name: `\u9891\u9053${o}`,
          url: l
        });
        continue
      }
      let d = l.match(/^(.+?),(https?:\/\/.+)$/);
      if (d) {
        n.push({
          name: d[1].trim(),
          url: d[2].trim()
        });
        continue
      }
      l && !l.startsWith("#") && (c++, c <= 3 && console.log(`[${t}] \u65E0\u6CD5\u89E3\u6790\u7684\u884C: ${u}`))
    }
    return c > 0 && console.log(`[${t}] \u8DF3\u8FC7 ${c} \u884C\u65E0\u6CD5\u89E3\u6790\u7684\u5185\u5BB9`), vq.set(e, {
      channels: n,
      timestamp: Date.now()
    }), console.log(`[${t}] \u89E3\u6790\u6210\u529F\uFF0C\u5171 ${n.length} \u4E2A\u9891\u9053`), n
  } catch (s) {
    return console.error(`[${t}] \u89E3\u6790\u76F4\u64AD\u6E90\u5931\u8D25:`, s.message), []
  }
}
var yq = {
  meta: {
    key: "liveSource",
    name: "\u{1F4FA} \u76F4\u64AD\u6E90",
    type: 3
  },
  api: async (e, {
    db: t
  }) => {
    async function a() {
      try {
        return (await t.getData("/liveSources") || []).filter(u => u.enabled !== !1)
      } catch {
        return []
      }
    }
    async function s(l, u) {
      return {}
    }
    async function i(l, u) {
      return {
        class: (await a()).map(m => ({
          type_id: String(m.id),
          type_name: m.name
        }))
      }
    }
    async function r(l, u) {
      let d = await a(),
        f = l.body.id,
        m = l.body.page || 1,
        p = d.find(g => String(g.id) === String(f));
      if (!p) return {
        page: m,
        pagecount: 1,
        list: [],
        filter: {}
      };
      let b = await ny(p.url, p.name),
        y = 50,
        v = (m - 1) * y,
        x = b.slice(v, v + y).map((g, _) => ({
          vod_id: `${p.id}_${v+_}`,
          vod_name: g.name,
          vod_pic: "",
          vod_remarks: "\u76F4\u64AD"
        }));
      return {
        page: m,
        pagecount: Math.ceil(b.length / y) || 1,
        list: x,
        filter: {}
      }
    }
    async function n(l, u) {
      let f = String(l.body.id).split("_");
      if (f.length !== 2) return {
        list: []
      };
      let [m, p] = f, y = (await a()).find(x => String(x.id) === String(m));
      if (!y) return {
        list: []
      };
      let v = await ny(y.url, y.name),
        w = parseInt(p);
      if (w >= 0 && w < v.length) {
        let x = v[w];
        return {
          list: [{
            vod_name: x.name,
            vod_play_from: y.name,
            vod_play_url: `\u64AD\u653E$${x.url}`
          }]
        }
      }
      return {
        list: []
      }
    }
    async function o(l, u) {
      return {
        url: l.body.id
      }
    }
    async function c(l, u) {
      let d = l.body.wd?.toLowerCase() || "",
        f = await a(),
        m = [];
      for (let x of f)(await ny(x.url, x.name)).filter(T => T.name.toLowerCase().includes(d)).forEach((T, E) => {
        m.push({
          sourceId: x.id,
          sourceName: x.name,
          channel: T,
          channelIndex: E
        })
      });
      let p = 50,
        b = l.body.page || 1,
        y = (b - 1) * p,
        w = m.slice(y, y + p).map(x => ({
          vod_id: `${x.sourceId}_${x.channelIndex}`,
          vod_name: x.channel.name,
          vod_pic: "",
          vod_remarks: x.sourceName
        }));
      return {
        page: b,
        pagecount: Math.ceil(m.length / p) || 1,
        list: w
      }
    }
    e.post("/init", s), e.post("/home", i), e.post("/category", r), e.post("/detail", n), e.post("/play", o), e.post("/search", c)
  }
};
dt();
var Pxe = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1",
  Hi = "https://www.xvideos.com";
async function Sd(e) {
  return (await se(e, {
    method: "get",
    headers: {
      "User-Agent": Pxe,
      Referer: Hi
    }
  })).data
}
async function Dxe(e, t) {
  return {}
}
async function Lxe(e, t) {
  return {
    class: [{
      type_id: "/new",
      type_name: "\u6700\u65B0"
    }, {
      type_id: "/tags/ai",
      type_name: "AI"
    }, {
      type_id: "/tags/asmr",
      type_name: "ASMR"
    }, {
      type_id: "/channels",
      type_name: "\u9891\u9053"
    }, {
      type_id: "/pornstars",
      type_name: "\u8272\u60C5\u660E\u661F"
    }]
  }
}
async function Bxe(e, t) {
  let a = e.body.id,
    s = e.body.pg || e.body.page || 1;
  if (!a) return {
    list: []
  };
  let i = Hi;
  a === "/new" ? i = `${Hi}${a}/${s}` : a === "/channels" ? i = `${Hi}${a}?p=${s-1}` : a === "/pornstars" ? i = `${Hi}${a}?p=${s-1}` : (i = `${Hi}${a}`, s > 1 && (i += `/${s-1}`));
  let r = await Sd(i),
    n = me(r),
    o = [];
  return a === "/channels" || a === "/pornstars" ? n('div[id*="profile_"], .thumb-block-profile').each((c, l) => {
    let u = n(l).find("a").first(),
      f = n(l).find(".profile-name, .name, .title").first().text().replace(/[\n\t]/g, " ").replace(/\s+/g, " ").trim();
    f || (f = n(l).find(".name, .title").text().trim());
    let m = u.attr("href"),
      p = "",
      b = n(l).find("script").html();
    if (b) {
      let y = b.match(/src=["'](.*?)["']/);
      y && (p = y[1])
    }
    if (!p) {
      let y = n(l).find("img").first();
      p = y.attr("src") || y.attr("data-src")
    }
    m && f && o.push({
      vod_id: m,
      vod_name: f,
      vod_pic: p,
      vod_remarks: "\u9891\u9053/\u660E\u661F"
    })
  }) : n(".thumb-block").each((c, l) => {
    let u = n(l).find(".thumb a"),
      d = n(l).find("p.title a");
    if (n(l).hasClass("thumb-block-profile")) return;
    let f = u.find("img"),
      m = d.attr("href"),
      p = d.attr("title") || d.text().trim(),
      b = f.attr("data-src") || f.attr("src"),
      y = n(l).find(".duration").text().trim();
    m && p && o.push({
      vod_id: m,
      vod_name: p,
      vod_pic: b,
      vod_remarks: y
    })
  }), {
    page: parseInt(s),
    list: o
  }
}
async function Fxe(e, t) {
  let a = Array.isArray(e.body.id) ? e.body.id : [e.body.id],
    s = [];
  for (let i of a) {
    let r = i.startsWith("http") ? i : `${Hi}${i}`;
    if ((i.match(/^\/channels\//) || i.match(/^\/pornstars\//) || i.match(/^\/models\//) || i.match(/^\/profiles\//) || i.match(/^\/[^/]+$/)) && !i.match(/\/video\d+/)) {
      let p = await Sd(r),
        b = me(p),
        y = [];
      b(".thumb-block").each((w, x) => {
        let g = b(x).find("p.title a"),
          _ = g.attr("href"),
          T = g.attr("title") || g.text().trim();
        _ && T && y.push(`${T}$${_}`)
      });
      let v = b("title").text().split("-")[0].trim();
      if (y.length > 0) {
        s.push({
          vod_id: i,
          vod_name: v,
          vod_pic: "",
          vod_remarks: "Playlist",
          vod_content: `Found ${y.length} videos.`,
          vod_play_from: "XVideos",
          vod_play_url: y.join("#")
        });
        continue
      }
    }
    let n = await Sd(r),
      o = me(n),
      c = {
        vod_id: i,
        vod_name: "",
        vod_pic: "",
        vod_remarks: "",
        vod_content: "",
        vod_play_url: ""
      };
    try {
      let p = o('script[type="application/ld+json"]').html();
      if (p) {
        let b = JSON.parse(p);
        b.name && (c.vod_name = b.name), b.thumbnailUrl && (c.vod_pic = Array.isArray(b.thumbnailUrl) ? b.thumbnailUrl[0] : b.thumbnailUrl), b.contentUrl && (c.vod_play_url = `MP4$${b.contentUrl}`)
      }
    } catch (p) {
      console.error("JSON-LD parse error:", p)
    }
    let l = p => {
      let b = n.match(p);
      return b ? b[1] : null
    };
    if (!c.vod_name) {
      let p = l(/setVideoTitle\(['"](.*?)['"]\)/);
      p && (c.vod_name = p)
    }
    if (!c.vod_pic) {
      let p = l(/setThumbUrl\(['"](.*?)['"]\)/);
      p && (c.vod_pic = p)
    }
    let u = l(/setVideoHLS\(['"](.*?)['"]\)/),
      d = l(/setVideoUrlHigh\(['"](.*?)['"]\)/),
      f = l(/setVideoUrlLow\(['"](.*?)['"]\)/),
      m = "";
    u && (m += `HLS$${u}`), d && (m && (m += "#"), m += `MP4_High$${d}`), f && (m && (m += "#"), m += `MP4_Low$${f}`), m && (c.vod_play_url = m), c.vod_play_from = "XVideos", s.push(c)
  }
  return {
    list: s
  }
}
async function zxe(e, t) {
  let a = e.body.id,
    s = a.startsWith("http") ? a : `${Hi}${a}`,
    i = await Sd(s),
    r = u => {
      let d = i.match(u);
      return d ? d[1] : null
    },
    n = r(/setVideoHLS\(['"](.*?)['"]\)/),
    o = r(/setVideoUrlHigh\(['"](.*?)['"]\)/),
    c = r(/setVideoUrlLow\(['"](.*?)['"]\)/);
  return {
    url: n || o || c || a
  }
}
async function $xe(e, t) {
  let a = e.body.wd,
    s = e.body.page || 1,
    i = `${Hi}/?k=${encodeURIComponent(a)}&p=${s-1}`,
    r = await Sd(i),
    n = me(r),
    o = [];
  return n(".mozaique .thumb-block").each((c, l) => {
    let u = n(l).find(".thumb a"),
      d = n(l).find("p.title a"),
      f = u.find("img"),
      m = d.attr("href"),
      p = d.attr("title") || d.text().trim(),
      b = f.attr("data-src") || f.attr("src"),
      y = n(l).find(".duration").text().trim();
    m && p && o.push({
      vod_id: m,
      vod_name: p,
      vod_pic: b,
      vod_remarks: y
    })
  }), {
    list: o,
    page: parseInt(s)
  }
}
var xq = {
  meta: {
    key: "xvideos",
    name: "XVideos",
    type: 3
  },
  api: async e => {
    e.post("/init", Dxe), e.post("/home", Lxe), e.post("/category", Bxe), e.post("/detail", Fxe), e.post("/play", zxe), e.post("/search", $xe)
  }
};
dt();
var wq = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.54 Safari/537.36";
var $c = "https://www.xxxfollow.com";
async function oy(e) {
  return (await se(e, {
    method: "get",
    headers: {
      "User-Agent": wq,
      Referer: $c
    }
  })).data
}
async function Mxe(e, t) {
  return {}
}
async function qxe(e, t) {
  return {
    class: [{
      type_id: "/videos",
      type_name: "\u6700\u65B0\u89C6\u9891"
    }, {
      type_id: "/most-popular",
      type_name: "\u70ED\u95E8\u89C6\u9891"
    }, {
      type_id: "/tag/teen-18",
      type_name: "Teen 18+"
    }, {
      type_id: "/tag/fastfap",
      type_name: "FastFap"
    }, {
      type_id: "/tag/masturbation",
      type_name: "\u81EA\u6170"
    }, {
      type_id: "/tag/asian",
      type_name: "\u4E9A\u6D32"
    }, {
      type_id: "/tag/japanese",
      type_name: "\u65E5\u672C"
    }, {
      type_id: "/tag/chinese",
      type_name: "\u4E2D\u56FD"
    }]
  }
}
async function Hxe(e, t) {
  let a = e.body.id,
    s = e.body.page || 1;
  if (!a) return {
    list: []
  };
  let i = $c;
  a === "/videos" || a === "/most-popular" ? (i = `${$c}${a}`, s > 1 && (i += `?page=${s}`)) : (i = `${$c}${a}`, s > 1 && (i += `?page=${s}`));
  let r = await oy(i),
    n = me(r),
    o = [];
  return n('a[href*="/"]').each((c, l) => {
    let u = n(l).attr("href");
    if (!u || !u.match(/\/\d+/) || u.startsWith("/tag/") || u.startsWith("/search/") || u.startsWith("/support/")) return;
    let d = n(l).find("img").first(),
      f = d.attr("src") || d.attr("data-src");
    if (!f) return;
    let m = n(l).text().trim();
    m || (m = d.attr("alt")), m = m ? m.replace(/[\n\t]/g, "").trim() : "Unknown", o.push({
      vod_id: u,
      vod_name: m,
      vod_pic: f,
      vod_remarks: ""
    })
  }), {
    page: parseInt(s),
    list: o
  }
}
async function Uxe(e, t) {
  let a = Array.isArray(e.body.id) ? e.body.id : [e.body.id],
    s = [];
  for (let i of a) {
    let r = i.startsWith("http") ? i : `${$c}${i}`,
      n = await oy(r),
      o = n.match(/window\.__PRELOAD_STATE__\s*=\s*(\{.*?\})\s*;/s);
    if (o || (o = n.match(/window\.__PRELOAD_STATE__\s*=\s*(\{.*?\})\s*</s)), o || (o = n.match(/window\.__PRELOAD_STATE__\s*=\s*(\{.*\})/)), !o) {
      console.error("Failed to find PRELOAD_STATE in HTML");
      continue
    }
    let c;
    try {
      c = JSON.parse(o[1])
    } catch (b) {
      console.error("Failed to parse PRELOAD_STATE JSON", b);
      continue
    }
    let l = Object.keys(c).find(b => b.startsWith("post-"));
    if (!l) continue;
    let u = c[l].post;
    if (!u) continue;
    let d = u.media || [],
      f = "",
      m = u.text || u.slug || "Unknown",
      p = "";
    if (d.length > 0) {
      let b = d[0];
      p = b.thumb_url || b.thumb_webp_url;
      let y = [];
      b.url && y.push(`Original$${b.url}`), b.sd_url && y.push(`SD$${b.sd_url}`), b.fhd_url && y.push(`FHD$${b.fhd_url}`), b.uhd_url && y.push(`UHD$${b.uhd_url}`), f = y.join("#")
    }
    s.push({
      vod_id: i,
      vod_name: m,
      vod_pic: p,
      vod_remarks: "",
      vod_content: m,
      vod_play_from: "XXXFollow",
      vod_play_url: f
    })
  }
  return {
    list: s
  }
}
async function Vxe(e, t) {
  return {
    url: e.body.id
  }
}
async function Wxe(e, t) {
  let a = e.body.wd,
    s = e.body.page || 1,
    i = `${$c}/tag/${encodeURIComponent(a)}`;
  s > 1 && (i += `?page=${s}`);
  let r = await oy(i),
    n = me(r),
    o = [];
  return n('a[href*="/"]').each((c, l) => {
    let u = n(l).attr("href");
    if (!u || !u.match(/\/\d+/) || u.startsWith("/tag/") || u.startsWith("/search/") || u.startsWith("/support/")) return;
    let d = n(l).find("img").first(),
      f = d.attr("src") || d.attr("data-src");
    if (!f) return;
    let m = n(l).text().trim() || d.attr("alt");
    m = m ? m.replace(/[\n\t]/g, "").trim() : "Unknown", o.push({
      vod_id: u,
      vod_name: m,
      vod_pic: f,
      vod_remarks: ""
    })
  }), {
    page: parseInt(s),
    list: o
  }
}
var jq = {
  meta: {
    key: "xxxfollow",
    name: "XXXFollow",
    type: 3
  },
  api: async e => {
    e.post("/init", Mxe), e.post("/home", qxe), e.post("/category", Hxe), e.post("/detail", Uxe), e.post("/play", Vxe), e.post("/search", Wxe)
  }
};
dt();
var Mc = ne(B5(), 1);
dt();
var cy = {
    mode: "CBC",
    padding: "Pkcs7",
    media_key: "f5d965df75336270",
    media_iv: "97b60394abc2fbe1",
    key: "2acf7e91e9864673",
    iv: "1c29882d3ddfcfd6",
    sign_key: "5589d41f92a597d016b037ac37db243d"
  },
  Eq = e => Mc.default.enc.Utf8.parse(e);

function Gxe(e) {
  return Buffer.from(e).toString("base64")
}

function Yxe(e) {
  return Mc.default.AES.decrypt(e, Eq(cy.media_key), {
    iv: Eq(cy.media_iv),
    mode: Mc.default.mode[cy.mode],
    padding: Mc.default.pad.NoPadding
  }).toString(Mc.default.enc.Base64)
}
async function kq(e) {
  let a = (await se.get(e, {
      responseType: "arraybuffer",
      timeout: 5e3
    })).data,
    s = Gxe(a),
    i = Yxe(s);
  return `data:image/${e.split(".").pop()};base64,${i}`
}
var Sq = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0",
  qc = "https://51cg1.com",
  Kxe = "chigua",
  _q = new Map,
  Aq = new Map,
  Tq = new Map,
  uy = new Map,
  Jxe = 6,
  ch = 0,
  ly = [];

function Xxe(e) {
  try {
    let a = new URL(e).pathname.match(/\.([^.?#]+)(?:[?#]|$)/);
    return a ? a[1] : "jpg"
  } catch {
    return "jpg"
  }
}

function Cq(e) {
  let t = e && e.headers || {},
    a = String(t["x-forwarded-proto"] || e && e.protocol || "http").split(",")[0].trim(),
    s = t.host || "localhost",
    i = e && e.server && e.server.prefix || `/spider/${Kxe}/3`;
  return `${a}://${s}${i}`
}

function Rq(e, t, a) {
  if (!e) return null;
  if (e.startsWith("http")) {
    let s = t + "|" + e,
      i = Tq.get(s);
    if (i) return i;
    let r = a.replace(/\//g, "_").replace(/^_/, "").replace(/_$/, "") || `img_${Date.now()}`,
      n = Xxe(e),
      o = `${r}.${n}`;
    Aq.set(o, e);
    let c = `${t}/proxy/image/${o}`;
    return Tq.set(s, c), c
  }
  return e
}
async function uh(e, t = qc) {
  return (await se.get(e, {
    headers: {
      "User-Agent": Sq,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      "X-Requested-With": ""
    }
  })).data
}
async function Qxe(e, t) {
  return {}
}
async function Zxe(e, t) {
  let a = await uh(qc),
    s = me(a),
    i = [{
      type_id: "/",
      type_name: "\u9996\u9875"
    }, {
      type_id: "/category/wpcz/",
      type_name: "\u4ECA\u65E5\u5403\u74DC"
    }];
  return s(".dropdown-menu.no-dropdown-close a").each((r, n) => {
    let o = s(n).attr("title"),
      c = s(n).attr("href");
    c.includes("category") && i.push({
      type_id: encodeURI(c),
      type_name: o
    })
  }), {
    class: i
  }
}
async function e9e(e, t) {
  let a = e.body.id,
    s = e.body.page || 1;
  s == 0 && (s = 1);
  let i = `${qc}${a}`;
  s > 1 && (i += (a === "/" ? "page/" : "") + `${s}/`);
  let r = await uh(i),
    n = me(r),
    o = n("article[itemscope]").toArray(),
    c = [];
  for (let d of o) {
    let f = n(d),
      m = f.find("> a").attr("href") || f.find("a").attr("href"),
      p = f.find(".post-card-title").clone().children().remove().end().text().trim(),
      y = f.find("script").html()?.match(/loadBannerDirect\('([^']+)'/)?.[1];
    p && c.push({
      link: m,
      title: p,
      imgUrl: y
    })
  }
  let l = Cq(e),
    u = c.map(d => ({
      vod_id: d.link,
      vod_name: d.title,
      vod_pic: Rq(d.imgUrl, l, d.link) || "",
      vod_remarks: ""
    }));
  return {
    page: s,
    pagecount: u.length < 12 ? s : s + 1,
    list: u
  }
}
async function t9e(e, t) {
  let a = e.body.id;
  url = `${qc}${a}`;
  let s = await uh(url),
    i = "",
    r = s.match(/"url":"(https?:\\?\/\\?\/[^"]+\.m3u8[^"]*)"/);
  return r && (i = r[1].replace(/\\\//g, "/")), {
    list: [{
      vod_id: a,
      vod_name: "",
      vod_pic: "",
      vod_play_from: "HLS",
      vod_play_url: i ? `\u64AD\u653E$${i}` : ""
    }]
  }
}
async function a9e(e, t) {
  return {
    url: e.body.id,
    header: {
      "User-Agent": Sq,
      Referer: qc
    }
  }
}
async function s9e(e, t) {
  let a = e.body.wd,
    s = e.body.page || 1;
  s == 0 && (s = 1);
  let i = `${qc}/search/${encodeURIComponent(a)}/${s}/`,
    r = await uh(i),
    n = me(r),
    o = n("article[itemscope]").toArray(),
    c = [];
  for (let d of o) {
    let f = n(d),
      m = f.find("> a").attr("href") || f.find("a").attr("href"),
      p = f.find(".post-card-title").clone().children().remove().end().text().trim(),
      y = f.find("script").html()?.match(/loadBannerDirect\('([^']+)'/)?.[1];
    p && c.push({
      link: m,
      title: p,
      imgUrl: y
    })
  }
  let l = Cq(e),
    u = c.map(d => ({
      vod_id: d.link,
      vod_name: d.title,
      vod_pic: Rq(d.imgUrl, l, d.link) || "",
      vod_remarks: ""
    }));
  return {
    page: s,
    pagecount: u.length < 12 ? s : s + 1,
    list: u
  }
}
var Iq = {
  meta: {
    key: "chigua",
    name: "51\u5403\u74DC",
    type: 3
  },
  api: async e => {
    function t() {
      for (; ly.length > 0 && ch < Jxe;) {
        let {
          task: a
        } = ly.shift();
        ch++, a().finally(() => {
          ch--, t()
        })
      }
    }
    e.get("/proxy/image/:filename", async (a, s) => {
      let {
        filename: i
      } = a.params, r = _q.get(i);
      if (r) {
        let l = r.match(/^data:image\/(\w+);base64,(.+)$/);
        s.type(`image/${l[1]}`).send(Buffer.from(l[2], "base64"));
        return
      }
      let n = uy.get(i);
      if (n) {
        if (r = await n, r) {
          let l = r.match(/^data:image\/(\w+);base64,(.+)$/);
          s.type(`image/${l[1]}`).send(Buffer.from(l[2], "base64"));
          return
        }
        s.code(500).send("Decryption failed");
        return
      }
      let o = Aq.get(i);
      if (!o) {
        s.code(404).send("Not Found");
        return
      }
      let c = async () => {
        try {
          let l = await kq(o);
          return l && (console.log(`[chigua] \u5B9E\u65F6\u89E3\u5BC6\u56FE\u7247: ${o} [\u6D3B\u8DC3: ${ch}]`), _q.set(i, l)), l
        } catch (l) {
          return console.error(`[chigua] \u56FE\u7247\u89E3\u5BC6\u5931\u8D25: ${o}`, l.message), null
        } finally {
          uy.delete(i)
        }
      };
      if (n = new Promise((l, u) => {
          ly.push({
            task: async () => {
              try {
                let d = await c();
                l(d)
              } catch (d) {
                u(d)
              }
            }
          })
        }), uy.set(i, n), t(), r = await n, r) {
        let l = r.match(/^data:image\/(\w+);base64,(.+)$/);
        s.type(`image/${l[1]}`).send(Buffer.from(l[2], "base64"))
      } else s.code(500).send("Decryption error")
    }), e.post("/init", Qxe), e.post("/home", Zxe), e.post("/category", e9e), e.post("/detail", t9e), e.post("/play", a9e), e.post("/search", s9e)
  }
};
dt();
var Nq = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)",
  Wn = "https://hanime1.me",
  i9e = ["\u65B0\u756A\u9810\u544A", "H\u6F2B\u756B", "\u7121\u78BC\u9EC3\u6CB9"];
async function Ad(e, t = Wn) {
  return (await se.get(e, {
    headers: {
      "User-Agent": Nq,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      "X-Requested-With": "",
      Referer: t
    }
  })).data
}
async function r9e(e, t) {
  return {}
}
async function n9e(e, t) {
  let a = await Ad(Wn),
    s = me(a),
    i = [];
  return s("#main-nav-home > a.nav-item").each((r, n) => {
    let o = s(n).text(),
      c = s(n).attr("href");
    i9e.some(l => o.includes(l)) || i.push({
      type_id: encodeURI(c),
      type_name: o
    })
  }), {
    class: i,
    filters: {}
  }
}
async function o9e(e, t) {
    let a = e.body.id,
      s = e.body.page || 1;
    s == 0 && (s = 1);
    let i = a;
    i && !i.startsWith("http") && (i = Wn + (i.startsWith("/") ? i : "/" + i)), s > 1 && (i += (i.includes("?") ? "&" : "?") + `page=${s}`);
    let r = await Ad(i),
      n = me(r),
      o = [],
      c = n(".video-item-container");
    c.length === 0 && (c = n(".home-rows-