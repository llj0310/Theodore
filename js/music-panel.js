// Theodore 网易云音乐面板 - 美化版（旋转唱片+自定义封面+计时+自定义颜色）
(function(){
  const API = "https://bfhusuwmgggqrahfrdsr.supabase.co/functions/v1/netease";
  let d = localStorage.getItem("td_music_id");
  if (!d) { d = "d" + Math.random().toString(36).slice(2, 10); localStorage.setItem("td_music_id", d); }

  // 读取自定义设置
  let accent = localStorage.getItem("td_music_color") || "#1ec96b";
  let discImg = localStorage.getItem("td_music_disc") || "";

  // 浮动按钮
  const fab = document.createElement("div");
  fab.style.cssText = `position:fixed;right:16px;bottom:100px;width:50px;height:50px;border-radius:50%;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer;z-index:99999;box-shadow:0 4px 14px ${accent}66;`;
  fab.innerHTML = "🎵";
  document.body.appendChild(fab);

  // 面板
  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:78vh;background:linear-gradient(180deg,#1a1a2e 0%,#16213e 100%);border-radius:20px 20px 0 0;z-index:100000;display:none;flex-direction:column;color:#fff;font-family:-apple-system,sans-serif;box-shadow:0 -4px 30px rgba(0,0,0,.4);";
  panel.innerHTML = `
    <div style="padding:14px 20px 8px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:15px;font-weight:600;opacity:.9;">🎵 一起听</span>
      <div style="display:flex;gap:14px;align-items:center;">
        <span id="mp-set" style="cursor:pointer;font-size:16px;opacity:.6;">⚙️</span>
        <span id="mp-close" style="cursor:pointer;font-size:22px;opacity:.6;">×</span>
      </div>
    </div>
    <div id="mp-body" style="flex:1;overflow-y:auto;padding:0 20px;"></div>
  `;
  document.body.appendChild(panel);

  const body = panel.querySelector("#mp-body");
  fab.onclick = () => { panel.style.display = "flex"; st(); };
  panel.querySelector("#mp-close").onclick = () => { panel.style.display = "none"; audio.pause(); stopTimer(); };
  panel.querySelector("#mp-set").onclick = () => showSettings();

  const audio = new Audio();
  audio.crossOrigin = "anonymous";

  // 计时
  let timerStart = 0, timerInt = null;
  function startTimer() { timerStart = Date.now(); timerInt = setInterval(updateTimer, 1000); updateTimer(); }
  function stopTimer() { clearInterval(timerInt); timerInt = null; }
  function updateTimer() {
    const el = document.getElementById("listen-time");
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
      <div style="font-size:12px;opacity:.6;margin-bottom:10px;">已登录：${nickname || "网易云用户"} <span id="logout" style="opacity:.8;cursor:pointer;float:right;color:${accent};">退出</span></div>
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
    stopTimer(); startTimer();
    showPlayer(name, artist);
  }

  function showPlayer(name, artist) {
    const coverHtml = discImg
      ? `<img src="${discImg}" style="width:140px;height:140px;border-radius:50%;object-fit:cover;">`
      : `<div style="width:140px;height:140px;border-radius:50%;background:linear-gradient(135deg,#333,#111);display:flex;align-items:center;justify-content:center;font-size:40px;">🎵</div>`;

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;padding-top:6px;">
        <div id="listen-time" style="font-size:11px;opacity:.5;margin-bottom:10px;">已一起听 0:00</div>
        <!-- 旋转唱片（点击换图） -->
        <div id="disc" title="点击换封面" style="width:180px;height:180px;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center;position:relative;box-shadow:0 0 30px ${accent}33;animation:spin 8s linear infinite;cursor:pointer;">
          <div id="disc-cover" style="width:140px;height:140px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;">${coverHtml}</div>
          <div style="position:absolute;top:50%;left:50%;width:12px;height:12px;background:${accent};border-radius:50%;transform:translate(-50%,-50%);z-index:2;"></div>
        </div>
        <div style="margin-top:18px;font-size:16px;font-weight:600;">${name}</div>
        <div style="font-size:13px;opacity:.6;margin-top:4px;">${artist}</div>
        <div style="font-size:10px;opacity:.35;margin-top:4px;">👆 点唱片换封面</div>
        <!-- 进度条 -->
        <div style="width:100%;margin-top:18px;">
          <input type="range" id="seek" min="0" max="100" value="0" style="width:100%;accent-color:${accent};"/>
          <div style="display:flex;justify-content:space-between;font-size:11px;opacity:.5;margin-top:2px;">
            <span id="cur">0:00</span><span id="dur">0:00</span>
          </div>
        </div>
        <!-- 控制按钮 -->
        <div style="display:flex;align-items:center;gap:30px;margin-top:18px;">
          <span style="font-size:22px;opacity:.5;cursor:pointer;" id="prev">⏮</span>
          <span id="pp" style="width:56px;height:56px;border-radius:50%;background:${accent};display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;box-shadow:0 4px 14px ${accent}66;">⏸</span>
          <span style="font-size:22px;opacity:.5;cursor:pointer;" id="next">⏭</span>
        </div>
        <div id="back-search" style="margin-top:20px;font-size:13px;opacity:.6;cursor:pointer;">🔍 返回搜索</div>
      </div>
      <input type="file" id="disc-file" accept="image/*" style="display:none;"/>
      <style>@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>`;

    // 点击唱片换图
    body.querySelector("#disc").onclick = () => body.querySelector("#disc-file").click();
    body.querySelector("#disc-file").onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        discImg = reader.result;
        localStorage.setItem("td_music_disc", discImg);
        showPlayer(currentSong.name, currentSong.artist);
      };
      reader.readAsDataURL(f);
    };

    const pp = body.querySelector("#pp");
    pp.onclick = () => { audio.paused ? (audio.play(), pp.textContent = "⏸") : (audio.pause(), pp.textContent = "▶"); };
    body.querySelector("#back-search").onclick = () => showSearch("");

    audio.ontimeupdate = () => {
      const seek = body.querySelector("#seek");
      if (seek && !seek.dragging) seek.value = audio.duration ? (audio.currentTime / audio.duration * 100) : 0;
      body.querySelector("#cur").textContent = fmt(audio.currentTime);
    };
    audio.ondurationchange = () => { body.querySelector("#dur").textContent = fmt(audio.duration); };
    audio.onpause = () => { body.querySelector("#pp").textContent = "▶"; document.getElementById("disc").style.animationPlayState = "paused"; };
    audio.onplay = () => { body.querySelector("#pp").textContent = "⏸"; document.getElementById("disc").style.animationPlayState = "running"; };

    const seek = body.querySelector("#seek");
    seek.addEventListener("input", () => { if (audio.duration) audio.currentTime = seek.value / 100 * audio.duration; });
  }

  function showSettings() {
    stopTimer();
    const colors = ["#1ec96b","#ff6b9d","#6c5ce7","#fdcb6e","#00cec9","#ff7675","#74b9ff","#a29bfe"];
    body.innerHTML = `
      <div style="padding-top:10px;">
        <div style="font-size:14px;font-weight:600;margin-bottom:14px;">⚙️ 音乐设置</div>
        <div style="font-size:12px;opacity:.6;margin-bottom:8px;">按钮颜色</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
          ${colors.map(c => `<div class="color-opt" data-c="${c}" style="width:36px;height:36px;border-radius:50%;background:${c};cursor:pointer;border:${c===accent?'3px solid #fff':'3px solid transparent'};"></div>`).join("")}
        </div>
        <div style="font-size:12px;opacity:.6;margin-bottom:8px;">唱片封面</div>
        <button id="up-cover" style="width:100%;padding:11px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:10px;color:#fff;font-size:13px;cursor:pointer;">📷 上传自定义封面</button>
        ${discImg ? '<button id="del-cover" style="width:100%;padding:10px;margin-top:8px;background:none;border:none;color:#ff6b9d;font-size:12px;cursor:pointer;">🗑 恢复默认封面</button>' : ''}
        <div id="back" style="margin-top:24px;font-size:13px;opacity:.6;cursor:pointer;text-align:center;">← 返回</div>
        <input type="file" id="set-file" accept="image/*" style="display:none;"/>
      </div>`;
    body.querySelector("#back").onclick = () => st();
    body.querySelectorAll(".color-opt").forEach(el => el.onclick = () => {
      accent = el.dataset.c;
      localStorage.setItem("td_music_color", accent);
      fab.style.background = accent;
      fab.style.boxShadow = `0 4px 14px ${accent}66`;
      showSettings();
    });
    body.querySelector("#up-cover").onclick = () => body.querySelector("#set-file").click();
    body.querySelector("#set-file").onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { discImg = reader.result; localStorage.setItem("td_music_disc", discImg); showSettings(); };
      reader.readAsDataURL(f);
    };
    const del = body.querySelector("#del-cover");
    if (del) del.onclick = () => { discImg = ""; localStorage.removeItem("td_music_disc"); showSettings(); };
  }

  function fmt(s) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ":" + (sec < 10 ? "0" : "") + sec;
  }
})();
