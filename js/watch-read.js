/* watch-read.js — 二改新增：「一起看」（看电视 / 读小说），仅自用
   复用站内机制：字卡分类（watch / read，可在字卡库自定义、回复设置调概率）、聊天注入、图片/文本导入。
   说明：本地视频文件不持久化（只当次播放，避免把备份撑爆）；小说正文存在独立命名空间（不随备份走），
   只持久化「视频直链 / 小说进度 / 弹幕记录」。 */
(function () { try {
(function () {
const NS_CFG = 'wr-config';
const NS_DAN = 'wr-danmaku';
const NS_NOVEL_META = 'wr-novel-meta';
const IDB_NOVEL = 'theodore-wr:novel';   // 小说正文（非 xy-home-v2: 前缀 → 不进备份）

const FB_WATCH = ['这个镜头好。', '配乐不错。', '我更喜欢上一段。', '你专心看，我不吵。', '光线挺好的。', '这段有点长。'];
const FB_READ = ['这一段好看。', '我在这里停了很久。', '写得好啊。', '这句我想抄下来。', '你读得比我快。', '别急着翻页。'];
const FB_REPLY = ['嗯，我也这么觉得。', '你居然注意到这里。', '我也是。', '被你说中了。', '继续看吧。'];

function store() { try { return window.activeStore ? window.activeStore() : (window.xyStore ? window.xyStore('xy-home-v2') : null); } catch (e) { return null; } }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pick(a) { return a && a.length ? a[Math.floor(Math.random() * a.length)] : ''; }
function toast(m) { try { if (window.toast) window.toast(m); } catch (e) {} }
function partnerName() { try { return window.chatPartnerName ? window.chatPartnerName() : 'TA'; } catch (e) { return 'TA'; } }
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()); }
function pool(cat, group, fb) { try { return (window.getLibPool ? window.getLibPool(cat, group, fb, true) : (fb || [])).slice(); } catch (e) { return (fb || []).slice(); } }
function pctOf(cat) { try { return window.dcfGet ? window.dcfGet(cat) : 30; } catch (e) { return 30; } }

/* ---------- 配置 ---------- */
function cfg() {
let o = null;
try { const s = store(); o = s ? JSON.parse(s.get(NS_CFG) || 'null') : null; } catch (e) { o = null; }
if (!o || typeof o !== 'object') o = {};
if (o.watchOn === undefined) o.watchOn = true;
if (o.watchGap === undefined || isNaN(o.watchGap)) o.watchGap = 20;   // 看电视：每隔多少秒判定一次
if (o.readOn === undefined) o.readOn = true;
if (o.readGap === undefined || isNaN(o.readGap)) o.readGap = 30;      // 读小说：每隔多少秒判定一次
if (o.replyPct === undefined || isNaN(o.replyPct)) o.replyPct = 60;   // TA 回复你弹幕的概率
return o;
}
function cfgSet(p) { try { const s = store(); if (s) { const o = cfg(); for (const k in p) o[k] = p[k]; s.set(NS_CFG, JSON.stringify(o)); } } catch (e) {} }

/* ---------- 弹幕记录 ---------- */
function danLoad() { try { const s = store(); const a = s ? JSON.parse(s.get(NS_DAN) || '[]') : []; return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function danSave(a) { try { const s = store(); if (s) s.set(NS_DAN, JSON.stringify(a.slice(-200))); } catch (e) {} }

/* ---------- 页面 ---------- */
const host = (document.getElementById('page-phone') || {}).parentNode || document.body;
let videoEl = null, curTab = 'tv', watchTimer = null, readTimer = null;

function buildPage() {
if (document.getElementById('page-watchroad')) return;
const page = document.createElement('div');
page.className = 'page'; page.id = 'page-watchroad'; page.hidden = true;
page.innerHTML =
'<div class="chat-head"><span class="ch-back" id="wr-back"><svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></span><span class="ch-name">一起看</span></div>' +
'<div class="wr-body">' +
'<div class="wr-tabs"><button class="wr-tab sel" data-wtab="tv">一起看电视</button><button class="wr-tab" data-wtab="read">一起读小说</button></div>' +

'<div class="wr-panel" id="wr-panel-tv">' +
'<div class="wr-stage" id="wr-stage">' +
'<video id="wr-video" playsinline controls></video>' +
'<div class="wr-dan-layer" id="wr-dan-tv"></div>' +
'</div>' +
'<div class="wr-bar">' +
'<button class="wr-btn" id="wr-pick-video">选择本地视频</button>' +
'<button class="wr-btn" id="wr-url-video">粘贴视频链接</button>' +
'<button class="wr-btn wr-primary" id="wr-tv-say">让 TA 说一句</button>' +
'</div>' +
'<div class="wr-set-group">' +
'<div class="wr-row"><span>启用看电视看法</span><label class="toggle"><input type="checkbox" id="wr-watch-on"><span class="tk"></span></label></div>' +
'<div class="wr-row"><span>每隔</span><input class="wr-num" id="wr-watch-gap" type="number" min="5" max="300" step="5"><span>秒判定一次</span></div>' +
'</div>' +
'<div class="wr-hint">本地视频只在本次播放，不会存进备份（视频太大，会把备份撑爆）；视频**直链**会记住。TA 的看法概率在 设置 → 回复设置 →「看电视字卡概率」里调，0% = 不主动说。</div>' +
'</div>' +

'<div class="wr-panel" id="wr-panel-read" hidden>' +
'<div class="wr-reader-wrap">' +
'<div class="wr-reader" id="wr-reader"><div class="wr-read-hint">还没有小说：点下面「选择 txt 文件」或「粘贴文本」导入。</div></div>' +
'<div class="wr-dan-layer" id="wr-dan-read"></div>' +
'</div>' +
'<div class="wr-bar">' +
'<button class="wr-btn" id="wr-pick-novel">选择 txt 文件</button>' +
'<button class="wr-btn" id="wr-paste-novel">粘贴文本</button>' +
'<button class="wr-btn" id="wr-font-minus">A−</button>' +
'<button class="wr-btn" id="wr-font-plus">A+</button>' +
'<button class="wr-btn" id="wr-clear-novel">清空小说</button>' +
'</div>' +
'<div class="wr-dan-send"><input id="wr-dan-input" type="text" maxlength="60" placeholder="发一条弹幕…"><button class="wr-btn wr-primary" id="wr-dan-send">发送</button><button class="wr-btn" id="wr-dan-clear">清空弹幕</button></div>' +
'<div class="wr-set-group">' +
'<div class="wr-row"><span>启用读小说弹幕</span><label class="toggle"><input type="checkbox" id="wr-read-on"><span class="tk"></span></label></div>' +
'<div class="wr-row"><span>每隔</span><input class="wr-num" id="wr-read-gap" type="number" min="5" max="300" step="5"><span>秒判定一次</span></div>' +
'<div class="wr-row"><span>TA 回复我的弹幕</span><input class="wr-num" id="wr-reply-pct" type="number" min="0" max="100" step="10"><span>%</span></div>' +
'</div>' +
'<div class="wr-hint">弹幕只在页内飘，不会发到聊天。TA 的弹幕文案在 字卡库 → 读小说 里改（分组「弹幕」= TA 自己发的，「回你」= 回复你的弹幕）。所有弹幕都留在下面记录里。</div>' +
'</div>' +

'<div class="wr-dan-hist" id="wr-dan-hist"></div>' +
'</div>';
host.appendChild(page);

/* 事件 */
document.getElementById('wr-back').addEventListener('click', function () { stopAll(); backHome(page); });
Array.prototype.forEach.call(page.querySelectorAll('[data-wtab]'), function (b) {
b.addEventListener('click', function () {
curTab = b.getAttribute('data-wtab');
Array.prototype.forEach.call(page.querySelectorAll('[data-wtab]'), function (x) { x.classList.toggle('sel', x === b); });
document.getElementById('wr-panel-tv').hidden = (curTab !== 'tv');
document.getElementById('wr-panel-read').hidden = (curTab !== 'read');
});
});
document.getElementById('wr-pick-video').addEventListener('click', pickLocalVideo);
document.getElementById('wr-url-video').addEventListener('click', promptVideoUrl);
document.getElementById('wr-tv-say').addEventListener('click', function () { taComment(true); });
document.getElementById('wr-watch-on').addEventListener('change', function (ev) { cfgSet({ watchOn: !!ev.target.checked }); });
document.getElementById('wr-watch-gap').addEventListener('change', function (ev) { cfgSet({ watchGap: Math.max(5, Math.min(300, parseInt(ev.target.value, 10) || 20)) }); ev.target.value = cfg().watchGap; });
document.getElementById('wr-read-on').addEventListener('change', function (ev) { cfgSet({ readOn: !!ev.target.checked }); });
document.getElementById('wr-read-gap').addEventListener('change', function (ev) { cfgSet({ readGap: Math.max(5, Math.min(300, parseInt(ev.target.value, 10) || 30)) }); ev.target.value = cfg().readGap; });
document.getElementById('wr-reply-pct').addEventListener('change', function (ev) { cfgSet({ replyPct: Math.max(0, Math.min(100, parseInt(ev.target.value, 10) || 0)) }); ev.target.value = cfg().replyPct; });
document.getElementById('wr-pick-novel').addEventListener('click', pickNovelFile);
document.getElementById('wr-paste-novel').addEventListener('click', pasteNovel);
document.getElementById('wr-font-minus').addEventListener('click', function () { setFont(-1); });
document.getElementById('wr-font-plus').addEventListener('click', function () { setFont(1); });
document.getElementById('wr-clear-novel').addEventListener('click', clearNovel);
document.getElementById('wr-dan-send').addEventListener('click', sendMyDanmaku);
document.getElementById('wr-dan-input').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); sendMyDanmaku(); } });
document.getElementById('wr-dan-clear').addEventListener('click', function () { danSave([]); renderHistory(); toast('弹幕已清空'); });
videoEl = document.getElementById('wr-video');
videoEl.addEventListener('play', function () { startWatchTicker(); });
videoEl.addEventListener('pause', function () { stopWatchTicker(); });
videoEl.addEventListener('ended', function () { stopWatchTicker(); });
renderAll();
}

/* ---------- 电视 ---------- */
function pickLocalVideo() {
const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'video/*';
inp.addEventListener('change', function () {
const f = inp.files && inp.files[0]; if (!f) return;
try {
if (videoEl._url) { try { URL.revokeObjectURL(videoEl._url); } catch (e) {} }
videoEl._url = URL.createObjectURL(f);
videoEl.src = videoEl._url;
toast('已载入：' + f.name + '（本次有效，不会存进备份）');
} catch (e) { toast('载入失败'); }
});
inp.click();
}
function promptVideoUrl() {
if (!window.openModal) return;
const cur = (function () { try { return store().get('wr-video-url') || ''; } catch (e) { return ''; } })();
window.openModal('粘贴视频直链', '', function (v) {
const url = String(v || '').trim();
if (!url) return;
try { store().set('wr-video-url', url); } catch (e) {}
try {
if (videoEl._url) { try { URL.revokeObjectURL(videoEl._url); } catch (e) {} videoEl._url = null; }
videoEl.src = url;
toast('已载入链接');
} catch (e) { toast('链接无法播放'); }
}, { inputValue: cur, placeholder: 'https://....mp4' });
}
function restoreVideoUrl() {
try { const u = store().get('wr-video-url'); if (u && videoEl && !videoEl.src) videoEl.src = u; } catch (e) {}
}
// TA 的看法：飘一条 + 记录
function taComment(manual) {
const c = cfg();
if (!manual && !c.watchOn) return;
if (!manual && Math.random() * 100 >= pctOf('watch')) return;
const text = pick(pool('watch', '看法', FB_WATCH));
if (!text) return;
flyDanmaku('wr-dan-tv', 'ta', partnerName(), text);
pushHistory('ta', text, 'tv');
}
function startWatchTicker() {
stopWatchTicker();
const gap = Math.max(5, cfg().watchGap) * 1000;
watchTimer = setInterval(function () { if (!videoEl.paused) taComment(false); }, gap);
}
function stopWatchTicker() { if (watchTimer) { clearInterval(watchTimer); watchTimer = null; } }

/* ---------- 小说 ---------- */
let novelText = '';
function loadNovel() {
try {
if (!window.idbGet) return;
Promise.resolve(window.idbGet(IDB_NOVEL)).then(function (v) { if (v) { novelText = String(v); renderNovel(); } }).catch(function () {});
} catch (e) {}
}
function saveNovel(text, title) {
novelText = text;
try { if (window.idbSet) window.idbSet(IDB_NOVEL, text); } catch (e) {}
try { store().set(NS_NOVEL_META, JSON.stringify({ title: title || '', ts: Date.now() })); } catch (e) {}
renderNovel();
}
function pickNovelFile() {
const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.txt,text/plain';
inp.addEventListener('change', function () {
const f = inp.files && inp.files[0]; if (!f) return;
if (f.size > 4 * 1024 * 1024) { toast('文件太大（超过 4MB），请先切分'); return; }
const fr = new FileReader();
fr.onload = function () { saveNovel(String(fr.result || ''), f.name); toast('已导入：' + f.name); };
fr.onerror = function () { toast('读取失败'); };
fr.readAsText(f, 'utf-8');
});
inp.click();
}
function pasteNovel() {
if (!window.openModal) return;
window.openModal('粘贴小说文本', '', function (v) {
const t = String(v || '');
if (!t.trim()) return;
if (t.length > 4 * 1024 * 1024) { toast('文本太长（超过 4MB），请先切分'); return; }
saveNovel(t, '粘贴文本');
toast('已导入文本');
}, { big: true, textarea: true, placeholder: '把小说正文粘贴到这里…' });
}
function clearNovel() {
novelText = '';
try { if (window.idbDelete) window.idbDelete(IDB_NOVEL); } catch (e) {}
try { store().remove(NS_NOVEL_META); } catch (e) {}
renderNovel(); toast('已清空小说');
}
let fontSize = 15;
function setFont(d) { fontSize = Math.max(12, Math.min(24, fontSize + d)); renderNovel(); }
function renderNovel() {
const box = document.getElementById('wr-reader');
if (!box) return;
if (!novelText) { box.innerHTML = '<div class="wr-read-hint">还没有小说：点下面「选择 txt 文件」或「粘贴文本」导入。</div>'; return; }
const paras = novelText.split(/\n+/).filter(function (x) { return x.trim(); });
box.innerHTML = paras.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
box.style.fontSize = fontSize + 'px';
}
function taDanmaku() {
const c = cfg();
if (!c.readOn) return;
if (!novelText) return;
if (Math.random() * 100 >= pctOf('read')) return;
const text = pick(pool('read', '弹幕', FB_READ));
if (!text) return;
flyDanmaku('wr-dan-read', 'ta', partnerName(), text);
pushHistory('ta', text, 'read');
}
function sendMyDanmaku() {
const inp = document.getElementById('wr-dan-input');
if (!inp) return;
const t = String(inp.value || '').trim();
if (!t) return;
inp.value = '';
flyDanmaku('wr-dan-read', 'me', '我', t);
pushHistory('me', t, 'read');
// TA 可以选择回复，也可以不回复
if (Math.random() * 100 < (Number(cfg().replyPct) || 0)) {
setTimeout(function () {
const r = pick(pool('read', '回你', FB_REPLY));
if (!r) return;
flyDanmaku('wr-dan-read', 'ta', partnerName(), r);
pushHistory('ta', r, 'read');
}, randInt(900, 2600));
}
}
function startReadTicker() {
stopReadTicker();
const gap = Math.max(5, cfg().readGap) * 1000;
readTimer = setInterval(function () { taDanmaku(); }, gap);
}
function stopReadTicker() { if (readTimer) { clearInterval(readTimer); readTimer = null; } }
function stopAll() { stopWatchTicker(); stopReadTicker(); try { if (videoEl && !videoEl.paused) videoEl.pause(); } catch (e) {} }

/* ---------- 弹幕渲染 ---------- */
function flyDanmaku(layerId, who, name, text) {
const layer = document.getElementById(layerId);
if (!layer) return;
const d = document.createElement('div');
d.className = 'wr-dan ' + (who === 'me' ? 'me' : 'ta');
d.textContent = (name ? name + '：' : '') + text;
d.style.top = randInt(4, 70) + '%';
layer.appendChild(d);
setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 9000);
}
function pushHistory(who, text, tab) {
const a = danLoad();
a.push({ who: who, text: text, tab: tab, ts: Date.now() });
danSave(a);
renderHistory();
}
function renderHistory() {
const box = document.getElementById('wr-dan-hist');
if (!box) return;
const a = danLoad().slice(-60).reverse();
if (!a.length) { box.innerHTML = '<div class="wr-hist-title">弹幕记录</div><div class="wr-hist-empty">还没有弹幕</div>'; return; }
box.innerHTML = '<div class="wr-hist-title">弹幕记录</div>' + a.map(function (x) {
return '<div class="wr-hist-row"><span class="wr-hist-who ' + (x.who === 'me' ? 'me' : 'ta') + '">' + (x.who === 'me' ? '我' : esc(partnerName())) + '</span><span class="wr-hist-txt">' + esc(x.text) + '</span></div>';
}).join('');
}

/* ---------- 导航 ---------- */
function openPage(pg) {
document.querySelectorAll('.page').forEach(function (p) { p.hidden = true; });
pg.hidden = false;
requestAnimationFrame(function () {
const tabbar = document.querySelector('.tabbar');
const phone = document.querySelector('.phone');
if (tabbar) tabbar.hidden = true;
if (phone) phone.classList.add('no-statusbar');
pg.classList.add('full');
});
}
function backHome(pg) {
if (pg) pg.classList.remove('full');
document.querySelectorAll('.page').forEach(function (p) { p.hidden = true; });
const home = document.getElementById('page-phone');
if (home) home.hidden = false;
}

/* ---------- 桌面图标 ---------- */
function buildIcon() {
if (document.querySelector('.app[data-app="watchroad"]')) return;
const grid = document.querySelector('.app-grid.p2-grid') || document.querySelector('.app-grid');
if (!grid) return;
const a = document.createElement('div');
a.className = 'app'; a.setAttribute('data-app', 'watchroad'); a.setAttribute('data-desk-widget', 'app-watchroad');
a.innerHTML = '<div class="app-ico"><svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="12.5" rx="2"/><path d="M8 20.5h8"/><path d="M10 9.6l4.5 2.3-4.5 2.3z"/></svg></div><div class="app-name">一起看</div>';
grid.appendChild(a);
a.addEventListener('click', function () {
if (document.querySelector('.app-grid.editing')) return;
openTogether();
});
try { if (window.applyDeskLayout) window.applyDeskLayout(); } catch (e) {}
}

/* ---------- 初始化 ---------- */
function openTogether() {
const pg = document.getElementById('page-watchroad');
if (!pg) return;
const c = cfg();
const on = document.getElementById('wr-watch-on'); if (on) on.checked = !!c.watchOn;
const wg = document.getElementById('wr-watch-gap'); if (wg) wg.value = c.watchGap;
const rn = document.getElementById('wr-read-on'); if (rn) rn.checked = !!c.readOn;
const rg = document.getElementById('wr-read-gap'); if (rg) rg.value = c.readGap;
const rp = document.getElementById('wr-reply-pct'); if (rp) rp.value = c.replyPct;
restoreVideoUrl(); renderNovel(); renderHistory();
openPage(pg);
startReadTicker();
}
function renderAll() { /* 预留 */ }
function init() {
buildPage(); buildIcon(); loadNovel();
window.addEventListener('pagehide', stopAll);
}
window.watchReadOpen = openTogether;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
if (window.__mochiLoaded) window.__mochiLoaded.push("watch-read.js");
} catch (__e) { if (window.__mochiErrLoaded) window.__mochiErrLoaded.push("watch-read.js"); try { console.error("[JS] watch-read.js", __e && __e.message || __e); } catch (x) {} if (window.__jsErrors) window.__jsErrors.push("[watch-read.js] " + String(__e && __e.message || __e)); } })();
