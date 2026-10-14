(function () { try {
// 系统预设词典已清空：原内置词典（基础汉字/日常对话/生活小词/常用词/成语等全部词库分组）已全部移除。
// 词典拼字/切词现在只使用用户自建词条（自建语录 / 自建词库），不再包含任何系统内置内容。
window.DEFAULT_CARD_DATA.dict_ext = [];
} catch (__e) { if (window.__mochiErrLoaded) window.__mochiErrLoaded.push("dict-ext-data.js"); try { console.error("[JS] dict-ext-data.js", __e && __e.message || __e); } catch (x) {} if (window.__jsErrors) window.__jsErrors.push("[dict-ext-data.js] " + String(__e && __e.message || __e)); } })();
