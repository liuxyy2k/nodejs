i.default.existsSync(i) || await Ii.default.promises.mkdir(i, {
  recursive: !0
});
let r = this.jar.toJSON();
await Ii.default.promises.writeFile(s, JSON.stringify(r, null, 2), "utf-8"), this.dirty = !1
}
catch {}
};
t ? await a() : this.saveTimer = setTimeout(() => a(), 1e3)
}
setAutoSave(t) {
  this.autoSaveEnabled = t, t && this.dirty && this.save(!0)
}
getJar() {
  return this.jar
}
async getCookies(t) {
  return await this.jar.getCookieString(t)
}
async setCookies(t, a) {
  if (!(!a || a.length === 0))
    for (let s of a) try {
      await this.jar.setCookie(s, t)
    } catch {}
}
clearCookies(t) {
  let a = String(t || "").replace(/^\./, "").toLowerCase();
  if (!a) return 0;
  let s = this.jar.toJSON().cookies || [],
    i = 0;
  for (let r of s)
    if (String(r.domain || "").replace(/^\./, "").toLowerCase() === a) try {
      this.jar.store.removeCookie(r.domain, r.path || "/", r.key, () => {}), i++
    } catch {}
  return i > 0 && this.save(), i
}
clearAllCookies() {
  let t = (this.jar.toJSON().cookies || []).length;
  return t > 0 && (this.jar.removeAllCookiesSync(), this.save()), t
}
}, Tve = new R8, Et = Tve
});

function NB(e) {
  if (e == null) return "";
  if (typeof e == "string") return e.length > 2e3 ? e.slice(0, 2e3) + "..." : e;
  if (typeof e == "object") try {
    let t = JSON.stringify(e);
    return t.length > 2e3 ? t.slice(0, 2e3) + "..." : t
  } catch {
    return String(e)
  }
  return Buffer.isBuffer(e) || e instanceof ArrayBuffer || ArrayBuffer.isView(e) ? `[Binary: ${e.length} bytes]` : String(e).slice(0, 2e3)
}

function OB(e) {
  if (!e) return {};
  let t = typeof e.toJSON == "function" ? e.toJSON(!0) : {
    ...e
  };
  return t.Cookie && t.Cookie.length > 40 && (t.Cookie = t.Cookie.slice(0, 20) + "..." + t.Cookie.slice(-10)), t
}
var PB, DB, Sve, os, pm, pc, se, dt = ae(() => {
  cm();
  PB = ne(require("https"), 1), DB = ne(require("http"), 1);
  Gl();
  Sve = {
    Accept: "application/json,text/plain,*/*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
    DNT: "1"
  }, os = Sr.create({
    httpsAgent: new PB.default.Agent({
      keepAlive: !1,
      rejectUnauthorized: !1,
      ALPNProtocols: ["http/1.1"]
    }),
    httpAgent: new DB.default.Agent({
      keepAlive: !1
    }),
    headers: Sve,
    timeout: 1e4
  });
  os.interceptors.request.use(async e => {
    if (await Et.load(), e.url) {
      let t = await Et.getCookies(e.url);
      t && !e.headers.Cookie && (e.headers.Cookie = t)
    }
    return e.metadata = {
      startTime: Date.now()
    }, e
  }, e => Promise.reject(e));
  os.interceptors.response.use(async e => {
    let t = e.headers["set-cookie"];
    if (t && t.length > 0 && e.config.url && (await Et.setCookies(e.config.url, t), Et.save()), pm) {
      let a = e.config.metadata?.startTime ? Date.now() - e.config.metadata.startTime : 0;
      pc.push({
        url: e.config.url || e.config.baseURL || "",
        method: (e.config.method || "get").toUpperCase(),
        status: e.status,
        dataLength: e.data?.length || 0,
        contentType: e.headers?.["content-type"] || "",
        duration: a,
        requestHeaders: OB(e.config.headers),
        responsePreview: NB(e.data)
      })
    }
    return e
  }, e => {
    if (pm && e.config) {
      let t = e.config.metadata?.startTime ? Date.now() - e.config.metadata.startTime : 0;
      pc.push({
        url: e.config.url || e.config.baseURL || "",
        method: (e.config.method || "get").toUpperCase(),
        status: e.response?.status || 0,
        error: e.message,
        dataLength: e.response?.data?.length || 0,
        contentType: e.response?.headers?.["content-type"] || "",
        duration: t,
        requestHeaders: OB(e.config.headers),
        responsePreview: NB(e.response?.data)
      })
    }
    return Promise.reject(e)
  });
  os.saveCookies = (e = !1) => Et.save(e);
  os.loadCookies = () => Et.load();
  os.clearCookies = e => Et.clearCookies(e);
  os.clearAllCookies = () => Et.clearAllCookies();
  os.getCookieJar = () => Et.getJar();
  os.setAutoSave = e => Et.setAutoSave(e);
  pm = !1, pc = [];
  os.startRecording = () => {
    pm = !0, pc = []
  };
  os.stopRecording = () => {
    pm = !1;
    let e = pc;
    return pc = [], e
  };
  os.getRecordings = () => [...pc];
  se = os
});
var Om = j(si => {
  "use strict";
  Object.defineProperty(si, "__esModule", {
    value: !0
  });
  si.AttributeAction = si.IgnoreCaseMode = si.SelectorType = void 0;
  var S3e;
  (function(e) {
    e.Attribute = "attribute", e.Pseudo = "pseudo", e.PseudoElement = "pseudo-element", e.Tag = "tag", e.Universal = "universal", e.Adjacent = "adjacent", e.Child = "child", e.Descendant = "descendant", e.Parent = "parent", e.Sibling = "sibling", e.ColumnCombinator = "column-combinator"
  })(S3e = si.SelectorType || (si.SelectorType = {}));
  si.IgnoreCaseMode = {
    Unknown: null,
    QuirksMode: "quirks",
    IgnoreCase: !0,
    CaseSensitive: !1
  };
  var A3e;
  (function(e) {
    e.Any = "any", e.Element = "element", e.End = "end", e.Equals = "equals", e.Exists = "exists", e.Hyphen = "hyphen", e.Not = "not", e.Start = "start"
  })(A3e = si.AttributeAction || (si.AttributeAction = {}))
});
var RF = j(wc => {
      "use strict";
      Object.defineProperty(wc, "__esModule", {
        value: !0
      });
      wc.parse = wc.isTraversal = void 0;
      var Ye = Om(),
        TF = /^[^\\#]?(?:\\(?:[\da-f]{1,6}\s?|.)|[\w\-\u00b0-\uFFFF])+/,
        C3e = /\\([\da-f]{1,6}\s?|(\s)|.)/gi,
        R3e = new Map([
          [126, Ye.AttributeAction.Element],
          [94, Ye.AttributeAction.Start],
          [36, Ye.AttributeAction.End],
          [42, Ye.AttributeAction.Any],
          [33, Ye.AttributeAction.Not],
          [124, Ye.AttributeAction.Hyphen]
        ]),
        I3e = new Set(["has", "not", "matches", "is", "where", "host", "host-context"]);

      function AF(e) {
        switch (e.type) {
          case Ye.SelectorType.Adjacent:
          case Ye.SelectorType.Child:
          case Ye.SelectorType.Descendant:
          case Ye.SelectorType.Parent:
          case Ye.SelectorType.Sibling:
          case Ye.SelectorType.ColumnCombinator:
            return !0;
          default:
            return !1
        }
      }
      wc.isTraversal = AF;
      var N3e = new Set(["contains", "icontains"]);

      function O3e(e, t, a) {
        var s = parseInt(t, 16) - 65536;
        return s !== s || a ? t : s < 0 ? String.fromCharCode(s + 65536) : String.fromCharCode(s >> 10 | 55296, s & 1023 | 56320)
      }

      function rd(e) {
        return e.replace(C3e, O3e)
      }

      function K8(e) {
        return e === 39 || e === 34
      }

      function SF(e) {
        return e === 32 || e === 9 || e === 10 || e === 12 || e === 13
      }

      function P3e(e) {
        var t = [],
          a = CF(t, "".concat(e), 0);
        if (a < e.length) throw new Error("Unmatched selector: ".concat(e.slice(a)));
        return t
      }
      wc.parse = P3e;

      function CF(e, t, a) {
        var s = [];

        function i(P) {
          var L = t.slice(a + P).match(TF);
          if (!L) throw new Error("Expected name, found ".concat(t.slice(a)));
          var Y = L[0];
          return a += P + Y.length, rd(Y)
        }

        function r(P) {
          for (a += P; a < t.length && SF(t.charCodeAt(a));) a++
        }

        function n() {
          a += 1;
          for (var P = a, L = 1; L > 0 && a < t.length; a++) t.charCodeAt(a) === 40 && !o(a) ? L++ : t.charCodeAt(a) === 41 && !o(a) && L--;
          if (L) throw new Error("Parenthesis not matched");
          return rd(t.slice(P, a - 1))
        }

        function o(P) {
          for (var L = 0; t.charCodeAt(--P) === 92;) L++;
          return (L & 1) === 1
        }

        function c() {
          if (s.length > 0 && AF(s[s.length - 1])) throw new Error("Did not expect successive traversals.")
        }

        function l(P) {
          if (s.length > 0 && s[s.length - 1].type === Ye.SelectorType.Descendant) {
            s[s.length - 1].type = P;
            return
          }
          c(), s.push({
            type: P
          })
        }

        function u(P, L) {
          s.push({
            type: Ye.SelectorType.Attribute,
            name: P,
            action: L,
            value: i(1),
            namespace: null,
            ignoreCase: "quirks"
          })
        }

        function d() {
          if (s.length && s[s.length - 1].type === Ye.SelectorType.Descendant && s.pop(), s.length === 0) throw new Error("Empty sub-selector");
          e.push(s)
        }
        if (r(0), t.length === a) return a;
        e: for (; a < t.length;) {
            var f = t.charCodeAt(a);
            switch (f) {
              case 32:
              case 9:
              case 10:
              case 12:
              case 13: {
                (s.length === 0 || s[0].type !== Ye.SelectorType.Descendant) && (c(), s.push({
                  type: Ye.SelectorType.Descendant
                })), r(1);
                break
              }
              case 62: {
                l(Ye.SelectorType.Child), r(1);
                break
              }
              case 60: {
                l(Ye.SelectorType.Parent), r(1);
                break
              }
              case 126: {
                l(Ye.SelectorType.Sibling), r(1);
                break
              }
              case 43: {
                l(Ye.SelectorType.Adjacent), r(1);
                break
              }
              case 46: {
                u("class", Ye.AttributeAction.Element);
                break
              }
              case 35: {
                u("id", Ye.AttributeAction.Equals);
                break
              }
              case 91: {
                r(1);
                var m = void 0,
                  p = null;
                t.charCodeAt(a) === 124 ? m = i(1) : t.startsWith("*|", a) ? (p = "*", m = i(2)) : (m = i(0), t.charCodeAt(a) === 124 && t.charCodeAt(a + 1) !== 61 && (p = m, m = i(1))), r(0);
                var b = Ye.AttributeAction.Exists,
                  y = R3e.get(t.charCodeAt(a));
                if (y) {
                  if (b = y, t.charCodeAt(a + 1) !== 61) throw new Error("Expected `=`");
                  r(2)
                } else t.charCodeAt(a) === 61 && (b = Ye.AttributeAction.Equals, r(1));
                var v = "",
                  w = null;
                if (b !== "exists") {
                  if (K8(t.charCodeAt(a))) {
                    for (var x = t.charCodeAt(a), g = a + 1; g < t.length && (t.charCodeAt(g) !== x || o(g));) g += 1;
                    if (t.charCodeAt(g) !== x) throw new Error("Attribute value didn't end");
                    v = rd(t.slice(a + 1, g)), a = g + 1
                  } else {
                    for (var _ = a; a < t.length && (!SF(t.charCodeAt(a)) && t.charCodeAt(a) !== 93 || o(a));) a += 1;
                    v = rd(t.slice(_, a))
                  }
                  r(0);
                  var T = t.charCodeAt(a) | 32;
                  T === 115 ? (w = !1, r(1)) : T === 105 && (w = !0, r(1))
                }
                if (t.charCodeAt(a) !== 93) throw new Error("Attribute selector didn't terminate");
                a += 1;