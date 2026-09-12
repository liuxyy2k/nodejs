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