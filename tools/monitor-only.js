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
async function rH(e) {
    e.get("/monitor/history", async t => {
        let a = Math.min(parseInt(t.query.limit) || 50, sH);
        return Id.history(a)
    }), e.get("/monitor/clear", async () => (Id.clear(), {
        ok: !0
    })), e.get("/monitor/stream", async (t, a) => {
        a.hijack();
        let s = a.raw;
        s.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no"
        }), s.write(`retry: 3000

`);
        let i = o => {
            s.write(`data: ${JSON.stringify(o)}

`)
        };
        Id.on("event", i);
        let r = setInterval(() => {
                try {
                    s.write(`: ping

`)
                } catch {}
            }, 2e4),
            n = () => {
                Id.off("event", i), clearInterval(r)
            };
        s.on("close", n), t.raw.on("close", n)
    })
}
var aH, sH, d7e, f7e, p7e, Sy, Id, Ay = ae(() => {
    aH = require("events"), sH = 50, d7e = 50 * 1024, f7e = 100 * 1024, p7e = 0;
    Sy = class extends aH.EventEmitter {
        constructor() {
            super(), this.setMaxListeners(200), this.events = []
        }
        push(t) {
            this.events.push(t), this.events.length > sH && this.events.shift(), this.emit("event", t)
        }
        history(t) {
            return this.events.slice(-t)
        }
        clear() {
            this.events = [], this.emit("clear")
        }
    }, Id = new Sy
});
var oH = j(Jn => {
    "use strict";
    Object.defineProperty(Jn, "__esModule", {
        value: !0
    });
    Jn.removeTrailingChar = Jn.merge = void 0;
    var b7e = (...e) => {
        let t = {};
        return e.forEach(function(a) {
            var s;
            for (s in a) s in t && t[s] === null ? t[s] = a[s] : s in t && Array.isArray(t[s]) ? t[s] = t[s].concat(a[s]) : s in t && typeof t[s] == "object" ? t[s] = (0, Jn.merge)(t[s], a[s]) : t[s] = a[s]
        }), t
    };
    Jn.merge = b7e;
    var h7e = (e, t) => e.length > 1 && e.endsWith(t) ? e.substring(0, e.length - 1) : e;
    Jn.removeTrailingChar = h7e
});
var Vc = j(Wr => {
    "use strict";
    Object.defineProperty(Wr, "__esModule", {
        value: !0
    });
    Wr.DataError = Wr.DatabaseError = Wr.NestedError = void 0;
    var Nd = class extends Error {
        inner;
        id;
        constructor(t, a, s) {
            super(t), this.inner = s, this.id = a, this.name = this.constructor.name
        }
        toString() {
            let t = this.name + ": " + this.message;
            return this.inner ? t + `:
` + this.inner : t
        }
    };
    Wr.NestedError = Nd;
    var Iy = class extends Nd {};
    Wr.DatabaseError = Iy;
    var Ny = class extends Nd {};
    Wr.DataError = Ny
});
var By = j(ya => {
    "use strict";
    Object.defineProperty(ya, "__esModule", {
        value: !0
    });
    ya.getArrayIndicies = ya.validateArrayIndex = ya.validateArrayIndicies = ya.isInt = ya.ArrayInfo = ya.arrayRegex = void 0;
    var yh = Vc(),
        g7e = () => /^([\.0-9a-zA-Z_$\-][0-9a-zA-Z_\-$\.]*)\[((?!(\]|\[)).*|)\]$/gm;
    ya.arrayRegex = g7e;
    var Oy = {},
        Py = class e {
            property;
            index = 0;
            append = !1;
            indicies = [];
            constructor(t, a) {
                this.property = t;
                let s = a[0] ?? 0;
                if (this.append = s === "" || a[a.length - 1] === "", this.indicies = a, Dy(s)) this.index = parseInt(s);
                else if (!this.append) throw new yh.DataError("Only numerical values accepted for array index", 200)
            }
            static processArray(t) {
                if (typeof t > "u") return null;
                if (Oy[t]) return Oy[t];
                let s = (0, ya.arrayRegex)().exec(t.trim());
                if (s != null) {
                    let i = s[1],
                        r = "[" + s[2].toString() + "]",
                        n = Ly(r);
                    return cH(n), Oy[t] = new e(i, n)
                }
                return null
            }
            getIndex(t, a) {
                if (this.append) return -1;
                let s = this.index;
                if (s == -1) {
                    let i = a ? t : t[this.property];
                    return i.length === 0 ? 0 : i.length - 1
                }
                return s
            }
            getData(t) {
                if (this.append) throw new yh.DataError("Can't get data when appending", 100);
                let {
                    index: a,
                    dataForProperty: s
                } = this.getArrayDataAndIndexFromProperty(t);
                return s[a]
            }
            setData(t, a) {
                if (this.append) {
                    let s = t[this.property];
                    this.indicies.forEach(i => {
                        i !== "" && (i = +i, i === -1 && (i = s.length - 1), s = s[+i])
                    }), s.push(a)
                } else {
                    let {
                        index: s,
                        dataForProperty: i
                    } = this.getArrayDataAndIndexFromProperty(t);
                    s === -1 ? i.push(a) : i[s] = a
                }
            }
            delete(t) {
                if (this.append) throw new yh.DataError("Can't delete an appended data", 10);
                let {
                    index: a,
                    dataForProperty: s
                } = this.getArrayDataAndIndexFromProperty(t);
                s.splice(a, 1)
            }
            isValid(t) {
                let {
                    index: a,
                    dataForProperty: s
                } = this.getArrayDataAndIndexFromProperty(t);
                return s.hasOwnProperty(a)
            }
            getArrayDataAndIndexFromProperty(t) {
                let a = 0,
                    s = t instanceof Array ? t : t[this.property] ?? t;
                if (this.indicies.length > 0) {
                    a = +this.indicies[this.indicies.length - 1];
                    for (let i = 0; i < this.indicies.length - 1; i++) {
                        let r = +this.indicies[i];
                        r === -1 && (r = s.length - 1), s = s[r]
                    }
                    a === -1 && (a = s.length - 1)
                }
                return {
                    index: a,
                    dataForProperty: s
                }
            }
            isMultiDimensional() {
                return this.indicies.length > 1
            }
        };
    ya.ArrayInfo = Py;

    function Dy(e) {
        return !isNaN(e) && Number(e) == e && !isNaN(parseInt(e, 10))
    }
    ya.isInt = Dy;

    function cH(e) {
        let t = e.filter(a => a === "");
        if (t.length > 1) throw Error("Only one append index is supported for nested arrays");
        if (t.length === 1 && e[e.length - 1] !== "") throw Error("Append index must be at the end of the nested array")
    }
    ya.validateArrayIndicies = cH;

    function uH(e) {
        if (e.length !== 0 && !Dy(e)) throw new yh.DataError("Only numerical values accepted for array index", 200)
    }
    ya.validateArrayIndex = uH;

    function Ly(e) {
        if (e.length === 0) return [];
        if (e.charAt(0) !== "[") throw new Error("Invalid array syntax detected");
        let t = e.substring(1, e.indexOf("]"));
        uH(t);
        let a = t.length + 2;
        return [t, ...Ly(e.substring(a))]
    }
    ya.getArrayIndicies = Ly
});
var fH = j(xh => {
    "use strict";
    Object.defineProperty(xh, "__esModule", {
        value: !0
    });
    xh.DBParentData = void 0;
    var lH = By(),
        dH = Vc(),
        Fy = class {
            parent;
            data;
            db;
            dataPath;
            constructor(t, a, s, i) {
                this.parent = i, this.data = t, this.db = a, this.dataPath = s
            }
            checkArray(t = !1) {
                let a = lH.ArrayInfo.processArray(this.parent);
                if (a && (!a.append || t) && !a.isValid(this.data)) throw new dH.DataError("DataPath: /" + this.dataPath + ". Can't find index " + a.index + " in array " + a.property, 10);
                return a
            }
            getData() {
                if (this.parent === void 0) return this.data;
                let t = this.checkArray();
                return t ? t.getData(this.data) : this.data[this.parent]
            }
            setData(t) {
                if (this.parent === void 0) {
                    this.db.resetData(t);
                    return
                }
                let a = lH.ArrayInfo.processArray(this.parent);
                if (a) {
                    if (!this.data.hasOwnProperty(a.property)) this.data[a.property] = [];
                    else if (!Array.isArray(this.data[a.property])) throw new dH.DataError("DataPath: /" + this.dataPath + ". " + a.property + " is not an array.", 11);
                    a.setData(this.data, t)
                } else this.data[this.parent] = t
            }
            delete() {
                if (this.parent === void 0) {
                    this.db.resetData({});
                    return
                }
                let t = this.checkArray(!0);
                t ? t.delete(this.data) : delete this.data[this.parent]
            }
        };
    xh.DBParentData = Fy
});
var mH = j((QLe, pH) => {
            pH.exports = function() {
                    "use strict";

                    function e() {
                        this.readers = 0, this.queue = []
                    }

                    function t(r, n, o) {
                        var c;
                        typeof r != "function" ? (i.hasOwnProperty(r) || (i[r] = new e), c = i[r]) : (o = n, n = r, c = s), o || (o = {});
                        var l = null;
                        o.hasOwnProperty("scope") && (l = o.scope);
                        var u = function() {
                            var m = !1;
                            return function() {
                                m || (m = !0, c.readers--, c.queue.length && c.queue[0]())
                            }
                        }();
                        if (c.readers < 0 || c.queue.length) {
                            var d = !1;
                            if (c.queue.push(function() {
                                    !d && c.readers >= 0 && (d = !0, c.queue.shift(), c.readers++, n.call(l, u), c.queue.length && c.queue[0]())
                                }), o.hasOwnProperty("timeout")) {
                                var f = null;
                                o.hasOwnProperty("timeoutCallback") && (f = o.timeoutCallback), setTimeout(function() {
                                    d || (d = !0, c.queue.shift(), f && f.call(o.scope))
                                }, o.timeout)
                            }
                        } else c.readers++, n.call(o.scope, u)
                    }

                    function a(r, n, o) {
                        var c;
                        typeof r != "function" ? (i.hasOwnProperty(r) || (i[r] = new e), c = i[r]) : (o = n, n = r, c = s), o || (o = {});
                        var l = null;
                        o.hasOwnProperty("scope") && (l = o.scope);
                        var u = function() {
                            var m = !1;
                            return function() {
                                m || (m = !0, c.readers = 0, c.queue.length && c.queue[0]())
                            }
                        }();
                        if (c.readers || c.queue.length) {
                            var d = !1;
                            if (c.queue.push(function() {
                                    d || c.readers || (d = !0, c.queue.shift(), c.readers = -1, n.call(o.scope, u))
                                }), o.hasOwnProperty("timeout")) {
                                var f = null;
                                o.hasOwnProperty("timeoutCallback") && (f = o.timeoutCallback), setTimeout(function() {
                                    d || (d = !0, c.queue.shift(), f && f.call(l))
                                }, o.timeout)
                            }
                        } else c.readers = -1, n.call(o.scope, u)
                    }
                    va