// Theodore 网易云音乐面板 - 美化版（旋转唱片播放器）
(function(){
  const API = "https://bfhusuwmgggqrahfrdsr.supabase.co/functions/v1/netease";
  let d = localStorage.getItem("td_music_id");
  if (!d) { d = "d" + Math.random().toString(36).slice(2, 10); localStorage.setItem("td_music_id", d); }

  // 浮动按钮
  const fab = document.createElement("div");
  fab.style.cssText = "position:fixed;right:16px;bottom:100px;width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#1ec96b,#16a35a);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer;z-index:99999;box-shadow:0 4px 14px rgba(30,201,107,.4);";
  fab.innerHTML = "🎵";
  document.body.appendChild(fab);

  // 面板（底部弹出）
  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:75vh;background:linear-gradient(180deg,#1a1a2e 0%,#16213e 100%);border-radius:20px 20px 0 0;z-index:100000;display:none;flex-direction:column;color:#fff;font-family:-apple-system,sans-serif;box-shadow:0 -4px 30px rgba(0,0,0,.4);transition:transform .3s;";
  panel.innerHTML = `
    <div style="padding:14px 20px 8px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:15px;font-weight:600;opacity:.9;">🎵 一起听</span>
      <span id="mp-close" style="cursor:pointer;font-size:22px;opacity:.6;">×</span>
    </div>
    <div id="mp-body" style="flex:1;overflow-y:auto;padding:0 20px;"></div>
  `;
  document.body.appendChild(panel);

  const body = panel.querySelector("#mp-body");
  fab.onclick = () => { panel.style.display = "flex"; st(); };
  panel.querySelector("#mp-close").onclick = () => { panel.style.display = "none"; audio.pause(); };

  const audio = new Audio();
  audio.crossOrigin = "anonymous";

  async function api(f, q = {}) {
    const u = new URLSearchParams({ action: f, device_id: d, ...q });
    const r = await fetch(API + "?" + u);
    return r.json();
  }

  async function st() {
    body.innerHTML = '<div style="text-align:center;opacity:.5;padding:40px;">加载中...</div>';
    const s = await api("state");
    s.log ? showSearch(s.nickname) : showLogin();
  }

  function showLogin() {
    body.innerHTML = `
      <div style="text-align:center;padding-top:20px;">
        <div style="font-size:14px;opacity:.8;margin-bottom:16px;">扫码登录网易云</div>
        <div style="width:180px;height:180px;margin:0 auto;background:#fff;border-radius:16px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
          <span style="color:#999;font-size:12px;">生成中...</span>
        </div>
        <div id="qr-st" style="font-size:12px;opacity:.6;margin-top:14px;">用网易云App扫码</div>
      </div>`;
    genQr();
  }

  async function genQr() {
    const r = await api("qrkey");
    if (!r.key) return;
    const box = body.querySelector("div[style*='width:180px']");
    box.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent("https://music.163.com/login?codekey=" + r.key)}" style="width:180px;height:180px;">`;
    pollQr(r.key);
  }

  async function pollQr(key) {
    const t = setInterval(async () => {
      const r = await api("qrcheck", { key });
      const s = body.querySelector("#qr-st");
      if (r.code === 801) s.textContent = "等待扫码...";
      else if (r.code === 802) s.textContent = "请在手机确认...";
      else if (r.code === 800) { s.textContent = "过期了，重新生成"; clearInterval(t); genQr(); }
      else if (r.code === 803) { s.textContent = "登录成功！"; clearInterval(t); setTimeout(st, 1500); }
    }, 2000);
  }

  function showSearch(nickname) {
    body.innerHTML = `
      <div style="font-size:12px;opacity:.6;margin-bottom:10px;">已登录：${nickname || "网易云用户"} <span id="logout" style="opacity:.8;cursor:pointer;float:right;color:#1ec96b;">退出</span></div>
      <input id="kw" placeholder="🔍 搜索歌曲..." style="width:100%;box-sizing:border-box;padding:11px 14px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:10px;color:#fff;font-size:14px;outline:none;"/>
      <div id="results" style="margin-top:12px;"></div>`;
    body.querySelector("#logout").onclick = async () => { await api("logout"); st(); };
    body.querySelector("#kw").addEventListener("keydown", async e => {
      if (e.key !== "Enter") return;
      const kw = e.target.value.trim();
      if (!kw) return;
      const rs = body.querySelector("#results");
      rs.innerHTML = '<div style="opacity:.5;font-size:13px;padding:10px;">搜索中...</div>';
      const r = await api("search", { keyword: kw });
      if (!r.songs || !r.songs.length) { rs.innerHTML = "<div style='opacity:.5;font-size:13px;padding:10px;'>没找到</div>"; return; }
      rs.innerHTML = r.songs.map((s, i) => `
        <div class="song" data-i="${i}" data-id="${s.id}" data-name="${s.name}" data-artist="${s.artist}" style="padding:10px 4px;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer;display:flex;align-items:center;gap:10px;">
          <span style="opacity:.4;font-size:12px;width:18px;">${i+1}</span>
          <div>
            <div style="font-size:13px;">${s.name}</div>
            <div style="font-size:11px;opacity:.5;">${s.artist}</div>
          </div>
        </div>`).join("");
      rs.querySelectorAll(".song").forEach(el => el.onclick = () => play(el.dataset.id, el.dataset.name, el.dataset.artist));
    });
  }

  let currentSong = null;

  async function play(id, name, artist) {
    const r = await api("url", { id });
    if (!r.url) { alert("这首歌不能播放（VIP或版权限制）"); return; }
    currentSong = { id, name, artist };
    audio.src = r.url;
    audio.play();
    showPlayer(name, artist);
  }

  function showPlayer(name, artist) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;padding-top:10px;">
        <!-- 旋转唱片 -->
        <div id="disc" style="width:180px;height:180px;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center;position:relative;box-shadow:0 0 30px rgba(30,201,107,.2);animation:spin 8s linear infinite;">
          <div id="disc-cover" style="width:140px;height:140px;border-radius:50%;background:linear-gradient(135deg,#333,#111);display:flex;align-items:center;justify-content:center;font-size:40px;">🎵</div>
          <div style="position:absolute;top:50%;left:50%;width:12px;height:12px;background:#1ec96b;border-radius:50%;transform:translate(-50%,-50%);"></div>
        </div>
        <div style="margin-top:18px;font-size:16px;font-weight:600;">${name}</div>
        <div style="font-size:13px;opacity:.6;margin-top:4px;">${artist}</div>
        <!-- 进度条 -->
        <div style="width:100%;margin-top:20px;">
          <input type="range" id="seek" min="0" max="100" value="0" style="width:100%;accent-color:#1ec96b;"/>
          <div style="display:flex;justify-content:space-between;font-size:11px;opacity:.5;margin-top:2px;">
            <span id="cur">0:00</span><span id="dur">0:00</span>
          </div>
        </div>
        <!-- 控制按钮 -->
        <div style="display:flex;align-items:center;gap:30px;margin-top:20px;">
          <span style="font-size:22px;opacity:.5;cursor:pointer;" id="prev">⏮</span>
          <span id="pp" style="width:56px;height:56px;border-radius:50%;background:#1ec96b;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;box-shadow:0 4px 14px rgba(30,201,107,.4);">⏸</span>
          <span style="font-size:22px;opacity:.5;cursor:pointer;" id="next">⏭</span>
        </div>
        <div id="back-search" style="margin-top:24px;font-size:13px;opacity:.6;cursor:pointer;">🔍 返回搜索</div>
      </div>
      <style>@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>`;

    const pp = body.querySelector("#pp");
    pp.onclick = () => { audio.paused ? (audio.play(), pp.textContent = "⏸") : (audio.pause(), pp.textContent = "▶"); };
    body.querySelector("#back-search").onclick = () => showSearch(localStorage.getItem("td_music_nick") || "");

    audio.ontimeupdate = () => {
      const seek = body.querySelector("#seek");
      if (seek && !seek.dragging) {
        seek.value = audio.duration ? (audio.currentTime / audio.duration * 100) : 0;
      }
      body.querySelector("#cur").textContent = fmt(audio.currentTime);
    };
    audio.ondurationchange = () => { body.querySelector("#dur").textContent = fmt(audio.duration); };
    audio.onpause = () => { body.querySelector("#pp").textContent = "▶"; document.getElementById("disc").style.animationPlayState = "paused"; };
    audio.onplay = () => { body.querySelector("#pp").textContent = "⏸"; document.getElementById("disc").style.animationPlayState = "running"; };

    const seek = body.querySelector("#seek");
    seek.addEventListener("input", () => { if (audio.duration) audio.currentTime = seek.value / 100 * audio.duration; });
  }

  function fmt(s) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ":" + (sec < 10 ? "0" : "") + sec;
  }
})();
