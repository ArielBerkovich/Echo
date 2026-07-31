import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const presentationRoot = path.dirname(fileURLToPath(import.meta.url));
const renderedRoot = path.join(presentationRoot, "rendered");
const outputPath = path.join(presentationRoot, "output", "Echo_Integration_Possibilities.html");

const definitions = [
  ["00-title.png", "Echo integration possibilities"],
  ["01-jenkins-builds.png", "Jenkins builds"],
  ["02-daily-prod-errors.png", "Daily production errors"],
  ["03-nightly-build-status.png", "Nightly build status"],
  ["04-version-releases.png", "Version releases"],
  ["05-team-pr-alert-channels.png", "Team, PR and alert channels"],
  ["06-team-owned-e2e.png", "Team-owned E2E routing"],
  ["07-garp-ai.png", "Ask Garp"],
];

const slides = definitions.map(([file, title]) => ({
  title,
  src: `data:image/png;base64,${fs.readFileSync(path.join(renderedRoot, file)).toString("base64")}`,
}));

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#020812">
  <title>Echo — Integration Possibilities</title>
  <style>
    :root{color-scheme:dark;--bg:#020812;--panel:rgba(12,23,39,.9);--line:rgba(145,163,188,.24);--text:#f4f7fc;--muted:#9facbf;--accent:#3dd7c3}
    *{box-sizing:border-box}
    html,body{width:100%;height:100%;margin:0;overflow:hidden;background:var(--bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    button{font:inherit}
    .deck{position:relative;width:100vw;height:100dvh;background:radial-gradient(circle at 50% 45%,rgba(40,66,93,.2),transparent 55%),#020812;isolation:isolate;user-select:none}
    .stage{position:absolute;inset:0;display:grid;place-items:center;padding:34px 34px 58px}
    .slide{width:min(calc(100vw - 68px),calc((100dvh - 92px)*16/9));max-height:calc(100dvh - 92px);aspect-ratio:16/9;object-fit:contain;filter:drop-shadow(0 26px 60px rgba(0,0,0,.42));animation:enter .24s cubic-bezier(.2,.8,.2,1)}
    @keyframes enter{from{opacity:.3;transform:translateX(20px) scale(.993)}to{opacity:1;transform:none}}
    .topbar{position:absolute;top:14px;left:18px;right:18px;z-index:5;display:flex;align-items:center;justify-content:space-between;opacity:0;transform:translateY(-8px);transition:.18s}
    .deck:hover .topbar,.topbar:focus-within{opacity:1;transform:none}
    .brand{display:flex;align-items:center;gap:10px;padding:8px 12px 8px 8px;color:var(--muted);font-size:13px;font-weight:650;border:1px solid var(--line);border-radius:999px;background:var(--panel);backdrop-filter:blur(16px)}
    .brand-mark{display:grid;width:27px;height:27px;place-items:center;border-radius:50%;color:#07111f;background:var(--accent);font-weight:900}
    .offline{color:#8fddc1;font-size:10px;letter-spacing:.08em}
    .icon-button,.close{display:grid;place-items:center;color:var(--text);border:1px solid var(--line);background:var(--panel);backdrop-filter:blur(16px);cursor:pointer}
    .icon-button{grid-template-columns:repeat(2,5px);gap:4px;width:43px;height:43px;border-radius:50%}
    .icon-button i{width:5px;height:5px;border-radius:1px;background:currentColor}
    .tap{position:absolute;z-index:2;top:12%;bottom:12%;width:12%;border:0;background:transparent;cursor:pointer}
    .tap:disabled{cursor:default}.tap.prev{left:0}.tap.next{right:0}
    .controls{position:absolute;z-index:6;left:50%;bottom:14px;display:flex;align-items:center;gap:8px;padding:7px;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:0 15px 45px rgba(0,0,0,.4);backdrop-filter:blur(18px);transform:translate(-50%,10px);opacity:0;transition:.18s}
    .deck:hover .controls,.controls:focus-within{opacity:1;transform:translate(-50%,0)}
    .controls button{display:grid;width:38px;height:38px;place-items:center;border:0;border-radius:10px;color:var(--text);background:rgba(255,255,255,.07);cursor:pointer}
    .controls button:hover:not(:disabled){background:rgba(92,145,209,.28)}.controls button:disabled{opacity:.28;cursor:default}
    .meta{min-width:210px;padding:0 12px}.meta strong,.meta span{display:block}.meta strong{color:var(--text);font-size:12px;line-height:1.4}.meta span{margin-top:2px;color:var(--muted);font-size:10px;letter-spacing:.12em}
    .progress{position:absolute;z-index:8;right:0;bottom:0;left:0;height:3px;background:rgba(255,255,255,.06)}.progress span{display:block;height:100%;background:linear-gradient(90deg,#5c91d1,var(--accent));transition:width .22s}
    .overview{position:absolute;z-index:20;inset:0;overflow-y:auto;padding:44px clamp(24px,6vw,110px) 70px;background:rgba(2,8,18,.97);backdrop-filter:blur(24px);animation:fade .18s}
    .overview[hidden]{display:none}@keyframes fade{from{opacity:0;transform:scale(.99)}to{opacity:1;transform:none}}
    .overview-head{display:flex;max-width:1500px;margin:0 auto 28px;align-items:flex-start;justify-content:space-between}.overview h1{margin:8px 0 0;color:var(--text);font-size:clamp(28px,4vw,48px)}.eyebrow{color:var(--accent);font-size:11px;font-weight:800;letter-spacing:.24em}
    .close{width:44px;height:44px;border-radius:50%;font-size:28px}.grid{display:grid;max-width:1500px;margin:0 auto;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:24px}
    .thumb{padding:0;overflow:hidden;text-align:left;border:1px solid var(--line);border-radius:14px;color:var(--text);background:#0a1423;cursor:pointer;transition:.16s}.thumb:hover,.thumb.current{border-color:rgba(61,215,195,.8);transform:translateY(-3px);box-shadow:0 18px 40px rgba(0,0,0,.35)}
    .thumb img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}.thumb span{display:flex;gap:12px;align-items:center;padding:14px 16px 16px;color:#cbd4e0;font-size:13px;font-weight:650}.thumb b{color:var(--accent);font-size:10px;letter-spacing:.12em}
    @media(max-width:700px){.stage{padding:16px 10px 62px}.slide{width:calc(100vw - 20px);max-height:calc(100dvh - 82px)}.meta{min-width:150px}.brand{display:none}.topbar{justify-content:flex-end}}
    @media(prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  </style>
</head>
<body>
  <main class="deck" id="deck">
    <section class="stage"><img class="slide" id="slide" alt=""></section>
    <button class="tap prev" id="tapPrev" aria-label="Previous slide"></button>
    <button class="tap next" id="tapNext" aria-label="Next slide"></button>
    <header class="topbar">
      <div class="brand"><span class="brand-mark">E</span><span>Echo integration possibilities</span><span class="offline">SELF-CONTAINED</span></div>
      <button class="icon-button" id="overviewButton" aria-label="Open slide overview" title="Overview (O)"><i></i><i></i><i></i><i></i></button>
    </header>
    <footer class="controls">
      <button id="previous" aria-label="Previous slide">←</button>
      <div class="meta"><strong id="title"></strong><span id="counter"></span></div>
      <button id="next" aria-label="Next slide">→</button>
      <button id="fullscreen" title="Fullscreen (F)">⛶</button>
    </footer>
    <div class="progress"><span id="progress"></span></div>
    <div class="overview" id="overview" role="dialog" aria-modal="true" hidden>
      <div class="overview-head"><div><span class="eyebrow">SLIDE OVERVIEW</span><h1>Choose a scenario</h1></div><button class="close" id="close" aria-label="Close overview">×</button></div>
      <div class="grid" id="grid"></div>
    </div>
  </main>
  <script>
    const slides=${JSON.stringify(slides)};
    let index=Math.max(0,Math.min(slides.length-1,(parseInt(location.hash.slice(1),10)||1)-1));
    let touchStart=null;
    const el={
      deck:document.getElementById("deck"),slide:document.getElementById("slide"),title:document.getElementById("title"),
      counter:document.getElementById("counter"),progress:document.getElementById("progress"),previous:document.getElementById("previous"),
      next:document.getElementById("next"),tapPrev:document.getElementById("tapPrev"),tapNext:document.getElementById("tapNext"),
      overview:document.getElementById("overview"),grid:document.getElementById("grid")
    };
    function render(){
      const item=slides[index];
      el.slide.src=item.src;el.slide.alt="Slide "+(index+1)+": "+item.title;
      el.slide.style.animation="none";void el.slide.offsetWidth;el.slide.style.animation="";
      el.title.textContent=item.title;el.counter.textContent=String(index+1).padStart(2,"0")+" / "+String(slides.length).padStart(2,"0");
      el.progress.style.width=((index+1)/slides.length*100)+"%";
      el.previous.disabled=el.tapPrev.disabled=index===0;el.next.disabled=el.tapNext.disabled=index===slides.length-1;
      history.replaceState(null,"","#"+(index+1));
      [...el.grid.children].forEach((node,i)=>node.classList.toggle("current",i===index));
    }
    function go(value){index=Math.max(0,Math.min(slides.length-1,value));render()}
    function toggleOverview(show=!el.overview.hidden){el.overview.hidden=!show}
    slides.forEach((item,i)=>{
      const button=document.createElement("button");button.className="thumb";
      const image=document.createElement("img");image.src=item.src;image.alt="";
      const label=document.createElement("span");label.innerHTML="<b>"+String(i+1).padStart(2,"0")+"</b>"+item.title;
      button.append(image,label);button.onclick=()=>{go(i);toggleOverview(false)};el.grid.append(button);
    });
    el.previous.onclick=el.tapPrev.onclick=()=>go(index-1);el.next.onclick=el.tapNext.onclick=()=>go(index+1);
    document.getElementById("overviewButton").onclick=()=>toggleOverview(true);document.getElementById("close").onclick=()=>toggleOverview(false);
    document.getElementById("fullscreen").onclick=()=>document.documentElement.requestFullscreen?.();
    addEventListener("keydown",event=>{
      if(event.key==="ArrowRight"||event.key==="PageDown"||event.key===" "){event.preventDefault();go(index+1)}
      else if(event.key==="ArrowLeft"||event.key==="PageUp"){event.preventDefault();go(index-1)}
      else if(event.key==="Home")go(0);else if(event.key==="End")go(slides.length-1);
      else if(event.key.toLowerCase()==="f")document.documentElement.requestFullscreen?.();
      else if(event.key.toLowerCase()==="o")toggleOverview();
      else if(event.key==="Escape")toggleOverview(false);
    });
    el.deck.addEventListener("touchstart",event=>touchStart=event.changedTouches[0]?.clientX??null,{passive:true});
    el.deck.addEventListener("touchend",event=>{if(touchStart===null)return;const d=(event.changedTouches[0]?.clientX??touchStart)-touchStart;if(Math.abs(d)>45)go(index+(d<0?1:-1));touchStart=null},{passive:true});
    render();
    slides.forEach(item=>{const image=new Image();image.src=item.src});
  </script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html);

console.log(outputPath);
console.log(`${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MiB`);
