let PHONE=(window.JC_CONFIG&&JC_CONFIG.WHATSAPP_NUMBER)||"918807030143";const MAP="https://www.google.com/maps/search/?api=1&query=Jasmine+Crackers+Kagganur+Sarjapura";
// Products come from the Google Sheet (see loadCatalogue below). Nothing is hardcoded here.
let PRODUCTS=[],CATEGORIES=[];
const wa=t=>`https://wa.me/${PHONE}?text=${encodeURIComponent(t)}`;
const GEN="Hello Jasmine Crackers, I would like to enquire about your crackers and wholesale prices.";
const $=s=>document.querySelector(s);
const money=n=>"₹"+new Intl.NumberFormat("en-IN").format(n);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// price the customer pays: offer price if there is a valid one, else normal price (null = price on request)
const priceOf=p=>typeof p.price==="number"&&typeof p.discountPrice==="number"&&p.discountPrice<p.price?p.discountPrice:p.price;
const offPct=p=>priceOf(p)<p.price?Math.round((1-priceOf(p)/p.price)*100):0;
const GALLERY=[{pos:"50% 30%",c:"b",img:"front"},{pos:"20% 30%",c:"w"},{pos:"85% 40%",c:"t"},{pos:"40% 75%"},{pos:"60% 15%"},{pos:"90% 85%",c:"w"},{pos:"5% 85%"},{pos:"50% 50%",c:"w"},{pos:"70% 70%"}];
document.querySelectorAll("[data-wa]").forEach(a=>{a.href=wa(GEN);a.target="_blank";a.rel="noopener"});
let cat="All",term="";
// image URL is validated; if it fails to load, the shop-photo placeholder behind it shows instead
const okImg=u=>/^https?:\/\/[^\s"'()<>]{4,500}$/i.test(u||"")?u:"";
const imgStyle=p=>p.image?`background-image:url(${esc(p.image)}),var(--shop);background-size:cover,260%;background-position:center,${esc(p.pos||"center")}`:`background-position:${esc(p.pos||"center")}`;
function priceHtml(p){const v=priceOf(p);if(typeof v!=="number")return `<span class="pv">Price on request</span>`;
return `<b class="pv">${money(v)}</b>`+(offPct(p)?` <s>${money(p.price)}</s>`:"")}
function chips(){$("#chips").innerHTML=["All",...CATEGORIES].map(c=>`<button class="chip ${c==cat?"on":""}" aria-pressed="${c==cat}">${esc(c)}</button>`).join("");
document.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{cat=b.textContent;chips();grid()})}
// catalogue grid: filtered by category chip and search box (name, category, description)
function grid(){const t=term.toLowerCase();
const list=PRODUCTS.filter(p=>(cat=="All"||p.category==cat)&&(!t||(p.name+" "+p.category+" "+p.description).toLowerCase().includes(t)));
$("#grid").innerHTML=list.length?list.map((p,i)=>`<article class="pc" style="${term?"animation:none":`animation-delay:${i*40}ms`}"><div class="pi" data-view="${esc(p.id)}" style="${imgStyle(p)}" role="img" aria-label="${esc(p.name)}">${offPct(p)?`<span class="off">${offPct(p)}% OFF</span>`:""}</div><div class="pb"><small>${esc(p.category)}</small><h3><button class="lk" data-view="${esc(p.id)}">${esc(p.name)}</button></h3><p>${esc(p.description)}</p><div class="pr">${priceHtml(p)}</div><div class="pa">${p.available===false?`<button class="btn" disabled>Currently Unavailable</button>`:`<button class="btn atc" data-add="${esc(p.id)}"><i data-lucide="shopping-cart"></i><span>Add to Cart</span></button>`}</div></div></article>`).join("")
:`<div class="nores"><p>No crackers found${term?` for "${esc(term)}"`:""}.</p><button class="btn" id="clr">Show all crackers</button></div>`;
const c=$("#clr");if(c)c.onclick=()=>{term="";$("#q").value="";cat="All";chips();grid()};
if(window.lucide)lucide.createIcons()}
$("#q").addEventListener("input",e=>{term=e.target.value.trim();grid()});
// product details popup (image, description, quantity, add to cart)
document.body.insertAdjacentHTML("beforeend",'<div id="pm" role="dialog" aria-modal="true" aria-label="Product details"></div>');
function openProduct(id){const p=PRODUCTS.find(x=>x.id==id);if(!p)return;
$("#pm").innerHTML=`<div class="pmc"><button class="x" data-pclose aria-label="Close">×</button><div class="pi pmi" style="${imgStyle(p)}">${offPct(p)?`<span class="off">${offPct(p)}% OFF</span>`:""}</div><div class="pmb"><small>${esc(p.category)}</small><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><div class="pr">${priceHtml(p)}</div>`+
(p.available===false?`<button class="btn" disabled>Currently Unavailable</button>`:`<div class="qc"><button data-dq="-1" aria-label="Decrease quantity">−</button><span id="dq">1</span><button data-dq="1" aria-label="Increase quantity">+</button></div><button class="btn pri atc" data-add="${esc(p.id)}"><i data-lucide="shopping-cart"></i><span>Add to Cart</span></button>`)+
`<p class="sn">Prices and availability are subject to confirmation.</p></div></div>`;
$("#pm").classList.add("o");document.documentElement.classList.add("lock");if(window.lucide)lucide.createIcons()}
function closeProduct(){$("#pm").classList.remove("o");document.documentElement.classList.remove("lock")}
document.addEventListener("click",e=>{const t=e.target,v=t.closest("[data-view]"),d=t.closest("[data-dq]");
if(v)openProduct(v.dataset.view);
else if(d){const n=Math.min(99,Math.max(1,(+$("#dq").textContent||1)+ +d.dataset.dq));$("#dq").textContent=n}
else if(t.closest("[data-pclose]")||t.id=="pm")closeProduct()});
addEventListener("keydown",e=>e.key=="Escape"&&closeProduct());
// ---- catalogue from Google Sheets (public read-only: only active products are returned by the server) ----
async function fetchCatalogue(){
  const url=window.JC_CONFIG&&JC_CONFIG.GOOGLE_APPS_SCRIPT_URL;if(!url)throw new Error("not-configured");
  const r=await fetch(url+(url.includes("?")?"&":"?")+"action=products&t="+Date.now());
  const j=await r.json();if(!j.success||!Array.isArray(j.data))throw new Error("bad-response");
  try{localStorage.setItem("jc_cat",JSON.stringify(j.data))}catch(e){}
  applyCatalogue(j.data)}
function applyCatalogue(data){
  PRODUCTS=data.filter(x=>x.id&&x.name&&isFinite(Number(x.price))).map(x=>{
    const sell=Number(x.price),orig=x.originalPrice==null?null:Number(x.originalPrice),disc=orig!=null&&orig>sell;
    // sheet "price" = selling price, "originalPrice" = optional higher price shown struck through
    return{id:String(x.id),name:String(x.name),category:String(x.category||"Other"),description:String(x.description||""),price:disc?orig:sell,discountPrice:disc?sell:null,image:okImg(x.imageUrl),pos:"center",available:x.stockStatus!=="Out of Stock"};
  });
  CATEGORIES=[...new Set(PRODUCTS.map(p=>p.category))].sort();
  if(cat!="All"&&!CATEGORIES.includes(cat))cat="All";
}
function catalogueError(e){$("#chips").innerHTML="";
  $("#grid").innerHTML=`<div class="nores"><p>${e&&e.message=="not-configured"?"The catalogue is not connected yet. The shop owner needs to finish the setup.":"We're having trouble loading our products right now."}</p><button class="btn pri" id="retry">Try again</button><p style="margin-top:14px">Or message us on WhatsApp and we will help you directly.</p></div>`;
  $("#retry").onclick=loadCatalogue}
async function loadCatalogue(){
  let shown=false;
  try{const c=JSON.parse(localStorage.getItem("jc_cat"));if(Array.isArray(c)&&c.length){applyCatalogue(c);chips();grid();shown=true}}catch(e){}   // last visit's products appear instantly
  if(!shown)$("#grid").innerHTML=Array(6).fill('<div class="pc sk"></div>').join("");
  try{await fetchCatalogue()}catch(e){if(shown)return true;catalogueError(e);return false}
  if(!PRODUCTS.length){$("#chips").innerHTML="";$("#grid").innerHTML='<p class="note">New crackers are coming soon. Message us on WhatsApp for today\'s range.</p>';return true}
  chips();grid();window.cartReload&&cartReload();return true}
// re-fetch without blanking the page (used by checkout to confirm current prices). true = fresh data loaded.
window.reloadProducts=async()=>{try{await fetchCatalogue();chips();grid();return true}catch(e){return false}};
window.productsReady=loadCatalogue();
$("#refresh").onclick=async e=>{const b=e.currentTarget;b.textContent="Refreshing…";b.textContent=(await window.reloadProducts())?"Refresh products":"Could not refresh. Tap to try again"};
$("#gal").innerHTML=GALLERY.map((g,i)=>`<button class="g ${g.c||""}" style="background-position:${g.pos};background-size:${g.img?"cover":g.c?"170%":"230%"}${g.img?";background-image:var(--front)":""}" data-img="${g.img||""}" aria-label="Enlarge shop photo ${i+1}" data-p="${g.pos}"></button>`).join("");
document.querySelectorAll(".g").forEach(g=>g.onclick=()=>{const d=$("#lb div");d.style.cssText=g.dataset.img?"background-image:var(--front);background-size:contain;background-repeat:no-repeat;background-position:center;height:85vh;aspect-ratio:auto;border:0;background-color:transparent":"";$("#lb").classList.add("o")});
$("#lb").onclick=()=>$("#lb").classList.remove("o");addEventListener("keydown",e=>e.key=="Escape"&&$("#lb").classList.remove("o"));
// nav
const nav=$("#nav"),L=$("#links"),B=$("#bg");
addEventListener("scroll",()=>nav.classList.toggle("s",scrollY>30),{passive:true});
B.onclick=()=>{const o=L.classList.toggle("o");B.setAttribute("aria-expanded",o)};
L.querySelectorAll("a").forEach(a=>a.onclick=()=>{L.classList.remove("o");B.setAttribute("aria-expanded",false)});
// reveal
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll(".rv").forEach(e=>io.observe(e));
// fireworks
const rm=matchMedia("(prefers-reduced-motion:reduce)").matches,cv=$("#fx"),cx=cv.getContext("2d");let W,H,ps=[];
function rs(){const d=Math.min(devicePixelRatio||1,2);W=cv.clientWidth;H=cv.clientHeight;cv.width=W*d;cv.height=H*d;cx.setTransform(d,0,0,d,0,0)}
rs();addEventListener("resize",rs);
const COL=["#f3dc9a","#d9b25f","#e03a48","#fff4dc"];
function burst(x,y){const n=W<600?38:60,c=COL[Math.random()*4|0],c2=COL[Math.random()*4|0];
for(let i=0;i<n;i++){const a=Math.PI*2*i/n,s=1.5+Math.random()*2.6;ps.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:1,c:i%3?c:c2})}}
let last=0,vis=true;
new IntersectionObserver(e=>vis=e[0].isIntersecting).observe(cv);
function loop(t){requestAnimationFrame(loop);if(!vis)return;
cx.clearRect(0,0,W,H);
if(t-last>3600){last=t;burst(W*(.1+Math.random()*.8),H*(.15+Math.random()*.4))}
ps=ps.filter(p=>p.l>0);
for(const p of ps){p.x+=p.vx;p.y+=p.vy;p.vx*=.97;p.vy=p.vy*.97+.035;p.l-=.012;cx.globalAlpha=Math.max(p.l,0);cx.fillStyle=p.c;cx.beginPath();cx.arc(p.x,p.y,1.8,0,7);cx.fill()}}
if(!rm){requestAnimationFrame(loop);cv.parentElement.addEventListener("pointerdown",e=>{if(e.target.closest("a,button"))return;const r=cv.getBoundingClientRect();burst(e.clientX-r.left,e.clientY-r.top)})}
else document.querySelector(".hint").remove();

// motion upgrades
(function(){
const pg=document.getElementById("pg");
addEventListener("scroll",()=>{pg.style.transform="scaleX("+(scrollY/(document.documentElement.scrollHeight-innerHeight||1))+")"},{passive:true});
if(rm)return;
// headline word reveal
const h=document.querySelector(".hero h1");let i=0;const frag=[];
h.childNodes.forEach(n=>{const g=n.nodeType==1,words=n.textContent.trim().split(/\s+/);
words.forEach(w=>{const s=document.createElement("span");s.className="hw"+(g?" gold":"");s.style.setProperty("--i",i++);s.textContent=w;frag.push(s,document.createTextNode(" "))});
if(!g&&/\s$/.test(n.textContent)){}});
h.setAttribute("aria-label",h.textContent);h.textContent="";frag.forEach(f=>h.appendChild(f));
// embers
const hero=document.querySelector(".hero");
for(let k=0;k<16;k++){const e=document.createElement("i");e.className="em";e.style.left=Math.random()*100+"%";e.style.setProperty("--dx",(Math.random()*80-40)+"px");e.style.animationDuration=(7+Math.random()*7)+"s";e.style.animationDelay=(-Math.random()*10)+"s";hero.insertBefore(e,hero.children[1])}
const fine=matchMedia("(hover:hover) and (pointer:fine)").matches;
if(!fine)return;
// emblem tilt
const emb=document.querySelector(".emb");
hero.addEventListener("mousemove",e=>{const r=hero.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;emb.style.transform=`perspective(800px) rotateY(${x*14}deg) rotateX(${-y*14}deg)`});
hero.addEventListener("mouseleave",()=>emb.style.transform="");
// magnetic buttons
document.querySelectorAll(".hero .btn,#order .btn").forEach(b=>{b.addEventListener("mousemove",e=>{const r=b.getBoundingClientRect();b.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.18}px,${(e.clientY-r.top-r.height/2)*.28}px)`});b.addEventListener("mouseleave",()=>b.style.transform="")});
// gold sparkle trail
let lt=0;addEventListener("mousemove",e=>{const n=performance.now();if(n-lt<55)return;lt=n;const s=document.createElement("i");s.className="sp";s.style.left=e.clientX-3+"px";s.style.top=e.clientY-3+"px";s.style.setProperty("--x",(Math.random()*30-15)+"px");s.style.setProperty("--y",(Math.random()*30+4)+"px");document.body.appendChild(s);setTimeout(()=>s.remove(),800)});
})();

document.querySelectorAll('a[href^="tel:"]').forEach(a=>a.addEventListener("click",()=>{const c=$("#ct");c.classList.add("o");clearTimeout(c.t);c.t=setTimeout(()=>c.classList.remove("o"),7000)}));
$("#cc").onclick=async()=>{try{await navigator.clipboard.writeText("+918807030143");$("#cc").textContent="Copied"}catch(e){$("#cc").textContent="+918807030143"}setTimeout(()=>$("#cc").textContent="Copy number",2500)};

lucide.createIcons();

const hsGo=d=>{const g=$("#grid");g.scrollBy({left:d*Math.max(240,g.clientWidth*.8),behavior:"smooth"})};
$("#hsl").onclick=()=>hsGo(-1);$("#hsr").onclick=()=>hsGo(1);

// ===== v4: menu highlight, scroll bar, fireworks, fly-to-cart, card glow, ripples =====
(function(){
 const links=[...document.querySelectorAll("#links a")],ids=["home","about","categories","why","gallery","contact"].map(i=>document.getElementById(i)).filter(Boolean);
 function mark(){const h=location.hash;let cur="";
  if(h.startsWith("#/"))cur=h;else{const y=scrollY+140;ids.forEach(s=>{if(s.offsetTop<=y)cur="#"+s.id});if(!cur)cur="#home"}
  links.forEach(a=>a.classList.toggle("on",a.getAttribute("href")===cur))}
 const sp=document.createElement("div");sp.id="sp";document.body.appendChild(sp);
 function prog(){const m=document.documentElement.scrollHeight-innerHeight;sp.style.transform="scaleX("+(m>0?Math.min(1,scrollY/m):0)+")"}
 addEventListener("scroll",()=>{mark();prog()},{passive:true});addEventListener("hashchange",()=>{mark();const v=document.getElementById("view");if(v){v.classList.add("pt");setTimeout(()=>v.classList.remove("pt"),800)}});mark();prog();
 // ripple on buttons
 document.addEventListener("pointerdown",e=>{const b=e.target.closest(".btn.pri,.btn.wa");if(!b||b.disabled)return;const r=b.getBoundingClientRect(),d=Math.max(r.width,r.height)*2,s=document.createElement("span");s.className="rip";s.style.cssText=`width:${d}px;height:${d}px;left:${e.clientX-r.left-d/2}px;top:${e.clientY-r.top-d/2}px`;b.appendChild(s);setTimeout(()=>s.remove(),650)});
 // card glow + tilt (mouse only)
 if(matchMedia("(hover:hover)").matches)document.addEventListener("pointermove",e=>{const c=e.target.closest&&e.target.closest(".pc");if(!c)return;const r=c.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;c.style.setProperty("--mx",x+"px");c.style.setProperty("--my",y+"px");c.style.setProperty("--ry",((x/r.width-.5)*8).toFixed(1)+"deg");c.style.setProperty("--rx",((.5-y/r.height)*8).toFixed(1)+"deg")});
 document.addEventListener("pointerout",e=>{const c=e.target.closest&&e.target.closest(".pc");if(c&&!c.contains(e.relatedTarget)){c.style.setProperty("--rx","0deg");c.style.setProperty("--ry","0deg")}});
 if(matchMedia("(prefers-reduced-motion:reduce)").matches){window.jcCelebrate=()=>{};return}
 // add-to-cart: a golden ball flies into the cart button
 document.addEventListener("click",e=>{const a=e.target.closest("[data-add]"),cart=document.getElementById("cartbtn");if(!a||a.disabled||!cart)return;
  const src=(a.closest(".pc,.pgr,.pmc")||a).querySelector(".pi,.pgt"),r=(src||a).getBoundingClientRect(),c=cart.getBoundingClientRect(),f=document.createElement("div");f.className="fly";
  f.style.left=r.left+r.width/2-22+"px";f.style.top=r.top+r.height/2-22+"px";document.body.appendChild(f);
  const dx=c.left+c.width/2-(r.left+r.width/2),dy=c.top+c.height/2-(r.top+r.height/2);
  f.animate([{transform:"translate(0,0) scale(1)",opacity:1},{transform:`translate(${dx*.45}px,${dy*.45-80}px) scale(.85)`,opacity:1,offset:.5},{transform:`translate(${dx}px,${dy}px) scale(.2)`,opacity:.4}],{duration:760,easing:"cubic-bezier(.4,.1,.3,1)"}).onfinish=()=>f.remove()},true);
 // fireworks (home screen + order celebration)
 const cv=document.createElement("canvas");cv.id="fx";document.body.appendChild(cv);const cx=cv.getContext("2d"),COL=[[255,214,110],[255,120,80],[120,200,255],[255,90,160],[160,255,170],[255,255,255]];
 let W,H,dpr,P=[],R=[],run=false;const small=innerWidth<700;
 function size(){dpr=Math.min(2,devicePixelRatio||1);W=innerWidth;H=innerHeight;cv.width=W*dpr;cv.height=H*dpr;cx.setTransform(dpr,0,0,dpr,0,0)}size();addEventListener("resize",size);
 function burst(x,y){const c=COL[Math.random()*COL.length|0],c2=COL[Math.random()*COL.length|0],n=small?46:78;for(let i=0;i<n;i++){const a=Math.PI*2*i/n+Math.random()*.1,s=1.4+Math.random()*3.1;P.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:1,d:.011+Math.random()*.012,c:i%3?c:c2})}go()}
 function launch(x,ty){R.push({x,y:H+8,vy:-(10+Math.random()*2.5),ty});go()}
 function go(){if(run)return;run=true;requestAnimationFrame(step)}
 function step(){cx.globalCompositeOperation="destination-out";cx.fillStyle="rgba(0,0,0,.22)";cx.fillRect(0,0,W,H);cx.globalCompositeOperation="lighter";
  R=R.filter(r=>{r.y+=r.vy;r.vy*=.985;P.push({x:r.x,y:r.y,vx:(Math.random()-.5)*.4,vy:.6,l:.55,d:.05,c:[255,230,170]});cx.fillStyle="rgba(255,240,200,.9)";cx.fillRect(r.x-1.2,r.y-1.2,2.4,2.4);if(r.y<=r.ty||r.vy>-1.6){burst(r.x,r.y);return false}return true});
  P=P.filter(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.035;p.vx*=.985;p.vy*=.985;p.l-=p.d;if(p.l<=0)return false;cx.fillStyle=`rgba(${p.c[0]},${p.c[1]},${p.c[2]},${Math.max(0,p.l)})`;cx.beginPath();cx.arc(p.x,p.y,1.7*Math.max(.4,p.l),0,6.3);cx.fill();return true});
  if(P.length||R.length)requestAnimationFrame(step);else{run=false;cx.clearRect(0,0,W,H)}}
 window.jcCelebrate=()=>{for(let i=0;i<8;i++)setTimeout(()=>launch(W*(.12+Math.random()*.76),H*(.12+Math.random()*.32)),i*320)};

 setInterval(()=>{if(document.hidden||document.body.classList.contains("vo")||scrollY>innerHeight*.7||document.getElementById("links").classList.contains("o"))return;launch(W*(.12+Math.random()*.76),H*(.1+Math.random()*.3))},small?3400:2300);
})();
