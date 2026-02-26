import CryptoJS from 'crypto-js';
import qr from 'qrcode';

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
  const url = `${e.server.address().url}/website`
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
      {
        vod_id: String(Math.random()),
        vod_name: "扫码配置",
        vod_pic: proxyUrl + '/' + base64Encode(`${e.server.address().url}/website`)
      },
      {
        vod_id: "openInternalWebsite",
        vod_name: "点击配置",
        vod_pic: proxyUrl + '/' + base64Encode(`${e.server.address().url}/website`)
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
        url: `${req.server.address().url}/website`,
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
    name: '⚙️ 配置',
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