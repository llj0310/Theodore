// Theodore 网易云音乐面板 - 一起听
(function(){
  const API = "https://bfhusuwmgggqrahfrdsr.supabase.co/functions/v1/netease";
  let d = localStorage.getItem("td_music_id");
  if (!d) { d = "d" + Math.random().toString(36).slice(2, 10); localStorage.setItem("td_music_id", d); }

  const b = document.createElement("div");
  b.style.cssText = "position:fixed;right:14px;bottom:90px;width:46px;height:46px;border-radius:50%;background:#1ec96b;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,.3)";
  b.textContent = "🎵";
  document.body.appendChild(b);

  const p = document.createElement("div");
  p.style.cssText = "position:fixed;right:10px;bottom:145px;width:300px;max-height:450px;background:#fff;border-radius:14px;box-shadow:0 4px 20px rgba(0,0,0,.25);z-index:99999;display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,sans-serif";
  p.innerHTML = '<div style="background:linear-gradient(135deg,#1ec96b,#16a35a);color:#fff;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;font-weight:600">🎵 一起听<span id="mc" style="cursor:pointer">×</span></div><div id="mb" style="padding:12px;overflow-y:auto;flex:1"></div><div id="mp" style="border-top:1px solid #eee;padding:8px 12px;display:none"><div id="mn" style="font-size:11px;color:#666;margin-bottom:4px"></div><audio id="ma" controls style="width:100%;height:32px"></audio></div>';
  document.body.appendChild(p);

  const mb = p.querySelector("#mb"), mp = p.querySelector("#mp"), ma = p.querySelector("#ma"), mn = p.querySelector("#mn");
  b.onclick = () => { p.style.display = p.style.display === "none" ? "flex" : "none"; if (p.style.display === "flex") st(); };
  p.querySelector("#mc").onclick = () => p.style.display = "none";

  async function a(f, q = {}) {
    const u = new URLSearchParams({ action: f, device_id: d, ...q });
    const r = await fetch(API + "?" + u);
    return r.json();
  }

  async function st() {
    mb.innerHTML = '<div style="text-align:center;color:#999;padding:20px">加载中...</div>';
    const s = await a("state");
    s.log ? sr(s.nickname) : lg();
  }

  function lg() {
    mb.innerHTML = '<div style="text-align:center"><div style="font-size:13px;color:#333;margin-bottom:8px">扫码登录网易云</div><div id="qb" style="width:160px;height:160px;margin:0 auto;background:#f5f5f5;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px">生成中...</div><div id="qs" style="font-size:11px;color:#999;margin-top:8px">用网易云App扫码</div></div>';
    qr();
  }

  async function qr() {
    const r = await a("qrkey");
    if (!r.key) { mb.innerHTML = "<div style='color:red;font-size:12px'>生成失败</div>"; return; }
    mb.querySelector("#qb").innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent("https://music.163.com/login?codekey=" + r.key) + '" style="width:160px;height:160px;border-radius:10px">';
    pk(r.key);
  }

  async function pk(k) {
    const t = setInterval(async () => {
      const r = await a("qrcheck", { key: k });
      const s = mb.querySelector("#qs");
      if (r.code === 801) s.textContent = "等待扫码...";
      else if (r.code === 802) s.textContent = "请在手机确认...";
      else if (r.code === 800) { s.textContent = "过期了，刷新"; clearInterval(t); qr(); }
      else if (r.code === 803) { s.textContent = "登录成功！"; clearInterval(t); setTimeout(st, 1500); }
    }, 2000);
  }

  function sr(n) {
    mb.innerHTML = '<div style="font-size:11px;color:#666;margin-bottom:6px">已登录：' + (n || "网易云用户") + ' <span id="lo" style="color:#1ec96b;cursor:pointer;float:right">退出</span></div><input id="kw" placeholder="搜索歌曲..." style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px;outline:none"/><div id="rs" style="margin-top:8px"></div>';
    mb.querySelector("#lo").onclick = async () => { await a("logout"); st(); };
    mb.querySelector("#kw").addEventListener("keydown", async e => {
      if (e.key !== "Enter") return;
      const k = e.target.value.trim();
      if (!k) return;
      const rs = mb.querySelector("#rs");
      rs.innerHTML = '<div style="color:#999;font-size:12px;padding:6px">搜索中...</div>';
      const r = await a("search", { keyword: k });
      if (!r.songs || !r.songs.length) { rs.innerHTML = "<div style='color:#999;font-size:12px;padding:6px'>没找到</div>"; return; }
      rs.innerHTML = r.songs.map(s => '<div class="si" data-id="' + s.id + '" data-n="' + s.name + '" data-a="' + s.artist + '" style="padding:8px;border-bottom:1px solid #f0f0f0;cursor:pointer"><div style="font-size:12px;color:#333">' + s.name + '</div><div style="font-size:10px;color:#999">' + s.artist + '</div></div>').join("");
      rs.querySelectorAll(".si").forEach(el => el.onclick = () => pl(el.dataset.id, el.dataset.n, el.dataset.a));
    });
  }

  async function pl(id, n, ar) {
    const r = await a("url", { id });
    if (!r.url) { alert("不能播放（VIP或版权限制）"); return; }
    mp.style.display = "block";
    mn.textContent = n + " - " + ar;
    ma.src = r.url;
    ma.play();
  }
})();
