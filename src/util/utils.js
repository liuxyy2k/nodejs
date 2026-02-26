import {conversion, formatPlayUrl} from "./misc.js";
import axios from "axios";

function getVodNumber(name) {
  let t = /(E|EP)0?([1-9]\d*).*/.exec(name);
  if (t) return Number(t[2]);
  let r = /.*?([1-9]\d*).*/.exec(name);
  if (r) return Number(r[1]);
  return null
}

export function videosHandle(from, videos) {
  const result = {};
  if (videos.length === 0) return result

  videos.sort((vod1, vod2) => {
    const vod1Number = getVodNumber(vod1.vod_name)
    const vod2Number = getVodNumber(vod2.vod_name)
    return vod1Number !== null && vod2Number !== null ? vod1Number - vod2Number : vod1.vod_name.localeCompare(vod2.vod_name)
  });

  videos = videos.map(item => {
    const size = conversion(item.vod_size);
    return {
      vod_id: item.vod_id,
      vod_name: formatPlayUrl('', ` ${item.vod_name.replace(/.[^.]+$/,'')}  [${size}]`),
    }
  })

  result.from = from;
  result.url = videos
    .map((v) => {
      return v.vod_name + '$' + v.vod_id;
    })
    .join('#')
  return result
}

export async function firstSuccessfulUrl(urls, headers) {
  return new Promise((resolve) => {
    urls.forEach(url => {
      axios.head(url,{ headers })
        .then(response => {
          if (response.status === 200) {
            // 请求成功，直接返回这个url
            resolve(url);
          }
        })
        .catch(() => {
        });
    });
  });
}