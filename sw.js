const CACHE='tornado-v3';   // 精修#121:还原+画质增强是一次大版本(6.3MB),缓存键随版本走;旧键由 activate 整删,离线副本不会停在上一版
const PAGE='./index.html';   // 页面只有一个固定缓存键:玩家可能从 / 、/index.html 或子路径进来
self.addEventListener('install',e=>{
 /* 主页面是离线兜底的唯一关键件:它拉不下来就宁可安装失败、留住上一版缓存(旧 SW 继续服务),
    "断网还能玩"这条承诺不回退;manifest/图标只是锦上添花,逐项容错 ——
    旧写法 addAll 全有或全无,一个图标 404 就把整个离线安装拖垮(精修#121 立案即修)。 */
 e.waitUntil(caches.open(CACHE).then(async c=>{
  await c.put(PAGE,await fetch(PAGE));
  await Promise.allSettled(['./manifest.json','./icons/icon-192.png','./icons/icon-512.png']
   .map(u=>fetch(u).then(r=>c.put(u,r))));
 }).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{e.waitUntil(
  caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const url=e.request.url;
  if(e.request.mode==='navigate'||url.endsWith('index.html')){
    // 页面导航:网络优先,失败回退缓存。存和取都必须用 PAGE 这个键——
    // 早先按"导航到的那个 URL"存、却按 './index.html' 取,从站点根地址进入后断网重进必然落空。
    e.respondWith(fetch(e.request).then(res=>{
      const cp=res.clone();
      caches.open(CACHE).then(c=>c.put(PAGE,cp));
      return res;
    }).catch(()=>caches.match(PAGE)));
  }else{
    // 静态资源:缓存优先
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
      const cp=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request,cp));
      return res;
    })));
  }
});
