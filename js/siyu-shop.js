/* siyu-shop.js — 二改新增：「私语」私密商城（仅自用，请勿公开部署）
   复用站内现成机制：
   - 钱包：window.giftWalletGet/giftWalletSet（心意币，与礼物集市互通）
   - 聊天卡片：window.chatAddGift（礼物流水卡，支持自定义图片 giftImg）
   - 字卡分类：注册为功能字卡分类 'siyu'，字卡库可看可改、回复设置可调概率（dcf-siyu）
   - 图片：FileReader + mochiImgCompressTo 压成 dataURL，存 IndexedDB（随备份走） */
(function () { try {
(function () {
const KEY_ITEMS = 'siyu-items';   // 自定义商品（数组）
const KEY_REC = 'siyu-records';   // 购买/收到的记录
const KEY_CFG = 'siyu-cfg';       // { on: true, taMax: 2 }
const IMG_PREFIX = 'xy-home-v2:siyu-img:';
const TA_DAILY = 'siyu-ta-daily-';

// 内置商品（emoji 占位图；点商品可自己换图）
const BUILTIN = [
{ id: 'sy_1', name: '蕾丝眼罩', emoji: '🕶️', price: 68, cat: '轻趣', wish: '戴上就什么都看不见了，别乱动。' },
{ id: 'sy_2', name: '丝质睡袍', emoji: '🥻', price: 128, cat: '衣着', wish: '试试合不合身，我只看一眼。' },
{ id: 'sy_3', name: '香氛蜡烛', emoji: '🕯️', price: 46, cat: '氛围', wish: '灯关了，味道留给你。' },
{ id: 'sy_4', name: '按摩精油', emoji: '🧴', price: 88, cat: '氛围', wish: '肩颈太紧了，我帮你松一松。' },
{ id: 'sy_5', name: '羽毛棒', emoji: '🪶', price: 39, cat: '轻趣', wish: '别躲，还没碰到呢。' },
{ id: 'sy_6', name: '丝带', emoji: '🎀', price: 58, cat: '轻趣', wish: '先系上，再说话。' },
{ id: 'sy_7', name: '蕾丝腕带', emoji: '🧤', price: 66, cat: '衣着', wish: '手腕借我一下。' },
{ id: 'sy_8', name: '软拍', emoji: '🏓', price: 52, cat: '轻趣', wish: '别紧张，很轻的。' },
{ id: 'sy_9', name: '私语铃', emoji: '🔔', price: 42, cat: '氛围', wish: '撑不住就摇它，我停。' },
{ id: 'sy_10', name: '成套睡衣', emoji: '🩱', price: 158, cat: '衣着', wish: '换上给我看看，只看，不动手。' },
{ id: 'sy_11', name: '温水杯', emoji: '🥛', price: 22, cat: '氛围', wish: '先喝口水，别急。' },
{ id: 'sy_12', name: '晚安眼罩', emoji: '🌙', price: 36, cat: '氛围', wish: '陪你睡，明天再说。' }
];
const FB_REPLY = ['……你确定要送我这个？', '拆到一半，手停住了，抬眼看你。', '耳根一路红到脖子，最后还是收下了。', '「谁教你的。」声音有点哑。', '「……今晚别想早睡了。」'];
const FB_TA = ['给你带了点东西，拆开再说。', '「别问，先收着。」', '「今晚用得上。」', '「想你了，顺手买的。」'];
const FB_RETURN = ['把东西推回来，脸还热着。', '「先不收。」', '「……太快了。」'];

function store() { try { return window.activeStore ? window.activeStore() : (window.xyStore ? window.xyStore('xy-home-v2') : null); } catch (e) { return null; } }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pick(a) { return a && a.length ? a[Math.floor(Math.random() * a.length)] : ''; }
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()); }
function toast(m) { try { if (window.toast) window.toast(m); } catch (e) {} }
function partnerName() { try { return window.chatPartnerName ? window.chatPartnerName() : 'TA'; } catch (e) { return 'TA'; } }
function fenToYuan(f) { const y = f / 100; return y >= 1000 ? y.toFixed(0) : y.toFixed(2); }

/* ---------- 配置 ---------- */
function cfg() {
let o = null;
try { const s = store(); o = s ? JSON.parse(s.get(KEY_CFG) || 'null') : null; } catch (e) { o = null; }
if (!o || typeof o !== 'object') o = {};
if (o.on === undefined) o.on = true;
if (o.taMax === undefined || isNaN(o.taMax)) o.taMax = 2;
if (o.taReturn === undefined || isNaN(o.taReturn)) o.taReturn = 8;
return o;
}
function cfgSet(patch) { try { const s = store(); if (s) { const o = cfg(); for (const k in patch) o[k] = patch[k]; s.set(KEY_CFG, JSON.stringify(o)); } } catch (e) {} }
function enabled() { return !!cfg().on; }

/* ---------- 商品 ---------- */
function customItems() { try { const s = store(); const a = s ? JSON.parse(s.get(KEY_ITEMS) || '[]') : []; return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function customSave(a) { try { const s = store(); if (s) s.set(KEY_ITEMS, JSON.stringify(a)); } catch (e) {} }
function allItems() { return BUILTIN.concat(customItems()); }
function findItem(id) { const a = allItems(); for (let i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
function isCustom(id) { return id && id.indexOf('cu_') === 0; }

/* ---------- 概率（复用回复设置的「私语字卡概率」） ---------- */
function pct() { try { return window.dcfGet ? window.dcfGet('siyu') : 20; } catch (e) { return 20; } }
function hit() { return Math.random() * 100 < pct(); }

/* ---------- 字卡池（复用字卡库的「私语」分类，含用户自定义） ---------- */
function pool(group, fb) { try { return (window.getLibPool ? window.getLibPool('siyu', group, fb, true) : (fb || [])).slice(); } catch (e) { return (fb || []).slice(); } }

/* ---------- 钱包 ---------- */
function wallet() { try { return window.giftWalletGet ? window.giftWalletGet() : { myBalance: 0, systemBalance: 0 }; } catch (e) { return { myBalance: 0, systemBalance: 0 }; } }
function walletSave(w) { try { if (window.giftWalletSet) window.giftWalletSet(w); } catch (e) {} }

/* ---------- 图片 ---------- */
const imgCache = {};
function preloadImages() {
allItems().forEach(function (it) {
const k = IMG_PREFIX + it.id;
if (imgCache[it.id]) return;
try { if (window.idbGetCached) { const c = window.idbGetCached(k); if (c) { imgCache[it.id] = c; return; } } } catch (e) {}
try {
if (window.idbGet) Promise.resolve(window.idbGet(k)).then(function (v) { if (v && !imgCache[it.id]) { imgCache[it.id] = v; renderGrid(); } }).catch(function () {});
} catch (e) {}
});
}
function readCompress(file) {
return new Promise(function (resolve) {
const fr = new FileReader();
fr.onload = function () {
const src = String(fr.result || '');
if (!src) { resolve(''); return; }
if (!window.mochiImgCompressTo) { resolve(src); return; }
Promise.resolve(window.mochiImgCompressTo(src, { maxSide: 640, quality: 0.85, mime: 'image/jpeg', tag: 'siyu' }))
.then(function (out) { resolve(out || src); }).catch(function () { resolve(src); });
};
fr.onerror = function () { resolve(''); };
try { fr.readAsDataURL(file); } catch (e) { resolve(''); }
});
}
function itemImg(it) { return imgCache[it.id] || ''; }

/* ---------- 发送到聊天 ---------- */
function sendCard(item, side) {
const rec = {
side: side === 'out' ? 'out' : 'in', special: 'gift', rateAllow: true, giftCid: 'siyu',
giftId: item.id, giftName: item.name, giftEmoji: item.emoji, giftImg: itemImg(item),
giftPrice: item.price, giftWish: item.wish || '', giftCat: '私语', ts: Date.now()
};
try {
if (window.chatAddGift) window.chatAddGift(rec);
else if (window.chatAddIn) window.chatAddIn((side === 'out' ? '你送给 ' + partnerName() + '「' : partnerName() + '送给你「') + item.name + '」', { silent: true });
} catch (e) {}
}
function taSay(text) {
try { if (window.chatAddIn && text) window.chatAddIn(text, { silent: true, tag: '私语' }); } catch (e) {}
}

/* ---------- 记录 ---------- */
function recAdd(it, side) {
try {
const s = store(); if (!s) return;
let a = JSON.parse(s.get(KEY_REC) || '[]'); if (!Array.isArray(a)) a = [];
a.unshift({ id: it.id, name: it.name, emoji: it.emoji, price: it.price, side: side, ts: Date.now(), returned: 0 });
s.set(KEY_REC, JSON.stringify(a.slice(0, 40)));
} catch (e) {}
}
function recList() { try { const s = store(); const a = s ? JSON.parse(s.get(KEY_REC) || '[]') : []; return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function recSave(a) { try { const s = store(); if (s) s.set(KEY_REC, JSON.stringify(a.slice(0, 40))); } catch (e) {} }

/* ---------- 退回 ---------- */
function doReturn(idx) {
const a = recList();
const r = a[idx];
if (!r || r.returned) return;
const fen = Math.round((r.price || 0) * 100);
const w = wallet();
if (r.side === 'out') w.myBalance += fen;            // 我送出的 → 退回我的钱包
else w.systemBalance += fen;                          // TA 送的 → 退回 TA 的钱包
walletSave(w);
r.returned = 1;
recSave(a);
try {
if (window.chatAddIn) window.chatAddIn(r.side === 'out'
? ('你把「' + r.name + '」退回了，¥' + fenToYuan(fen) + ' 已退到你的心意币')
: ('你把「' + r.name + '」退回给 ' + partnerName() + '，¥' + fenToYuan(fen) + ' 已退到 TA 的钱包'),
{ silent: true, tag: '私语' });
} catch (e) {}
renderAll();
toast('已退回 ¥' + fenToYuan(fen));
}
function taReturnLatest() {
const a = recList();
let idx = -1;
for (let i = 0; i < a.length; i++) { if (a[i].side === 'out' && !a[i].returned) { idx = i; break; } }
if (idx < 0) return;
const r = a[idx];
const fen = Math.round((r.price || 0) * 100);
const w = wallet();
w.myBalance += fen; walletSave(w);
r.returned = 1; recSave(a);
try { if (window.chatAddIn) window.chatAddIn(partnerName() + ' 把「' + r.name + '」退回来了，¥' + fenToYuan(fen) + ' 已退回你的心意币', { silent: true, tag: '私语' }); } catch (e) {}
renderAll();
setTimeout(function () { taSay(pick(pool('退回', FB_RETURN))); }, randInt(600, 1600));
}

/* ---------- 购买：我 -> TA ---------- */
function buyForTa(it) {
if (!enabled()) { toast('「私语」已关闭，先在上方打开'); return; }
const fen = Math.round((it.price || 0) * 100);
const w = wallet();
if (w.myBalance < fen) { toast('心意币不够（需要 ¥' + fenToYuan(fen) + '，当前 ¥' + fenToYuan(w.myBalance) + '）'); return; }
w.myBalance -= fen; walletSave(w);
recAdd(it, 'out');
sendCard(it, 'out');
renderAll();
toast('已送给 ' + partnerName() + '「' + it.name + '」');
if (Math.random() * 100 < (Number(cfg().taReturn) || 0)) {
setTimeout(function () { taReturnLatest(); }, randInt(2500, 5000));
} else if (hit()) {
setTimeout(function () { taSay(pick(pool('收到礼物', FB_REPLY))); }, randInt(700, 2000));
}
}

/* ---------- 梦角主动送：TA -> 我 ---------- */
function taBuyForMe() {
try {
if (!enabled()) return;
const c = cfg();
const s = store(); if (!s) return;
const today = todayStr();
const used = Number(s.get(TA_DAILY + today)) || 0;
if (c.taMax <= 0 || used >= c.taMax) return;
if (window.nightModeActive && window.nightModeActive()) return;
if (window.chatRateLimitFull && window.chatRateLimitFull()) return;
if (!hit()) return;
const items = allItems(); if (!items.length) return;
const it = pick(items);
const w = wallet();
if (w.systemBalance < Math.round((it.price || 0) * 100)) return;
w.systemBalance -= Math.round((it.price || 0) * 100); walletSave(w);
s.set(TA_DAILY + today, String(used + 1));
const cid = window.__activeCid || 'default';
setTimeout(function () {
try {
if ((window.__activeCid || 'default') !== cid) return;
sendCard(it, 'in'); recAdd(it, 'in'); renderWallet();
taSay(pick(pool('TA 送你', FB_TA))); // 是否补一句由字卡池决定
} catch (e) {}
}, randInt(1500, 4000));
} catch (e) {}
}

/* ---------- 页面 ---------- */
let editorId = null;
const host = (document.getElementById('page-phone') || {}).parentNode || document.body;

function buildPage() {
if (document.getElementById('page-siyu')) return;
const page = document.createElement('div');
page.className = 'page'; page.id = 'page-siyu'; page.hidden = true;
page.innerHTML =
'<div class="chat-head"><span class="ch-back" id="sy-back"><svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></span><span class="ch-name">私语</span></div>' +
'<div class="sy-body">' +
'<div class="sy-wallet" id="sy-wallet"></div>' +
'<div class="sy-bar">' +
'<button class="sy-add" id="sy-add">＋ 添加商品</button>' +
'</div>' +
'<div class="sy-grid" id="sy-grid"></div>' +
'<div class="sy-rec-title">最近记录（可退回）</div>' +
'<div class="sy-records" id="sy-records"></div>' +
'<div class="sy-editor" id="sy-editor" hidden>' +
'<div class="sy-ed-row"><span>名称</span><input id="sy-ed-name" type="text" maxlength="12" placeholder="商品名称"></div>' +
'<div class="sy-ed-row"><span>价格(心意币)</span><input id="sy-ed-price" type="number" min="0" step="1" placeholder="0"></div>' +
'<div class="sy-ed-row"><span>图标(emoji)</span><input id="sy-ed-emoji" type="text" maxlength="4" placeholder="🎁"></div>' +
'<div class="sy-ed-row"><span>赠言</span><input id="sy-ed-wish" type="text" maxlength="40" placeholder="送出去时附的一句话"></div>' +
'<div class="sy-ed-btns"><button class="sy-btn sy-primary" id="sy-ed-save">保存</button><button class="sy-btn" id="sy-ed-img">换图片</button><button class="sy-btn" id="sy-ed-del">删除</button><button class="sy-btn" id="sy-ed-cancel">取消</button></div>' +
'<div class="sy-ed-hint">自定义商品用 emoji 图标即可；想用图片点「换图片」导入（会压缩后存在本机、随备份走）。</div>' +
'</div>' +
'<div class="sy-hint">这里只是本地的小游戏式互动：买下 → 用「心意币」结算 → 在聊天里发一张礼物卡 → TA 可能回你一句（概率在 设置 → 回复设置 → 「私语字卡概率」里调）。文案都能在 字卡库 → 私语 里自己加。</div>' +
'</div>';
host.appendChild(page);
document.getElementById('sy-back').addEventListener('click', function () { backHome(page); });
document.getElementById('sy-add').addEventListener('click', function () { openEditor(null); });
document.getElementById('sy-ed-cancel').addEventListener('click', closeEditor);
document.getElementById('sy-ed-img').addEventListener('click', function () { if (editorId) pickImage(editorId); });
document.getElementById('sy-ed-del').addEventListener('click', function () { if (editorId) delItem(editorId); });
document.getElementById('sy-ed-save').addEventListener('click', saveEditor);
renderAll();
}
function renderWallet() {
const el = document.getElementById('sy-wallet');
if (!el) return;
const w = wallet();
el.textContent = '心意币（我）¥' + fenToYuan(w.myBalance) + '　·　' + partnerName() + ' ¥' + fenToYuan(w.systemBalance);
}
function renderGrid() {
const g = document.getElementById('sy-grid');
if (!g) return;
const items = allItems();
let h = '';
items.forEach(function (it) {
const img = itemImg(it);
h += '<div class="sy-card" data-id="' + esc(it.id) + '">' +
'<div class="sy-thumb">' + (img ? '<img src="' + esc(img) + '" alt="">' : esc(it.emoji || '🎁')) + '</div>' +
'<div class="sy-name">' + esc(it.name) + '</div>' +
'<div class="sy-price">¥' + fenToYuan(Math.round((it.price || 0) * 100)) + '</div>' +
'<div class="sy-wish">' + esc(it.wish || '') + '</div>' +
'<button class="sy-buy" data-buy="' + esc(it.id) + '">买下送给 TA</button>' +
'<span class="sy-edit" data-edit="' + esc(it.id) + '">编辑</span>' +
'</div>';
});
g.innerHTML = h;
Array.prototype.forEach.call(g.querySelectorAll('[data-buy]'), function (b) {
b.addEventListener('click', function (e) { e.stopPropagation(); const it = findItem(b.getAttribute('data-buy')); if (it) buyForTa(it); });
});
Array.prototype.forEach.call(g.querySelectorAll('[data-edit]'), function (b) {
b.addEventListener('click', function (e) { e.stopPropagation(); openEditor(b.getAttribute('data-edit')); });
});
}
function renderAll() {
renderWallet(); renderGrid(); renderRecords();
}
/* ---------- 二改：开关与频率移到 设置 → 回复设置（页面里不再放） ---------- */
function bindSettings() {
const on = document.getElementById('sy-set-on');
if (on) { on.checked = !!cfg().on; on.addEventListener('change', function (ev) { cfgSet({ on: !!ev.target.checked }); toast(ev.target.checked ? '已开启「私语」' : '已关闭「私语」'); }); }
const mx = document.getElementById('sy-set-taMax');
if (mx) { mx.value = cfg().taMax; mx.addEventListener('change', function () { cfgSet({ taMax: Math.max(0, Math.min(9, parseInt(mx.value, 10) || 0)) }); mx.value = cfg().taMax; }); }
const rt = document.getElementById('sy-set-taRet');
if (rt) { rt.value = cfg().taReturn; rt.addEventListener('change', function () { cfgSet({ taReturn: Math.max(0, Math.min(100, parseInt(rt.value, 10) || 0)) }); rt.value = cfg().taReturn; }); }
}
function renderRecords() {
const box = document.getElementById('sy-records');
if (!box) return;
const a = recList();
if (!a.length) { box.innerHTML = '<div class="sy-rec-empty">还没有记录</div>'; return; }
let h = '';
a.forEach(function (r, i) {
if (i >= 20) return;
const side = r.side === 'out' ? '我 → TA' : 'TA → 我';
h += '<div class="sy-rec-row">' +
'<span class="sy-rec-name">' + esc(r.emoji || '') + ' ' + esc(r.name) + '</span>' +
'<span class="sy-rec-side">' + side + '</span>' +
'<span class="sy-rec-price">¥' + fenToYuan(Math.round((r.price || 0) * 100)) + '</span>' +
(r.returned ? '<span class="sy-rec-done">已退回</span>' : '<button class="sy-rec-ret" data-ret="' + i + '">退回</button>') +
'</div>';
});
box.innerHTML = h;
Array.prototype.forEach.call(box.querySelectorAll('[data-ret]'), function (b) {
b.addEventListener('click', function () { doReturn(Number(b.getAttribute('data-ret'))); });
});
}
function openEditor(id) {
editorId = id || ('cu_' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36));
const it = id ? findItem(id) : null;
const p = document.getElementById('sy-editor');
if (!p) return;
p.hidden = false;
document.getElementById('sy-ed-name').value = it ? it.name : '';
document.getElementById('sy-ed-price').value = it ? it.price : '';
document.getElementById('sy-ed-emoji').value = it ? it.emoji : '🎁';
document.getElementById('sy-ed-wish').value = it ? (it.wish || '') : '';
document.getElementById('sy-ed-del').style.display = (id && isCustom(id)) ? '' : 'none';
p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function closeEditor() { const p = document.getElementById('sy-editor'); if (p) p.hidden = true; editorId = null; }
function saveEditor() {
const name = (document.getElementById('sy-ed-name').value || '').trim();
const price = Math.max(0, Number(document.getElementById('sy-ed-price').value) || 0);
const emoji = (document.getElementById('sy-ed-emoji').value || '🎁').trim() || '🎁';
const wish = (document.getElementById('sy-ed-wish').value || '').trim();
if (!name) { toast('先填个名称'); return; }
if (!isCustom(editorId)) { // 内置商品：另存为一条自定义（不改内置）
const arr = customItems();
arr.unshift({ id: editorId, name: name, emoji: emoji, price: price, wish: wish, cat: '自定义', custom: 1 });
customSave(arr);
} else {
const arr = customItems();
let hitIdx = -1;
arr.forEach(function (x, i) { if (x.id === editorId) hitIdx = i; });
if (hitIdx >= 0) { arr[hitIdx].name = name; arr[hitIdx].emoji = emoji; arr[hitIdx].price = price; arr[hitIdx].wish = wish; }
else arr.unshift({ id: editorId, name: name, emoji: emoji, price: price, wish: wish, cat: '自定义', custom: 1 });
customSave(arr);
}
closeEditor(); renderGrid(); toast('已保存');
}
function delItem(id) {
if (!isCustom(id)) { toast('内置商品不能删，可改成你自己的一条'); return; }
customSave(customItems().filter(function (x) { return x.id !== id; }));
try { if (window.idbDelete) window.idbDelete(IMG_PREFIX + id); } catch (e) {}
delete imgCache[id];
closeEditor(); renderGrid(); toast('已删除');
}
function pickImage(id) {
const inp = document.createElement('input');
inp.type = 'file'; inp.accept = 'image/*';
inp.addEventListener('change', function () {
const f = inp.files && inp.files[0];
if (!f) return;
readCompress(f).then(function (dataUrl) {
if (!dataUrl) { toast('图片读取失败'); return; }
imgCache[id] = dataUrl;
try { if (window.idbSet) window.idbSet(IMG_PREFIX + id, dataUrl); } catch (e) {}
renderGrid(); toast('图片已更新');
});
});
inp.click();
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
if (document.querySelector('.app[data-app="siyu"]')) return;
const grid = document.querySelector('.app-grid.p2-grid') || document.querySelector('.app-grid');
if (!grid) return;
const a = document.createElement('div');
a.className = 'app'; a.setAttribute('data-app', 'siyu'); a.setAttribute('data-desk-widget', 'app-siyu');
a.innerHTML = '<div class="app-ico"><svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 11-3.1-6.3"/><path d="M12 8.5v4l2.5 1.6"/></svg></div><div class="app-name">私语</div>';
grid.appendChild(a);
a.addEventListener('click', function () {
if (document.querySelector('.app-grid.editing')) return;
const pg = document.getElementById('page-siyu');
preloadImages(); renderAll(); openPage(pg);
});
try { if (window.applyDeskLayout) window.applyDeskLayout(); } catch (e) {}
}

/* ---------- 初始化 ---------- */
function init() {
buildPage(); buildIcon(); bindSettings();
setTimeout(function () { try { taBuyForMe(); } catch (e) {} }, 40000);
setInterval(function () { try { taBuyForMe(); } catch (e) {} }, 8 * 60 * 1000);
}
window.siyuShopOpen = function () { const pg = document.getElementById('page-siyu'); if (!pg) return; preloadImages(); renderAll(); openPage(pg); };
window.siyuShopBuy = buyForTa;
window.siyuShopTaBuy = taBuyForMe;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
if (window.__mochiLoaded) window.__mochiLoaded.push("siyu-shop.js");
} catch (__e) { if (window.__mochiErrLoaded) window.__mochiErrLoaded.push("siyu-shop.js"); try { console.error("[JS] siyu-shop.js", __e && __e.message || __e); } catch (x) {} if (window.__jsErrors) window.__jsErrors.push("[siyu-shop.js] " + String(__e && __e.message || __e)); } })();
