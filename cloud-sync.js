/* cloud-sync.js — 二改新增：把整包数据同步到自己的 GitHub 私有仓库（仅自用，请勿公开部署）
   设计：
   - 上传：复用 data-backup.js 的「完整备份」打包（window.mochiBuildBackupBlob），把内存里的 JSON 文本推到仓库；
   - 下载：拉回文本，走 data-backup.js 的「导入」通道（window.mochiImportFromText），校验/确认/写入全部沿用原作者代码；
   - 令牌只存在本机 localStorage（前缀 theodore-sync:，不进 xy-home-v2 命名空间，因此不会被导出/上传）。
   GitHub 用的是 Git Data API（blobs/trees/commits/refs），可支持到约 100MB 的单文件，比 Contents API 更适合大备份。 */
(function () { try {
(function () {
const NS = 'theodore-sync:';
const API = 'https://api.github.com';
const MIN_IDLE = 60 * 1000;            // 数据改动后静默多久才自动上传
const MIN_GAP = 10 * 60 * 1000;        // 两次自动上传的最小间隔
const MAX_BYTES = 95 * 1024 * 1024;    // 单文件体积保护（GitHub 上限约 100MB）

/* ---------- 配置存取 ---------- */
function get(k, d) { try { const v = localStorage.getItem(NS + k); return v === null ? (d === undefined ? '' : d) : v; } catch (e) { return d === undefined ? '' : d; } }
function set(k, v) { try { localStorage.setItem(NS + k, String(v)); } catch (e) {} }
function cfg() {
return {
owner: String(get('owner') || '').trim(),
repo: String(get('repo') || '').trim(),
branch: String(get('branch') || 'main').trim() || 'main',
path: String(get('path') || 'theodore-sync.json').trim() || 'theodore-sync.json',
token: String(get('token') || '').trim(),
auto: get('auto') === '1',
scope: String(get('scope') || 'full')
};
}
function cfgOk(c) { return !!(c.owner && c.repo && c.token && c.branch && c.path); }
function configured() { return cfgOk(cfg()); }
let autoOn = false; // 缓存「自动上传」开关，避免每次写入都去读配置
try { autoOn = get('auto') === '1'; } catch (e) {}
function markSynced() { const t = Date.now(); set('syncedAt', t); set('dirtyAt', t); }

/* ---------- 小工具 ---------- */
function say(msg) { try { if (window.toast) { window.toast(msg); return; } } catch (e) {} }
function fmtSize(n) { return n < 1024 ? n + ' B' : (n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB'); }
function fmtTime(ts) { try { const d = new Date(Number(ts)); if (!ts || isNaN(d.getTime())) return '—'; const p = n => (n < 10 ? '0' + n : '' + n); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); } catch (e) { return '—'; } }
function encPath(p) { return String(p || '').split('/').map(encodeURIComponent).join('/'); }
function el(id) { return document.getElementById(id); }

/* ---------- GitHub API ---------- */
function headers(token, extra) {
const h = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
if (extra) for (const k in extra) h[k] = extra[k];
return h;
}
async function ghJson(url, token, opts) {
const res = await fetch(url, Object.assign({ headers: headers(token) }, opts || {}));
const text = await res.text();
let data = null;
try { data = text ? JSON.parse(text) : null; } catch (e) {}
if (!res.ok) {
const err = new Error((data && data.message) || ('HTTP ' + res.status));
err.status = res.status;
throw err;
}
return data;
}
function repoApi(c) { return API + '/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo); }

async function ghHead(c) {
const ref = await ghJson(repoApi(c) + '/git/ref/heads/' + encodeURIComponent(c.branch), c.token);
return { commitSha: ref.object.sha, treeSha: (await ghJson(repoApi(c) + '/git/commits/' + ref.object.sha, c.token)).tree.sha };
}

// 上传：Git Data API 五步（blob → tree → commit → 移动分支指针）
async function ghPutText(c, text) {
const head = await ghHead(c);
const blob = await ghJson(repoApi(c) + '/git/blobs', c.token, {
method: 'POST',
body: JSON.stringify({ content: text, encoding: 'utf-8' })
});
const tree = await ghJson(repoApi(c) + '/git/trees', c.token, {
method: 'POST',
body: JSON.stringify({ base_tree: head.treeSha, tree: [{ path: c.path, mode: '100644', type: 'blob', sha: blob.sha }] })
});
const commit = await ghJson(repoApi(c) + '/git/commits', c.token, {
method: 'POST',
body: JSON.stringify({ message: 'sync ' + new Date().toISOString(), tree: tree.sha, parents: [head.commitSha] })
});
await ghJson(repoApi(c) + '/git/refs/heads/' + encodeURIComponent(c.branch), c.token, {
method: 'PATCH',
body: JSON.stringify({ sha: commit.sha, force: false })
});
return commit.sha;
}

async function ghGetText(c) {
const meta = await ghJson(repoApi(c) + '/contents/' + encPath(c.path) + '?ref=' + encodeURIComponent(c.branch), c.token);
if (!meta || !meta.sha) throw new Error('云端还没有这个文件（先做一次上传）');
const res = await fetch(repoApi(c) + '/git/blobs/' + meta.sha, {
headers: { 'Authorization': 'Bearer ' + c.token, 'Accept': 'application/vnd.github.raw', 'X-GitHub-Api-Version': '2022-11-28' }
});
if (!res.ok) throw new Error('读取云端文件失败：HTTP ' + res.status);
return { text: await res.text(), size: Number(meta.size || 0), sha: meta.sha };
}

/* ---------- 状态显示 ---------- */
function statusLine(msg, kind) {
const box = el('cloudsync-status');
if (box) {
box.textContent = msg || '';
box.style.color = kind === 'err' ? '#c0392b' : (kind === 'ok' ? '#2f7d4f' : '');
}
const val = el('cloudsync-val');
if (val) val.textContent = configured() ? ('上次 ' + fmtTime(get('lastAT'))) : '未配置';
}
function setBusy(b) {
['cs-upload', 'cs-download', 'cs-test'].forEach(function (id) { const b2 = el(id); if (b2) b2.disabled = !!b; });
}
function errMsg(e) {
const s = (e && (e.message || String(e))) || '未知错误';
if (e && e.status === 401) return '令牌无效或已过期（401）——请重新生成令牌并粘贴';
if (e && e.status === 403) return '被拒绝（403）——令牌权限不足，或触发了 GitHub 限流，稍后再试';
if (e && e.status === 404) return '找不到仓库或分支（404）——请核对用户名/仓库名/分支，并确认仓库是私有的且令牌有 repo 权限；若是空仓库，请先用 README 初始化';
return s;
}

/* ---------- 上传 / 下载 / 测试 ---------- */
let busy = false;
async function doUpload() {
if (busy) return;
const c = cfg();
if (!cfgOk(c)) { statusLine('请先填好用户名、仓库名和访问令牌', 'err'); say('云同步：先填好配置'); return; }
if (typeof window.mochiBuildBackupBlob !== 'function') { statusLine('打包接口不可用（data-backup.js 未加载）', 'err'); return; }
busy = true; setBusy(true);
try {
statusLine('正在打包本机数据…');
const out = await window.mochiBuildBackupBlob(c.scope);
if (out.blob.size > MAX_BYTES) throw new Error('数据约 ' + fmtSize(out.blob.size) + '，超过 GitHub 单文件上限（约 100MB）；请把「同步范围」改成「不含音乐」或「只文字」再传');
statusLine('正在上传（' + fmtSize(out.blob.size) + '）…请勿关闭页面');
const text = await out.blob.text();
const sha = await ghPutText(c, text);
set('lastAT', Date.now());
set('lastSha', sha);
set('lastSize', out.blob.size);
markSynced();
statusLine('✅ 已上传到云端（' + fmtSize(out.blob.size) + '，' + fmtTime(Date.now()) + '）', 'ok');
say('已上传到云');
} catch (e) {
statusLine('上传失败：' + errMsg(e), 'err');
} finally { busy = false; setBusy(false); }
}

async function doDownload() {
if (busy) return;
const c = cfg();
if (!cfgOk(c)) { statusLine('请先填好用户名、仓库名和访问令牌', 'err'); return; }
busy = true; setBusy(true);
try {
statusLine('正在读取云端…');
const got = await ghGetText(c);
if (!got.text || !got.text.trim()) throw new Error('云端文件是空的');
set('lastCT', Date.now());
markSynced();
statusLine('云端备份 ' + fmtSize(got.size || got.text.length) + '，已交给「导入」确认框…', 'ok');
const done = window.mochiImportFromText(got.text, 'cloud-sync.json');
Promise.resolve(done).catch(function () {});
} catch (e) {
statusLine('读取失败：' + errMsg(e), 'err');
} finally { busy = false; setBusy(false); }
}

async function doTest() {
if (busy) return;
const c = cfg();
if (!c.owner || !c.repo || !c.token) { statusLine('请先填好用户名、仓库名和访问令牌', 'err'); return; }
busy = true; setBusy(true);
try {
statusLine('正在测试连接…');
const info = await ghJson(repoApi(c), c.token);
await ghHead(c);
statusLine('✅ 连接正常：' + info.full_name + '（' + (info.private ? '私有' : '⚠ 公开') + '，分支 ' + c.branch + '）', 'ok');
if (!info.private) say('注意：这个仓库是公开的，你的数据会被别人看到，建议改成私有');
} catch (e) {
statusLine('连接失败：' + errMsg(e), 'err');
} finally { busy = false; setBusy(false); }
}

/* ---------- 自动上传：记录「数据改动」 ---------- */
function markDirty() {
try { set('dirtyAt', Date.now()); } catch (e) {}
}
function installHooks() {
const names = ['idbSet', 'idbSetAll', 'idbReplaceAll', 'idbDelete', 'idbClearAll', 'idbMemoSet'];
names.forEach(function (n) {
const orig = window[n];
if (typeof orig !== 'function' || orig.__csWrapped) return;
const wrapped = function () { const r = orig.apply(this, arguments); try { if (autoOn) markDirty(); } catch (e) {} return r; };
try { wrapped.__csWrapped = 1; } catch (e) {}
window[n] = wrapped;
});
try {
if (!localStorage.setItem.__csWrapped) {
const prev = localStorage.setItem.bind(localStorage);
const wrapped = function (k, v) {
const r = prev(k, v);
try { if (String(k).indexOf('xy-home-v2:') === 0 && autoOn) markDirty(); } catch (e) {}
return r;
};
try { wrapped.__csWrapped = 1; } catch (e) {}
localStorage.setItem = wrapped;
}
} catch (e) {}
}
function autoTick() {
try {
const c = cfg();
if (!c.auto || busy || !cfgOk(c)) return;
const dirtyAt = Number(get('dirtyAt') || 0);
const syncedAt = Number(get('syncedAt') || 0);
if (!dirtyAt || dirtyAt <= syncedAt) return;
const now = Date.now();
if (now - dirtyAt < MIN_IDLE) return;
if (now - Number(get('lastAT') || 0) < MIN_GAP) return;
doUpload();
} catch (e) {}
}

/* ---------- UI ---------- */
function bindUi() {
const row = el('row-cloudsync');
const panel = el('cloudsync-panel');
if (!row || !panel) return;
row.addEventListener('click', function () {
panel.hidden = !panel.hidden;
const ar = el('cloudsync-arrow');
if (ar) ar.style.transform = panel.hidden ? '' : 'rotate(90deg)';
});
const c = cfg();
if (el('cs-owner')) el('cs-owner').value = c.owner;
if (el('cs-repo')) el('cs-repo').value = c.repo;
if (el('cs-branch')) el('cs-branch').value = c.branch;
if (el('cs-path')) el('cs-path').value = c.path;
if (el('cs-token')) el('cs-token').value = c.token;
if (el('cs-auto')) el('cs-auto').checked = c.auto;
if (el('cs-scope')) el('cs-scope').value = c.scope;
function readUi() {
set('owner', (el('cs-owner') || {}).value || '');
set('repo', (el('cs-repo') || {}).value || '');
set('branch', (el('cs-branch') || {}).value || 'main');
set('path', (el('cs-path') || {}).value || 'theodore-sync.json');
set('token', (el('cs-token') || {}).value || '');
set('scope', (el('cs-scope') || {}).value || 'full');
}
['cs-owner', 'cs-repo', 'cs-branch', 'cs-path', 'cs-token', 'cs-scope'].forEach(function (id) {
const n = el(id);
if (n) n.addEventListener('change', function () { readUi(); statusLine(configured() ? '配置已保存' : '配置未完成'); });
if (n && n.tagName === 'INPUT') n.addEventListener('blur', function () { readUi(); });
});
if (el('cs-auto')) el('cs-auto').addEventListener('change', function (ev) {
set('auto', ev.target.checked ? '1' : '0');
autoOn = !!ev.target.checked;
if (ev.target.checked) { markDirty(); statusLine('已开启自动上传：数据改动后约 1 分钟自动同步'); }
else statusLine('已关闭自动上传');
});
if (el('cs-upload')) el('cs-upload').addEventListener('click', function (e) { e.stopPropagation(); doUpload(); });
if (el('cs-download')) el('cs-download').addEventListener('click', function (e) { e.stopPropagation(); doDownload(); });
if (el('cs-test')) el('cs-test').addEventListener('click', function (e) { e.stopPropagation(); doTest(); });
statusLine(configured() ? '' : '未配置');
}

installHooks();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUi);
else bindUi();
setInterval(autoTick, 30000);

// 供诊断使用
window.cloudSyncConfig = cfg;
window.cloudSyncUpload = doUpload;
window.cloudSyncDownload = doDownload;
})();
if (window.__mochiLoaded) window.__mochiLoaded.push("cloud-sync.js");
} catch (__e) { if (window.__mochiErrLoaded) window.__mochiErrLoaded.push("cloud-sync.js"); try { console.error("[JS] cloud-sync.js", __e && __e.message || __e); } catch (x) {} if (window.__jsErrors) window.__jsErrors.push("[cloud-sync.js] " + String(__e && __e.message || __e)); } })();
