const state = {
  status: {},
  activity: { summary: {}, added: [], closed: [], actions: [] },
  monitor: [],
  sort: {
    active: { key: "entry_date", type: "date", dir: "desc" },
    closed: { key: "closed_exit_date", type: "date", dir: "desc" },
  },
};

const $ = (id) => document.getElementById(id);

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

async function fetchJson(path, fallback) {
  const cacheBust = path.includes("?") ? "&" : "?";
  const response = await fetch(`${path}${cacheBust}v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) return fallback;
  return response.json();
}

function fmt(value, digits = 2) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) {
    return "NA";
  }
  return Number(value).toFixed(digits);
}

function fmtInt(value) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) {
    return "NA";
  }
  return String(Math.round(Number(value)));
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function td(value, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = value === null || value === undefined || value === "" ? "NA" : String(value);
  return cell;
}

function pill(label, kind = "") {
  const el = document.createElement("span");
  el.className = `pill ${kind}`.trim();
  el.textContent = label || "NA";
  return el;
}

function button(label, onClick) {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}

function actionKind(value) {
  const text = String(value || "");
  if (text === "HOLD" || text.startsWith("PASS")) return "good";
  if (text.includes("EXIT") || text.includes("STOP") || text.includes("REJECT") || text === "ERROR") return "bad";
  return "watch";
}

function rowClassForAction(value) {
  const text = String(value || "");
  if (text === "HOLD") return "hold";
  if (text === "STOP HIT") return "stop";
  if (text === "EXIT SIGNAL") return "exit";
  return "";
}

function firstPresent(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? "";
}

function sortValue(row, key) {
  if (key === "closed_exit_date") return firstPresent(row.exit_date, row.latest_date);
  if (key === "closed_exit_price") return firstPresent(row.exit_price, row.latest_close);
  if (key === "closed_return_pct") return firstPresent(row.realized_return_pct, row.return_pct);
  if (key === "closed_reason") return firstPresent(row.close_reason, row.reason);
  return row[key];
}

function comparable(value, type) {
  if (type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (type === "date") {
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  const text = String(value ?? "").trim().toLowerCase();
  return text || null;
}

function sortRows(view, rows) {
  const cfg = state.sort[view];
  if (!cfg) return rows;
  const direction = cfg.dir === "desc" ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const left = comparable(sortValue(a, cfg.key), cfg.type);
    const right = comparable(sortValue(b, cfg.key), cfg.type);
    if (left === null && right === null) return Number(a.rank || 0) - Number(b.rank || 0);
    if (left === null) return 1;
    if (right === null) return -1;
    let cmp = 0;
    if (typeof left === "number" && typeof right === "number") {
      cmp = left - right;
    } else {
      cmp = String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
    }
    if (cmp === 0) cmp = Number(a.rank || 0) - Number(b.rank || 0);
    return cmp * direction;
  });
}

function updateSortHeaders(tableId, view) {
  const cfg = state.sort[view];
  document.querySelectorAll(`#${tableId} th[data-sort]`).forEach((th) => {
    const isActive = th.dataset.sort === cfg.key;
    th.classList.toggle("sorted", isActive);
    th.dataset.sortDir = isActive ? cfg.dir : "";
    th.setAttribute("aria-sort", isActive ? (cfg.dir === "desc" ? "descending" : "ascending") : "none");
  });
}

function bindSortHeaders(tableId, view, render) {
  document.querySelectorAll(`#${tableId} th[data-sort]`).forEach((th) => {
    th.tabIndex = 0;
    th.setAttribute("role", "button");
    th.setAttribute("aria-sort", "none");
    const applySort = () => {
      const key = th.dataset.sort;
      const type = th.dataset.sortType || "text";
      const current = state.sort[view];
      state.sort[view] = {
        key,
        type,
        dir: current.key === key && current.dir === "asc" ? "desc" : "asc",
      };
      render();
    };
    th.addEventListener("click", applySort);
    th.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        applySort();
      }
    });
  });
  updateSortHeaders(tableId, view);
}

function showTab(name) {
  document.querySelectorAll(".tab").forEach((el) => el.classList.toggle("active", el.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((el) => el.classList.remove("active"));
  $(`${name}Tab`).classList.add("active");
}

function updateSummary() {
  const status = state.status || {};
  const activity = state.activity || {};
  const activitySummary = activity.summary || {};
  const monitor = status.monitor || {};
  const prediction = status.prediction || {};
  const universe = status.universe || {};

  $("subtitle").textContent = `Automated monitor from ${prediction.generated_at || status.generated_at || "NA"}`;
  $("lastUpdated").textContent = `Updated: ${status.generated_at || "NA"}`;
  $("latestData").textContent = `Data: ${status.latest_data_date || "NA"}`;
  $("metricActive").textContent = `${monitor.active || 0}`;
  $("metricActions").textContent = `${monitor.hold || 0} / ${monitor.exit_signal || 0} / ${monitor.stop_hit || 0}`;
  $("metricPredictions").textContent = `${activitySummary.added || 0} / ${activitySummary.closed || 0}`;
  $("metricUniverse").textContent = `${universe.stocks || 0} + ${universe.indices || 0}`;

  $("activitySummary").textContent =
    `Data ${activity.latest_data_date || status.latest_data_date || "NA"} | Scan ${activity.scan_date || "NA"} | ` +
    `Added ${activitySummary.added || 0} | Closed ${activitySummary.closed || 0} | Alerts ${activitySummary.actions || 0}`;
  $("activeSummary").textContent =
    `Active ${monitor.active || 0} | HOLD ${monitor.hold || 0} | EXIT ${monitor.exit_signal || 0} | STOP ${monitor.stop_hit || 0}`;
  $("closedSummary").textContent = `Closed ${(state.monitor || []).filter((row) => row.status === "CLOSED").length}`;
}

function renderActivityTable(tableId, rows, renderRow, emptyText, colSpan) {
  const body = $(tableId).querySelector("tbody");
  body.replaceChildren();
  for (const row of rows) {
    body.appendChild(renderRow(row));
  }
  if (!rows.length) {
    const tr = document.createElement("tr");
    const empty = td(emptyText);
    empty.colSpan = colSpan;
    tr.appendChild(empty);
    body.appendChild(tr);
  }
}

function renderActivity() {
  const activity = state.activity || {};
  const added = activity.added || [];
  const closed = activity.closed || [];
  const actions = activity.actions || [];

  $("activityAddedCount").textContent = `${added.length}`;
  $("activityClosedCount").textContent = `${closed.length}`;
  $("activityActionCount").textContent = `${actions.length}`;
  $("activityActionBlock").classList.toggle("muted-block", !actions.length);

  renderActivityTable(
    "activityAddedTable",
    added,
    (row) => {
      const tr = document.createElement("tr");
      tr.className = rowClassForAction(row.action);
      tr.append(
        td(row.symbol),
        td(row.strategy_label),
        td(row.entry_date),
        td(fmt(row.entry_price), "numeric"),
        td(fmt(row.latest_close), "numeric"),
        td(fmt(row.return_pct), "numeric"),
      );
      const tools = document.createElement("td");
      tools.appendChild(button("Chart", () => loadChart(row.id)));
      tr.appendChild(tools);
      return tr;
    },
    "No trades were added in the latest run.",
    7,
  );

  renderActivityTable(
    "activityClosedTable",
    closed,
    (row) => {
      const tr = document.createElement("tr");
      tr.className = rowClassForAction(row.action);
      tr.append(
        td(row.symbol),
        td(row.strategy_label),
        td(row.entry_date),
        td(row.exit_date || row.latest_date || "NA"),
        td(fmt(row.exit_price || row.latest_close), "numeric"),
        td(fmt(row.realized_return_pct || row.return_pct), "numeric"),
        td(row.close_reason || row.reason || "NA", "reason"),
      );
      const tools = document.createElement("td");
      tools.appendChild(button("Chart", () => loadChart(row.id)));
      tr.appendChild(tools);
      return tr;
    },
    "No trades were closed on the latest data date.",
    8,
  );

  renderActivityTable(
    "activityActionTable",
    actions,
    (row) => {
      const tr = document.createElement("tr");
      tr.className = rowClassForAction(row.action);
      tr.append(td(row.symbol), td(row.strategy_label), td(row.entry_date));
      const action = document.createElement("td");
      action.appendChild(pill(row.action, actionKind(row.action)));
      tr.appendChild(action);
      tr.appendChild(td(row.reason || "NA", "reason"));
      const tools = document.createElement("td");
      tools.appendChild(button("Chart", () => loadChart(row.id)));
      tr.appendChild(tools);
      return tr;
    },
    "No open exit or stop alerts.",
    6,
  );
}

function renderActive() {
  const body = $("activeTable").querySelector("tbody");
  body.replaceChildren();
  const needle = $("activeSearch").value.trim().toLowerCase();
  const rows = sortRows("active", state.monitor.filter((row) => {
    if (String(row.status || "").toUpperCase() !== "ACTIVE") return false;
    if (!needle) return true;
    return `${row.symbol} ${row.strategy_label} ${row.action} ${row.reason}`.toLowerCase().includes(needle);
  }));
  updateSortHeaders("activeTable", "active");

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.className = rowClassForAction(row.action);
    tr.append(
      td(row.rank),
      td(row.symbol),
      td(row.strategy_label),
      td(row.entry_date),
      td(fmt(row.entry_price), "numeric"),
      td(row.latest_date),
      td(fmt(row.latest_close), "numeric"),
      td(fmt(row.return_pct), "numeric"),
      td(row.bars_held, "numeric"),
      td(row.stop_text || "NA"),
    );
    const action = document.createElement("td");
    action.appendChild(pill(row.action, actionKind(row.action)));
    tr.appendChild(action);
    const reason = td(row.reason || "", "reason");
    reason.title = row.reason || "";
    tr.appendChild(reason);
    const tools = document.createElement("td");
    tools.appendChild(button("Chart", () => loadChart(row.id)));
    tr.appendChild(tools);
    body.appendChild(tr);
  }

  if (!rows.length) {
    const tr = document.createElement("tr");
    const empty = td("No active trades match the current search.");
    empty.colSpan = 13;
    tr.appendChild(empty);
    body.appendChild(tr);
  }
}

function renderClosed() {
  const body = $("closedTable").querySelector("tbody");
  body.replaceChildren();
  const needle = $("closedSearch").value.trim().toLowerCase();
  const rows = sortRows("closed", state.monitor.filter((row) => {
    if (String(row.status || "").toUpperCase() !== "CLOSED") return false;
    if (!needle) return true;
    return `${row.symbol} ${row.strategy_label} ${row.close_reason} ${row.reason}`.toLowerCase().includes(needle);
  }));
  updateSortHeaders("closedTable", "closed");

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.append(
      td(row.rank),
      td(row.symbol),
      td(row.strategy_label),
      td(row.entry_date),
      td(row.exit_date || row.latest_date || "NA"),
      td(fmt(row.entry_price), "numeric"),
      td(fmt(row.exit_price || row.latest_close), "numeric"),
      td(fmt(row.realized_return_pct || row.return_pct), "numeric"),
      td(row.close_reason || row.reason || "NA", "reason"),
    );
    const tools = document.createElement("td");
    tools.appendChild(button("Chart", () => loadChart(row.id)));
    tr.appendChild(tools);
    body.appendChild(tr);
  }

  if (!rows.length) {
    const tr = document.createElement("tr");
    const empty = td("No closed trades match the current search.");
    empty.colSpan = 10;
    tr.appendChild(empty);
    body.appendChild(tr);
  }
}

async function loadChart(id) {
  showTab("chart");
  $("chartTitle").textContent = "Loading chart";
  $("chartSummary").textContent = "Reading prebuilt trade chart data.";
  const payload = await fetchJson(`./data/charts/${encodeURIComponent(id)}.json`, null);
  if (!payload) {
    $("chartTitle").textContent = "Chart unavailable";
    $("chartSummary").textContent = "This trade did not have a prebuilt chart in the latest Pages build.";
    drawEmptyChart("No chart data available");
    return;
  }
  renderChart(payload);
}

function renderChart(payload) {
  const trade = payload.trade || {};
  $("chartTitle").textContent = `${trade.symbol || "Trade"} | ${trade.strategy_label || trade.strategy_key || ""}`;
  $("chartSummary").textContent =
    `${trade.action || trade.monitor_action || "WATCH"} | Entry ${trade.entry_date || "NA"} @ ${fmt(trade.entry_price)} | ` +
    `Latest ${trade.latest_date || "NA"} @ ${fmt(trade.latest_close)} | Return ${fmt(trade.return_pct)}%`;
  renderFacts(payload);
  drawTradeChart(payload);
}

function labelForColumn(col) {
  const raw = String(col || "");
  if (raw === "Close") return "Close";
  return raw
    .replace(/^donchian_/, "")
    .replaceAll("_", " ")
    .replace(/\b(sma|ema|rsi|atr|macd)\b/gi, (match) => match.toUpperCase())
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function chartWatchText(text) {
  return String(text || "")
    .replace(/^Adds a lower panel with /i, "Watch ")
    .replace(/^Adds /i, "Watch ")
    .replace(/^Uses /i, "Watch ")
    .replace(/\.$/, "");
}

function uniqueValues(items) {
  return [...new Set(items.filter(Boolean))];
}

function metricRows(columns, point) {
  if (!columns.length) return '<p class="fact-text">No extra indicator values for this strategy.</p>';
  return `
    <dl>
      ${columns
        .map((col) => `<dt>${escapeHtml(labelForColumn(col))}</dt><dd>${escapeHtml(fmt(point[col], 4))}</dd>`)
        .join("")}
    </dl>
  `;
}

function renderFacts(payload) {
  const trade = payload.trade || {};
  const strategy = payload.strategy || {};
  const metrics = payload.metrics || {};
  const points = payload.points || [];
  const entryPoint = points[0] || {};
  const latest = points.at(-1) || {};
  const indicatorColumns = uniqueValues(["Close", ...(payload.indicator_columns || []), ...(payload.stop_columns || [])]);
  const description = strategy.description || trade.strategy_label || trade.strategy_key || "Strategy details unavailable.";
  const watch = chartWatchText(strategy.indicator_description || "");
  $("chartFacts").innerHTML = `
    <section class="fact-section">
      <h3>Status</h3>
      <dl>
        <dt>Value Point</dt><dd>Latest available bar</dd>
        <dt>Action</dt><dd>${escapeHtml(trade.action || trade.monitor_action || "NA")}</dd>
        <dt>Reason</dt><dd>${escapeHtml(trade.reason || trade.monitor_reason || "NA")}</dd>
        <dt>Bars Held</dt><dd>${escapeHtml(trade.bars_held ?? "NA")}</dd>
        <dt>Manual Stop</dt><dd>${escapeHtml(fmt(payload.manual_stop_price))}</dd>
        <dt>Win Rate</dt><dd>${escapeHtml(fmt(metrics.win_rate_pct))}%</dd>
        <dt>Avg Trade</dt><dd>${escapeHtml(fmt(metrics.avg_trade_pct))}%</dd>
      </dl>
    </section>
    <section class="fact-section">
      <h3>Strategy Guide</h3>
      <p class="fact-text">${escapeHtml(description)}</p>
      <p class="fact-text">${escapeHtml(watch || "Watch price, stop levels, and the current action.")}</p>
    </section>
    <section class="fact-section">
      <h3>Latest Indicator Values</h3>
      ${metricRows(indicatorColumns, latest)}
    </section>
    <section class="fact-section">
      <h3>Entry Indicator Values</h3>
      ${metricRows(indicatorColumns, entryPoint)}
    </section>
  `;
}

function drawEmptyChart(text) {
  const canvas = $("tradeChart");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#657068";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText(text, 30, 44);
}

function drawTradeChart(payload) {
  const canvas = $("tradeChart");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(680, rect.width || 1100);
  const height = 460;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const points = payload.points || [];
  const closes = points.map((p) => Number(p.Close)).filter((v) => Number.isFinite(v));
  if (!points.length || !closes.length) {
    drawEmptyChart("No chart points available");
    return;
  }

  const priceRef = closes.at(-1) || closes[0];
  const priceLikeCols = (payload.indicator_columns || []).filter((col) => {
    const vals = points.map((p) => Number(p[col])).filter((v) => Number.isFinite(v));
    if (!vals.length) return false;
    const mid = vals[Math.floor(vals.length / 2)];
    return Math.abs(mid) >= priceRef * 0.15 && Math.abs(mid) <= priceRef * 3;
  });
  const stopCols = payload.stop_columns || [];
  const allPriceValues = [...closes, Number(payload.manual_stop_price)]
    .concat(...priceLikeCols.map((col) => points.map((p) => Number(p[col]))))
    .concat(...stopCols.map((col) => points.map((p) => Number(p[col]))))
    .filter((v) => Number.isFinite(v));

  let yMin = Math.min(...allPriceValues);
  let yMax = Math.max(...allPriceValues);
  const pad = Math.max((yMax - yMin) * 0.12, yMax * 0.015);
  yMin -= pad;
  yMax += pad;

  const margin = { top: 24, right: 150, bottom: 52, left: 62 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const x = (idx) => margin.left + (points.length <= 1 ? 0 : (idx / (points.length - 1)) * plotW);
  const y = (value) => margin.top + ((yMax - value) / (yMax - yMin)) * plotH;

  ctx.strokeStyle = "#d9dfd6";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#657068";
  ctx.font = "12px system-ui, sans-serif";
  for (let i = 0; i <= 4; i += 1) {
    const gy = margin.top + (i / 4) * plotH;
    ctx.beginPath();
    ctx.moveTo(margin.left, gy);
    ctx.lineTo(width - margin.right, gy);
    ctx.stroke();
    const value = yMax - (i / 4) * (yMax - yMin);
    ctx.fillText(fmt(value), 8, gy + 4);
  }

  const labelCount = Math.min(6, points.length);
  for (let i = 0; i < labelCount; i += 1) {
    const idx = Math.round((i / Math.max(1, labelCount - 1)) * (points.length - 1));
    ctx.fillText(points[idx].date.slice(5), x(idx) - 16, height - 22);
  }

  const placedLabels = [];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function lastFinitePoint(values) {
    for (let idx = values.length - 1; idx >= 0; idx -= 1) {
      const value = Number(values[idx]);
      if (Number.isFinite(value)) return { idx, value };
    }
    return null;
  }

  function labelY(baseY) {
    let nextY = clamp(baseY, margin.top + 10, height - margin.bottom - 10);
    for (let guard = 0; guard < 10; guard += 1) {
      if (!placedLabels.some((existing) => Math.abs(existing - nextY) < 14)) break;
      nextY = clamp(nextY + 14, margin.top + 10, height - margin.bottom - 10);
    }
    placedLabels.push(nextY);
    return nextY;
  }

  function line(values, color, dash = [], label = "") {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.7;
    ctx.setLineDash(dash);
    ctx.beginPath();
    let started = false;
    values.forEach((value, idx) => {
      if (!Number.isFinite(value)) return;
      if (!started) {
        ctx.moveTo(x(idx), y(value));
        started = true;
      } else {
        ctx.lineTo(x(idx), y(value));
      }
    });
    ctx.stroke();
    const finalPoint = label ? lastFinitePoint(values) : null;
    if (finalPoint) {
      const ly = labelY(y(finalPoint.value));
      const startX = x(finalPoint.idx);
      const labelX = width - margin.right + 10;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(startX, y(finalPoint.value));
      ctx.lineTo(labelX - 5, ly);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(label, labelX, ly + 4);
    }
    ctx.restore();
  }

  line(points.map((p) => Number(p.Close)), "#246a9f", [], "Close");
  const colors = ["#167247", "#a06a12", "#7256a6", "#58656f"];
  priceLikeCols.slice(0, 4).forEach((col, idx) => {
    line(points.map((p) => Number(p[col])), colors[idx % colors.length], [5, 4], labelForColumn(col));
  });
  stopCols.forEach((col) => {
    line(points.map((p) => Number(p[col])), "#b43d35", [6, 5], labelForColumn(col));
  });

  const manualStop = Number(payload.manual_stop_price);
  if (Number.isFinite(manualStop)) {
    ctx.save();
    ctx.strokeStyle = "#b43d35";
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(62, y(manualStop));
    ctx.lineTo(width - 24, y(manualStop));
    ctx.stroke();
    ctx.fillStyle = "#b43d35";
    const ly = labelY(y(manualStop));
    ctx.fillText(`Manual Stop ${fmt(manualStop)}`, width - margin.right + 10, ly + 4);
    ctx.restore();
  }

  const lastIdx = points.length - 1;
  const lastClose = Number(points[lastIdx].Close);
  ctx.fillStyle = "#17201b";
  ctx.beginPath();
  ctx.arc(x(lastIdx), y(lastClose), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText(fmt(lastClose), Math.max(62, x(lastIdx) - 40), y(lastClose) - 8);
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((el) => {
    el.addEventListener("click", () => showTab(el.dataset.tab));
  });
  bindSortHeaders("activeTable", "active", renderActive);
  bindSortHeaders("closedTable", "closed", renderClosed);
  $("activeSearch").addEventListener("input", renderActive);
  $("closedSearch").addEventListener("input", renderClosed);
}

async function boot() {
  bindEvents();
  const [status, activity, monitor] = await Promise.all([
    fetchJson("./data/status.json", {}),
    fetchJson("./data/latest_activity.json", { summary: {}, added: [], closed: [], actions: [] }),
    fetchJson("./data/latest_monitor.json", { rows: [], summary: {} }),
  ]);
  state.status = status || {};
  state.activity = activity || { summary: {}, added: [], closed: [], actions: [] };
  state.monitor = monitor.rows || [];
  updateSummary();
  renderActivity();
  renderActive();
  renderClosed();
}

boot().catch((err) => {
  showToast(err.message || "Dashboard failed to load");
  drawEmptyChart("Dashboard failed to load");
});
