const CACHE='tornado-v1-1';
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll([
    './','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'
  ])).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{e.waitUntil(
  caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const url=e.request.url;
  if(e.request.mode==='navigate'||url.endsWith('index.html')){
    // 页面导航:网络优先,失败回退缓存(保证更新及时)
    e.respondWith(fetch(e.request).then(res=>{
      const cp=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request,cp));
      return res;
    }).catch(()=>caches.match('./index.html')));
  }else{
    // 静态资源:缓存优先
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
      const cp=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request,cp));
      return res;
    })));
  }
});
