function Lc(e) {
  if (!e || typeof e != "string") return !1;
  try {
    let t = new URL(e.trim());
    return t.protocol === "http:" || t.protocol === "https:"
  } catch {
    return !1
  }
}

function Bc(e, t) {
  if (!e || typeof e != "string") return null;
  try {
    return new URL(e.trim(), t).href
  } catch {
    return null
  }
}
var K5 = ae(() => {});

function Q5(e) {
  let t = {
    ...Un
  };
  if (!e || typeof e != "object") return t;
  typeof e.enabled == "boolean" && (t.enabled = e.enabled);
  for (let [a, [s, i]] of Object.entries(Lye)) {
    let r = Number(e[a]);
    Number.isFinite(r) && (t[a] = Math.min(i, Math.max(s, Math.round(r))))
  }
  return t
}
async function Vn(e, {
  force: t = !1
} = {}) {
  if (!e) return {
    ...Un
  };
  let a = Date.now();
  if (!t && a - GM < Fye) return {
    ...ps
  };
  try {
    ps = Q5(await e.getData(Bye))
  } catch {
    ps = {
      ...Un
    }
  }
  return GM = a, {
    ...ps
  }
}

function JM(e) {
  for (let [t, a] of Mi) e - a.at > ps.sessionTtlMs ? Mi.delete(t) : e - a.at > zye && a.buf.size && a.buf.clear()
}

function XM(e) {
  e - J5 <= 5 * 60 * 1e3 || (JM(e), J5 = e)
}

function Mye(e, t = {}) {
  let a = Date.now();
  if (XM(a), Mi.size >= ps.maxSessions) {
    let i = null,
      r = 1 / 0;
    for (let [n, o] of Mi) o.at < r && (r = o.at, i = n);
    i && Mi.delete(i)
  }
  let s = KM.default.randomBytes(8).toString("hex");
  return Mi.set(s, {
    list: [...e],
    headers: {
      ...t
    },
    buf: new Map,
    fly: new Map,
    at: a
  }), s
}

function QM() {
  let e = 0,
    t = 0;
  for (let a of Mi.values()) e += a.buf.size, t += a.fly.size;
  return {
    sessions: Mi.size,
    bufferedTs: e,
    inflight: t,
    ...sh
  }
}

function ah(e) {
  return e ? Buffer.isBuffer(e) ? e : e instanceof ArrayBuffer ? Buffer.from(e) : ArrayBuffer.isView(e) ? Buffer.from(e.buffer, e.byteOffset, e.byteLength) : typeof e == "string" ? Buffer.from(e, "latin1") : Buffer.alloc(0) : Buffer.alloc(0)
}
async function qye(e, t) {
  try {
    let a = await se.get(e, {
      headers: {
        ...t,
        Range: "bytes=0-0"
      },
      responseType: "arraybuffer",
      timeout: 1e4
    });
    if (a.status !== 206) return ah(a.data);
    let s = a.headers?.["content-range"] || a.headers?.["Content-Range"] || "",
      i = /\/(\d+)\s*$/.exec(String(s)),
      r = i ? Number(i[1]) : 0;
    if (!r || r < ps.rangeThreshold) {
      let l = await se.get(e, {
        headers: t,
        responseType: "arraybuffer",
        timeout: 3e4
      });
      return ah(l.data)
    }
    let n = Math.ceil(r / ps.rangeParts),
      o = Array.from({
        length: ps.rangeParts
      }, (l, u) => {
        let d = u * n,
          f = Math.min(r - 1, (u + 1) * n - 1);
        return se.get(e, {
          headers: {
            ...t,
            Range: `bytes=${d}-${f}`
          },
          responseType: "arraybuffer",
          timeout: 15e3
        }).then(m => {
          let p = ah(m.data);
          return {
            k: u,
            buf: p,
            ok: p.length === f - d + 1
          }
        })
      }),
      c = await Promise.all(o);
    if (c.sort((l, u) => l.k - u.k), !c.every(l => l.ok)) throw new Error("range parts length mismatch");
    return Buffer.concat(c.map(l => l.buf))
  } catch {
    let a = await se.get(e, {
      headers: t,
      responseType: "arraybuffer",
      timeout: 3e4
    });
    return ah(a.data)
  }
}

function X5(e, t) {
  let a = e.fly.get(t);
  if (a) return a;
  let s = qye(e.list[t], e.headers).then(i => {
    if (!i || i.length === 0) throw new Error("empty body");
    return e.buf.set(t, i), e.fly.delete(t), ZM(e), i
  }).catch(i => {
    throw e.fly.delete(t), i
  });
  return e.fly.set(t, s), s.catch(() => {}), s
}
async function Hye(e, t) {
  let a = e.buf.get(t);
  if (a) return sh.hits++, a;
  sh.misses++;
  try {
    return await X5(e, t)
  } catch {
    return await X5(e, t)
  }
}

function Uye(e, t) {
  for (let a = t + 1; a <= t + ps.window && !(!(a >= e.list.length || e.buf.has(a) || e.fly.has(a)) && (X5(e, a), e.fly.size >= ps.maxInflightPerSession)); a++);
}

function ZM(e) {
  for (; e.buf.size > ps.maxTsCache;) {
    let t = 1 / 0;
    for (let a of e.buf.keys()) a < t && (t = a);
    e.buf.delete(t)
  }
}

function Vye(e, t) {
  for (let a of [...e.buf.keys()]) a <= t - 2 && e.buf.delete(a);
  ZM(e)
}

function Wye(e, t) {
  let a = /^bytes=(\d*)-(\d*)\s*$/.exec(String(e || ""));
  if (!a) return null;
  let s = a[1] === "" ? null : Number(a[1]),
    i = a[2] === "" ? null : Number(a[2]);
  return s == null && i == null ? null : (s == null ? (s = Math.max(0, t - i), i = t - 1) : (i == null || i >= t) && (i = t - 1), !Number.isFinite(s) || !Number.isFinite(i) || s < 0 || s >= t || i < s ? {
    invalid: !0
  } : {
    start: s,
    end: i
  })
}
async function eq(e, t, a = "") {
  XM(Date.now());
  let s = typeof e == "string" && Mi.get(e) || null;
  if (!s || !Number.isInteger(t) || t < 0 || t >= s.list.length) return {
    status: 404,
    headers: {},
    body: Buffer.from("accel session expired or invalid index")
  };
  s.at = Date.now();
  let i;
  try {
    i = await Hye(s, t)
  } catch (n) {
    return sh.fetchErrors++, {
      status: 502,
      headers: {},
      body: Buffer.from("fetch ts failed: " + (n?.message || n))
    }
  }
  Vye(s, t), Uye(s, t);
  let r = {
    "Content-Type": "video/MP2T",
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=60"
  };
  if (a) {
    let n = Wye(a, i.length);
    if (!n || n.invalid) return {
      status: 416,
      headers: {
        ...r,
        "Content-Range": `bytes */${i.length}`
      },
      body: Buffer.alloc(0)
    };
    let o = i.subarray(n.start, n.end + 1);
    return {
      status: 206,
      headers: {
        ...r,
        "Content-Range": `bytes ${n.start}-${n.end}/${i.length}`,
        "Content-Length": String(o.length)
      },
      body: o
    }
  }
  return {
    status: 200,
    headers: {
      ...r,
      "Content-Length": String(i.length)
    },
    body: i
  }
}

function tq(e, t, a = {}) {
  if (!e || typeof e != "string" || !e.includes("#EXTM3U")) return {
    content: e,
    sid: null
  };
  let s = (t || "http://127.0.0.1:3006").replace(/\/+$/, ""),
    i = e.replace(/\r\n/g, `
`).split(`
`),
    r = new Array(i.length).fill(-1),
    n = [];
  for (let l = 0; l < i.length; l++) {
    let u = i[l].trim();
    !u || u.startsWith("#") || Ur(u) || Hn(u) || Dc(u) || (r[l] = n.length, n.push(u))
  }
  if (n.length === 0) return {
    content: e,
    sid: null
  };
  let o = Mye(n, a);
  return {
    content: i.map((l, u) => r[u] < 0 ? l : `${s}/m3u8-ts?sid=${o}&i=${r[u]}`).join(`
`),
    sid: o
  }
}
var KM, Un, Lye, Bye, Fye, ps, GM, Mi, J5, sh, zye, $ye, YM, Z5 = ae(() => {
  KM = ne(require("crypto"), 1);
  dt();
  K5();
  Un = {
    enabled: !0,
    window: 8,
    rangeThreshold: 300 * 1024,
    rangeParts: 2,
    maxTsCache: 30,
    maxSessions: 50,
    sessionTtlMs: 30 * 60 * 1e3,
    maxInflightPerSession: 3
  }, Lye = {
    window: [1, 64],
    rangeThreshold: [32 * 1024, 16 * 1024 * 1024],
    rangeParts: [1, 8],
    maxTsCache: [2, 200],
    maxSessions: [1, 500],
    sessionTtlMs: [60 * 1e3, 120 * 60 * 1e3],
    maxInflightPerSession: [1, 16]
  }, Bye = "/systemSettings/m3u8Accel";
  Fye = 2e3, ps = {
    ...Un
  }, GM = 0;
  Mi = new Map, J5 = 0, sh = {
    hits: 0,
    misses: 0,
    fetchErrors: 0
  }, zye = 3 * 60 * 1e3, $ye = 60 * 1e3;
  YM = setInterval(() => {
    let e = Date.now();
    JM(e), J5 = e
  }, $ye);
  typeof YM.unref == "function" && YM.unref()
});
var lq = {};
za(lq, {
  UA: () => Fc,
  addSessionHosts: () => ey,
  adoptAccelSid: () => nq,
  apiOriginFromReq: () => ty,
  gatewayAsset: () => uq,
  gatewayClean: () => oq,
  gatewayTs: () => cq,
  maybeRewritePlay: () => cxe,
  registerGatewaySession: () => rq,
  registerM3u8Gateway: () => sy
});

function Jye(e) {
  if (qi.size > Kye) {
    let t = null,
      a = 1 / 0;
    for (let [s, i] of qi) i.at < a && (a = i.at, t = s);
    t && qi.delete(t)
  }
  for (let [t, a] of qi) e - a.at > Yye && qi.delete(t)
}

function _d(e) {
  if (!e) return null;
  let t = qi.get(String(e));
  return t && (t.at = Date.now()), t || null
}

function rq({
  headers: e = {},
  allowedHosts: t = []
} = {}) {
  Jye(Date.now());
  let a = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  return qi.set(a, {
    headers: {
      ...e
    },
    allowedHosts: new Set((t || []).map(s => String(s).toLowerCase())),
    at: Date.now()
  }), a
}

function nq(e, {
  headers: t = {},
  allowedHosts: a = []
} = {}) {
  e && (qi.has(e) || qi.set(e, {
    headers: {
      ...t
    },
    allowedHosts: new Set((a || []).map(s => String(s).toLowerCase())),
    at: Date.now()
  }))
}

function zc(e, t) {
  let a = _d(t);
  if (!a) return !1;
  try {
    let s = new URL(e).hostname.toLowerCase();
    return a.allowedHosts.has(s)
  } catch {
    return !1
  }
}

function ey(e, t) {
  let a = _d(e);
  if (a)
    for (let s of t || []) s && a.allowedHosts.add(String(s).toLowerCase())
}

function ty(e) {
  let t = e.headers && e.headers["x-forwarded-proto"];
  return `${t?String(t).split(",")[0].trim():"http"}://${e.headers.host}`
}

function Xye(e) {
  return new Promise(t => setTimeout(t, e))
}

function Qye(e) {
  return e === 403 || e === 429 || e === 502 || e === 503 || e === 504
}
async function Zye(e, t) {
  let a = t && (t.Referer || t.referer) || "",
    s = {
      "User-Agent": Fc,
      "Accept-Encoding": "identity",
      ...ay
    };
  a && (s.Referer = a);
  let i = null;
  for (let r = 0; r <= 3; r++) {
    r > 0 && sq[r - 1] && await Xye(sq[r - 1]);
    try {
      let n = await se.get(e, {
          headers: s,
          timeout: 2e4,
          maxContentLength: aq + 1,
          maxBodyLength: aq + 1
        }),
        o = n.data;
      if (Buffer.isBuffer(o) ? o = o.toString("utf8") : typeof o != "string" && (o = JSON.stringify(o ?? "")), n.status >= 400 && Qye(n.status) && (i = new Error(`HTTP ${n.status}`), r < 3)) continue;
      return {
        status: n.status,
        text: o
      }
    } catch (n) {
      if (i = n, r >= 3) break
    }
  }
  throw i || new Error(`upstream fetch failed: ${e}`)
}

function exe(e) {
  let t = e.includes("#EXT-X-STREAM-INF"),
    a = !1;
  for (let s of e.split(`
`)) {
    let i = s.trim();
    if (!(!i || i.startsWith("#")) && !Ur(i)) {
      a = !0;
      break
    }
  }
  return {
    isMaster: t && !a,
    isMedia: a
  }
}

function txe(e, t, a, s, i) {
  return i > Gye ? e : e.replace(/\r\n/g, `
`).split(`
`).map(r => {
    let n = r.trim();
    if (!n || n.startsWith("#")) return r;
    let o = Bc(n, t);
    return !o || !Lc(o) || Hn(o) || Dc(o) || !zc(o, a) ? r : Ur(o) ? `${s}/m3u8-clean?sid=${encodeURIComponent(a)}&url=${encodeURIComponent(o)}` : r
  }).join(`
`)
}

function axe(e, t, a, s) {
  return e.includes('URI="') ? e.replace(/URI="([^"]+)"/g, (i, r) => {
    let n = Bc(r, t);
    return !n || !Lc(n) || Hn(n) || !zc(n, a) ? i : `URI="${s}/m3u8-asset?sid=${encodeURIComponent(a)}&url=${encodeURIComponent(n)}"`
  }) : e
}

function iq(e, t) {
  let a = new Set;
  try {
    a.add(new URL(t).hostname.toLowerCase())
  } catch {}
  for (let s of e.split(`
`)) {
    let i = s.trim();
    if (i.includes('URI="')) {
      for (let n of i.matchAll(/URI="([^"]+)"/g)) {
        let o = Bc(n[1], t);
        if (o) try {
          a.add(new URL(o).hostname.toLowerCase())
        } catch {}
      }
      continue
    }
    if (!i || i.startsWith("#")) continue;
    let r = Bc(i, t);
    if (r) try {
      a.add(new URL(r).hostname.toLowerCase())
    } catch {}
  }
  return [...a]
}

function sxe(e, t) {
  return e.replace(/\r\n/g, `
`).split(`
`).map(a => {
    let s = a.trim();
    if (!s || s.startsWith("#") || Ur(s)) return a;
    let i = Bc(s, t);
    return i || a
  }).join(`
`)
}

function ixe(e, t, a) {
  return e.replace(/\r\n/g, `
`).split(`
`).map(s => {
    let i = s.trim();
    return !i || i.startsWith("#") || Ur(i) || Hn(i) || Dc(i) || !Lc(i) || !zc(i, t) ? s : `${a}/m3u8-ts?sid=${encodeURIComponent(t)}&url=${encodeURIComponent(i)}`
  }).join(`
`)
}
async function rxe(e, t, a, s, i) {
  let r = _d(t);
  if (!r) {
    let d = new Error("unknown session");
    throw d.status = 403, d
  }
  if (!zc(e, t)) {
    let d = new Error("forbidden: upstream host not allowed");
    throw d.status = 403, d
  }
  let n = await Zye(e, r.headers || {});
  if (n.status !== 200 && n.status !== 206) {
    let d = new Error(`upstream http ${n.status}`);
    throw d.status = n.status, d
  }
  let o = n.text;
  if (!o || !o.includes("#EXTM3U")) {
    let d = new Error("upstream is not a playlist");
    throw d.status = 502, d
  }
  let c = exe(o),
    l, u = t;
  if (c.isMedia) {
    let d = sxe(o, e),
      f = iq(o, e);
    if (ey(t, f), (await Vn(i)).enabled) {
      let p = tq(d, a, r.headers || {});
      p.sid && (nq(p.sid, {
        headers: r.headers || {},
        allowedHosts: f
      }), u = p.sid), l = p.content
    } else l = ixe(d, t, a), u = t
  } else ey(t, iq(o, e)), l = txe(o, e, t, a, s + 1);
  return l = axe(l, e, u, a), l
}
async function oq(e, t) {
  let a = String(e.query && e.query.sid || ""),
    s = e.query && e.query.url ? String(e.query.url) : "";
  if (!a || !s) return t.code(400).send("missing sid or url");
  let i = ty(e),
    r = e.server && e.server.db;
  try {
    let n = await rxe(String(s), a, i, 0, r);
    return t.header("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8"), t.header("Access-Control-Allow-Origin", "*"), t.header("Cache-Control", "no-store"), t.send(n)
  } catch (n) {
    let o = n.status || 502;
    return t.code(o).send(n.message || "clean failed")
  }
}
async function cq(e, t) {
  let a = String(e.query && e.query.sid || ""),
    s = e.query && e.query.url ? String(e.query.url) : "",
    i = e.query && e.query.i,
    r = i !== void 0 ? Number(i) : -1,
    n = e.headers && e.headers.range ? String(e.headers.range) : "",
    o = _d(a);
  if (!o) return t.code(403).send("unknown session");
  if (r >= 0) {
    await Vn(e.server && e.server.db);
    let c = await eq(a, r, n);
    for (let [l, u] of Object.entries(c.headers || {})) t.header(l, u);
    return t.code(c.status).send(c.body)
  }
  if (!s || !zc(s, a)) return t.code(403).send("forbidden");
  try {
    let c = await nxe(s, o.headers || {});
    return t.header("Content-Type", "video/MP2T"), t.header("Access-Control-Allow-Origin", "*"), t.header("Cache-Control", "no-store"), t.send(c)
  } catch (c) {
    return t.code(502).send(`fetch ts failed: ${c.message}`)
  }
}
async function nxe(e, t) {
  let s = (await se.get(e, {
    headers: {
      "User-Agent": Fc,
      ...t,
      ...ay
    },
    responseType: "arraybuffer",
    timeout: 2e4
  })).data;
  return Buffer.isBuffer(s) ? s : Buffer.from(s ?? "")
}
async function uq(e, t) {
  let a = String(e.query && e.query.sid || ""),
    s = e.query && e.query.url ? String(e.query.url) : "",
    i = _d(a);
  if (!i) return t.code(403).send("unknown session");
  if (!s || !zc(s, a)) return t.code(403).send("forbidden");
  try {
    let r = await se.get(String(s), {
        headers: {
          "User-Agent": Fc,
          ...i.headers || {},
          ...ay
        },
        responseType: "arraybuffer",
        timeout: 2e4
      }),
      n = r.data,
      o = Buffer.isBuffer(n) ? n : Buffer.from(n ?? "");
    return t.header("Content-Type", r.headers["content-type"] || "application/octet-stream"), t.header("Access-Control-Allow-Origin", "*"), t.header("Cache-Control", "no-store"), t.send(o)
  } catch (r) {
    return t.code(502).send(`asset fetch failed: ${r.message}`)
  }
}
async function cxe(e, t, {
  db: a
} = {}) {
  let s = (e.url || "").split("?")[0].split("/").filter(Boolean);
  if (s.length < 4 || s[0] !== "spider" || s[3] !== "play") return null;
  let i = s[1];
  if (Number(s[2]) !== 3 || oxe.has(i) || !t || typeof t != "object") return null;
  let n = t.header && typeof t.header == "object" ? t.header : {},
    o = ty(e),
    c = u => uxe(u, o, n),
    l = !1;
  if (typeof t.url == "string" && t.url) {
    let u = c(t.url);
    u !== t.url && (t.url = u, l = !0)
  }
  if (Array.isArray(t.urls)) {
    let u = t.urls.map(d => typeof d == "string" ? c(d) : d);
    u.some((d, f) => d !== t.urls[f]) && (t.urls = u, l = !0)
  }
  return l ? t : null
}

function uxe(e, t, a) {
  let s = String(e).trim();
  if (!s) return e;
  let i = s,
    r = s.split("$");
  if (r.length > 1) {
    let d = r.find(f => Lc(f));
    d && (i = d)
  }
  let n = i,
    o = n.indexOf("#");
  if (o >= 0 && (n = n.slice(0, o)), n = n.trim(), !n || Hn(n) || !Lc(n) || Dc(n) || !(Ur(n) || /\.m3u8($|[?#&])/i.test(n))) return e;
  let l = "";
  try {
    l = new URL(n).hostname.toLowerCase()
  } catch {
    return e
  }
  let u = rq({
    headers: a,
    allowedHosts: [l]
  });
  return `${t}/m3u8-clean?sid=${encodeURIComponent(u)}&url=${encodeURIComponent(n)}`
}
async function sy(e) {
  e.get("/m3u8-clean", oq), e.get("/m3u8-ts", cq), e.get("/m3u8-asset", uq)
}
var Fc, Gye, aq, Yye, Kye, qi, sq, ay, oxe, ih = ae(() => {
  K5();
  Z5();
  dt();
  Fc = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0", Gye = 4, aq = 8 * 1024 * 1024, Yye = 30 * 60 * 1e3, Kye = 300, qi = new Map;
  sq = [0, 400, 1200];
  ay = {
    "Sec-Fetch-Dest": null,
    "Sec-Fetch-Mode": null,
    "Sec-Fetch-Site": null,
    "Sec-Fetch-User": null
  };
  oxe = new Set(["liveSource", "qrcode"])
});

function tH(e, t) {
  return e == null ? "" : (e = String(e), e.length <= t ? e : e.slice(0, t) + `
...[\u5DF2\u622A\u65AD ${e.length-t} \u5B57\u7B26]`)
}

function iH(e, t, {
  db: a
} = {}) {
  e.addHook("preHandler", async s => {
    try {
      if (!(s.url || "").split("?")[0].startsWith(t)) return;
      s._monitor = {
        startAt: Date.now(),
        body: tH(JSON.stringify(s.body ?? {}), d7e),
        query: s.query || {},
        ip: s.ip || ""
      }
    } catch {}
  }), e.addHook("onSend", async (s, i, r) => {
    let n = s._monitor;
    if (n) try {
      let o = r;
      if (typeof r == "string") try {
        let d = JSON.parse(r);
        if (d && typeof d == "object") {
          let {
            maybeRewritePlay: f
          } = await Promise.resolve().then(() => (ih(), lq)), m = await f(s, d, {
            db: a
          });
          m && (o = JSON.stringify(m))
        }
      } catch {}
      let c = (s.url || "").split("?")[0],
        l = c.split("/").filter(Boolean),
        u = "";
      if (typeof o == "string") u = o;
      else if (Buffer.isBuffer(o)) u = o.toString();
      else if (o != null) try {
        u = JSON.stringify(o)
      } catch {
        u = String(o)
      }
      return Id.push({
        id: ++p7e,
        time: new Date().toISOString(),
        method: s.method,
        path: c,
        query: n.query,
        spider: l[1] || "",
        type: l[2] || "",
        endpoint: l[3] || "",
        body: n.body,
        ip: n.ip,
        status: i.statusCode,
        duration: Date.now() - n.startAt,
        response: tH(u, f7e)
      }), o !== r ? o : void 0
    } catch {}
  })
}