'use strict';
/*__PHOTOS__*/
/* ============================================================
   龙卷风大作战 3D(写实版)—— Three.js r149
   PBR 材质 / 程序生成贴图 / ACES 色调映射 / 噪声着色器风柱 / 闪电风暴
   ============================================================ */
const $=id=>document.getElementById(id);
function rnd(a,b){return a+Math.random()*(b-a);}
/* ---------- 玩家设置(存 tornadoCfg,面板在第 5B 轮接入) ---------- */
const VER='3.1.0';   // 版本号只有一个来源:菜单脚注和战报卡都从这里取
const CFGD={master:90,sfx:85,amb:70,quality:'auto',vib:true,reduce:'auto',cb:false,mode:'campaign'};
let CFG=Object.assign({},CFGD);
try{const s=JSON.parse(localStorage.getItem('tornadoCfg'));if(s)CFG=Object.assign(CFG,s);}catch(e){}
function saveCfg(){try{localStorage.setItem('tornadoCfg',JSON.stringify(CFG))}catch(e){}}
let reduceMotion=false;
function sysReduce(){try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}}
function applyReduce(){reduceMotion=CFG.reduce==='on'?true:CFG.reduce==='off'?false:sysReduce();}
const QSTEP={high:0,mid:2,low:3};
let qAuto=true;
function applyQuality(){qAuto=CFG.quality==='auto';
 if(!qAuto){qStep=QSTEP[CFG.quality];applyQ();}}
function applyCfg(){applyReduce();applyQuality();
 if(masterG)masterG.gain.value=.9*CFG.master/100;
 if(busAmb)busAmb.gain.value=CFG.amb/100;
 if(busSfx)busSfx.gain.value=CFG.sfx/100;
 for(const m of lockRings)m.material.color.setHex(CFG.cb?0xbfe0ff:0xffd98a);
 if(document.getElementById('sVib'))renderSettings();}
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const easeOut=t=>1-Math.pow(1-t,3);
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);

/* ---------- 渲染基础 ---------- */
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}
catch(e){ // 说清原因并给出出口,而不是把整页换成一行判死刑的字
 if(window.__bootFail)__bootFail('这台设备或浏览器跑不了 3D','原因:'+(e&&e.message?
  String(e.message).slice(0,120):'WebGL 不可用')+'。可以换个浏览器,或在系统设置里开启图形加速后重新加载。');
 else document.body.innerHTML='<p style="color:#fff;padding:40px;font-size:18px">此浏览器不支持 WebGL,无法运行 3D 版。</p>';
 throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.94;
renderer.domElement.className='game3d';
document.body.prepend(renderer.domElement);
const scene=new THREE.Scene();
scene.fog=new THREE.Fog(0xc3d9ea,1500,4600);
const camera=new THREE.PerspectiveCamera(55,1,2,16000);
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();
/* 第二排(连击牌/计时器/对手牌)和升级横幅的位置不能写死魔数:"还差几分"那行会折行,
   第一排实际高到 ~78px,写死的 top:64px 就把连击牌压在分数面板下沿、把横幅落在倒计时那一行。
   量真实高度交给 CSS 变量 --hudh,ResizeObserver 覆盖"没改窗口但行长变了"的情况。 */
function hudH(){const h=$('hud');if(h)document.documentElement.style.setProperty('--hudh',h.offsetHeight+'px');}
addEventListener('resize',hudH);
if('ResizeObserver' in window&&$('hud'))new ResizeObserver(hudH).observe($('hud'));
const MAXANI=Math.min(8,renderer.capabilities.getMaxAnisotropy());
/* 斜视角不该被 mipmap 抹平:所有真正贴在表面上的画布贴图统一开各向异性。
   实测(第 56 轮 probe93):墙面一张 512² 铺在 20m 的立面上 = 33.8 纹素/px,而各向异性=1 ⇒ 屏幕上的
   街道面全被平均成一片糊;这里开一次就把 10 个 CanvasTexture 创建点全覆盖,不用每处记得写。
   两类豁免都要有证人(verify49 B2 数着):①天空/环境球——不斜贴在表面上看;②根本没开 mipmap 的贴图——
   各向异性对它们不起作用,那种"糊"归细节密度那条判据管,不许混进这条。 */
function applyAniso(){let n=0,sk=0;
 const hit=t=>{if(!t||!t.isTexture||t.__ani)return;t.__ani=1;
  if(t.mapping===THREE.EquirectangularReflectionMapping||!t.generateMipmaps){sk++;return;}
  t.anisotropy=MAXANI;n++;};
 scene.traverse(o=>{const ms=Array.isArray(o.material)?o.material:[o.material];
  for(const m of ms){if(!m)continue;
   for(const k of ['map','normalMap','roughnessMap','emissiveMap','aoMap','envMap'])hit(m[k]);}});
 hit(scene.environment);hit(scene.background);
 return {n,sk};}
/* 帧率自适应:低帧自动降采样保流畅 */
const DPRS=[2,1.5,1.25,1];let qStep=0,fpsAcc=0,fpsN=0,qCool=0;
function applyQ(){renderer.setPixelRatio(Math.min(devicePixelRatio||1,DPRS[qStep]));}
let lastFPS=0;
function qualityTick(dt){if(!qAuto)return;fpsAcc+=dt;fpsN++;qCool-=dt;
 if(fpsAcc>=2){const fps=fpsN/fpsAcc;fpsAcc=0;fpsN=0;lastFPS=fps;
  if(qCool<=0){
   if(fps<42&&qStep<DPRS.length-1){qStep++;applyQ();qCool=8;}
   else if(fps>56&&qStep>0){qStep--;applyQ();qCool=14;}}}}

const hemi=new THREE.HemisphereLight(0xbcd4ee,0x5c7248,.42);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffe2b0,1.66);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-430,right:430,top:430,bottom:-430,near:20,far:2400});
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias=-.0006;
scene.add(sun);scene.add(sun.target);

/* ---------- 程序化法线贴图(高度图 -> 法线) ---------- */
function vnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
 const h=(a,b)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
 const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
 return h(xi,yi)*(1-u)*(1-v)+h(xi+1,yi)*u*(1-v)+h(xi,yi+1)*(1-u)*v+h(xi+1,yi+1)*u*v;}
function heightToNormal(w,h,fn,strength){const hc=document.createElement('canvas');hc.width=w;hc.height=h;
 const g=hc.getContext('2d');const img=g.createImageData(w,h);const d=img.data;
 const s=strength||2;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const hl=fn((x-1+w)%w,y),hr=fn((x+1)%w,y),hu=fn(x,(y-1+h)%h),hd=fn(x,(y+1)%h);
  let nx=(hl-hr)*s,ny=(hd-hu)*s,nz=1;
  const l=Math.hypot(nx,ny,nz);nx/=l;ny/=l;nz/=l;
  const i=(y*w+x)*4;
  d[i]=(nx*.5+.5)*255;d[i+1]=(ny*.5+.5)*255;d[i+2]=(nz*.5+.5)*255;d[i+3]=255;}
 g.putImageData(img,0,0);
 const t=new THREE.CanvasTexture(hc);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
function normalFromCanvas(hc,strength){const w=hc.width,h=hc.height;
 const sd=hc.getContext('2d').getImageData(0,0,w,h).data;
 return heightToNormal(w,h,(x,y)=>sd[(((y+h)%h)*w+((x+w)%w))*4]/255,strength||2.2);}
/* 碎块纹理:底色画浅,靠实例颜色染色 */
function texChunk(base,detail){const c=document.createElement('canvas');c.width=c.height=128;
 const g=c.getContext('2d');g.fillStyle=base;g.fillRect(0,0,128,128);detail(g);
 noiseOn(g,128,128,300,.14);
 const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;}
const CHUNKTEX={
 concrete:texChunk('#c9ccce',g=>{g.fillStyle='#3a4750';g.fillRect(18,26,44,34);
  g.strokeStyle='#8b9096';g.lineWidth=3;g.strokeRect(18,26,44,34);
  g.fillStyle='rgba(255,255,255,.18)';g.fillRect(22,30,14,26);
  g.strokeStyle='rgba(0,0,0,.25)';g.lineWidth=2;g.beginPath();
  g.moveTo(80,10);g.lineTo(96,60);g.lineTo(84,110);g.stroke();}),
 wood:texChunk('#d8b892',g=>{g.strokeStyle='rgba(120,80,40,.5)';
  for(let y=10;y<128;y+=14){g.lineWidth=rnd(2,4);g.beginPath();g.moveTo(0,y);
   g.bezierCurveTo(40,y+rnd(-5,5),90,y+rnd(-5,5),128,y);g.stroke();}
  g.fillStyle='rgba(90,60,30,.4)';g.beginPath();g.arc(90,84,7,0,7);g.fill();}),
 leaf:texChunk('#cfe0c0',g=>{for(let i=0;i<40;i++){
  g.fillStyle=Math.random()<.5?'rgba(110,150,80,.5)':'rgba(70,110,50,.45)';
  g.beginPath();g.arc(rnd(0,128),rnd(0,128),rnd(4,12),0,7);g.fill();}}),
 stone:texChunk('#c8cacd',g=>{for(let i=0;i<26;i++){g.fillStyle='rgba(90,95,100,.28)';
  g.beginPath();g.arc(rnd(0,128),rnd(0,128),rnd(6,20),0,7);g.fill();}
  g.strokeStyle='rgba(60,64,68,.4)';g.lineWidth=2;g.beginPath();
  g.moveTo(10,100);g.lineTo(50,70);g.lineTo(78,92);g.lineTo(120,50);g.stroke();}),
 metal:texChunk('#d0d4d8',g=>{for(let i=0;i<10;i++){
  g.fillStyle='rgba(255,255,255,'+rnd(.06,.16)+')';
  g.fillRect(rnd(0,120),0,rnd(2,7),128);}
  g.strokeStyle='rgba(70,80,90,.35)';g.lineWidth=1.5;
  for(let i=0;i<6;i++){g.beginPath();g.moveTo(rnd(0,128),rnd(0,128));
   g.lineTo(rnd(0,128),rnd(0,128));g.stroke();}}),
 bark:texChunk('#d8c8b8',g=>{g.strokeStyle='rgba(90,60,40,.5)';
  for(let x=6;x<128;x+=12){g.lineWidth=rnd(2,5);g.beginPath();g.moveTo(x,0);
   g.bezierCurveTo(x+rnd(-6,6),40,x+rnd(-6,6),90,x+rnd(-6,6),128);g.stroke();}}),
};

/* ---------- 环境反射 + 天空 ---------- */
function makeSkyTex(){const c=document.createElement('canvas');c.width=512;c.height=256;
 const g=c.getContext('2d');
 const gr=g.createLinearGradient(0,0,0,128);
 gr.addColorStop(0,'#2e62a8');gr.addColorStop(.55,'#7fb0dd');gr.addColorStop(1,'#d9e8f2');
 g.fillStyle=gr;g.fillRect(0,0,512,128);
 g.fillStyle='#5e6e58';g.fillRect(0,128,512,128);
 g.fillStyle='#6d7d62';g.fillRect(0,128,512,40);
 for(let i=0;i<26;i++){g.fillStyle='rgba(255,255,255,'+rnd(.15,.4)+')';
  const x=rnd(0,512),y=rnd(8,100),w=rnd(24,90),h=rnd(4,12);
  g.beginPath();g.ellipse(x,y,w,h,0,0,7);g.fill();}
 const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.mapping=THREE.EquirectangularReflectionMapping;
 return t;}
let skyMatRef=null;
{const pmrem=new THREE.PMREMGenerator(renderer);
 scene.environment=pmrem.fromEquirectangular(makeSkyTex()).texture;
 skyMatRef=new THREE.ShaderMaterial({side:THREE.BackSide,fog:false,depthWrite:false,
  uniforms:{sunDir:{value:V3(.45,.5,.32).normalize()},storm:{value:0}},
  vertexShader:`varying vec3 vDir;void main(){vDir=position;
   gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec3 vDir;uniform vec3 sunDir;uniform float storm;
   void main(){vec3 d=normalize(vDir);float hgt=max(d.y,0.0);
    vec3 top=vec3(.12,.30,.63),hor=vec3(.78,.86,.92);
    vec3 col=mix(hor,top,pow(hgt,.52));
    float s=max(dot(d,normalize(sunDir)),0.0);
    col+=vec3(1.0,.9,.72)*(pow(s,420.0)*1.5+pow(s,9.0)*.15)*(1.0-storm*.8);
    col=mix(vec3(.82,.88,.93),col,smoothstep(0.0,.22,hgt));
    col=mix(col,mix(vec3(.28,.31,.36),vec3(.44,.48,.54),pow(hgt,.55)),storm*.88);
    gl_FragColor=vec4(col,1.0);}`});
 const dome=new THREE.Mesh(new THREE.SphereGeometry(9000,24,12),skyMatRef);
 scene.add(dome);}

/* ---------- 种子随机:同一 seed 生成同一座城(存档续玩的基础) ---------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
let citySeed=0,objIdSeq=0;
function withSeed(seed,fn){const oMR=Math.random,oR=rnd;
 const g=mulberry32(seed);Math.random=g;
 rnd=function(a,b){return a+g()*(b-a);};
 try{fn();}finally{Math.random=oMR;rnd=oR;}}

/* ---------- 世界设定 ---------- */
const WORLD=3200;
const PARK={x:0,z:2050,w:1500,h:1150};
const ROADS=[{x:0,z:1000,w:3200,h:110},{x:0,z:2050,w:3200,h:110},
             {x:1450,z:0,w:110,h:3200},{x:2450,z:0,w:110,h:3200}];
const POND={x:560,z:2660,r:115};
const ZR={park:[{x:30,z:2200,w:1440,h:970}],
 suburb:[{x:1620,z:2200,w:1550,h:970},{x:60,z:1170,w:3110,h:800}],
 downtown:[{x:790,z:60,w:2350,h:880}]};
const SEA={x:0,z:0,w:560,h:960};
ZR.beach=[{x:565,z:40,w:130,h:880}];
ZR.grass=ZR.park.concat(ZR.suburb);
ZR.city=ZR.suburb.concat(ZR.downtown);
// 阈值按"分段收入"排过:实测 LV5→6 段 ~84 分/秒而 LV2 段 ~5 分/秒,旧表让 5→6 只用 2 秒连升,
// 玩家来不及看清「下一级解锁」就已经过了。新表让相邻两级至少隔 6 秒、整局约 93 秒(与限时同量级)。
/* 第一次"我变大了"必须在玩家还在乱点的头 20 秒内发生。
   实测(随机点按的台架玩家,75s 三跑):TH[1]=48 时三跑全都没升级(分数 23~37,±30% 抖动),
   降到 12 后 6.9s / 7.8s / 19.3s 三次全中。后面的门槛一律不动 ——
   贪心 bot 的整局节奏(第 12 轮特意拉长到 ~2 分钟)不能被早期改动牵连。 */
const TH=[0,12,144,304,640,1360,2240,3600];
const LVN=['微风小龙卷','街道捣蛋鬼','公园终结者','街区拆迁队','汽车收藏家','楼房终结者','摩天楼克星','天灾之王'];

/* ---------- 地面贴图(噪声草地 + 沥青路 + 斑马线) ---------- */
let groundG=null,groundTex=null;
function makeGround(){
 const S=2048,c=document.createElement('canvas');c.width=c.height=S;
 const g=c.getContext('2d'),K=S/WORLD,X=v=>v*K;
 g.fillStyle='#74975540';g.fillStyle='#74975a';g.fillRect(0,0,S,S);
 // 草地噪声
 for(let i=0;i<9000;i++){const x=rnd(0,S),y=rnd(0,S),s=rnd(1,3.4);
  g.fillStyle=Math.random()<.5?'rgba(58,88,44,.20)':'rgba(150,178,96,.18)';
  g.fillRect(x,y,s,s);}
 // 公园更亮
 g.fillStyle='rgba(126,172,84,.55)';g.fillRect(X(PARK.x),X(PARK.z),PARK.w*K,PARK.h*K);
 for(let i=0;i<2600;i++){const x=X(PARK.x)+rnd(0,PARK.w*K),y=X(PARK.z)+rnd(0,PARK.h*K);
  g.fillStyle=Math.random()<.5?'rgba(70,104,50,.16)':'rgba(160,190,110,.15)';
  g.fillRect(x,y,rnd(1,3),rnd(1,3));}
 // 市中心混凝土 + 伸缩缝
 g.fillStyle='#a3a7ab';g.fillRect(X(0),X(0),3200*K,1000*K);
 const sg=g.createLinearGradient(X(0),X(0),X(SEA.w),X(0));
 sg.addColorStop(0,'#2a6d9e');sg.addColorStop(.8,'#3d8fb8');sg.addColorStop(1,'#7ec8d8');
 g.fillStyle=sg;g.fillRect(X(0),X(0),SEA.w*K,SEA.h*K);
 g.fillStyle='#dccfa0';g.fillRect(X(SEA.w),X(0),150*K,SEA.h*K);
 g.fillStyle='#e8dcb4';g.fillRect(X(SEA.w+40),X(0),60*K,SEA.h*K);
 for(let i=0;i<1800;i++){g.fillStyle='rgba(60,64,68,.10)';
  g.fillRect(X(0)+rnd(0,3200*K),X(0)+rnd(0,1000*K),rnd(1,3),rnd(1,3));}
 g.strokeStyle='rgba(80,84,88,.35)';g.lineWidth=1.5;
 for(let x=0;x<=3200;x+=160){g.beginPath();g.moveTo(X(x),X(0));g.lineTo(X(x),X(1000));g.stroke();}
 for(let z=0;z<=1000;z+=160){g.beginPath();g.moveTo(X(0),X(z));g.lineTo(X(3200),X(z));g.stroke();}
 // 郊区人行道 + 马路
 for(const rd of ROADS){
  const sw=34;
  g.fillStyle='#9aa0a3';
  if(rd.h>rd.w)g.fillRect(X(rd.x-sw),X(rd.z),(rd.w+sw*2)*K,rd.h*K);
  else g.fillRect(X(rd.x),X(rd.z-sw),rd.w*K,(rd.h+sw*2)*K);
  g.fillStyle='#4b4f53';
  g.fillRect(X(rd.x),X(rd.z),rd.w*K,rd.h*K);
  for(let i=0;i<1600;i++){g.fillStyle='rgba(255,255,255,.05)';
   const px=rd.h>rd.w?X(rd.x)+rnd(0,rd.w*K):X(rd.x)+rnd(0,rd.w*K);
   g.fillRect(rd.h>rd.w?X(rd.x)+rnd(0,rd.w*K):X(rd.x)+rnd(0,rd.w*K),
              rd.h>rd.w?X(rd.z)+rnd(0,rd.h*K):X(rd.z)+rnd(0,rd.h*K),rnd(1,2.5),rnd(1,2.5));}
 }
 // 车道虚线
 g.setLineDash([26,24]);g.strokeStyle='rgba(235,225,160,.85)';g.lineWidth=4;
 for(const rd of ROADS){g.beginPath();
  if(rd.h>rd.w){g.moveTo(X(rd.x+rd.w/2),X(rd.z));g.lineTo(X(rd.x+rd.w/2),X(rd.z+rd.h));}
  else{g.moveTo(X(rd.x),X(rd.z+rd.h/2));g.lineTo(X(rd.x+rd.w),X(rd.z+rd.h/2));}
  g.stroke();}
 g.setLineDash([]);
 // 路口斑马线
 const cross=(cx,cz,vert)=>{g.fillStyle='rgba(240,240,240,.8)';
  for(let i=-2;i<=2;i++){if(vert)g.fillRect(X(cx)+i*16-5,X(cz)-38,10,76);
   else g.fillRect(X(cx)-38,X(cz)+i*16-5,76,10);}};
 cross(1505,1000,true);cross(2450,1000,false);cross(1505,2050,true);
 // 池塘:沙滩 + 水
 g.fillStyle='#c9bd90';g.beginPath();g.ellipse(X(POND.x),X(POND.z),(POND.r+16)*K,(POND.r+16)*.85*K,0,0,7);g.fill();
 g.fillStyle='#3d7ea8';g.beginPath();g.ellipse(X(POND.x),X(POND.z),POND.r*K,POND.r*.85*K,0,0,7);g.fill();
 g.fillStyle='#4f93bd';g.beginPath();g.ellipse(X(POND.x-14),X(POND.z-10),POND.r*.72*K,POND.r*.6*K,0,0,7);g.fill();
 g.strokeStyle='rgba(255,255,255,.5)';g.lineWidth=3;
 for(let i=0;i<4;i++){g.beginPath();
  g.ellipse(X(POND.x+rnd(-30,30)),X(POND.z+rnd(-24,24)),rnd(14,34)*K,rnd(6,12)*K,0,.4,2.6);g.stroke();}
 const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=MAXANI;
 groundG=g;groundTex=t;return t;}
const groundN=heightToNormal(128,128,(x,y)=>vnoise(x*.9,y*.9)*.7+vnoise(x*3.1,y*3.1)*.3,1.3);
groundN.repeat.set(46,46);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(WORLD,WORLD),
 new THREE.MeshStandardMaterial({map:makeGround(),roughness:1,metalness:0,
  normalMap:groundN,normalScale:new THREE.Vector2(.5,.5),envMapIntensity:.22}));
ground.rotation.x=-Math.PI/2;ground.position.set(1600,0,1600);
ground.receiveShadow=true;scene.add(ground);
function waterTex(){const c=document.createElement('canvas');c.width=256;c.height=256;
 const g=c.getContext('2d');g.fillStyle='#3d8fb8';g.fillRect(0,0,256,256);
 for(let i=0;i<70;i++){g.strokeStyle='rgba(255,255,255,'+rnd(.06,.2).toFixed(2)+')';
  g.lineWidth=rnd(1,3);const y=rnd(0,256),x=rnd(-20,220);g.beginPath();
  g.moveTo(x,y);g.bezierCurveTo(x+30,y+rnd(-6,6),x+60,y+rnd(-6,6),x+rnd(60,110),y);g.stroke();}
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.encoding=THREE.sRGBEncoding;
 t.repeat.set(3,5);t.anisotropy=MAXANI;return t;}
/* 海鸥:海域上空盘旋扑翼 */
const gullMat=new THREE.MeshBasicMaterial({color:0xf4f6f8,side:THREE.DoubleSide});
const gulls=[];
for(let i=0;i<7;i++){
 const g=new THREE.Group();
 const wingGeo=new THREE.BufferGeometry();
 wingGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array([
  0,0,0,  8,0,-2.2,  7,.4,1.6,  0,0,0,  -8,0,-2.2,  -7,.4,1.6]),3));
 wingGeo.computeVertexNormals();
 const wl=new THREE.Mesh(wingGeo,gullMat),wr=new THREE.Mesh(wingGeo,gullMat);
 wr.scale.x=-1;g.add(wl);g.add(wr);g.userData.wl=wl;g.userData.wr=wr;
 const cx=SEA.w*.5+rnd(-140,140),cz=SEA.h*.5+rnd(-140,140);
 gulls.push({g,cx,cz,rr:rnd(90,220),h:rnd(90,170),
  a:rnd(0,6.28),spd:rnd(.25,.5)*(Math.random()<.5?1:-1),flap:rnd(0,6)});
 scene.add(g);}
const waterMat=new THREE.MeshStandardMaterial({map:waterTex(),transparent:true,opacity:.88,
 roughness:.15,metalness:.25,envMapIntensity:1.1});
const water=new THREE.Mesh(new THREE.PlaneGeometry(SEA.w,SEA.h),waterMat);
water.rotation.x=-Math.PI/2;water.position.set(SEA.w/2,.8,SEA.h/2);scene.add(water);
/* 地面照片叠加:草地/沥青/混凝土(CC0),加载完成后重绘 */
function loadGroundPhotos(){if(!PHOTO||!groundG)return;
 const K=2048/WORLD,X=v=>v*K;
 const im=[];let loaded=0;
 [PHOTO.grass_diff,PHOTO.asphalt_diff,PHOTO.concrete_diff].forEach((u,i)=>{
  const q=new Image();q.onload=()=>{im[i]=q;if(++loaded===3)paint();};q.src=u;});
 function paint(){
  const patG=groundG.createPattern(im[0],'repeat');
  patG.setTransform(new DOMMatrix().scale(.09));groundG.globalAlpha=.42;groundG.fillStyle=patG;
  groundG.fillRect(X(PARK.x),X(PARK.z),PARK.w*K,PARK.h*K);
  for(const rc of ZR.suburb)groundG.fillRect(X(rc.x),X(rc.z),rc.w*K,rc.h*K);
  // 草簇笔触:短弧线成簇,消除近景糊感
  groundG.globalAlpha=.5;groundG.lineWidth=1.6;groundG.lineCap='round';
  for(let i=0;i<2600;i++){
   const gx=X(PARK.x)+rnd(0,PARK.w*K),gz=X(PARK.z)+rnd(0,PARK.h*K);
   groundG.strokeStyle=Math.random()<.5?'rgba(46,84,34,.55)':'rgba(120,158,72,.5)';
   for(let b=0;b<3;b++){groundG.beginPath();
    groundG.moveTo(gx+b*2-2,gz);groundG.quadraticCurveTo(gx+b*2-2+rnd(-2,2),gz-3,gx+b*2-2+rnd(-3,3),gz-6);
    groundG.stroke();}
   if(i<1300){const rc2=ZR.suburb[(Math.random()*2)|0];
    const sx=X(rc2.x)+rnd(0,rc2.w*K),sz=X(rc2.z)+rnd(0,rc2.h*K);
    groundG.strokeStyle=Math.random()<.5?'rgba(50,88,36,.45)':'rgba(126,160,78,.42)';
    for(let b=0;b<3;b++){groundG.beginPath();
     groundG.moveTo(sx+b*2-2,sz);groundG.quadraticCurveTo(sx+b*2-2+rnd(-2,2),sz-3,sx+b*2-2+rnd(-3,3),sz-6);
     groundG.stroke();}}}
  groundG.globalAlpha=1;
  const patA=groundG.createPattern(im[1],'repeat');
  patA.setTransform(new DOMMatrix().scale(.14));groundG.globalAlpha=.55;groundG.fillStyle=patA;
  for(const rd of ROADS)groundG.fillRect(X(rd.x),X(rd.z),rd.w*K,rd.h*K);
  const patC=groundG.createPattern(im[2],'repeat');
  patC.setTransform(new DOMMatrix().scale(.12));groundG.globalAlpha=.42;groundG.fillStyle=patC;
  groundG.fillRect(X(0),X(0),3200*K,1000*K);
  groundG.globalAlpha=1;
  // 公园小径:出生点 -> 池塘
  groundG.strokeStyle='rgba(205,190,150,.8)';groundG.lineWidth=30*K;groundG.lineCap='round';
  groundG.beginPath();groundG.moveTo(X(760),X(2620));
  groundG.quadraticCurveTo(X(690),X(2570),X(615),X(2548));groundG.stroke();
  groundG.fillStyle='#c9bd90';groundG.beginPath();
  groundG.ellipse(X(POND.x),X(POND.z),(POND.r+16)*K,(POND.r+16)*.85*K,0,0,7);groundG.fill();
  groundG.fillStyle='#3d7ea8';groundG.beginPath();
  groundG.ellipse(X(POND.x),X(POND.z),POND.r*K,POND.r*.85*K,0,0,7);groundG.fill();
  groundG.fillStyle='#4f93bd';groundG.beginPath();
  groundG.ellipse(X(POND.x-14),X(POND.z-10),POND.r*.72*K,POND.r*.6*K,0,0,7);groundG.fill();
  groundTex.needsUpdate=true;
  ground.material.normalMap=photoTex(PHOTO.grass_nor,42,42,false);
  ground.material.needsUpdate=true;}}

/* ---------- 共享 PBR 材质 ---------- */
const std=(c,r,m,extra)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:r==null?.9:r,metalness:m||0,envMapIntensity:.42},extra||{}));
/* Poly Haven 照片贴图加载(CC0) */
function photoTex(uri,rx,ry,srgb){const t=new THREE.TextureLoader().load(uri);
 t.wrapS=t.wrapT=THREE.RepeatWrapping;if(rx)t.repeat.set(rx,ry||rx);
 if(srgb)t.encoding=THREE.sRGBEncoding;t.anisotropy=MAXANI;return t;}
function chunkPhoto(photoURI,draw){const c=document.createElement('canvas');c.width=c.height=128;
 const g=c.getContext('2d');g.fillStyle='#b8bcbe';g.fillRect(0,0,128,128);
 const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;
 const img=new Image();img.onload=()=>{g.drawImage(img,0,0,128,128);
  if(draw)draw(g);noiseOn(g,128,128,200,.12);tex.needsUpdate=true;};
 img.src=photoURI;return tex;}
const MAT={trunk:std(0x8a6a4a,.95,0,{map:CHUNKTEX.bark,envMapIntensity:.3}),
 leaf:std(0x7da05e,1,0,{map:CHUNKTEX.leaf,envMapIntensity:.3}),
 leaf2:std(0x6f9a55,1,0,{map:CHUNKTEX.leaf,envMapIntensity:.3}),
 pine:std(0x4a7040,1,0,{map:CHUNKTEX.leaf,envMapIntensity:.3}),
 leafA:std(0xc98a4a,1,0,{map:CHUNKTEX.leaf,envMapIntensity:.3}),
 leafB:std(0xd798b0,1,0,{map:CHUNKTEX.leaf,envMapIntensity:.3}),
 rock:std(0xaeb2b6,.95,0,{map:CHUNKTEX.stone,envMapIntensity:.35}),
 dark:std(0x2b3138,.7,.2),
 wood:std(0x8a5f36,.85),steel:std(0x9aa5ad,.5,.6),tank:std(0xb9c9d4,.55,.35),
 white:std(0xe3e6e8,.7),glass:std(0x18242e,.12,.6,{envMapIntensity:1.15}),concrete:std(0xb4b7b9,.95),
 gold:std(0xd9a92c,.4,.8,{emissive:0x3a2c00}),
 puff:new THREE.SpriteMaterial({map:null,transparent:true,depthWrite:false})};
const CARP=[0xb23a2e,0x2f5f8f,0xc9a227,0x5f4b8b,0x2f7f6f,0xb06030,0xd8dbdd].map(c=>std(c,.22,.65,{envMapIntensity:1.05}));
const CARGLASS=std(0x101c26,.12,.9,{envMapIntensity:.95});
const TIRE=std(0x181a1c,.9,0);
const HUB=std(0xc8ccd2,.35,.85,{envMapIntensity:.9});
const FLOWC=[0xe0568f,0xe8b32c,0x9a6fd6,0xd97b52].map(c=>std(c,.8,0));
const DEBC={flower:0xd06a9a,grass:0x4a7a3c,rock:0x8d9196,trash:0x4a5b45,bench:0x8a5f36,lamp:0xd8d2b8,
 bike:0x37474f,boulder:0x8d9196,bush:0x3d6e34,tree_s:0x3d7433,tree_b:0x3d7433,car:0x8a8f94,
 bus:0xc9c9c9,house_s:0xb8a888,house_b:0x9a8a74,truck:0xc9ccce,water:0xa9bfc9,
 bld_m:0xa8abae,bld_l:0x9a9da0,sky:0x7f98ad,landmark:0xc9b06a};

/* ---------- 程序生成建筑贴图 ---------- */
function noiseOn(g,w,h,n,a){for(let i=0;i<n;i++){g.fillStyle='rgba(0,0,0,'+(Math.random()*a)+')';
 g.fillRect(rnd(0,w),rnd(0,h),rnd(1,3),rnd(1,3));}}
function officeTexPair(base,glass,litP){const c=document.createElement('canvas');c.width=c.height=512;
 const hc=document.createElement('canvas');hc.width=hc.height=512;
 const ec=document.createElement('canvas');ec.width=ec.height=512;
 const g=c.getContext('2d'),q=hc.getContext('2d'),e=ec.getContext('2d');
 g.fillStyle=base;g.fillRect(0,0,512,512);
 q.fillStyle='#8c8c8c';q.fillRect(0,0,512,512);
 e.fillStyle='#000';e.fillRect(0,0,512,512);
 noiseOn(g,512,512,900,.12);
 q.fillStyle='#ffffff';q.fillRect(0,0,512,22);
 g.fillStyle='rgba(0,0,0,.18)';g.fillRect(0,0,512,20);
 for(let fy=0;fy<9;fy++)for(let fx=0;fx<7;fx++){
  const x=20+fx*68,y=34+fy*52;
  g.fillStyle='rgba(0,0,0,.13)';g.fillRect(x-9,y-4,5,46);
  g.fillStyle='rgba(255,255,255,.10)';g.fillRect(x+53,y-4,5,46);
  q.fillStyle='#b8b8b8';q.fillRect(x-3,y-3,56,40);
  q.fillStyle='#565656';q.fillRect(x,y,50,34);
  if(fy%3===0){g.fillStyle='rgba(0,0,0,.12)';g.fillRect(x-9,y+40,64,4);}
  g.fillStyle='#23282d';g.fillRect(x-3,y-3,56,40);
  g.fillStyle='#3d454d';g.fillRect(x-1,y-1,52,36);
  const lit=Math.random()<litP;
  const gr=g.createLinearGradient(0,y,0,y+34);
  if(lit){gr.addColorStop(0,'#ffe2a8');gr.addColorStop(1,'#c9955c');}
  else{gr.addColorStop(0,glass);gr.addColorStop(.6,'#3a4a58');gr.addColorStop(1,'#243039');}
  g.fillStyle=gr;g.fillRect(x,y,50,34);
  if(lit){e.fillStyle='#a86e2c';e.fillRect(x,y,50,34);}
  g.fillStyle='rgba(30,36,42,.9)';g.fillRect(x+23,y,3,34);g.fillRect(x,y+15,50,3);
  g.fillStyle='rgba(255,255,255,.16)';g.beginPath();
  g.moveTo(x,y+34);g.lineTo(x+18,y);g.lineTo(x+30,y);g.lineTo(x+12,y+34);g.closePath();g.fill();
  if(!lit&&Math.random()<.4){g.fillStyle='rgba(205,200,185,.75)';
   g.fillRect(x+2,y+2,46,12);g.fillStyle='rgba(160,155,140,.5)';g.fillRect(x+2,y+14,46,3);}}
 const ag=g.createLinearGradient(0,340,0,512);
 ag.addColorStop(0,'rgba(0,0,0,0)');ag.addColorStop(1,'rgba(0,0,0,.34)');
 g.fillStyle=ag;g.fillRect(0,340,512,172);
 noiseOn(g,512,512,500,.08);
 const map=new THREE.CanvasTexture(c);map.encoding=THREE.sRGBEncoding;
 const em=new THREE.CanvasTexture(ec);
 return {map,normalMap:normalFromCanvas(hc,2.4),emissiveMap:em};}
function glassTex(){const c=document.createElement('canvas');c.width=c.height=512;
 const g=c.getContext('2d');
 for(let fy=0;fy<16;fy++){const y=fy*32;
  const gr=g.createLinearGradient(0,y,0,y+32);
  gr.addColorStop(0,'#9fc3dd');gr.addColorStop(.5,'#5d87a6');gr.addColorStop(1,'#3d5a72');
  g.fillStyle=gr;g.fillRect(0,y,512,32);
  g.fillStyle='rgba(255,255,255,'+rnd(.05,.22)+')';
  g.beginPath();g.moveTo(0,y+32);g.lineTo(rnd(100,400),y);g.lineTo(rnd(300,512),y);g.lineTo(0,y+32);g.fill();
  g.fillStyle='#232a31';g.fillRect(0,y+30,512,3);}
 noiseOn(g,512,512,500,.08);
 const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;}
function wallTex(base){const c=document.createElement('canvas');c.width=c.height=256;
 const g=c.getContext('2d');g.fillStyle=base;g.fillRect(0,0,256,256);
 g.strokeStyle='rgba(0,0,0,.10)';g.lineWidth=2;
 for(let y=16;y<256;y+=22){g.beginPath();g.moveTo(0,y);g.lineTo(256,y);g.stroke();}
 for(const wx of [46,166]){g.fillStyle='#2c3238';g.fillRect(wx,80,44,54);
  g.fillStyle='#31404d';g.fillRect(wx+3,83,38,48);
  g.fillStyle='rgba(255,255,255,.22)';g.beginPath();
  g.moveTo(wx+3,131);g.lineTo(wx+26,83);g.lineTo(wx+36,83);g.lineTo(wx+13,131);g.fill();
  g.fillStyle='#7a7266';g.fillRect(wx-4,132,52,6);
  g.fillStyle='rgba(0,0,0,.35)';g.fillRect(wx-6,138,56,5);
  g.fillStyle='rgba(255,255,255,.28)';g.fillRect(wx-5,74,50,3);}
 noiseOn(g,256,256,500,.10);
 const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;}
const TEX={office:null,office2:null,glass:glassTex(),
 glassN:heightToNormal(64,64,(x,y)=>{const yy=y%32;return yy<3?.15:.62;},1.6),
 wall:wallTex('#e2d8bf'),wall2:wallTex('#d8cdb6'),wall3:wallTex('#cfd4ce'),
 wallN:heightToNormal(128,128,(x,y)=>{const yy=((y-16)%22+22)%22;return yy<2.6?.12:.62;},1.9),
 wallN2:heightToNormal(128,128,(x,y)=>{const yy=((y-16)%22+22)%22;return yy<2.6?.12:.62;},1.9),
 wallN3:heightToNormal(128,128,(x,y)=>{const yy=((y-16)%22+22)%22;return yy<2.6?.12:.62;},1.9),
 cloudPuff:null,dustPuff:null};
TEX.office=officeTexPair('#b6b3a8','#31404d',.10);
TEX.office2=officeTexPair('#9fa6ad','#26404f',.14);
TEX.cloudPuff=puffTex('255,255,255','255,255,255');
TEX.dustPuff=puffTex('150,132,100','150,132,100');
function officePhotoTex(photoURI,glass,litP){const c=document.createElement('canvas');
 c.width=c.height=512;const g=c.getContext('2d');
 g.fillStyle='#9aa0a4';g.fillRect(0,0,512,512);
 const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;
 const img=new Image();img.onload=()=>{g.drawImage(img,0,0,512,512);
  g.fillStyle='rgba(0,0,0,.18)';g.fillRect(0,0,512,20);
  for(let fy=0;fy<9;fy++)for(let fx=0;fx<7;fx++){
   const x=20+fx*68,y=34+fy*52;
   g.fillStyle='rgba(0,0,0,.14)';g.fillRect(x-9,y-4,5,46);
   g.fillStyle='rgba(255,255,255,.10)';g.fillRect(x+53,y-4,5,46);
   g.fillStyle='#2c3238';g.fillRect(x-3,y-3,56,40);
   g.fillStyle=Math.random()<litP?'#ffd98e':glass;
   g.fillRect(x,y,50,34);
   g.fillStyle='rgba(255,255,255,.20)';g.beginPath();
   g.moveTo(x,y+34);g.lineTo(x+20,y);g.lineTo(x+32,y);g.lineTo(x+12,y+34);g.closePath();g.fill();
   g.fillStyle='rgba(0,0,0,.25)';g.fillRect(x,y+15,50,2);}
  const ag=g.createLinearGradient(0,340,0,512);
  ag.addColorStop(0,'rgba(0,0,0,0)');ag.addColorStop(1,'rgba(0,0,0,.34)');
  g.fillStyle=ag;g.fillRect(0,340,512,172);
  noiseOn(g,512,512,500,.10);tex.needsUpdate=true;};
 img.src=photoURI;
 return new THREE.MeshStandardMaterial({map:tex,normalMap:TEX.office.normalMap,
  emissiveMap:TEX.office.emissiveMap,emissive:0xffffff,emissiveIntensity:.4,
  roughness:.82,metalness:.08,envMapIntensity:.5});}
const BLD=[
 officePhotoTex(PHOTO.concrete_diff,'#31404d',.10),
 officePhotoTex(PHOTO.plasterg,'#26404f',.12),
 officePhotoTex(PHOTO.plasterd,'#2e3d4a',.14),
 new THREE.MeshStandardMaterial({map:TEX.office2.map,normalMap:TEX.office2.normalMap,
  emissiveMap:TEX.office2.emissiveMap,emissive:0xffffff,emissiveIntensity:.55,
  roughness:.8,metalness:.08,envMapIntensity:.5}),
 new THREE.MeshStandardMaterial({map:TEX.glass,normalMap:TEX.glassN,roughness:.3,metalness:.45,envMapIntensity:.9})];
const WALLM=[
 new THREE.MeshStandardMaterial({map:photoTex(PHOTO.brick_diff,3.4,2.1,true),
  normalMap:photoTex(PHOTO.brick_nor,3.4,2.1),roughness:.92,metalness:0,envMapIntensity:.4}),
 std(0xffffff,.92,0,{map:TEX.wall2,normalMap:TEX.wallN2,envMapIntensity:.4}),
 new THREE.MeshStandardMaterial({map:photoTex(PHOTO.stuccow,2.6,1.8,true),
  normalMap:photoTex(PHOTO.brick_nor,2.6,1.8),roughness:.9,metalness:0,envMapIntensity:.4})];
const ROOFP=new THREE.MeshStandardMaterial({map:photoTex(PHOTO.roof_diff,.30,.30,true),
 normalMap:photoTex(PHOTO.roof_nor,.085,.085),roughness:.85,metalness:0,envMapIntensity:.4});
const ROOFG=new THREE.MeshStandardMaterial({map:photoTex(PHOTO.roofg,.30,.30,true),roughness:.85,envMapIntensity:.4});
const ROOFR=new THREE.MeshStandardMaterial({map:photoTex(PHOTO.roofr,.30,.30,true),roughness:.8,envMapIntensity:.4});
const ROOFS=[ROOFP,ROOFG,ROOFR,ROOFP,ROOFR];
const FACADEM=new THREE.MeshStandardMaterial({map:photoTex(PHOTO.facade,2.2,2.2,true),roughness:.85,metalness:.02,envMapIntensity:.45});

/* ---------- 软粒子贴图(云/尘) ---------- */
function puffTex(inner,outer){const c=document.createElement('canvas');c.width=c.height=128;
 const g=c.getContext('2d');
 for(let i=0;i<7;i++){const x=64+rnd(-26,26),y=64+rnd(-22,22),r=rnd(24,42);
  const gr=g.createRadialGradient(x,y,0,x,y,r);
  gr.addColorStop(0,'rgba('+inner+','+rnd(.5,.8)+')');gr.addColorStop(1,'rgba('+outer+',0)');
  g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();}
 const t=new THREE.CanvasTexture(c);return t;}
TEX.cloudPuff=puffTex('255,255,255','255,255,255');
TEX.dustPuff=puffTex('150,132,100','150,132,100');

/* ---------- 物件构建 ---------- */
function P(geo,mat,x,y,z,cast){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);
 if(cast!==false)m.castShadow=true;return m;}
function blobGeo(r,detail){const g=new THREE.IcosahedronGeometry(r,detail||1);
 const p=g.attributes.position;
 for(let i=0;i<p.count;i++){const v=V3(p.getX(i),p.getY(i),p.getZ(i));
  const s=1+(Math.sin(v.x*1.7)+Math.sin(v.y*2.3)+Math.sin(v.z*1.9))*.09;
  v.multiplyScalar(s);p.setXYZ(i,v.x,v.y,v.z);}
 g.computeVertexNormals();return g;}
function gableRoof(w,h,d,mat){const s=new THREE.Shape();
 s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(0,h);s.closePath();
 const g=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false});
 g.translate(0,0,-d/2);
 const grp=new THREE.Group();grp.add(P(g,mat,0,0,0));
 const ridge=P(new THREE.BoxGeometry(5,4,d+3),MAT.concrete,0,h-1.5,0);
 grp.add(ridge);return grp;}
function wheelZ(r,w){const g=new THREE.Group();
 const m=P(new THREE.CylinderGeometry(r,r,w,12),TIRE,0,0,0,false);
 m.rotation.x=Math.PI/2;g.add(m);
 const hub=P(new THREE.CylinderGeometry(r*.55,r*.55,w+2.2,10),HUB,0,0,0,false);
 hub.rotation.x=Math.PI/2;g.add(hub);
 return g;}
const G={
 flower(){const g=new THREE.Group();
  g.add(P(new THREE.CylinderGeometry(.8,.8,7,5),MAT.leaf2,0,3.5,0,false));
  g.add(P(new THREE.IcosahedronGeometry(4.4,0),FLOWC[(Math.random()*4)|0],0,8.2,0,false));return g;},
 grass(){const m=P(new THREE.ConeGeometry(2.6,9,5),GRASSM_(),0,4.5,0,false);
  m.rotation.z=rnd(-.3,.3);const g=new THREE.Group();g.add(m);return g;},
 rock(){const m=P(blobGeo(8,0),MAT.rock,0,4,0,false);
  m.scale.set(rnd(.85,1.3),rnd(.5,.75),rnd(.85,1.3));m.rotation.y=rnd(0,6);
  const g=new THREE.Group();g.add(m);return g;},
 trash(){const g=new THREE.Group();
  g.add(P(new THREE.CylinderGeometry(7,6.2,14,12),std(0x3f5540,.6,.3),0,7,0));
  g.add(P(new THREE.CylinderGeometry(7.6,7.6,2.6,12),std(0x2d3d30,.6,.3),0,15,0));return g;},
 bench(){const g=new THREE.Group();
  for(let i=-1;i<=1;i++)g.add(P(new THREE.BoxGeometry(30,2.6,3.6),MAT.wood,0,10,i*4.2));
  g.add(P(new THREE.BoxGeometry(4,10,12),MAT.dark,-12,5,0));
  g.add(P(new THREE.BoxGeometry(4,10,12),MAT.dark,12,5,0));return g;},
 lamp(){const g=new THREE.Group();
  g.add(P(new THREE.CylinderGeometry(1.4,2,38,8),MAT.dark,0,19,0));
  g.add(P(new THREE.BoxGeometry(12,2.4,2.4),MAT.dark,5,38,0,false));
  g.add(P(new THREE.BoxGeometry(6,2,3.6),std(0xfff2c4,.5,0,{emissive:0xbba860,emissiveIntensity:.9}),10,37,0,false));
  return g;},
 bike(){const g=new THREE.Group();const w=new THREE.TorusGeometry(6,1.3,6,14);
  const w1=P(w,MAT.dark,-8,6,0,false),w2=P(w,MAT.dark,8,6,0,false);
  w1.rotation.y=Math.PI/2;w2.rotation.y=Math.PI/2;g.add(w1);g.add(w2);
  g.add(P(new THREE.BoxGeometry(17,2,2),std(0x555c62,.5,.6),0,7.5,0,false));return g;},
 boulder(){const m=P(blobGeo(16,1),MAT.rock,0,9,0);
  m.scale.set(rnd(.9,1.35),rnd(.65,.95),rnd(.9,1.35));m.rotation.y=rnd(0,6);
  const g=new THREE.Group();g.add(m);return g;},
 bush(){const m=P(blobGeo(15,1),Math.random()<.5?MAT.leaf:MAT.leaf2,0,9,0);
  m.scale.set(1.2,.72,1.2);const g=new THREE.Group();g.add(m);return g;},
 tree_s(){const g=new THREE.Group();
  g.add(P(new THREE.CylinderGeometry(2.6,4.5,24,7),MAT.trunk,0,12,0));
  const roll=Math.random();
  const cm=roll<.12?MAT.leafA:(roll<.24?MAT.leafB:MAT.leaf);
  if(roll<.38){ // 圆锥(松树):三层锥
   g.add(P(new THREE.ConeGeometry(15,17,8),cm,0,29,0));
   g.add(P(new THREE.ConeGeometry(11.5,15,8),MAT.leaf2,0,38,0));
   g.add(P(new THREE.ConeGeometry(8,12,8),cm,0,46,0));}
  else if(roll<.62){ // 卵形(原)
   g.add(P(blobGeo(19,1),cm,0,37,0));}
  else{ // 平顶(伞)
   const c=P(new THREE.CylinderGeometry(16,13,9,9),cm,0,35,0);
   c.scale.y=.8;g.add(c);
   g.add(P(blobGeo(8,1),MAT.leaf2,9,29,7));}
  g.scale.setScalar(rnd(.85,1.2));return g;},
 tree_b(){const g=new THREE.Group();
  g.add(P(new THREE.CylinderGeometry(5,8.5,32,7),MAT.trunk,0,16,0));
  const roll=Math.random();
  const cm=roll<.12?MAT.leafA:(roll<.24?MAT.leafB:MAT.leaf);
  if(roll<.3){ // 圆锥大树
   g.add(P(new THREE.ConeGeometry(24,30,9),cm,0,42,0));
   g.add(P(new THREE.ConeGeometry(17,24,9),MAT.leaf2,0,58,0));
   g.add(P(new THREE.ConeGeometry(11,18,9),cm,0,71,0));}
  else if(roll<.6){ // 卵形(原)
   g.add(P(blobGeo(27,1),cm,0,54,0));
   g.add(P(blobGeo(17,1),MAT.leaf2,17,42,9));}
  else{ // 平顶伞树
   const c=P(new THREE.CylinderGeometry(26,20,12,10),cm,0,50,0);
   c.scale.y=.75;g.add(c);
   g.add(P(blobGeo(13,1),MAT.leaf2,14,40,10));}
  g.scale.setScalar(rnd(.9,1.25));return g;},
 car(){const c=CARP[(Math.random()*CARP.length)|0];const g=new THREE.Group();
  g.add(P(new THREE.BoxGeometry(44,11,20),c,0,10,0));
  g.add(P(new THREE.BoxGeometry(23,9,17.4),CARGLASS,-3,18.5,0));
  g.add(P(new THREE.BoxGeometry(44,3,20.8),c,0,15.5,0));
  const w1=wheelZ(5,22),w2=wheelZ(5,22);w1.position.set(13,5,0);w2.position.set(-13,5,0);
  g.add(w1);g.add(w2);
  g.add(P(new THREE.BoxGeometry(2,2.4,5),std(0xfff6d8,.4,0,{emissive:0x998a55}),21.4,10,5,false));
  g.add(P(new THREE.BoxGeometry(2,2.4,5),std(0xfff6d8,.4,0,{emissive:0x998a55}),21.4,10,-5,false));
  
  g.add(P(new THREE.BoxGeometry(1.6,2.2,4.4),std(0xff2222,.3,0,{emissive:0xcc1111,emissiveIntensity:1.6}),-21.6,11,5.6,false));
  g.add(P(new THREE.BoxGeometry(1.6,2.2,4.4),std(0xff2222,.3,0,{emissive:0xcc1111,emissiveIntensity:1.6}),-21.6,11,-5.6,false));
  return g;},
 bus(){const g=new THREE.Group();
  g.add(P(new THREE.BoxGeometry(76,26,24),std(0xc9ccd0,.5,.3),0,15,0));
  g.add(P(new THREE.BoxGeometry(70,9,24.8),CARGLASS,-2,22,0,false));
  g.add(P(new THREE.BoxGeometry(76.2,6,24.4),std(0x2f6da8,.5,.3),0,8,0));
  const w1=wheelZ(6,26),w2=wheelZ(6,26);w1.position.set(24,6,0);w2.position.set(-24,6,0);
  g.add(w1);g.add(w2);return g;},
 truck(){const c=CARP[(Math.random()*CARP.length)|0];const g=new THREE.Group();
  g.add(P(new THREE.BoxGeometry(20,22,24),c,28,13,0));
  g.add(P(new THREE.BoxGeometry(19,8,22.4),CARGLASS,28,21,0,false));
  g.add(P(new THREE.BoxGeometry(46,28,26),std(0xc4c8cb,.65,.25),-4,16,0));
  const w1=wheelZ(6,26),w2=wheelZ(6,26);w1.position.set(26,6,0);w2.position.set(-14,6,0);
  g.add(w1);g.add(w2);return g;},
 house_s(){const w=Math.random()<.6?WALLM[0]:WALLM[1];const r=ROOFS[(Math.random()*ROOFS.length)|0];
  const g=new THREE.Group();
  g.add(P(new THREE.BoxGeometry(60,32,52),w,0,16,0));
  const roof=gableRoof(68,22,58,r);roof.position.set(0,32,0);g.add(roof);
  g.add(P(new THREE.BoxGeometry(26,8,26),MAT.dark,-16,36,0,false));
  g.add(P(new THREE.BoxGeometry(12,20,2.6),std(0x54382a,.85),14,10,26.2,false));
  return g;},
 house_b(){const w=Math.random()<.6?WALLM[2]:WALLM[0];const r=ROOFS[(Math.random()*ROOFS.length)|0];
  const g=new THREE.Group();
  g.add(P(new THREE.BoxGeometry(84,38,70),w,0,19,0));
  if(Math.random()<.45){ // 两层小楼
   g.add(P(new THREE.BoxGeometry(56,24,46),w,-8,50,-6));
   const r2=gableRoof(62,15,52,r);r2.position.set(-8,62,-6);g.add(r2);
   g.add(P(new THREE.BoxGeometry(30,22,30),w,-46,11,12));
  }else{
   const roof=gableRoof(92,26,76,r);roof.position.set(0,38,0);g.add(roof);
   g.add(P(new THREE.BoxGeometry(30,22,30),w,-46,11,12));
   g.add(P(new THREE.BoxGeometry(10,6,10),MAT.rock,20,60,-14,false));}
  return g;},
 water(){const g=new THREE.Group();
  for(let i=0;i<4;i++){const a=i*1.5708+.785;
   const leg=P(new THREE.CylinderGeometry(2,2.6,30,6),MAT.steel,Math.cos(a)*14,15,Math.sin(a)*14);
   leg.rotation.z=Math.cos(a)*.12;leg.rotation.x=-Math.sin(a)*.12;g.add(leg);}
  g.add(P(new THREE.CylinderGeometry(19,21,26,14),MAT.tank,0,43,0));
  g.add(P(new THREE.ConeGeometry(21,9,14),MAT.steel,0,60,0));
  g.add(P(new THREE.CylinderGeometry(1.6,1.6,16,6),MAT.steel,0,10,0,false));return g;},
 bld_m(){const m=BLD[(Math.random()*3)|0];const g=new THREE.Group();
  const h=rnd(60,84),shape=Math.random();
  g.add(P(new THREE.BoxGeometry(94,8,94),Math.random()<.6?FACADEM:MAT.concrete,0,4,0));
  if(shape<.3){ // 阶梯塔楼
   g.add(P(new THREE.BoxGeometry(88,h,88),m,0,h/2+8,0));
   g.add(P(new THREE.BoxGeometry(58,h*.45,58),m,0,h+h*.22+8,0));
   g.add(P(new THREE.BoxGeometry(94,5,94),MAT.concrete,0,h+10.5,0));
   g.add(P(new THREE.CylinderGeometry(.8,.8,16,5),MAT.dark,0,h+h*.45+26,0,false));
  }else if(shape<.5){ // L 形翼楼
   g.add(P(new THREE.BoxGeometry(88,h,50),m,0,h/2+8,-19));
   g.add(P(new THREE.BoxGeometry(42,h,38),m,-23,h/2+8,25));
   g.add(P(new THREE.BoxGeometry(94,5,94),MAT.concrete,0,h+10.5,0));
  }else{
   g.add(P(new THREE.BoxGeometry(88,h,88),m,0,h/2+8,0));
   g.add(P(new THREE.BoxGeometry(94,5,94),MAT.concrete,0,h+10.5,0));
   g.add(P(new THREE.BoxGeometry(22,9,17),MAT.steel,18,h+16,14));
   g.add(P(new THREE.BoxGeometry(15,7,13),MAT.steel,-20,h+14.5,-16));
   g.add(P(new THREE.BoxGeometry(3,14,3),MAT.dark,-8,h+18,8,false));}
  return g;},
 bld_l(){const m=BLD[(Math.random()*BLD.length)|0];const g=new THREE.Group();
  const h=rnd(105,150);
  g.add(P(new THREE.BoxGeometry(122,9,106),Math.random()<.6?FACADEM:MAT.concrete,0,4.5,0));
  g.add(P(new THREE.BoxGeometry(116,h,100),m,0,h/2+9,0));
  g.add(P(new THREE.BoxGeometry(122,6,106),MAT.concrete,0,h+12,0));
  g.add(P(new THREE.BoxGeometry(28,11,21),MAT.steel,20,h+20,12));
  g.add(P(new THREE.CylinderGeometry(.8,.8,22,5),MAT.dark,-20,h+26,-12,false));
  g.add(P(new THREE.BoxGeometry(3,16,3),MAT.dark,26,h+23,-20,false));return g;},
 sky(){const g=new THREE.Group();const h=rnd(190,240);
  g.add(P(new THREE.BoxGeometry(136,h,136),BLD[4],0,h/2,0));
  g.add(P(new THREE.BoxGeometry(142,10,142),MAT.dark,0,h+5,0));
  g.add(P(new THREE.CylinderGeometry(24,24,5,14),MAT.white,0,h+12.5,0,false));
  g.add(P(new THREE.CylinderGeometry(1.2,2.4,22,5),MAT.dark,0,h+26,0,false));
  return g;},
 landmark(){const g=new THREE.Group();
  g.add(P(new THREE.CylinderGeometry(56,68,18,16),MAT.concrete,0,9,0));
  g.add(P(new THREE.CylinderGeometry(12,26,170,14),MAT.concrete,0,98,0));
  const pod=P(new THREE.SphereGeometry(30,16,12),std(0x39505e,.25,.7),0,192,0);
  pod.scale.y=.82;g.add(pod);
  const ring=P(new THREE.TorusGeometry(31,2.4,8,24),MAT.gold,0,192,0,false);
  ring.rotation.x=Math.PI/2;g.add(ring);
  const deck=P(new THREE.CylinderGeometry(24,24,6,14),std(0x39505e,.3,.6),0,225,0);
  deck.scale.set(1,1,.72);g.add(deck);
  g.add(P(new THREE.CylinderGeometry(1.4,4.5,64,8),MAT.steel,0,256,0));
  const beacon=P(new THREE.SphereGeometry(2.6,8,6),
   std(0xff2222,.5,0,{emissive:0xff1111,emissiveIntensity:2}),0,290,0,false);
  g.add(beacon);g.userData.beacon=beacon;
  return g;},
 ped(){const g=new THREE.Group();
  const shirt=std([0xe74c3c,0x3498db,0x2ecc71,0xf1c40f,0x9b59b6,0xe67e22][(Math.random()*6)|0],.8,0,{envMapIntensity:.35});
  g.add(P(new THREE.BoxGeometry(5,8,4),shirt,0,10,0,false));
  g.add(P(new THREE.BoxGeometry(2,6,3.4),MAT.dark,-1.6,3,0,false));
  g.add(P(new THREE.BoxGeometry(2,6,3.4),MAT.dark,1.6,3,0,false));
  const aL=P(new THREE.BoxGeometry(1.4,6,1.4),shirt,-3.2,10,0,false);
  const aR=P(new THREE.BoxGeometry(1.4,6,1.4),shirt,3.2,10,0,false);
  aL.geometry.translate(0,-2.6,0);aR.geometry.translate(0,-2.6,0);
  g.add(aL);g.add(aR);g.userData.armL=aL;g.userData.armR=aR;
  g.add(P(new THREE.SphereGeometry(2.7,8,6),std(0xe8c39e,.8),0,16.5,0,false));
  g.add(P(new THREE.BoxGeometry(4.6,1.4,1.2),std(0x22262a,.6),0,5.5,0,false));
  return g;},
 palm(){const g=new THREE.Group();
  const lean=rnd(-.18,.18);
  for(let i=0;i<3;i++){const seg=P(new THREE.CylinderGeometry(1.6-i*.3,2-i*.3,13,7),
   MAT.trunk,Math.sin(lean)*i*8,6+i*12,0);
   seg.rotation.z=-lean;g.add(seg);}
  const topX=Math.sin(lean)*26,topY=42;
  for(let i=0;i<7;i++){const a=i/7*6.283;
   const leaf=P(new THREE.ConeGeometry(3.2,17,4),MAT.leaf2,topX+Math.cos(a)*7,topY,Math.sin(a)*7);
   leaf.rotation.set(Math.PI*.32*Math.sin(a),-a,Math.PI*.32*Math.cos(a));
   g.add(leaf);}
  g.add(P(new THREE.SphereGeometry(2.6,7,5),new THREE.MeshStandardMaterial({color:0x8a6a3a}),topX,topY-3,0,false));
  return g;},
 skier(){const g=new THREE.Group();
  const suit=std([0xe05656,0x3f7fc4,0x38a868,0xf1c40f][(Math.random()*4)|0],.75,0,{envMapIntensity:.4});
  g.add(P(new THREE.BoxGeometry(4.4,7,3.8),suit,0,12,0,false));
  g.add(P(new THREE.SphereGeometry(2.5,8,6),std(0xe8c39e,.8),0,18,0,false));
  g.add(P(new THREE.BoxGeometry(4.8,2,3.6),new THREE.MeshStandardMaterial({color:0x2c3e50,roughness:.5}),0,19.8,0,false));
  g.add(P(new THREE.BoxGeometry(1.6,9,.8),suit,-2.6,5,0,false));
  g.add(P(new THREE.BoxGeometry(1.6,9,.8),suit,2.6,5,0,false));
  const ski=new THREE.MeshStandardMaterial({color:0xf2f5f7,roughness:.3,metalness:.1});
  g.add(P(new THREE.BoxGeometry(1.8,1,16),ski,-2,1.2,2,false));
  g.add(P(new THREE.BoxGeometry(1.8,1,16),ski,2,1.2,2,false));
  return g;},
 snowman(){const g=new THREE.Group();
  const snow=std(0xf2f5f7,.85,0,{envMapIntensity:.5});
  g.add(P(new THREE.SphereGeometry(11,10,8),snow,0,9,0));
  g.add(P(new THREE.SphereGeometry(8,10,8),snow,0,24,0));
  g.add(P(new THREE.SphereGeometry(5.5,9,7),snow,0,34,0));
  g.add(P(new THREE.ConeGeometry(1.2,5,6),std(0xe07820,.7),0,34,5.5));
  g.add(P(new THREE.SphereGeometry(.9,6,4),MAT.dark,-2,36,4.6,false));
  g.add(P(new THREE.SphereGeometry(.9,6,4),MAT.dark,2,36,4.6,false));
  g.add(P(new THREE.CylinderGeometry(.5,.5,10,5),MAT.trunk,-11,20,0,false)).rotation.z=.8;
  g.add(P(new THREE.CylinderGeometry(.5,.5,10,5),MAT.trunk,11,20,0,false)).rotation.z=-.8;
  g.add(P(new THREE.CylinderGeometry(6,6.5,3,10),std(0x30343a,.8),0,42,0,false));
  return g;},
 umbrella(){const g=new THREE.Group();
  g.add(P(new THREE.CylinderGeometry(.5,.5,26,6),MAT.steel,0,13,0));
  const cols=[0xe05656,0xf2f2e8,0x3f7fc4];
  const c=cols[(Math.random()*cols.length)|0];
  const top=P(new THREE.ConeGeometry(11,6,10),std(c,.75),0,28,0);
  g.add(top);
  g.add(P(new THREE.BoxGeometry(16,1,1),MAT.dark,0,24,0,false));
  return g;},
 pedbike(){const g=new THREE.Group();
  const w=new THREE.TorusGeometry(5,1.2,6,12);
  const w1=P(w,MAT.dark,-6,5,0,false),w2=P(w,MAT.dark,6,5,0,false);
  w1.rotation.y=Math.PI/2;w2.rotation.y=Math.PI/2;g.add(w1);g.add(w2);
  const shirt=std([0xe74c3c,0x3498db,0x2ecc71,0xf1c40f][(Math.random()*4)|0],.8,0,{envMapIntensity:.35});
  g.add(P(new THREE.BoxGeometry(4,7,3.6),shirt,0,11,0,false));
  g.add(P(new THREE.SphereGeometry(2.4,8,6),std(0xe8c39e,.8),0,16.5,0,false));
  g.add(P(new THREE.BoxGeometry(3,1.6,1.2),MAT.dark,0,9,2,false));
  return g;},
 pedcrouch(){const g=new THREE.Group();
  const shirt=std([0xe74c3c,0x3498db,0xf1c40f][(Math.random()*3)|0],.8,0,{envMapIntensity:.35});
  g.add(P(new THREE.SphereGeometry(5.5,8,6),shirt,0,7,0,false));
  g.add(P(new THREE.SphereGeometry(2.6,8,6),std(0xe8c39e,.8),0,13,0,false));
  g.add(P(new THREE.TorusGeometry(3.2,1,6,10),std(0xe8c39e,.8),0,14.5,0,false));
  return g;},
};
function GRASSM_(){return Math.random()<.5?MAT.leaf2:MAT.pine;}
const TYPES=[
 {k:'flower',tier:1,r:8,pts:1,zone:'park',n:70},
 {k:'grass',tier:1,r:9,pts:1,zone:'park',n:50},
 {k:'rock',tier:1,r:9,pts:1,zone:'grass',n:30},
 {k:'trash',tier:1,r:10,pts:2,zone:'city',n:25},
 {k:'bench',tier:2,r:13,pts:3,zone:'park',n:18},
 {k:'lamp',tier:2,r:10,pts:3,zone:'city',n:30},
 {k:'bike',tier:2,r:12,pts:4,zone:'suburb',n:14},
 {k:'boulder',tier:2,r:16,pts:5,zone:'grass',n:16},
 {k:'palm',tier:2,r:18,pts:6,zone:'beach',n:8},
 {k:'umbrella',tier:1,r:8,pts:2,zone:'beach',n:10},
 {k:'bush',tier:3,r:16,pts:8,zone:'grass',n:22},
 {k:'tree_s',tier:3,r:20,pts:10,zone:'grass',n:18},
 {k:'car',tier:3,r:20,pts:15,zone:'road',n:20},
 {k:'tree_b',tier:4,r:28,pts:25,zone:'grass',n:14},
 {k:'bus',tier:4,r:30,pts:35,zone:'road',n:8},
 {k:'house_s',tier:4,r:30,pts:45,zone:'suburb',n:14},
 {k:'house_b',tier:5,r:44,pts:70,zone:'suburb',n:9},
 {k:'truck',tier:5,r:24,pts:60,zone:'road',n:8},
 {k:'water',tier:5,r:30,pts:80,zone:'city',n:6},
 {k:'bld_m',tier:6,r:48,pts:130,zone:'downtown',n:10},
 {k:'bld_l',tier:7,r:62,pts:200,zone:'downtown',n:6},
 {k:'sky',tier:7,r:75,pts:320,zone:'downtown',n:4},
 {k:'landmark',tier:8,r:90,pts:600,zone:'downtown',n:1},
];
const TDEF={};TYPES.forEach(t=>TDEF[t.k]=t);
TDEF.ped={k:'ped',tier:1,r:5,pts:1};
TDEF.pedbike={k:'pedbike',tier:1,r:6,pts:3};
TDEF.pedcrouch={k:'pedcrouch',tier:1,r:5,pts:1};
TDEF.snowman={k:'snowman',tier:1,r:11,pts:3};
TDEF.skier={k:'skier',tier:1,r:7,pts:4};

/* ---------- 城市生成 ---------- */
let objects=[];
function inRoad(x,z,pad){for(const rd of ROADS)
 if(x>rd.x-pad&&x<rd.x+rd.w+pad&&z>rd.z-pad&&z<rd.z+rd.h+pad)return true;return false;}
function tooClose(x,z,r){for(const o of objects){const rr=o.r+r+30;
 if((o.x-x)**2+(o.z-z)**2<rr*rr)return true;}return false;}
function addObj(k,x,z,rot){const d=TDEF[k];
 const node=G[k]();node.position.set(x,0,z);if(rot)node.rotation.y=rot;
 scene.add(node);
 objects.push({id:++objIdSeq,k,x,z,rot:rot||0,tier:d.tier,r:d.r,pts:d.pts,seed:rnd(0,6.28),zone:d.zone,
  node,state:'idle',t:0,locked:0});}
function tryPlace(t){const rects=t.zone==='road'?null:ZR[t.zone];
 for(let a=0;a<60;a++){
  let x,z,rot=0;
  if(t.zone==='road'){const rd=ROADS[(Math.random()*ROADS.length)|0];
   if(rd.h>rd.w){x=rd.x+22+Math.random()*(rd.w-44);z=60+Math.random()*(WORLD-120);rot=Math.PI/2;}
   else{x=60+Math.random()*(WORLD-120);z=rd.z+22+Math.random()*(rd.h-44);}}
  else{const rc=rects[(Math.random()*rects.length)|0];
   x=rc.x+t.r+Math.random()*Math.max(1,rc.w-2*t.r);
   z=rc.z+t.r+Math.random()*Math.max(1,rc.h-2*t.r);
   if(inRoad(x,z,t.r+18))continue;
   if(t.zone==='park'||t.zone==='grass'){const dx=x-POND.x,dz=z-POND.z;
    if(dx*dx+dz*dz<(POND.r+t.r+30)**2)continue;}}
  if(tooClose(x,z,t.r))continue;
  addObj(t.k,x,z,rot);return;}}
function spawnAll(){objects=[];objIdSeq=0;addObj('landmark',1600,480);landmarkRef=objects[0];
 for(const t of TYPES)for(let i=0;i<t.n;i++)tryPlace(t);
 // 车流:吸附到车道并分配行驶方向
 for(const o of objects){
  if(o.k!=='car'&&o.k!=='bus'&&o.k!=='truck')continue;
  o.spd=rnd(55,115);
  if(o.rot===0){o.axis='x';o.dir=Math.random()<.5?1:-1;
   const rd=ROADS.find(rd=>rd.h<=rd.w&&o.z>rd.z-40&&o.z<rd.z+rd.h+40)||ROADS[0];
   o.z=rd.z+(o.dir>0?28:80);o.node.rotation.y=o.dir>0?0:Math.PI;}
  else{o.axis='z';o.dir=Math.random()<.5?1:-1;
   const rd=ROADS.find(rd=>rd.h>rd.w&&o.x>rd.x-40&&o.x<rd.x+rd.w+40)||ROADS[2];
   o.x=rd.x+(o.dir>0?28:80);o.node.rotation.y=o.dir>0?-Math.PI/2:Math.PI/2;}
  o.node.position.set(o.x,0,o.z);}
 // 行人:人行道上散步(含骑车/蹲防变体)
 for(let i=0;i<30;i++){
  const rd=ROADS[(Math.random()*ROADS.length)|0],horiz=rd.h<=rd.w;
  const along=rnd(90,3110),lat=(horiz?rd.z+55:rd.x+55)+(Math.random()<.5?-72:72);
  const x=horiz?along:lat,z=horiz?lat:along;
  const roll=Math.random();
  const kind=roll<.2?'pedbike':(roll<.4?'pedcrouch':'ped');
  addObj(kind,x,z,0);
  const p=objects[objects.length-1];
  p.wa=(horiz?0:Math.PI/2)+(Math.random()<.5?0:Math.PI);
  p.spd=kind==='pedbike'?rnd(34,48):rnd(15,28);}}
function disposeNode(n){n.traverse(c=>{if(c.geometry)c.geometry.dispose();});scene.remove(n);}

/* 草丛点缀(实例化 + 逐株颜色) */
function addTufts(){const n=380;
 const im=new THREE.InstancedMesh(new THREE.ConeGeometry(2.2,8,4),
  new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),n);
 const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(),S=V3(1,1,1),C=new THREE.Color();
 let i=0,guard=0;
 while(i<n&&guard++<5000){const rc=ZR.grass[(Math.random()*ZR.grass.length)|0];
  const x=rc.x+rnd(10,rc.w-10),z=rc.z+rnd(10,rc.h-10);
  if(inRoad(x,z,14))continue;
  const dx=x-POND.x,dz=z-POND.z;if(dx*dx+dz*dz<(POND.r+20)**2)continue;
  E.set(rnd(-.25,.25),rnd(0,6),rnd(-.25,.25));Q.setFromEuler(E);
  const s=rnd(.6,1.3);S.set(s,s,s);
  M.compose(V3(x,4*s,z),Q,S);im.setMatrixAt(i,M);
  C.setHSL(.29+rnd(-.03,.03),.42,.28+rnd(-.06,.08));im.setColorAt(i,C);i++;}
 im.count=i;scene.add(im);}

/* 天上的云(软粒子) */
const clouds=[];
function addClouds(){for(let i=0;i<10;i++){const g=new THREE.Group();
 const n=(rnd(4,8))|0;
 for(let j=0;j<n;j++){const sm=new THREE.SpriteMaterial({map:TEX.cloudPuff,
  transparent:true,opacity:rnd(.6,.9),depthWrite:false,color:0xffffff});
  const s=new THREE.Sprite(sm);
  const sc=rnd(90,190);s.scale.set(sc,sc*.55,1);
  s.position.set(rnd(-130,130),rnd(-14,14),rnd(-60,60));g.add(s);}
 g.position.set(rnd(150,3050),rnd(500,760),rnd(150,3050));
 g.userData.v=rnd(4,10);clouds.push(g);scene.add(g);}}

/* ---------- 龙卷风(噪声着色器风柱 + 风暴云 + 尘暴) ---------- */
const T={x:760,z:2640,r:26,tx:760,tz:2640};
const tornado=new THREE.Group();scene.add(tornado);
const lean=new THREE.Group();tornado.add(lean);
const funnelUni={time:{value:0},opK:{value:1},
 cDark:{value:new THREE.Color(.40,.35,.29)},cLight:{value:new THREE.Color(.86,.80,.70)}};
function smokeTex(){const c=document.createElement('canvas');c.width=c.height=256;
 const g=c.getContext('2d');g.fillStyle='#808080';g.fillRect(0,0,256,256);
 for(let i=0;i<60;i++){const x0=rnd(0,256),w=rnd(6,26),amp=rnd(6,20),ph=rnd(0,6.28);
  const col=Math.random()<.5?'255,255,255':'30,30,30';
  g.strokeStyle='rgba('+col+','+rnd(.06,.16).toFixed(2)+')';g.lineWidth=w;
  for(const off of [-256,0,256]){g.beginPath();g.moveTo(x0+off,0);
   for(let y=0;y<=256;y+=16)g.lineTo(x0+off+Math.sin(y*.05+ph)*amp,y);g.stroke();}}
 for(let i=0;i<900;i++){g.fillStyle='rgba(0,0,0,'+rnd(.02,.09).toFixed(2)+')';
  g.fillRect(rnd(0,256),rnd(0,256),2,2);}
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
const smokeT=smokeTex();
function funnelMat(op,mul){return new THREE.ShaderMaterial({
 transparent:true,depthWrite:false,side:THREE.DoubleSide,
 uniforms:{time:funnelUni.time,op:{value:op},mul:{value:mul},tex:{value:smokeT},
  opK:funnelUni.opK,uniCDark:funnelUni.cDark,uniCLight:funnelUni.cLight},
 vertexShader:`varying vec2 vUv;varying vec3 vNrm;varying vec3 vEye;uniform float time;
  void main(){vUv=uv;vec3 p=position;
   float r=length(p.xz);float a=atan(p.z,p.x);
   float n=sin(a*5.0+time*3.6+uv.y*8.0)*.5+sin(a*11.0-time*5.2+uv.y*3.0)*.3+sin(a*19.0+time*7.5)*.2;
   r*=1.0+n*.15*(1.2-uv.y);
   p.x=cos(a)*r;p.z=sin(a)*r;
   vNrm=normalize(normalMatrix*normal);
   vec4 mv=modelViewMatrix*vec4(p,1.0);vEye=mv.xyz;
   gl_Position=projectionMatrix*mv;}`,
 fragmentShader:`varying vec2 vUv;varying vec3 vNrm;varying vec3 vEye;uniform float time;uniform float op;uniform float mul;uniform float opK;uniform sampler2D tex;
  uniform vec3 uniCDark;uniform vec3 uniCLight;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
   return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
  void main(){
   float n=noise(vec2(vUv.x*9.0+time*1.6,vUv.y*16.0-time*4.0));
   n+=.55*noise(vec2(vUv.x*22.0-time*2.6,vUv.y*34.0-time*7.0));
   n/=1.55;
   vec3 dark=uniCDark,light=uniCLight;
   float txv=texture2D(tex,vec2(vUv.x*2.0+time*.06,vUv.y*1.5-time*.08)).r;
   vec3 col=mix(dark,light,clamp(vUv.y*.9+.25+n*.4,0.,1.));
   col*= .8+.4*txv;
   float edge=smoothstep(0.0,.18,vUv.y)*smoothstep(1.0,.72,vUv.y);
   // 正对镜头看过去是前后两层筒壁叠加,中心不压透就会把屏幕中央挡成实心黑楔子
   float rim=1.0-abs(dot(normalize(vNrm),normalize(-vEye)));
   float alpha=op*edge*(.55+.45*n)*mul*opK*mix(.62,1.0,smoothstep(0.0,.75,rim));
   gl_FragColor=vec4(col,alpha);}`});}
const f1=new THREE.Mesh(new THREE.CylinderGeometry(54,8,152,26,14,true),funnelMat(.72,1));
f1.position.y=76;lean.add(f1);
const f2=new THREE.Mesh(new THREE.CylinderGeometry(38,6,118,20,10,true),funnelMat(.5,.8));
f2.position.y=59;lean.add(f2);
/* 风暴云盘 */
const storm=new THREE.Group();
for(let i=0;i<15;i++){const sm=new THREE.SpriteMaterial({map:TEX.cloudPuff,
 color:new THREE.Color().setHSL(.62,.07,rnd(.24,.38)),transparent:true,opacity:rnd(.5,.68),depthWrite:false});
 const sp=new THREE.Sprite(sm);const sc=rnd(90,180);sp.scale.set(sc,sc*.5,1);
 const a=rnd(0,6.28),r=rnd(70,210);
 sp.position.set(Math.cos(a)*r,rnd(165,195),Math.sin(a)*r);storm.add(sp);}
lean.add(storm);
/* 底部尘暴 */
const dustG=new THREE.Group();
for(let i=0;i<12;i++){const sm=new THREE.SpriteMaterial({map:TEX.dustPuff,
 transparent:true,opacity:rnd(.14,.26),depthWrite:false});
 const sp=new THREE.Sprite(sm);const sc=rnd(60,120);sp.scale.set(sc,sc*.5,1);
 const a=rnd(0,6.28),r=rnd(50,110);
 sp.position.set(Math.cos(a)*r,4,Math.sin(a)*r);
 sp.userData={a,r,s:rnd(1,2.4)};dustG.add(sp);}
lean.add(dustG);
/* 上升尘粒 */
const FN=700,fpos=new Float32Array(FN*3),fcol=new Float32Array(FN*3),fp=[];
for(let i=0;i<FN;i++){const t=Math.random();
 fp.push({t,a:rnd(0,6.28),s:rnd(2.2,4.6),j:rnd(.82,1.18),w:rnd(0,6.28)});
 const cB=[.56,.47,.34],cM=[.60,.60,.60],cT=[.80,.82,.85]; // 底部尘土->中段灰->顶部亮灰
 const k=t<.45?t/.45:1-(t-.45)/.55*.7;
 const c0=t<.45?cB:cM,c1=t<.45?cM:cT,jr=rnd(-.06,.06);
 fcol[i*3]  =c0[0]+(c1[0]-c0[0])*k+jr;
 fcol[i*3+1]=c0[1]+(c1[1]-c0[1])*k+jr;
 fcol[i*3+2]=c0[2]+(c1[2]-c0[2])*k+jr;}
const fgeo=new THREE.BufferGeometry();
fgeo.setAttribute('position',new THREE.BufferAttribute(fpos,3));
fgeo.setAttribute('color',new THREE.BufferAttribute(fcol,3));
const fpts=new THREE.Points(fgeo,new THREE.PointsMaterial({map:TEX.dustPuff,vertexColors:true,size:8,
 transparent:true,opacity:.36,depthWrite:false,blending:THREE.AdditiveBlending}));
lean.add(fpts);
/* 碎片池:混凝土/木料/枝叶/石块/车漆金属,各自带贴图的不规则碎块 */
function jaggedBox(w,h,d,amp){const g=new THREE.BoxGeometry(w,h,d,2,2,2);
 const p=g.attributes.position;
 for(let i=0;i<p.count;i++){const vx=p.getX(i),vy=p.getY(i),vz=p.getZ(i);
  const s=1+(vnoise(vx*2.1+7,vy*1.7+vz*2.3)-.5)*amp;
  p.setXYZ(i,vx*s,vy*s,vz*s);}
 g.computeVertexNormals();return g;}
const POOLS=[
 {k:'concrete',n:22,geo:jaggedBox(7,5,9,.5),
  mat:new THREE.MeshStandardMaterial({roughness:.9,metalness:.05,
   map:chunkPhoto(PHOTO.concrete_diff,g=>{g.fillStyle='#3a4750';g.fillRect(30,18,52,42);
    g.strokeStyle='#8b9096';g.lineWidth=3;g.strokeRect(30,18,52,42);})})},
 {k:'wood',n:18,geo:jaggedBox(8,4,6,.45),
  mat:new THREE.MeshStandardMaterial({map:photoTex(PHOTO.planks_diff,1,1,true),roughness:.85,metalness:0})},
 {k:'leaf',n:20,geo:jaggedBox(6,5,6,.6),
  mat:new THREE.MeshStandardMaterial({map:CHUNKTEX.leaf,roughness:1,metalness:0})},
 {k:'stone',n:14,geo:jaggedBox(5,5,5,.55),
  mat:new THREE.MeshStandardMaterial({map:CHUNKTEX.stone,roughness:.95,metalness:0})},
 {k:'metal',n:16,geo:jaggedBox(8,4,5,.4),
  mat:new THREE.MeshStandardMaterial({map:CHUNKTEX.metal,roughness:.4,metalness:.6,envMapIntensity:.8})},
];
const POOLMAP={bld_m:'concrete',bld_l:'concrete',sky:'concrete',landmark:'concrete',
 trash:'concrete',water:'concrete',lamp:'concrete',
 house_s:'wood',house_b:'wood',bench:'wood',
 car:'metal',bus:'metal',truck:'metal',bike:'metal',
 tree_s:'leaf',tree_b:'leaf',bush:'leaf',flower:'leaf',grass:'leaf',
 rock:'stone',boulder:'stone',palm:'leaf',umbrella:'wood',snowman:'stone',skier:'wood',ped:'metal',pedbike:'metal',pedcrouch:'metal'};
const _m4=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_s=V3(1,1,1),_col=new THREE.Color(),_p3=V3(0,0,0);
/* 破坏痕迹:焦土+残留瓦砾 / 树桩 */
const scars=[];
/* 坠落残骸:撕裂碎片落回地面成为永久瓦砾 */
const wrecks=[];
function addScar(x,z,r){const g=new THREE.Group();g.position.set(x,0,z);
 const patch=new THREE.Mesh(new THREE.CircleGeometry(r*1.25,18),
  new THREE.MeshBasicMaterial({color:0x2f2a20,transparent:true,opacity:.34,depthWrite:false}));
 patch.rotation.x=-Math.PI/2;patch.position.y=.22;g.add(patch);
 for(let i=0;i<3;i++){const m=new THREE.Mesh(jaggedBox(rnd(6,14),rnd(3,7),rnd(5,10),.4),MAT.concrete);
  m.position.set(rnd(-r,r)*.55,rnd(1.5,3),rnd(-r,r)*.55);m.rotation.y=rnd(0,6);m.castShadow=true;g.add(m);}
 scene.add(g);scars.push(g);
 if(scars.length>50){const old=scars.shift();scene.remove(old);
  old.traverse(c=>{if(c.geometry)c.geometry.dispose();});}}
function addStump(x,z){const st=new THREE.Mesh(new THREE.CylinderGeometry(2.4,3.2,7,8),MAT.trunk);
 st.position.set(x,3.5,z);st.castShadow=true;scene.add(st);scars.push(st);
 if(scars.length>50){const old=scars.shift();scene.remove(old);
  old.traverse(c=>{if(c.geometry)c.geometry.dispose();});}}
for(const pool of POOLS){
 pool.dinf=[];for(let i=0;i<pool.n;i++)pool.dinf.push({a:rnd(0,6.28),r:rnd(34,92),
  y:rnd(4,92),s:rnd(1.6,3.6),on:false,sx:rnd(.7,1.5),sy:rnd(.5,1.1),sz:rnd(.7,1.5)});
 pool.mesh=new THREE.InstancedMesh(pool.geo,pool.mat,pool.n);
 pool.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
 pool.mesh.castShadow=true;
 for(let i=0;i<pool.n;i++){_e.set(0,0,0);_q.setFromEuler(_e);_s.set(0,0,0);
  _m4.compose(_p3.set(0,-500,0),_q,_s);pool.mesh.setMatrixAt(i,_m4);
  pool.mesh.setColorAt(i,_col.set(0xffffff));}
 lean.add(pool.mesh);}
function spawnDebris(kind,cs,n){const pool=POOLS.find(p=>p.k===kind)||POOLS[0];
 const nat={concrete:0xa8abae,wood:0x8a5f36,leaf:0x4c8a3c,stone:0x8d9196,metal:0xb0b4b8}[kind]||0x999999;
 for(let i=0;i<n;i++){let idx=-1;
  for(let j=0;j<pool.n;j++)if(!pool.dinf[j].on){idx=j;break;}
  if(idx<0)idx=(Math.random()*pool.n)|0;
  const d=pool.dinf[idx];d.on=true;d.y=rnd(8,60);d.t=0;   // 复用槽位必须把寿命计时清零,否则它会带着上一次的 t 立刻退场
  d.sx=rnd(.6,1.5);d.sy=rnd(.45,1.1);d.sz=rnd(.65,1.5);
  const picked=cs&&cs.length?cs[(Math.random()*cs.length)|0]:nat;
  if(kind==='metal')_col.set(picked).multiplyScalar(rnd(.9,1.1));
  else _col.set(nat).lerp(new THREE.Color(picked),.45).multiplyScalar(rnd(.85,1.1));
  pool.mesh.setColorAt(idx,_col);}
 pool.mesh.instanceColor.needsUpdate=true;}
const blob=new THREE.Mesh(new THREE.CircleGeometry(66,26),
 new THREE.MeshBasicMaterial({color:0x1e2418,transparent:true,opacity:.22,depthWrite:false}));
blob.rotation.x=-Math.PI/2;blob.position.y=.5;lean.add(blob);
/* 目标罗盘:指向电视塔 */
const compass=new THREE.Group();
const cArrow=new THREE.Mesh(new THREE.ConeGeometry(9,24,4),
 new THREE.MeshBasicMaterial({color:0xffd75e}));
cArrow.rotation.x=Math.PI/2;cArrow.position.z=13;compass.add(cArrow);
scene.add(compass);compass.visible=false;
let landmarkRef=null;

function updateTornadoVisual(dt){
 funnelPulse*=Math.exp(-dt*7); // 吞吃瞬间鼓一下,给"我变强了"一个身体反应
 const evo=Math.min(1,score/TH[7]);
 // 成长必须写在角色身上:小龙卷只是地上的一缕,不能和天灾之王占一样大的屏幕
 const grow=Math.min(1,(T.r-26)/124);
 const s=T.r/26*(1+funnelPulse),sy=Math.pow(s,.75)*(1+funnelPulse*.6)*(.55+.45*grow);
 tornado.position.set(T.x,0,T.z);
 tornado.scale.set(s,sy,s);
 funnelUni.time.value=time;
 funnelUni.opK.value=.74+.26*evo;  // 小的时候轻,大的时候压得暗(第 7 轮一度压太狠,轮廓看不见了)
 // 颜色随等级进化:暖尘色一缕 -> 近黑风暴
 funnelUni.cDark.value.setRGB(.40-.32*evo,.35-.29*evo,.29-.23*evo);
 funnelUni.cLight.value.setRGB(.86-.51*evo,.80-.46*evo,.70-.38*evo);
 fpts.material.color.setRGB(.75-.18*evo,.66-.16*evo,.56-.18*evo);
 for(const sp of dustG.children)sp.material.color.setRGB(.80-.30*evo,.72-.28*evo,.58-.22*evo);
 storm.rotation.y=time*.12;
 for(let i=0;i<FN;i++){const p=fp[i];
  const turb=Math.sin(time*3.1+p.w)*3.5*(1.15-p.t);
  const rad=(9+50*Math.pow(p.t,.85))*p.j+turb;
  const a=p.a+p.s*(1.6-p.t)*time+Math.sin(time*1.7+p.w*2)*.14;
  const i3=i*3;
  fpos[i3]=Math.cos(a)*rad;fpos[i3+1]=p.t*150;fpos[i3+2]=Math.sin(a)*rad;}
 fgeo.attributes.position.needsUpdate=true;
 fpts.material.size=8*Math.pow(s,.55);
 for(const sp of dustG.children){const u=sp.userData;u.a+=u.s*dt;
  sp.position.set(Math.cos(u.a)*u.r,3+2*Math.sin(time*2+u.r),Math.sin(u.a)*u.r);}
 for(const pool of POOLS){const pd=pool.dinf;
  for(let i=0;i<pd.length;i++){const d=pd[i];if(!d.on)continue;
   d.a+=d.s*dt;d.y+=14*dt;
   // 旧写法 `if(d.y>100)d.y=4;` 是**瞬移**:碎块飞到顶会凭空出现在底部(实测一帧 Δy≈-96),
   // 玩家看到的是"柱子底下不断冒出新的碎块"。到顶就退场,不做回卷 —— 反正上面已经给了 6.5~10.5 秒寿命。
   if(d.y>100){d.y=100;d.on=false;}
   // 绕柱的碎块得有生有死:旧写法从不关 d.on ⇒ 90 个槽位只增不减,填满后新破坏只能复用旧槽,
   // 玩家看到的是"拆得越多越没碎块"(静默消失)。给 7~11 秒寿命,到点退场(视觉仍是绕柱环,不改手感形状)。
   d.t=(d.t||0)+dt;if(d.t>(6.5+d.r%5))d.on=false;
   _e.set(time*2+i,time*1.6+i*2,0);_q.setFromEuler(_e);
   const wob=Math.sin(time*2.2+i)*10;
   _m4.compose(_p3.set(Math.cos(d.a)*(d.r+wob),d.y,Math.sin(d.a)*(d.r+wob)),_q,_s.set(d.sx,d.sy,d.sz));
   pool.mesh.setMatrixAt(i,_m4);}
  pool.mesh.instanceMatrix.needsUpdate=true;}
 lean.rotation.z+=(clamp(-vx*.0011,-.1,.1)-lean.rotation.z)*Math.min(1,dt*4);
 lean.rotation.x+=(clamp(vz*.0011,-.1,.1)-lean.rotation.x)*Math.min(1,dt*4);
 if(landmarkRef&&landmarkRef.state==='idle'&&phase!=='menu'){
  const dx=landmarkRef.x-T.x,dz=landmarkRef.z-T.z,d=Math.hypot(dx,dz);
  compass.visible=d>750;
  if(compass.visible){compass.position.set(T.x,T.r*2.6+170,T.z);
   compass.rotation.y=Math.atan2(dx,dz);
   compass.scale.setScalar(Math.max(1,T.r/26)*1.1);}}
 else compass.visible=false;}

/* ---------- 闪电 ---------- */
let boltT=rnd(4,9),hemiBase=.42,flashActive=false,stormLevel=0;
function lightning(dt){boltT-=dt*(1+stormLevel*1.6);if(boltT>0)return;
 boltT=Math.max(1.6,rnd(5,11)-stormLevel*5.5);
 const f=$('flash');f.style.transition='none';f.style.opacity=reduceMotion?.05:.2+stormLevel*.14;
 setTimeout(()=>{f.style.transition='opacity .5s';f.style.opacity=0;},60);
 hemi.intensity=1.7;flashActive=true;
 setTimeout(()=>{hemi.intensity=hemiBase;flashActive=false;},110);
 for(const bm of BLD)bm.emissiveIntensity=1.6; // 窗灯随闪电增强
 setTimeout(()=>blip(70,36,.7,.12+stormLevel*.08,'sawtooth'),rnd(250,900));}
/* 暴雨(风暴升级后出现) */
const RN=420,rpos=new Float32Array(RN*3);
const rgeo=new THREE.BufferGeometry();
rgeo.setAttribute('position',new THREE.BufferAttribute(rpos,3));
const rain=new THREE.Points(rgeo,new THREE.PointsMaterial({color:0x9fb6c8,size:2.6,
 transparent:true,opacity:0,depthWrite:false}));
scene.add(rain);
const FOG_A=new THREE.Color(0xc3d9ea),FOG_B=new THREE.Color(0x66707c);
let isNight=false;
let isSnow=false;
const SNOWLEAF=new THREE.MeshStandardMaterial({map:CHUNKTEX.leaf,color:0xe8eef2,roughness:.92,envMapIntensity:.5});
function applySnow(){
 ground.material.color.setHex(isSnow?0xd8e2ea:0xffffff);
 if(isSnow){
  scene.fog.color.setHex(0xc8d4de);scene.fog.near=700;scene.fog.far=3000;
  rain.material.color.setHex(0xffffff);
  for(const o of objects){
   if(o.k==='tree_s'||o.k==='tree_b'||o.k==='bush'||o.k==='palm'){
    o.node.traverse(c=>{if(c.isMesh&&(c.material===MAT.leaf||c.material===MAT.leaf2||c.material===MAT.pine))
     c.material=SNOWLEAF;});}}
  if(!objects.some(o=>o.k==='snowman')){
   for(let i=0;i<8;i++){
    const rc=ZR.grass[(Math.random()*ZR.grass.length)|0];
    const x=rc.x+rnd(80,rc.w-80),z=rc.z+rnd(80,rc.h-80);
    if(!inRoad(x,z,30))addObj('snowman',x,z,rnd(0,6));}}
  for(let i=0;i<5;i++){
   const rc2=ZR.grass[(Math.random()*ZR.grass.length)|0];
   const sx=rc2.x+rnd(80,rc2.w-80),sz2=rc2.z+rnd(80,rc2.h-80);
   if(!inRoad(sx,sz2,30)){addObj('skier',sx,sz2,0);
    const p=objects[objects.length-1];
    p.wa=rnd(0,6.28);p.spd=rnd(60,95);}}
  showHint('❄️ 暴雪来袭,卷走这座雪城!',2600);}
 else{rain.material.color.setHex(0x9fb6c8);}}
const FOG_N=new THREE.Color(0x1a2230);
function applyNight(){if(!skyMatRef)return;
 if(isNight){
  skyMatRef.uniforms.storm.value=Math.max(skyMatRef.uniforms.storm.value,0); // 夜空走单独色
  hemi.color.setHex(0x2a3d5c);hemi.groundColor.setHex(0x1a1f18);
  sun.color.setHex(0x9fb6d8);sun.intensity=.35;
  renderer.toneMappingExposure=.82;
  scene.fog.color.copy(FOG_N);
  scene.fog.near=900;scene.fog.far=3400;
  if(skyMatRef.uniforms.nightK===undefined){skyMatRef.uniforms.nightK={value:0};
   skyMatRef.fragmentShader=skyMatRef.fragmentShader.replace('uniform float storm;','uniform float storm;uniform float nightK;')
    .replace('gl_FragColor=vec4(col,1.0);','col=mix(col,vec3(.03,.05,.10)+vec3(.05,.06,.09)*pow(hgt,.4),nightK);gl_FragColor=vec4(col,1.0);');
   skyMatRef.needsUpdate=true;}
  skyMatRef.uniforms.nightK.value=1;}
 else{
  if(skyMatRef.uniforms.nightK)skyMatRef.uniforms.nightK.value=0;
  scene.fog.near=1500;scene.fog.far=4600;}}
/* 雨滴地面涟漪(池化 20) */
const RIPN=20;
const ripGeo=new THREE.RingGeometry(.7,1,18);
const ripples=[];
for(let i=0;i<RIPN;i++){
 const m=new THREE.Mesh(ripGeo,new THREE.MeshBasicMaterial({color:0xbfd8e8,
  transparent:true,opacity:0,depthWrite:false}));
 m.rotation.x=-Math.PI/2;m.position.y=.4;m.visible=false;scene.add(m);
 ripples.push({m,t:1e9});}
function updateRipples(dt,pEsc){
 if(pEsc>.25&&Math.random()<dt*26){
  const r=ripples.find(q=>q.t>1); // 复用已结束的
  if(r){r.t=0;r.m.visible=true;
   r.m.position.x=camera.position.x+rnd(-120,120);
   r.m.position.z=camera.position.z+rnd(-120,120);
   r.m.scale.setScalar(1);}}
 for(const r of ripples){if(r.t>1)continue;
  r.t+=dt;
  const k=r.t/0.9;
  if(k>=1){r.m.visible=false;r.t=1e9;continue;}
  r.m.scale.setScalar(1+k*14);
  r.m.material.opacity=.4*(1-k);}}

/* 吃不动的物件:脚下琥珀色提示环(池化 6,只标最近碰到的几个,避免满屏恐慌) */
const LOCKN=6;
const lockGeo=new THREE.RingGeometry(.87,1,28);
// 琥珀(0xffb648)的亮度约 191,而白天地面的亮度约 175 —— 单靠琥珀在白天几乎等亮,实测最淡一帧只有
// 6~9/255 的亮度差(verify17 Y1/Y2)。所以配一圈深色衬环:琥珀条夹在暗边中间,亮地面、夜城都读得出。
const lockGeo2=new THREE.RingGeometry(.68,1.16,28);
const lockRings=[],lockShades=[];
for(let i=0;i<LOCKN;i++){const m=new THREE.Mesh(lockGeo,new THREE.MeshBasicMaterial({color:0xffd98a,
 transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
 m.rotation.x=-Math.PI/2;m.position.y=.6;m.visible=false;
 m.renderOrder=10;scene.add(m);            // 排在风柱尘盘之后:不然"走近了"反而被自己的风柱洗掉(实测 Weber 0.11)
 lockRings.push(m);
 const sh=new THREE.Mesh(lockGeo2,new THREE.MeshBasicMaterial({color:0x1d1608,
  transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
 sh.rotation.x=-Math.PI/2;sh.position.y=.55;sh.visible=false;
 sh.renderOrder=9;scene.add(sh);
 lockShades.push(sh);}
function updateLockRings(){
 const cand=[];
 for(const o of objects){if(o.state!=='idle')continue;
  // 等级够不够、以及这座塔在当前模式到底卷不卷得动 —— 卷不动的塔也要亮圈,否则玩家只会
  // 反复冲过去,以为是自己没对准(实测:满级在塔上停 24 秒,游戏一个字都没说)
  if(!(o.tier>level||(o.k==='landmark'&&!towerEdible())))continue;
  const dd=Math.hypot(o.x-T.x,o.z-T.z);
  if(dd<T.r*2+o.r+46)cand.push([dd,o]);}
 cand.sort((a,b)=>a[0]-b[0]);
 for(let i=0;i<LOCKN;i++){const m=lockRings[i],sh=lockShades[i],c=cand[i];
  if(!c){m.visible=false;sh.visible=false;continue;}
  const o=c[1],k=1-Math.min(1,c[0]/(T.r*2+o.r+46)); // 越近越实
  const pu=1+Math.sin(time*4.5)*.14;                // 环和衬环一起脉动,别一个动一个不动
  m.visible=true;sh.visible=true;m.position.set(o.x,.6,o.z);sh.position.set(o.x,.55,o.z);
  const s=o.r*1.8*(1+Math.sin(time*4.5)*.045);
  m.scale.set(s,s,1);sh.scale.set(s,s,1);
  m.material.opacity=(.34+.28*k)*pu;
  sh.material.opacity=Math.min(.9,(.42+.30*k)*pu);}}
  // 旧值 (.20+.34k)*(1±.22) 让最淡的一帧在白天只有 6.9/255 的亮度差(实测 probe24)——
  // "吃不动的会亮圈"这条信息在它最该出现的地方几乎看不见。脉动照留,但把地板抬起来。

function updateRain(dt,pEsc){rain.material.opacity=pEsc*.4;
 if(pEsc<.02)return;
 for(let i=0;i<RN;i++){const i3=i*3;
  rpos[i3+1]-=(isSnow?150:340)*dt;
  if(rpos[i3+1]<2){rpos[i3+1]=240;
   rpos[i3]=camera.position.x+rnd(-280,280);
   rpos[i3+2]=camera.position.z+rnd(-280,280);}}
 rgeo.attributes.position.needsUpdate=true;}
/* 玻璃幕墙实时反射探针(市中心第一栋玻璃塔) */
let probeCam=null,probeRT=null,probeMesh=null,probeTick=0;
function setupProbe(){
 const sky=objects.find(o=>o.k==='sky');
 if(!sky||probeCam)return;
 probeRT=new THREE.WebGLCubeRenderTarget(256,{generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
 probeCam=new THREE.CubeCamera(1,6000,probeRT);
 probeCam.position.set(sky.x,120,sky.z);
 scene.add(probeCam);
 sky.node.traverse(c=>{if(c.isMesh&&c.material===BLD[4]&&!probeMesh){
  probeMesh=c;
  probeMesh.material=BLD[4].clone();
  probeMesh.material.envMap=probeRT.texture;
  probeMesh.material.needsUpdate=true;}});
 applyAniso();   // 反射探针是启动之后才挂上来的:克隆出来的材质带着一批新贴图槽位,补一次幂等扫描
                 // (verify49 B1 现场数出来的:不补这一下就有 4 张贴图各向异性还停在 1)
}
function clearProbe(){if(probeCam){scene.remove(probeCam);}
 if(probeRT){probeRT.dispose();}
 probeCam=null;probeRT=null;probeMesh=null;probeTick=0;}
function updateProbe(){if(!probeCam||!probeMesh)return;
 probeTick=(probeTick+1)%20;
 if(probeTick!==0)return;
 probeMesh.visible=false;
 probeCam.update(renderer,scene);
 probeMesh.visible=true;}

/* 残骸落地:重力下坠→翻滚→落地静止(永久瓦砾) */
function updateWrecks(dt){if(!wrecks.length)return;
 for(const w of wrecks){if(w.landed)continue;
  w.vy-=560*dt;w.m.position.y+=w.vy*dt;
  w.m.rotation.x+=w.rv*dt;w.m.rotation.z+=w.rv*.7*dt;
  if(w.m.position.y<=w.rest){w.m.position.y=w.rest;w.landed=true;
   w.m.rotation.x=0;w.m.rotation.z=rnd(-.15,.15);}}}
function capWrecks(){while(wrecks.length>60){const w=wrecks.shift();
 scene.remove(w.m);w.m.geometry.dispose();}}

/* 风柱内部闪电弧(LV6+ 随机闪烁) */
const BN=10,bpos=new Float32Array(BN*3);
const bgeo=new THREE.BufferGeometry();
bgeo.setAttribute('position',new THREE.BufferAttribute(bpos,3));
const bolt=new THREE.Line(bgeo,new THREE.LineBasicMaterial({color:0xcfe8ff,transparent:true,
 opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
lean.add(bolt);
let boltLife=0,boltNext=rnd(2,5);
function updateBolt(dt,stormK){boltNext-=dt*(1+stormLevel*1.2);
 if(boltNext<=0&&level>=6&&stormK>.2){boltNext=rnd(1.2,3.4);boltLife=.14;
  let a=rnd(0,6.28);
  for(let i=0;i<BN;i++){const t=i/(BN-1);
   const rad=(10+50*Math.pow(t,.85))*rnd(.8,1.15);
   a+=rnd(-.35,.35);
   bpos[i*3]=Math.cos(a)*rad;bpos[i*3+1]=t*140;bpos[i*3+2]=Math.sin(a)*rad;}
  bgeo.attributes.position.needsUpdate=true;
  bolt.material.opacity=.85*stormK;}
 if(boltLife>0){boltLife-=dt;bolt.material.opacity=Math.max(0,boltLife/.14)*.85*stormK;}}

/* 竞争 AI 龙卷风(红色对手) */
const RV={x:2400,z:600,r:20,score:0,lvl:1,spd:88,tgt:null,retarget:0};
let rivalAhead=false;
const rival=new THREE.Group();
const rLean=new THREE.Group();rival.add(rLean);
const rf1=new THREE.Mesh(new THREE.CylinderGeometry(26,5,60,14,1,true),
 new THREE.MeshBasicMaterial({color:0xff5a4a,transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide}));
rf1.position.y=30;rLean.add(rf1);
const rf2=new THREE.Mesh(new THREE.CylinderGeometry(18,4,46,12,1,true),
 new THREE.MeshBasicMaterial({color:0xd8a49a,transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide}));
rf2.position.y=23;rLean.add(rf2);
const RN2=100,rp2=new Float32Array(RN2*3);
const rp2g=new THREE.BufferGeometry();rp2g.setAttribute('position',new THREE.BufferAttribute(rp2,3));
const rp2p=new THREE.Points(rp2g,new THREE.PointsMaterial({map:TEX.dustPuff,color:0xff9a8a,size:6,
 transparent:true,opacity:.45,depthWrite:false,blending:THREE.AdditiveBlending}));
rLean.add(rp2p);
const rp=[];for(let i=0;i<RN2;i++)rp.push({t:Math.random(),a:rnd(0,6.28),s:rnd(2,4),j:rnd(.8,1.2)});
scene.add(rival);rival.visible=false;
function rivalUpdate(dt){if(phase==='menu')return;
 RV.lvl=Math.min(8,1+((RV.score/150)|0));
 RV.r=20+Math.min(40,RV.score*.03);
 // 找最近的可吃目标(避开玩家嘴边)
 let best=null,bd=1e9;
 const steal=Math.random()<.3; // 30% 概率故意抢玩家身边的目标
 for(const o of objects){
  if(o.state!=='idle'||o.k==='landmark'||o.k.indexOf('ped')===0)continue;
  if(o.tier>RV.lvl)continue;
  const dp=Math.hypot(o.x-T.x,o.z-T.z);
  if(steal){if(dp>260)continue;}
  else if(dp<T.r*2.5+o.r)continue;
  const d=Math.hypot(o.x-RV.x,o.z-RV.z);if(d<bd){bd=d;best=o;}}
 RV.tgt=best;
 if(RV.tgt){const dx=RV.tgt.x-RV.x,dz=RV.tgt.z-RV.z,d=Math.hypot(dx,dz);
  if(d>2){RV.x+=dx/d*RV.spd*dt;RV.z+=dz/d*RV.spd*dt;}}
 else{RV.retarget-=dt;if(RV.retarget<=0){RV.retarget=rnd(3,7);RV.tx=rnd(200,3000);RV.tz=rnd(200,3000);}
  const dx=RV.tx-RV.x,dz=RV.tz-RV.z,d=Math.hypot(dx,dz);
  if(d>4){RV.x+=dx/d*RV.spd*.7*dt;RV.z+=dz/d*RV.spd*.7*dt;}}
 RV.x=clamp(RV.x,40,WORLD-40);RV.z=clamp(RV.z,40,WORLD-40);
 // 吞噬
 const eatRange=RV.r*1.5;
 for(const o of objects){
  if(o.state!=='idle'||o.k==='landmark'||o.k.indexOf('ped')===0)continue;
  const dd=Math.hypot(o.x-RV.x,o.z-RV.z);
  if(dd<eatRange+o.r&&o.tier<=RV.lvl){
   o.state='gone';o.node.visible=false;
   if(o.k.indexOf('ped')!==0&&!o.axis)destroyedIds.push(o.id);
   RV.score+=o.pts;
   if(Math.hypot(o.x-T.x,o.z-T.z)<T.r*2.2+o.r&&hintT<=0){
    showHint('对手抢走了你的猎物!',2000);hintT=2;}}}
 // 外观
 rival.visible=true;
 rival.position.set(RV.x,0,RV.z);
 const rs=.8+Math.min(1.6,RV.score*.0015);
 rival.scale.setScalar(rs);
 rf1.rotation.y=-time*1.5;rf2.rotation.y=time*2;
 for(let i=0;i<RN2;i++){const p=rp[i];
  const rad=(6+22*Math.pow(p.t,.9))*p.j;
  const a=p.a+p.s*(1.5-p.t)*time;
  rp2[i*3]=Math.cos(a)*rad;rp2[i*3+1]=p.t*58;rp2[i*3+2]=Math.sin(a)*rad;}
 rp2g.attributes.position.needsUpdate=true;
 rp2p.material.size=6*Math.pow(rs,.5);
 // 领先/反超播报
 const ahead=RV.score>score+80;
 if(ahead&&!rivalAhead&&phase==='play')showHint('对手:就这?(狂笑)',2400);
 if(!ahead&&rivalAhead&&phase==='play')showHint('反超了!保持压制!',2200);
 if(!ahead&&rivalAhead&&phase==='play'){stats.comebacks=(stats.comebacks||0)+1;saveStats();checkAchv();}
 rivalAhead=ahead;
 // 对手分数迷你条
 if(RV.pill)RV.pill.textContent='🔴 对手 '+RV.score;}

/* ---------- 音效 ---------- */
let AC=null,whGain=null,whFilt=null,rnGain=null,sirenOsc=null,sirenGain=null,sirenOn=false,BUS=null,
 masterG=null,busAmb=null,busSfx=null;
let muted=false;try{muted=localStorage.getItem('tornadoMuted')==='1'}catch(e){}
function audioUnlock(){if(AC)return;
 try{AC=new (window.AudioContext||window.webkitAudioContext)();
  const len=AC.sampleRate*1.5,buf=AC.createBuffer(1,len,AC.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
  const src=AC.createBufferSource();src.buffer=buf;src.loop=true;
  const comp=AC.createDynamicsCompressor();
  comp.threshold.value=-18;comp.knee.value=12;comp.ratio.value=6;comp.attack.value=.004;comp.release.value=.18;
  masterG=AC.createGain();masterG.gain.value=.9*CFG.master/100;
  comp.connect(masterG);masterG.connect(AC.destination);BUS=comp;
  busAmb=AC.createGain();busAmb.gain.value=CFG.amb/100;busAmb.connect(BUS);
  busSfx=AC.createGain();busSfx.gain.value=CFG.sfx/100;busSfx.connect(BUS);
  whFilt=AC.createBiquadFilter();whFilt.type='bandpass';whFilt.frequency.value=380;whFilt.Q.value=.7;
  whGain=AC.createGain();whGain.gain.value=0;
  src.connect(whFilt);whFilt.connect(whGain);whGain.connect(busAmb);src.start();
  const src2=AC.createBufferSource();src2.buffer=buf;src2.loop=true;
  const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=900;
  rnGain=AC.createGain();rnGain.gain.value=0;
  src2.connect(lp);lp.connect(rnGain);rnGain.connect(busAmb);src2.start();
  // 防空警报:锯齿波慢扫频(LV6+ 常驻)
  sirenOsc=AC.createOscillator();sirenOsc.type='sawtooth';sirenOsc.frequency.value=480;
  sirenGain=AC.createGain();sirenGain.gain.value=0;
  sirenOsc.connect(sirenGain);sirenGain.connect(busAmb);sirenOsc.start();
 }catch(e){}}
function audioFrame(dt){if(!AC)return;
 const tg=(muted||phase!=='play')?0:Math.min(.22,.05+T.r/150*.14);
 whGain.gain.value+=(tg-whGain.gain.value)*Math.min(1,dt*4);
 whFilt.frequency.value=280+T.r*2.2+Math.sin(time*6)*40;
 if(rnGain)rnGain.gain.value+=((muted?0:stormLevel*.13)-rnGain.gain.value)*Math.min(1,dt*3);
 // 防空警报:LV6+ 常驻扫频
 if(sirenGain&&sirenOsc){
  const active=(level>=6&&phase==='play'&&!muted);
  if(active&&!sirenOn){sirenOn=true;
   showHint('⚠️ 龙卷风警报!全城进入紧急状态',2800);vib([40,60,40,60,120]);}
  if(!active)sirenOn=false;
  const sg=(active&&!muted)?.045:0;
  sirenGain.gain.value+=(sg-sirenGain.gain.value)*Math.min(1,dt*2);
  sirenOsc.frequency.value=480+260*Math.sin(time*1.05);}}
function blip(f0,f1,dur,vol,type){if(!AC||muted)return;
 try{const o=AC.createOscillator(),g=AC.createGain();o.type=type||'triangle';
 o.frequency.setValueAtTime(f0,AC.currentTime);
 o.frequency.exponentialRampToValueAtTime(Math.max(30,f1),AC.currentTime+dur);
 g.gain.setValueAtTime(vol,AC.currentTime);
 g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+dur);
 o.connect(g);g.connect(busSfx||BUS||AC.destination);o.start();o.stop(AC.currentTime+dur);}catch(e){}}
function popSnd(o){const f=Math.max(170,880-o.r*5.5);blip(f*1.5,f*.55,.13,.09);}
function crackSnd(kind){if(!AC||muted)return;
 try{
  if(kind==='concrete'||kind==='stone'){
   const o=AC.createOscillator(),g=AC.createGain();o.type='square';
   o.frequency.setValueAtTime(90,AC.currentTime);
   o.frequency.exponentialRampToValueAtTime(35,AC.currentTime+.22);
   g.gain.setValueAtTime(.12*(0.85+Math.random()*.3),AC.currentTime);
   g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+.25);
   o.connect(g);g.connect(busSfx||AC.destination);o.start();o.stop(AC.currentTime+.26);
   blip(200,60,.15,.09,'sawtooth');}
  else if(kind==='wood'){blip(320,120,.18,.09,'square');blip(520,180,.1,.05,'triangle');}
  else if(kind==='metal'){blip(1200,300,.3,.06,'square');blip(2400,900,.18,.035,'sine');}
  else blip(900,300,.12,.07,'triangle');
 }catch(e){}}
function creakSnd(){if(!AC||muted)return;
 blip(140,60,.5,.08,'sawtooth');blip(95,50,.6,.06,'sawtooth');}
/* 摇晃松动结束:建筑当场撕裂,碎片/疤痕/音效在此触发 */
function startTear(o){
 o.node.visible=false;
 const mats=[];o.node.traverse(c=>{
  if(c.isMesh&&c.material&&mats.indexOf(c.material)<0)mats.push(c.material);});
 o.frags=[];
 // 碎片数要跟体积相称:旧写法只有 `tier>=6?6:4` 两档 ⇒ 实测(probe96 D1)bus r=30 掉 4 块、
 // sky r=75 也只掉 6 块,每单位体积的碎片数从 0.148 掉到 0.014 —— 拆大楼和拆长椅看起来一样碎。
 // 按半径开方取整并夹在 4..12:长椅 4 / 公交 4 / 大宅 5 / 大楼 5-6 / 高楼 9 / 电视塔 12。
 const n=Math.max(4,Math.min(12,Math.round(Math.pow(Math.max(1,o.r)/13,1.35))));
 for(let fi=0;fi<n;fi++){
     const fm=mats.length?mats[(Math.random()*mats.length)|0]:MAT.concrete;
     const fhh=rnd(5,14);
     const m=new THREE.Mesh(new THREE.BoxGeometry(o.r*rnd(.4,.8),fhh,o.r*rnd(.3,.6)),fm);
     m.userData.hh=fhh;
     m.userData.pool=POOLMAP[o.k]||'concrete';
     m.castShadow=true;m.position.set(o.x,rnd(6,20),o.z);scene.add(m);
  o.frags.push({m,d0:o.d0*rnd(.7,1.2),ph:rnd(-1.3,1.3),hk:rnd(.5,1),
   rx:rnd(3,9)*(Math.random()<.5?-1:1),rz:rnd(2,7)*(Math.random()<.5?-1:1)});}
 burstCols(POOLMAP[o.k]||'concrete',null,3);
 addScar(o.x,o.z,o.r);scarList.push([Math.round(o.x),Math.round(o.z),o.r]);
 shake=Math.min(1,shake+.14);crackSnd(POOLMAP[o.k]||'concrete');
 o.a0=Math.atan2(o.z-T.z,o.x-T.x);
 o.d0=Math.max(18,Math.hypot(o.x-T.x,o.z-T.z));}
function chime(){blip(660,660,.18,.1,'sine');setTimeout(()=>blip(880,880,.28,.1,'sine'),120);}
function fanfare(){[523,659,784,1047].forEach((f,i)=>setTimeout(()=>blip(f,f,.4,.13,'triangle'),i*170));}
function vib(v){if(!CFG.vib)return;try{navigator.vibrate&&navigator.vibrate(v)}catch(e){}}
function vibTier(tier){ // 分级触感
 if(tier>=8)vib([50,50,50,50,140]);      // 电视塔:连震轰鸣
 else if(tier>=7)vib([30,40,70]);          // 摩天楼:三段重震
 else if(tier>=5)vib(38);                  // 大建筑:单次重震
 else if(tier>=3)vib(16);                  // 汽车/树:轻震
 else vib(7);}                             // 花草:微触

/* ---------- 输入 ---------- */
const keys={};
addEventListener('keydown',e=>keys[e.key.toLowerCase()]=1);
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=0);
let pid=null;
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),
 gplane=new THREE.Plane(V3(0,1,0),0),hitP=V3(0,0,0);
/* 手指会盖住风柱正下方那块地面:触屏时把落点往屏幕上方抬,风柱就露在指尖之上 */
const touchLift=()=>Math.min(170,innerHeight*.19);
function setTarget(cx,cy,lift){const yy=Math.max(innerHeight*.16,cy-(lift||0));
 ndc.set(cx/innerWidth*2-1,-(yy/innerHeight)*2+1);
 ray.setFromCamera(ndc,camera);
 if(ray.ray.intersectPlane(gplane,hitP)){
  T.tx=clamp(hitP.x,40,WORLD-40);T.tz=clamp(hitP.z,40,WORLD-40);}}
const cvs=renderer.domElement;
cvs.addEventListener('pointerdown',e=>{pid=e.pointerId;
 setTarget(e.clientX,e.clientY,e.pointerType==='touch'?touchLift():0);
 audioUnlock();if(AC&&AC.state==='suspended')AC.resume();});
// 悬停时 buttons=0(触屏拖动则恒为 1,不会被这条误伤):见到 0 就说明针早抬过了
cvs.addEventListener('pointermove',e=>{if(e.pointerId!==pid)return;
 if(!e.buttons){pid=null;return;}
 setTarget(e.clientX,e.clientY,e.pointerType==='touch'?touchLift():0);});
// 抬手不抹掉没走完的行程:实测"点一下"只让风柱走 37 世界单位(拖动 2 秒是 264),
// 手指一抬目标就被拉回原地 ⇒ 点按派新手觉得屏幕没反应,引导第 1 步也永远过不去。
// 但"听见抬手"必须挂在 window 上:触屏有浏览器隐式捕获保底,鼠标没有 ——
// 在世界里按住、拖到 HUD 的 🔊/⏸ 上(或视口边缘的 HTML 上)松手,这次 pointerup 落在隔壁元素,
// canvas 永远等不到 ⇒ pid 留着,之后光是移动鼠标就在拖着风柱走(实测松手后再悬停,目标又挪了 275 单位)。
const pend=e=>{if(e.pointerId===pid)pid=null;};
addEventListener('pointerup',pend);addEventListener('pointercancel',pend);
// keyup 更不保证送到:切去别的程序时它发给了那个程序,回到本页那根键还留着 ⇒ 风柱自己狂奔
const dropInput=()=>{for(const k in keys)keys[k]=0;pid=null;};
addEventListener('blur',dropInput);
cvs.addEventListener('contextmenu',e=>e.preventDefault());

/* ---------- 浮动得分 ---------- */
const fts=[];
const FTMAX=()=>reduceMotion?5:14;
function ftext(wx,wy,wz,txt,pts){const el=document.createElement('div');
 el.className='ftext';el.textContent=txt;
 el.style.fontSize=Math.max(16,Math.min(28,16+(pts||0)*.05))+'px';
 document.body.appendChild(el);
 fts.push({el,wx,wy,wz,t:0,dx:rnd(-30,30)}); // 横向散布:同一落点会把飘字叠成一坨乱码
 while(fts.length>FTMAX())fts.shift().el.remove();}
function updateFts(dt){for(let i=fts.length-1;i>=0;i--){const f=fts[i];f.t+=dt;
 if(f.t>.9){f.el.remove();fts.splice(i,1);continue;}
 _p3.set(f.wx,f.wy,f.wz).project(camera);
 const x=(_p3.x*.5+.5)*innerWidth+f.dx,y=(-_p3.y*.5+.5)*innerHeight;
 f.el.style.transform='translate(-50%,-50%) translate('+x+'px,'+(y-f.t*80)+'px)';
 f.el.style.opacity=String(1-f.t/.9);}}
/* 连击是状态不是事件:固定在 HUD 里显示一个数字 + 剩余时间条,不再每次吞吃刷一条飘字 */
let comboShown=0;
/* 限时模式的目标读数。菜单有「⏱ 挑战最佳」、结算牌第三格也有,唯独玩的时候哪儿都看不到 ——
   probe58 实测:跨过上局最佳前后,可见读数(HUD 五格 + 计时 + 提示 + 飘字)里提到这个数的有 0 个。
   分数是瞬加的那条时间轴不作证据,这里只补"多少算好"这一个数。 */
function rushGoal(){const el=$('rushgoal');if(!el)return;
 if(mode!=='rush'||phase!=='play'||rushEnded){el.style.display='none';return;}
 el.style.display='block';
 const txt=rushBest?(score>rushBest?'🔥 已破纪录 +'+(score-rushBest):'目标 '+rushBest+' · 还差 '+(rushBest-score))
  :'目标 尚无纪录';
 if(el.textContent!==txt)el.textContent=txt;} // 每帧都调,但只在文案真的变了时写 DOM
function showCombo(){const el=$('combo');
 if(comboN<3){el.classList.remove('on');comboShown=0;return;}
 el.classList.add('on');
 if(comboN===comboShown)return;        // 每帧都调,里程碑必须按跳变触发
 comboShown=comboN;
 // 认真吃的时候这条几乎不会断(实测 238 次吃件里 235 次亮着、峰值 ×222),三位数的"连击 ×222"
 // 挨着一堆分数看就像收益。超过 99 就封顶显示,真数值落在结算卡的「本局最高连击」里
 $('combon').textContent=comboN>99?'99+':comboN;
 if(comboN===5||comboN===10||comboN===25||comboN===50){
  banner('连击 ×'+comboN+'!');blip(760+comboN*6,1240,.2,.11,'triangle');vib(30);}}

/* ---------- 小地图 ---------- */
const mm=$('mm'),mmx=mm.getContext('2d'),mmBase=document.createElement('canvas');
function buildMinimap(){mmBase.width=mmBase.height=264;const m=mmBase.getContext('2d');const k=264/WORLD;
 m.fillStyle='#74975a';m.fillRect(0,0,264,264);
 m.fillStyle='#8cae62';m.fillRect(PARK.x*k,PARK.z*k,PARK.w*k,PARK.h*k);
 m.fillStyle='#a3a7ab';m.fillRect(0,0,3200*k,1000*k);
 m.fillStyle='#4b4f53';for(const rd of ROADS)m.fillRect(rd.x*k,rd.z*k,rd.w*k,rd.h*k);
 m.fillStyle='#3d7ea8';m.beginPath();m.arc(POND.x*k,POND.z*k,POND.r*k,0,7);m.fill();
 // 只烙地标。食物点以前也烙在这里,结果是一张"开局快照":吃掉的东西点还亮在原地,
 // 而颜色只有 tier,读不出"现在吃不吃得动"。实测 300 秒乱点吃了 39 件,底图仍留着 402 个开局点
 // ⇒ 玩得越好,假目标越多。食物点改到下面那层实时画。
 for(const o of objects) if(o.k==='landmark'){
  m.fillStyle='#ffd700';m.beginPath();m.arc(o.x*k,o.z*k,7,0,7);m.fill();
  m.strokeStyle='#fff';m.lineWidth=2;m.stroke();}}
/* 食物点层:位置只在被吃掉时变、颜色分类只在升级时变 ⇒ 只在 (等级,吞噬数) 变化时重画一次。
   每帧 400 个 arc 会把这块小窗格变成成本大户(小地图每帧都在画)。 */
const mmFood=document.createElement('canvas');mmFood.width=mmFood.height=264;
let foodVer='';
function drawFoodLayer(){const k=264/WORLD,m=mmFood.getContext('2d');
 m.clearRect(0,0,264,264);
 // 这块窗格只有 82 CSS 像素:把 400 件全画上去是一片颗粒,读不出"该往哪走"(放大截图看过才承认)。
 // 所以两类各留名额、按分值取前 N —— 而不是用分值门槛:
 // 门槛版在 LV.1 会把 1 分的花草全滤掉,于是新手抬头看地图,一个亮点都没有(实测那条臂 300 秒只点出 1 次)。
 /* 半径一律按"屏幕上看得见"定,不按物件真实尺寸:画布 264² 只印成 min(116px,21vw)(390px 手机 = 82 CSS px,
    ×0.31),旧的 Math.max(1.6,o.r*k*1.5) 下限折到屏幕只剩 1.36 CSS px 直径,而大楼按真实尺寸能长到 5.1 px
    ⇒ 图面上"卷不动"的墨占 5.7%、"卷得动"的只占 1.4%,最显眼的恰好是不该去的东西(实测三种场景同形)。
    MMSC = 1 个屏幕 px 等于几个画布 px,所以点的大小与手机/桌面的窗格尺寸解耦。 */
 const MMSC=264/(mm.clientWidth||116);
 const scr=r=>r*MMSC;                       // 屏幕 px → 画布 px
 const ed=[],lk=[];
 for(const o of objects){
  if(o.state!=='idle'||o.axis||o.k.indexOf('ped')===0||o.k==='landmark')continue;
  (o.tier<=level?ed:lk).push(o);}
 const take=(a,n,fill,rd)=>{a.sort((x,y)=>y.pts-x.pts);
  for(const o of a.slice(0,n)){m.fillStyle=fill;
   m.beginPath();m.arc(o.x*k,o.z*k,rd(o),0,7);m.fill();}};
 take(lk,24,'rgba(255,140,42,.45)',o=>Math.min(scr(1.2),Math.max(scr(.8),o.r*k*1.5)));  // 还得再长大:小且淡
 take(ed,64,'rgba(255,228,132,.95)',o=>Math.max(scr(1.7),o.r*k*1.5));}                  // 这等级卷得动:至少 3.4 CSS px,后画压在上面
function drawMinimap(){const S=mm.width,k=S/WORLD;
 mmx.clearRect(0,0,S,S);mmx.drawImage(mmBase,0,0);
 // 版本键必须带上窗格的显示宽度:点的大小是第 41 轮按"屏幕 px"换算的(MMSC=264/mm.clientWidth),
 // 而 #mm 是 min(116px,21vw) —— 手机转屏 82↔116 px 时 MMSC 变了,只认 (等级,吞噬数) 的话
 // 那一层会带着旧缩放继续用,点当场退回亚像素,要等下一次升级或吃掉东西才纠正过来。
 const fv=level+'|'+eaten+'|'+mm.clientWidth;
 if(fv!==foodVer){foodVer=fv;drawFoodLayer();}
 mmx.drawImage(mmFood,0,0);
 // 车流与行人实时动态点
 for(const o of objects){
  if(o.state!=='idle')continue;
  if(o.axis){mmx.fillStyle='#7ec8ff';mmx.beginPath();mmx.arc(o.x*k,o.z*k,1.8,0,7);mmx.fill();}
  else if(o.k.indexOf('ped')===0){mmx.fillStyle='#ffd1dc';mmx.beginPath();
   mmx.arc(o.x*k,o.z*k,1.4,0,7);mmx.fill();}}
 if(rival.visible){mmx.fillStyle='#ff5a4a';mmx.beginPath();
  mmx.arc(RV.x*k,RV.z*k,3.4,0,7);mmx.fill();
  mmx.strokeStyle='#fff';mmx.lineWidth=1;mmx.stroke();}
 // 雷达扫描线
 mmx.save();mmx.translate(T.x*k,T.z*k);
 const sweep=(time*.85)%6.2832;
 mmx.strokeStyle='rgba(120,220,255,.45)';mmx.lineWidth=1.5;
 mmx.beginPath();mmx.moveTo(0,0);
 mmx.lineTo(Math.cos(sweep)*S*.72,Math.sin(sweep)*S*.72);mmx.stroke();
 mmx.restore();
 const half=(500+T.r*5)*k,cx=T.x*k,cz=T.z*k;
 mmx.strokeStyle='rgba(255,255,255,.55)';mmx.lineWidth=2;
 mmx.strokeRect(cx-half,cz-half,half*2,half*2);
 mmx.fillStyle='#fff';mmx.beginPath();mmx.arc(cx,cz,5,0,7);mmx.fill();
 mmx.strokeStyle='rgba(255,255,255,.85)';mmx.lineWidth=1.5;
 mmx.beginPath();mmx.arc(cx,cz,8,0,7);mmx.stroke();}

/* ---------- 游戏流程 ---------- */
let phase='menu',score=0,eaten=0,level=1,startT=0,elapsed=0,time=0,last=0,
 shake=0,hitstop=0,funnelPulse=0,hintT=0,startBest=0,vx=0,vz=0,comboN=0,comboT=0,fovKick=0,runCombo=0,
 mode='campaign',rushT=0,rushEnded=false;
let best=0;try{best=+localStorage.getItem('tornadoBest')||0}catch(e){}
let rushBest=0;try{rushBest=+localStorage.getItem('tornadoBestRush')||0}catch(e){}
/* 成就统计(持久化) */
let stats={eaten:0,wins:0,maxCombo:0};
try{const s=JSON.parse(localStorage.getItem('tornadoStats'));if(s)stats=s}catch(e){}
function saveStats(){try{localStorage.setItem('tornadoStats',JSON.stringify(stats))}catch(e){}}
function statline(){$('statline').textContent=`累计吞噬 ${stats.eaten} · 通关 ${stats.wins} 次 · 最高连击 ×${stats.maxCombo}`;}
function renderHistory(){const el=$('history');if(!el)return;
 const h=stats.history||[];
 el.innerHTML=h.length?('<div style="font-size:10.5px;opacity:.5;letter-spacing:1px;margin-top:10px">最近战绩</div>'
  +h.map(r=>`<div style="font-size:11.5px;opacity:.75;margin-top:3px">${r.m} · ${r.s} 分 · ${fmt(r.t)}</div>`).join('')):'';}
/* ---------- 成就徽章 ---------- */
/* 门槛只有一份:数字写在 need 上,test() 与牌面文案都从它生成。
   以前 test 里手写一个数、牌面只写名字,于是玩家看见 3/8 却不知道剩下 5 条各要什么、自己差多远。
   c10 的 ×25 来历:probe47 用"拇指乱点"模型实测 3 局,连击峰值 ×15/×16,×10 那条在 2.5 秒就白送;
   ×25 既高于乱点一局的上限,又正对上游戏自己的里程碑横幅第三档(5/10/25/50),认真吃一局能到 ×460。 */
const ACHV=[
 {id:'e50', icon:'🌼', name:'初级饕餮', field:'eaten', need:50, unit:'件'},
 {id:'e200', icon:'🌪️', name:'饕餮之王', field:'eaten', need:200, unit:'件'},
 {id:'w1', icon:'🏆', name:'弑塔者', field:'wins', need:1, unit:'次通关'},
 {id:'w5', icon:'👑', name:'风暴常客', field:'wins', need:5, unit:'次通关'},
 {id:'c10', icon:'⚡', name:'连击大师', field:'maxCombo', need:25, unit:'连'},
 {id:'e1000', icon:'🌪️', name:'千物斩', field:'eaten', need:1000, unit:'件'},
 {id:'cb1', icon:'🔴', name:'宿敌克星', field:'comebacks', need:1, unit:'次反超'},
 {id:'r5', icon:'⏱', name:'挑战者', field:'rushPlays', need:5, unit:'局限时'},
].map(a=>(a.test=s=>(+s[a.field]||0)>=a.need,a.prog=s=>Math.min(+s[a.field]||0,a.need),a));
if(!stats.achv)stats.achv={};
function renderAchv(){const el=$('achv');
 const got=ACHV.filter(a=>stats.achv[a.id]).length;
 el.innerHTML=`<div style="width:100%;font-size:11px;opacity:.6;letter-spacing:2px;margin-bottom:2px">🏅 成就 ${got}/${ACHV.length}</div>`
  +ACHV.map(a=>{const on=stats.achv[a.id],p=a.prog(stats);
  // 牌面写"已 X/门槛":只有门槛的话,玩家分不清自己差 1 件还是差 40 件;分子与 test 同取 a.field
  return `<span class="ach${on?' on':''}" title="${a.name} · 已 ${p}/${a.need}${a.unit}">${a.icon} ${a.name}<em>${p}/${a.need}${a.unit}</em></span>`;}).join('');
 if($('moreBtn'))$('moreBtn').textContent=moreSummary();}
function checkAchv(){let newly=null;
 for(const a of ACHV){if(!stats.achv[a.id]&&a.test(stats)){
  stats.achv[a.id]=true;newly=a;}}
 if(newly){saveStats();renderAchv();showHint(`🏅 成就解锁:${newly.name}!`,2600);}}
let hintTO=null,lockHintT=0;
/* 下一级解锁了什么:直接告诉玩家该去找什么吃 */
/* 这座塔在当前模式卷不卷得动 —— 唯一真相。无尽/雪原(雪原复用 endless 的 mode 位)按设计
   卷不动,限时卷得动但不结算。满级文案、锁圈、撞上去的解说三处都问它,不许各写一份规则。 */
function towerEdible(){return mode!=='endless'}
/* 这行的文案按"能不能被折行劈开"切成片段:[文本, 段内不许断行?]。
   320px 手机上盒子只有 86px(一行的容量 ≈8 个字),实测断点会落在词中间:
   「还差128分 · 下一」/「级解锁:大楼」、「🏆 去卷碎黄金电」/「视塔!」—— 玩家读出来的是半截词。
   断点只留在 ' · ' 那道缝上,而 ' · ' 自己必须是可折的普通文本:实测把带前导空格的整块(' · 满级后')
   钉成 nowrap 时,Chromium 不肯在两块之间换行,宁可让第一行溢出盒子 6~8px 被 overflow:hidden 裁掉尾巴。
   文案缩成「解锁:」是为了第二行连同物件名装得下,不然这行要占三行(盒子容量决定,不是我想少说话)。 */
function unlockParts(){
 if(level>=8)return towerEdible()?[['🏆 去卷碎',1],['黄金电视塔!',1]]
  :[['♾️ 满级:',1],['城市会长回来',1]];   // 不说"刷大件":320px 上这行要占三行,HUD 实测 104px > 96px 上限;
                                        // 怎么刷由 LV.7 那句「满级后随便卷」承担,这里只留"会重生"这条机制信息
 const ks=[...new Set(TYPES.filter(t=>t.tier===level+1&&
  !/^ped/.test(t.k)&&t.k!=='landmark').map(t=>KINDNAMES[t.k]||t.k))];
 const nm=ks.slice(0,1).join('·');              // 只报一样 + 数字:名字必须整块出现(见 unlockParts 的 nb)
 const gap='还差'+Math.max(0,Math.ceil(TH[level]-score))+'分';
 /* LV.7 这行的算术:320px 盒子 ≈86px(一行 ≈8 个字)、HUD 上限 96px = 只许两行,而第一行被"还差 N 分"吃掉 55~68px
    ⇒ 尾巴最多 7 个字。verify17 Y5 要求这行同时出现"电视塔"与"通关"(砍'通关'被它当场抓住:那是唯一说"这局会结束"的字),
    所以不是删词而是压短:去掉定语'黄金'(全名在 LV.8 那句和锁圈提示里都在),留「卷电视塔通关」6 字
    ⇒ 320 两行、390 一行(Y7 要求 390 下这行不许折)。 */
 if(level>=TH.length-1)return towerEdible()
  ?[[gap,1],[' · '],['卷电视塔'+(mode==='campaign'?'通关':''),1]]
  :[[gap,1],[' · '],['满级后随便卷',1]];
 // 进度条只说"到哪儿了",不说"还差多少";把阈值写成数字,不用猜格子还剩几格
 return [[gap,1],[' · '],['解锁:',1],[nm||'更大的目标',1]];}
function nextUnlock(){return unlockParts().map(p=>p[0]).join('')}
/* nextUnlock 仍是纯文本:台架读它,el.textContent 比对的也是它 —— 一份措辞两个出口,不会走偏。 */
function showUnlock(){const ps=unlockParts(),el=$('nextlv'),
 t=ps.map(p=>p[0]).join('');
 if(el.textContent!==t){el.innerHTML=ps.map(([s,nb])=>
  nb?'<span class="nb">'+s+'</span>':s).join('');hudH();}}   // 分数一变就要重写"还差几分";这行长数变了,HUD 高度就变了
/* ---------- 新手引导:每步要达成才推进,玩过的人不再教 ---------- */
const TUT=[
 {t:'点一下或按住拖动,风柱会跟着走',ok:()=>tutMoved>250},
 {t:'先吃 5 件小花小草,分数会开始涨',ok:()=>eaten>=5},   // 别说"变大":LV.2 要 12 分,吃 5 件还不会变大
 {t:'带圈的是现在吃不动的,先绕开',ok:()=>lockSeen>0},    // 撞上一次锁圈就算学会,不必等到升级那一刻
 {t:'继续吃,长大就能卷汽车和树了',ok:()=>ateBig>0},      // 真卷起第一件 tier≥3 才算数,而不是"到了 LV.3"
 {t:'右下角金点是电视塔,卷它要 LV.8',ok:()=>level>=8,max:120}];   // 末级要等 LV8,曲线拉长后 45 秒兜底会把 ✓ 提前打上
let tutStep=0,tutOn=false,tutMoved=0,tutLastX=0,tutLastZ=0,tutHold=0,tutAge=0,lockSeen=0,ateBig=0,tutEsc=0;
function tutActive(){return tutOn&&phase==='play'&&mode==='campaign'&&tutStep<TUT.length}
function showTut(){const el=$('tut');
 if(!tutActive()){el.classList.remove('on');el.classList.remove('done');return;}
 el.classList.add('on');el.classList.toggle('done',tutHold>0);
 $('tutn').textContent=tutStep+1;
 $('tutt').textContent=(tutHold>0?(tutEsc?'⏭ ':'✓ '):'')+TUT[tutStep].t;}
function tutTick(dt){
 if(!tutActive())return;
 tutMoved+=Math.hypot(T.x-tutLastX,T.z-tutLastZ);tutLastX=T.x;tutLastZ=T.z;
 if(tutHold>0){tutHold-=dt;if(tutHold<=0)showTut();return;}
 tutAge+=dt;
 const earned=TUT[tutStep].ok();               // ✓ 只发给真做到的那一步
 if(earned||tutAge>(TUT[tutStep].max||45)){   // 卡住也要放行,别让引导变成路障
  tutEsc=earned?0:1;tutHold=.9;chime();showTut();tutStep++;tutAge=0;
  if(tutStep>=TUT.length){tutOn=false;setTimeout(showTut,950);}}}
function startTutorial(){
 tutOn=!(stats.runs>0);              // 老玩家不再被教一遍
 stats.runs=(stats.runs||0)+1;saveStats();
 tutStep=0;tutMoved=0;tutLastX=T.x;tutLastZ=T.z;tutHold=0;tutAge=0;lockSeen=0;ateBig=0;tutEsc=0;showTut();}
function showHint(txt,dur){
 if(hintTO&&$('hint').style.opacity=='1'&&$('hint').textContent===txt)return; // 同文连弹去重
 $('hint').textContent=txt;$('hint').style.opacity=1;
 clearTimeout(hintTO);hintTO=setTimeout(()=>$('hint').style.opacity=0,dur||2200);}
function clearMsgs(){clearTimeout(hintTO);hintTO=null;hintT=0;
 const h=$('hint');if(h){h.style.opacity=0;h.textContent='';}
 const b=$('banner');if(b)b.classList.remove('show');}
function banner(txt){const b=$('banner');b.textContent=txt;b.classList.remove('show');
 void b.offsetWidth;b.classList.add('show');}
function fmt(s){s=Math.max(0,s);const m=(s/60)|0,ss=(s%60)|0;return m+':'+String(ss).padStart(2,'0');}
/* 本局用时那一格:游玩中由 update() 写,暂停/结算这些 update() 不再跑的时刻由写状态的人自己来叫 ——
   两处共用一个出口,免得暂停屏说 0:05 而 HUD 还停在 0:02(实测改前正是这样)。 */
function showClock(){const el=$('clockv');if(!el)return;const t=fmt(elapsed);if(el.textContent!==t)el.textContent=t;}
/* 两行「最佳」读数由写它的人负责重画 —— 同一个文件里 pushHistory() 就是自己调 renderHistory() 的。
   以前只有 boot 那一次进 DOM:破了限时纪录回主菜单,「⏱ 挑战最佳」还停在上一局的数,要刷新页面才对得上;
   而 win() 又用自己的话把 #best 改写成「最高分」,同一个元素在刷新前后是两句说法。
   名字也从"闯关"改成"单局":consume() 在闯关/夜城/无尽/雪原/限时(结算前)五种局里都会抬高这个数。 */
function renderBests(){
 $('best').textContent='🏆 单局最佳 '+best;
 $('bestRush').textContent='⏱ 挑战最佳 '+rushBest;}
function saveBest(){try{localStorage.setItem('tornadoBest',best)}catch(e){}renderBests();}
/* ---------- 存档续玩 ---------- */
const SKEY='tornadoRun';
let destroyedIds=[],scarList=[],stumpList=[],saveCool=0,retired=0;
/* 写失败以前被 catch(e){} 整个吞掉:实测装上"setItem 抛 QuotaExceededError"之后,
   局内 203 分、盘上还是 3 分,而暂停卡照旧说「进度已存档,回主菜单可点「▶ 继续上次」」——
   那句话承诺的动作根本没发生。saveRun 现在把结果说出来,psaveText 照着讲。
   (iOS 隐私模式、站点数据被禁、配额满,真机上都会走到 catch 这一支。) */
let saveFailed=false;
function saveRun(){if(retired||(phase!=='play'&&phase!=='paused')||mode!=='campaign')return null; // 退役的局:免费探索也不许再写回来
 try{localStorage.setItem(SKEY,JSON.stringify({v:1,seed:citySeed,
  d:destroyedIds.slice(-800),sc:scarList.slice(-50),st:stumpList.slice(-60),
  w:wrecks.filter(w=>w.landed).slice(-60).map(w=>[w.k,
   +w.m.position.x.toFixed(0),+w.m.position.y.toFixed(1),+w.m.position.z.toFixed(0),
   +w.m.rotation.x.toFixed(2),+w.m.rotation.z.toFixed(2),
   +w.m.scale.x.toFixed(2),+w.m.scale.y.toFixed(2),+w.m.scale.z.toFixed(2)]),
  rs:RV.score,rx:Math.round(RV.x),rz:Math.round(RV.z),
  score,eaten,cb:runCombo,n:isNight?1:0,px:Math.round(T.x),pz:Math.round(T.z),t:Math.round(elapsed)}));
  saveFailed=false;return true}catch(e){saveFailed=true;return false}}
function loadRun(){try{return JSON.parse(localStorage.getItem(SKEY))}catch(e){return null}}
function clearRun(){retired=1;destroyedIds=[];scarList=[];stumpList=[];
 try{localStorage.removeItem(SKEY)}catch(e){}}
function renderCont(){const s=loadRun(),el=$('cont');if(!el)return;
 const on=!!(s&&s.seed);el.style.display=on?'block':'none';
 if(on)el.textContent='▶ 继续上次 · '+MODES[s.n?'night':'campaign'].nm; // 名字取自 MODES,这里不抄字面量
 cardFade();} // 这一行亮起来会把卡片撑高 33~54px,"下面还有"的内阴影线索必须跟着重算(实测旧写法漏算)
function continueGame(){const s=loadRun();if(!s||!s.seed)return startGame();
 reset(s.seed);mode='campaign';
 // 夜城的 mode 字符串就是 'campaign',所以续玩必须自己把夜装回来 ——
 // 实测改前:同一座城、同一份分数回来了,而 isNight/雾色/曝光/半球光/太阳色/nightK 十项全掉回白天
 isNight=!!s.n;applyNight();
 $('timerbox').style.display='none';
 const ds=new Set(s.d||[]);
 for(const o of objects){if(ds.has(o.id)){o.state='gone';o.node.visible=false;}}
 for(const sc of (s.sc||[]))addScar(sc[0],sc[1],sc[2]);
 for(const st of (s.st||[]))addStump(st[0],st[1]);
 score=s.score||0;eaten=s.eaten||0;runCombo=s.cb||0;   // 续玩要接上本局连击峰值,否则结算卡会低估这一局
 for(const wv of (s.w||[])){
  const pool=POOLS.find(pp=>pp.k===wv[0])||POOLS[0];
  const m=new THREE.Mesh(pool.geo,pool.mat);
  m.position.set(wv[1],wv[2],wv[3]);m.rotation.set(wv[4],0,wv[5]);
  m.scale.set(wv[6],wv[7],wv[8]);m.castShadow=true;scene.add(m);
  wrecks.push({m,vy:0,rv:0,rest:wv[2],landed:true,shared:true});}
 if((s.rs||0)>0){RV.score=s.rs;RV.x=s.rx;RV.z=s.rz;rival.visible=true;}
 destroyedIds=(s.d||[]).slice();scarList=(s.sc||[]).slice();stumpList=(s.st||[]).slice();
 T.x=T.tx=s.px;T.z=T.tz=s.pz;camT.set(T.x,300,T.z+480);lookT.set(T.x,0,T.z);
 camera.position.set(T.x+320,300,T.z+460);
 phase='play';startT=performance.now()/1000-s.t;
 $('menu').classList.add('hidden');$('win').classList.add('hidden');
 $('pause').classList.add('hidden');setChrome(true);lockHintT=5;
 tutOn=false;showTut();          // 回来续玩的人是老玩家,不再教
 showHint('欢迎回来,继续毁灭吧!',2600);}

function colsOf(o){const cs=[];o.node.traverse(c=>{
 if(c.isMesh&&c.material&&c.material.color)cs.push(c.material.color.getHex());});
 return cs.length?cs:[0x9a9a9a];}
function burstCols(kind,cs,n){spawnDebris(kind,cs,n);}
function levelUp(){$('lvname').textContent='LV.'+level+' · '+LVN[level-1];
 for(const o of objects)o.locked=0;lockHintT=1.2;showUnlock(); // 升级后允许重新解释一次
 banner('升级!LV.'+level+' '+LVN[level-1]);chime();vib(60);burstCols('concrete',null,12);statline();saveRun();}
const KINDNAMES={landmark:'黄金电视塔',car:'汽车',bus:'公交',truck:'卡车',house_s:'房子',house_b:'大宅',bld_m:'大楼',bld_l:'高楼',sky:'摩天楼',tree_s:'树木',tree_b:'大树',bush:'灌木',flower:'花',grass:'草',rock:'石块',boulder:'巨岩',bench:'长椅',lamp:'路灯',trash:'垃圾桶',bike:'单车',water:'水塔',ped:'行人',pedbike:'骑车人',pedcrouch:'市民',palm:'棕榈',umbrella:'遮阳伞',snowman:'雪人',skier:'滑雪者'};
let kindStats={};
function consume(o){score+=o.pts;eaten++;stats.eaten++;kindStats[o.k]=(kindStats[o.k]||0)+1;
 if(comboN>stats.maxCombo)stats.maxCombo=comboN;
 if(comboN>runCombo)runCombo=comboN;   // 本局峰值:结算卡要说"这一局"的连击,不是账号累计的
 if(score>best&&!(mode==='rush'&&rushEnded)){best=score;saveBest();}
 // ↑ 限时挑战结算之后点「继续闲逛」的那段没有时间限制,不该再把全局最高分抬上去
 // (实测:4671 分结算 → 闲逛 75 秒到 8384,而"挑战最佳"停在 4669,两个数自相矛盾)
 checkAchv();
 comboN=comboT>0?comboN+1:1;comboT=2.2;
 ftext(T.x,150*Math.pow(T.r/26,.75)*.7,T.z,'+'+o.pts,o.pts);
 burstCols(POOLMAP[o.k]||'concrete',colsOf(o),1+((Math.random()*2)|0));
 if(o.tier<=2)popSnd(o);else crackSnd(POOLMAP[o.k]||'concrete');
 if(o.tier>=3){
  ateBig=1;                                     // 引导第 4 步的证人:真卷起过一件大件
  const ratio=Math.min(1,o.r/Math.max(1,T.r)); // 相对自己有多大,而不是绝对半径
  shake=Math.min(1,shake+.16+ratio*.5);
  if(!reduceMotion)hitstop=Math.min(.22,.03+ratio*.05);
  funnelPulse=Math.min(.3,.07+ratio*.2);
  vibTier(o.tier);fovKick=6;}
 if(o.k==='landmark'&&mode==='campaign')win();
 if(o.k==='landmark'&&mode==='endless'){o.state='idle';o.t=0;}}
function endRush(){phase='win';pushHistory(runLabel(),score,120-rushT);
 const bgUrl2=snapshotCity();setWinBg(bgUrl2);lastRuinUrl=bgUrl2;
 const pre2=new Image();pre2.src=bgUrl2;
 const rec=score>rushBest;
 if(rec){rushBest=score;
  try{localStorage.setItem('tornadoBestRush',rushBest)}catch(e){}
  renderBests();} // 破纪录的这一刻就重画:菜单不许等到刷新页面才认账
 $('winTitle').textContent='⏱ 时间到!';
 $('stats').innerHTML='<div class="st"><b>'+score+'</b><span>本局得分</span></div>'+
  '<div class="st"><b>'+eaten+'</b><span>吞噬物件</span></div>'+
  '<div class="st"><b>'+rushBest+'</b><span>挑战最佳</span></div>'+kindLine();
 $('rec').style.display=rec?'block':'none';
 lastIsRecord=rec;
 $('timerbox').style.display='none';
 $('rushgoal').style.display='none'; // 结算屏不再报目标:update() 到 phase='win' 就不跑了,谁写下这个状态谁负责收
 $('win').classList.remove('hidden');
 saveStats();}

function kindLine(){const top=Object.entries(kindStats).sort((a,b)=>b[1]-a[1]).slice(0,4);
 // 结算卡只有三格:明细这行小字也住在同一个 flex 行里,不给它 width:100% 让它自己占一行,
 // 它就会按 min-content 把三个格子挤扁(实测每格 38~49px,"本局得分"这种四字标签被迫折两行,
 // 390 与 844 视口一样)。第 25 轮把它记成"第四格太挤",本轮量出真机制后由 .stats 的 flex-wrap 配合解决。
 const parts=top.length?['摧毁:'+top.map(([k,n])=>(KINDNAMES[k]||k)+'×'+n).join(' · ')]:[];
 if(runCombo>=3)parts.push('最高连击 ×'+runCombo);
 return parts.length?'<div style="width:100%;font-size:12px;opacity:.8;margin:4px 0 10px;line-height:1.7">'
  +parts.join(' · ')+'</div>':'';}

function pushHistory(m,sc,secs){if(!stats.history)stats.history=[];
 stats.history.unshift({m,s:sc,t:Math.round(secs)});
 stats.history=stats.history.slice(0,5);saveStats();
 // 记完就要在菜单上看得见:renderHistory 以前只在开机跑一次,于是"最近战绩"里
 // 那一局永远要刷新页面才出现 —— 而"我刚才那局去哪了"正是这条要回答的问题
 renderHistory();if($('moreBtn'))$('moreBtn').textContent=moreSummary();}
function genShareCard(bgUrl){
 const cv2=document.createElement('canvas');cv2.width=600;cv2.height=840;
 const g=cv2.getContext('2d');
 const bg=g.createLinearGradient(0,0,0,840);
 bg.addColorStop(0,'#16211a');bg.addColorStop(1,'#0a0f0b');
 g.fillStyle=bg;g.fillRect(0,0,600,840);
 if(bgUrl){try{const im2=new Image();
   im2.src=bgUrl;
   // 同步绘制(若已解码)否则跳过——保证不阻塞
   if(im2.complete&&im2.naturalWidth){g.drawImage(im2,16,16,568,290);
    const shade=g.createLinearGradient(0,16,0,306);
    shade.addColorStop(0,'rgba(10,15,11,.25)');shade.addColorStop(1,'rgba(10,15,11,.85)');
    g.fillStyle=shade;g.fillRect(16,16,568,290);}}catch(e){}}
 g.strokeStyle='rgba(255,215,94,.4)';g.lineWidth=3;g.strokeRect(14,14,572,812);
 if(lastIsRecord){ // 新纪录绶带
  g.save();g.translate(472,86);g.rotate(Math.PI/10);
  g.fillStyle='#ffd75e';g.fillRect(-88,-26,176,52);
  g.fillStyle='#4a2b00';g.font='900 26px system-ui';g.textAlign='center';
  g.fillText('新纪录!',0,9);g.restore();}
 g.textAlign='center';
 const y0=bgUrl?330:110; // 有图时内容下移
 g.fillStyle='#ffd75e';g.font='900 44px system-ui,sans-serif';
 g.fillText('🌪️ 龙卷风大作战',300,y0);
 g.fillStyle='rgba(255,255,255,.4)';g.font='600 20px system-ui';
 g.fillText('TORNADO BATTLE 3D',300,y0+36);
 g.fillStyle='#fff';g.font='900 110px system-ui';
 g.fillText(String(score),300,y0+150);
 g.fillStyle='rgba(255,255,255,.5)';g.font='600 24px system-ui';
 g.fillText('最终得分 · LV.'+level+' '+LVN[level-1],300,y0+192);
 g.strokeStyle='rgba(255,255,255,.15)';g.lineWidth=1;
 g.beginPath();g.moveTo(80,y0+225);g.lineTo(520,y0+225);g.stroke();
 g.fillStyle='rgba(255,255,255,.85)';g.font='600 26px system-ui';
 // 战报卡上原本没有模式:夜城/雪原/限时那一局的卡与闯关长得一模一样,分享出去之后连自己都分不出
 // 这是哪条路(和第 23 轮"历史里夜城被记成闯关"同一族)
 g.fillText(runLabel()+' · 吞噬 '+eaten+' 件 · 用时 '+fmt(elapsed),300,y0+262);
 const top=Object.entries(kindStats).sort((a,b)=>b[1]-a[1]).slice(0,3);
 g.font='600 24px system-ui';g.fillStyle='rgba(255,215,94,.9)';
 top.forEach(([k,n],i)=>{g.fillText((KINDNAMES[k]||k)+' ×'+n,300,y0+310+i*38);});
 g.fillStyle='rgba(255,255,255,.35)';g.font='500 18px system-ui';
 // 页脚往下挪:带截图的卡上 y0=330,摧毁列表三项的基线在 640/678/716,原来日期写在 700
 // 那一条会与第三项的字身位重叠(24px 字从 ~696 起)
 g.fillText(new Date().toLocaleDateString('zh-CN'),300,740);
 g.fillStyle='rgba(255,255,255,.25)';g.font='500 15px system-ui';
 g.fillText('WebGL · 单文件 · V'+VER,300,780);
 const url=cv2.toDataURL('image/png');
 $('shareImg').src=url;
 // 按钮上写的是「📥 生成战报卡」,可实测浮层里一个下载把手都没有:图只能看不能拿走,
 // 📥 承诺的那个动作在实现里不存在(桌面要靠右键另存、手机要靠长按图片,两个都不写在屏幕上)
 const a=$('saveCard');if(a){a.href=url;a.download='龙卷风战报-'+runLabel()+'-'+score+'分.png';}
 $('shareLayer').classList.remove('hidden');}
function snapshotCity(){
 const op=camera.position.clone(), ol=lookT.clone();
 camera.position.set(T.x+850,880,T.z+850);
 camera.lookAt(T.x,0,T.z);camera.updateMatrixWorld();
 renderer.render(scene,camera);
 const url=renderer.domElement.toDataURL('image/jpeg',.72);
 camera.position.copy(op);camera.lookAt(ol);
 return url;}
function setWinBg(url){$('win').style.backgroundImage=
 'radial-gradient(ellipse at 50% 38%,rgba(12,20,15,.55),rgba(5,9,7,.93) 78%),url('+url+')';}
function win(){phase='win';stats.wins++;pushHistory(runLabel(),score,elapsed);saveStats();statline();checkAchv();
 clearRun(); // 通关的这局不该再出现在「▶ 继续上次」里
 fovKick=14; // 结局慢推镜头
 for(const bm of BLD)bm.emissiveIntensity=2.0; // 全城窗灯齐闪
 burstCols('metal',[0xffd75e],14);burstCols('wood',[0xf2f2e8],10); // 彩带连发

 const bgUrl=snapshotCity();
 $('winTitle').textContent='城市上天啦';
 const rec=score>startBest;
  fanfare();vibTier(8);
  burstCols('metal',[0xd9b23c],8);burstCols('concrete',[0xf2f2f2],12);burstCols('leaf',[0x7dbb4f],10);
 setTimeout(()=>{if(phase!=='win')return;
  $('stats').innerHTML='<div class="st"><b>'+fmt(elapsed)+'</b><span>总用时</span></div>'+
   '<div class="st"><b>'+eaten+'</b><span>吞噬物件</span></div>'+
   '<div class="st"><b>'+score+'</b><span>最终得分</span></div>'+kindLine();
  $('rec').style.display=rec?'block':'none';
  lastIsRecord=rec;
  setWinBg(bgUrl);lastRuinUrl=bgUrl;
  const pre=new Image();pre.src=bgUrl; // 预解码,分享时同步可绘
  $('win').classList.remove('hidden');},1400);}
function reset(seed){score=0;eaten=0;level=1;elapsed=0;startBest=best;kindStats={};runCombo=0;
 comboN=0;comboT=0;comboShown=0;   // 新局不许继承上一局的连击链(实测:再玩一次那一刻 HUD 仍挂着 ×164)
 for(const o of objects)disposeNode(o.node);
 for(const f of fts)f.el.remove();fts.length=0;
 for(const s of scars){scene.remove(s);s.traverse(c=>{if(c.geometry)c.geometry.dispose();});}
 scars.length=0;
 for(const w of wrecks){scene.remove(w.m);if(!w.shared&&w.m.geometry)w.m.geometry.dispose();}
 wrecks.length=0;destroyedIds=[];scarList=[];stumpList=[];saveCool=0;retired=0; // 新局:冷却与退役位都要重来
 RV.score=0;RV.lvl=1;RV.r=20;RV.x=2400;RV.z=600;RV.tgt=null;RV.retarget=0;rival.visible=false;
 for(const pool of POOLS){
  for(let i=0;i<pool.dinf.length;i++)pool.dinf[i].on=false;
  for(let i=0;i<pool.dinf.length;i++){_e.set(0,0,0);_q.setFromEuler(_e);_s.set(0,0,0);
   _m4.compose(_p3.set(0,-500,0),_q,_s);pool.mesh.setMatrixAt(i,_m4);
   pool.mesh.setColorAt(i,_col.set(0xffffff));}
  pool.mesh.instanceMatrix.needsUpdate=true;
  pool.mesh.instanceColor.needsUpdate=true;}
 T.x=T.tx=760;T.z=T.tz=2640;T.r=26;
 shake=0;hitstop=0;funnelPulse=0;hintT=0;vx=0;vz=0;
 camera.position.set(T.x+320,300,T.z+480);
 clearProbe();
 citySeed=(seed==null)?((Math.random()*1e9)|0):seed;
 withSeed(citySeed,()=>{spawnAll();});
 setupProbe();
 buildMinimap();startT=performance.now()/1000;clearMsgs();
 $('lvname').textContent='LV.1 · '+LVN[0];$('fill').style.width='0%';showUnlock();}
function startGame(m,night,snow){clearRun();mode=m||'campaign';isNight=!!night;isSnow=!!snow;
 lastStart={m:mode,night:isNight,snow:isSnow};
 applyNight();if(mode==='rush'){stats.rushPlays=(stats.rushPlays||0)+1;saveStats();checkAchv();}
reset();applySnow();phase='play';saveStats();statline();
 rushEnded=false;rushT=mode==='rush'?120:0;
 $('timerbox').style.display=(mode==='rush')?'block':'none';
 $('timerbox').classList.remove('danger');
 $('timerbox').textContent='⏱ 2:00';
 $('menu').classList.add('hidden');$('win').classList.add('hidden');
 $('pause').classList.add('hidden');setChrome(true);
 lockHintT=(mode==='campaign')?8:3; // 开局先让玩家吃明白,不急着解释吃不动的
 startTutorial();
 if(!tutActive())showHint(mode==='rush'?'⏱ 2 分钟,卷出最高分!'
   :mode==='endless'?'♾️ 物件会不断重生,尽管拼高分!':'先去吃花花草草,把自己吃大!',2600);}
/* ---------- 模式选择:五个模式各有目标,选完在"开始"上说明白 ---------- */
const MODES={
 campaign:{m:'campaign',n:false,s:false,nm:'闯关',
  tip:'目标:卷碎黄金电视塔就通关。进度每 4 秒自动存档,中途可续玩。'},
 rush:{m:'rush',n:false,s:false,nm:'限时',
  tip:'目标:2 分钟内卷出最高分。时间到立刻结算,本模式不存档。'},
 endless:{m:'endless',n:false,s:false,nm:'无尽',
  tip:'吃掉的物件会在远处重生,城市永不枯竭,一直拼高分。电视塔卷不动。'},
 night:{m:'campaign',n:true,s:false,nm:'夜城',
  tip:'目标同闯关,但全城入夜:路灯和窗灯是主要光源,能看清的范围更小。'},
 snow:{m:'endless',n:false,s:true,nm:'雪原',
  tip:'目标同无尽,换成雪城:风暴越大雪雾越浓,满级时几乎看不见路。'}};
let pick='campaign';
function setPick(k){if(!MODES[k])return;pick=k;CFG.mode=k;saveCfg(); // 选模式这件事也归 CFG 那条通道管
 for(const c of document.querySelectorAll('#modes .chip'))
  c.classList.toggle('on',c.dataset.k===k);
 $('modeinfo').textContent=MODES[k].tip;
 $('start').textContent='开始游戏 · '+MODES[k].nm;cardFade();}
$('start').onclick=()=>{audioUnlock();if(AC&&AC.state==='suspended')AC.resume();
 const t=MODES[pick];startGame(t.m,t.n,t.s);};
$('cont').onclick=()=>{audioUnlock();if(AC&&AC.state==='suspended')AC.resume();continueGame();};
function moreSummary(){const got=ACHV.filter(a=>stats.achv[a.id]).length;
 return ($('more').classList.contains('open')?'▾ ':'▸ ')+'成就 '+got+'/'+ACHV.length+
  ' · 最近 '+(stats.history||[]).length+' 局';}
$('moreBtn').onclick=()=>{$('more').classList.toggle('open');
 $('moreBtn').textContent=moreSummary();setTimeout(cardFade,360);};
function initHowto(){const touch=matchMedia('(pointer:coarse)').matches;
 $('howto').innerHTML=(touch?
   '<p><em>👆</em>点一下想去的方向,或按住拖动;风柱露在指尖上方</p>':
   '<p><em>🖱️</em>按住鼠标拖动,或用 WASD / 方向键</p>')+
  '<p><em>🌼</em>先吃小花小草石头,越吃越大</p>'+
  '<p><em>🚗</em>长大后,汽车、房子全都能卷上天</p>'+
  // 小地图那两层点没有图例就没有含义;这行把"亮/暗"和场景里的琥珀锁圈挂成同一套语言。
  // 行数不许增加:第 5A 轮的"不滚也能玩"是拿 0px 余量换来的,加一行就把菜单顶出首屏。
  '<p><em>🔒</em>吃不动的:场景里亮琥珀圈,地图上是暗点</p>';}
/* 卡片还能往下滚时,给它一道内阴影当"下面还有"的线索。
   两处滚动容器:#menu 的卡整卡在滚,#settings 从第 42 轮起只有 .setbody 在滚(出口不跟着滚)。 */
const FADERS=()=>['#menu .card','#settings .setbody'].map(s=>document.querySelector(s)).filter(Boolean);
function cardFade(){for(const c of FADERS())c.classList.toggle('scrolly',
 c.scrollHeight>c.clientHeight+4 && c.scrollTop+c.clientHeight<c.scrollHeight-6);}
for(const c of FADERS())c.addEventListener('scroll',cardFade);
addEventListener('resize',cardFade);
$('foot').textContent='龙卷风大作战 3D · V'+VER;
$('again').onclick=()=>startGame(lastStart.m,lastStart.night,lastStart.snow);
let lastRuinUrl=null;
let lastIsRecord=false;
$('share').onclick=()=>genShareCard(lastRuinUrl);
$('shareClose').onclick=()=>$('shareLayer').classList.add('hidden');
$('free').onclick=()=>{$('win').classList.add('hidden');phase='play';startT=performance.now()/1000-elapsed;
 // 闲逛段要看得出现在是闲逛:计时的盒子回来报"已结束",而不是凭空消失
 if(mode==='rush'&&rushEnded){const tb=$('timerbox');tb.style.display='block';
  tb.classList.remove('danger');tb.textContent='⏱ 已结束 · 不计纪录';}};

/* ---------- 暂停 / 回菜单 ---------- */
let lastStart={m:'campaign',night:false,snow:false},pauseAt=0;
/* 模式名只有一个来源:写"最近战绩"、暂停卡上的「重新开始」、存档提示都问它。
   以前 win() 里写死 '闯关',于是夜城那一局在历史里和闯关长得一模一样(实测历史行
   "闯关·1681分·23s" 其实是夜城)。 */
function runLabel(){return mode==='rush'?'限时挑战':mode==='endless'?(isSnow?'雪原':'无尽'):(isNight?'夜城':'闯关')}
function setChrome(on){$('hud').classList.toggle('off',!on);$('mm').classList.toggle('off',!on);
 $('timerbox').classList.toggle('off',!on);$('rvpill').classList.toggle('off',!on);}
function psaveText(){if(mode!=='campaign')return mode==='rush'
  ?'限时模式不存档,重新开始会清空本局':'该模式不存档,回主菜单会把这一局记进「最近战绩」';
 // 存不上的时候不许说"已存档" —— 那句话承诺的动作在设备上根本没发生:
 // 实测装上写失败后,局内 203 分、盘上仍是 3 分,而菜单照样给出「▶ 继续上次」,点进去是更早的一局。
 if(saveFailed)return '⚠ 这台设备没能存下这一局(浏览器禁止保存或空间已满)'
  +(loadRun()?'；「继续上次」只会回到更早的进度':'；回主菜单也不会有「▶ 继续上次」');
 return '进度已存档,回主菜单可点「▶ 继续上次」';}
/* 「重新开始」过去是一键毁档:实测点一次之后存档键消失、分数 64→0、卷掉的城市重新长回来,
   而竖屏暂停卡上它离「继续游戏」只有 59px。首点现在只把按钮变成待确认,二点才真重开。 */
let armTO=0;
function disarmRestart(){const el=$('prestart');clearTimeout(armTO);armTO=0;
 if(el&&el.dataset.armed){delete el.dataset.armed;el.textContent='重新开始 · '+runLabel();
  $('psave').textContent=psaveText();}}
function pauseGame(){if(phase!=='play')return;
 disarmRestart();       // 每次打开暂停屏都从"一步"开始,不许留着上一次的待确认态
 phase='paused';pauseAt=performance.now()/1000;saveRun();
 // 暂停这一刻 HUD 那格也要跟上:update() 在暂停后不再跑,不补这一刀就会出现"暂停屏 0:05 / HUD 0:02"
 showClock();
 $('pstats').innerHTML='<div class="st"><b>'+score+'</b><span>当前得分</span></div>'+
  '<div class="st"><b>'+eaten+'</b><span>已吞噬</span></div>'+
  '<div class="st"><b>'+fmt(elapsed)+'</b><span>已用时</span></div>';
 $('psave').textContent=psaveText();
 $('prestart').textContent='重新开始 · '+runLabel();
 $('pause').classList.remove('hidden');}
function resumeGame(){if(phase!=='paused')return;disarmRestart();
 $('pause').classList.add('hidden');
 startT+=performance.now()/1000-pauseAt; // 暂停的那段时间不计入本局
 phase='play';}
function togglePause(){if(phase==='play')pauseGame();else if(phase==='paused')resumeGame();}
function toMenu(){disarmRestart();saveRun(); // 先落盘再决定「继续上次」给不给:刚吃的东西不该因为没到自动存档点而丢掉
 // 无尽/雪原没有结算屏,"回主菜单"就是这一局的终点 —— 不记一笔的话实测两局
 // 6957 / 4792 分打完,"最近战绩"里查无此局(历史是空数组)
 if(mode==='endless'&&(phase==='play'||phase==='paused')&&score>0)
  pushHistory(runLabel(),score,elapsed);
 phase='menu';$('pause').classList.add('hidden');$('win').classList.add('hidden');
 $('menu').classList.remove('hidden');setChrome(false);
 renderCont();cardFade();}
$('pp').onclick=togglePause;
$('presume').onclick=resumeGame;
$('prestart').onclick=()=>{const el=$('prestart');
 if(el.dataset.armed){disarmRestart();$('pause').classList.add('hidden');
  startGame(lastStart.m,lastStart.night,lastStart.snow);return;}
 el.dataset.armed='1';el.textContent='⚠ 再点一次确认';
 // 文案要说清"再点会丢什么",而且不能承诺一个这个模式根本没有的动作(限时/无尽不存档)
 $('psave').textContent=(mode==='campaign'?'再点一次会丢掉本局进度(存档随之清除)'
  :'再点一次会立刻重开这一局')+';不想重开就点「继续游戏」';
 armTO=setTimeout(disarmRestart,4000);};
$('pmenu').onclick=toMenu;

/* ---------- 设置面板 ---------- */
function renderSettings(){
 $('sMaster').value=CFG.master;$('sSfx').value=CFG.sfx;$('sAmb').value=CFG.amb;
 $('sMasterV').textContent=CFG.master;$('sSfxV').textContent=CFG.sfx;$('sAmbV').textContent=CFG.amb;
 for(const p of [['sQ','quality'],['sR','reduce']])
  for(const c of document.querySelectorAll('#'+p[0]+' .chip'))
   c.classList.toggle('on',c.dataset.v===CFG[p[1]]);
 $('sVib').classList.toggle('on',CFG.vib);$('sCb').classList.toggle('on',CFG.cb);
 $('sVib').textContent=(CFG.vib?'✓ ':'')+'📳 震动反馈';
 $('sCb').textContent=(CFG.cb?'✓ ':'')+'🎨 色盲友好描边';
 $('sNote').textContent=CFG.reduce==='auto'
  ? '减弱动效跟随系统设置(本机系统:'+(sysReduce()?'减少动效':'标准')+')'
  : '已手动设为'+(CFG.reduce==='on'?'减弱动效 — 不顿帧、不震屏、闪光减弱':'标准动效');}
function openSettings(){if(phase==='play')pauseGame();
 $('settings').classList.remove('hidden');renderSettings();
 cardFade();}   // 面板刚显形才量得到 scrollHeight:滚动线索不能等下一次 resize 才补
function closeSettings(){$('settings').classList.add('hidden');}
for(const p of [['sMaster','master'],['sSfx','sfx'],['sAmb','amb']])
 $(p[0]).oninput=e=>{CFG[p[1]]=+e.target.value;saveCfg();applyCfg();};
for(const p of [['sQ','quality'],['sR','reduce']])
 for(const c of document.querySelectorAll('#'+p[0]+' .chip'))
  c.onclick=()=>{CFG[p[1]]=c.dataset.v;saveCfg();applyCfg();blip(600,760,.05,.05,'sine');};
$('sVib').onclick=()=>{CFG.vib=!CFG.vib;saveCfg();applyCfg();vib(30);};
$('sCb').onclick=()=>{CFG.cb=!CFG.cb;saveCfg();applyCfg();};
$('sReset').onclick=()=>{CFG=Object.assign({},CFGD);saveCfg();applyCfg();setPick(CFG.mode);}; // 恢复默认也包含"上次模式",芯片必须跟着改口,不然屏幕和存档各说一套
$('sClose').onclick=closeSettings;
$('cfg').onclick=openSettings;$('pcfg').onclick=openSettings;
addEventListener('keydown',e=>{const k=e.key.toLowerCase();
 if(k==='escape'&&!$('settings').classList.contains('hidden')){closeSettings();return;}
 if(k==='escape'||k==='p'){e.preventDefault();togglePause();}});
$('snd').onclick=()=>{muted=!muted;$('snd').textContent=muted?'🔇':'🔊';
 try{localStorage.setItem('tornadoMuted',muted?'1':'0')}catch(e){}};

/* ---------- 主更新 ---------- */
function update(dt){elapsed=performance.now()/1000-startT;const p=Math.min(1,score/TH[7]);
 T.r=26+124*Math.pow(p,.65);
 let lv=1;for(let i=1;i<TH.length;i++)if(score>=TH[i])lv=i+1;
 if(lv>level){level=lv;levelUp();}
 const kx=(keys['arrowright']||keys['d']?1:0)-(keys['arrowleft']||keys['a']?1:0),
       ky=(keys['arrowdown']||keys['s']?1:0)-(keys['arrowup']||keys['w']?1:0);
 if(kx||ky){const m=Math.hypot(kx,ky);
  T.tx=clamp(T.x+kx/m*300,40,WORLD-40);T.tz=clamp(T.z+ky/m*300,40,WORLD-40);}
 const dx=T.tx-T.x,dz=T.tz-T.z,d=Math.hypot(dx,dz);
 vx=0;vz=0;
 if(d>6){const spd=Math.max(200,258-T.r*.39),v=Math.min(spd,d*6);
  vx=dx/d*v;vz=dz/d*v;T.x+=vx*dt;T.z+=vz*dt;}
 shake*=Math.exp(-dt*3.4);if(shake<1e-4)shake=0; // 指数衰减:线性尾巴会让小撞击"拖一下"
 hintT-=dt;lockHintT-=dt;updateLockRings();tutTick(dt);
 comboT-=dt;saveCool-=dt;if(comboT<=0)comboN=0;showCombo();
 $('combobar').style.transform='scaleX('+Math.max(0,comboT/2.2).toFixed(3)+')';
 rushGoal();
 if(saveCool<=0&&phase==='play'&&score>0&&mode==='campaign'){saveRun();saveCool=4;}
 if(mode==='rush'&&!rushEnded&&phase==='play'){
  rushT=Math.max(0,120-elapsed); // 倒计时按墙钟走,低帧率设备不会被拖长
  if(rushT<=0){rushEnded=true;endRush();}
  else{const t=Math.ceil(rushT);
   $('timerbox').textContent='⏱ '+fmt(t);
   $('timerbox').classList.toggle('danger',rushT<10);}}
 const range=T.r*2;
 // 车流行驶 + 行人逃跑
 for(const o of objects){
  if(o.state!=='idle')continue;
  if(o.axis){const dd=Math.hypot(o.x-T.x,o.z-T.z);
   if(dd>range*1.7){
    if(o.axis==='x'){o.x+=o.dir*o.spd*dt;
     if(o.x>3150)o.x=50;else if(o.x<50)o.x=3150;}
    else{o.z+=o.dir*o.spd*dt;
     if(o.z>3150)o.z=50;else if(o.z<50)o.z=3150;}
    o.node.position.x=o.x;o.node.position.z=o.z;}}
  else if(o.k==='ped'||o.k==='pedbike'||o.k==='pedcrouch'||o.k==='skier'){
   const dd=Math.hypot(o.x-T.x,o.z-T.z);
   const isBike=o.k==='pedbike'||o.k==='skier',isCrouch=o.k==='pedcrouch';
   let sp=o.spd;
   if(dd<105&&!isCrouch){o.wa=Math.atan2(o.z-T.z,o.x-T.x);sp=o.spd*(isBike?2.6:2.8);}
   if(!isCrouch){
    o.x+=Math.cos(o.wa)*sp*dt;o.z+=Math.sin(o.wa)*sp*dt;
    if(o.x<40||o.x>3160){o.wa=Math.PI-o.wa;o.x=clamp(o.x,40,3160);}
    if(o.z<40||o.z>3160){o.wa=-o.wa;o.z=clamp(o.z,40,3160);}
    o.node.position.set(o.x,Math.abs(Math.sin(time*(isBike?13:9)+o.seed))*(isBike?1.8:1.3),o.z);
    o.node.rotation.y=-o.wa;
    o.node.rotation.z=Math.sin(time*9+o.seed)*.07;
    if(o.node.userData.armL){const sw=Math.sin(time*9+o.seed)*.75;
     o.node.userData.armL.rotation.x=sw;o.node.userData.armR.rotation.x=-sw;}}
   else{ // 抱头蹲防:原地发抖
    o.node.position.set(o.x,0,o.z);
    o.node.rotation.z=Math.sin(time*26+o.seed)*.12;
    o.node.rotation.y=o.seed;}}}
 for(const o of objects){if(o.state!=='idle')continue;
  const dd=Math.hypot(o.x-T.x,o.z-T.z),
        can=o.tier<=level&&!(o.k==='landmark'&&!towerEdible());
  if(can&&dd<range+o.r){o.t=0;o.d0=Math.max(18,dd);
   o.a0=Math.atan2(o.z-T.z,o.x-T.x);o.dur=.75+o.r/110;o.rs=rnd(4.5,8);
   if(o.k.indexOf('ped')!==0&&!o.axis)destroyedIds.push(o.id);
   if(o.tier>=4){ // 大件:先摇晃松动,再撕裂离地
    o.state='shake';o.shakeDur=.55+o.r/220;
    spawnDebris('stone',null,2);creakSnd();
   }else{o.state='sucked';
    if(o.k==='tree_s'||o.k==='tree_b'){addStump(o.x,o.z);stumpList.push([Math.round(o.x),Math.round(o.z)]);}}}
  else{if(!can&&dd<range+o.r){ // 真的撞上了才说,不是"附近有个大的"就唠叨
   lockSeen=1;                 // 引导第 3 步的证人:撞上过吃不动的(提示有冷却,证人没有)
   if(lockHintT<=0&&!o.locked){o.locked=1;
    // 卷不动的塔不能报"需要 LV.8,还差 0 级"这种自相矛盾的话:它在这个模式根本没有等级门槛
    showHint(o.k==='landmark'&&!towerEdible()
      ?'🔒 电视塔在这个模式卷不动,专心刷大件'
      :'🔒 '+(KINDNAMES[o.k]||o.k)+' 需要 LV.'+o.tier+',还差 '+(o.tier-level)+' 级',2800);
    lockHintT=7;}}
   // 低等级的"嘴"只有 60 单位,而地图 3200 —— 不给一点预吸,真人画圈 15 秒只吃到 4 件
   if(can&&dd<range*(1.7+.9*(1-Math.min(1,(level-1)/3)))){
    const pk=dt*(.35+.18*(1-Math.min(1,(level-1)/3)));
    o.node.rotation.z=Math.sin(time*14+o.seed)*.045;
    o.x+=(T.x-o.x)*pk;o.z+=(T.z-o.z)*pk;
    o.node.position.x=o.x;o.node.position.z=o.z;}
   else if(o.node.rotation.z)o.node.rotation.z*=.8;}}
 for(let i=objects.length-1;i>=0;i--){const o=objects[i];
  // 结算就到此为止:consume 里会调 win()/endRush(),而这一帧后面还有半截列表没走完。
  // 实测漏出去的分数:限时结算卡"本局得分 4671"对不上"挑战最佳 4669",夜城历史 1681 对不上屏幕 2131
  if(phase!=='play')break;
  if(o.state==='shake'){ // 摇晃松动阶段
   o.t+=dt;const kk=1+(o.t/(o.shakeDur||.8))*1.6;
   if(o.t>=o.shakeDur){o.state='sucked';o.t=0;startTear(o);continue;}
   o.node.rotation.z=Math.sin(o.t*34+o.seed)*.06*kk;
   o.node.rotation.x=Math.cos(o.t*29+o.seed)*.05*kk;
   o.node.position.x=o.x+Math.sin(o.t*47+o.seed)*1.6*kk;
   o.node.position.z=o.z+Math.cos(o.t*41+o.seed)*1.6*kk;
   continue;}
  if(o.state!=='sucked')continue;
  o.t+=dt;const k=o.t/o.dur;
  if(k>=1){consume(o);
   if(mode==='endless'&&o.k!=='landmark'){ // 无尽:重生在远离玩家的随机区
    const rc=ZR[(o.zone==='road'||!o.zone)?'grass':o.zone]||ZR.grass;
    const rc2=rc[(Math.random()*rc.length)|0];
    let nx,nz,tries=0;
    do{nx=rc2.x+rnd(60,rc2.w-60);nz=rc2.z+rnd(60,rc2.h-60);tries++;}
    while(tries<12&&Math.hypot(nx-T.x,nz-T.z)<900);
    if(o.frags){for(const f of o.frags){scene.remove(f.m);f.m.geometry.dispose();}o.frags=null;}
    o.x=nx;o.z=nz;o.state='idle';o.t=0;o.node.visible=true;
    o.node.scale.setScalar(1);o.node.rotation.set(0,o.rot,0);
    o.node.position.set(nx,0,nz);continue;}
   objects.splice(i,1);
   if(o.frags)for(const f of o.frags){
    if(Math.random()<.4&&wrecks.length<60){ // 部分碎片坠回地面成为永久瓦砾
     f.m.userData.pool=f.m.userData.pool||'concrete';
     f.m.visible=true;f.m.scale.setScalar(rnd(.7,1.2));
     wrecks.push({m:f.m,vy:rnd(40,140),rv:rnd(1.5,5)*(Math.random()<.5?-1:1),
      rest:f.m.userData.hh*.5||3,landed:false});}
    else{scene.remove(f.m);f.m.geometry.dispose();}}
   disposeNode(o.node);continue;}
  const e=easeOut(k),a=o.a0+o.t*o.rs*(1+e*2.2);
  const hh=150*Math.pow(T.r/26,.75)*.9,scl=Math.max(.05,1-.8*e);
  if(o.frags){for(const f of o.frags){
   const dd2=f.d0*(1-e)+8,a2=a+f.ph;
   f.m.position.set(T.x+Math.cos(a2)*dd2,e*hh*f.hk,T.z+Math.sin(a2)*dd2);
   f.m.rotation.x+=f.rx*dt;f.m.rotation.z+=f.rz*dt;
   f.m.scale.setScalar(scl);}}
  else{const dd2=o.d0*(1-e)+10;
   o.node.position.set(T.x+Math.cos(a)*dd2,e*hh,T.z+Math.sin(a)*dd2);
   o.node.rotation.x+=o.rs*dt;o.node.rotation.z+=o.rs*.6*dt;
   o.node.scale.setScalar(scl);}}
 updateTornadoVisual(dt);
 lightning(dt);
 const se=$('score'), wasScore=se.textContent;
 if(wasScore!=String(score)){se.textContent=score;
  se.classList.remove('bump');void se.offsetWidth;se.classList.add('bump');}
 $('cnt').textContent=eaten;
 showClock(); // 本局用时:无尽/雪原没有终点,限时靠倒计时,只有这格能让玩家知道"我已经玩了多久"(probe62:改前游玩中零处报时)
 $('fill').style.width=(level<8?(score-TH[level-1])/(TH[level]-TH[level-1])*100:100)+'%';
 if(wasScore!=String(score))showUnlock();}   // "还差 N 分"跟着分数走,不能只在升级那刻写一次

/* ---------- 相机 ---------- */
const camT=V3(760,300,3120),lookT=V3(760,0,2640);
function updateCamera(dt){
 if(phase==='menu'){const a=time*.1;
  camT.set(T.x+Math.sin(a)*430,260+Math.sin(time*.31)*30,T.z+Math.cos(a)*430);
  lookT.lerp(_p3.set(T.x,50,T.z),Math.min(1,dt*2));}
 else{camT.set(T.x,150+T.r*2.6,T.z+235+T.r*3.6);
  lookT.lerp(_p3.set(T.x,T.r*.9,T.z),Math.min(1,dt*5));}
 camera.position.lerp(camT,Math.min(1,dt*(phase==='menu'?1.2:3.5)));
 if(shake>0&&!reduceMotion){const amp=shake*shake*(9+T.r*.05); // 平方:小撞几乎不震;乘半径:大风暴才看得出震
  camera.position.x+=rnd(-amp,amp);camera.position.y+=rnd(-amp,amp)*.6;}
 camera.lookAt(lookT);}

/* ---------- 主循环 ---------- */
// 低于 20fps 时,旧写法把每步钳成 .05 ⇒ 世界比墙钟慢:实测 4.6fps 的设备上 2 分钟限时只给
// 18% 的世界时间(玩家少卷 3/4)。改成 20Hz 定步长补帧,一帧最多补 4 步(0.2s),补不上就丢掉,
// 绝不攒成下一次的大跳;物理步长仍是 .05,不会因为补帧而穿模。
const WSTEP=.05;
function frame(ts){requestAnimationFrame(frame);
 const now=ts/1000,real=now-(last||now);last=now;      // 真帧时:钳掉的那截要留给画质统计,不能骗它
 const raw=Math.min(.2,real);
 if(phase==='paused'){audioFrame(raw);renderer.render(scene,camera);return;} // 冻结模拟,但风声增益仍要归零
 let dt=raw;
 if(hitstop>0){hitstop-=raw;dt=raw*(reduceMotion?.6:.14);} // 顿帧只压模拟步长;用时仍走墙钟
 time+=dt;
 for(const c of clouds){c.position.x+=c.userData.v*dt;if(c.position.x>3400)c.position.x=-200;}
 if(waterMat.map)waterMat.map.offset.x+=dt*.018,waterMat.map.offset.y+=dt*.008;
 for(const gu of gulls){gu.a+=gu.spd*dt;gu.flap+=dt*9;
  gu.g.position.set(gu.cx+Math.cos(gu.a)*gu.rr,gu.h+Math.sin(gu.a*2.3)*6,gu.cz+Math.sin(gu.a)*gu.rr*.7);
  gu.g.rotation.y=-gu.a+(gu.spd>0?0:Math.PI);
  const w=Math.sin(gu.flap)*.55;
  gu.g.userData.wl.rotation.z=w;gu.g.userData.wr.rotation.z=-w;}
 if(phase==='menu')updateTornadoVisual(dt);
 else if(phase==='play'){ // 'win' 时停止推进:结算卡上的数字不能再漂移
  let rem=dt;
  for(let k=0;k<4&&rem>1e-4&&phase==='play';k++){const h=Math.min(WSTEP,rem);update(h);rem-=h;}}
 qualityTick(real);  // 帧率统计要吃真帧时:吃被钳过的步长会让它永远看不见 5fps 以下这件事
 updateCamera(dt);
 if(reduceMotion)fovKick=0; // 归零而不是跳过,否则它永远卡在 >.05 挡回默认视场
 if(fovKick>.05){camera.fov=55+fovKick;camera.updateProjectionMatrix();fovKick*=Math.exp(-dt*6);}
 else if(camera.fov!==55){camera.fov=55;camera.updateProjectionMatrix();}
 const pEsc=(phase==='menu')?0:Math.min(1,score/TH[7]);
 stormLevel=pEsc;
 if(skyMatRef)skyMatRef.uniforms.storm.value=pEsc*.88;
 if(!isNight&&!isSnow)scene.fog.color.copy(FOG_A).lerp(FOG_B,pEsc*.85);
 if(isSnow&&phase==='play'){ // 暴雪白茫:风暴越强雾越浓越近
  scene.fog.color.setHex(0xc8d4de).lerp(new THREE.Color(0xe8eef4),pEsc*.7);
  scene.fog.near=700-pEsc*380;scene.fog.far=3000-pEsc*1100;}
 hemiBase=.37-pEsc*.12;if(!flashActive&&!isNight)hemi.intensity=hemiBase;
 if(!isNight)sun.intensity=1.66-pEsc*.75;
 updateRain(dt,pEsc);
 updateRipples(dt,pEsc);
 updateProbe();
 updateWrecks(dt);capWrecks();
 updateBolt(dt,pEsc);
 rivalUpdate(dt);
 sun.position.set(T.x+260,520,T.z+180);
 sun.target.position.set(T.x,0,T.z);
 renderer.render(scene,camera);
 if(!flashActive){for(const bm of BLD){
   const base=bm===BLD[4]?.0:0.55; // 玻璃塔无 emissiveMap
   bm.emissiveIntensity+= (base-bm.emissiveIntensity)*Math.min(1,dt*6);}}
 updateFts(dt);drawMinimap();audioFrame(dt);}

/* ---------- 启动 ---------- */
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){ // 后台:静音所有持续音(增益清零),自动暂停并保存进度
  if(AC){try{
   if(whGain)whGain.gain.value=0;
   if(rnGain)rnGain.gain.value=0;
   if(sirenGain)sirenGain.gain.value=0;}catch(e){}}
  if(phase==='play')pauseGame();
  dropInput();}}); // pauseGame 内部已 saveRun;顺手把键和拖动态清掉(见输入段)
addTufts();addClouds();
RV.pill=$('rvpill');
// iOS 添加主屏引导(一次性)
try{const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
 const standalone=navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
 if(isIOS&&!standalone&&!localStorage.getItem('tossHint')){
  const h=$('iosHint');h.style.display='block';
  setTimeout(()=>h.remove(),12000);
  localStorage.setItem('tossHint','1');}}catch(e){}
$('snd').textContent=muted?'🔇':'🔊';setChrome(false);applyCfg();
spawnAll();buildMinimap();applyAniso();   // 材质都是模块级建好的,开一次就够(带 __ani 幂等,后面再调也不重复干活)
loadGroundPhotos();
renderBests();
statline();renderAchv();renderHistory();
initHowto();setPick(MODES[CFG.mode]?CFG.mode:'campaign'); // 上次玩哪个模式就预选哪个;野值(旧档/手改的)回落闯关
for(const c of document.querySelectorAll('#modes .chip'))
 c.onclick=()=>{setPick(c.dataset.k);blip(520,660,.06,.05,'sine');};
renderCont();
if(navigator.serviceWorker&&(location.protocol==='https:'||location.hostname==='localhost')){
 // 本文件是首帧画完才被注入的,那时 load 可能早已发生 —— 只等事件会把离线安装悄悄丢掉
 const reg=()=>navigator.serviceWorker.register('sw.js').catch(()=>{});
 if(document.readyState==='complete')reg();else addEventListener('load',reg);}
camera.position.set(1080,300,3120);
requestAnimationFrame(frame);
const bootEl=$('boot');if(bootEl)bootEl.remove();
