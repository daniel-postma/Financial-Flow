// Financial Flow — script.js
// Income/outflow tracker with optional Categories + recategorize from UI.
// LocalStorage persistence + export/import + mobile-friendly table cards.

(() => {
  const STORAGE_KEY = "financialFlowEntries_v1";

  // Canonical types (we still accept legacy "expense" on load/import/UI)
  const TYPE_INCOME = "income";
  const TYPE_OUTFLOW = "outflow";
  const LEGACY_EXPENSE = "expense";

  // Default category suggestions (users can type anything they want)
  const DEFAULT_CATEGORIES = [
    "Food",
    "Rent",
    "Transport",
    "Utilities",
    "Groceries",
    "Health",
    "Fun",
    "Shopping",
    "Subscriptions",
    "Gifts",
    "Travel",
    "Bills",
    "Salary",
    "Freelance",
    "Other",
  ];

  // ===== DOM =====
  const entryForm = document.getElementById("entryForm");
  const dateInput = document.getElementById("dateInput");
  const amountInput = document.getElementById("amountInput");
  const descInput = document.getElementById("descInput");
  const categoryInput = document.getElementById("categoryInput");

  const categoryDatalist = document.getElementById("categoryDatalist");

  const segButtons = Array.from(document.querySelectorAll(".seg-btn"));
  const todayBtn = document.getElementById("todayBtn");

  const periodSelect = document.getElementById("periodSelect");
  const refDateInput = document.getElementById("refDateInput");
  const jumpTodayBtn = document.getElementById("jumpTodayBtn");

  const incomeTotalEl = document.getElementById("incomeTotal");
  const expenseTotalEl = document.getElementById("expenseTotal"); // id can stay "expenseTotal"
  const netTotalEl = document.getElementById("netTotal");
  const countTotalEl = document.getElementById("countTotal");
  const rangeNoteEl = document.getElementById("rangeNote");

  const entriesTbody = document.getElementById("entriesTbody");
  const emptyState = document.getElementById("emptyState");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");

  const clearBtn = document.getElementById("clearBtn");
  const exportBtn = document.getElementById("exportBtn");
  const importInput = document.getElementById("importInput");

  // ===== STATE =====
  let entries = [];
  let activeType = TYPE_INCOME;

  // ===== HELPERS =====
  const pad2 = (n) => String(n).padStart(2, "0");

  function toISODate(d) {
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    return `${yyyy}-${mm}-${dd}`;
  }

  function parseISODate(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  function addDays(d, days) {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
  }

  function startOfISOWeek(d) {
    const x = startOfDay(d);
    const day = x.getDay(); // Sun=0..Sat=6
    const diff = (day === 0 ? -6 : 1) - day; // back to Monday
    return addDays(x, diff);
  }

  function boundsForPeriod(period, refDate) {
    const ref = startOfDay(refDate);

    if (period === "day") {
      const start = ref;
      const end = addDays(start, 1);
      return { start, end, label: `${toISODate(start)}` };
    }

    if (period === "week") {
      const start = startOfISOWeek(ref);
      const end = addDays(start, 7);
      const label = `${toISODate(start)} → ${toISODate(addDays(end, -1))}`;
      return { start, end, label };
    }

    if (period === "month") {
      const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
      const label = `${ref.getFullYear()}-${pad2(ref.getMonth() + 1)}`;
      return { start, end, label };
    }

    if (period === "year") {
      const start = new Date(ref.getFullYear(), 0, 1);
      const end = new Date(ref.getFullYear() + 1, 0, 1);
      const label = `${ref.getFullYear()}`;
      return { start, end, label };
    }

    return { start: null, end: null, label: "All time" };
  }

  function formatMoney(n) {
    const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
    return nf.format(Number(n) || 0);
  }

  function uid() {
    if (globalThis.crypto && typeof crypto.randomUUID === "function")
      return crypto.randomUUID();
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function normalizeCategory(cat) {
    return String(cat || "").trim();
  }

  function canonicalType(t) {
    if (t === TYPE_INCOME) return TYPE_INCOME;
    if (t === TYPE_OUTFLOW || t === LEGACY_EXPENSE) return TYPE_OUTFLOW;
    return TYPE_INCOME;
  }

  // ===== STORAGE =====
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      entries = Array.isArray(parsed) ? parsed : [];
    } catch {
      entries = [];
    }

    // Normalize + migrate legacy "expense" -> "outflow"
    entries = entries.map((e) => ({
      id: e.id || uid(),
      type: canonicalType(e.type),
      date: e.date || toISODate(new Date()),
      amount: Number(e.amount) || 0,
      desc: String(e.desc || "").slice(0, 80),
      category: normalizeCategory(e.category || ""),
      createdAt: Number(e.createdAt) || Date.now(),
    }));
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  // ===== UI STATE =====
  function setActiveType(type) {
    activeType = canonicalType(type);

    // support old HTML data-type="expense" OR new data-type="outflow"
    segButtons.forEach((btn) => {
      const bt = btn.dataset.type;
      const isForOutflow = bt === TYPE_OUTFLOW || bt === LEGACY_EXPENSE;
      const isActive =
        (activeType === TYPE_INCOME && bt === TYPE_INCOME) ||
        (activeType === TYPE_OUTFLOW && isForOutflow);

      btn.classList.toggle("is-active", isActive);
    });
  }

  // ===== CATEGORY SUGGESTIONS =====
  function getAllCategories() {
    const set = new Set(DEFAULT_CATEGORIES);
    for (const e of entries) {
      const c = normalizeCategory(e.category);
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderCategoryDatalist() {
    if (!categoryDatalist) return;
    const cats = getAllCategories();
    categoryDatalist.innerHTML = cats
      .map((c) => `<option value="${escapeHtml(c)}"></option>`)
      .join("");
  }

  // ===== FILTERING =====
  function getFilteredEntries() {
    const period = periodSelect.value;
    const refDate = parseISODate(refDateInput.value);
    const { start, end } = boundsForPeriod(period, refDate);

    const q = (searchInput.value || "").trim().toLowerCase();
    const sort = sortSelect.value;

    let filtered = entries.slice();

    // period filter
    if (start && end) {
      filtered = filtered.filter((e) => {
        const d = parseISODate(e.date);
        return d >= start && d < end;
      });
    }

    // search filter (desc + category)
    if (q) {
      filtered = filtered.filter((e) => {
        const hay = `${e.desc || ""} ${e.category || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    // sort
    filtered.sort((a, b) => {
      const da = parseISODate(a.date).getTime();
      const db = parseISODate(b.date).getTime();
      const aa = Number(a.amount) || 0;
      const ab = Number(b.amount) || 0;

      switch (sort) {
        case "dateAsc":
          return da - db;
        case "amountDesc":
          return ab - aa;
        case "amountAsc":
          return aa - ab;
        case "dateDesc":
        default:
          return db - da;
      }
    });

    return filtered;
  }

  function computeTotals(list) {
    let income = 0;
    let outflow = 0;

    for (const e of list) {
      const amt = Number(e.amount) || 0;
      if (e.type === TYPE_INCOME) income += amt;
      else outflow += amt;
    }

    return { income, outflow, net: income - outflow, count: list.length };
  }

  // ===== RENDER =====
  function renderSummary(filtered) {
    const period = periodSelect.value;
    const refDate = parseISODate(refDateInput.value);
    const { start, end, label } = boundsForPeriod(period, refDate);

    const totals = computeTotals(filtered);

    incomeTotalEl.textContent = formatMoney(totals.income);
    expenseTotalEl.textContent = formatMoney(totals.outflow);

    // IMPORTANT: remove "-" sign when net is negative (show absolute, color blue)
    const netIsProfit = totals.net >= 0;
    netTotalEl.textContent = netIsProfit
      ? formatMoney(totals.net)
      : formatMoney(Math.abs(totals.net));

    countTotalEl.textContent = String(totals.count);

    // Profit = green; Loss = blue
    netTotalEl.style.color = netIsProfit ? "var(--green)" : "var(--blue)";

    if (period === "all") {
      rangeNoteEl.textContent = "Showing: ALL TIME";
    } else if (start && end) {
      rangeNoteEl.textContent = `Showing: ${period.toUpperCase()} • ${label}`;
    } else {
      rangeNoteEl.textContent = `Showing: ${label}`;
    }
  }

  function makeCell(label, textOrNode, extraClass = "") {
    const td = document.createElement("td");
    if (extraClass) td.className = extraClass;
    td.setAttribute("data-label", label);

    if (textOrNode instanceof Node) td.appendChild(textOrNode);
    else td.textContent = String(textOrNode);

    return td;
  }

  function updateEntryCategory(id, newCategory) {
    const cat = normalizeCategory(newCategory);
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return;

    entries[idx].category = cat;
    save();
    renderCategoryDatalist();
    render();
  }

  function renderTable(filtered) {
    entriesTbody.innerHTML = "";
    emptyState.style.display = filtered.length ? "none" : "block";

    for (const e of filtered) {
      const tr = document.createElement("tr");

      tr.appendChild(makeCell("Date", e.date));
      tr.appendChild(makeCell("Description", e.desc));

      // Category (editable)
      const catInput = document.createElement("input");
      catInput.type = "text";
      catInput.value = e.category || "";
      catInput.placeholder = "—";
      catInput.className = "inline-input";
      catInput.setAttribute("list", "categoryDatalist");
      catInput.setAttribute("aria-label", "Edit category");

      catInput.addEventListener("change", () =>
        updateEntryCategory(e.id, catInput.value)
      );
      catInput.addEventListener("blur", () =>
        updateEntryCategory(e.id, catInput.value)
      );
      catInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          catInput.blur();
        }
      });

      tr.appendChild(makeCell("Category", catInput));

      // Type badge
      const badge = document.createElement("span");
      badge.className = `badge ${e.type}`;
      badge.textContent = e.type === TYPE_INCOME ? "Income" : "Outflow";
      tr.appendChild(makeCell("Type", badge));

      // Amount (IMPORTANT: no "-" prefix for outflow)
      const amtSpan = document.createElement("span");
      amtSpan.className = `amount ${e.type}`;
      amtSpan.textContent =
        (e.type === TYPE_INCOME ? "+ " : "") +
        formatMoney(Number(e.amount) || 0);
      tr.appendChild(makeCell("Amount", amtSpan, "right"));

      // Action
      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-ghost";
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => deleteEntry(e.id));
      tr.appendChild(makeCell("Action", delBtn, "right"));

      entriesTbody.appendChild(tr);
    }
  }

  function render() {
    const filtered = getFilteredEntries();
    renderSummary(filtered);
    renderTable(filtered);
  }

  // ===== CRUD =====
  function addEntry({ type, date, amount, desc, category }) {
    entries.push({
      id: uid(),
      type: canonicalType(type),
      date,
      amount: Number(amount),
      desc: String(desc || "")
        .trim()
        .slice(0, 80),
      category: normalizeCategory(category || ""),
      createdAt: Date.now(),
    });

    save();
    renderCategoryDatalist();
    render();
  }

  function deleteEntry(id) {
    entries = entries.filter((e) => e.id !== id);
    save();
    renderCategoryDatalist();
    render();
  }

  // ===== EXPORT / IMPORT =====
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportData() {
    const payload = {
      app: "Financial Flow",
      version: 3,
      exportedAt: new Date().toISOString(),
      entries,
    };
    downloadText(
      `financial-flow-${toISODate(new Date())}.json`,
      JSON.stringify(payload, null, 2)
    );
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result || ""));
        const incoming = Array.isArray(obj) ? obj : obj.entries;

        if (!Array.isArray(incoming)) {
          alert(
            "Import failed: JSON must be an array of entries or { entries: [...] }"
          );
          importInput.value = "";
          return;
        }

        const cleaned = incoming
          .filter(
            (e) =>
              e &&
              (e.type === TYPE_INCOME ||
                e.type === TYPE_OUTFLOW ||
                e.type === LEGACY_EXPENSE) &&
              typeof e.date === "string"
          )
          .map((e) => ({
            id: e.id || uid(),
            type: canonicalType(e.type),
            date: e.date,
            amount: Number(e.amount) || 0,
            desc: String(e.desc || "").slice(0, 80),
            category: normalizeCategory(e.category || ""),
            createdAt: Number(e.createdAt) || Date.now(),
          }));

        const map = new Map(entries.map((e) => [e.id, e]));
        for (const e of cleaned) map.set(e.id, e);
        entries = Array.from(map.values());

        save();
        renderCategoryDatalist();
        render();
      } catch {
        alert("Import failed: invalid JSON file.");
      } finally {
        importInput.value = "";
      }
    };
    reader.readAsText(file);
  }

  // ===== EVENTS =====
  segButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveType(btn.dataset.type));
  });

  todayBtn.addEventListener("click", () => {
    dateInput.value = toISODate(new Date());
  });

  jumpTodayBtn.addEventListener("click", () => {
    refDateInput.value = toISODate(new Date());
    render();
  });

  entryForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const date = dateInput.value;
    const desc = descInput.value;
    const amount = Number(amountInput.value);
    const category = categoryInput ? categoryInput.value : "";

    if (!date) return alert("Please select a date.");
    if (!String(desc).trim()) return alert("Please enter a description.");
    if (!Number.isFinite(amount) || amount <= 0)
      return alert("Amount must be a positive number.");

    addEntry({ type: activeType, date, amount, desc, category });

    // keep date for fast repeated entries; clear amount/desc always
    amountInput.value = "";
    descInput.value = "";

    // IMPORTANT: clear category after EVERY add (explicit + mobile friendly)
    if (categoryInput) {
      categoryInput.blur();
      categoryInput.value = "";
      categoryInput.dispatchEvent(new Event("input", { bubbles: true }));
      categoryInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    descInput.focus();
  });

  periodSelect.addEventListener("change", render);
  refDateInput.addEventListener("change", render);
  searchInput.addEventListener("input", render);
  sortSelect.addEventListener("change", render);

  clearBtn.addEventListener("click", () => {
    const ok = confirm("Clear ALL entries from this device?");
    if (!ok) return;
    entries = [];
    save();
    renderCategoryDatalist();
    render();
  });

  exportBtn.addEventListener("click", exportData);

  importInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importData(file);
  });

  // ===== INIT =====
  function init() {
    load();

    const todayISO = toISODate(new Date());
    dateInput.value = todayISO;
    refDateInput.value = todayISO;

    setActiveType(TYPE_INCOME);
    renderCategoryDatalist();
    render();
  }

  init();
})();
