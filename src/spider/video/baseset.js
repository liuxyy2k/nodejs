import CryptoJS from 'crypto-js';
import qr from 'qrcode';

/** admin/pages/index.html 对应路由 /website/ */
const ADMIN_INDEX = '/website/';
const CLICK_CONFIG_PIC = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iI2ZmZmZmZiIvPjwvc3ZnPg==';

function adminIndexUrl(server) {
  return `${server.address().url}${ADMIN_INDEX}`;
}

function base64Decode(text) {
  return CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(text));
}

function base64Encode(text) {
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(text));
}

async function init(inReq, outResp) {
  return {}
}


async function home(e, t) {
  const url = adminIndexUrl(e.server);
  return {
    class: [
      {
        type_id: 'setting',
        type_name: url
      }
    ]
  }
}

// 分类实现方法
async function category(e, t) {
  let r = e.body.id;
  let n = [];
  const proxyUrl = e.server.address().url + e.server.prefix + '/proxy';
  return {
    page: 1,
    pagecount: 1,
    limit: 1,
    total: 1,
    list: [
      // {
      //   vod_id: String(Math.random()),
      //   vod_name: "扫码配置",
      //   vod_pic: proxyUrl + '/' + base64Encode(adminIndexUrl(e.server))
      // },
      {
        vod_id: 'openInternalWebsite',
        vod_name: '点击配置',
        vod_pic: CLICK_CONFIG_PIC,
      }
    ]
  }
}

// 详情方法
async function detail(req, t) {
  if (req.body.id === 'openInternalWebsite') {
    await req.server.messageToDart({
      action: 'openInternalWebview',
      opt: {
        url: adminIndexUrl(req.server),
      },
    });
    return {
      list: [{
        vod_name: '',
        vod_content: ''
      }]
    }
  }
  return {
    list: [{
      vod_name: '',
      vod_content: ''
    }]
  }
}

async function proxy(inReq, outResp) {
  const img = inReq.params.img;
  const text = base64Decode(img)
  const buffer = await qr.toBuffer(text, {width: 120, height: 120, margin: 15});
  outResp.send(buffer);
}

export default {
  meta: {
    key: 'baseset',
    name: '⚙️配置页面',
    type: 3,
  },
  api: async (fastify) => {
    fastify.post('/init', init);
    fastify.post('/home', home);
    fastify.post('/category', category);
    fastify.post('/detail', detail);
    fastify.get('/proxy/:img', proxy);
  },
};