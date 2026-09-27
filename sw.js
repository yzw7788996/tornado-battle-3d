const CACHE='tornado-v2';
const PAGE='./index.html';   // 页面只有一个固定缓存键:玩家可能从 / 、/index.html 或子路径进来
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll([
    PAGE,'./manifest.json','./icons/icon-192.png','./icons/icon-512.png'
  ])).then(()=>self.skipWaiting()));
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
