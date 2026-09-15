// 开发模式从磁盘读取 pages/*.html；npm run build 时 esbuild 会内嵌 HTML 到单文件 index.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cache = new Map();

const SKIP_BACK = new Set(['index', 'js', 'sites']);

const BACK_INJECT = `
<style>
a.config-return-inject{
  position:fixed!important;z-index:10050!important;
  top:max(12px,env(safe-area-inset-top))!important;
  right:max(12px,env(safe-area-inset-right))!important;
  left:auto!important;bottom:auto!important;
  display:inline-flex!important;min-height:36px!important;height:36px!important;
  padding:0 12px!important;align-items:center!important;justify-content:center!important;
  border:1px solid rgba(102,126,234,.35)!important;border-radius:12px!important;
  background:#fff!important;color:#667eea!important;
  font:600 12.5px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif!important;
  text-decoration:none!important;box-shadow:0 2px 8px rgba(15,23,42,.08)!important;
  -webkit-tap-highlight-color:transparent;cursor:pointer
}
@media(max-width:480px){
  a.config-return-inject{width:36px!important;min-width:36px!important;padding:0!important;font-size:0!important}
  a.config-return-inject::before{content:"↩";font-size:17px;line-height:1}
}
</style>
<a class="config-return-inject" href="/website" title="返回配置管理">← 配置管理</a>
<script>
(function(){
  var a=document.querySelector("a.config-return-inject");
  if(!a)return;
  function go(e){
    if(e){e.preventDefault();e.stopPropagation();}
    try{location.assign("/website")}catch(err){location.href="/website"}
  }
  a.addEventListener("click",go,true);
  a.addEventListener("touchend",function(e){go(e)},true);
})();
</script>
`;

export function injectBack(name, html) {
  if (!html || SKIP_BACK.has(name) || html.includes('config-return-inject')) return html;
  if (html.includes('</body>')) return html.replace('</body>', BACK_INJECT + '</body>');
  return html + BACK_INJECT;
}

export function loadPage(name) {
  if (cache.has(name)) return cache.get(name);
  const file = path.join(__dirname, 'pages', `${name}.html`);
  const html = injectBack(name, fs.readFileSync(file, 'utf8'));
  cache.set(name, html);
  return html;
}

export function wantsHtml(req) {
  return (req.headers.accept || '').includes('text/html');
}
