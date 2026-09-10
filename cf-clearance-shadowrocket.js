// cf-clearance-shadowrocket.js v1.0.2
// Shadowrocket CF Clearance + 推送到本机 Node 服务
//
// 用法：
// 1. Safari 打开 missav 完成过盾
// 2. 脚本捕获 cf_clearance / Cookie / UA
// 3. 自动 POST 到本机 Node：http://127.0.0.1:端口/website/cf/cookie
// 4. miss.js 读取 /missavCookie + /missavUa 请求站点
//
// 模块 argument 示例（推荐）：
//   push=http://127.0.0.1:9988/website/cf/cookie
// CatVod 内置 Node 端口可能不是 9988，以配置页显示的 website 地址端口为准。

var CF = {};
CF.VERSION = '1.0.2';

CF.CONFIG = {
  STORE_PREFIX: 'cf_clearance_',
  NOTIFY_THROTTLE_MS: 60000,
  CHALLENGE_STATUS: [403, 503],
  NOTIFY_TITLE: 'CF 盾',
  PROTECT_WINDOW: 30000,
  // 默认推送地址（可用 $argument 覆盖）
  DEFAULT_PUSH_URL: 'http://127.0.0.1:9988/website/cf/cookie',
  SAFARI_NAV_HEADERS: {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    Connection: 'keep-alive',
    Priority: 'u=0'
  },
  HEADER_ORDER: [
    'Host', 'Accept', 'Upgrade-Insecure-Requests', 'User-Agent',
    'Accept-Language', 'Accept-Encoding', 'Connection', 'Cookie',
    'Sec-Fetch-Dest', 'Sec-Fetch-Mode', 'Sec-Fetch-Site', 'Priority',
    'Referer', 'Origin'
  ],
  COOKIE_BLACKLIST: ['_ym_isad'],
  COOKIE_PREFIX_BLACKLIST: ['_ym_'],
  HEADER_WHITELIST: [
    'host', 'cookie', 'user-agent', 'accept', 'accept-language',
    'accept-encoding', 'upgrade-insecure-requests', 'connection',
    'referer', 'origin', 'sec-fetch-dest', 'sec-fetch-mode',
    'sec-fetch-site', 'priority', 'x-requested-with'
  ],
  FALLBACK_UA_VERSION_DOTTED: '17.0'
};

CF.parseArgument = function () {
  var out = {};
  var raw = typeof $argument !== 'undefined' ? String($argument || '') : '';
  if (!raw || raw === '__test__') return out;
  var parts = raw.split(/[&,]/);
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].split('=');
    if (kv.length < 2) continue;
    var k = kv[0].trim();
    var v = kv.slice(1).join('=').trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
};

CF.getPushUrl = function () {
  var args = CF.parseArgument();
  return args.push || args.push_url || args.node || CF.CONFIG.DEFAULT_PUSH_URL;
};

CF.getHeaderCI = function (headers, name) {
  if (!headers) return '';
  var lower = String(name).toLowerCase();
  var keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === lower) return headers[keys[i]];
  }
  return '';
};

CF.removeHeaderCI = function (headers, name) {
  if (!headers) return;
  var lower = String(name).toLowerCase();
  var keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === lower) delete headers[keys[i]];
  }
};

CF.setHeaderCI = function (headers, name, value) {
  CF.removeHeaderCI(headers, name);
  headers[name] = value;
};

CF.registrableDomain = function (host) {
  if (!host) return '';
  host = String(host).toLowerCase();
  var parts = host.split('.');
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
};

CF.hostFromUrl = function (url) {
  if (!url || typeof url !== 'string') return '';
  var idx = url.indexOf('://');
  if (idx < 0) return '';
  var rest = url.slice(idx + 3);
  var slash = rest.indexOf('/');
  if (slash >= 0) rest = rest.slice(0, slash);
  var at = rest.lastIndexOf('@');
  if (at >= 0) rest = rest.slice(at + 1);
  if (rest.charAt(0) === '[') {
    var end = rest.indexOf(']');
    if (end >= 0) return rest.slice(1, end).toLowerCase();
  }
  var colon = rest.indexOf(':');
  if (colon >= 0) rest = rest.slice(0, colon);
  return rest.toLowerCase();
};

CF.schemeFromUrl = function (url) {
  if (!url || typeof url !== 'string') return '';
  var idx = url.indexOf('://');
  if (idx < 0) return '';
  return url.slice(0, idx).toLowerCase();
};

CF.originFromUrl = function (url) {
  if (!url || typeof url !== 'string') return '';
  var idx = url.indexOf('://');
  if (idx < 0) return '';
  var rest = url.slice(idx + 3);
  var slash = rest.indexOf('/');
  if (slash < 0) {
    var q = rest.indexOf('?');
    var h = rest.indexOf('#');
    var end = rest.length;
    if (q >= 0 && q < end) end = q;
    if (h >= 0 && h < end) end = h;
    return url.slice(0, idx + 3 + end);
  }
  return url.slice(0, idx + 3 + slash);
};

CF.sanitizeReferer = function (refererValue, targetUrl) {
  if (!refererValue) return { value: refererValue, send: true };
  var hashIdx = refererValue.indexOf('#');
  var stripped = hashIdx >= 0 ? refererValue.slice(0, hashIdx) : refererValue;
  var srcScheme = CF.schemeFromUrl(refererValue);
  if (!srcScheme) return { value: refererValue, send: true };
  var dstScheme = CF.schemeFromUrl(targetUrl);
  if (srcScheme === 'https' && dstScheme === 'http') return { value: '', send: false };
  var srcHost = CF.hostFromUrl(refererValue);
  var dstHost = CF.hostFromUrl(targetUrl);
  if (srcHost && srcHost === dstHost) return { value: stripped, send: true };
  return { value: CF.originFromUrl(refererValue), send: true };
};

CF.deriveSecFetchSite = function (refererHeader, originHeader, targetHost) {
  var sourceHost = CF.hostFromUrl(refererHeader) || CF.hostFromUrl(originHeader);
  if (!sourceHost) return 'none';
  if (sourceHost === targetHost) return 'same-origin';
  if (CF.registrableDomain(sourceHost) === CF.registrableDomain(targetHost)) return 'same-site';
  return 'cross-site';
};

CF.visitKey = function (domain) {
  return 'cf_visit_' + domain.replace(/\./g, '_');
};

CF.notifyThrottleKey = function (domain) {
  return 'cf_notify_' + domain.replace(/\./g, '_');
};

CF.notifyThrottled = function (domain) {
  try {
    var key = CF.notifyThrottleKey(domain);
    var last = parseInt($persistentStore.read(key), 10) || 0;
    var now = Date.now();
    if (now - last < CF.CONFIG.NOTIFY_THROTTLE_MS) return false;
    $persistentStore.write(String(now), key);
    return true;
  } catch (e) {
    return true;
  }
};

CF.extractClearance = function (cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  var m = cookieHeader.match(/(?:^|;\s*)cf_clearance=([^;]+)/);
  return m ? m[1] : null;
};

CF.scrubCookie = function (cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return cookieHeader || '';
  var blacklist = CF.CONFIG.COOKIE_BLACKLIST;
  var prefixes = CF.CONFIG.COOKIE_PREFIX_BLACKLIST;
  var kept = [];
  var parts = cookieHeader.split(';');
  for (var i = 0; i < parts.length; i++) {
    var seg = parts[i].trim();
    if (!seg) continue;
    var eq = seg.indexOf('=');
    var name = eq >= 0 ? seg.slice(0, eq) : seg;
    var lname = name.toLowerCase();
    if (blacklist.indexOf(lname) >= 0) continue;
    var hit = false;
    for (var p = 0; p < prefixes.length; p++) {
      if (lname.slice(0, prefixes[p].length) === prefixes[p]) {
        hit = true;
        break;
      }
    }
    if (!hit) kept.push(seg);
  }
  return kept.join('; ');
};

CF.orderHeaders = function (headers) {
  if (!headers) return {};
  var lowerOrder = CF.orderIndex;
  var tail;
  if (!lowerOrder) {
    lowerOrder = {};
    var order = CF.CONFIG.HEADER_ORDER;
    for (var o = 0; o < order.length; o++) lowerOrder[order[o].toLowerCase()] = o;
    tail = order.length;
    CF.orderIndex = lowerOrder;
    CF.orderTail = tail;
  } else {
    tail = CF.orderTail;
  }
  var keys = Object.keys(headers);
  var indexed = [];
  for (var k = 0; k < keys.length; k++) {
    var lk = keys[k].toLowerCase();
    indexed.push({ key: keys[k], idx: lk in lowerOrder ? lowerOrder[lk] : tail, pos: k });
  }
  indexed.sort(function (a, b) {
    if (a.idx !== b.idx) return a.idx - b.idx;
    return a.pos - b.pos;
  });
  var out = {};
  for (var j = 0; j < indexed.length; j++) out[indexed[j].key] = headers[indexed[j].key];
  return out;
};

CF.isChallenge = function (status) {
  return CF.CONFIG.CHALLENGE_STATUS.indexOf(status) >= 0;
};

CF.buildSafariUA = function () {
  var env = typeof $environment !== 'undefined' ? $environment : {};
  var version = env['system-version'] || env.systemVersion || env.osVersion || null;
  var usedFallback = false;
  if (!version) {
    version = CF.CONFIG.FALLBACK_UA_VERSION_DOTTED;
    usedFallback = true;
  }
  version = String(version);
  var underscored = version.replace(/\./g, '_');
  return {
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS ' + underscored +
      ' like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/' +
      version + ' Mobile/15E148 Safari/604.1',
    usedFallback: usedFallback
  };
};

CF.storeKey = function (domain) {
  return CF.CONFIG.STORE_PREFIX + domain.replace(/\./g, '_');
};

CF.saveCookie = function (domain, obj) {
  try {
    return $persistentStore.write(JSON.stringify(obj), CF.storeKey(domain)) === true;
  } catch (e) {
    return false;
  }
};

CF.loadCookie = function (domain) {
  try {
    var raw = $persistentStore.read(CF.storeKey(domain));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
};

CF.clearCookie = function (domain) {
  try { $persistentStore.write('', CF.storeKey(domain)); } catch (e) {}
  try { $persistentStore.write('', CF.visitKey(domain)); } catch (e) {}
};

CF.notify = function (subtitle, content, openUrl) {
  try {
    if (openUrl) {
      try {
        $notification.post(CF.CONFIG.NOTIFY_TITLE, subtitle, content, {
          url: openUrl,
          'open-url': openUrl
        });
        return;
      } catch (e) {}
    }
    $notification.post(CF.CONFIG.NOTIFY_TITLE, subtitle, content);
  } catch (e) {
    try {
      if (typeof $notify !== 'undefined') {
        $notify(CF.CONFIG.NOTIFY_TITLE, subtitle, content, openUrl ? { url: openUrl } : {});
      }
    } catch (ignore) {}
  }
};

// 推送到本机 Node 服务（异步，不阻塞主流程）
CF.pushToNode = function (domain, payload) {
  var pushUrl = CF.getPushUrl();
  if (!pushUrl) return;

  var body = {
    domain: domain,
    cookies: payload.cookies || '',
    cf_clearance: payload.cf_clearance || '',
    ua: payload.ua || '',
    source: 'shadowrocket'
  };

  var donePush = false;
  function finish(ok, msg) {
    if (donePush) return;
    donePush = true;
    if (ok) {
      CF.notify('已同步 Node', domain);
    } else {
      CF.notify('同步 Node 失败', (msg || '') + ' @ ' + pushUrl);
    }
  }

  try {
    if (typeof $httpClient !== 'undefined' && $httpClient.post) {
      $httpClient.post({
        url: pushUrl,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        timeout: 5
      }, function (err, resp, data) {
        if (err) return finish(false, String(err));
        var code = resp && (resp.status || resp.statusCode);
        if (code && code >= 400) return finish(false, 'HTTP ' + code);
        finish(true);
      });
      return;
    }
  } catch (e) {}

  try {
    if (typeof $task !== 'undefined' && $task.fetch) {
      $task.fetch({
        url: pushUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (resp) {
        var code = resp && (resp.statusCode || resp.status);
        if (code && code >= 400) finish(false, 'HTTP ' + code);
        else finish(true);
      }, function (err) {
        finish(false, String(err && err.message || err));
      });
      return;
    }
  } catch (e) {}

  finish(false, '无可用 HTTP 客户端');
};

CF.buildCleanHeaders = function (req, overrides) {
  var headers = (req && req.headers) || {};
  overrides = overrides || {};
  var newHeaders = {};
  var whitelist = CF.CONFIG.HEADER_WHITELIST;
  var srcKeys = Object.keys(headers);
  for (var i = 0; i < srcKeys.length; i++) {
    var key = srcKeys[i];
    if (whitelist.indexOf(key.toLowerCase()) >= 0) newHeaders[key] = headers[key];
  }
  if (overrides.cookie !== undefined) {
    CF.setHeaderCI(newHeaders, 'Cookie', CF.scrubCookie(overrides.cookie));
  }
  if (overrides.ua !== undefined) {
    CF.setHeaderCI(newHeaders, 'User-Agent', overrides.ua);
  }
  var navHeaders = CF.CONFIG.SAFARI_NAV_HEADERS;
  var navKeys = Object.keys(navHeaders);
  for (var j = 0; j < navKeys.length; j++) {
    CF.setHeaderCI(newHeaders, navKeys[j], navHeaders[navKeys[j]]);
  }
  var targetHost = CF.hostFromUrl(req.url);
  CF.setHeaderCI(
    newHeaders,
    'Sec-Fetch-Site',
    CF.deriveSecFetchSite(
      CF.getHeaderCI(newHeaders, 'Referer'),
      CF.getHeaderCI(newHeaders, 'Origin'),
      targetHost
    )
  );
  var referer = CF.getHeaderCI(newHeaders, 'Referer');
  if (referer) {
    var sanitized = CF.sanitizeReferer(referer, req.url);
    if (sanitized.send) CF.setHeaderCI(newHeaders, 'Referer', sanitized.value);
    else CF.removeHeaderCI(newHeaders, 'Referer');
  }
  return CF.orderHeaders(newHeaders);
};

CF.handleRequest = function (domain) {
  var req = $request;
  var headers = (req && req.headers) || {};
  var cookieHeader = CF.getHeaderCI(headers, 'Cookie');
  var uaHeader = CF.getHeaderCI(headers, 'User-Agent');
  var existing = CF.extractClearance(cookieHeader);

  if (existing) {
    var prev = CF.loadCookie(domain);
    var changed = !prev ||
      prev.cf_clearance !== existing ||
      (prev.cookies || '') !== (cookieHeader || '') ||
      (prev.ua || '') !== (uaHeader || '');

    if (changed) {
      var payload = {
        cf_clearance: existing,
        cookies: cookieHeader,
        ua: uaHeader,
        savedAt: Date.now(),
        domain: domain
      };
      var saved = CF.saveCookie(domain, payload);
      if (!prev || prev.cf_clearance !== existing) {
        CF.notify('获取成功 ' + domain, '已捕获 cf_clearance');
      }
      if (!saved) {
        CF.notify(domain + ' 存储失败', 'cf_clearance 未能写入持久化存储');
      } else {
        // 推送到 Node（token 变化或首次）
        if (!prev || prev.cf_clearance !== existing || (prev.cookies || '') !== (cookieHeader || '')) {
          CF.pushToNode(domain, payload);
        }
      }
    } else {
      prev.savedAt = Date.now();
      CF.saveCookie(domain, prev);
    }
    $done({});
    return;
  }

  var cached = CF.loadCookie(domain);
  if (!cached || !cached.cf_clearance) {
    var visitKey = CF.visitKey(domain);
    try {
      if (!$persistentStore.read(visitKey)) {
        CF.notify('首次访问 ' + domain, '无缓存 cf_clearance，请在 Safari 打开该站点完成验证');
        $persistentStore.write('1', visitKey);
      }
    } catch (e) {}
    $done({});
    return;
  }

  var fallbackUA = '';
  if (!cached.ua) {
    try { fallbackUA = CF.buildSafariUA().ua; } catch (e) { fallbackUA = ''; }
  }

  var injectHeaders = CF.buildCleanHeaders(req, {
    cookie: cached.cookies || ('cf_clearance=' + cached.cf_clearance),
    ua: cached.ua || uaHeader || fallbackUA
  });
  $done({ headers: injectHeaders });
};

CF.handleResponse = function (domain) {
  var response = typeof $response !== 'undefined' ? $response : null;
  var status = parseInt(response && (response.statusCode || response.status), 10) || 0;

  if (CF.isChallenge(status)) {
    var cached = CF.loadCookie(domain);
    var now = Date.now();
    var fresh = cached && cached.savedAt && (now - cached.savedAt) <= CF.CONFIG.PROTECT_WINDOW;
    if (!fresh) CF.clearCookie(domain);
    if (CF.notifyThrottled(domain)) {
      var requestUrl = $request && $request.url;
      var host = CF.hostFromUrl(requestUrl) || domain;
      var openUrl = requestUrl || ('https://' + host + '/');
      CF.notify('CF 盾失效 ' + host, '检测到 challenge，点击通知用 Safari 重新验证', openUrl);
    }
  }
  $done({});
};

CF.dispatch = function () {
  try {
    if (typeof $request === 'undefined' || !$request || !$request.url) {
      $done({});
      return;
    }
    var host = CF.hostFromUrl($request.url);
    if (!host) { $done({}); return; }
    var domain = CF.registrableDomain(host);
    if (typeof $response === 'undefined' || !$response) CF.handleRequest(domain);
    else CF.handleResponse(domain);
  } catch (e) {
    CF.notify('脚本异常', String(e && e.message || e));
    $done({});
  }
};

if (typeof $request !== 'undefined') {
  CF.dispatch();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CF;
}
