(() => {
  const STORAGE_KEY = "financialFlowEntries_v1";

  // Elements
  const entryForm = document.getElementById("entryForm");
  const dateInput = document.getElementById("dateInput");
  const amountInput = document.getElementById("amountInput");
  const descInput = document.getElementById("descInput");

  const segButtons = Array.from(document.querySelectorAll(".seg-btn"));
  const todayBtn = document.getElementById("todayBtn");

  const periodSelect = document.getElementById("periodSelect");
  const refDateInput = document.getElementById("refDateInput");
  const jumpTodayBtn = document.getElementById("jumpTodayBtn");

  const incomeTotalEl = document.getElementById("incomeTotal");
  const expenseTotalEl = document.getElementById("expenseTotal");
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

  // State
  let entries = [];
  let activeType = "income";

  // Helpers
  const pad2 = (n) => String(n).padStart(2, "0");

  function toISODate(d) {
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    return `${yyyy}-${mm}-${dd}`;
  }

  function parseISODate(iso) {
    // safe parse "YYYY-MM-DD" into a local Date at midnight
    const [y, m, d] = iso.split("-").map(Number);
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
    // Monday start
    const x = startOfDay(d);
    const day = x.getDay(); // Sun=0 ... Sat=6
    const diff = (day === 0 ? -6 : 1) - day; // move back to Monday
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
    // simple, locale-friendly number formatting (no forced currency)
    const nf = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    });
    return nf.format(n);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      entries = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(entries)) entries = [];
    } catch {
      entries = [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  function setActiveType(type) {
    activeType = type;
    segButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.type === type);
    });
  }

  function getFilteredEntries() {
    const period = periodSelect.value;
    const refDate = parseISODate(refDateInput.value);
    const { start, end } = boundsForPeriod(period, refDate);

    const q = (searchInput.value || "").trim().toLowerCase();

    let filtered = entries.slice();

    // period filter
    if (start && end) {
      filtered = filtered.filter((e) => {
        const d = parseISODate(e.date);
        return d >= start && d < end;
      });
    }

    // search filter
    if (q) {
      filtered = filtered.filter((e) =>
        (e.desc || "").toLowerCase().includes(q)
      );
    }

    // sort
    const sort = sortSelect.value;
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

  function computeTotals(filtered) {
    let income = 0;
    let expense = 0;

    for (const e of filtered) {
      const amt = Number(e.amount) || 0;
      if (e.type === "income") income += amt;
      else expense += amt;
    }

    return {
      income,
      expense,
      net: income - expense,
      count: filtered.length,
    };
  }

  function renderSummary(filtered) {
    const period = periodSelect.value;
    const refDate = parseISODate(refDateInput.value);
    const { start, end, label } = boundsForPeriod(period, refDate);

    const totals = computeTotals(filtered);

    incomeTotalEl.textContent = formatMoney(totals.income);
    expenseTotalEl.textContent = formatMoney(totals.expense);

    // Net styling: green if positive, red if negative
    netTotalEl.textContent = formatMoney(totals.net);
    netTotalEl.style.color = totals.net >= 0 ? "var(--green)" : "var(--danger)";

    countTotalEl.textContent = String(totals.count);

    if (period === "all") {
      rangeNoteEl.textContent = `Showing: All time`;
    } else if (start && end) {
      rangeNoteEl.textContent = `Showing: ${period.toUpperCase()} • ${label}`;
    } else {
      rangeNoteEl.textContent = `Showing: ${label}`;
    }
  }

  function renderTable(filtered) {
    entriesTbody.innerHTML = "";

    emptyState.style.display = filtered.length ? "none" : "block";

    for (const e of filtered) {
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      tdDate.textContent = e.date;

      const tdDesc = document.createElement("td");
      tdDesc.textContent = e.desc;

      const tdType = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = `badge ${e.type}`;
      badge.textContent = e.type === "income" ? "Income" : "Expense";
      tdType.appendChild(badge);

      const tdAmt = document.createElement("td");
      tdAmt.className = "right";
      const amtSpan = document.createElement("span");
      amtSpan.className = `amount ${e.type}`;
      amtSpan.textContent =
        (e.type === "income" ? "+ " : "- ") +
        formatMoney(Number(e.amount) || 0);
      tdAmt.appendChild(amtSpan);

      const tdAction = document.createElement("td");
      tdAction.className = "right";
      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-ghost";
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => deleteEntry(e.id));
      tdAction.appendChild(delBtn);

      tr.appendChild(tdDate);
      tr.appendChild(tdDesc);
      tr.appendChild(tdType);
      tr.appendChild(tdAmt);
      tr.appendChild(tdAction);

      entriesTbody.appendChild(tr);
    }
  }

  function render() {
    const filtered = getFilteredEntries();
    renderSummary(filtered);
    renderTable(filtered);
  }

  function addEntry({ type, date, amount, desc }) {
    const entry = {
      id:
        crypto?.randomUUID?.() ||
        String(Date.now()) + Math.random().toString(16).slice(2),
      type,
      date,
      amount: Number(amount),
      desc: desc.trim(),
      createdAt: Date.now(),
    };

    entries.push(entry);
    save();
    render();
  }

  function deleteEntry(id) {
    entries = entries.filter((e) => e.id !== id);
    save();
    render();
  }

  // Export / Import
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
      version: 1,
      exportedAt: new Date().toISOString(),
      entries,
    };
    downloadText(
      `financial-flow-export-${toISODate(new Date())}.json`,
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
          return;
        }

        // Minimal validation/sanitize
        const cleaned = incoming
          .filter(
            (e) =>
              e &&
              (e.type === "income" || e.type === "expense") &&
              typeof e.date === "string"
          )
          .map((e) => ({
            id:
              e.id ||
              crypto?.randomUUID?.() ||
              String(Date.now()) + Math.random().toString(16).slice(2),
            type: e.type,
            date: e.date,
            amount: Number(e.amount) || 0,
            desc: String(e.desc || "").slice(0, 80),
            createdAt: Number(e.createdAt) || Date.now(),
          }));

        // merge by id (prefer imported)
        const map = new Map(entries.map((e) => [e.id, e]));
        for (const e of cleaned) map.set(e.id, e);
        entries = Array.from(map.values());

        save();
        render();
      } catch {
        alert("Import failed: invalid JSON file.");
      } finally {
        importInput.value = "";
      }
    };
    reader.readAsText(file);
  }

  // Events
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

    if (!date) return alert("Please select a date.");
    if (!desc.trim()) return alert("Please enter a description.");
    if (!Number.isFinite(amount) || amount <= 0)
      return alert("Amount must be a positive number.");

    addEntry({ type: activeType, date, amount, desc });

    // nice reset: keep date, clear amount/desc
    amountInput.value = "";
    descInput.value = "";
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
    render();
  });

  exportBtn.addEventListener("click", exportData);

  importInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importData(file);
  });

  // Init
  function init() {
    load();

    const today = new Date();
    dateInput.value = toISODate(today);
    refDateInput.value = toISODate(today);

    setActiveType("income");
    render();
  }

  init();
})();
