// ================================================================
// ▼ app.js
// ================================================================

// ==========================================
// 0. 基盤層 — ストレージキー / スキーマ / ID / 時刻 / マイグレーション
// ==========================================
const SCHEMA_VERSION = 4;
const STORAGE_KEY = "yoyu_aru_data";
const ROOM_STORAGE_KEY = "yoyu_aru_room_data";

function newId() {
    try {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
    } catch (e) { /* 使えない環境はフォールバックへ */ }
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function localDateKey(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localMonthKey(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey) {
    const parts = String(monthKey || "").split("-");
    if (parts.length < 2) return "";
    return I18N.monthLabel(parts[0], parseInt(parts[1], 10));
}

function addMonths(monthKey, delta) {
    const parts = String(monthKey || "").split("-").map(n => parseInt(n, 10));
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return localMonthKey(new Date());
    return localMonthKey(new Date(parts[0], parts[1] - 1 + delta, 1));
}

function toDatetimeLocalValue(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDatetimeLocalValue(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;
    const d = new Date(
        parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
        parseInt(m[4], 10), parseInt(m[5], 10), 0, 0
    );
    return isNaN(d.getTime()) ? null : d;
}

// 日付だけを扱う入力欄（type="date"）用。時刻は記録・表示しない。
function toDateInputValue(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateInputValue(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 12, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
}

// 選んだ日付から、保存用の日時を作る（時刻は表示せず、同じ日の並び順を保つためだけに持つ）
function composeExpenseWhen(dateValue, prevDatetime) {
    const picked = parseDateInputValue(dateValue);
    const now = new Date();
    const prev = prevDatetime ? new Date(prevDatetime) : null;
    if (!picked) return (prev && !isNaN(prev.getTime())) ? prev : now;
    if (prev && !isNaN(prev.getTime()) && localDateKey(prev) === localDateKey(picked)) return prev;
    return new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(),
        now.getHours(), now.getMinutes(), now.getSeconds());
}

// ==========================================
// 1. デフォルトデータ
// ==========================================
const DEFAULT_CATEGORIES = [
    { id: "cat-food", name: "食費" },
    { id: "cat-daily", name: "日用品" },
    { id: "cat-transport", name: "交通費" },
    { id: "cat-fun", name: "娯楽" },
    { id: "cat-medical", name: "医療" },
    { id: "cat-other", name: "その他" }
];

const DEFAULT_CATEGORY_ID_BY_NAME = {
    "食費": "cat-food",
    "日用品": "cat-daily",
    "交通費": "cat-transport",
    "娯楽": "cat-fun",
    "医療": "cat-medical",
    "その他": "cat-other"
};

const DEFAULT_DATA = {
    schemaVersion: SCHEMA_VERSION,
    ownerId: null,
    budget: {},
    budgetUpdatedAt: {},
    categoryBudget: {},
    categoryBudgetUpdatedAt: {},
    categories: [],
    plan: null,
    expenses: []
};

function cloneDefaultCategories() {
    return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
}

function cloneDefaultData() {
    const d = JSON.parse(JSON.stringify(DEFAULT_DATA));
    d.categories = cloneDefaultCategories();
    return d;
}

function safeParse(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
}

function normalizeItem(item) {
    const it = item && typeof item === "object" ? item : {};
    return {
        id: typeof it.id === "string" && it.id ? it.id : newId(),
        name: String(it.name || ""),
        price: Number(it.price) || 0,
        qty: Number(it.qty) || 1,
        categoryId: it.categoryId ? String(it.categoryId) : null
    };
}

// カテゴリ別予算は「月 → { カテゴリID: 金額 }」。
// 消えたカテゴリや 0 円以下は保存しない。
function sanitizeCategoryBudgetMap(raw, categories) {
    const out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    const validIds = new Set((Array.isArray(categories) ? categories : []).map(c => String(c.id)));
    Object.keys(raw).forEach(id => {
        const amount = Number(raw[id]);
        if (!validIds.has(String(id))) return;
        if (!isFinite(amount) || amount <= 0) return;
        out[String(id)] = Math.round(amount);
    });
    return out;
}

function migrateData(raw) {
    let data = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : cloneDefaultData();
    const from = Number(data.schemaVersion) || 0;

    if (!data.budget || typeof data.budget !== "object" || Array.isArray(data.budget)) data.budget = {};
    if (!Array.isArray(data.expenses)) data.expenses = [];
    if (!Array.isArray(data.categories) || data.categories.length === 0) {
        data.categories = cloneDefaultCategories();
    }
    if (data.ownerId === undefined) data.ownerId = null;
    if (!data.budgetUpdatedAt || typeof data.budgetUpdatedAt !== "object" || Array.isArray(data.budgetUpdatedAt)) {
        data.budgetUpdatedAt = {};
    }
    if (!data.categoryBudget || typeof data.categoryBudget !== "object" || Array.isArray(data.categoryBudget)) {
        data.categoryBudget = {};
    }
    if (!data.categoryBudgetUpdatedAt || typeof data.categoryBudgetUpdatedAt !== "object" || Array.isArray(data.categoryBudgetUpdatedAt)) {
        data.categoryBudgetUpdatedAt = {};
    }

    if (from < 2) {
        const idMap = {};
        const usedCategoryIds = new Set();
        data.categories = data.categories.map((cat, index) => {
            const rawCat = cat && typeof cat === "object" ? cat : {};
            const oldId = rawCat.id !== undefined && rawCat.id !== null ? String(rawCat.id) : "";
            let nextId;
            if (oldId.indexOf("cat-") === 0) {
                nextId = oldId;
            } else {
                nextId = DEFAULT_CATEGORY_ID_BY_NAME[rawCat.name];
                if (!nextId || usedCategoryIds.has(nextId)) nextId = newId();
            }
            usedCategoryIds.add(nextId);
            if (oldId) idMap[oldId] = nextId;
            return { id: nextId, name: String(rawCat.name || `カテゴリ${index + 1}`) };
        });
        const fallbackCategoryId = data.categories[0].id;

        const usedExpenseIds = new Set();
        data.expenses = data.expenses.map(exp => {
            const e = exp && typeof exp === "object" ? exp : {};

            let id = e.id !== undefined && e.id !== null ? String(e.id) : "";
            if (!id || usedExpenseIds.has(id)) id = newId();
            while (usedExpenseIds.has(id)) id = newId();
            usedExpenseIds.add(id);

            const parsed = new Date(e.datetime);
            const when = isNaN(parsed.getTime()) ? new Date() : parsed;

            return {
                id: id,
                amount: Number(e.amount) || 0,
                categoryId: idMap[String(e.categoryId)] || fallbackCategoryId,
                memo: typeof e.memo === "string" ? e.memo : "",
                store: typeof e.store === "string" ? e.store : "",
                items: Array.isArray(e.items) ? e.items.map(normalizeItem) : [],
                datetime: when.toISOString(),
                dateKey: localDateKey(when),
                monthKey: localMonthKey(when),
                source: e.source || "manual",
                deletedAt: e.deletedAt || null
            };
        });

        delete data.nextCategoryId;
    }

    if (from < 3) {
        data.expenses = data.expenses.map(e => {
            if (!e || typeof e !== "object") return e;
            const fallback = e.datetime || new Date().toISOString();
            return Object.assign({}, e, {
                createdAt: e.createdAt || fallback,
                updatedAt: e.updatedAt || e.deletedAt || fallback
            });
        });
        if (data.plan === undefined) data.plan = null;
    }

    // カテゴリ別予算（v4）。古いデータには無いので、空のままでも動く。
    const cleanedCategoryBudget = {};
    Object.keys(data.categoryBudget).forEach(monthKey => {
        if (!/^\d{4}-\d{2}$/.test(monthKey)) return;
        const map = sanitizeCategoryBudgetMap(data.categoryBudget[monthKey], data.categories);
        if (Object.keys(map).length > 0) cleanedCategoryBudget[monthKey] = map;
    });
    data.categoryBudget = cleanedCategoryBudget;

    data.schemaVersion = SCHEMA_VERSION;
    return data;
}

let appData = migrateData(safeParse(localStorage.getItem(STORAGE_KEY)));

let selectedMonthKey = localMonthKey(new Date());

let categoryFormMode = "add";

function escapeHtml(value) {
    const str = String(value === undefined || value === null ? "" : value);
    return str.replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[ch]));
}

// ------------------------------------------
// 端末ごとの設定（CSVには含めない）
// ------------------------------------------
const PREFS_KEY = "yoyu_aru_prefs";
const DEFAULT_PREFS = { sound: true, haptics: true, lastBackupAt: null, backupRemindedAt: null, roomHidden: false };
let appPrefs = loadPrefs();

function loadPrefs() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null"); } catch (e) { saved = null; }
    return Object.assign({}, DEFAULT_PREFS, (saved && typeof saved === "object") ? saved : {});
}

function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(appPrefs)); } catch (e) { /* 設定は保存できなくても動く */ }
}

function markBackupDone() {
    appPrefs.lastBackupAt = new Date().toISOString();
    savePrefs();
    renderBackupBanner();
}

let audioCtx = null;
function playTone(freq, duration, type = "sine", volume = 0.12) {
    if (!appPrefs.sound) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.value = volume;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const t = audioCtx.currentTime;
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.start(t);
        osc.stop(t + duration);
    } catch (e) { /* 音が出せない環境は無視 */ }
}
function playPop() { playTone(520, 0.08, "triangle", 0.1); }
function playCoin() { playTone(880, 0.12, "sine", 0.1); setTimeout(() => playTone(1318, 0.14, "sine", 0.1), 90); }
function vibrate(ms = 18) { if (appPrefs.haptics && navigator.vibrate) navigator.vibrate(ms); }

document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
    initRoomSystem();
});

// .app-container は overflow:hidden だが、下にはみ出した閉じ中のモーダルのせいで
// プログラムからはスクロールできてしまう。入力欄の focus() や scrollIntoView で
// 画面全体が押し上げられて戻せなくなるのを防ぐ。（CSS の overflow:clip が効かない古い端末向けの保険）
function lockAppShellScroll() {
    const shell = document.querySelector(".app-container");
    if (!shell) return;
    shell.addEventListener("scroll", () => {
        if (shell.scrollTop !== 0 || shell.scrollLeft !== 0) {
            shell.scrollTop = 0;
            shell.scrollLeft = 0;
        }
    }, { passive: true });
}

// 予期しないエラーが出たとき、画面が黙って固まらないようにお知らせする
let lastErrorToastAt = 0;
function reportUnexpectedError() {
    const now = Date.now();
    if (now - lastErrorToastAt < 10000) return;
    lastErrorToastAt = now;
    try { showToast("うまく動かない操作がありました。続くときは再読み込みしてください"); } catch (e) { /* 通知自体の失敗は無視 */ }
}
window.addEventListener("error", (e) => {
    if (e && /ResizeObserver/i.test(String(e.message || ""))) return;
    reportUnexpectedError();
});
window.addEventListener("unhandledrejection", () => reportUnexpectedError());

// ブラウザの自動掃除でデータが消えにくいように、永続ストレージを申請する
function requestPersistentStorage() {
    try {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) { /* 非対応は無視 */ }
}

// オフラインでも開けるようにする（https または localhost のときだけ）
function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register("sw.js").catch(() => {});
}

const BACKUP_REMIND_AFTER_DAYS = 30;
const BACKUP_REMIND_REPEAT_DAYS = 7;

function daysSince(iso) {
    if (!iso) return Infinity;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return Infinity;
    return (Date.now() - t) / 86400000;
}

function shouldShowBackupBanner() {
    if (activeExpenses().length < 5) return false;
    if (daysSince(appPrefs.lastBackupAt) < BACKUP_REMIND_AFTER_DAYS) return false;
    if (daysSince(appPrefs.backupRemindedAt) < BACKUP_REMIND_REPEAT_DAYS) return false;
    return true;
}

function renderBackupBanner() {
    const el = document.getElementById("backup-banner");
    if (!el) return;
    if (!shouldShowBackupBanner()) { el.style.display = "none"; return; }
    const d = daysSince(appPrefs.lastBackupAt);
    const text = document.getElementById("backup-banner-text");
    if (text) {
        text.textContent = Number.isFinite(d)
            ? `最後のバックアップから ${Math.floor(d)} 日たちました。CSVを書き出しておくと安心です。`
            : "まだバックアップがありません。CSVを書き出しておくと、端末が壊れても安心です。";
    }
    el.style.display = "flex";
}

function initApp() {
    lockAppShellScroll();
    requestPersistentStorage();
    registerServiceWorker();
    saveData();
    renderBackupBanner();
    renderMonthNav();
    renderPeriodLabel();
    renderBudgetSummary();
    renderCategorySelect();
    renderCategoryManageList();
    renderBudgetInputValue();
    renderExpenseTimeline();
    renderCharts();
    renderPlanCard();
}

let lastSaveWarnAt = 0;
function warnSaveFailed() {
    const now = Date.now();
    if (now - lastSaveWarnAt < 15000) return;
    lastSaveWarnAt = now;
    alert("データを保存できませんでした。\nブラウザの保存容量がいっぱいか、プライベートモードの可能性があります。\n「データ管理」でCSVを書き出しておくと安心です。");
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
        return true;
    } catch (e) {
        warnSaveFailed();
        return false;
    }
}

function activeExpenses() {
    return appData.expenses.filter(e => !e.deletedAt);
}

function expensesOfMonth(monthKey) {
    return activeExpenses().filter(e => e.monthKey === monthKey);
}

// ==========================================
// 2. 年月ユーティリティ
// ==========================================
function getCurrentMonthKey() {
    return localMonthKey(new Date());
}

function getViewMonthKey() {
    return selectedMonthKey;
}

function isViewingCurrentMonth() {
    return selectedMonthKey === getCurrentMonthKey();
}

function getCurrentPeriodLabel() {
    return t("{m}の予算", { m: formatMonthLabel(selectedMonthKey) });
}

function renderPeriodLabel() {
    const label = document.getElementById("budget-period-label");
    if (label) label.textContent = getCurrentPeriodLabel();
}

function setViewMonth(monthKey) {
    const current = getCurrentMonthKey();
    selectedMonthKey = monthKey > current ? current : monthKey;
    renderMonthNav();
    renderPeriodLabel();
    renderBudgetSummary();
    renderBudgetInputValue();
    renderExpenseTimeline();
    renderCharts();
    renderPlanCard();
}

function renderMonthNav() {
    const nextBtn = document.getElementById("btn-next-month");
    if (nextBtn) nextBtn.disabled = selectedMonthKey >= getCurrentMonthKey();

    const todayBtn = document.getElementById("btn-this-month");
    if (todayBtn) todayBtn.style.display = isViewingCurrentMonth() ? "none" : "inline-flex";

}

function renderBreakdownTitle() {
    const el = document.getElementById("breakdown-title-text");
    if (el) el.textContent = t("{m}の内訳", { m: formatMonthLabel(selectedMonthKey) });
}

// ==========================================
// 3. 予算サマリー
// ==========================================
function renderBudgetSummary() {
    const monthKey = getViewMonthKey();
    const budget = appData.budget[monthKey] || 0;
    const spent = expensesOfMonth(monthKey).reduce((sum, e) => sum + e.amount, 0);

    const summarySpent = document.getElementById("summary-spent");
    const summaryBudget = document.getElementById("summary-budget");
    const remainingText = document.getElementById("budget-remaining-text");
    const progressFill = document.getElementById("budget-progress-fill");
    const budgetBox = document.getElementById("budget-box");
    const fab = document.getElementById("fab-add-expense");
    const btnEditBudget = document.getElementById("btn-edit-budget");

    if (btnEditBudget) btnEditBudget.style.display = "inline-flex";

    if (fab) fab.classList.toggle("needs-budget", isViewingCurrentMonth() && budget <= 0);

    if (summarySpent) summarySpent.textContent = spent.toLocaleString();
    if (summaryBudget) summaryBudget.textContent = budget.toLocaleString();

    if (budgetBox) budgetBox.classList.remove("state-over");

    if (budget <= 0) {
        if (remainingText) {
            remainingText.textContent = isViewingCurrentMonth()
                ? t("予算を決めよう")
                : t("予算なし");
        }
        if (progressFill) progressFill.style.width = "0%";
        petWasOverBudget = false;
        refreshPetMood();
        return;
    }

    const ratio = spent / budget;
    const percent = Math.min(ratio * 100, 100);
    if (progressFill) progressFill.style.width = `${percent}%`;

    const remaining = budget - spent;
    if (remainingText) {
        remainingText.innerHTML = remaining >= 0
            ? `<span class="remain-prefix">${t("残り")}</span> ${fmtYen(remaining)}`
            : `${fmtYen(Math.abs(remaining))} ${t("超過")}`;
    }

    if (budgetBox) {
        if (ratio > 0.8) budgetBox.classList.add("state-over");
    }

    const isOverNow = ratio > 1;
    if (isOverNow && !petWasOverBudget) petFeelDown();
    petWasOverBudget = isOverNow;

    refreshPetMood();
}

function renderBudgetInputValue() {
    const budgetInput = document.getElementById("budget-input");
    if (budgetInput) budgetInput.value = appData.budget[getViewMonthKey()] || "";
}

// ==========================================
// 4. カテゴリ管理
// ==========================================
function getCategoryById(id) {
    if (id === undefined || id === null) return undefined;
    const key = String(id);
    return appData.categories.find(c => String(c.id) === key);
}

function renderCategorySelect() {
    const select = document.getElementById("expense-category");
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = appData.categories
        .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
        .join("");
    if (appData.categories.some(c => String(c.id) === prevValue)) select.value = prevValue;
}

function renderCategoryManageList() {
    const list = document.getElementById("category-manage-list");
    if (!list) return;
    list.innerHTML = "";
    appData.categories.forEach(cat => {
        const row = document.createElement("div");
        row.className = "category-manage-row";
        row.dataset.catId = cat.id;
        row.innerHTML = `
            <span class="material-icons-round category-drag-handle" data-cat-drag title="${t('ドラッグで並び替え')}" aria-label="${t('ドラッグで並び替え')}">menu</span>
            <span class="category-manage-name">${escapeHtml(cat.name)}</span>
            <span class="category-manage-actions">
                <span class="material-icons-round" data-cat-action="edit" data-cat-id="${escapeHtml(cat.id)}" title="${t('編集')}">edit</span>
                <span class="material-icons-round delete-icon" data-cat-action="delete" data-cat-id="${escapeHtml(cat.id)}" title="${t('削除')}">delete</span>
            </span>
        `;
        list.appendChild(row);
    });
}

// 三本線アイコンをつかんで上下にドラッグすると並び順を変えられる（指でもマウスでも動く）
function setupCategoryReorder() {
    const list = document.getElementById("category-manage-list");
    if (!list || list.dataset.reorderReady) return;
    list.dataset.reorderReady = "1";

    let drag = null;

    const rowsExcept = (row) => Array.from(list.querySelectorAll(".category-manage-row")).filter(r => r !== row);

    list.addEventListener("pointerdown", (e) => {
        const handle = e.target.closest("[data-cat-drag]");
        if (!handle) return;
        const row = handle.closest(".category-manage-row");
        if (!row) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        drag = { row, handle, pointerId: e.pointerId, startY: e.clientY, offset: 0, rowH: rect.height };
        try { handle.setPointerCapture(e.pointerId); } catch (err) { /* 古いブラウザでは無視 */ }
        row.classList.add("is-dragging");
        list.classList.add("is-reordering");
    });

    list.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        e.preventDefault();
        const row = drag.row;
        let dy = e.clientY - drag.startY - drag.offset;
        row.style.transform = `translateY(${dy}px)`;

        // 自分より上／下の行の真ん中を越えたら、入れ替える
        const myRect = row.getBoundingClientRect();
        const myMid = myRect.top + myRect.height / 2;
        const others = rowsExcept(row);
        for (const other of others) {
            const r = other.getBoundingClientRect();
            const mid = r.top + r.height / 2;
            const isAbove = other.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING;
            if (isAbove && myMid < mid) {
                const before = row.getBoundingClientRect().top;
                list.insertBefore(row, other);
                const moved = row.getBoundingClientRect().top - before;
                drag.offset += moved;
                row.style.transform = `translateY(${e.clientY - drag.startY - drag.offset}px)`;
                break;
            }
            if (!isAbove && myMid > mid) {
                const before = row.getBoundingClientRect().top;
                list.insertBefore(row, other.nextSibling);
                const moved = row.getBoundingClientRect().top - before;
                drag.offset += moved;
                row.style.transform = `translateY(${e.clientY - drag.startY - drag.offset}px)`;
                break;
            }
        }
    });

    const finish = (e, cancelled) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        const { row, handle } = drag;
        try { handle.releasePointerCapture(drag.pointerId); } catch (err) { /* 無視 */ }
        row.classList.remove("is-dragging");
        row.style.transform = "";
        list.classList.remove("is-reordering");
        drag = null;

        const ids = Array.from(list.querySelectorAll(".category-manage-row")).map(r => r.dataset.catId);
        const byId = new Map(appData.categories.map(c => [String(c.id), c]));
        const next = ids.map(id => byId.get(String(id))).filter(Boolean);
        const changed = next.length === appData.categories.length
            && next.some((c, i) => c !== appData.categories[i]);
        if (cancelled || !changed) {
            renderCategoryManageList();
            return;
        }
        appData.categories = next;
        saveData();
        refreshCategoryViews();
        vibrate(10);
    };
    list.addEventListener("pointerup", (e) => finish(e, false));
    list.addEventListener("pointercancel", (e) => finish(e, true));
}

function openCategoryForm(mode) {
    categoryFormMode = mode;
    const form = document.getElementById("category-edit-form");
    const saveBtn = document.getElementById("btn-save-category");
    if (form) form.classList.add("open");
    if (saveBtn) saveBtn.textContent = mode === "edit" ? "更新する" : t("追加する");
}

function closeCategoryForm() {
    const form = document.getElementById("category-edit-form");
    if (form) form.classList.remove("open");
    document.getElementById("cat-edit-id").value = "";
    document.getElementById("cat-form-name").value = "";
}

function startEditCategory(id) {
    const cat = getCategoryById(id);
    if (!cat) return;
    document.getElementById("cat-edit-id").value = cat.id;
    document.getElementById("cat-form-name").value = cat.name;
    openCategoryForm("edit");
}

function deleteCategoryById(id) {
    if (appData.categories.length <= 1) {
        alert("カテゴリは最低1つ必要です。");
        return;
    }
    const cat = getCategoryById(id);
    if (!cat) return;
    if (!confirm(`「${cat.name}」を削除しますか？\n記録済みの支出は残りのカテゴリに移動されます。`)) return;

    appData.categories = appData.categories.filter(c => String(c.id) !== String(id));
    const fallbackId = appData.categories[0].id;
    appData.expenses.forEach(e => {
        if (String(e.categoryId) === String(id)) {
            e.categoryId = fallbackId;
            e.updatedAt = new Date().toISOString();
        }
    });

    // 消したカテゴリの予算が「不明」として残らないように取り除く
    if (appData.categoryBudget && typeof appData.categoryBudget === "object") {
        Object.keys(appData.categoryBudget).forEach(monthKey => {
            const map = appData.categoryBudget[monthKey];
            if (!map || typeof map !== "object") return;
            delete map[String(id)];
            if (Object.keys(map).length === 0) {
                delete appData.categoryBudget[monthKey];
                if (appData.categoryBudgetUpdatedAt) delete appData.categoryBudgetUpdatedAt[monthKey];
            } else if (appData.categoryBudgetUpdatedAt) {
                appData.categoryBudgetUpdatedAt[monthKey] = new Date().toISOString();
            }
        });
    }

    saveData();
    refreshCategoryViews();
    closeCategoryForm();
}

// ==========================================
// 4.5 絞り込み
// ==========================================

// ==========================================
// 5. 支出タイムライン
// ==========================================
function renderExpenseTimeline() {
    renderBreakdownTitle();
    renderBreakdown();

    const container = document.getElementById("expense-timeline");
    if (!container) return;
    container.innerHTML = "";

    const monthKey = getViewMonthKey();
    const monthExpenses = expensesOfMonth(monthKey);

    if (monthExpenses.length === 0) {
        container.innerHTML = `<p class="timeline-empty-hint">${
            isViewingCurrentMonth() ? t("今月の支出はまだ記録されていません")
                                    : t("{m}の支出は記録されていません", { m: formatMonthLabel(monthKey) })
        }</p>`;
        return;
    }

    const sorted = monthExpenses.slice()
        .sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)));

    let lastDateKey = null;
    sorted.forEach(exp => {
        const cat = getCategoryById(exp.categoryId) || { name: t("不明") };

        const dayKey = exp.dateKey || localDateKey(exp.datetime);
        if (dayKey !== lastDateKey) {
            lastDateKey = dayKey;
            const divider = document.createElement("div");
            divider.className = "timeline-date-divider";
            divider.innerHTML = `<span>${formatDateLabel(exp.datetime)}</span>`;
            container.appendChild(divider);
        }

        const items = Array.isArray(exp.items) ? exp.items : [];
        const itemsHtml = items.length > 0
            ? `<button class="card-detail-toggle" data-action="toggle" type="button">
                   明細 ${items.length}点 <span class="material-icons-round">expand_more</span>
               </button>
               <div class="card-items" hidden>
                   ${items.map(it => `
                       <div class="card-item-row">
                           <span class="card-item-name">${escapeHtml(it.name || t("（名称なし）"))}${
                               Number(it.qty) > 1 ? ` ×${Number(it.qty)}` : ""
                           }</span>
                           <span class="card-item-price">${fmtYen(Number(it.price) || 0)}</span>
                       </div>
                   `).join("")}
               </div>`
            : "";

        const card = document.createElement("div");
        card.className = "card is-tappable";
        card.dataset.expId = exp.id;
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.innerHTML = `
            <div class="card-info">
                <div class="card-head">
                    <span class="category-badge">${escapeHtml(cat.name)}</span>
                    ${exp.memo ? `<span class="card-memo">${escapeHtml(exp.memo)}</span>` : ""}
                </div>
                ${exp.store ? `<span class="card-store"><span class="material-icons-round">storefront</span>${escapeHtml(exp.store)}</span>` : ""}
                ${itemsHtml}
            </div>
            <div class="card-right">
                <span class="main-amount">${fmtYen(Number(exp.amount) || 0)}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

function applyBreakdownCollapse() {
    const box = document.getElementById("breakdown-box");
    const btn = document.getElementById("btn-toggle-breakdown");
    const collapsed = !!appPrefs.breakdownCollapsed;
    if (box) box.classList.toggle("is-collapsed", collapsed);
    if (btn) btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

function renderBreakdown() {
    applyBreakdownCollapse();
    const list = document.getElementById("breakdown-list");
    if (!list) return;
    list.innerHTML = "";

    const monthKey = getViewMonthKey();
    const monthExpenses = expensesOfMonth(monthKey);

    if (monthExpenses.length === 0) {
        list.innerHTML = `<p class="breakdown-empty">${
            isViewingCurrentMonth() ? t("今月の支出はまだありません")
                                    : t("{m}の支出はありません", { m: formatMonthLabel(monthKey) })
        }</p>`;
        return;
    }

    const totals = {};
    monthExpenses.forEach(e => {
        const key = String(e.categoryId);
        totals[key] = (totals[key] || 0) + (Number(e.amount) || 0);
    });

    const entries = Object.keys(totals)
        .map(cid => ({ cat: getCategoryById(cid) || { name: t("不明") }, amt: totals[cid] }))
        .sort((a, b) => b.amt - a.amt);

    const max = Math.max(1, ...entries.map(entry => entry.amt));
    entries.forEach(({ cat, amt }) => {
        const pct = Math.max(4, Math.round((amt / max) * 100));
        const row = document.createElement("div");
        row.className = "breakdown-row";
        row.innerHTML = `
            <span class="breakdown-label">${escapeHtml(cat.name)}</span>
            <span class="breakdown-track"><span class="breakdown-fill" style="width:${pct}%"></span></span>
            <span class="breakdown-value">${fmtYen(amt)}</span>
        `;
        list.appendChild(row);
    });
}

function formatDateLabel(isoStr) {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(d);
}

function formatTimeLabel(isoStr) {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

function formatFullDateTimeLabel(isoStr) {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

// ==========================================
// 6. 支出フォーム検証
// ==========================================
function validateExpenseInput() {
    const amountInput = document.getElementById("expense-amount");
    const btnSave = document.getElementById("btn-save-expense");
    if (!amountInput || !btnSave) return;
    const amount = parseFloat(amountInput.value);
    const needsConfirmation = receiptMismatchPending && !receiptMismatchConfirmed;
    btnSave.disabled = isNaN(amount) || amount <= 0 || needsConfirmation;
}

// ==========================================
// 7. イベントリスナー
// ==========================================
function showToast(message) {
    if (!message) return;
    let toast = document.getElementById("app-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "app-toast";
        toast.className = "app-toast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function ensureBudgetIsSet() {
    const monthKey = getCurrentMonthKey();
    if ((appData.budget[monthKey] || 0) > 0) return true;

    const budgetBox = document.getElementById("budget-box");
    document.getElementById("budget-box-display")?.classList.add("hidden");
    document.getElementById("budget-box-edit")?.classList.add("open");
    
    setTimeout(() => document.getElementById("budget-input")?.focus(), 300);

    budgetBox?.classList.remove("budget-required-shake");
    void budgetBox?.offsetWidth;
    budgetBox?.classList.add("budget-required-shake");

    showToast(t("先に今月の予算を設定してね！"));
    vibrate(20);
    return false;
}

// ==========================================
// モーダル背景タップで閉じる
// ==========================================
const MODAL_NO_BACKDROP_CLOSE = ["modal-pet-select", "modal-pet-name"];

function isExpenseFormDirty() {
    const v = (id) => {
        const el = document.getElementById(id);
        return el ? String(el.value || "").trim() : "";
    };
    return !!(v("expense-amount") || v("expense-memo"));
}

function closeModalByBackdrop(overlay) {
    if (!overlay) return;
    if (MODAL_NO_BACKDROP_CLOSE.indexOf(overlay.id) !== -1) return;
    if (overlay.id === "modal-expense" && isExpenseFormDirty()
        && !confirm(t("入力中の内容は保存されません。閉じますか？"))) return;
    overlay.classList.remove("open");
}

function setupModalBackdropClose() {
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
        if (MODAL_NO_BACKDROP_CLOSE.indexOf(overlay.id) !== -1) return;

        overlay.addEventListener("click", (e) => {
            if (e.target !== overlay) return;
            closeModalByBackdrop(overlay);
        });
    });

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        document.querySelectorAll(".modal-overlay.open").forEach(overlay => {
            closeModalByBackdrop(overlay);
        });
    });
}

function setupEventListeners() {
    // ヘッダーのメニュー（画面いっぱいに開く）
    const menuModal = document.getElementById("modal-menu");
    document.getElementById("btn-open-more")?.addEventListener("click", () => menuModal?.classList.add("open"));
    document.getElementById("btn-close-menu")?.addEventListener("click", () => menuModal?.classList.remove("open"));
    menuModal?.addEventListener("click", (e) => {
        if (e.target.closest(".more-item")) menuModal.classList.remove("open");
    });

    document.getElementById("btn-open-details")?.addEventListener("click", () => {
        renderCharts();
        document.getElementById("modal-details")?.classList.add("open");
    });
    document.getElementById("btn-close-details")?.addEventListener("click", () => {
        document.getElementById("modal-details")?.classList.remove("open");
    });
    document.getElementById("btn-toggle-breakdown")?.addEventListener("click", () => {
        appPrefs.breakdownCollapsed = !appPrefs.breakdownCollapsed;
        savePrefs();
        applyBreakdownCollapse();
    });

    const btnEditBudget = document.getElementById("btn-edit-budget");
    if (btnEditBudget) {
        btnEditBudget.addEventListener("click", () => {
            renderBudgetInputValue();
            document.getElementById("budget-box-display").classList.add("hidden");
            document.getElementById("budget-box-edit").classList.add("open");
            setTimeout(() => document.getElementById("budget-input")?.focus(), 200);
        });
    }

    const btnSaveBudget = document.getElementById("btn-save-budget");
    if (btnSaveBudget) {
        btnSaveBudget.addEventListener("click", () => {
            const budgetInput = document.getElementById("budget-input");
            if (!budgetInput) return;

            const monthKey = getViewMonthKey();
            const value = parseFloat(budgetInput.value);

            if (isNaN(value) || value <= 0) {
                showToast(t("1円以上の予算を設定してね！"));
                return;
            }

            const existing = appData.budget[monthKey] || 0;
            if (existing > 0 && existing !== value) {
                if (!confirm(t("{m}の予算を {a}円 から {b}円 に変更しますか？", { m: formatMonthLabel(monthKey), a: existing.toLocaleString(), b: value.toLocaleString() }))) {
                    return;
                }
            }

            appData.budget[monthKey] = value;
            if (!appData.budgetUpdatedAt || typeof appData.budgetUpdatedAt !== "object") {
                appData.budgetUpdatedAt = {};
            }
            appData.budgetUpdatedAt[monthKey] = new Date().toISOString();
            saveData();
            renderBudgetSummary();
            renderPlanCard();
            document.getElementById("budget-box-display").classList.remove("hidden");
            document.getElementById("budget-box-edit").classList.remove("open");
            showToast(t("{m}の予算を {v}円 にしたよ", { m: formatMonthLabel(monthKey), v: value.toLocaleString() }));
            if (typeof onboardingNotify === "function") onboardingNotify("budget");
        });
    }

    const fabAddExpense = document.getElementById("fab-add-expense");
    if (fabAddExpense) {
        fabAddExpense.addEventListener("click", () => {
            if (!ensureBudgetIsSet()) return;
            openExpenseModal();
        });
    }

    const btnCloseExpense = document.getElementById("btn-close-expense");
    if (btnCloseExpense) {
        btnCloseExpense.addEventListener("click", () => {
            const modal = document.getElementById("modal-expense");
            if (modal) modal.classList.remove("open");
        });
    }

    const expenseAmount = document.getElementById("expense-amount");
    if (expenseAmount) expenseAmount.addEventListener("input", () => {
        if (pendingReceipt) refreshReceiptMismatchState();
        else validateExpenseInput();
    });

    document.getElementById("btn-delete-expense")?.addEventListener("click", async () => {
        const editId = document.getElementById("expense-edit-id")?.value;
        if (!editId) return;
        if (await confirmDeleteExpense(editId)) {
            document.getElementById("modal-expense")?.classList.remove("open");
        }
    });

    const btnSaveExpense = document.getElementById("btn-save-expense");
    if (btnSaveExpense) {
        btnSaveExpense.addEventListener("click", async () => {
            const now = new Date();
            const editId = document.getElementById("expense-edit-id").value;
            const amount = parseFloat(document.getElementById("expense-amount").value);
            const categoryId = String(document.getElementById("expense-category").value || "");
            const memo = document.getElementById("expense-memo").value.trim();
            const storeEl = document.getElementById("expense-store");
            const store = storeEl ? storeEl.value.trim() : "";
            const items = collectItemsFromForm();

            const dateEl = document.getElementById("expense-datetime");
            const prevExpense = editId ? appData.expenses.find(e => String(e.id) === String(editId)) : null;
            const when = composeExpenseWhen(dateEl ? dateEl.value : "", prevExpense ? prevExpense.datetime : null);

            if (isNaN(amount) || amount <= 0) return;

            if (pendingReceipt) {
                const receiptCheck = validateReceipt(currentReceiptDraft());
                if (receiptCheck.mismatch && !receiptMismatchConfirmed) {
                    showToast(t("明細と合計が一致していません。確認チェックを入れてから保存してください。"));
                    return;
                }
            }

            if (localMonthKey(when) > getCurrentMonthKey()) {
                alert(t("来月以降の日付は記録できません。日付を確認してください。"));
                return;
            }

            let receiptImageId = null;
            if (pendingReceipt && pendingReceipt.dataUrl) {
                receiptImageId = newId();
                try {
                    await saveReceiptImage(receiptImageId, dataUrlToBlob(pendingReceipt.dataUrl));
                } catch (e) {
                    receiptImageId = null;
                }
            }

            let targetMonth = selectedMonthKey;
            let gainedAffection = 0;

            if (editId) {
                const existing = appData.expenses.find(e => String(e.id) === String(editId));
                if (existing) {
                    const oldImageId = existing.receiptImageId;
                    existing.amount = amount;
                    existing.categoryId = categoryId;
                    existing.memo = memo;
                    if (document.getElementById("expense-store")) existing.store = store;
                    if (document.getElementById("expense-items-list")) existing.items = items;
                    existing.datetime = when.toISOString();
                    existing.dateKey = localDateKey(when);
                    existing.monthKey = localMonthKey(when);
                    if (receiptImageId) {
                        existing.receiptImageId = receiptImageId;
                        if (oldImageId && oldImageId !== receiptImageId
                            && typeof deleteReceiptImage === "function") {
                            deleteReceiptImage(oldImageId).catch(() => {});
                        }
                    }
                    existing.updatedAt = now.toISOString();
                    targetMonth = existing.monthKey;
                }
            } else {
                appData.expenses.push({
                    id: newId(),
                    amount, categoryId, memo, store, items,
                    datetime: when.toISOString(),
                    dateKey: localDateKey(when),
                    monthKey: localMonthKey(when),
                    receiptImageId: receiptImageId,
                    source: pendingReceipt ? "ocr" : "manual",
                    deletedAt: null,
                    createdAt: now.toISOString(),
                    updatedAt: now.toISOString()
                });
                targetMonth = localMonthKey(when);
                roomData.points += 100;
                saveRoomData();
                renderCurrency();
                gainedAffection = addAffection(1);
            }

            saveData();
            pendingReceipt = null;

            if (targetMonth && targetMonth !== selectedMonthKey) setViewMonth(targetMonth);

            refreshAfterExpenseChange();

            if (editId) {
                spawnPetReaction("favorite");
                showToast(t("支出を更新しました"));
            } else {
                petCelebrate();
                const parts = [t("+{p}pt 獲得", { p: 100 })];
                if (gainedAffection > 0) parts.push(t("好感度 +{a}", { a: gainedAffection }));
                showToast(parts.join("　"));
                playCoin();
            }
            vibrate(25);
            const modal = document.getElementById("modal-expense");
            if (modal) modal.classList.remove("open");
            if (!editId && typeof onboardingNotify === "function") onboardingNotify("expense");
        });
    }

    const btnOpenCategory = document.getElementById("btn-open-category");    if (btnOpenCategory) {
        btnOpenCategory.addEventListener("click", () => {
            closeCategoryForm();
            renderCategoryManageList();
            const modal = document.getElementById("modal-category");
            if (modal) modal.classList.add("open");
        });
    }

    const btnOpenData = document.getElementById("btn-open-data");
    if (btnOpenData) {
        btnOpenData.addEventListener("click", () => {
            renderStorageInfo();
            const status = document.getElementById("data-import-status");
            if (status) status.textContent = "";
            const modal = document.getElementById("modal-data");
            if (modal) modal.classList.add("open");
        });
    }

    const btnCloseData = document.getElementById("btn-close-data");
    if (btnCloseData) {
        btnCloseData.addEventListener("click", () => {
            const modal = document.getElementById("modal-data");
            if (modal) modal.classList.remove("open");
        });
    }

    // CSV の書き出しは1つだけ（家計簿・予算・カテゴリ・プラン・マイルームを全部まとめる）
    document.getElementById("btn-export-csv")?.addEventListener("click", exportUnifiedCsv);

    // CSV読み込み（統合CSV/支出CSVを自動判別）
    const inputImportCsv = document.getElementById("input-import-csv");
    if (inputImportCsv) {
        inputImportCsv.addEventListener("change", (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) importAnyCsvFile(file);
            inputImportCsv.value = "";
        });
    }

    const btnResetMonth = document.getElementById("btn-reset-month");
    if (btnResetMonth) {
        btnResetMonth.addEventListener("click", resetCurrentMonthData);
    }

    const btnResetAll = document.getElementById("btn-reset-all");
    if (btnResetAll) {
        btnResetAll.addEventListener("click", resetAllData);
    }

    const btnCloseCategory = document.getElementById("btn-close-category");
    if (btnCloseCategory) {
        btnCloseCategory.addEventListener("click", () => {
            const modal = document.getElementById("modal-category");
            if (modal) modal.classList.remove("open");
        });
    }

    const btnShowAddCategory = document.getElementById("btn-show-add-category");
    if (btnShowAddCategory) {
        btnShowAddCategory.addEventListener("click", () => {
            document.getElementById("cat-edit-id").value = "";
            document.getElementById("cat-form-name").value = "";
            openCategoryForm("add");
        });
    }

    const btnCancelCategory = document.getElementById("btn-cancel-category");
    if (btnCancelCategory) {
        btnCancelCategory.addEventListener("click", closeCategoryForm);
    }

    const btnSaveCategory = document.getElementById("btn-save-category");
    if (btnSaveCategory) {
        btnSaveCategory.addEventListener("click", () => {
            const name = document.getElementById("cat-form-name").value.trim();
            if (!name) {
                alert("カテゴリ名を入力してください。");
                return;
            }

            if (categoryFormMode === "edit") {
                const editId = document.getElementById("cat-edit-id").value;
                const existing = getCategoryById(editId);
                if (existing) {
                    existing.name = name;
                }
            } else {
                const isDuplicate = appData.categories.some(c => c.name === name);
                if (isDuplicate) {
                    alert("同じ名前のカテゴリが既にあります。");
                    return;
                }
                appData.categories.push({ id: newId(), name });
            }

            saveData();
            refreshCategoryViews();
            closeCategoryForm();
        });
    }

    document.getElementById("btn-prev-month")?.addEventListener("click", () => setViewMonth(addMonths(selectedMonthKey, -1)));
    document.getElementById("btn-next-month")?.addEventListener("click", () => setViewMonth(addMonths(selectedMonthKey, 1)));
    document.getElementById("btn-this-month")?.addEventListener("click", () => setViewMonth(getCurrentMonthKey()));

    const timeline = document.getElementById("expense-timeline");
    if (timeline) {
        timeline.addEventListener("click", (e) => {
            const card = e.target.closest(".card");
            if (!card) return;
            const expId = card.dataset.expId;
            if (!expId) return;
            const actionEl = e.target.closest("[data-action]");
            const action = actionEl ? actionEl.dataset.action : null;

            if (action === "toggle") {
                const box = card.querySelector(".card-items");
                if (!box) return;
                box.hidden = !box.hidden;
                card.classList.toggle("items-open", !box.hidden);
                return;
            }
            // 明細の中をタップしたときは開閉だけ。それ以外（金額・メモなど）は編集画面を開く
            if (e.target.closest(".card-items")) return;
            editExpense(expId);
        });
        timeline.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const card = e.target.closest ? e.target.closest(".card") : null;
            if (!card || e.target !== card || !card.dataset.expId) return;
            e.preventDefault();
            editExpense(card.dataset.expId);
        });
    }

    setupCategoryReorder();

    const catListEl = document.getElementById("category-manage-list");
    if (catListEl) {
        catListEl.addEventListener("click", (e) => {
            const target = e.target.closest("[data-cat-action]");
            if (!target) return;
            const catId = target.dataset.catId;
            if (target.dataset.catAction === "edit") startEditCategory(catId);
            else if (target.dataset.catAction === "delete") deleteCategoryById(catId);
        });
    }

    document.getElementById("btn-open-planner")?.addEventListener("click", openPlannerModal);
    document.getElementById("btn-close-planner")?.addEventListener("click", () => {
        document.getElementById("modal-planner")?.classList.remove("open");
    });
    document.getElementById("btn-run-planner")?.addEventListener("click", runPlanner);
    document.getElementById("planner-difficulty")?.addEventListener("click", (e) => {
        const card = e.target.closest("[data-difficulty]");
        if (!card) return;
        plannerDifficulty = card.dataset.difficulty;
        updateDifficultyButtons();
    });
    document.getElementById("plan-card")?.addEventListener("click", (e) => {
        if (e.target.closest("#btn-clear-plan")) clearPlan();
    });

    document.getElementById("btn-backup-banner-open")?.addEventListener("click", () => {
        appPrefs.backupRemindedAt = new Date().toISOString();
        savePrefs();
        exportUnifiedCsv();
    });
    document.getElementById("btn-backup-banner-later")?.addEventListener("click", () => {
        appPrefs.backupRemindedAt = new Date().toISOString();
        savePrefs();
        renderBackupBanner();
    });
    document.getElementById("btn-replay-onboarding")?.addEventListener("click", () => {
        document.getElementById("modal-data")?.classList.remove("open");
        if (typeof startOnboarding === "function") startOnboarding(true);
    });
    const soundToggle = document.getElementById("pref-sound");
    const hapticToggle = document.getElementById("pref-haptics");
    if (soundToggle) {
        soundToggle.checked = !!appPrefs.sound;
        soundToggle.addEventListener("change", () => {
            appPrefs.sound = soundToggle.checked;
            savePrefs();
            if (appPrefs.sound) playPop();
        });
    }
    if (hapticToggle) {
        hapticToggle.checked = !!appPrefs.haptics;
        hapticToggle.addEventListener("change", () => {
            appPrefs.haptics = hapticToggle.checked;
            savePrefs();
            if (appPrefs.haptics) vibrate(30);
        });
    }

    setupModalBackdropClose();
}

// ==========================================
// 7.5 品目エディタ
// ==========================================
function addItemRow(name = "", price = "", categoryId = null) {
    const list = document.getElementById("expense-items-list");
    if (!list) return;
    const row = document.createElement("div");
    row.className = "item-row";
    if (categoryId) row.dataset.categoryId = String(categoryId);
    row.innerHTML = `
        <input type="text" class="item-name" placeholder="${t('品目（例：牛乳）')}" value="${escapeHtml(name)}" maxlength="40">
        <input type="number" class="item-price" placeholder="0" min="0" step="1" value="${price === "" || price === undefined ? "" : (Number(price) || 0)}">
        <span class="item-unit">${t("円")}</span>
        <button type="button" class="item-remove" data-item-remove title="${t('この行を削除')}">
            <span class="material-icons-round">close</span>
        </button>
    `;
    list.appendChild(row);
    updateItemsSummary();
}

function collectItemsFromForm() {
    const list = document.getElementById("expense-items-list");
    if (!list) return [];
    const items = [];
    list.querySelectorAll(".item-row").forEach(row => {
        const nameEl = row.querySelector(".item-name");
        const priceEl = row.querySelector(".item-price");
        const name = (nameEl ? nameEl.value : "").trim();
        const price = parseFloat(priceEl ? priceEl.value : "");
        if (!name && (isNaN(price) || price === 0)) return;
        items.push(normalizeItem({
            name: name || t("（名称なし）"),
            price: isNaN(price) ? 0 : price,
            qty: 1,
            categoryId: row.dataset.categoryId || null
        }));
    });
    return items;
}

function sumItemPrices() {
    return collectItemsFromForm().reduce((sum, it) => sum + (Number(it.price) || 0), 0);
}

function updateItemsSummary() {
    const el = document.getElementById("items-summary");
    if (!el) return;
    const items = collectItemsFromForm();
    if (items.length === 0) {
        el.textContent = "";
        refreshReceiptMismatchState();
        return;
    }
    el.textContent = t("品目 {k}点・合計 {s}", { k: items.length, s: fmtYen(sumItemPrices()) });
    refreshReceiptMismatchState();
}

function renderItemsEditor(items) {
    const list = document.getElementById("expense-items-list");
    if (!list) return;
    list.innerHTML = "";
    (Array.isArray(items) ? items : []).forEach(it =>
        addItemRow(it.name || "", it.price === undefined ? "" : it.price, it.categoryId || null)
    );
    updateItemsSummary();
}

// ==========================================
// 8. 支出モーダル
// ==========================================
// 日時の入力欄は「今月末」までしか選べないようにする（来月以降は画面に表示できないため）
function limitExpenseDatetime() {
    const el = document.getElementById("expense-datetime");
    if (!el) return;
    const n = new Date();
    el.max = toDateInputValue(new Date(n.getFullYear(), n.getMonth() + 1, 0));
}

// 新規のときは「記録する」、編集のときは「保存」＋「この支出を削除」を出す
function setExpenseModalMode(editing) {
    const btn = document.getElementById("btn-save-expense");
    if (btn) btn.textContent = editing ? t("保存") : t("記録する");
    const del = document.getElementById("btn-delete-expense");
    if (del) del.hidden = !editing;
}

function openExpenseModal() {
    const titleEl = document.getElementById("expense-modal-title");
    const editIdEl = document.getElementById("expense-edit-id");
    const amountEl = document.getElementById("expense-amount");
    const memoEl = document.getElementById("expense-memo");
    const storeEl = document.getElementById("expense-store");
    const datetimeEl = document.getElementById("expense-datetime");
    const modal = document.getElementById("modal-expense");

    if (titleEl) titleEl.textContent = t("支出を記録");
    if (editIdEl) editIdEl.value = "";
    if (amountEl) amountEl.value = "";
    if (memoEl) memoEl.value = "";
    if (storeEl) storeEl.value = "";
    if (datetimeEl) datetimeEl.value = toDateInputValue(new Date());
    limitExpenseDatetime();
    resetReceiptUi();
    renderItemsEditor([]);
    renderCategorySelect();
    setExpenseModalMode(false);

    validateExpenseInput();
    if (modal) modal.classList.add("open");
}

function editExpense(id) {
    const exp = appData.expenses.find(e => String(e.id) === String(id));
    if (!exp) return;

    const titleEl = document.getElementById("expense-modal-title");
    const editIdEl = document.getElementById("expense-edit-id");
    const amountEl = document.getElementById("expense-amount");
    const categoryEl = document.getElementById("expense-category");
    const memoEl = document.getElementById("expense-memo");
    const storeEl = document.getElementById("expense-store");
    const datetimeEl = document.getElementById("expense-datetime");
    const modal = document.getElementById("modal-expense");

    if (titleEl) titleEl.textContent = t("支出を編集");
    if (editIdEl) editIdEl.value = exp.id;
    if (amountEl) amountEl.value = exp.amount;
    renderCategorySelect();
    if (categoryEl) categoryEl.value = exp.categoryId;
    if (memoEl) memoEl.value = exp.memo || "";
    if (storeEl) storeEl.value = exp.store || "";
    if (datetimeEl) datetimeEl.value = toDateInputValue(exp.datetime);
    limitExpenseDatetime();
    resetReceiptUi();
    renderItemsEditor(Array.isArray(exp.items) ? exp.items : []);
    setExpenseModalMode(true);
    showReceiptThumbnail(exp.receiptImageId);

    validateExpenseInput();
    if (modal) modal.classList.add("open");
}

let undoBarTimer = null;

function hideUndoBar() {
    const bar = document.getElementById("undo-bar");
    if (bar) bar.classList.remove("show");
    clearTimeout(undoBarTimer);
}

function showUndoBar(message, onUndo) {
    let bar = document.getElementById("undo-bar");
    if (!bar) {
        bar = document.createElement("div");
        bar.id = "undo-bar";
        bar.className = "undo-bar";
        bar.innerHTML = '<span class="undo-bar-text"></span><button type="button" class="undo-bar-btn">' + t("元に戻す") + '</button>';
        document.body.appendChild(bar);
    }
    bar.querySelector(".undo-bar-text").textContent = message;
    const btn = bar.querySelector(".undo-bar-btn");
    btn.onclick = () => { hideUndoBar(); onUndo(); };
    bar.classList.add("show");
    clearTimeout(undoBarTimer);
    undoBarTimer = setTimeout(hideUndoBar, 6000);
}

// お金まわりの画面（予算・内訳・記録・グラフ・プラン・バックアップ案内）をまとめて描き直す
function renderMoneyViews() {
    renderBudgetSummary();
    renderExpenseTimeline();
    renderCharts();
    renderPlanCard();
    renderBackupBanner();
}

function refreshAfterExpenseChange() {
    renderMoneyViews();
}

// カテゴリが変わったときに、選択肢・内訳・グラフまで一度に更新する
function refreshCategoryViews() {
    renderCategoryManageList();
    renderCategorySelect();
    renderMoneyViews();
}

function deleteExpense(id) {
    const exp = appData.expenses.find(e => String(e.id) === String(id));
    if (!exp || exp.deletedAt) return;

    const now = new Date().toISOString();
    exp.deletedAt = now;
    exp.updatedAt = now;
    saveData();
    refreshAfterExpenseChange();
    vibrate(12);

    // 取り消せる間はレシート画像を残し、時間が過ぎてから片付ける
    const imageId = exp.receiptImageId;
    const cleanup = setTimeout(() => {
        if (imageId && exp.deletedAt && typeof deleteReceiptImage === "function") {
            deleteReceiptImage(imageId).catch(() => {});
        }
    }, 6500);

    showUndoBar(t("支出を削除しました"), () => {
        clearTimeout(cleanup);
        exp.deletedAt = null;
        exp.updatedAt = new Date().toISOString();
        saveData();
        refreshAfterExpenseChange();
        playPop();
    });
}

async function confirmDeleteExpense(id) {
    const ok = await showCenterConfirm({
        id: "delete-expense-confirm",
        title: t("この支出を削除しますか？"),
        rows: [
            { icon: "delete", text: t("この支出を履歴から削除します。") },
            { icon: "undo", text: t("削除した直後は、画面下の「元に戻す」で取り消せます。") }
        ],
        okLabel: t("削除する"),
        cancelLabel: t("キャンセル"),
        danger: true
    });
    if (!ok) return false;
    deleteExpense(id);
    return true;
}

// ==========================================
// 9. データ管理（CSV書き出し・読み込み・リセット）
// ==========================================
function csvEscape(value) {
    const str = String(value === undefined || value === null ? "" : value);
    if (/[",\n]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

// ==========================================
// CSV の読み込み（自動判別）
// ==========================================
// 1ファイルで完結する「統合CSV」と、銀行・カード・PayPay などの
// 「支出だけのCSV」を先頭行のマーカーで自動判別する。
const UNIFIED_CSV_MARKER = "yoyu-aru-export,1";

function importAnyCsvFile(file) {
    const statusEl = document.getElementById("data-import-status");
    const reader = new FileReader();

    reader.onload = (e) => {
        let text;
        try {
            text = decodeCsvBuffer(e.target.result);
        } catch (err) {
            text = String(e.target.result || "");
        }

        const firstLine = String(text).replace(/^\uFEFF/, "").split(/\r?\n/)[0].trim();
        if (firstLine === UNIFIED_CSV_MARKER) {
            if (/^#\s*ROOM\s*$/im.test(text)
                && !confirm("このCSVにはマイルーム（ポイント・家具・ペット）が含まれています。\n読み込むと、いまのマイルームはCSVの内容に置き換わります。\n（同じ月の予算も上書きされます）\n続けますか？")) {
                if (statusEl) statusEl.textContent = "読み込みをキャンセルしました。";
                return;
            }
            const result = importUnifiedCsvText(text);
            if (statusEl) {
                const notes = [];
                if (result.addedExpenses) notes.push(`支出 ${result.addedExpenses}件`);
                if (result.skippedDuplicates) notes.push(`重複 ${result.skippedDuplicates}件はスキップ`);
                if (result.addedCategories) notes.push(`カテゴリ ${result.addedCategories}件`);
                if (result.updatedBudgets) notes.push(`予算 ${result.updatedBudgets}件`);
                if (result.roomImported) notes.push("マイルーム");
                statusEl.textContent = notes.length > 0
                    ? `統合CSVを読み込みました：${notes.join(" ／ ")}`
                    : "統合CSVを読み込みましたが、追加されたデータはありません。";
            }
            return;
        }

        importExpensesFromCsvText(text, statusEl);
    };

    reader.onerror = () => {
        if (statusEl) statusEl.textContent = "ファイルの読み込みに失敗しました。";
    };

    reader.readAsArrayBuffer(file);
}

// CSV を二重に取り込んだときの重複判定に使う指紋。
// 日付・金額・店舗・メモ・品目がすべて同じなら「同じ記録」とみなす。
// ただし店舗もメモも品目も無い場合は、同日同額の別の買い物を
// 誤って消さないように重複判定しない（空文字を返す）。
function expenseFingerprint(exp) {
    if (!exp || typeof exp !== "object") return "";
    const date = exp.dateKey || localDateKey(exp.datetime);
    const amount = Number(exp.amount) || 0;
    const store = String(exp.store || "").trim().toLowerCase();
    const memo = String(exp.memo || "").trim().toLowerCase();
    const items = (Array.isArray(exp.items) ? exp.items : [])
        .map(it => [
            String((it && it.name) || "").trim().toLowerCase(),
            Number(it && it.price) || 0,
            Number(it && it.qty) || 1
        ].join(":"))
        .sort()
        .join("|");

    if (!store && !memo && !items) return "";
    return [date, amount, store, memo, items].join("\u0001");
}

// 解析済みの行を支出として追加する（重複はスキップ）。通常CSVも統合CSVもこれを使う。
function addImportedExpenses(records) {
    const known = new Set();
    appData.expenses.forEach(e => {
        const fp = expenseFingerprint(e);
        if (fp) known.add(fp);
    });

    let added = 0;
    let duplicates = 0;
    records.forEach(rec => {
        const when = rec.date;
        const items = Array.isArray(rec.items) ? rec.items.map(normalizeItem) : [];
        const fp = expenseFingerprint({
            dateKey: localDateKey(when), amount: rec.amount,
            store: rec.store || "", memo: rec.memo || "", items: items
        });
        if (fp && known.has(fp)) { duplicates++; return; }
        if (fp) known.add(fp);

        const categoryName = rec.categoryName || "その他";
        let category = appData.categories.find(c => c.name === categoryName);
        if (!category) {
            category = { id: newId(), name: categoryName };
            appData.categories.push(category);
        }

        const nowIso = new Date().toISOString();
        appData.expenses.push({
            id: newId(),
            amount: rec.amount,
            categoryId: category.id,
            memo: rec.memo || "",
            store: rec.store || "",
            items: items,
            datetime: when.toISOString(),
            dateKey: localDateKey(when),
            monthKey: localMonthKey(when),
            source: "csv",
            deletedAt: null,
            createdAt: nowIso,
            updatedAt: nowIso
        });
        added++;
    });
    return { added, duplicates };
}

function importExpensesFromCsvText(text, statusEl) {
    const delimiter = detectDelimiter(text);
    const rows = parseDelimitedText(text, delimiter);
    const parsed = buildExpensesFromRows(rows);

    if (parsed.records.length === 0 && parsed.skipped === 0 && parsed.deposits === 0) {
        if (statusEl) statusEl.textContent = "読み込めるデータがありませんでした。";
        return;
    }

    const { added, duplicates } = addImportedExpenses(parsed.records);

    saveData();
    refreshAllViews();

    if (statusEl) {
        const notes = [describeImportResult(parsed)];
        notes.push(`${added}件を読み込みました`);
        if (duplicates > 0) notes.push(`重複 ${duplicates}件はスキップ`);
        if (parsed.deposits > 0) notes.push(`入金 ${parsed.deposits}件は支出ではないため取り込んでいません`);
        if (parsed.skipped > 0) notes.push(`${parsed.skipped}件は読み取れずスキップ`);
        statusEl.textContent = notes.join(" ／ ");
    }
}

// ==========================================
// 統合CSV（家計＋マイルームを1ファイルに）
// ==========================================
// 目的：
//   ・「見るだけ／渡すだけ」の用途で、1ファイルで全部を持ち歩けるようにする
//   ・人が Excel で開いても中身が読める（JSON と違って）
//
// 使い分け：
//   ・正確な引っ越し … JSON バックアップ（マージ規則つき）
//   ・見る／渡す     … 統合CSV
//
// 読み込みの挙動：
//   ・カテゴリ … id が同じものは尊重し、名前だけのものは既存に寄せる（追加のみ）
//   ・予算     … 同じ月は上書きする（ファイルの値が新しいとみなす）
//   ・支出     … 追加。ただし同じ内容（日付・金額・店舗・メモ・品目）はスキップ
//   ・マイルーム … 丸ごと差し替える
function buildUnifiedCsvText() {
    const lines = [];
    lines.push(UNIFIED_CSV_MARKER);

    lines.push("");
    lines.push("# CATEGORIES");
    lines.push("id,name");
    appData.categories.forEach(c => {
        lines.push([csvEscape(c.id), csvEscape(c.name)].join(","));
    });

    lines.push("");
    lines.push("# BUDGETS");
    lines.push("month,amount");
    Object.keys(appData.budget).sort().forEach(key => {
        lines.push([csvEscape(key), appData.budget[key]].join(","));
    });


    lines.push("");
    lines.push("# EXPENSES");
    lines.push("日付,カテゴリ,金額,メモ,店舗,品目");
    const sorted = [...activeExpenses()].sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
    sorted.forEach(exp => {
        const cat = getCategoryById(exp.categoryId);
        lines.push([
            exp.dateKey || localDateKey(exp.datetime),
            cat ? cat.name : "不明",
            exp.amount,
            exp.memo || "",
            exp.store || "",
            (exp.items && exp.items.length) ? JSON.stringify(exp.items) : ""
        ].map(csvEscape).join(","));
    });

    if (appData.plan) {
        lines.push("");
        lines.push("# PLAN");
        lines.push(csvEscape(JSON.stringify(appData.plan)));
    }

    lines.push("");
    lines.push("# ROOM");
    lines.push("key,value");
    lines.push(["points", roomData.points].map(csvEscape).join(","));
    lines.push(["lastLoginDate", roomData.lastLoginDate || ""].map(csvEscape).join(","));
    lines.push(["petType", roomData.pet ? roomData.pet.type : ""].map(csvEscape).join(","));
    lines.push(["petName", roomData.pet ? (roomData.pet.name || "") : ""].map(csvEscape).join(","));
    lines.push(["petX", roomData.pet ? roomData.pet.x : ""].map(csvEscape).join(","));
    lines.push(["petY", roomData.pet ? roomData.pet.y : ""].map(csvEscape).join(","));
    lines.push(["petScale", roomData.pet ? roomData.pet.scale : ""].map(csvEscape).join(","));
    lines.push(["ownedItemIds", roomData.ownedItemIds.join("|")].map(csvEscape).join(","));
    roomExtraCsvPairs().forEach(pair => lines.push(pair.map(csvEscape).join(",")));
    roomData.placedItems.forEach((it, i) => {
        lines.push([`item_${i}`,
            `${it.uid},${it.itemId},${it.x},${it.y},${it.scale},${it.placed},${it.z || 1}`
        ].map(csvEscape).join(","));
    });

    return "\uFEFF" + lines.join("\r\n");
}

function exportUnifiedCsv() {
    const blob = new Blob([buildUnifiedCsvText()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yoyu_aru_all_${localDateKey(new Date()).replace(/-/g, "")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    markBackupDone();
}

// 統合CSVの本文を "# SECTION" 単位で分割して行配列にする
function splitUnifiedCsv(text) {
    const out = { categories: [], budgets: [], categoryBudgets: [], expenses: [], plan: [], room: [] };
    const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
    let current = null;

    for (let i = 1; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (!trimmed) continue;

        const m = trimmed.match(/^#\s*(CATEGORIES|BUDGETS|CATEGORY_BUDGETS|EXPENSES|PLAN|ROOM)\s*$/i);
        if (m) {
            current = m[1].toLowerCase() === "category_budgets"
                ? "categoryBudgets"
                : m[1].toLowerCase();
            continue;
        }
        if (!current) continue;

        const parsedRow = parseDelimitedText(raw + "\n", ",")[0] || [];
        out[current].push(parsedRow);
    }
    return out;
}

function importUnifiedCsvText(text) {
    const sections = splitUnifiedCsv(text);

    let addedExpenses = 0;
    let addedCategories = 0;
    let updatedBudgets = 0;
    let roomImported = false;
    let skippedDuplicates = 0;

    // --- カテゴリ（追加のみ） ---
    sections.categories.slice(1).forEach(row => {
        const id = String(row[0] || "").trim();
        const name = String(row[1] || "").trim();
        if (!id || !name) return;
        if (appData.categories.some(c => String(c.id) === id)) return;
        if (appData.categories.some(c => c.name === name)) return;
        appData.categories.push({ id, name });
        addedCategories++;
    });

    // --- 予算（同じ月はファイルの値で上書き） ---
    sections.budgets.slice(1).forEach(row => {
        const month = String(row[0] || "").trim();
        const amount = parseFloat(row[1]);
        if (!/^\d{4}-\d{2}$/.test(month)) return;
        if (isNaN(amount) || amount <= 0) return;

        appData.budget[month] = amount;
        if (!appData.budgetUpdatedAt || typeof appData.budgetUpdatedAt !== "object") {
            appData.budgetUpdatedAt = {};
        }
        appData.budgetUpdatedAt[month] = new Date().toISOString();
        updatedBudgets++;
    });


    // --- 支出（既存の CSV パーサを流用） ---
    if (sections.expenses.length > 1) {
        const rows = [sections.expenses[0], ...sections.expenses.slice(1)];
        const parsed = buildExpensesFromRows(rows);

        const result = addImportedExpenses(parsed.records);
        addedExpenses = result.added;
        skippedDuplicates = result.duplicates;
    }

    // --- 貯金プラン ---
    if (sections.plan.length > 0 && sections.plan[0][0]) {
        try {
            const plan = JSON.parse(sections.plan[0][0]);
            if (plan && plan.ok) appData.plan = plan;
        } catch (e) { /* 壊れたプランは無視 */ }
    }

    // --- マイルーム（丸ごと差し替え） ---
    if (sections.room.length > 1) {
        const map = {};
        const items = [];
        sections.room.slice(1).forEach(row => {
            const key = String(row[0] || "").trim();
            const value = String(row[1] === undefined ? "" : row[1]);
            if (!key) return;
            if (key.indexOf("item_") === 0) items.push(value);
            else map[key] = value;
        });

        const newRoom = JSON.parse(JSON.stringify(DEFAULT_ROOM_DATA));
        newRoom.points = parseInt(map.points, 10) || 0;
        newRoom.lastLoginDate = map.lastLoginDate || null;
        if (map.petType) {
            newRoom.pet = {
                type: map.petType,
                name: map.petName || petDefaultName(map.petType),
                x: parseFloat(map.petX) || 50,
                y: isFinite(parseFloat(map.petY)) ? parseFloat(map.petY) : PET_FLOOR_Y,
                scale: parseFloat(map.petScale) || 1
            };
        }
        newRoom.ownedItemIds = map.ownedItemIds
            ? map.ownedItemIds.split("|").filter(Boolean)
            : [];
        applyRoomExtrasFromCsvMap(newRoom, map);
        newRoom.placedItems = items.map(v => {
            const [uid, itemId, x, y, scale, placed, z] = String(v).split(",");
            return {
                uid,
                itemId,
                x: parseFloat(x),
                y: parseFloat(y),
                scale: parseFloat(scale),
                placed: placed === "true",
                z: parseInt(z, 10) || 1
            };
        });

        roomData = normalizeRoomData(newRoom);
        saveRoomData();
        roomImported = true;
    }

    saveData();
    refreshAllViews();
    if (roomImported) {
        renderRoomPreview();
        renderCurrency();
    }

    return { addedExpenses, addedCategories, updatedBudgets, roomImported, skippedDuplicates };
}

function resetCurrentMonthData() {
    const monthKey = getCurrentMonthKey();
    const label = formatMonthLabel(monthKey);
    if (!confirm(`${label}の支出と予算をすべて削除します。よろしいですか？`)) return;

    const now = new Date().toISOString();
    const imageIds = [];
    appData.expenses.forEach(e => {
        if (e.monthKey === monthKey && !e.deletedAt) {
            e.deletedAt = now;
            e.updatedAt = now;
            if (e.receiptImageId) imageIds.push(e.receiptImageId);
        }
    });
    delete appData.budget[monthKey];
    if (appData.categoryBudget) delete appData.categoryBudget[monthKey];
    if (appData.categoryBudgetUpdatedAt) delete appData.categoryBudgetUpdatedAt[monthKey];

    if (typeof deleteReceiptImage === "function") {
        imageIds.forEach(id => deleteReceiptImage(id).catch(() => {}));
    }

    saveData();
    renderMonthNav();
    renderPeriodLabel();
    renderBudgetInputValue();
    renderMoneyViews();
    renderStorageInfo();
}

async function resetAllData() {
    const ok = await showCenterConfirm({
        id: "reset-confirm",
        title: t("すべてリセットしますか？"),
        rows: [
            { icon: "delete_forever", text: t("予算・記録・マイルームのデータがすべて消えます") },
            { icon: "block", text: t("元に戻せません") }
        ],
        okLabel: t("リセットする"),
        cancelLabel: t("キャンセル"),
        danger: true
    });
    if (!ok) return;

    // localStorage.clear() は使わない。リセット対象のキーだけを消す。
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(ROOM_STORAGE_KEY);
    } catch (e) { /* 消せなくても次の saveData で上書きされる */ }

    if (typeof listReceiptImageIds === "function" && typeof deleteReceiptImage === "function") {
        listReceiptImageIds()
            .then(ids => Promise.all(ids.map(id => deleteReceiptImage(id).catch(() => {}))))
            .catch(() => {});
    }

    appData = cloneDefaultData();
    const monthKey = getCurrentMonthKey();
    selectedMonthKey = monthKey;
    appData.plan = null;

    roomData = normalizeRoomData(JSON.parse(JSON.stringify(DEFAULT_ROOM_DATA)));
    roomData.points = 8888;
    petIsAsleep = Math.random() < 0.25;
    petState = "idle";
    petStateUntil = 0;
    petWasOverBudget = false;

    saveData();
    saveRoomData();

    refreshAllViews();
    centerRoomPreviewOnPet();

    // 開いている画面（設定・メニューなど）をすべて閉じ、最初の状態へ戻す
    document.querySelectorAll(".modal-overlay.open").forEach(m => m.classList.remove("open"));
    document.getElementById("room-editor")?.classList.remove("open");
    appPrefs.roomHidden = false;
    savePrefs();
    applyRoomHidden(false);
    try { localStorage.removeItem(ONBOARDING_KEY); } catch (e) { /* 消せなくても使い方は表示する */ }

    openPetSelectModal();
    startOnboarding(true);
}

function renderStorageInfo() {
    const el = document.getElementById("data-storage-info");
    if (!el) return;
    const raw = localStorage.getItem(STORAGE_KEY) || "";
    const sizeKb = (new Blob([raw]).size / 1024).toFixed(1);
    const deleted = appData.expenses.length - activeExpenses().length;
    el.textContent = `記録件数: ${activeExpenses().length}件 ／ 保存容量: 約${sizeKb}KB`
        + (deleted > 0 ? `（削除済み ${deleted}件を含む）` : "")
        + ` ／ v${APP_VERSION}`;
}

function countRecordedMonths() {
    return new Set(activeExpenses().map(e => e.monthKey)).size;
}

function refreshAllViews() {
    applyRoomMap();
    renderMonthNav();
    renderPeriodLabel();
    renderBudgetSummary();
    renderBudgetInputValue();
    renderCategorySelect();
    renderCategoryManageList();
    renderExpenseTimeline();
    renderCharts();
    renderPlanCard();
    renderStorageInfo();
    renderRoomPreview();
    renderCurrency();
    renderBackupBanner();
}

// ==========================================
// 10. グラフ
// ==========================================
function renderCharts() {
    const monthKey = getViewMonthKey();
    const monthExpenses = expensesOfMonth(monthKey);
    const stats = getMonthStats(monthExpenses, monthKey);

    const titleEl = document.getElementById("charts-title-text");
    if (titleEl) titleEl.textContent = t("{m}のグラフ", { m: formatMonthLabel(monthKey) });

    const noteEl = document.getElementById("daily-chart-note");
    if (noteEl) {
        noteEl.textContent = stats.total > 0 ? t("合計 {n}", { n: fmtYenCompact(stats.total) }) : "";
    }

    const chartEl = document.getElementById("daily-chart");
    if (chartEl) {
        chartEl.innerHTML = stats.total > 0
            ? buildDailyBarSvg(stats.daily, { averageOverDays: stats.elapsedDays })
            : `<div class="chart-empty">この月の支出はまだありません</div>`;
    }

    const compareEl = document.getElementById("compare-list");
    if (compareEl) {
        compareEl.innerHTML = buildComparisonHtml(
            getCategoryComparison(appData.expenses, appData.categories, monthKey)
        );
    }
}
// ==========================================
// 11. AIプランナー
// ==========================================
let plannerDifficulty = "normal";

function openPlannerModal() {
    const plan = appData.plan;
    const incomeEl = document.getElementById("planner-income");
    const targetEl = document.getElementById("planner-target");
    const expenseEl = document.getElementById("planner-expense");
    const resultEl = document.getElementById("planner-result");
    const hintEl = document.getElementById("planner-expense-hint");

    const estimated = estimateMonthlyExpense(appData.expenses, 3, getCurrentMonthKey());

    if (incomeEl) incomeEl.value = plan && plan.monthlyIncome ? plan.monthlyIncome : "";
    if (targetEl) targetEl.value = plan && plan.targetAmount ? plan.targetAmount : "";
    if (expenseEl) expenseEl.value = plan && plan.monthlyExpense ? plan.monthlyExpense : (estimated || "");
    if (resultEl) resultEl.innerHTML = "";

    plannerDifficulty = (plan && plan.difficulty) ? plan.difficulty : "normal";
    updateDifficultyButtons();

    if (hintEl) {
        hintEl.textContent = estimated
            ? t("空欄なら、直近3か月の記録から {n} を使います。", { n: fmtYen(estimated) })
            : t("※月ごとに大体の支出で良いです。");
    }

    const modal = document.getElementById("modal-planner");
    if (modal) modal.classList.add("open");
}

function updateDifficultyButtons() {
    document.querySelectorAll("#planner-difficulty .difficulty-card").forEach(btn => {
        btn.classList.toggle("is-active", btn.dataset.difficulty === plannerDifficulty);
    });
}

function runPlanner() {
    const incomeEl = document.getElementById("planner-income");
    const targetEl = document.getElementById("planner-target");
    const expenseEl = document.getElementById("planner-expense");

    const income = parseFloat(incomeEl ? incomeEl.value : "");
    const target = parseFloat(targetEl ? targetEl.value : "");
    const rawExpense = expenseEl ? String(expenseEl.value).trim() : "";
    const estimated = estimateMonthlyExpense(appData.expenses, 3, getCurrentMonthKey());

    const expense = rawExpense === "" ? (estimated || 0) : parseFloat(rawExpense);

    const plan = calculatePlan({
        monthlyIncome: income,
        targetAmount: target,
        monthlyExpense: isNaN(expense) ? 0 : expense,
        difficulty: plannerDifficulty
    });

    const suggestions = plan.ok
        ? getReductionSuggestions(appData.expenses, appData.categories, getCurrentMonthKey(), plan)
        : [];
    const advice = buildPlannerAdvice(plan, suggestions, { recordedMonths: countRecordedMonths() });

    renderPlannerResult(plan, suggestions, advice);

    if (plan.ok) {
        plan.createdAt = new Date().toISOString();
        plan.updatedAt = plan.createdAt;
        appData.plan = plan;
        saveData();
        renderPlanCard();
    }
}

function renderPlannerResult(plan, suggestions, advice) {
    const el = document.getElementById("planner-result");
    if (!el) return;

    if (!plan.ok) {
        el.innerHTML = `
            <div class="planner-error">${escapeHtml(plan.reason)}</div>
            ${advice.length ? `<ul class="planner-advice">${advice.map(a => `<li>${escapeHtml(a)}</li>`).join("")}</ul>` : ""}
        `;
        return;
    }

    const suggestionsHtml = suggestions.length > 0
        ? `<div class="planner-block">
               <p class="planner-sub-title">${t("節約できるところ")}</p>
               ${suggestions.map(s => `
                   <div class="planner-suggestion">
                       <div class="planner-suggestion-head">
                           <span class="planner-suggestion-name">${escapeHtml(s.name)}</span>
                           <span class="planner-suggestion-save">-${fmtYenPerMonth(s.cutAmount)}</span>
                       </div>
                       <span class="planner-suggestion-desc">
                           ${t("いまの支出の{p}%。1割減らすと {d} 日 早まります。", { p: Math.round(s.share * 100), d: s.savedDays })}
                       </span>
                   </div>
               `).join("")}
           </div>`
        : "";

    el.innerHTML = `
        <div class="planner-result-card">
            <p class="planner-result-kicker">${t("シミュレーション結果")}</p>
            <p class="planner-result-goal">${t("目標金額 {n} を貯めるには…", { n: fmtYen(plan.targetAmount) })}</p>
            <div class="planner-period">
                <span class="planner-period-value">${escapeHtml(t("約 {p}", { p: plan.periodLabel }))}</span>
                <span class="planner-period-unit">${t("で達成できます！")}</span>
            </div>
            <div class="planner-figures">
                <div class="planner-figure">
                    <span class="planner-figure-label">${t("毎月の貯金額")}</span>
                    <span class="planner-figure-value">${fmtYen(plan.monthlySaving)}</span>
                </div>
                <div class="planner-figure">
                    <span class="planner-figure-label">${t("自由に使えるお金")}</span>
                    <span class="planner-figure-value">${fmtYen(plan.spendablePerMonth)}</span>
                </div>
                <div class="planner-figure">
                    <span class="planner-figure-label">${t("達成予定日")}</span>
                    <span class="planner-figure-value">${escapeHtml(plan.targetDateLabel)}</span>
                </div>
            </div>
        </div>
        ${suggestionsHtml}
        <div class="planner-block">
            <p class="planner-sub-title"><span class="material-icons-round">lightbulb</span>${t("アドバイス")}</p>
            <ul class="planner-advice">${advice.map(a => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
        </div>
    `;
}

function renderPlanCard() {
    const el = document.getElementById("plan-card");
    if (!el) return;

    const plan = appData.plan;
    if (!plan || !plan.ok) {
        el.style.display = "none";
        el.innerHTML = "";
        return;
    }

    const progress = getPlanProgress(plan, appData.expenses);
    el.style.display = "block";
    el.innerHTML = `
        <div class="plan-card-head">
            <span class="plan-card-title">
                <span class="material-icons-round">auto_awesome</span>${t("貯金プラン")}
            </span>
            <button class="plan-card-clear" id="btn-clear-plan" type="button">${t("解除")}</button>
        </div>
        <div class="plan-card-goal">
            ${fmtYen(plan.targetAmount)} ／ ${escapeHtml(plan.difficultyLabel)}
        </div>
        <div class="plan-progress-track">
            <div class="plan-progress-fill" style="width:${progress.percent}%"></div>
        </div>
        <p class="plan-card-progress">
            ${progress.achieved
                ? t("目標達成！おめでとう！")
                : t("あと {n}（{p}%）・予定日 {d}", { n: fmtYen(progress.remaining), p: progress.percent, d: escapeHtml(plan.targetDateLabel) })}
        </p>
    `;
}

function clearPlan() {
    appData.plan = null;
    saveData();
    renderPlanCard();
}

// ==========================================
// 12. レシート読み取り（OCR）
// ==========================================
let pendingReceipt = null;
let receiptMismatchPending = false;
let receiptMismatchConfirmed = false;

function currentReceiptDraft() {
    const amountEl = document.getElementById("expense-amount");
    const total = amountEl ? (parseFloat(amountEl.value) || 0) : 0;
    const base = pendingReceipt && pendingReceipt.receipt ? pendingReceipt.receipt : {};
    return {
        total,
        items: collectItemsFromForm(),
        tax8: Number(base.tax8) || 0,
        tax10: Number(base.tax10) || 0
    };
}

function clearReceiptMismatchMarks() {
    document.querySelectorAll("#expense-items-list .item-row.is-receipt-mismatch").forEach(row => {
        row.classList.remove("is-receipt-mismatch");
        row.querySelectorAll("input").forEach(input => input.removeAttribute("aria-invalid"));
    });
    const amountEl = document.getElementById("expense-amount");
    if (amountEl) amountEl.classList.remove("is-receipt-mismatch");
}

function markReceiptMismatchRows(diff, mismatch) {
    clearReceiptMismatchMarks();
    if (!mismatch) return;

    const rows = Array.from(document.querySelectorAll("#expense-items-list .item-row"));
    let target = null;
    if (diff > 2) {
        // 差額とちょうど同じ金額の行があれば、その行を最有力候補として強調する。
        target = rows.find(row => {
            const input = row.querySelector(".item-price");
            return Math.abs((parseFloat(input ? input.value : "") || 0) - diff) < 1;
        }) || null;
    }

    rows.forEach(row => {
        if (!target || row === target) {
            row.classList.add("is-receipt-mismatch");
            row.querySelectorAll("input").forEach(input => input.setAttribute("aria-invalid", "true"));
        }
    });

    // 合計の方が大きい（明細が足りない）ときは、合計欄も一緒に強調する。
    if (diff < -2 || !target) {
        const amountEl = document.getElementById("expense-amount");
        if (amountEl) amountEl.classList.add("is-receipt-mismatch");
    }
}

function refreshReceiptMismatchState() {
    if (!pendingReceipt) {
        receiptMismatchPending = false;
        receiptMismatchConfirmed = false;
        clearReceiptMismatchMarks();
        validateExpenseInput();
        return;
    }

    const check = validateReceipt(currentReceiptDraft());
    receiptMismatchPending = !!check.mismatch;
    // 明細・合計を編集したら、前の確認は無効にする。
    receiptMismatchConfirmed = false;

    const gate = document.getElementById("receipt-mismatch-gate");
    if (gate) gate.hidden = !receiptMismatchPending;
    const checkbox = document.getElementById("receipt-mismatch-check");
    if (checkbox) checkbox.checked = false;

    markReceiptMismatchRows(check.diff, receiptMismatchPending);
    validateExpenseInput();
}

function resetReceiptUi() {
    pendingReceipt = null;
    receiptMismatchPending = false;
    receiptMismatchConfirmed = false;

    const statusEl = document.getElementById("receipt-status");
    if (statusEl) statusEl.textContent = "";

    const preview = document.getElementById("receipt-preview");
    if (preview) preview.style.display = "none";

    const img = document.getElementById("receipt-preview-img");
    if (img) img.removeAttribute("src");

    const warnings = document.getElementById("receipt-warnings");
    if (warnings) warnings.innerHTML = "";

    clearReceiptMismatchMarks();

    const input = document.getElementById("input-receipt-image");
    if (input) input.value = "";
}

async function showReceiptThumbnail(imageId) {
    if (!imageId) return;
    try {
        const blob = await getReceiptImage(imageId);
        if (!blob) return;
        const img = document.getElementById("receipt-preview-img");
        const preview = document.getElementById("receipt-preview");
        if (img) img.src = URL.createObjectURL(blob);
        if (preview) preview.style.display = "flex";
    } catch (e) { /* 画像が無くても記録の表示には影響しない */ }
}

async function handleReceiptFile(file) {
    const statusEl = document.getElementById("receipt-status");
    const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

    if (!file) return;

    const label = document.getElementById("receipt-scan-label");
    statusEl?.classList.remove("is-error");
    label?.classList.add("is-busy");

    try {
        setStatus(t("画像を準備しています…"));
        const img = await loadImageFromFile(file);
        const resized = resizeImageToDataUrl(img, RECEIPT_MAX_EDGE, RECEIPT_JPEG_QUALITY);

        setStatus(t("レシートを読み取っています…"));
        const result = await recognizeReceipt(resized.dataUrl, getOcrSettings());

        if (!result.ok) {
            statusEl?.classList.add("is-error");
            setStatus(`${result.error}${t("（手入力はそのまま使えます）")}`);
            return;
        }

        applyReceiptToForm(result.receipt, resized.dataUrl);
        setStatus(t("読み取り結果を反映しました。内容を確認してください。")
            + (typeof result.remaining === "number" ? t("（今日はあと{n}回）", { n: result.remaining }) : ""));
        playCoin();
        vibrate(20);
    } catch (e) {
        statusEl?.classList.add("is-error");
        setStatus(`${(e && e.message) || t("読み取りに失敗しました。")}${t("（手入力はそのまま使えます）")}`);
    } finally {
        label?.classList.remove("is-busy");
        const input = document.getElementById("input-receipt-image");
        if (input) input.value = "";
    }
}

function applyReceiptToForm(receipt, dataUrl) {
    const r = normalizeReceipt(receipt);

    if (r.total > 0) {
        const amountEl = document.getElementById("expense-amount");
        if (amountEl) amountEl.value = r.total;
    }

    // 店名はメモに入れる（すでにメモがあれば上書きしない）
    const memoEl = document.getElementById("expense-memo");
    if (memoEl && r.store && !memoEl.value.trim()) memoEl.value = r.store;

    // レシートの日付（来月以降は入れない）
    if (r.date) {
        const parsed = parseDateInputValue(r.date);
        if (parsed && localMonthKey(parsed) <= getCurrentMonthKey()) {
            const dtEl = document.getElementById("expense-datetime");
            if (dtEl) dtEl.value = toDateInputValue(parsed);
        }
    }

    // 品目（明細）を入力欄に並べる。カテゴリは品目から自動で当てはめる
    const items = assignCategoriesToItems(r.items, appData.categories, null);
    renderItemsEditor(items);

    const categoryEl = document.getElementById("expense-category");
    if (categoryEl && items.length > 0 && items[0].categoryId) {
        categoryEl.value = items[0].categoryId;
    }

    pendingReceipt = { dataUrl: dataUrl, receipt: r };
    renderReceiptPreview(dataUrl, r);
    validateExpenseInput();
}

function renderReceiptPreview(dataUrl, receipt) {
    const preview = document.getElementById("receipt-preview");
    const img = document.getElementById("receipt-preview-img");
    const warnEl = document.getElementById("receipt-warnings");

    if (img && dataUrl) img.src = dataUrl;
    if (preview) preview.style.display = "flex";

    if (warnEl) {
        const check = validateReceipt(receipt);
        let html = check.warnings.length > 0
            ? check.warnings.map((w, i) => {
                const cls = check.mismatch && i === 0
                    ? "receipt-warning receipt-warning-mismatch"
                    : "receipt-warning";
                return `<p class="${cls}">${escapeHtml(w)}</p>`;
            }).join("")
            : `<p class="receipt-ok">${escapeHtml(t("品目の合計とレシートの合計が一致しました"))}</p>`;

        if (check.mismatch) {
            html += `
                <div class="receipt-mismatch-gate" id="receipt-mismatch-gate">
                    <p class="receipt-mismatch-hint">${escapeHtml(t("黄色で示した行の金額を確認してください。"))}</p>
                    <label class="receipt-mismatch-label">
                        <input type="checkbox" id="receipt-mismatch-check">
                        <span>${escapeHtml(t("明細と合計が一致しないことを確認しました"))}</span>
                    </label>
                </div>`;
        }
        warnEl.innerHTML = html;

        const checkbox = document.getElementById("receipt-mismatch-check");
        if (checkbox) {
            checkbox.addEventListener("change", () => {
                receiptMismatchConfirmed = !!checkbox.checked;
                validateExpenseInput();
            });
        }
        refreshReceiptMismatchState();
    }
}

function renderOcrSettingsForm() {
    const s = getOcrSettings();
    const providerEl = document.getElementById("ocr-provider");
    const keyEl = document.getElementById("ocr-api-key");
    const modelEl = document.getElementById("ocr-model");
    const endpointEl = document.getElementById("ocr-endpoint");

    if (providerEl) providerEl.value = s.provider;
    if (keyEl) keyEl.value = s.apiKey;
    if (modelEl) modelEl.value = s.model;
    if (endpointEl) endpointEl.value = s.endpoint;

    updateOcrEndpointVisibility();
    updateOcrStatus();
}

function updateOcrEndpointVisibility() {
    const providerEl = document.getElementById("ocr-provider");
    const group = document.getElementById("ocr-endpoint-group");
    if (!providerEl || !group) return;
    group.style.display = providerEl.value === "custom" ? "block" : "none";
}

function readOcrSettingsForm() {
    const providerEl = document.getElementById("ocr-provider");
    const keyEl = document.getElementById("ocr-api-key");
    const modelEl = document.getElementById("ocr-model");
    const endpointEl = document.getElementById("ocr-endpoint");
    return {
        provider: providerEl ? providerEl.value : "gemini",
        apiKey: keyEl ? keyEl.value.trim() : "",
        model: modelEl ? modelEl.value.trim() : "",
        endpoint: endpointEl ? endpointEl.value.trim() : ""
    };
}

function updateOcrStatus(message) {
    const el = document.getElementById("ocr-status");
    if (!el) return;
    if (message) { el.textContent = message; return; }
    el.textContent = isOcrConfigured()
        ? "設定済み：レシートから読み取れます"
        : "未設定：手入力のみ使えます";
}

function saveOcrSettingsFromForm() {
    const ok = saveOcrSettings(readOcrSettingsForm());
    updateOcrStatus(ok ? "設定を保存しました" : "保存できませんでした");
}

// 接続テスト用の画像。1×1 の JPEG だとモデル側で弾かれることがあるので、
// 実際に文字が写っている小さな画像をその場で作る。
function buildOcrTestImage() {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = 360;
        canvas.height = 140;
        const ctx = canvas.getContext("2d");
        if (!ctx) return "";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#111111";
        ctx.font = "bold 36px sans-serif";
        ctx.fillText("テスト 100円", 24, 62);
        ctx.font = "22px sans-serif";
        ctx.fillText("2026-10-20", 24, 104);
        return canvas.toDataURL("image/jpeg", 0.9);
    } catch (e) {
        return "";
    }
}

async function testOcrConnection() {
    const s = readOcrSettingsForm();
    if (!s.apiKey) {
        updateOcrStatus("APIキーを入力してください。");
        return;
    }
    saveOcrSettings(s);
    updateOcrStatus("接続を確認しています…");

    const fallback = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
    const image = buildOcrTestImage() || fallback;
    const res = await recognizeReceipt(image, s);

    if (res.httpOk) {
        updateOcrStatus("接続できました！レシートを読み取れます。");
        return;
    }
    updateOcrStatus(`接続できませんでした：${res.error || "原因不明のエラー"}`);
}

// ==========================================
// マイルーム（ペット・部屋・ショップ）
// ==========================================
const FURNITURE_CATALOG = [
    { id: "nezumi_karakuri", img: "assets/nezumi_karakuri.gif", price: 800 },
    { id: "toy_car_red", img: "assets/toy_car_red.png", price: 800 },
    { id: "wool_red", img: "assets/wool_red.png", price: 800 },
    { id: "toy_car", img: "assets/toy_car.png", price: 800 },
    { id: "toy_ball", img: "assets/toy_ball.png", price: 1200 },
    { id: "neko_toy", img: "assets/neko_toy.png", price: 1000 },
    { id: "sofa_01", img: "assets/sofa_01.png", price: 3200 },
    { id: "sofa_02", img: "assets/sofa_02.png", price: 4300 },
    { id: "sofa_03", img: "assets/sofa_03.png", price: 4500 },
    { id: "hang_plant", img: "assets/hang_plant.png", price: 1800 },
    { id: "desk_01", img: "assets/desk_01.png", price: 3500 },
    { id: "rack", img: "assets/rack.png", price: 2000 },
    { id: "danro", img: "assets/danro.gif", price: 4800 },
    { id: "window", img: "assets/window.png", price: 3600 },
    { id: "clock", img: "assets/clock.gif", price: 1600 },
    { id: "recorder", img: "assets/recorder.png", price: 2500 },
    { id: "tv", img: "assets/tv.png", price: 3500 },
    { id: "tiki", img: "assets/tiki.png", price: 3000 },
    { id: "neko_tower", img: "assets/neko_tower.png", price: 1300 },
    { id: "pet_food", img: "assets/pet_food.png", price: 2300 },
    { id: "pet_bed_01", img: "assets/pet_bed_01.png", price: 4000 },
    { id: "pet_bed_02", img: "assets/pet_bed_02.png", price: 3700 },
    { id: "pet_bed_03", img: "assets/pet_bed_03.png", price: 3900 },
    { id: "globe", img: "assets/globe.gif", price: 900 },
    { id: "fishbowl", img: "assets/fishbowl.gif", price: 2400 },
    { id: "fishtank", img: "assets/fishtank.gif", price: 4000 }
];

const PET_Z = 25;

const APP_VERSION = "3.0";

const PET_AWAKE_IMG = {
    neko: "assets/neko_awake.png",
    usagi: "assets/usagi_awake.png",
    shiba: "assets/shiba_awake.png",
    hamster: "assets/hamster_awake.png",
    panda: "assets/panda_awake.png",
    special: "assets/special_awake.png"
};
const PET_SLEEP_IMG = {
    neko: "assets/neko_sleep.gif",
    usagi: "assets/usagi_sleep.gif",
    shiba: "assets/shiba_sleep.png",
    hamster: "assets/hamster_sleep.png",
    panda: "assets/panda_sleep.png",
    special: "assets/special_sleep.png"
};

// ペットの種類（ガチャで増える）。gobi は話すときの語尾。
const PET_CATALOG = {
    neko:    { label: t("ねこ"),       gobi: "にゃ～", defaultName: t("ねこ") },
    usagi:   { label: t("うさぎ"),     gobi: "ぴょん", defaultName: "ぴょん" },
    shiba:   { label: "しばいぬ",   gobi: "わん",   defaultName: "まる" },
    hamster: { label: "ハムスター", gobi: "ちゅー", defaultName: "むぎ" },
    panda:   { label: "パンダ",     gobi: "もふ",   defaultName: "たけ" },
    special: { label: t("スペシャル"), gobi: "♡",      defaultName: t("スペシャル") }   // 好感度100で仲間になる（ガチャには出ない）
};

// 部屋（マップ）。default は最初から持っている部屋。
const MAP_CATALOG = {
    default:   { label: "はじまりの部屋", img: "assets/wallpaper.jpg" },
    washitsu:  { label: "さくらの和室",   img: "assets/map_washitsu.png" },
    seaside:   { label: "うみべの部屋",   img: "assets/map_seaside.png" },
    nightloft: { label: "ほしぞらロフト", img: "assets/map_nightloft.png" },
    wallpaper_cute_pastel: { label: "かわいいパステル", img: "assets/wallpaper_cute_pastel.png" },
    wallpaper_modern_gray: { label: "モダングレー",     img: "assets/wallpaper_modern_gray.png" }
};

// 壁紙の拡張子が png / jpg / webp のどれでも読み込めるよう、最初に実際のファイルを探す
(function probeWallpaperExtensions() {
    ["wallpaper_cute_pastel", "wallpaper_modern_gray"].forEach(id => {
        const exts = ["png", "jpg", "jpeg", "webp"];
        const tryNext = (i) => {
            if (i >= exts.length) return;
            const src = `assets/${id}.${exts[i]}`;
            const img = new Image();
            img.onload = () => {
                MAP_CATALOG[id].img = src;
                if (typeof applyRoomMap === "function" && typeof roomData !== "undefined") applyRoomMap();
            };
            img.onerror = () => tryNext(i + 1);
            img.src = src;
        };
        tryNext(0);
    });
})();

function petDefaultName(type) {
    return (PET_CATALOG[type] || PET_CATALOG.neko).defaultName;
}

// 背景画像は CSS 変数で切り替える（部屋の表示と編集画面の両方に効く）
function applyRoomMap() {
    const id = (roomData && roomData.mapId) || "default";
    const m = MAP_CATALOG[id] || MAP_CATALOG.default;
    document.documentElement.style.setProperty("--room-wallpaper", `url("${m.img}")`);
}

// マイルーム CSV にガチャで増えた情報を入れる／戻す
function roomExtraCsvPairs() {
    const names = Object.keys(roomData.petNames || {}).map(k => `${k}:${roomData.petNames[k]}`).join("|");
    return [
        ["ownedPets", (roomData.ownedPets || []).join("|")],
        ["ownedMaps", (roomData.ownedMaps || []).join("|")],
        ["mapId", roomData.mapId || "default"],
        ["petNames", names],
        ["gachaPulls", (roomData.gacha && roomData.gacha.pulls) || 0],
        ["affection", roomData.affection || 0]
    ];
}

function applyRoomExtrasFromCsvMap(room, map) {
    room.ownedPets = map.ownedPets ? map.ownedPets.split("|").filter(Boolean) : [];
    room.ownedMaps = map.ownedMaps ? map.ownedMaps.split("|").filter(Boolean) : [];
    room.mapId = map.mapId || "default";
    room.petNames = {};
    String(map.petNames || "").split("|").filter(Boolean).forEach(pair => {
        const i = pair.indexOf(":");
        if (i > 0) room.petNames[pair.slice(0, i)] = pair.slice(i + 1);
    });
    room.gacha = { pulls: parseInt(map.gachaPulls, 10) || 0 };
    room.affection = Math.min(AFFECTION_MAX, Math.max(0, parseInt(map.affection, 10) || 0));
}

const AFFECTION_MAX = 100;
const PET_FLOOR_Y = 82;

// 好感度：支出を1件記録するごとに +1。100 に届くとスペシャルペットが仲間になる。
function renderAffection() {
    const v = Math.min(AFFECTION_MAX, Math.max(0, (roomData && roomData.affection) || 0));
    const valEl = document.getElementById("affection-value");
    const fill = document.getElementById("affection-bar-fill");
    if (valEl) valEl.textContent = v;
    if (fill) fill.style.width = `${(v / AFFECTION_MAX) * 100}%`;
    document.getElementById("affection-badge")?.classList.toggle("is-full", v >= AFFECTION_MAX);
}

function addAffection(points) {
    if (!roomData) return 0;
    const before = roomData.affection || 0;
    if (before >= AFFECTION_MAX) return 0;
    roomData.affection = Math.min(AFFECTION_MAX, before + (points || 1));
    let unlocked = false;
    if (roomData.affection >= AFFECTION_MAX && !roomData.ownedPets.includes("special")) {
        roomData.ownedPets.push("special");
        unlocked = true;
    }
    saveRoomData();
    renderAffection();
    if (unlocked) {
        setTimeout(() => {
            showCenterGuide("special-unlock", t("スペシャルペットが仲間に！"), [
                { icon: "favorite", text: t("好感度が100になりました") },
                { icon: "pets", text: t("ガチャ → コレクションから、いつでも切りかえられます") }
            ], null, "OK");
        }, 700);
    }
    return roomData.affection - before;
}
const TOY_ITEM_IDS = ["nezumi_karakuri", "toy_car_red", "wool_red", "toy_car", "toy_ball", "neko_toy"];

let roomDragMoved = false;



const DEFAULT_ROOM_DATA = {
    points: 8888,
    lastLoginDate: null,
    pet: null,
    ownedItemIds: [],
    placedItems: [],
    ownedPets: [],
    petNames: {},
    ownedMaps: ["default"],
    mapId: "default",
    gacha: { pulls: 0 },
    affection: 0,
    mini: null
};

let roomData = loadRoomData();
let petIsAsleep = Math.random() < 0.25;
let roomEditorSelectedUid = null;

function normalizeRoomData(raw) {
    const d = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};

    if (typeof d.points !== "number" || !isFinite(d.points)) d.points = DEFAULT_ROOM_DATA.points;
    if (!Array.isArray(d.ownedItemIds)) d.ownedItemIds = [];
    if (!Array.isArray(d.placedItems)) d.placedItems = [];
    if (d.lastLoginDate === undefined) d.lastLoginDate = null;

    if (d.pet && typeof d.pet === "object") {
        if (!PET_CATALOG[d.pet.type]) d.pet.type = "neko";
        if (!d.pet.name) d.pet.name = petDefaultName(d.pet.type);
        if (typeof d.pet.x !== "number") d.pet.x = 50;
        if (typeof d.pet.scale !== "number") d.pet.scale = 1;
        if (typeof d.pet.y !== "number" || !isFinite(d.pet.y)) d.pet.y = PET_FLOOR_Y;
        d.pet.y = Math.min(100, Math.max(0, d.pet.y));
    } else {
        d.pet = null;
    }

    // ガチャで増えるもの：持っているペット／部屋、ペットごとの名前、使っている部屋
    const knownOnly = (list, catalog) => [...new Set((Array.isArray(list) ? list : []).map(String).filter(id => catalog[id]))];
    d.ownedPets = knownOnly(d.ownedPets, PET_CATALOG);
    if (d.pet && !d.ownedPets.includes(d.pet.type)) d.ownedPets.push(d.pet.type);
    if (!d.petNames || typeof d.petNames !== "object" || Array.isArray(d.petNames)) d.petNames = {};
    Object.keys(d.petNames).forEach(k => {
        if (!PET_CATALOG[k] || typeof d.petNames[k] !== "string" || !d.petNames[k].trim()) delete d.petNames[k];
        else d.petNames[k] = d.petNames[k].trim().slice(0, 12);
    });
    d.ownedMaps = knownOnly(d.ownedMaps, MAP_CATALOG);
    if (!d.ownedMaps.includes("default")) d.ownedMaps.unshift("default");
    if (!MAP_CATALOG[d.mapId] || !d.ownedMaps.includes(d.mapId)) d.mapId = "default";
    d.gacha = { pulls: Math.max(0, Math.floor(Number(d.gacha && d.gacha.pulls) || 0)) };
    d.affection = Math.min(AFFECTION_MAX, Math.max(0, Math.floor(Number(d.affection) || 0)));

    d.placedItems = d.placedItems
        .filter(it => it && typeof it === "object")
        .map((it, i) => ({
            uid: it.uid || `item_${Date.now()}_${i}`,
            itemId: String(it.itemId || ""),
            x: typeof it.x === "number" ? it.x : 50,
            y: typeof it.y === "number" ? it.y : 50,
            scale: typeof it.scale === "number" ? it.scale : 1,
            z: typeof it.z === "number" ? it.z : 1,
            placed: !!it.placed
        }));

    if (d.pet && d.pet.x > 100) d.pet.x = d.pet.x / 2;
    d.placedItems.forEach(it => { if (it.x > 100) it.x = it.x / 2; });

    delete d.affinity;
    delete d.loginStreak;

    delete d.mini;
    delete d.floating;

    return d;
}

function loadRoomData() {
    let data;
    try {
        data = JSON.parse(localStorage.getItem(ROOM_STORAGE_KEY));
    } catch (e) {
        data = null;
    }
    if (!data) data = JSON.parse(JSON.stringify(DEFAULT_ROOM_DATA));
    return normalizeRoomData(data);
}

function saveRoomData(touch) {
    if (touch !== false) roomData.updatedAt = new Date().toISOString();
    try {
        localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(roomData));
        return true;
    } catch (e) {
        warnSaveFailed();
        return false;
    }
}

function todayDateKey() {
    return localDateKey(new Date());
}

function getFurnitureById(id) {
    return FURNITURE_CATALOG.find(f => f.id === id);
}

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

const PET_STATES = {
    idle:    { dur: [4000, 10000],   weight: 30, cls: "" },
    walk:    { dur: [5000, 13000],   weight: 24, cls: "is-walking" },
    sit:     { dur: [6000, 15000],   weight: 15, cls: "is-sitting" },
    nap:     { dur: [14000, 38000],  weight: 9,  cls: "is-sleeping" },
    sleep:   { dur: [90000, 240000], weight: 0, nightWeight: 22, cls: "is-sleeping" },
    play:    { dur: [5000, 10000],   weight: 8,  cls: "is-playing", needsToy: true },
    stretch: { dur: [1800, 2600],    weight: 6,  cls: "stretching" },
    happy:   { dur: [2400, 3400],    weight: 0,  cls: "is-happy" },
    sad:     { dur: [5000, 9000],    weight: 0,  cls: "is-sad" },
    petted:  { dur: [2000, 3000],    weight: 0,  cls: "is-petted" }
};

const PET_ONESHOT_STATES = ["stretch", "happy", "sad", "petted"];

let petState = "idle";
let petStateUntil = 0;
let petNextMoveAt = 0;
let petTickerHandle = null;
let petWasOverBudget = false;

function isSleepingState(state) {
    return state === "sleep" || state === "nap";
}

function getPetContext(now) {
    const when = now instanceof Date ? now : new Date();
    const hour = when.getHours();
    const ratio = getCurrentBudgetRatioOrNull();

    const placed = (roomData && Array.isArray(roomData.placedItems)) ? roomData.placedItems : [];
    const toys = placed.filter(it => it.placed && TOY_ITEM_IDS.indexOf(it.itemId) !== -1);

    const petX = (roomData && roomData.pet) ? (Number(roomData.pet.x) || 50) : 50;
    let nearestToyX = null;
    toys.forEach(it => {
        const d = Math.abs((Number(it.x) || 50) - petX);
        if (nearestToyX === null || d < nearestToyX.d) nearestToyX = { x: Number(it.x) || 50, d: d };
    });

    const editorOpen = !!document.getElementById("room-editor")?.classList.contains("open");

    return {
        hour: hour,
        isMorning: hour >= 5 && hour < 11,
        isNight: hour >= 19 || hour < 6,
        isLateNight: hour >= 1 && hour < 5,
        moodOver: ratio !== null && ratio >= 1,
        moodWarn: ratio !== null && ratio > 0.8 && ratio < 1,
        hasToy: toys.length > 0,
        nearestToyX: nearestToyX,
        canWalk: !editorOpen
    };
}

function chooseNextPetState(current, ctx, random) {
    const rnd = typeof random === "function" ? random : Math.random;
    const c = ctx || {};

    if (PET_ONESHOT_STATES.indexOf(current) !== -1) return "idle";

    if (current === "sleep") {
        const wakeChance = c.isLateNight ? 0.04 : (c.isMorning ? 0.28 : 0.14);
        return rnd() < wakeChance ? "idle" : "sleep";
    }

    const candidates = [];
    Object.keys(PET_STATES).forEach(name => {
        const def = PET_STATES[name];
        let weight;

        if (name === "sleep") {
            if (!c.isNight) return;
            weight = def.nightWeight * (c.isLateNight ? 2.2 : 1);
        } else {
            if (def.weight <= 0) return;
            weight = def.weight;
        }

        if (def.needsToy && !c.hasToy) return;
        if (name === "walk" && c.canWalk === false) return;

        if (name === current) weight *= 0.25;

        if (name === "walk") {
            if (c.moodOver) weight *= 0.3;
            else if (c.moodWarn) weight *= 0.7;
        }
        if (name === "idle" && c.moodOver) weight *= 1.6;
        if (name === "sit" && c.moodOver) weight *= 1.8;
        if (name === "nap" && c.isNight) weight *= 2.4;
        if (name === "stretch" && c.isMorning) weight *= 2.2;

        candidates.push({ name: name, weight: weight });
    });

    if (candidates.length === 0) return "idle";

    const total = candidates.reduce((s, x) => s + x.weight, 0);
    let pick = rnd() * total;
    for (let i = 0; i < candidates.length; i++) {
        pick -= candidates[i].weight;
        if (pick <= 0) return candidates[i].name;
    }
    return candidates[candidates.length - 1].name;
}

function applyPetState(state) {
    const def = PET_STATES[state] || PET_STATES.idle;
    const sleeping = isSleepingState(state);

    petIsAsleep = sleeping;

    if (roomData.pet) {
        document.querySelectorAll(".pet-item").forEach(el => {
            Object.keys(PET_STATES).forEach(name => {
                if (PET_STATES[name].cls) el.classList.remove(PET_STATES[name].cls);
            });
            if (def.cls) el.classList.add(def.cls);
            el.classList.toggle("is-sleeping", sleeping);

            const img = el.querySelector("img");
            if (img) {
                img.dataset.retried = "0";
                img.src = sleeping
                    ? (PET_SLEEP_IMG[roomData.pet.type] || PET_SLEEP_IMG.neko)
                    : (PET_AWAKE_IMG[roomData.pet.type] || PET_AWAKE_IMG.neko);
            }
        });
    }

    if (state === "stretch") triggerPetStretch();
    if (state === "happy") { petFaceCamera(); spawnPetReaction("favorite"); }
    if (state === "sad") spawnPetReaction("sentiment_dissatisfied");
    if (state === "sleep") spawnPetReaction("bedtime");
}

function petFaceCamera() {
    document.querySelectorAll(".pet-item").forEach(el => el.style.setProperty("--flip", 1));
}

function triggerPetStretch() {
    document.querySelectorAll(".pet-item").forEach(el => {
        el.classList.remove("stretching");
        void el.offsetWidth;
        el.classList.add("stretching");
    });
}

function triggerPetHop(silent) {
    if (!silent) {
        playPop();
        vibrate(18);
    }
    document.querySelectorAll(".pet-item").forEach(el => {
        el.classList.remove("hopping");
        void el.offsetWidth;
        el.classList.add("hopping");

        const img = el.querySelector("img");
        const onEnd = (e) => {
            if (e.target !== img) return;
            el.classList.remove("hopping");
            el.removeEventListener("animationend", onEnd);
        };
        el.addEventListener("animationend", onEnd);
    });
}

function setPetState(state, options) {
    const opts = options || {};
    const def = PET_STATES[state] || PET_STATES.idle;
    const now = Date.now();
    const duration = opts.duration !== undefined
        ? opts.duration
        : randomBetween(def.dur[0], def.dur[1]);

    petState = state;
    petStateUntil = now + duration;
    petNextMoveAt = now;

    applyPetState(state);

    if (!opts.silent) onPetStateChanged(state);
    return state;
}

function onPetStateChanged(state) {
    // ペットは話さない（動きだけ）
}

function petInterrupt(state, options) {
    if (!roomData.pet) return null;
    if (!PET_STATES[state]) return null;
    const opts = Object.assign({ silent: true }, options || {});
    return setPetState(state, opts);
}

function getPetY() {
    const y = roomData.pet && Number(roomData.pet.y);
    return (typeof y === "number" && isFinite(y)) ? Math.min(100, Math.max(0, y)) : PET_FLOOR_Y;
}

function petMoveTo(targetX) {
    const el = document.querySelector("#room-scene-preview .pet-item");
    if (!el || !roomData.pet) return;

    const curX = Number(roomData.pet.x) || 50;
    const clamped = Math.max(10, Math.min(90, targetX));
    el.style.setProperty("--flip", clamped < curX ? -1 : 1);
    el.style.left = clamped + "%";
    el.style.top = getPetY() + "%";

    roomData.pet.x = clamped;
    saveRoomData(false);
}

function petWalkStep() {
    petMoveTo(randomBetween(12, 88));
}

function petPlayWithNearestToy(ctx) {
    const target = ctx && ctx.nearestToyX;
    if (!target) return false;
    petMoveTo(target.x);
    setTimeout(() => {
        triggerPetHop(true);
        spawnPetReaction("sports_esports");
    }, 1700);
    return true;
}

function startPetLifeLoops() {
    if (petTickerHandle !== null) return;

    setPetState(chooseNextPetState("idle", getPetContext(), Math.random), { silent: true });

    petTickerHandle = setInterval(petTick, 1000);
    document.addEventListener("visibilitychange", onPetVisibilityChange);
}

function onPetVisibilityChange() {
    if (!document.hidden) petStateUntil = Date.now() + 500;
}

function petTick() {
    if (!roomData.pet) return;
    if (document.hidden) return;

    const now = Date.now();
    const ctx = getPetContext();

    if (petState === "walk" && now >= petNextMoveAt) {
        petWalkStep();
        petNextMoveAt = now + randomBetween(2600, 4300);
    }

    if (now >= petStateUntil) {
        const next = chooseNextPetState(petState, ctx, Math.random);
        const interesting = (next === "sleep" || next === "play" || next === "walk");
        setPetState(next, { silent: !interesting });

        if (next === "play") petPlayWithNearestToy(ctx);
    }
}

function petCelebrate() {
    if (!roomData.pet) return;
    petInterrupt("happy", { duration: 3200 });
    setTimeout(() => {
        if (petState === "happy") setPetState("walk", { silent: true });
    }, 3400);
}

function petFeelDown() {
    if (!roomData.pet) return;
    petInterrupt("sad", { duration: 6000 });
}

function petStroke() {
    if (!roomData.pet) return;
    if (isSleepingState(petState)) {
        setPetState("petted", { silent: true });
        return;
    }
    setPetState("petted", { silent: true });
}

function petWakeUp() {
    if (!roomData.pet) return false;
    if (!isSleepingState(petState)) return false;
    setPetState("stretch", { silent: true });
    return true;
}

// ==========================================
// マイルームの縮小表示
// ==========================================
const COMPACT_ROOM_H = 96;
const PULL_TRIGGER_PX = 60;
const PULL_FULL_PX = 150;

let roomCompactBase = null;
// 縮小する直前の横スクロール位置（元に戻すときに復元する）
let roomScrollBeforeCompact = 0;

function getRoomCompactBase() {
    if (roomCompactBase) return roomCompactBase;

    const preview = document.getElementById("pet-room-preview");
    const scene = document.getElementById("room-scene-preview");
    if (!preview || !scene) return null;

    const w = preview.clientWidth || 316;
    const h = preview.clientHeight || Math.round(w / 1.794);
    const sceneW = scene.offsetWidth || Math.round(w * 1.43);
    const sceneH = scene.offsetHeight || h;

    roomCompactBase = {
        w: w,
        h: h,
        sceneW: sceneW,
        sceneH: sceneH,
        aspect: (sceneH > 0) ? (sceneW / sceneH) : 1.43
    };
    return roomCompactBase;
}

function compactRoomSize(base, progress) {
    const p = Math.max(0, Math.min(1, progress));
    const h = base.h - (base.h - COMPACT_ROOM_H) * p;
    const w = Math.min(base.w, h * base.aspect);
    return { w: w, h: h, p: p };
}

function isRoomCompact() {
    const preview = document.getElementById("pet-room-preview");
    return !!preview && preview.classList.contains("is-compact");
}

// 見た目に反映する。引いている最中もこれを呼ぶ。
//
// 【重要】この関数は「クリックしただけ（ドラッグしていない）」のときにも
// pointerdown→pointerup の流れで呼ばれる（progress = 0）。
// そのため、通常状態に戻すときの scrollLeft のリセットは
// 「実際に縮小状態から復帰したとき」だけに限定する。
// 無条件に scrollLeft = 0 にすると、部屋を右端までスクロールした状態で
// 軽くタップしただけで左端へ飛んでしまう（不具合として報告された）。
function applyRoomCompact(progress) {
    const base = getRoomCompactBase();
    const preview = document.getElementById("pet-room-preview");
    const scene = document.getElementById("room-scene-preview");
    const wrap = document.querySelector(".room-scroll-wrapper");
    if (!base || !preview || !scene) return 0;

    const size = compactRoomSize(base, progress);
    const wasCompact = preview.classList.contains("is-compact");

    const section = document.querySelector(".room-section");
    if (section) section.classList.toggle("is-compact", size.p > 0);
    const gripText = document.querySelector(".pet-float-grip-text");
    if (gripText) {
        gripText.textContent = size.p > 0 ? "ここをタップ／部屋を上にスワイプで元に戻す" : "下に引いて小さくする";
    }

    if (size.p <= 0) {
        preview.classList.remove("is-compact");
        preview.style.width = "";
        preview.style.height = "";
        scene.style.width = "";
        scene.style.height = "";
        scene.style.transform = "";
        // 縮小から復帰したときだけ、縮小前のスクロール位置に戻す。
        if (wasCompact && wrap) wrap.scrollLeft = roomScrollBeforeCompact;
        return 0;
    }

    const scale = size.w / base.sceneW;

    // 縮小前の位置を覚えておく（縮小中は部屋全体を見せるので 0 に固定する）
    if (!wasCompact && wrap) roomScrollBeforeCompact = wrap.scrollLeft;
    preview.classList.add("is-compact");
    preview.style.width = Math.round(size.w) + "px";
    preview.style.height = Math.round(size.h) + "px";

    scene.style.width = base.sceneW + "px";
    scene.style.height = base.sceneH + "px";
    scene.style.transform = `scale(${scale.toFixed(4)})`;

    // 縮小前に右へスクロールしていても、部屋の全体が見えるように左端へ戻す
    if (wrap) wrap.scrollLeft = 0;

    return size.p;
}

function setRoomCompact(active) {
    const preview = document.getElementById("pet-room-preview");
    if (!preview) return false;

    if (active && !isRoomCompact()) {
        preview.classList.add("is-room-animating");
        applyRoomCompact(1);
        return true;
    }
    if (!active && isRoomCompact()) {
        preview.classList.remove("is-room-animating");
        applyRoomCompact(0);
        return true;
    }
    return false;
}

function toggleRoomCompact() {
    return setRoomCompact(!isRoomCompact());
}

function beginRoomPull() {
    const preview = document.getElementById("pet-room-preview");
    if (!preview) return;
    getRoomCompactBase();
    preview.classList.remove("is-room-animating");
}

function endRoomPull(settleCompact) {
    const preview = document.getElementById("pet-room-preview");
    if (!preview) return;
    preview.classList.add("is-room-animating");
    applyRoomCompact(settleCompact ? 1 : 0);
}

function setupRoomPullToCompact() {
    const preview = document.getElementById("pet-room-preview");
    if (!preview) return;

    // 指のわずかなブレ（タップ）では縮小を始めない。
    // 下へ PULL_DEADZONE_PX 以上、ほぼ垂直に動いたときだけ「引っ張り」とみなす。
    const PULL_DEADZONE_PX = 14;
    let pulling = false;
    let began = false;
    let startX = 0, startY = 0;
    let progress = 0;

    const cancelPull = () => {
        if (began) endRoomPull(false);
        pulling = false;
        began = false;
        progress = 0;
    };

    preview.addEventListener("pointerdown", (e) => {
        if (isRoomCompact()) return;
        if (e.target.closest("[data-no-pull]")) return;
        pulling = true;
        began = false;
        startX = e.clientX;
        startY = e.clientY;
        progress = 0;
    });

    // 縮小すると枠が小さくなり、マウスの位置が枠の外に出てしまうので、
    // 移動・離す操作は document 全体で受ける（pointerleave では取り消さない）
    document.addEventListener("pointermove", (e) => {
        if (!pulling) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (!began) {
            // 横にずれた／上に動いた → 引っ張りではない
            if (dy < -PULL_DEADZONE_PX || Math.abs(dx) > PULL_DEADZONE_PX * 2) { cancelPull(); return; }
            if (dy < PULL_DEADZONE_PX || Math.abs(dx) > Math.abs(dy) * 1.2) return;   // まだ判断しない
            began = true;
            beginRoomPull();
        }

        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) * 1.2) { cancelPull(); return; }

        progress = applyRoomCompact((dy - PULL_DEADZONE_PX) / PULL_FULL_PX);
    });

    const finish = () => {
        if (!pulling) return;
        const wasBegan = began;
        const done = progress >= 0.5;
        pulling = false;
        began = false;

        if (!wasBegan) { progress = 0; return; }       // ただのタップ：何もしない

        if (done) {
            endRoomPull(true);
            roomDragMoved = true;
            playPop();
            vibrate(20);
        } else {
            endRoomPull(false);
        }
        progress = 0;
    };

    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", () => {
        if (pulling) cancelPull();
    });

    // 縮小中：触っただけでは大きくならない。
    // 元に戻すのは「上へスワイプ」か、下の「元に戻す」バーをタップしたときだけ。
    let pushing = false;
    let pushStartX = 0, pushStartY = 0;

    preview.addEventListener("pointerdown", (e) => {
        if (!isRoomCompact()) return;
        pushing = true;
        pushStartX = e.clientX;
        pushStartY = e.clientY;
    });

    document.addEventListener("pointermove", (e) => {
        if (!pushing) return;
        const dx = e.clientX - pushStartX;
        const dy = e.clientY - pushStartY;
        if (dy < -30 && Math.abs(dx) < Math.abs(dy)) {
            pushing = false;
            roomDragMoved = true;
            setRoomCompact(false);
            playPop();
            vibrate(15);
        }
    });

    const endPush = () => { pushing = false; };
    document.addEventListener("pointerup", endPush);
    document.addEventListener("pointercancel", endPush);
}

function resetRoomCompactBase() {
    const wasCompact = isRoomCompact();
    const preview = document.getElementById("pet-room-preview");

    roomCompactBase = null;
    if (preview) preview.classList.remove("is-room-animating");
    applyRoomCompact(0);
    getRoomCompactBase();
    if (wasCompact) applyRoomCompact(1);
    if (preview) preview.classList.add("is-room-animating");
}

function getCurrentBudgetRatioOrNull() {
    const monthKey = getCurrentMonthKey();
    const budget = appData.budget[monthKey] || 0;
    if (budget <= 0) return null;
    const spent = expensesOfMonth(monthKey).reduce((sum, e) => sum + e.amount, 0);
    return spent / budget;
}

// 予算の80%を超えたらペットの近くに顔文字を出す（100%以上はさらに落ち込んだ顔）
const MOOD_FACE = { warn: "(；´･ω･)", over: "(；＿；)" };

function refreshPetMood() {
    const ratio = getCurrentBudgetRatioOrNull();
    const isOver = ratio !== null && ratio >= 1;
    const isWarn = ratio !== null && ratio > 0.8 && ratio < 1;

    document.querySelectorAll(".pet-item").forEach(el => {
        el.classList.toggle("mood-over", isOver);
        el.classList.toggle("mood-warn", isWarn);
        const badge = el.querySelector(".mood-badge");
        if (!badge) return;
        badge.textContent = isOver ? MOOD_FACE.over : (isWarn ? MOOD_FACE.warn : "");
        badge.classList.toggle("hidden", !(isOver || isWarn));
    });
}

function spawnPetReaction(iconName) {
    const scene = document.getElementById("room-scene-preview");
    if (!scene) return;
    const reaction = document.createElement("div");
    reaction.className = "pet-reaction";
    reaction.innerHTML = `<span class="material-icons-round">${iconName}</span>`;
    scene.appendChild(reaction);
    reaction.addEventListener("animationend", () => reaction.remove());
    setTimeout(() => reaction.remove(), 1500);
}

function randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function localDateKeyOf(d) {
    return localDateKey(d);
}

function checkAiEndpoint(settings) {
    if (settings.provider !== "custom") return "";
    const endpoint = String(settings.endpoint || "").trim();
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(endpoint);
    return (/^https:\/\//i.test(endpoint) || isLocal) ? "" : "エンドポイントは https:// で指定してください（localhost を除く）。";
}

function setupRoomDragToScroll() {
    const wrapper = document.querySelector(".room-scroll-wrapper");
    if (!wrapper) return;
    let isDown = false;
    let startX = 0;
    let startScroll = 0;

    wrapper.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        isDown = true;
        roomDragMoved = false;
        startX = e.pageX;
        startScroll = wrapper.scrollLeft;
        wrapper.classList.add("is-dragging");
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        const dx = e.pageX - startX;
        if (Math.abs(dx) > 5) roomDragMoved = true;
        wrapper.scrollLeft = startScroll - dx;
    });

    const endDrag = () => {
        if (!isDown) return;
        isDown = false;
        wrapper.classList.remove("is-dragging");
        setTimeout(() => { roomDragMoved = false; }, 120);
    };
    document.addEventListener("mouseup", endDrag);
}

function initRoomSystem() {
    renderCurrency();
    setupRoomEventListeners();
    setupRoomDragToScroll();

    if (!roomData.pet) {
        openPetSelectModal();
    } else {
        maybeShowDailyLoginBonus();
    }

    renderRoomPreview();
    centerRoomPreviewOnPet();
    preloadPetSleepGif();
    startPetLifeLoops();
}

// ==========================================
// ペット選択
// ==========================================
function openPetSelectModal() {
    const modal = document.getElementById("modal-pet-select");
    if (modal) modal.classList.add("open");
}

let pendingPetType = null;

function choosePet(type) {
    pendingPetType = type;
    const preview = document.getElementById("petname-preview-img");
    const title = document.getElementById("petname-title");
    const input = document.getElementById("pet-name-input");
    const isRabbit = type === "usagi";
    if (preview) preview.src = isRabbit ? PET_AWAKE_IMG.usagi : PET_AWAKE_IMG.neko;
    if (title) title.textContent = `${isRabbit ? "うさぎ" : t("ねこ")}に名前をつけよう`;
    if (input) { input.value = ""; input.placeholder = isRabbit ? "例：ぴょん" : t("例：もち"); }
    document.getElementById("modal-pet-select")?.classList.remove("open");
    document.getElementById("modal-pet-name")?.classList.add("open");
    setTimeout(() => input?.focus(), 80);
}

function confirmPetName() {
    const input = document.getElementById("pet-name-input");
    const name = (input?.value || "").trim();
    if (!pendingPetType || !name) { input?.focus(); return; }
    roomData.pet = { type: pendingPetType, name, x: 50, y: PET_FLOOR_Y, scale: 1 };
    if (!roomData.ownedPets.includes(pendingPetType)) roomData.ownedPets.push(pendingPetType);
    roomData.petNames[pendingPetType] = name;
    pendingPetType = null;
    saveRoomData();
    document.getElementById("modal-pet-name")?.classList.remove("open");
    renderRoomPreview(); centerRoomPreviewOnPet(); preloadPetSleepGif();
    maybeShowDailyLoginBonus();
    if (typeof startOnboarding === "function") startOnboarding(false);
}

function maybeShowDailyLoginBonus() {
    if (roomData.lastLoginDate === todayDateKey()) return;
    document.getElementById("modal-daily-login")?.classList.add("open");
}

function claimDailyLoginBonus() {
    roomData.points += 200;
    roomData.lastLoginDate = todayDateKey();
    saveRoomData();
    renderCurrency();
    playCoin();
    vibrate(25);
    document.getElementById("modal-daily-login")?.classList.remove("open");
}

// ==========================================
// 所持ポイント表示
// ==========================================
function renderCurrency() {
    const points = (roomData && typeof roomData.points === "number") ? roomData.points : 0;
    const el = document.getElementById("currency-amount");
    if (el) el.textContent = points.toLocaleString();
    const shopEl = document.getElementById("shop-currency-amount");
    if (shopEl) shopEl.textContent = points.toLocaleString();
    const gachaEl = document.getElementById("gacha-currency-amount");
    if (gachaEl) gachaEl.textContent = points.toLocaleString();
    // ルーム編集画面の途中でショップやガチャを使ったら、持ち物にすぐ反映する
    if (document.getElementById("room-editor")?.classList.contains("open") && typeof renderInventoryTray === "function") {
        renderInventoryTray();
    }
}

// ==========================================
// ルームプレビュー
// ==========================================
function renderRoomScene(container, interactive, opts) {
    if (!container) return;
    const options = opts || {};
    container.innerHTML = "";

    if (!roomData || typeof roomData !== "object") return;
    const placed = Array.isArray(roomData.placedItems) ? roomData.placedItems : [];

    if (roomData.pet) {
        const petEl = createPetElement(interactive, container);
        container.appendChild(petEl);
        refreshPetMood();
    }

    placed.filter(it => it.placed).forEach(it => {
        const el = createFurnitureElement(it, interactive, container);
        container.appendChild(el);
    });
}

function renderRoomPreview() {
    applyRoomMap();
    renderRoomScene(document.getElementById("room-scene-preview"), false);
    renderAffection();
}

function centerRoomPreviewOnPet() {
    const scene = document.getElementById("room-scene-preview");
    const wrapper = scene ? scene.parentElement : null;
    if (!scene || !wrapper) return;
    const petX = roomData.pet ? (parseFloat(roomData.pet.x) || 50) : 50;
    const target = (petX / 100) * scene.scrollWidth - wrapper.clientWidth / 2;
    wrapper.scrollLeft = Math.max(0, target);
}

function preloadPetSleepGif() {
    if (!roomData.pet) return;
    const src = PET_SLEEP_IMG[roomData.pet.type];
    if (!src) return;
    const img = new Image();
    img.src = src;
}

function attachImgRetryFallback(imgEl, fallbackSrc) {
    imgEl.dataset.retried = "0";
    imgEl.addEventListener("error", function onImgError() {
        if (imgEl.dataset.retried !== "1") {
            imgEl.dataset.retried = "1";
            const base = imgEl.src.split("?")[0];
            setTimeout(() => { imgEl.src = base + "?retry=" + Date.now(); }, 400);
        } else if (fallbackSrc && !imgEl.src.endsWith(fallbackSrc)) {
            imgEl.src = fallbackSrc;
        }
    });
}

function createPetElement(interactive, container) {
    const type = roomData.pet.type;
    const sleeping = isSleepingState(petState);
    const img = sleeping
        ? (PET_SLEEP_IMG[type] || PET_SLEEP_IMG.neko)
        : (PET_AWAKE_IMG[type] || PET_AWAKE_IMG.neko);

    const el = document.createElement("div");
    const stateCls = (PET_STATES[petState] && PET_STATES[petState].cls) || "";
    el.className = "room-item pet-item" + (stateCls ? " " + stateCls : "") + (sleeping ? " is-sleeping" : "");
    el.style.left = roomData.pet.x + "%";
    el.style.top = getPetY() + "%";
    el.style.setProperty("--scale", roomData.pet.scale || 1);
    el.style.zIndex = PET_Z;
    el.innerHTML = `
        <img src="${img}" alt="${type}" draggable="false" decoding="async">
        <div class="pet-name-tag${roomData.pet.name ? "" : " hidden"}">${escapeHtml(roomData.pet.name || "")}</div>
        <div class="mood-badge hidden"></div>
    `;

    if (!interactive) {
        let strokeCount = 0;
        let strokeTimer = null;
        let pettedRecently = false;

        // なぞると「なでられた」とみなす。
        // 縮小表示中は、タップで部屋を元に戻す操作の邪魔をしないよう何もしない。
        el.addEventListener("pointermove", (e) => {
            if (isRoomCompact()) return;
            if (e.pointerType === "mouse" && e.buttons === 0) return;
            strokeCount++;
            if (strokeTimer) return;
            strokeTimer = setTimeout(() => {
                strokeTimer = null;
                if (strokeCount >= 6) {
                    pettedRecently = true;
                    petStroke();
                    setTimeout(() => { pettedRecently = false; }, 500);
                }
                strokeCount = 0;
            }, 350);
        });

        el.addEventListener("click", (e) => {
            // 縮小表示中のタップは「部屋を元に戻す」を優先したいので、
            // ここで stopPropagation せず親（プレビュー）に流す。
            if (isRoomCompact()) return;

            e.stopPropagation();
            if (!roomData.pet) return;
            if (pettedRecently) return;

            if (petWakeUp()) { vibrate(15); return; }

            triggerPetHop();
            spawnPetReaction("favorite");
            vibrate(15);
        });
    }

    if (interactive) {
        el.dataset.uid = "pet";
        makeItemDraggable(el, "pet", container);
    }

    const petImgEl = el.querySelector("img");
    if (petImgEl) attachImgRetryFallback(petImgEl, PET_AWAKE_IMG[type] || PET_AWAKE_IMG.neko);
    return el;
}

function createFurnitureElement(placedItem, interactive, container) {
    const furniture = getFurnitureById(placedItem.itemId);
    const el = document.createElement("div");
    el.className = "room-item furniture-item";
    el.dataset.itemId = placedItem.itemId;
    el.style.left = placedItem.x + "%";
    el.style.top = placedItem.y + "%";
    el.style.setProperty("--scale", placedItem.scale || 1);
    el.style.zIndex = placedItem.z || 1;
    const src = furniture ? furniture.img : "";
    el.innerHTML = `<img src="${src}" alt="" draggable="false" decoding="async">`;
    if (interactive) {
        el.dataset.uid = placedItem.uid;
        makeItemDraggable(el, placedItem.uid, container);
    }
    const furnitureImgEl = el.querySelector("img");
    if (furnitureImgEl && furniture) attachImgRetryFallback(furnitureImgEl, furniture.img);
    return el;
}

// ==========================================
// ルーム編集（フルスクリーン）
// ==========================================
function openRoomEditor() {
    const editor = document.getElementById("room-editor");
    if (editor) editor.classList.add("open");
    renderRoomEditorCanvas();
    renderInventoryTray();
    centerRoomEditorOnPet();
    // 向きを変えたときも、ペットが見える位置に保つ
    if (!openRoomEditor._bound) {
        openRoomEditor._bound = true;
        window.addEventListener("resize", () => {
            if (document.getElementById("room-editor")?.classList.contains("open")) centerRoomEditorOnPet();
        });
    }
}

function centerRoomEditorOnPet() {
    const canvas = document.getElementById("room-editor-canvas");
    const wrapper = canvas ? canvas.parentElement : null;
    if (!wrapper) return;
    requestAnimationFrame(() => {
        const x = (roomData && roomData.pet && typeof roomData.pet.x === "number") ? roomData.pet.x : 50;
        const target = (x / 100) * canvas.offsetWidth - wrapper.clientWidth / 2;
        wrapper.scrollLeft = Math.max(0, Math.min(canvas.offsetWidth - wrapper.clientWidth, target));
    });
}

function closeRoomEditor() {
    const editor = document.getElementById("room-editor");
    if (editor) editor.classList.remove("open");
    deselectRoomItem();
    renderRoomPreview();
}

function renderRoomEditorCanvas() {
    renderRoomScene(document.getElementById("room-editor-canvas"), true);
}

function renderInventoryTray() {
    const tray = document.getElementById("room-editor-tray-items");
    if (!tray) return;
    tray.innerHTML = "";

    const unplaced = roomData.placedItems.filter(it => !it.placed);
    if (unplaced.length === 0) {
        tray.innerHTML = `<p class="tray-empty-hint">ショップで家具を購入すると、ここに表示されます</p>`;
        return;
    }

    unplaced.forEach(it => {
        const furniture = getFurnitureById(it.itemId);
        if (!furniture) return;
        const card = document.createElement("div");
        card.className = "tray-item";
        card.innerHTML = `<img src="${furniture.img}" alt="" draggable="false"><span class="tray-item-plus material-icons-round">add_circle</span>`;
        card.addEventListener("click", () => placeItemToCenter(it.uid));
        tray.appendChild(card);
    });
}

function placeItemToCenter(uid) {
    const item = roomData.placedItems.find(it => it.uid === uid);
    if (!item) return;
    item.placed = true;
    item.x = 50;
    item.y = 50;
    item.scale = item.scale || 1;
    item.z = item.z || 1;
    saveRoomData();
    renderRoomEditorCanvas();
    renderInventoryTray();
    selectRoomItem(uid);
}

function makeItemDraggable(el, uid, canvas) {
    const clamp = (v) => Math.min(100, Math.max(0, v));

    el.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".resize-handle")) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        selectRoomItem(uid);

        const area = canvas || el.parentElement;
        const pointerId = e.pointerId;
        const startX = e.clientX;
        const startY = e.clientY;
        const origLeft = parseFloat(el.style.left) || 0;
        const origTop = parseFloat(el.style.top) || 0;
        try { el.setPointerCapture(pointerId); } catch (_) {}

        // 上・左・右・下のどちらにも動かせるよう、移動量は常に「開始位置からの差」で計算し、
        // 受け取りは window で行う（要素の外に指が出ても止まらない）
        const onMove = (ev) => {
            if (ev.pointerId !== pointerId) return;
            const rect = area.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            el.style.left = clamp(origLeft + ((ev.clientX - startX) / rect.width) * 100) + "%";
            el.style.top = clamp(origTop + ((ev.clientY - startY) / rect.height) * 100) + "%";
        };
        const onEnd = (ev) => {
            if (ev.pointerId !== pointerId) return;
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onEnd);
            window.removeEventListener("pointercancel", onEnd);
            try { el.releasePointerCapture(pointerId); } catch (_) {}
            persistItemPosition(uid, parseFloat(el.style.left), parseFloat(el.style.top));
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onEnd);
        window.addEventListener("pointercancel", onEnd);
    });
}

function persistItemPosition(uid, x, y) {
    if (uid === "pet") {
        roomData.pet.x = x;
        roomData.pet.y = y;
    } else {
        const item = roomData.placedItems.find(it => it.uid === uid);
        if (item) { item.x = x; item.y = y; }
    }
    saveRoomData();
}

function selectRoomItem(uid) {
    roomEditorSelectedUid = uid;
    document.querySelectorAll("#room-editor-canvas .room-item").forEach(el => {
        el.classList.toggle("selected", el.dataset.uid === uid);
    });
    attachSelectionControls(uid);
    updateEditorActions();
}

function deselectRoomItem() {
    roomEditorSelectedUid = null;
    document.querySelectorAll("#room-editor-canvas .room-item").forEach(el => {
        el.classList.remove("selected");
        const handle = el.querySelector(".resize-handle");
        if (handle) handle.remove();
    });
    updateEditorActions();
}

// 選択中のアイテム用の操作バー（アイテムの外にあるので、重なっても押せる）
function updateEditorActions() {
    const bar = document.getElementById("room-editor-actions");
    if (!bar) return;
    const uid = roomEditorSelectedUid;
    bar.classList.toggle("is-visible", !!uid);
    const removeBtn = document.getElementById("btn-item-remove");
    if (removeBtn) removeBtn.style.display = uid === "pet" ? "none" : "";
}

function attachSelectionControls(uid) {
    const el = document.querySelector(`#room-editor-canvas .room-item[data-uid="${uid}"]`);
    if (!el) return;
    if (el.querySelector(".resize-handle")) return;

    const handle = document.createElement("div");
    handle.className = "resize-handle";
    handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startY = e.clientY;
        const startScale = getCurrentScale(uid);

        const onMove = (ev) => {
            const delta = (ev.clientX - startX) / 100;
            const newScale = Math.min(2.5, Math.max(0.4, startScale + delta));
            el.style.setProperty("--scale", newScale);
        };
        const onUp = () => {
            const finalScale = parseFloat(el.style.getPropertyValue("--scale")) || 1;
            persistItemScale(uid, finalScale);
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onUp);
        };
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
    });
    el.appendChild(handle);
}

function getCurrentScale(uid) {
    if (uid === "pet") return roomData.pet.scale || 1;
    const item = roomData.placedItems.find(it => it.uid === uid);
    return item ? (item.scale || 1) : 1;
}

function persistItemScale(uid, scale) {
    if (uid === "pet") {
        roomData.pet.scale = scale;
    } else {
        const item = roomData.placedItems.find(it => it.uid === uid);
        if (item) item.scale = scale;
    }
    saveRoomData();
}

// レイヤーを1段階ずつ動かす。
// 前後の並び順（ペット込み）で、重なっている相手とだけ入れ替えるので、押すたびに見た目が変わる。
// delta: +1 = 1段階前へ、-1 = 1段階後ろへ
function changeItemLayer(uid, delta) {
    const canvas = document.getElementById("room-editor-canvas");
    if (!canvas || !uid) return;

    const entries = [];
    roomData.placedItems.forEach((it, i) => {
        if (it.placed) entries.push({ uid: it.uid, z: it.z || 1, order: i });
    });
    if (roomData.pet) entries.push({ uid: "pet", z: PET_Z, order: -1 });
    entries.sort((a, b) => (a.z - b.z) || (a.order - b.order));

    const from = entries.findIndex(e => e.uid === uid);
    if (from < 0) return;

    const rectOf = (id) => {
        const node = canvas.querySelector(`.room-item[data-uid="${id}"]`);
        return node ? node.getBoundingClientRect() : null;
    };
    const mine = rectOf(uid);
    const overlaps = (r) => mine && r &&
        r.left < mine.right && r.right > mine.left && r.top < mine.bottom && r.bottom > mine.top;

    let to = -1;
    for (let i = from + delta; i >= 0 && i < entries.length; i += delta) {
        if (overlaps(rectOf(entries[i].uid))) { to = i; break; }
    }
    if (to < 0) {
        if (typeof showToast === "function") {
            showToast(delta > 0 ? "これ以上前に出せません" : t("これ以上後ろに下げられません"));
        }
        return;
    }

    const moved = entries.splice(from, 1)[0];
    entries.splice(to, 0, moved);

    const petIdx = entries.findIndex(e => e.uid === "pet");
    entries.forEach((e, i) => {
        if (e.uid === "pet") return;
        let z;
        if (petIdx < 0) z = Math.min(50, i + 1);
        else if (i < petIdx) z = Math.min(PET_Z - 1, i + 1);
        else z = Math.min(50, PET_Z + (i - petIdx));
        const item = roomData.placedItems.find(it => it.uid === e.uid);
        if (item) item.z = z;
        const node = canvas.querySelector(`.room-item[data-uid="${e.uid}"]`);
        if (node) node.style.zIndex = z;
    });
    saveRoomData();
}

function returnItemToInventory(uid) {
    const item = roomData.placedItems.find(it => it.uid === uid);
    if (!item) return;
    item.placed = false;
    deselectRoomItem();
    saveRoomData();
    renderRoomEditorCanvas();
    renderInventoryTray();
}

// ==========================================
// ショップ
// ==========================================
function openShop() {
    renderShopGrid();
    renderCurrency();
    const modal = document.getElementById("modal-shop");
    if (modal) modal.classList.add("open");
}

function renderShopGrid() {
    const grid = document.getElementById("shop-grid");
    const emptyHint = document.getElementById("shop-empty-hint");
    if (!grid) return;
    grid.innerHTML = "";

    const available = FURNITURE_CATALOG.filter(f => !roomData.ownedItemIds.includes(f.id));

    if (available.length === 0) {
        if (emptyHint) emptyHint.style.display = "block";
        return;
    }
    if (emptyHint) emptyHint.style.display = "none";

    available.forEach(item => {
        const card = document.createElement("div");
        card.className = "shop-card";
        const affordable = roomData.points >= item.price;
        card.innerHTML = `
            <div class="shop-card-image"><img src="${item.img}" alt="" draggable="false"></div>
            <div class="shop-card-price">
                <span class="material-icons-round">toll</span>
                ${item.price.toLocaleString()}
            </div>
            <button class="shop-buy-btn" ${affordable ? "" : "disabled"}>購入</button>
        `;
        card.querySelector(".shop-buy-btn").addEventListener("click", () => buyItem(item.id));
        grid.appendChild(card);
    });
}

function buyItem(itemId) {
    const item = getFurnitureById(itemId);
    if (!item) return;
    if (roomData.points < item.price) return;
    if (roomData.ownedItemIds.includes(itemId)) return;

    roomData.points -= item.price;
    roomData.ownedItemIds.push(itemId);
    roomData.placedItems.push({
        uid: `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        itemId,
        x: 50, y: 50, scale: 1, z: 1,
        placed: false
    });

    saveRoomData();
    renderCurrency();
    renderShopGrid();
    playCoin();
    vibrate(25);
}

// ==========================================
// イベント登録（ルーム）
// ==========================================
function setupRoomEventListeners() {
    document.getElementById("choose-neko")?.addEventListener("click", () => choosePet("neko"));
    document.getElementById("choose-usagi")?.addEventListener("click", () => choosePet("usagi"));
    document.getElementById("btn-confirm-pet-name")?.addEventListener("click", confirmPetName);
    document.getElementById("pet-name-input")?.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmPetName(); });

    document.getElementById("btn-claim-daily-login")?.addEventListener("click", claimDailyLoginBonus);
    document.getElementById("btn-later-daily-login")?.addEventListener("click", () => {
        document.getElementById("modal-daily-login")?.classList.remove("open");
    });

    document.getElementById("btn-open-shop")?.addEventListener("click", openShop);
    document.getElementById("btn-close-shop")?.addEventListener("click", () => {
        document.getElementById("modal-shop")?.classList.remove("open");
    });

    document.getElementById("btn-layer-front")?.addEventListener("click", () => changeItemLayer(roomEditorSelectedUid, 1));
    document.getElementById("btn-layer-back")?.addEventListener("click", () => changeItemLayer(roomEditorSelectedUid, -1));
    document.getElementById("btn-item-confirm")?.addEventListener("click", deselectRoomItem);
    document.getElementById("btn-item-remove")?.addEventListener("click", () => {
        if (roomEditorSelectedUid && roomEditorSelectedUid !== "pet") returnItemToInventory(roomEditorSelectedUid);
    });

        document.getElementById("btn-close-room-editor")?.addEventListener("click", closeRoomEditor);

    // 部屋のどこかをタップ → 編集画面（ペット本体のタップは stopPropagation 済みで、これまで通り会話）
    document.getElementById("pet-room-preview")?.addEventListener("click", () => {
        if (roomDragMoved) return;
        openRoomEditor();
    });

    // ガチャ／ショップは編集画面の右上アイコンからも開ける
    document.getElementById("input-receipt-image")?.addEventListener("change", (e) => handleReceiptFile(e.target.files && e.target.files[0]));

    // 品目（明細）欄: 追加・削除・編集・合計を金額へ
    document.getElementById("btn-add-item")?.addEventListener("click", () => addItemRow());
    const itemListEl = document.getElementById("expense-items-list");
    if (itemListEl) {
        itemListEl.addEventListener("click", (e) => {
            const removeBtn = e.target.closest("[data-item-remove]");
            if (!removeBtn) return;
            const row = removeBtn.closest(".item-row");
            if (row) row.remove();
            updateItemsSummary();
        });
        itemListEl.addEventListener("input", updateItemsSummary);
    }
    document.getElementById("btn-apply-items-total")?.addEventListener("click", () => {
        const total = sumItemPrices();
        const amountEl = document.getElementById("expense-amount");
        if (total > 0 && amountEl) {
            amountEl.value = total;
            refreshReceiptMismatchState();
        }
    });
    document.getElementById("btn-editor-gacha")?.addEventListener("click", () => openGachaModal());
    document.getElementById("btn-editor-shop")?.addEventListener("click", () => openShop());

    window.addEventListener("resize", resetRoomCompactBase);
}

// ================================================================
// ▼ csv.js
// ================================================================
function decodeCsvBuffer(buffer) {
    if (!buffer) return "";

    let bytes;
    if (buffer instanceof Uint8Array) bytes = buffer;
    else if (typeof ArrayBuffer !== "undefined" && buffer instanceof ArrayBuffer) bytes = new Uint8Array(buffer);
    else return String(buffer);

    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        return new TextDecoder("utf-8").decode(bytes.subarray(3));
    }

    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (e) {
        // UTF-8 ではない
    }

    const candidates = ["shift-jis", "euc-jp", "iso-2022-jp"];
    for (const enc of candidates) {
        try {
            const decoded = new TextDecoder(enc).decode(bytes);
            if (decoded && decoded.indexOf("\uFFFD") === -1) return decoded;
        } catch (e) { /* 未対応の文字コードは次へ */ }
    }

    let best = "";
    let bestBad = Infinity;
    ["shift-jis", "utf-8"].forEach(enc => {
        try {
            const decoded = new TextDecoder(enc).decode(bytes);
            const bad = (decoded.match(/\uFFFD/g) || []).length;
            if (bad < bestBad) { bestBad = bad; best = decoded; }
        } catch (e) { /* ignore */ }
    });
    return best;
}

function detectDelimiter(text) {
    const firstLine = String(text || "").split(/\r?\n/).find(l => l.trim() !== "") || "";
    const tabs = (firstLine.match(/\t/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    return tabs > commas ? "\t" : ",";
}

function parseDelimitedText(text, delimiter) {
    const sep = delimiter || ",";
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    const src = String(text || "");

    for (let i = 0; i < src.length; i++) {
        const char = src[i];
        if (inQuotes) {
            if (char === '"') {
                if (src[i + 1] === '"') { field += '"'; i++; }
                else { inQuotes = false; }
            } else {
                field += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === sep) {
            row.push(field); field = "";
        } else if (char === "\n") {
            row.push(field); field = "";
            rows.push(row); row = [];
        } else if (char === "\r") {
            if (src[i + 1] !== "\n") {
                row.push(field); field = "";
                rows.push(row); row = [];
            }
        } else {
            field += char;
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

function parseAnyDate(value) {
    const s = String(value === undefined || value === null ? "" : value).trim();
    if (!s) return null;

    // 書き出した CSV の日時は UTC(Z) 付きの ISO 形式。下の「数字を拾う」処理だと
    // UTC の時刻をそのままローカル時刻として読んでしまい、9時間ずれて日付も変わる。
    if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
        const iso = new Date(s);
        if (!isNaN(iso.getTime())) return iso;
    }

    let m = s.match(/(\d{4})[\/\-年.]\s*(\d{1,2})[\/\-月.]\s*(\d{1,2})/);
    if (m) {
        const t = s.match(/(\d{1,2}):(\d{2})/);
        return new Date(+m[1], +m[2] - 1, +m[3], t ? +t[1] : 0, t ? +t[2] : 0, 0, 0);
    }

    m = s.match(/(令和|平成|昭和)\s*(\d{1,2})\s*[\/\-年.]\s*(\d{1,2})\s*[\/\-月.]\s*(\d{1,2})/);
    if (m) {
        const base = m[1] === "令和" ? 2018 : (m[1] === "平成" ? 1988 : 1925);
        return new Date(base + +m[2], +m[3] - 1, +m[4]);
    }

    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

function parseAmount(value) {
    let s = String(value === undefined || value === null ? "" : value).trim();
    if (!s) return null;

    let negative = false;
    if (/^[(（].*[)）]$/.test(s)) { negative = true; s = s.slice(1, -1); }

    s = s.replace(/[,\s円￥\\¥]/g, "");
    if (s === "" || s === "-" || s === "+") return null;

    const n = parseFloat(s);
    if (isNaN(n)) return null;
    const rounded = Math.round(Math.abs(n));
    if (rounded === 0) return 0;
    return (negative || n < 0) ? -rounded : rounded;
}

const COLUMN_KEYWORDS = {
    date: ["ご利用日", "お取引日", "利用日", "取引日", "処理日", "発生日", "計上日", "受付日", "年月日", "日付", "日時", "date"],
    withdraw: ["お引出し金額", "お引出し", "出金額", "引出金額", "支払金額", "ご利用金額", "利用金額", "出金", "amount"],
    deposit: ["お預入れ金額", "お預入れ", "入金額", "預入金額", "入金"],
    amount: ["入出金額", "取引金額", "金額"],
    category: ["カテゴリ", "分類", "費目"],
    memo: ["摘要内容", "ご利用内容", "取引内容", "摘要", "内容", "備考", "メモ", "description", "memo"],
    store: ["ご利用店舗", "利用店舗", "加盟店", "相手先", "支払先", "取引先", "店舗"],
    items: ["品目", "明細", "商品名", "商品"]
};

function detectColumns(headerRow) {
    const cells = (Array.isArray(headerRow) ? headerRow : []).map(c => String(c || "").trim().toLowerCase());
    const found = {};
    const claimed = new Set();

    const candidates = [];
    cells.forEach((cell, colIndex) => {
        if (!cell) return;
        Object.keys(COLUMN_KEYWORDS).forEach(field => {
            COLUMN_KEYWORDS[field].forEach(keyword => {
                const k = keyword.toLowerCase();
                if (cell.indexOf(k) !== -1) {
                    candidates.push({ field, colIndex, length: k.length });
                }
            });
        });
    });

    candidates.sort((a, b) => b.length - a.length);
    candidates.forEach(c => {
        if (found[c.field] !== undefined) return;
        if (claimed.has(c.colIndex)) return;
        found[c.field] = c.colIndex;
        claimed.add(c.colIndex);
    });

    if (found.date === undefined) {
        const idx = cells.findIndex((cell, i) => !claimed.has(i) && cell.indexOf("日") !== -1);
        if (idx !== -1) {
            found.date = idx;
            claimed.add(idx);
        }
    }

    return found;
}

function findHeaderRow(rows) {
    const limit = Math.min(rows.length, 10);
    for (let i = 0; i < limit; i++) {
        const cols = detectColumns(rows[i]);
        const hasDate = cols.date !== undefined;
        const hasMoney = cols.withdraw !== undefined || cols.amount !== undefined;
        if (hasDate && hasMoney) return { index: i, columns: cols };
    }
    return null;
}

function buildExpensesFromRows(rows) {
    const result = { records: [], skipped: 0, deposits: 0, detected: null, headerFound: false };
    if (!Array.isArray(rows) || rows.length === 0) return result;

    const header = findHeaderRow(rows);
    let startIndex;
    let col;

    if (header) {
        result.headerFound = true;
        result.detected = header.columns;
        startIndex = header.index + 1;
        col = header.columns;
    } else {
        col = { date: 0, category: 1, amount: 2, memo: 3, store: 4, items: 5 };
        startIndex = 0;
        result.detected = col;
    }

    const pick = (row, index) => (index === undefined || index === null ? "" : String(row[index] === undefined ? "" : row[index]));

    for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!Array.isArray(row)) { result.skipped++; continue; }

        const date = parseAnyDate(pick(row, col.date));

        let amount = null;
        if (col.withdraw !== undefined) amount = parseAmount(pick(row, col.withdraw));
        if ((amount === null || amount === 0) && col.amount !== undefined) {
            amount = parseAmount(pick(row, col.amount));
        }

        if ((amount === null || amount <= 0) && col.deposit !== undefined) {
            const dep = parseAmount(pick(row, col.deposit));
            if (dep !== null && dep > 0) { result.deposits++; continue; }
        }

        if (!date || amount === null || amount <= 0) { result.skipped++; continue; }

        const itemsText = pick(row, col.items).trim();
        let items = [];
        if (itemsText) {
            try {
                const parsed = JSON.parse(itemsText);
                if (Array.isArray(parsed)) items = parsed;
            } catch (e) {
                items = itemsText.split("|").map(part => {
                    const bits = part.split(":");
                    const name = (bits[0] || "").trim();
                    const price = parseAmount(bits[1]);
                    if (!name) return null;
                    return { name, price: price || 0, qty: 1 };
                }).filter(Boolean);
            }
        }

        result.records.push({
            date,
            amount,
            categoryName: pick(row, col.category).trim(),
            memo: pick(row, col.memo).trim(),
            store: pick(row, col.store).trim(),
            items
        });
    }

    return result;
}

function describeImportResult(result) {
    if (!result) return "";
    if (!result.headerFound) {
        return "見出し行が見つからなかったため、1列目=日付 / 2列目=カテゴリ / 3列目=金額 として読み取りました。";
    }
    const names = {
        date: "日付", withdraw: "出金額", deposit: "入金額", amount: "金額",
        category: "カテゴリ", memo: "摘要", store: "店舗", items: "品目"
    };
    const found = Object.keys(result.detected || {})
        .filter(k => result.detected[k] !== undefined)
        .map(k => names[k] || k);
    return `列を自動判定しました（${found.join("・")}）。`;
}

// ================================================================
// ▼ charts.js
// ================================================================
function daysInMonth(monthKey) {
    const parts = String(monthKey || "").split("-").map(n => parseInt(n, 10));
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
    return new Date(parts[0], parts[1], 0).getDate();
}

function elapsedDaysInMonth(monthKey) {
    const parts = String(monthKey || "").split("-").map(n => parseInt(n, 10));
    if (parts.length < 2) return 0;
    const total = daysInMonth(monthKey);
    const now = new Date();
    const currentKey = localMonthKey(now);
    if (monthKey === currentKey) return now.getDate();
    if (monthKey < currentKey) return total;
    return 0;
}

function getDailyTotals(expenses, monthKey) {
    const total = daysInMonth(monthKey);
    if (total === 0) return [];
    const buckets = new Array(total + 1).fill(0);

    (expenses || []).forEach(e => {
        if (!e || e.deletedAt) return;
        if (e.monthKey !== monthKey) return;
        const day = parseInt(String(e.dateKey || "").slice(8, 10), 10);
        if (isNaN(day) || day < 1 || day > total) return;
        buckets[day] += Number(e.amount) || 0;
    });

    const out = [];
    for (let d = 1; d <= total; d++) out.push({ day: d, total: buckets[d] });
    return out;
}

function getMonthStats(expenses, monthKey) {
    const daily = getDailyTotals(expenses, monthKey);
    const total = daily.reduce((s, d) => s + d.total, 0);
    const activeDays = daily.filter(d => d.total > 0).length;
    const elapsed = elapsedDaysInMonth(monthKey);

    let maxDay = 0;
    let maxTotal = 0;
    daily.forEach(d => {
        if (d.total > maxTotal) { maxTotal = d.total; maxDay = d.day; }
    });

    return {
        total,
        activeDays,
        maxDay,
        maxTotal,
        elapsedDays: elapsed,
        averagePerDay: elapsed > 0 ? Math.round(total / elapsed) : 0,
        averagePerActiveDay: activeDays > 0 ? Math.round(total / activeDays) : 0,
        daily
    };
}

function getCategoryComparison(expenses, categories, monthKey) {
    const prevMonth = addMonths(monthKey, -1);
    const sumOf = (key) => {
        const totals = {};
        (expenses || []).forEach(e => {
            if (!e || e.deletedAt || e.monthKey !== key) return;
            const cid = String(e.categoryId);
            totals[cid] = (totals[cid] || 0) + (Number(e.amount) || 0);
        });
        return totals;
    };

    const current = sumOf(monthKey);
    const previous = sumOf(prevMonth);
    const ids = new Set([...Object.keys(current), ...Object.keys(previous)]);

    return [...ids].map(cid => {
        const cat = (categories || []).find(c => String(c.id) === cid);
        const cur = current[cid] || 0;
        const prev = previous[cid] || 0;
        return {
            categoryId: cid,
            name: cat ? cat.name : t("不明"),
            current: cur,
            previous: prev,
            diff: cur - prev,
            ratio: prev > 0 ? cur / prev : null
        };
    }).sort((a, b) => b.current - a.current);
}

function svgEscape(value) {
    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildDailyBarSvg(daily, options) {
    const opts = Object.assign({ width: 320, height: 120, showAverage: true, averageOverDays: 0 }, options || {});

    if (!Array.isArray(daily) || daily.length === 0) {
        return `<div class="chart-empty">この月のデータがありません</div>`;
    }

    const W = opts.width;
    const H = opts.height;
    const padTop = 8;
    const padBottom = 18;
    const plotH = H - padTop - padBottom;

    const values = daily.map(d => Number(d.total) || 0);
    const max = Math.max(1, ...values);
    const n = daily.length;
    const gap = n > 20 ? 1 : 2;
    const barW = Math.max(1.5, (W - gap * (n - 1)) / n);

    const total = values.reduce((s, v) => s + v, 0);
    const divisor = opts.averageOverDays > 0 ? Math.min(opts.averageOverDays, n) : n;
    const average = divisor > 0 ? total / divisor : 0;

    const bars = daily.map((d, i) => {
        const v = Number(d.total) || 0;
        const h = v > 0 ? Math.max(1.5, (v / max) * plotH) : 0;
        const x = i * (barW + gap);
        const y = padTop + plotH - h;
        const isMax = v > 0 && v === max;
        const fill = isMax ? "var(--danger)" : "var(--accent)";
        const title = `${d.day}: ${fmtYenCompact(v)}`;
        return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" fill="${fill}" rx="1"><title>${svgEscape(title)}</title></rect>`;
    }).join("");

    const ticks = daily.filter(d => d.day === 1 || d.day % 7 === 1).map(d => {
        const i = d.day - 1;
        const x = i * (barW + gap) + barW / 2;
        return `<text x="${x.toFixed(2)}" y="${H - 5}" font-size="11" fill="var(--muted)" text-anchor="middle">${d.day}</text>`;
    }).join("");

    return `<svg class="daily-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="日別の支出グラフ">
        ${bars}
        <line x1="0" y1="${padTop + plotH}" x2="${W}" y2="${padTop + plotH}" stroke="var(--line-strong)" stroke-width="1"/>
        ${ticks}
    </svg>`;
}

function buildComparisonHtml(comparison, options) {
    const opts = Object.assign({ limit: 6 }, options || {});
    const rows = (comparison || []).filter(c => c.current > 0 || c.previous > 0).slice(0, opts.limit);

    if (rows.length === 0) {
        return `<p class="breakdown-empty">前月と比べられるデータがありません</p>`;
    }

    return rows.map(c => {
        let tag;
        if (c.ratio === null) {
            tag = `<span class="compare-tag is-new">${t("新規")}</span>`;
        } else {
            const percent = Math.round((c.ratio - 1) * 100);
            if (percent > 0) {
                tag = `<span class="compare-tag is-up">+${percent}%</span>`;
            } else if (percent < 0) {
                tag = `<span class="compare-tag is-down">${percent}%</span>`;
            } else {
                tag = `<span class="compare-tag is-flat">±0%</span>`;
            }
        }
        return `<div class="compare-row">
            <span class="compare-name">${escapeHtml(c.name)}</span>
            ${tag}
            <span class="compare-value">${fmtYen(c.current)}</span>
        </div>`;
    }).join("");
}

// ================================================================
// ▼ planner.js
// ================================================================
const PLANNER_DIFFICULTY = {
    easy: { key: "easy", label: t("かんたん"), desc: t("ゆるく節約して貯める"), coefficient: 0.75 },
    normal: { key: "normal", label: t("ふつう"), desc: t("バランスよく節約する"), coefficient: 1.0 },
    hard: { key: "hard", label: t("むずかしい"), desc: t("しっかり節約して貯める"), coefficient: 1.25 }
};

const DAYS_PER_MONTH = 30;

function getDifficulty(key) {
    return PLANNER_DIFFICULTY[key] || PLANNER_DIFFICULTY.normal;
}

function estimateMonthlyExpense(expenses, monthsBack, fromMonthKey) {
    const base = fromMonthKey || localMonthKey(new Date());
    const keys = [];
    for (let i = 1; i <= monthsBack; i++) keys.push(addMonths(base, -i));

    const totals = [];
    keys.forEach(k => {
        const total = (expenses || [])
            .filter(e => e && !e.deletedAt && e.monthKey === k)
            .reduce((s, e) => s + (Number(e.amount) || 0), 0);
        if (total > 0) totals.push(total);
    });

    if (totals.length === 0) return null;
    return Math.round(totals.reduce((s, v) => s + v, 0) / totals.length);
}

function calculatePlan(input) {
    const src = input || {};
    const income = Number(src.monthlyIncome) || 0;
    const target = Number(src.targetAmount) || 0;
    const expense = Number(src.monthlyExpense) || 0;
    const difficulty = getDifficulty(src.difficulty);

    const base = {
        monthlyIncome: income,
        targetAmount: target,
        monthlyExpense: expense,
        difficulty: difficulty.key,
        difficultyLabel: difficulty.label,
        difficultyDesc: difficulty.desc,
        coefficient: difficulty.coefficient
    };

    if (income <= 0) {
        return Object.assign(base, { ok: false, reason: t("月収（手取り）を入力してください。") });
    }
    if (target <= 0) {
        return Object.assign(base, { ok: false, reason: t("ほしいものの金額を入力してください。") });
    }

    const surplus = income - expense;
    const surplusInfo = { monthlySurplus: surplus };

    if (surplus <= 0) {
        return Object.assign(base, surplusInfo, {
            ok: false,
            reason: t("月の支出が収入を上回っています。まず支出を減らす必要があります。")
        });
    }

    let monthlySaving = Math.round(surplus * difficulty.coefficient);
    monthlySaving = Math.max(1, Math.min(monthlySaving, Math.round(income)));

    const spendable = Math.max(0, income - monthlySaving);

    const months = target / monthlySaving;
    const days = Math.max(1, Math.round(months * DAYS_PER_MONTH));
    const wholeMonths = Math.floor(days / DAYS_PER_MONTH);
    const restDays = days % DAYS_PER_MONTH;

    const now = src.now instanceof Date ? src.now : new Date();
    const targetDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const savingRate = monthlySaving / income;
    let caution = null;
    if (savingRate >= 0.5) {
        caution = t("収入の {p}% を貯金に回す計算です。かなり厳しいので、期間を長めに考えましょう。", { p: Math.round(savingRate * 100) });
    }

    return Object.assign(base, surplusInfo, {
        ok: true,
        monthlySaving,
        spendablePerMonth: spendable,
        savingRate,
        months: Math.round(months * 10) / 10,
        days,
        wholeMonths,
        restDays,
        periodLabel: wholeMonths > 0
            ? (restDays > 0 ? t("{a}か月{b}日", { a: wholeMonths, b: restDays }) : t("{a}か月", { a: wholeMonths }))
            : t("{a}日", { a: restDays }),
        targetDate,
        targetDateLabel: formatPlanDate(targetDate),
        caution
    });
}

function formatPlanDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return "";
    return t("{y}年{m}月{d}日", { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
}

function getReductionSuggestions(expenses, categories, monthKey, plan, limit) {
    const max = limit || 3;
    if (!plan || !plan.ok || !plan.monthlySaving) return [];

    const totals = {};
    (expenses || []).forEach(e => {
        if (!e || e.deletedAt || e.monthKey !== monthKey) return;
        const cid = String(e.categoryId);
        totals[cid] = (totals[cid] || 0) + (Number(e.amount) || 0);
    });

    const totalSpent = Object.values(totals).reduce((s, v) => s + v, 0);
    if (totalSpent <= 0) return [];

    return Object.entries(totals)
        .map(([cid, amount]) => {
            const cat = (categories || []).find(c => String(c.id) === cid);
            const cutAmount = Math.round(amount * 0.1);
            const newSaving = plan.monthlySaving + cutAmount;
            const newDays = Math.max(1, Math.round((plan.targetAmount / newSaving) * DAYS_PER_MONTH));
            return {
                categoryId: cid,
                name: cat ? cat.name : t("不明"),
                amount,
                share: amount / totalSpent,
                cutAmount,
                savedDays: plan.days - newDays
            };
        })
        .filter(s => s.cutAmount > 0)
        .sort((a, b) => b.savedDays - a.savedDays || b.amount - a.amount)
        .slice(0, max);
}

function buildPlannerAdvice(plan, suggestions, context) {
    const advice = [];
    if (!plan) return advice;

    if (!plan.ok) {
        advice.push(plan.reason);
        if (/支出が収入を上回/.test(plan.reason || "")) {
            advice.push(t("まずは「今月の内訳」で一番大きいカテゴリを確認してみましょう。"));
        }
        return advice;
    }

    advice.push(t("このペースだと、約 {p} で「{d}」に買えます。", { p: plan.periodLabel, d: formatPlanDate(plan.targetDate) }));

    if (plan.wholeMonths <= 1) {
        advice.push(t("1か月以内に手が届きます。もう少しだけ踏ん張ってみましょう。"));
    } else if (plan.wholeMonths >= 12) {
        advice.push(t("1年以上かかる計算です。目標金額を分けて、小さな目標から達成するのもおすすめです。"));
    }

    (suggestions || []).forEach(s => {
        if (s.savedDays <= 0) return;
        advice.push(t("「{c}」を1割（約 {n}/月）減らすと、{d} 日早まります。", { c: s.name, n: fmtYenCompact(s.cutAmount), d: s.savedDays }));
    });

    if (plan.caution) advice.push(plan.caution);

    const recorded = context && context.recordedMonths;
    if (recorded === 0) {
        advice.push(t("まだ支出の記録が少ないので、支出額は手入力の値を使っています。記録が増えると精度が上がります。"));
    }

    return advice;
}

function buildPlannerPrompt(plan, suggestions, context) {
    const lines = [
        "あなたは家計簿アプリのアドバイザーです。以下の状況を踏まえ、",
        "日本語で2〜3文の前向きで実行しやすい提案を1つだけ書いてください。",
        "説教くさくせず、具体的な金額や日数を含めてください。",
        "",
        `月収(手取り): ${plan.monthlyIncome} 円`,
        `月の支出: ${plan.monthlyExpense} 円`,
        `月の余剰: ${plan.monthlySurplus} 円`,
        `目標金額: ${plan.targetAmount} 円`,
        `難易度: ${plan.difficultyLabel}（${plan.difficultyDesc}）`,
        `毎月の貯金額: ${plan.monthlySaving} 円`,
        `達成までの期間: ${plan.periodLabel}（${plan.days}日）`,
        `自由に使えるお金: ${plan.spendablePerMonth} 円/月`
    ];
    if (suggestions && suggestions.length > 0) {
        lines.push("");
        lines.push("支出の大きいカテゴリ:");
        suggestions.forEach(s => {
            lines.push(`・${s.name}: ${s.amount}円（支出の${Math.round(s.share * 100)}%）、1割減で${s.savedDays}日短縮`);
        });
    }
    if (context && context.topItems && context.topItems.length > 0) {
        lines.push("");
        lines.push("よく買っている品目:");
        context.topItems.slice(0, 5).forEach(t => lines.push(`・${t.name}: ${t.count}回`));
    }
    return lines.join("\n");
}

function getPlanProgress(plan, expenses) {
    if (!plan || !plan.ok || !plan.createdAt) {
        return { saved: 0, remaining: plan ? plan.targetAmount : 0, percent: 0, months: [] };
    }
    const startMonth = localMonthKey(new Date(plan.createdAt));
    const nowMonth = localMonthKey(new Date());
    const months = [];

    let cursor = startMonth;
    let guard = 0;
    while (cursor <= nowMonth && guard < 120) {
        const spent = (expenses || [])
            .filter(e => e && !e.deletedAt && e.monthKey === cursor)
            .reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const income = Number(plan.monthlyIncome) || 0;
        // 今月はまだ終わっていないので、経過した日数ぶんの収入だけを数える
        const frac = cursor === nowMonth
            ? Math.min(1, elapsedDaysInMonth(cursor) / Math.max(1, daysInMonth(cursor)))
            : 1;
        const saved = Math.round(Math.max(0, income * frac - spent));
        months.push({ monthKey: cursor, spent, saved });
        cursor = addMonths(cursor, 1);
        guard++;
    }

    const saved = months.reduce((s, m) => s + m.saved, 0);
    const remaining = Math.max(0, plan.targetAmount - saved);
    return {
        saved,
        remaining,
        percent: plan.targetAmount > 0 ? Math.min(100, Math.round((saved / plan.targetAmount) * 100)) : 0,
        months,
        achieved: saved >= plan.targetAmount
    };
}

// ================================================================
// ▼ receipt.js
// ================================================================
const OCR_SETTINGS_KEY = "yoyu_aru_ocr_settings";
const RECEIPT_DB_NAME = "yoyu_aru_receipts";
const RECEIPT_DB_VERSION = 1;
const RECEIPT_STORE_NAME = "images";

const RECEIPT_MAX_EDGE = 1600;
const RECEIPT_JPEG_QUALITY = 0.8;
const RECEIPT_THUMB_EDGE = 360;

const DEFAULT_OCR_SETTINGS = {
    provider: "gemini",
    apiKey: "",
    model: "gemini-2.0-flash",
    endpoint: ""
};

// ---- サーバー経由の読み取り（ユーザーは APIキー不要）----------------------------
// 公開するときは、Supabase Edge Function の URL と publishable / anon key を入れる。
// キーはサーバー側の秘密情報に置く。ここ（アプリのコード）には絶対に書かない。
const SUPABASE_BASE_URL = "https://kdcxycqmkftcgnfjvdwz.supabase.co";
const OCR_SERVER_URL = SUPABASE_BASE_URL + "/functions/v1/scan-receipt";
const OCR_SERVER_ANON_KEY = "sb_publishable_7TdvqziSh_1XleGqwYnF5g_LslTFS8x";
const DEVICE_ID_KEY = "yoyu_aru_device_id";

function supabaseFunctionHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (OCR_SERVER_ANON_KEY) headers["apikey"] = OCR_SERVER_ANON_KEY;
    // 旧 anon JWT のときだけ Bearer を付ける。publishable key は apikey で送る。
    if (OCR_SERVER_ANON_KEY && /^eyJ/.test(OCR_SERVER_ANON_KEY)) {
        headers["Authorization"] = "Bearer " + OCR_SERVER_ANON_KEY;
    }
    return headers;
}

let ephemeralDeviceId = "";

function getDeviceId() {
    try {
        let id = localStorage.getItem(DEVICE_ID_KEY);
        if (!id || id.length < 16) {
            id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
                : "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
            localStorage.setItem(DEVICE_ID_KEY, id);
        }
        return id;
    } catch (e) {
        if (!ephemeralDeviceId) {
            ephemeralDeviceId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
                : "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
        }
        return ephemeralDeviceId;
    }
}

function isReceiptScanAvailable() {
    return !!OCR_SERVER_URL || isOcrConfigured();
}

async function recognizeReceiptViaServer(dataUrl) {
    const base64 = String(dataUrl).split(",")[1] || "";
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 25000) : null;
    let res;
    try {
        const headers = supabaseFunctionHeaders();
        res = await fetch(OCR_SERVER_URL, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({ image: base64, mime: "image/jpeg", device: getDeviceId() }),
            signal: controller ? controller.signal : undefined
        });
    } catch (e) {
        const aborted = e && e.name === "AbortError";
        return { ok: false, httpOk: false, error: aborted
            ? t("読み取りがタイムアウトしました。通信環境を確認して、もう一度試してください。")
            : t("通信できませんでした。オフラインか、接続が制限されている可能性があります。") };
    } finally {
        if (controller) clearTimeout(timer);
    }

    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }

    if (res.status === 429) {
        const msg = (json && json.error === "global_limit")
            ? t("今日は読み取りの利用が多く、いったん受付を終了しました。明日また試すか、手入力してください。")
            : t("今日の読み取り回数の上限に達しました。明日また使えます。");
        return { ok: false, httpOk: true, error: msg, limited: true, remaining: 0 };
    }
    if (!res.ok || !json) {
        return { ok: false, httpOk: false, error: t("読み取りサービスに接続できませんでした。時間をおいて試してください。") };
    }
    const parsed = parseReceiptResponse(json.text);
    return Object.assign({ httpOk: true, remaining: (typeof json.remaining === "number" ? json.remaining : null) }, parsed);
}

function getOcrSettings() {
    let saved = null;
    try {
        saved = safeParse(localStorage.getItem(OCR_SETTINGS_KEY));
    } catch (e) { saved = null; }
    return Object.assign({}, DEFAULT_OCR_SETTINGS, saved || {});
}

function saveOcrSettings(settings) {
    try {
        localStorage.setItem(OCR_SETTINGS_KEY, JSON.stringify(settings || {}));
        return true;
    } catch (e) {
        return false;
    }
}

function isOcrConfigured() {
    const s = getOcrSettings();
    if (s.provider === "custom") return !!(s.apiKey && s.endpoint && s.model);
    return !!s.apiKey && !!s.model;
}

function buildReceiptPrompt() {
    return [
        "このレシート画像を読み取り、次のJSONだけを出力してください。",
        "説明文・前置き・Markdownのコードフェンスは一切書かないでください。",
        "",
        "{",
        '  "store": "店舗名（読み取れなければ空文字）",',
        '  "date": "YYYY-MM-DD 形式。不明なら空文字",',
        '  "subtotal": 小計（数値。不明なら0）,',
        '  "tax8": 8%対象の消費税額（数値。不明なら0）,',
        '  "tax10": 10%対象の消費税額（数値。不明なら0）,',
        '  "total": 合計金額（数値。必ず入れる）,',
        '  "items": [',
        '    { "name": "品目名", "price": 金額, "qty": 数量, "taxRate": 8または10, "type": "item" }',
        "  ]",
        "}",
        "",
        "注意事項：",
        "・割引や値引きの行は type を \"discount\" にし、price を負の数にしてください。",
        "・軽減税率（8%）と 10% が混在している場合は taxRate を品目ごとに分けてください。",
        "・「小計」「消費税」「合計」の行は items に含めず、それぞれの項目に入れてください。",
        "・読み取れない品目は無理に作らず、確実なものだけ入れてください。",
        "・金額はすべて円単位の整数にしてください。"
    ].join("\n");
}

function extractJsonObject(text) {
    const raw = String(text || "");
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1] : raw;

    const start = body.indexOf("{");
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < body.length; i++) {
        const ch = body[i];
        if (inString) {
            if (escaped) { escaped = false; }
            else if (ch === "\\") { escaped = true; }
            else if (ch === '"') { inString = false; }
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) return body.slice(start, i + 1);
        }
    }
    return null;
}

function toInt(value) {
    if (typeof value === "number" && isFinite(value)) return Math.round(value);
    const n = parseFloat(String(value === undefined || value === null ? "" : value).replace(/[^\d.-]/g, ""));
    return isNaN(n) ? 0 : Math.round(n);
}

function normalizeReceiptItem(item) {
    const it = item && typeof item === "object" ? item : {};
    const type = (it.type === "discount" ? "discount" : "item");
    let price = toInt(it.price);
    if (type === "discount" && price > 0) price = -price;
    return {
        name: String(it.name || "").trim(),
        price: price,
        qty: Math.max(1, toInt(it.qty) || 1),
        taxRate: it.taxRate === 8 ? 8 : (it.taxRate === 10 ? 10 : null),
        type: type
    };
}

function normalizeReceipt(receipt) {
    const r = receipt && typeof receipt === "object" ? receipt : {};
    const items = Array.isArray(r.items) ? r.items.map(normalizeReceiptItem).filter(it => it.name || it.price) : [];

    let date = String(r.date || "").trim();
    const jp = date.match(/(\d{4})[\/年\-](\d{1,2})[\/月\-](\d{1,2})/);
    if (jp) {
        date = `${jp[1]}-${String(jp[2]).padStart(2, "0")}-${String(jp[3]).padStart(2, "0")}`;
    } else {
        date = "";
    }

    return {
        store: String(r.store || "").trim(),
        date: date,
        subtotal: toInt(r.subtotal),
        tax8: toInt(r.tax8),
        tax10: toInt(r.tax10),
        total: toInt(r.total),
        items: items
    };
}

function parseReceiptResponse(text) {
    const jsonText = extractJsonObject(text);
    if (!jsonText) {
        return { ok: false, error: "レシートを読み取れませんでした。手入力に切り替えてください。" };
    }
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch (e) {
        return { ok: false, error: "読み取り結果の形式が不正でした。手入力に切り替えてください。" };
    }
    const receipt = normalizeReceipt(parsed);
    if (receipt.total <= 0 && receipt.items.length === 0) {
        return { ok: false, error: "金額を読み取れませんでした。もう一度撮影するか、手入力してください。" };
    }
    return { ok: true, receipt: receipt };
}

function validateReceipt(receipt) {
    const r = normalizeReceipt(receipt);
    const itemSum = r.items.reduce((s, it) => s + it.price * (it.qty || 1), 0);
    const warnings = [];
    let mismatch = false;

    if (r.total > 0 && r.items.length > 0) {
        const diff = itemSum - r.total;
        if (Math.abs(diff) > 2) {
            mismatch = true;
            warnings.push(t("品目の合計（{a}円）とレシートの合計（{b}円）が {d}円 違います。読み取り漏れの可能性があります。", {
                a: itemSum.toLocaleString(), b: r.total.toLocaleString(), d: Math.abs(diff).toLocaleString()
            }));
        }
    }
    if (r.total <= 0) {
        warnings.push(t("合計金額が読み取れていません。金額を確認してください。"));
    }
    if (r.items.length === 0) {
        warnings.push(t("品目が読み取れていません。合計金額だけが記録されます。"));
    }
    if (r.tax8 > 0 && r.tax10 > 0) {
        warnings.push(t("軽減税率（8%）と10%が混在しています。品目の税率を確認してください。"));
    }

    return { itemSum, total: r.total, diff: itemSum - r.total, mismatch, warnings };
}

const CATEGORY_KEYWORDS = {
    "食費": [
        "牛乳", "パン", "卵", "たまご", "お米", "ごはん", "肉", "豚", "牛", "鶏", "野菜", "果物",
        "りんご", "バナナ", "さかな", "惣菜", "弁当", "おにぎり", "サラダ", "ヨーグルト",
        "チーズ", "豆腐", "納豆", "麺", "ラーメン", "うどん", "そば", "パスタ", "カレー", "調味料",
        "醤油", "味噌", "ソース", "サラダ油", "ごま油", "砂糖", "冷凍", "アイス", "菓子", "スナック",
        "チョコ", "ジュース", "お茶", "コーヒー", "飲料", "ウォーター", "ビール", "ワイン"
    ],
    "日用品": [
        "ティッシュ", "ペーパー", "トイレット", "洗剤", "シャンプー", "コンディショナー", "石鹸",
        "石けん", "歯磨き", "ハブラシ", "タオル", "ゴミ袋", "ラップ", "ホイル", "電池", "スポンジ",
        "マスク", "柔軟剤", "漂白", "掃除", "洗面", "キッチン", "収納",
        "ボールペン", "ノート", "ファイル"
    ],
    "交通費": [
        "電車", "バス", "タクシー", "ガソリン", "軽油", "駐車", "パーキング", "切符", "きっぷ",
        "定期", "高速", "充電", "チャージ", "運賃", "鉄道", "メトロ"
    ],
    "娯楽": [
        "ゲーム", "映画", "シネマ", "書籍", "雑誌", "コミック", "カラオケ", "チケット",
        "玩具", "おもちゃ", "フィギュア", "配信", "サブスク", "課金", "グッズ", "ライブ"
    ],
    "医療": [
        "くすり", "病院", "診察", "処方", "サプリ", "目薬", "絆創膏", "湿布", "整骨",
        "歯科", "クリニック", "ドラッグ"
    ]
};

function guessCategoryId(itemName, categories, fallbackId) {
    const name = String(itemName || "");
    const list = Array.isArray(categories) ? categories : [];
    const fallback = fallbackId || (list[0] ? list[0].id : null);
    if (!name || list.length === 0) return fallback;

    let best = null;
    let bestLen = 0;
    Object.keys(CATEGORY_KEYWORDS).forEach(categoryName => {
        CATEGORY_KEYWORDS[categoryName].forEach(keyword => {
            if (keyword.length > bestLen && name.indexOf(keyword) !== -1) {
                best = categoryName;
                bestLen = keyword.length;
            }
        });
    });

    if (!best) return fallback;
    const matched = list.find(c => c.name === best);
    return matched ? matched.id : fallback;
}

function assignCategoriesToItems(items, categories, fallbackId) {
    return (Array.isArray(items) ? items : []).map(it => Object.assign({}, it, {
        categoryId: guessCategoryId(it.name, categories, fallbackId)
    }));
}

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        if (!file) { reject(new Error("ファイルがありません。")); return; }
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("画像を読み込めませんでした。"));
            img.src = String(reader.result);
        };
        reader.onerror = () => reject(new Error("ファイルを読み込めませんでした。"));
        reader.readAsDataURL(file);
    });
}

function resizeImageToDataUrl(img, maxEdge, quality) {
    const edge = maxEdge || RECEIPT_MAX_EDGE;
    const q = quality === undefined ? RECEIPT_JPEG_QUALITY : quality;

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("画像のサイズを取得できませんでした。");

    const scale = Math.min(1, edge / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("画像を加工できませんでした。");
    ctx.drawImage(img, 0, 0, outW, outH);

    return {
        dataUrl: canvas.toDataURL("image/jpeg", q),
        width: outW,
        height: outH,
        originalWidth: w,
        originalHeight: h
    };
}

function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || "").split(",");
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const binary = atob(parts[1] || "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

function openReceiptDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
            reject(new Error("この環境では画像を保存できません。"));
            return;
        }
        const req = indexedDB.open(RECEIPT_DB_NAME, RECEIPT_DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(RECEIPT_STORE_NAME)) {
                db.createObjectStore(RECEIPT_STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error("画像の保存領域を開けませんでした。"));
    });
}

async function saveReceiptImage(id, blob) {
    const db = await openReceiptDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(RECEIPT_STORE_NAME, "readwrite");
        tx.objectStore(RECEIPT_STORE_NAME).put(blob, id);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); reject(new Error("画像を保存できませんでした。")); };
    });
}

async function getReceiptImage(id) {
    if (!id) return null;
    const db = await openReceiptDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(RECEIPT_STORE_NAME, "readonly");
        const req = tx.objectStore(RECEIPT_STORE_NAME).get(id);
        req.onsuccess = () => { db.close(); resolve(req.result || null); };
        req.onerror = () => { db.close(); reject(new Error("画像を読み込めませんでした。")); };
    });
}

async function deleteReceiptImage(id) {
    if (!id) return false;
    const db = await openReceiptDb();
    return new Promise((resolve) => {
        const tx = db.transaction(RECEIPT_STORE_NAME, "readwrite");
        tx.objectStore(RECEIPT_STORE_NAME).delete(id);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); resolve(false); };
    });
}

async function listReceiptImageIds() {
    try {
        const db = await openReceiptDb();
        return await new Promise((resolve) => {
            const tx = db.transaction(RECEIPT_STORE_NAME, "readonly");
            const req = tx.objectStore(RECEIPT_STORE_NAME).getAllKeys();
            req.onsuccess = () => { db.close(); resolve(req.result || []); };
            req.onerror = () => { db.close(); resolve([]); };
        });
    } catch (e) {
        return [];
    }
}

function describeHttpError(status) {
    if (status === 400) return "リクエストが拒否されました。モデル名を確認してください。";
    if (status === 401 || status === 403) return "APIキーが正しくないか、権限がありません。";
    if (status === 429) return "利用回数の上限に達しました。少し待ってから試してください。";
    if (status >= 500) return "サーバー側でエラーが発生しました。時間をおいて試してください。";
    return `通信に失敗しました（HTTP ${status}）。`;
}

function buildVisionRequest(dataUrl, settings, prompt) {
    const s = settings || {};
    const base64 = String(dataUrl).split(",")[1] || "";

    if (s.provider === "gemini") {
        const endpoint = (s.endpoint || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
        const model = s.model || "gemini-2.0-flash";
        return {
            // キーを URL に載せると、通信ログやスクリーンショットに残るのでヘッダーで送る
            url: `${endpoint}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": s.apiKey
            },
            body: {
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: "image/jpeg", data: base64 } }
                    ]
                }],
                generationConfig: { temperature: 0, responseMimeType: "application/json" }
            }
        };
    }

    const endpoint = s.endpoint || "https://api.openai.com/v1";
    return {
        url: `${endpoint.replace(/\/$/, "")}/chat/completions`,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${s.apiKey}`
        },
        body: {
            model: s.model || "gpt-4o-mini",
            temperature: 0,
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: dataUrl } }
                ]
            }]
        }
    };
}

function extractResponseText(provider, json) {
    try {
        if (provider === "gemini") {
            const parts = json.candidates[0].content.parts;
            return parts.map(p => p.text || "").join("");
        }
        return json.choices[0].message.content || "";
    } catch (e) {
        return "";
    }
}

async function recognizeReceipt(dataUrl, settings) {
    const s = settings || getOcrSettings();
    // 自分のキーを入れている人はこれまでどおり直接送る。入れていなければサーバー経由（キー不要）
    if (!s.apiKey && OCR_SERVER_URL) return recognizeReceiptViaServer(dataUrl);
    if (!s.apiKey) {
        return { ok: false, httpOk: false, error: t("APIキーが設定されていません。") };
    }

    // カスタム先は https のみ許可（http だと API キーが平文で流れるため）
    const endpointError = checkAiEndpoint(s);
    if (endpointError) return { ok: false, httpOk: false, error: endpointError };

    const prompt = buildReceiptPrompt();
    const req = buildVisionRequest(dataUrl, s, prompt);

    // 通信が固まったまま「読み取っています…」が残らないように 20 秒で打ち切る
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 20000) : null;

    let res;
    try {
        res = await fetch(req.url, {
            method: "POST",
            headers: req.headers,
            body: JSON.stringify(req.body),
            signal: controller ? controller.signal : undefined
        });
    } catch (e) {
        const aborted = e && e.name === "AbortError";
        return {
            ok: false,
            httpOk: false,
            error: aborted
                ? "読み取りがタイムアウトしました。通信環境を確認して、もう一度試してください。"
                : "通信できませんでした。オフラインか、接続が制限されている可能性があります。"
        };
    } finally {
        if (controller) clearTimeout(timer);
    }

    if (!res.ok) {
        return { ok: false, httpOk: false, error: describeHttpError(res.status) };
    }

    let json;
    try {
        json = await res.json();
    } catch (e) {
        // HTTP 自体は通っているので「接続テスト」は成功扱いにする
        return { ok: false, httpOk: true, error: "応答を解釈できませんでした。モデル名やエンドポイントを確認してください。" };
    }

    const text = extractResponseText(s.provider, json);
    const parsed = parseReceiptResponse(text);
    return Object.assign({ httpOk: true }, parsed);
}

// ================================================================
// ▼ onboarding.js（初回ガイド）
// ================================================================
// ==========================================
// onboarding.js — 初回ガイド
// ==========================================
// 流れ：ペットの名前を決める → ① 予算 → ② 1件記録 → ③ ペットと遊ぶ → ④ CSVでバックアップ
// 画面をふさがない小さなカードで案内する（途中でスキップ可）。
// 進み具合は端末に保存し、途中で閉じても続きから再開する。
//   ・初めてペットを迎えた人にだけ自動で始まる（すでに使っている人には出ない）
//   ・「設定 → 使い方をもう一度見る」から、いつでも見直せる
// ==========================================

const ONBOARDING_KEY = "yoyu_aru_usage_guide_v2";
const PET_GUIDE_KEY = "yoyu_aru_pet_guide";

function readOnboardingState() {
    try {
        const v = JSON.parse(localStorage.getItem(ONBOARDING_KEY) || "null");
        return (v && typeof v === "object") ? v : null;
    } catch (e) { return null; }
}
function writeOnboardingState(state) {
    try { localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state)); } catch (e) { /* 保存できなくても進められる */ }
}

// 画面中央に出す、最小限の案内カード
// 「使い方」と同じカード構造の確認ダイアログ。OK なら true を返す。
function showCenterConfirm({ id, title, rows, okLabel, cancelLabel, danger }) {
    return new Promise(resolve => {
        document.getElementById(id)?.remove();
        const overlay = document.createElement("div");
        overlay.id = id;
        overlay.className = "guide-overlay";
        overlay.setAttribute("role", "alertdialog");
        overlay.innerHTML =
            `<div class="guide-card"><h4 class="guide-title"></h4><ul class="guide-list"></ul>` +
            `<div class="guide-actions"><button type="button" class="primary-button guide-ok"></button>` +
            `<button type="button" class="guide-cancel"></button></div></div>`;
        overlay.querySelector(".guide-title").textContent = title;
        const ul = overlay.querySelector(".guide-list");
        rows.forEach(r => {
            const li = document.createElement("li");
            li.innerHTML = `<span class="material-icons-round"></span><span class="guide-text"></span>`;
            li.children[0].textContent = r.icon;
            li.children[1].textContent = r.text;
            ul.appendChild(li);
        });
        const ok = overlay.querySelector(".guide-ok");
        ok.textContent = okLabel;
        if (danger) ok.classList.add("is-danger");
        overlay.querySelector(".guide-cancel").textContent = cancelLabel || t("キャンセル");
        const done = (v) => { overlay.remove(); resolve(v); };
        ok.addEventListener("click", () => done(true));
        overlay.querySelector(".guide-cancel").addEventListener("click", () => done(false));
        (document.querySelector(".app-container") || document.body).appendChild(overlay);
    });
}

function showCenterGuide(id, title, rows, onClose, okLabel, parent) {
    document.getElementById(id)?.remove();
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "guide-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.innerHTML =
        `<div class="guide-card"><h4 class="guide-title"></h4><ul class="guide-list"></ul>` +
        `<button type="button" class="primary-button guide-ok">はじめる</button></div>`;
    overlay.querySelector(".guide-title").textContent = title;
    overlay.querySelector(".guide-ok").textContent = okLabel || t("はじめる");
    const ul = overlay.querySelector(".guide-list");
    rows.forEach(r => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="material-icons-round"></span><span class="guide-text"></span>`;
        li.children[0].textContent = r.icon;
        li.children[1].textContent = r.text;
        ul.appendChild(li);
    });
    overlay.querySelector(".guide-ok").addEventListener("click", () => {
        overlay.remove();
        if (onClose) onClose();
    });
    (parent || document.querySelector(".app-container") || document.body).appendChild(overlay);
}

function finishOnboarding() {
    document.getElementById("usage-guide")?.remove();
    writeOnboardingState({ done: true, finishedAt: new Date().toISOString() });
}

// force=true は「もう一度見る」
function startOnboarding(force) {
    if (!force) {
        if (readOnboardingState()) return;
    }
    showCenterGuide("usage-guide", t("使い方"), [
        { icon: "edit", text: t("予算を入れる") },
        { icon: "add_circle", text: t("支出を記録する") },
        { icon: "toll", text: t("記録でポイント → ガチャ・ショップへ") },
        { icon: "pets", text: t("肉球ボタンでマイルームを隠す／表示") },
        { icon: "favorite", text: t("1つの記録＝1ポイント。100まで貯めるといいことが起きるよ！") },
        { icon: "storage", text: t("メニューからCSVで保存") }
    ], finishOnboarding);
}

// 旧ステップ式ガイドの名残。今は何もしない。
function onboardingNotify() {}

// ==========================================
// マイペット（メイン画面）
// ==========================================
function applyRoomHidden(animated) {
    const sec = document.getElementById("room-section");
    const btn = document.getElementById("btn-toggle-room");
    const hidden = !!appPrefs.roomHidden;
    if (sec) {
        if (!animated) sec.classList.add("no-anim");
        sec.classList.toggle("is-hidden", hidden);
        sec.setAttribute("aria-hidden", hidden ? "true" : "false");
        if (!animated) requestAnimationFrame(() => requestAnimationFrame(() => sec.classList.remove("no-anim")));
    }
    if (btn) {
        btn.classList.toggle("is-off", hidden);
        btn.setAttribute("aria-pressed", hidden ? "true" : "false");
    }
    if (!hidden) setTimeout(centerRoomPreviewOnPet, animated ? 450 : 0);
}

function setupRoomToggle() {
    applyRoomHidden(false);
    const btn = document.getElementById("btn-toggle-room");
    btn?.addEventListener("click", () => {
        appPrefs.roomHidden = !appPrefs.roomHidden;
        savePrefs();
        btn.classList.remove("pop");
        void btn.offsetWidth;
        btn.classList.add("pop");
        applyRoomHidden(true);
        vibrate(10);
    });
}

// ==========================================
// 言語（… メニュー）
// ==========================================
function setupLanguageModal() {
    const modal = document.getElementById("modal-language");
    const list = document.getElementById("language-list");
    if (!modal || !list || !window.I18N) return;
    I18N.langs.forEach(l => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "more-item";
        b.innerHTML = `<span class="material-icons-round">${l.code === I18N.lang ? "radio_button_checked" : "radio_button_unchecked"}</span><span></span>`;
        b.children[1].textContent = l.label;
        b.addEventListener("click", () => I18N.setLang(l.code));
        list.appendChild(b);
    });
    document.getElementById("btn-open-language")?.addEventListener("click", () => modal.classList.add("open"));
    document.getElementById("btn-close-language")?.addEventListener("click", () => modal.classList.remove("open"));
}
document.addEventListener("DOMContentLoaded", () => {
    // Esc キーで、いちばん手前の画面から順に閉じる（PC向け）
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        const editor = document.getElementById("room-editor");
        if (editor?.classList.contains("open")) { document.getElementById("btn-close-room-editor")?.click(); return; }
    });
    setupLanguageModal();
    setupRoomToggle();
    renderAffection();
    // 画面サイズが変わっても、ペットが見える位置に保つ
    let resizeTimer = null;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(centerRoomPreviewOnPet, 150);
    });
    requestAnimationFrame(() => requestAnimationFrame(centerRoomPreviewOnPet));
    // すでにペットがいる人にも、使い方を一度だけ見せる
    setTimeout(() => {
        if (typeof roomData !== "undefined" && roomData && roomData.pet) startOnboarding(false);
    }, 900);
});

// ================================================================
// ▼ gacha.js（ガチャとコレクション）
// ================================================================
// ==========================================
// gacha.js — ガチャとコレクション（v2.17）
// ==========================================
// ・ログインボーナスや記録でためたポイントで、新しいペットと部屋（マップ）が手に入る
// ・「まだ持っていないもの」だけが出る（ダブりなし。お金のアプリなので引かされる感じを避ける）
// ・レア度で出やすさが違う（★ふつう 6 : ★★レア 3 : ★★★スーパーレア 1 の重み）
// ・手に入れたものは「コレクション」からいつでも切り替えられる
// ==========================================

const GACHA_COST = 1000;

const GACHA_RARITY = {
    1: { stars: "★",   label: t("ノーマル"),       weight: 6 },
    2: { stars: "★★",  label: t("レア"),           weight: 3 },
    3: { stars: "★★★", label: t("スーパーレア"),   weight: 1 }
};

const GACHA_POOL = [
    { kind: "pet", id: "neko",      rarity: 1 },
    { kind: "pet", id: "usagi",     rarity: 1 },
    { kind: "map", id: "washitsu",  rarity: 1 },
    { kind: "pet", id: "shiba",     rarity: 2 },
    { kind: "pet", id: "hamster",   rarity: 2 },
    { kind: "map", id: "seaside",   rarity: 2 },
    { kind: "pet", id: "panda",     rarity: 3 },
    { kind: "map", id: "nightloft", rarity: 3 },
    { kind: "map", id: "wallpaper_cute_pastel", rarity: 2 },
    { kind: "map", id: "wallpaper_modern_gray", rarity: 2 }
];

let gachaBusy = false;

// ------------------------------------------
// ロジック（画面に依存しない部分）
// ------------------------------------------
function gachaIsOwned(item) {
    return item.kind === "pet"
        ? roomData.ownedPets.includes(item.id)
        : roomData.ownedMaps.includes(item.id);
}

function gachaRemainingItems() {
    return GACHA_POOL.filter(it => !gachaIsOwned(it));
}

function gachaInfo(item) {
    if (item.kind === "pet") {
        const p = PET_CATALOG[item.id];
        return { label: p.label, img: PET_AWAKE_IMG[item.id], kindLabel: t("ペット") };
    }
    const m = MAP_CATALOG[item.id];
    return { label: m.label, img: m.img, kindLabel: "部屋" };
}

// 残りの景品から、レア度ごとの当たる確率（%）を出す
function gachaOdds(items) {
    const total = items.reduce((s, it) => s + GACHA_RARITY[it.rarity].weight, 0);
    const out = {};
    [1, 2, 3].forEach(r => {
        const w = items.filter(it => it.rarity === r).reduce((s, it) => s + GACHA_RARITY[it.rarity].weight, 0);
        out[r] = total > 0 ? (w / total) * 100 : 0;
    });
    return out;
}

function gachaPick(items, rand) {
    const rnd = typeof rand === "function" ? rand : Math.random;
    const total = items.reduce((s, it) => s + GACHA_RARITY[it.rarity].weight, 0);
    let t = rnd() * total;
    for (const it of items) {
        t -= GACHA_RARITY[it.rarity].weight;
        if (t < 0) return it;
    }
    return items[items.length - 1];
}

// 1回ひく。ポイントを引いて、持ち物に追加して保存するところまでを一度にやる
// （途中で画面を閉じても、ポイントだけ減って何も手に入らない、が起きないように）
function pullGacha(rand) {
    if (roomData.points < GACHA_COST) return { ok: false, error: t("ポイントが足りません") };
    const remaining = gachaRemainingItems();
    if (remaining.length === 0) return { ok: false, error: t("すべて集めました！") };

    const item = gachaPick(remaining, rand);
    roomData.points -= GACHA_COST;
    if (item.kind === "pet") {
        roomData.ownedPets.push(item.id);
        if (!roomData.petNames[item.id]) roomData.petNames[item.id] = PET_CATALOG[item.id].defaultName;
    } else {
        roomData.ownedMaps.push(item.id);
    }
    roomData.gacha.pulls = (roomData.gacha.pulls || 0) + 1;
    saveRoomData();
    renderCurrency();
    return { ok: true, item };
}

function equipPet(type, newName) {
    if (!PET_CATALOG[type] || !roomData.ownedPets.includes(type)) return false;
    const prev = roomData.pet;
    if (prev && prev.type !== type) roomData.petNames[prev.type] = prev.name;   // いまの子の名前は覚えておく
    if (newName) roomData.petNames[type] = String(newName).trim().slice(0, 12);
    const name = roomData.petNames[type] || petDefaultName(type);
    roomData.pet = {
        type, name,
        x: prev ? prev.x : 50,
        y: PET_FLOOR_Y,
        scale: prev ? prev.scale : 1
    };
    saveRoomData();
    renderRoomPreview();
    centerRoomPreviewOnPet();
    preloadPetSleepGif();
    return true;
}

function equipMap(id) {
    if (!MAP_CATALOG[id] || !roomData.ownedMaps.includes(id)) return false;
    roomData.mapId = id;
    saveRoomData();
    applyRoomMap();
    return true;
}

// ------------------------------------------
// 画面
// ------------------------------------------
function gEl(id) { return document.getElementById(id); }

function openGachaModal() {
    renderCurrency();
    renderGachaPane();
    renderCollection();
    switchGachaTab("pull");
    gEl("modal-gacha")?.classList.add("open");
}

function closeGachaModal() {
    if (gachaBusy) return;
    gEl("modal-gacha")?.classList.remove("open");
}

function switchGachaTab(tab) {
    const isPull = tab === "pull";
    gEl("gacha-pane-pull").style.display = isPull ? "" : "none";
    gEl("gacha-pane-collection").style.display = isPull ? "none" : "";
    gEl("tab-gacha-pull")?.classList.toggle("is-active", isPull);
    gEl("tab-gacha-collection")?.classList.toggle("is-active", !isPull);
    if (!isPull) renderCollection();
}

function renderGachaPane() {
    const remaining = gachaRemainingItems();
    const total = GACHA_POOL.length;
    const costEl = gEl("gacha-cost");
    if (costEl) costEl.textContent = GACHA_COST.toLocaleString();

    const remainEl = gEl("gacha-remain");
    if (remainEl) {
        remainEl.textContent = remaining.length === 0
            ? t("コンプリート！ すべてのペットと部屋を集めました。")
            : `まだ出会っていないもの：あと ${remaining.length} / ${total} 種`;
    }

    const oddsEl = gEl("gacha-odds");
    if (oddsEl) {
        oddsEl.innerHTML = "";
        if (remaining.length > 0) {
            const odds = gachaOdds(remaining);
            [3, 2, 1].forEach(r => {
                const n = remaining.filter(it => it.rarity === r).length;
                if (n === 0) return;
                const row = document.createElement("div");
                row.className = "gacha-odds-row";
                const left = document.createElement("span");
                left.textContent = `${GACHA_RARITY[r].stars} ${GACHA_RARITY[r].label}（${n}種）`;
                const right = document.createElement("strong");
                right.textContent = `${odds[r].toFixed(1)}%`;
                row.appendChild(left); row.appendChild(right);
                oddsEl.appendChild(row);
            });
        }
    }

    const btn = gEl("btn-gacha-pull");
    const status = gEl("gacha-status");
    if (btn) {
        if (remaining.length === 0) {
            btn.disabled = true; btn.textContent = t("コンプリート済み");
            if (status) status.textContent = "";
        } else if (roomData.points < GACHA_COST) {
            btn.disabled = true; btn.textContent = t("ガチャをひく");
            if (status) status.textContent = `あと ${(GACHA_COST - roomData.points).toLocaleString()}pt でひけます。ログインや記録でためよう！`;
        } else {
            btn.disabled = false; btn.textContent = `ガチャをひく（${GACHA_COST.toLocaleString()}pt）`;
            if (status) status.textContent = "";
        }
    }
}

function collectionCard(kind, id, owned, active) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `collection-card${owned ? "" : " is-locked"}${active ? " is-active" : ""}${kind === "map" ? " is-map" : ""}`;
    card.dataset.kind = kind; card.dataset.id = id;

    const img = document.createElement("img");
    img.alt = ""; img.draggable = false;
    img.src = kind === "pet" ? PET_AWAKE_IMG[id] : MAP_CATALOG[id].img;
    const label = document.createElement("span");
    label.className = "collection-label";
    const base = kind === "pet" ? PET_CATALOG[id].label : MAP_CATALOG[id].label;
    label.textContent = owned ? base : "？？？";
    card.appendChild(img); card.appendChild(label);

    if (active) {
        const badge = document.createElement("span");
        badge.className = "collection-badge";
        badge.textContent = t("つかっている");
        card.appendChild(badge);
    }
    const poolItem = GACHA_POOL.find(it => it.kind === kind && it.id === id);
    if (poolItem) {
        const stars = document.createElement("span");
        stars.className = `collection-stars r${poolItem.rarity}`;
        stars.textContent = GACHA_RARITY[poolItem.rarity].stars;
        card.appendChild(stars);
    }

    card.addEventListener("click", () => {
        if (!owned) { showToast("ガチャで手に入るよ"); return; }
        if (active) return;
        if (kind === "pet") equipPet(id); else equipMap(id);
        playPop(); vibrate(15);
        renderCollection();
    });
    return card;
}

function renderCollection() {
    const petsEl = gEl("collection-pets");
    const mapsEl = gEl("collection-maps");
    if (!petsEl || !mapsEl) return;
    petsEl.innerHTML = ""; mapsEl.innerHTML = "";

    Object.keys(PET_CATALOG).forEach(id => {
        const owned = roomData.ownedPets.includes(id);
        petsEl.appendChild(collectionCard("pet", id, owned, owned && roomData.pet && roomData.pet.type === id));
    });
    Object.keys(MAP_CATALOG).forEach(id => {
        const owned = roomData.ownedMaps.includes(id);
        mapsEl.appendChild(collectionCard("map", id, owned, owned && roomData.mapId === id));
    });

    const have = roomData.ownedPets.length + roomData.ownedMaps.length;
    const all = Object.keys(PET_CATALOG).length + Object.keys(MAP_CATALOG).length;
    const countEl = gEl("gacha-collection-count");
    if (countEl) countEl.textContent = `${have}/${all}`;
}

// ------------------------------------------
// 演出：カプセルがゆれる → ひらく → 結果カード
// ------------------------------------------
const CAPSULE_SVG = `
<svg class="gacha-capsule-svg" viewBox="0 0 120 120" aria-hidden="true">
  <g class="cap-bottom"><path d="M12 60 A48 48 0 0 0 108 60 Z" fill="#fff7ec" stroke="#191b1d" stroke-width="4"/></g>
  <g class="cap-top"><path d="M12 60 A48 48 0 0 1 108 60 Z" fill="#e8647a" stroke="#191b1d" stroke-width="4"/>
     <ellipse cx="40" cy="36" rx="12" ry="7" fill="#fff" opacity=".55" transform="rotate(-30 40 36)"/></g>
  <rect x="8" y="57" width="104" height="6" fill="#191b1d"/>
</svg>`;

function gachaSparkles(host, count) {
    for (let i = 0; i < count; i++) {
        const s = document.createElement("span");
        s.className = "gacha-spark";
        s.textContent = "✦";
        s.style.left = (8 + Math.random() * 84) + "%";
        s.style.top = (10 + Math.random() * 70) + "%";
        s.style.animationDelay = (Math.random() * 0.6) + "s";
        s.style.fontSize = (12 + Math.random() * 16) + "px";
        host.appendChild(s);
    }
}

function playGachaSequence(item) {
    const overlay = gEl("gacha-overlay");
    if (!overlay) return;
    gachaBusy = true;
    overlay.innerHTML = `<div class="gacha-stage">${CAPSULE_SVG}<p class="gacha-stage-text">ガチャッ…</p></div>`;
    overlay.className = "gacha-overlay show";

    let revealed = false;
    const timers = [];
    const reveal = () => {
        if (revealed) return;
        revealed = true;
        timers.forEach(clearTimeout);
        showGachaResult(item);
    };
    [0, 320, 640, 960].forEach((ms, i) => timers.push(setTimeout(() => { playTone(300 + i * 90, 0.07, "square", 0.06); vibrate(10); }, ms)));
    timers.push(setTimeout(() => overlay.querySelector(".gacha-stage")?.classList.add("is-opening"), 1250));
    timers.push(setTimeout(reveal, 1650));
    overlay.onclick = reveal;                   // タップでスキップ
}

function showGachaResult(item) {
    const overlay = gEl("gacha-overlay");
    if (!overlay) return;
    const info = gachaInfo(item);
    const rar = GACHA_RARITY[item.rarity];
    overlay.onclick = null;
    overlay.className = `gacha-overlay show r${item.rarity}`;
    overlay.innerHTML = "";

    const card = document.createElement("div");
    card.className = `gacha-result r${item.rarity}`;

    const stars = document.createElement("div"); stars.className = "gacha-result-stars"; stars.textContent = rar.stars;
    const sub = document.createElement("div"); sub.className = "gacha-result-sub"; sub.textContent = `${rar.label}／あたらしい${info.kindLabel}`;
    const badge = document.createElement("span"); badge.className = "gacha-new"; badge.textContent = "NEW!";
    const imgWrap = document.createElement("div"); imgWrap.className = `gacha-result-img ${item.kind}`;
    const img = document.createElement("img"); img.src = info.img; img.alt = ""; img.draggable = false;
    imgWrap.appendChild(img);
    const name = document.createElement("h3"); name.className = "gacha-result-name"; name.textContent = info.label;

    card.appendChild(badge); card.appendChild(stars); card.appendChild(sub); card.appendChild(imgWrap); card.appendChild(name);

    let input = null;
    if (item.kind === "pet") {
        const label = document.createElement("label"); label.className = "gacha-name-label"; label.textContent = t("名前をつけよう");
        input = document.createElement("input");
        input.type = "text"; input.id = "gacha-name-input"; input.className = "gacha-name-input";
        input.maxLength = 12; input.value = roomData.petNames[item.id] || petDefaultName(item.id); input.autocomplete = "off";
        card.appendChild(label); card.appendChild(input);
    }

    const actions = document.createElement("div"); actions.className = "gacha-result-actions";
    const finish = (equip) => {
        if (item.kind === "pet") {
            const nm = (input.value || "").trim() || petDefaultName(item.id);
            roomData.petNames[item.id] = nm.slice(0, 12);
            saveRoomData();
            if (equip) equipPet(item.id, nm);
        } else if (equip) {
            equipMap(item.id);
        }
        closeGachaOverlay();
    };
    const primary = document.createElement("button");
    primary.type = "button"; primary.className = "primary-button";
    primary.id = "btn-gacha-equip";
    primary.textContent = item.kind === "pet" ? "この子といっしょにくらす" : t("この部屋にお引っこし");
    primary.addEventListener("click", () => finish(true));
    const later = document.createElement("button");
    later.type = "button"; later.className = "text-cancel-button";
    later.id = "btn-gacha-later";
    later.textContent = t("あとで（コレクションに入れる）");
    later.addEventListener("click", () => finish(false));
    actions.appendChild(primary); actions.appendChild(later);
    card.appendChild(actions);

    overlay.appendChild(card);
    gachaSparkles(overlay, item.rarity === 3 ? 26 : item.rarity === 2 ? 14 : 7);

    // ファンファーレ（レア度が高いほど長い）
    const notes = item.rarity === 3 ? [784, 988, 1175, 1568, 1976] : item.rarity === 2 ? [660, 880, 1109] : [660, 880];
    notes.forEach((f, i) => setTimeout(() => playTone(f, 0.16, "triangle", 0.1), i * 110));
    vibrate(item.rarity === 3 ? 60 : 30);
}

function closeGachaOverlay() {
    const overlay = gEl("gacha-overlay");
    if (overlay) { overlay.className = "gacha-overlay"; overlay.innerHTML = ""; overlay.onclick = null; }
    gachaBusy = false;
    renderGachaPane();
    renderCollection();
    renderCurrency();
}

function onGachaPullClick() {
    if (gachaBusy) return;
    const res = pullGacha();
    if (!res.ok) {
        const status = gEl("gacha-status");
        if (status) status.textContent = res.error;
        return;
    }
    playGachaSequence(res.item);
}

document.addEventListener("DOMContentLoaded", () => {
    gEl("btn-open-gacha")?.addEventListener("click", openGachaModal);
    gEl("btn-close-gacha")?.addEventListener("click", closeGachaModal);
    gEl("btn-gacha-pull")?.addEventListener("click", onGachaPullClick);
    gEl("tab-gacha-pull")?.addEventListener("click", () => switchGachaTab("pull"));
    gEl("tab-gacha-collection")?.addEventListener("click", () => switchGachaTab("collection"));
});
