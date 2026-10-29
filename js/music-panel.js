// 网易云一起听 - 集成到 Theodore 音乐页面 tab
(function(){
  const API = "https://bfhusuwmgggqrahfrdsr.supabase.co/functions/v1/netease";
  let d = localStorage.getItem("td_music_id");
  if (!d) { d = "d" + Math.random().toString(36).slice(2, 10); localStorage.setItem("td_music_id", d); }

  let accent = localStorage.getItem("td_music_color") || "#1ec96b";
  let discImg = localStorage.getItem("td_music_disc") || "";
  let started = false;
  let timerStart = 0, timerInt = null;

  function startTimer() { timerStart = Date.now(); timerInt = setInterval(updateTimer, 1000); updateTimer(); }
  function stopTimer() { clearInterval(timerInt); timerInt = null; }
  function updateTimer() {
    const el = document.getElementById("netease-timer");
    if (!el) return;
    const s = Math.floor((Date.now() - timerStart) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    el.textContent = "已一起听 " + (h > 0 ? h + ":" + String(m).padStart(2,"0") + ":" + String(sec).padStart(2,"0") : m + ":" + String(sec).padStart(2,"0"));
  }

  async function api(f, q = {}) {
    const u = new URLSearchParams({ action: f, device_id: d, ...q });
    const r = await fetch(API + "?" + u);
    return r.json();
  }

  function init() {
    if (started) return;
    started = true;
    // 监听 tab 切换
    document.querySelectorAll('#page-music .fav-tab[data-mtab="netease"]').forEach(tab => {
      tab.addEventListener("click", () => setTimeout(loadState, 100));
    });
    loadState();
  }

  const audio = new Audio();
  audio.crossOrigin = "anonymous";

  function root() { return document.getElementById("netease-body"); }

  async function loadState() {
    const el = root();
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;opacity:.5;padding:30px;font-size:13px;">加载中...</div>';
    const s = await api("state");
    s.log ? showSearch(s.nickname) : showLogin();
  }

  function showLogin() {
    const el = root();
    el.innerHTML = `
      <div style="text-align:center;padding:10px 0;">
        <div style="font-size:14px;margin-bottom:14px;">扫码登录网易云</div>
        <div style="width:170px;height:170px;margin:0 auto;background:#fff;border-radius:14px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
          <span style="color:#999;font-size:12px;">生成中...</span>
        </div>
        <div id="netease-qr-st" style="font-size:12px;opacity:.6;margin-top:12px;">用网易云App扫码</div>
      </div>`;
    genQr();
  }

  async function genQr() {
    const r = await api("qrkey");
    if (!r.key) return;
    const box = root().querySelector("div[style*='width:170px']");
    box.innerHTML = `<img src="https://quickchart.io/qr?text=${encodeURIComponent("https://music.163.com/login?codekey=" + r.key)}&size=200&margin=0" style="width:170px;height:170px;" onerror="this.parentNode.innerHTML='<span style=&quot;color:#f66;font-size:12px;&quot;>二维码加载失败，点我重试</span>';this.parentNode.onclick=()=>genQr();">`;
    pollQr(r.key);
  }

  async function pollQr(key) {
    const t = setInterval(async () => {
      const r = await api("qrcheck", { key });
      const s = document.getElementById("netease-qr-st");
      if (!s) { clearInterval(t); return; }
      if (r.code === 801) s.textContent = "等待扫码...";
      else if (r.code === 802) s.textContent = "请在手机确认...";
      else if (r.code === 800) { s.textContent = "过期了，重新生成"; clearInterval(t); genQr(); }
      else if (r.code === 803) { s.textContent = "登录成功！"; clearInterval(t); setTimeout(loadState, 1500); }
    }, 2000);
  }

  function showSearch(nickname) {
    // 直接显示深色黑胶播放界面
    showPlayer("🎵 未播放", nickname ? "已登录：" + nickname : "点搜索找歌");
  }

  function showSearchPanel(nickname) {
    const el = root();
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-size:13px;font-weight:600;">🔍 搜索歌曲</span>
        <span id="netease-back-disc" style="font-size:12px;cursor:pointer;opacity:.6;">← 返回</span>
      </div>
      <input id="netease-kw" placeholder="搜歌名/歌手..." style="width:100%;box-sizing:border-box;padding:10px 12px;background:rgba(0,0,0,.05);border:1px solid rgba(0,0,0,.1);border-radius:10px;color:inherit;font-size:14px;outline:none;"/>
      <div id="netease-results" style="margin-top:10px;"></div>`;
    el.querySelector("#netease-back-disc").onclick = () => showSearch(nickname);
    el.querySelector("#netease-kw").addEventListener("keydown", async e => {
      if (e.key !== "Enter") return;
      const kw = e.target.value.trim();
      if (!kw) return;
      const rs = el.querySelector("#netease-results");
      rs.innerHTML = '<div style="opacity:.5;font-size:13px;padding:8px;">搜索中...</div>';
      const r = await api("search", { keyword: kw });
      if (!r.songs || !r.songs.length) { rs.innerHTML = "<div style='opacity:.5;font-size:13px;padding:8px;'>没找到</div>"; return; }
      rs.innerHTML = r.songs.map((s, i) => `
        <div class="nsong" data-id="${s.id}" data-name="${s.name}" data-artist="${s.artist}" style="padding:9px 2px;border-bottom:1px solid rgba(0,0,0,.06);cursor:pointer;display:flex;align-items:center;gap:10px;">
          <span style="opacity:.4;font-size:12px;width:18px;">${i+1}</span>
          <div style="flex:1;">
            <div style="font-size:13px;">${s.name}</div>
            <div style="font-size:11px;opacity:.5;">${s.artist}</div>
          </div>
          <span style="color:${accent};font-size:11px;">▶</span>
        </div>`).join("");
      rs.querySelectorAll(".nsong").forEach(s => s.onclick = () => play(s.dataset.id, s.dataset.name, s.dataset.artist));
    });
    setTimeout(() => el.querySelector("#netease-kw").focus(), 100);
  }

  let currentSong = null;
  async function play(id, name, artist) {
    const r = await api("url", { id });
    if (!r.url) { alert("这首歌不能播放（VIP或版权限制）"); return; }
    currentSong = { id, name, artist };
    audio.src = r.url;
    audio.play();
    stopTimer(); startTimer();
    showPlayer(name, artist);
  }

  function showPlayer(name, artist) {
    const el = root();
    el.innerHTML = `
      <div style="background:#0c0c0e;border-radius:16px;padding:20px 16px 16px;overflow:hidden;position:relative;">
        <!-- 顶部 -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <span id="netease-timer" style="font-size:10px;color:rgba(255,255,255,.4);">已一起听 0:00</span>
          <span style="display:flex;gap:12px;">
            <span id="netease-search" style="font-size:14px;cursor:pointer;color:rgba(255,255,255,.5);">🔍</span>
            <span id="netease-set" style="font-size:13px;cursor:pointer;color:rgba(255,255,255,.5);">⚙️</span>
            <span id="netease-logout" style="font-size:11px;cursor:pointer;color:${accent};">退出</span>
          </span>
        </div>
        <!-- 黑胶唱片 -->
        <div style="display:flex;justify-content:center;">
          <div id="netease-disc" title="点击换封面" style="width:200px;height:200px;border-radius:50%;position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;animation:discspin 18s linear infinite;animation-play-state:${audio.paused?'paused':'running'};box-shadow:0 16px 50px rgba(0,0,0,.45),inset 0 0 0 2px #000;background:#0c0c0e;background-image:radial-gradient(circle at 32% 28%,rgba(255,255,255,.10),rgba(255,255,255,0) 42%),repeating-radial-gradient(circle at 50% 50%,rgba(255,255,255,.05) 0 1px,transparent 1px 4px);">
            <div style="position:absolute;inset:-3px;border-radius:50%;border:4px solid rgba(220,220,220,.06);pointer-events:none;"></div>
            <div id="netease-cover" style="width:78%;height:78%;border-radius:50%;overflow:hidden;position:relative;box-shadow:0 0 0 4px rgba(0,0,0,.55),0 0 0 5px rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;background:#222;">
              ${discImg ? `<img src="${discImg}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>` : `<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1" style="width:40px;height:40px;"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`}
            </div>
          </div>
        </div>
        <!-- 歌名 -->
        <div style="text-align:center;margin-top:18px;">
          <div style="font-size:15px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
          <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:3px;">${artist}</div>
          <div style="font-size:10px;color:rgba(255,255,255,.25);margin-top:4px;">👆 点唱片换封面</div>
        </div>
        <!-- 进度条 -->
        <div style="margin-top:16px;">
          <div style="display:flex;justify-content:space-between;font-size:10px;color:rgba(255,255,255,.4);margin-bottom:4px;">
            <span id="netease-cur">0:00</span><span id="netease-dur">0:00</span>
          </div>
          <input type="range" id="netease-seek" min="0" max="100" value="0" style="width:100%;height:3px;-webkit-appearance:none;appearance:none;background:rgba(255,255,255,.15);border-radius:2px;outline:0;accent-color:${accent};"/>
        </div>
        <!-- 控制按钮 -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px 0;">
          <button id="netease-mode" style="background:none;border:none;color:rgba(255,255,255,.7);font-size:16px;cursor:pointer;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">🔁</button>
          <button id="netease-prev" style="background:none;border:none;color:rgba(255,255,255,.9);cursor:pointer;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" fill="rgba(255,255,255,.9)" width="26" height="26"><path d="M18 18L9 12l9-6v12zM6 5h2v14H6z"/></svg>
          </button>
          <button id="netease-pp" style="width:52px;height:52px;background:none;border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;">
            <svg id="netease-pp-ico" viewBox="0 0 24 24" fill="#fff" width="30" height="30"><path d="M8 5.5v13l11-6.5z"/></svg>
          </button>
          <button id="netease-next" style="background:none;border:none;color:rgba(255,255,255,.9);cursor:pointer;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" fill="rgba(255,255,255,.9)" width="26" height="26"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
          <button id="netease-search2" style="background:none;border:none;color:rgba(255,255,255,.7);font-size:16px;cursor:pointer;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">📋</button>
        </div>
        <input type="file" id="netease-file" accept="image/*" style="display:none;"/>
        <style>@keyframes discspin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        #netease-seek::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;border-radius:50%;background:${accent};cursor:pointer;}
        #netease-seek::-moz-range-thumb{width:11px;height:11px;border-radius:50%;background:${accent};cursor:pointer;border:none;}
        </style>
      </div>`;

    el.querySelector("#netease-disc").onclick = () => el.querySelector("#netease-file").click();
    el.querySelector("#netease-file").onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r2 = new FileReader();
      r2.onload = () => { discImg = r2.result; localStorage.setItem("td_music_disc", discImg); if (currentSong) showPlayer(currentSong.name, currentSong.artist); };
      r2.readAsDataURL(f);
    };

    const pp = el.querySelector("#netease-pp");
    const ppIco = el.querySelector("#netease-pp-ico");
    pp.onclick = () => {
      if (audio.paused) { audio.play(); ppIco.innerHTML = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'; el.querySelector("#netease-disc").style.animationPlayState = "running"; }
      else { audio.pause(); ppIco.innerHTML = '<path d="M8 5.5v13l11-6.5z"/>'; el.querySelector("#netease-disc").style.animationPlayState = "paused"; }
    };
    el.querySelector("#netease-search").onclick = () => showSearchPanel("");
    el.querySelector("#netease-search2").onclick = () => showSearchPanel("");
    el.querySelector("#netease-set").onclick = () => showSettings();
    el.querySelector("#netease-logout").onclick = async () => { await api("logout"); loadState(); };

    audio.ontimeupdate = () => {
      const sk = document.getElementById("netease-seek");
      if (sk && !sk.dragging) sk.value = audio.duration ? (audio.currentTime / audio.duration * 100) : 0;
      const c = document.getElementById("netease-cur"); if (c) c.textContent = fmt(audio.currentTime);
    };
    audio.ondurationchange = () => { const d = document.getElementById("netease-dur"); if (d) d.textContent = fmt(audio.duration); };
    audio.onpause = () => { const p = document.getElementById("netease-pp-ico"); if (p) p.innerHTML = '<path d="M8 5.5v13l11-6.5z"/>'; const dc = document.getElementById("netease-disc"); if (dc) dc.style.animationPlayState = "paused"; };
    audio.onplay = () => { const p = document.getElementById("netease-pp-ico"); if (p) p.innerHTML = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'; const dc = document.getElementById("netease-disc"); if (dc) dc.style.animationPlayState = "running"; };

    const sk = el.querySelector("#netease-seek");
    sk.addEventListener("input", () => { if (audio.duration) audio.currentTime = sk.value / 100 * audio.duration; });
  }

  function showSettings() {
    stopTimer();
    const colors = ["#1ec96b","#ff6b9d","#6c5ce7","#fdcb6e","#00cec9","#ff7675","#74b9ff","#a29bfe"];
    const el = root();
    el.innerHTML = `
      <div style="background:#0c0c0e;border-radius:16px;padding:20px 16px;color:#fff;">
        <div style="font-size:15px;font-weight:600;margin-bottom:18px;">⚙️ 音乐设置</div>
        <div style="font-size:12px;color:rgba(255,255,255,.5);margin-bottom:10px;">按钮颜色</div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px;">
          ${colors.map(c => `<div class="ncolor" data-c="${c}" style="width:36px;height:36px;border-radius:50%;background:${c};cursor:pointer;border:${c===accent?'3px solid #fff':'3px solid transparent'};"></div>`).join("")}
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,.5);margin-bottom:10px;">唱片封面</div>
        ${discImg ? `<div style="width:80px;height:80px;border-radius:50%;overflow:hidden;margin-bottom:10px;border:3px solid rgba(255,255,255,.2);"><img src="${discImg}" style="width:100%;height:100%;object-fit:cover;"/></div>` : ''}
        <button id="netease-up" style="width:100%;padding:12px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:10px;color:#fff;font-size:13px;cursor:pointer;">📷 上传自定义封面</button>
        ${discImg ? '<button id="netease-delcov" style="width:100%;padding:10px;margin-top:8px;background:none;border:none;color:#ff6b9d;font-size:12px;cursor:pointer;">🗑 恢复默认封面</button>' : ''}
        <div style="margin-top:24px;font-size:12px;color:rgba(255,255,255,.5);cursor:pointer;text-align:center;" id="netease-setback">← 返回播放</div>
        <input type="file" id="netease-setfile" accept="image/*" style="display:none;"/>
      </div>`;
    el.querySelector("#netease-setback").onclick = () => showSearch("");
    el.querySelectorAll(".ncolor").forEach(c => c.onclick = () => {
      accent = c.dataset.c; localStorage.setItem("td_music_color", accent); showSettings();
    });
    el.querySelector("#netease-up").onclick = () => el.querySelector("#netease-setfile").click();
    el.querySelector("#netease-setfile").onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r2 = new FileReader();
      r2.onload = () => { discImg = r2.result; localStorage.setItem("td_music_disc", discImg); showSettings(); };
      r2.readAsDataURL(f);
    };
    const dc = el.querySelector("#netease-delcov");
    if (dc) dc.onclick = () => { discImg = ""; localStorage.removeItem("td_music_disc"); showSettings(); };
  }

  function fmt(s) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ":" + (sec < 10 ? "0" : "") + sec;
  }

  // 等待页面加载后初始化
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // === 大唱片同步（联动 Theodore 现有播放器）===
  function syncBigDisc() {
    const audio = document.getElementById("m-audio");
    if (!audio) return;
    const songEl = document.getElementById("big-disc-song");
    const artEl = document.getElementById("big-disc-artist");
    const fillEl = document.getElementById("big-disc-fill");
    const curEl = document.getElementById("big-disc-cur");
    const durEl = document.getElementById("big-disc-dur");
    const discEl = document.getElementById("big-disc");
    const playIco = document.getElementById("big-disc-play-ico");
    const mwSong = document.getElementById("mw-song");
    const mwArtist = document.getElementById("mw-artist");
    const mwCover = document.getElementById("mw-cover");
    const bigCover = document.getElementById("big-disc-cover");

    if (songEl) songEl.textContent = (mwSong && mwSong.textContent) || "未在播放";
    if (artEl) artEl.textContent = (mwArtist && mwArtist.textContent) || "";
    if (fillEl && audio.duration) fillEl.style.width = (audio.currentTime / audio.duration * 100) + "%";
    if (curEl) curEl.textContent = fmt(audio.currentTime);
    if (durEl) durEl.textContent = fmt(audio.duration);
    if (discEl) discEl.classList.toggle("playing", !audio.paused);
    if (playIco) playIco.innerHTML = audio.paused
      ? '<path d="M8 5.5v13l11-6.5z"/>'
      : '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
    // 同步封面
    if (bigCover && mwCover) {
      const img = mwCover.querySelector("img");
      if (img && img.src) {
        bigCover.innerHTML = '<img src="' + img.src + '"/>';
      }
    }
  }
  setInterval(syncBigDisc, 800);
  setTimeout(() => {
    const pp = document.getElementById("big-disc-play");
    if (pp) pp.onclick = () => document.getElementById("mw-play")?.click();
    const pv = document.getElementById("big-disc-prev");
    if (pv) pv.onclick = () => document.getElementById("mw-prev")?.click();
    const nx = document.getElementById("big-disc-next");
    if (nx) nx.onclick = () => document.getElementById("mw-next")?.click();
    const bar = document.querySelector(".big-disc-bar");
    if (bar) bar.onclick = (e) => {
      const audio = document.getElementById("m-audio");
      if (!audio || !audio.duration) return;
      const rect = bar.getBoundingClientRect();
      audio.currentTime = (e.clientX - rect.left) / rect.width * audio.duration;
    };
  }, 500);
})();
