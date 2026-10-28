const CACHE='tornado-3.2.0';   // 缓存键由 build.py 从 _game3d.js 的 VER 盖章(精修#136),手改会被下次构建覆盖;旧键由 activate 整删,离线副本不会停在上一版
const PAGE='./index.html';   // 页面只有一个固定缓存键:玩家可能从 / 、/index.html 或子路径进来
const CLASSIC='./classic.html';   // 精修#138:classic 也进离线包 —— 旧单键设计下断网访问 classic 会被 3D 版顶替(r134 实测入档),怀旧版离线不可玩;两个页面各有各的键
self.addEventListener('install',e=>{
 /* 主页面是离线兜底的唯一关键件:它拉不下来就宁可安装失败、留住上一版缓存(旧 SW 继续服务),
    "断网还能玩"这条承诺不回退;manifest/图标只是锦上添花,逐项容错 ——
    旧写法 addAll 全有或全无,一个图标 404 就把整个离线安装拖垮(精修#121 立案即修)。 */
 e.waitUntil(caches.open(CACHE).then(async c=>{
  /* r.ok 守卫(精修#124):实测附件 404 时旧写法把 404 响应原样写进缓存,离线期"命中"的其实是 404,
     且坏条目要等下一次 install 才有机会清掉 —— 非 2xx 一律不入缓存。主页面同理:404 也算"拉不下来",
     抛错让安装失败、保住上一版缓存。 */
  const r0=await fetch(PAGE);if(!r0.ok)throw new Error('PAGE '+r0.status);
  await c.put(PAGE,r0);
  const rc=await fetch(CLASSIC);if(!rc.ok)throw new Error('CLASSIC '+rc.status);
  await c.put(CLASSIC,rc);   // classic 只有 36KB 且是仓库固定文件,与主页面同级走关键路径:拉不下来同样安装失败、保旧缓存
  await Promise.allSettled(['./manifest.json','./icons/icon-192.png','./icons/icon-512.png',
   './icons/icon-192-maskable.png','./icons/icon-512-maskable.png']   // 精修#122:maskable 图标进了 manifest,离线安装提示也要能取到
   .map(u=>fetch(u).then(r=>{if(!r.ok)throw new Error(u+' '+r.status);return c.put(u,r);})));
 }).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{e.waitUntil(
  caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const url=e.request.url;
  const classic=url.endsWith('classic.html');
  if(e.request.mode==='navigate'||url.endsWith('index.html')||classic){
    // 页面导航:网络优先,失败回退缓存。存和取用同一个键(双页面双键:3D↔PAGE,classic↔CLASSIC)——
    // 早先按"导航到的那个 URL"存、却按 './index.html' 取,从站点根地址进入后断网重进必然落空;
    // 单键时代 classic 断网会错拿 3D 版(#138 修),根地址 '/' 两个 endsWith 都不中,仍落 PAGE。
    const key=classic?CLASSIC:PAGE;
    /* SWR(#298):回访启动不再等 6.6MB 重下 —— 缓存里有就立刻出图,后台拉新写入缓存,更新下次启动生效。
       原"网络优先"让老玩家每次启动都同步等全量下载(慢网下数秒),而更新本就少发;SW 脚本自身仍走
       浏览器的更新检查(绕 HTTP 缓存),新 CACHE 键在 activate 清旧 → 更新路径两次启动内收敛 */
    e.respondWith(caches.match(key).then(cached=>{
      const net=fetch(e.request).then(res=>{
        if(res.ok)caches.open(CACHE).then(c=>c.put(key,res.clone()));
        return res;}).catch(()=>cached);
      return cached||net;}));
  }else{
    // 静态资源:缓存优先
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
      const cp=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request,cp));
      return res;
    })));
  }
});
