/* Reinigungs- und Wartungsliste – Editor */
(function () {
  "use strict";

  const STORAGE_KEY = "wartungsliste-state";
  const STORAGE_VERSION = 1;

  let currentZoom = null; // null = auto-fit
  let persistTimer = null;

  function formatDateDE(dateObj) {
    const d = String(dateObj.getDate()).padStart(2, "0");
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const y = dateObj.getFullYear();
    return `${d}.${m}.${y}`;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatRichText(str) {
    const escaped = escapeHtml(str);
    return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function createDefaultState() {
    return {
      mainTitle: "REINIGUNGS- UND WARTUNGSLISTE",
      subTitle: "Täglicher / Periodischer Arbeitsplan",
      datum: formatDateDE(new Date()),
      schicht: "Produktion / Lackierung",
      sigLeft: "",
      sigRight: "",
      sigLabelLeft: "Ausgeführt von (Name / Unterschrift):",
      sigLabelRight: "Kontrolliert von (Schichtleiter):",
      style: { padY: 4, minH: 26, fontSize: 8.5, checkSize: 12.5, secGap: 9 },
      sections: [
        {
          id: "sec-1",
          title: "1. HAND- & ROBOTER-ARBEITSPLÄTZE",
          col1Header: "Station",
          col2Header: "Auszuführende Arbeiten",
          col3Header: "Erledigt",
          rows: [
            {
              target: "Hand 1",
              tasks: "Links: Boden, Drehteller\nRechts: Boden, Drehteller, kompletter Filter\nAuswaschkasten putzen",
              warning: "",
              done: false,
            },
            {
              target: "Hand 2",
              tasks: "Links: Boden, Drehteller\nRechts: Boden, Drehteller",
              warning: "",
              done: false,
            },
            {
              target: "Roby 1",
              tasks: "Boden, Drehteller, kompletter Filter\nAuswaschkasten putzen",
              warning: "",
              done: false,
            },
            {
              target: "Roby 2",
              tasks: "Boden, Drehteller, kompletter Filter\nAuswaschkasten putzen",
              warning: "",
              done: false,
            },
          ],
        },
        {
          id: "sec-2",
          title: "2. LACKIERBEREICH",
          col1Header: "Bereich",
          col2Header: "Auszuführende Arbeiten",
          col3Header: "Erledigt",
          rows: [
            {
              target: "Füller",
              tasks: "Rechts: Komplette Filtermatten, Boden\nAuswaschkasten putzen\nFlurbereich - Boden staubsaugen",
              warning: "",
              done: false,
            },
            {
              target: "Lack 1",
              tasks: "Komplette Filtermatten, Boden\nAuswaschkasten putzen",
              warning: "",
              done: false,
            },
            {
              target: "Lack 2",
              tasks: "Komplette Filtermatten, Boden\nAuswaschkasten putzen",
              warning: "",
              done: false,
            },
            {
              target: "Lack 4",
              tasks: "Komplette Filtermatten, Boden\nAuswaschkasten putzen\nFlurbereich - Boden staubsaugen, nass wischen",
              warning: "",
              done: false,
            },
          ],
        },
        {
          id: "sec-3",
          title: "3. ZUSATZAUFGABEN & FILTERWARTUNG",
          col1Header: "Aufgabe",
          col2Header: "Beschreibung / Details",
          col3Header: "Erledigt",
          rows: [
            {
              target: "Patronenfilter Putzen",
              tasks: "Gehäuse Linie 4 - Kabinen: **3.12, 3.11, 2.11.A, 2.11.B**",
              warning: "Wichtig: Auch die Schubladen abstauben!",
              done: false,
            },
            {
              target: "3-Grams",
              tasks: "Check / leeren",
              warning: "",
              done: false,
            },
            {
              target: "Patronenfilter Staubsack",
              tasks: "Check / leeren",
              warning: "",
              done: false,
            },
          ],
        },
      ],
    };
  }

  let defaultState = createDefaultState();
  let appState = JSON.parse(JSON.stringify(defaultState));

  function showToast(message, kind) {
    const el = document.getElementById("app-toast");
    if (!el) return;
    el.textContent = message;
    el.className = "is-visible " + (kind === "error" ? "is-error" : "is-ok");
    el.setAttribute("role", "status");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.className = "";
      el.textContent = "";
    }, 4200);
  }

  function isValidRow(row) {
    return (
      row &&
      typeof row === "object" &&
      typeof row.target === "string" &&
      typeof row.tasks === "string" &&
      typeof row.warning === "string" &&
      typeof row.done === "boolean"
    );
  }

  function isValidSection(sec) {
    return (
      sec &&
      typeof sec === "object" &&
      typeof sec.id === "string" &&
      typeof sec.title === "string" &&
      typeof sec.col1Header === "string" &&
      typeof sec.col2Header === "string" &&
      typeof sec.col3Header === "string" &&
      Array.isArray(sec.rows) &&
      sec.rows.length > 0 &&
      sec.rows.every(isValidRow)
    );
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") return null;
    const base = createDefaultState();
    const merged = {
      mainTitle: typeof raw.mainTitle === "string" ? raw.mainTitle : base.mainTitle,
      subTitle: typeof raw.subTitle === "string" ? raw.subTitle : base.subTitle,
      datum: typeof raw.datum === "string" ? raw.datum : base.datum,
      schicht: typeof raw.schicht === "string" ? raw.schicht : base.schicht,
      sigLeft: typeof raw.sigLeft === "string" ? raw.sigLeft : "",
      sigRight: typeof raw.sigRight === "string" ? raw.sigRight : "",
      sigLabelLeft:
        typeof raw.sigLabelLeft === "string" ? raw.sigLabelLeft : base.sigLabelLeft,
      sigLabelRight:
        typeof raw.sigLabelRight === "string" ? raw.sigLabelRight : base.sigLabelRight,
      style: {
        padY: Number(raw.style && raw.style.padY) || base.style.padY,
        minH: Number(raw.style && raw.style.minH) || base.style.minH,
        fontSize: Number(raw.style && raw.style.fontSize) || base.style.fontSize,
        checkSize: Number(raw.style && raw.style.checkSize) || base.style.checkSize,
        secGap: Number(raw.style && raw.style.secGap) || base.style.secGap,
      },
      sections: Array.isArray(raw.sections) && raw.sections.every(isValidSection)
        ? raw.sections
        : base.sections,
    };
    return merged;
  }

  function readStyleFromSliders() {
    return {
      padY: Number(document.getElementById("slider-row-pad").value),
      minH: Number(document.getElementById("slider-row-minh").value),
      fontSize: Number(document.getElementById("slider-font-size").value),
      checkSize: Number(document.getElementById("slider-check-size").value),
      secGap: Number(document.getElementById("slider-sec-gap").value),
    };
  }

  function persistState() {
    try {
      appState.style = readStyleFromSliders();
      const payload = { version: STORAGE_VERSION, savedAt: new Date().toISOString(), data: appState };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("Speichern fehlgeschlagen:", e);
    }
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistState, 200);
  }

  function loadStateFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;
      if (parsed.version !== STORAGE_VERSION) return false;
      const normalized = normalizeState(parsed.data);
      if (!normalized) return false;
      appState = normalized;
      return true;
    } catch (e) {
      console.warn("Gespeicherter Zustand ungültig, verwende Standard:", e);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
      return false;
    }
  }

  function exportStateJson() {
    appState.style = readStyleFromSliders();
    const payload = {
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      app: "wartungsliste",
      data: appState,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wartungsliste-export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Export als JSON gespeichert.", "ok");
  }

  function importStateJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => showToast("Datei konnte nicht gelesen werden.", "error");
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object") throw new Error("Kein Objekt");
        const data = parsed.data || parsed;
        if (parsed.version != null && parsed.version !== STORAGE_VERSION) {
          throw new Error("Unbekannte Export-Version (" + parsed.version + ")");
        }
        if (!Array.isArray(data.sections) || !data.sections.every(isValidSection)) {
          throw new Error("Abschnitte/Zeilen ungültig");
        }
        const normalized = normalizeState(data);
        if (!normalized) throw new Error("Datenstruktur ungültig");
        appState = normalized;
        applyStyleFromState();
        syncMetaInputsFromState();
        renderLeftEditor();
        renderA4Preview();
        persistState();
        showToast("Import erfolgreich.", "ok");
      } catch (e) {
        showToast("Import fehlgeschlagen: " + (e.message || "ungültiges JSON"), "error");
      }
    };
    reader.readAsText(file);
  }

  function applyStyleFromState() {
    const s = appState.style || createDefaultState().style;
    setSlidersValues(s.padY, s.minH, s.fontSize, s.checkSize, s.secGap, true);
  }

  window.addEventListener("DOMContentLoaded", () => {
    defaultState = createDefaultState();
    const loaded = loadStateFromStorage();
    if (!loaded) {
      appState = JSON.parse(JSON.stringify(defaultState));
    }
    applyStyleFromState();
    syncMetaInputsFromState();
    renderLeftEditor();
    renderA4Preview();
    handleViewportScaling();
    window.addEventListener("resize", handleViewportScaling);

    const importInput = document.getElementById("inp-import-json");
    if (importInput) {
      importInput.addEventListener("change", (ev) => {
        const f = ev.target.files && ev.target.files[0];
        importStateJson(f);
        ev.target.value = "";
      });
    }
  });

  function switchTab(tabId) {
    const tabs = ["tab-tasks", "tab-meta", "tab-style"];
    tabs.forEach((id) => {
      const el = document.getElementById(id);
      const btn = document.getElementById("btn-" + id);
      if (!el || !btn) return;
      const selected = id === tabId;
      if (selected) {
        el.classList.remove("hidden");
        el.removeAttribute("hidden");
        btn.className =
          "px-3.5 py-2 rounded-t-lg bg-slate-900 text-blue-400 border-t border-x border-slate-700 flex items-center gap-1.5";
      } else {
        el.classList.add("hidden");
        el.setAttribute("hidden", "");
        btn.className =
          "px-3.5 py-2 rounded-t-lg text-slate-400 hover:text-slate-200 flex items-center gap-1.5";
      }
      btn.setAttribute("aria-selected", selected ? "true" : "false");
      btn.setAttribute("tabindex", selected ? "0" : "-1");
    });
  }

  function syncMetaInputsFromState() {
    document.getElementById("inp-main-title").value = appState.mainTitle;
    document.getElementById("inp-sub-title").value = appState.subTitle;
    document.getElementById("inp-datum").value = appState.datum;
    document.getElementById("inp-schicht").value = appState.schicht;
    document.getElementById("inp-sig-left").value = appState.sigLeft;
    document.getElementById("inp-sig-right").value = appState.sigRight;
    document.getElementById("inp-sig-label-left").value = appState.sigLabelLeft;
    document.getElementById("inp-sig-label-right").value = appState.sigLabelRight;
  }

  function updateMetaFromInputs() {
    appState.mainTitle = document.getElementById("inp-main-title").value;
    appState.subTitle = document.getElementById("inp-sub-title").value;
    appState.datum = document.getElementById("inp-datum").value;
    appState.schicht = document.getElementById("inp-schicht").value;
    appState.sigLeft = document.getElementById("inp-sig-left").value;
    appState.sigRight = document.getElementById("inp-sig-right").value;
    appState.sigLabelLeft = document.getElementById("inp-sig-label-left").value;
    appState.sigLabelRight = document.getElementById("inp-sig-label-right").value;
    renderA4Preview();
    schedulePersist();
  }

  function setTodayDate() {
    appState.datum = formatDateDE(new Date());
    document.getElementById("inp-datum").value = appState.datum;
    renderA4Preview();
    schedulePersist();
  }

  function clearHeaderFields() {
    appState.datum = "";
    appState.schicht = "";
    document.getElementById("inp-datum").value = "";
    document.getElementById("inp-schicht").value = "";
    renderA4Preview();
    schedulePersist();
  }

  function clearSignatures() {
    appState.sigLeft = "";
    appState.sigRight = "";
    document.getElementById("inp-sig-left").value = "";
    document.getElementById("inp-sig-right").value = "";
    renderA4Preview();
    schedulePersist();
  }

  function renderLeftEditor() {
    const container = document.getElementById("sections-editor-container");
    container.innerHTML = "";

    appState.sections.forEach((sec, sIdx) => {
      const secCard = document.createElement("div");
      secCard.className =
        "bg-slate-900 border border-slate-700/90 rounded-xl overflow-hidden shadow-sm";
      secCard.setAttribute("role", "group");
      secCard.setAttribute("aria-label", sec.title || "Abschnitt");

      let rowsHtml = "";
      sec.rows.forEach((row, rIdx) => {
        const hasWarning = row.warning && row.warning.trim().length > 0;
        rowsHtml += `
            <div class="p-3 bg-slate-800/75 border border-slate-700/80 rounded-lg space-y-2 transition hover:border-slate-600">
              <div class="flex items-center gap-2">
                <button type="button" onclick="toggleRowDone(${sIdx}, ${rIdx})" class="w-7 h-7 rounded flex items-center justify-center border ${row.done ? "bg-emerald-600/20 border-emerald-500 text-emerald-400" : "bg-slate-900 border-slate-600 text-slate-400"} hover:border-blue-400 transition shrink-0" title="Als erledigt / offen markieren" aria-pressed="${row.done ? "true" : "false"}" aria-label="Erledigt umschalten">
                  <i class="fa-solid ${row.done ? "fa-check" : "fa-minus text-[10px] opacity-40"}" aria-hidden="true"></i>
                </button>
                <label class="sr-only" for="row-target-${sIdx}-${rIdx}">${escapeHtml(sec.col1Header)}</label>
                <input id="row-target-${sIdx}-${rIdx}" type="text" value="${escapeHtml(row.target)}" oninput="updateRowField(${sIdx}, ${rIdx}, 'target', this.value)" placeholder="${escapeHtml(sec.col1Header)} (oder leer für Blanko)" class="flex-1 bg-slate-900 border border-slate-600 rounded px-2.5 py-1 text-xs font-bold text-white focus:outline-none focus:border-blue-500" aria-label="${escapeHtml(sec.col1Header)}">
                <div class="flex items-center gap-1 shrink-0">
                  <button type="button" onclick="toggleWarningField(${sIdx}, ${rIdx})" class="w-6 h-6 rounded text-xs flex items-center justify-center ${hasWarning ? "bg-red-500/20 text-red-400 border border-red-500/40" : "text-slate-400 hover:bg-slate-700"}" title="Rote Warnbox ein-/ausblenden" aria-label="Warnhinweis umschalten" aria-pressed="${hasWarning ? "true" : "false"}">
                    <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                  </button>
                  <button type="button" onclick="moveRow(${sIdx}, ${rIdx}, -1)" ${rIdx === 0 ? "disabled" : ""} class="w-6 h-6 rounded text-xs flex items-center justify-center text-slate-400 hover:bg-slate-700 disabled:opacity-25" title="Nach oben" aria-label="Zeile nach oben">
                    <i class="fa-solid fa-chevron-up text-[10px]" aria-hidden="true"></i>
                  </button>
                  <button type="button" onclick="moveRow(${sIdx}, ${rIdx}, 1)" ${rIdx === sec.rows.length - 1 ? "disabled" : ""} class="w-6 h-6 rounded text-xs flex items-center justify-center text-slate-400 hover:bg-slate-700 disabled:opacity-25" title="Nach unten" aria-label="Zeile nach unten">
                    <i class="fa-solid fa-chevron-down text-[10px]" aria-hidden="true"></i>
                  </button>
                  <button type="button" onclick="deleteRow(${sIdx}, ${rIdx})" class="w-6 h-6 rounded text-xs flex items-center justify-center text-slate-400 hover:bg-red-500/20 hover:text-red-400" title="Zeile löschen" aria-label="Zeile löschen">
                    <i class="fa-solid fa-trash-can text-[11px]" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
              <div>
                <label class="sr-only" for="row-tasks-${sIdx}-${rIdx}">Auszuführende Arbeiten</label>
                <textarea id="row-tasks-${sIdx}-${rIdx}" rows="2" oninput="updateRowField(${sIdx}, ${rIdx}, 'tasks', this.value)" placeholder="Auszuführende Arbeiten (Jede Zeile wird automatisch zum Aufzählungspunkt •) — Leer lassen für Blanko-Zeile" class="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 leading-snug resize-y" aria-label="Auszuführende Arbeiten">${escapeHtml(row.tasks)}</textarea>
              </div>
              <div id="warn-wrap-${sIdx}-${rIdx}" class="${hasWarning ? "" : "hidden"} pt-1" ${hasWarning ? "" : "hidden"}>
                <div class="flex items-center gap-1.5 bg-red-950/40 border border-red-500/40 rounded px-2 py-1">
                  <i class="fa-solid fa-circle-exclamation text-red-400 text-xs" aria-hidden="true"></i>
                  <label class="sr-only" for="row-warn-${sIdx}-${rIdx}">Warnhinweis</label>
                  <input id="row-warn-${sIdx}-${rIdx}" type="text" value="${escapeHtml(row.warning)}" oninput="updateRowField(${sIdx}, ${rIdx}, 'warning', this.value)" placeholder="Roter Warnhinweis (z.B. Wichtig: Auch die Schubladen abstauben!)" class="w-full bg-transparent text-xs text-red-200 placeholder-red-400/50 focus:outline-none font-semibold" aria-label="Warnhinweis">
                </div>
              </div>
            </div>
          `;
      });

      secCard.innerHTML = `
          <div class="bg-slate-800 px-3.5 py-2.5 border-b border-slate-700 flex items-center justify-between gap-2 border-l-4 border-l-blue-500">
            <label class="sr-only" for="sec-title-${sIdx}">Abschnittstitel</label>
            <input id="sec-title-${sIdx}" type="text" value="${escapeHtml(sec.title)}" oninput="updateSectionField(${sIdx}, 'title', this.value)" class="bg-transparent font-bold text-xs text-white uppercase tracking-wide focus:outline-none focus:bg-slate-900 px-1.5 py-0.5 rounded w-full" aria-label="Abschnittstitel">
            <button type="button" onclick="addRow(${sIdx})" class="px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-[11px] font-semibold shrink-0 flex items-center gap-1 transition" aria-label="Zeile hinzufügen">
              <i class="fa-solid fa-plus" aria-hidden="true"></i> Zeile
            </button>
          </div>
          <div class="p-3 space-y-2.5">
            ${rowsHtml}
          </div>
        `;

      container.appendChild(secCard);
    });

    updateToggleAllButtonLabel();
  }

  function updateSectionField(sIdx, field, val) {
    appState.sections[sIdx][field] = val;
    renderA4Preview();
    schedulePersist();
  }

  function updateRowField(sIdx, rIdx, field, val) {
    appState.sections[sIdx].rows[rIdx][field] = val;
    renderA4Preview();
    schedulePersist();
  }

  function toggleRowDone(sIdx, rIdx) {
    appState.sections[sIdx].rows[rIdx].done = !appState.sections[sIdx].rows[rIdx].done;
    renderLeftEditor();
    renderA4Preview();
    schedulePersist();
  }

  function toggleWarningField(sIdx, rIdx) {
    const wrap = document.getElementById(`warn-wrap-${sIdx}-${rIdx}`);
    const row = appState.sections[sIdx].rows[rIdx];
    if (wrap.classList.contains("hidden")) {
      wrap.classList.remove("hidden");
      wrap.removeAttribute("hidden");
      if (!row.warning) {
        row.warning = "Wichtig: ";
        renderLeftEditor();
        renderA4Preview();
        schedulePersist();
      }
    } else {
      row.warning = "";
      renderLeftEditor();
      renderA4Preview();
      schedulePersist();
    }
  }

  function addRow(sIdx) {
    appState.sections[sIdx].rows.push({
      target: "",
      tasks: "",
      warning: "",
      done: false,
    });
    renderLeftEditor();
    renderA4Preview();
    schedulePersist();
  }

  function deleteRow(sIdx, rIdx) {
    if (appState.sections[sIdx].rows.length <= 1) {
      appState.sections[sIdx].rows[0] = {
        target: "",
        tasks: "",
        warning: "",
        done: false,
      };
    } else {
      appState.sections[sIdx].rows.splice(rIdx, 1);
    }
    renderLeftEditor();
    renderA4Preview();
    schedulePersist();
  }

  function moveRow(sIdx, rIdx, dir) {
    const rows = appState.sections[sIdx].rows;
    const newIdx = rIdx + dir;
    if (newIdx < 0 || newIdx >= rows.length) return;
    const temp = rows[rIdx];
    rows[rIdx] = rows[newIdx];
    rows[newIdx] = temp;
    renderLeftEditor();
    renderA4Preview();
    schedulePersist();
  }

  function loadStandardPreset() {
    defaultState = createDefaultState();
    appState = JSON.parse(JSON.stringify(defaultState));
    appState.datum = formatDateDE(new Date());
    setSlidersValues(4, 26, 8.5, 12.5, 9);
    syncMetaInputsFromState();
    renderLeftEditor();
    renderA4Preview();
    schedulePersist();
  }

  function loadBlankoPreset() {
    defaultState = createDefaultState();
    appState = JSON.parse(JSON.stringify(defaultState));
    appState.datum = "";
    appState.schicht = "";
    appState.sigLeft = "";
    appState.sigRight = "";
    appState.sections.forEach((sec) => {
      sec.rows = [
        { target: "", tasks: "", warning: "", done: false },
        { target: "", tasks: "", warning: "", done: false },
        { target: "", tasks: "", warning: "", done: false },
        { target: "", tasks: "", warning: "", done: false },
      ];
    });
    setSlidersValues(5, 32, 8.5, 12.5, 10);
    syncMetaInputsFromState();
    renderLeftEditor();
    renderA4Preview();
    schedulePersist();
  }

  function toggleAllCheckboxes() {
    const allDone = appState.sections.every((s) => s.rows.every((r) => r.done));
    const nextState = !allDone;
    appState.sections.forEach((s) => {
      s.rows.forEach((r) => {
        r.done = nextState;
      });
    });
    renderLeftEditor();
    renderA4Preview();
    schedulePersist();
  }

  function updateToggleAllButtonLabel() {
    const allDone = appState.sections.every((s) => s.rows.every((r) => r.done));
    const lbl = document.getElementById("toggle-all-label");
    if (lbl) {
      lbl.textContent = allDone ? "Alle offen setzen" : "Alle erledigt";
    }
  }

  function renderA4Preview() {
    document.getElementById("out-main-title").textContent =
      appState.mainTitle || "REINIGUNGS- UND WARTUNGSLISTE";
    document.getElementById("out-sub-title").textContent = appState.subTitle || "";

    const datumContainer = document.getElementById("out-datum-container");
    if (appState.datum && appState.datum.trim() !== "") {
      datumContainer.innerHTML = `<span class="pdf-info-val">${escapeHtml(appState.datum)}</span>`;
    } else {
      datumContainer.innerHTML = `<span class="pdf-info-line"></span>`;
    }

    const schichtContainer = document.getElementById("out-schicht-container");
    if (appState.schicht && appState.schicht.trim() !== "") {
      schichtContainer.innerHTML = `<span class="pdf-info-val">${escapeHtml(appState.schicht)}</span>`;
    } else {
      schichtContainer.innerHTML = `<span class="pdf-info-line"></span>`;
    }

    const wrapper = document.getElementById("out-sections-wrapper");
    wrapper.innerHTML = "";

    appState.sections.forEach((sec, sIdx) => {
      const secEl = document.createElement("div");
      secEl.className = "pdf-section-block";

      let tbodyHtml = "";
      sec.rows.forEach((row, rIdx) => {
        const lines = (row.tasks || "")
          .split("\n")
          .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
          .filter(Boolean);

        let col2Content = "&nbsp;";
        if (lines.length > 1 || (sIdx < 2 && lines.length === 1)) {
          col2Content = `<ul class="pdf-task-list">${lines
            .map((l) => `<li>${formatRichText(l)}</li>`)
            .join("")}</ul>`;
        } else if (lines.length === 1) {
          col2Content = `<div>${formatRichText(lines[0])}</div>`;
        }

        if (row.warning && row.warning.trim() !== "") {
          col2Content += `<div class="pdf-warning-box">${escapeHtml(row.warning)}</div>`;
        }

        const col1Content =
          row.target && row.target.trim() !== "" ? escapeHtml(row.target) : "&nbsp;";
        const checkSymbol = row.done ? "☑" : "☐";

        tbodyHtml += `
            <tr>
              <td class="pdf-col-1">${col1Content}</td>
              <td class="pdf-col-2">${col2Content}</td>
              <td class="pdf-col-3 col-center">
                <button type="button" onclick="toggleRowDone(${sIdx}, ${rIdx})" class="pdf-checkbox-btn ${row.done ? "checked" : ""}" title="Klicken zum Umschalten" aria-pressed="${row.done ? "true" : "false"}" aria-label="${row.done ? "Erledigt, zum Öffnen klicken" : "Offen, zum Erledigen klicken"}">${checkSymbol}</button>
              </td>
            </tr>
          `;
      });

      secEl.innerHTML = `
          <div class="pdf-section-header">${escapeHtml(sec.title)}</div>
          <table class="pdf-table">
            <thead>
              <tr>
                <th class="pdf-col-1" scope="col">${escapeHtml(sec.col1Header)}</th>
                <th class="pdf-col-2" scope="col">${escapeHtml(sec.col2Header)}</th>
                <th class="pdf-col-3 col-center" scope="col">${escapeHtml(sec.col3Header)}</th>
              </tr>
            </thead>
            <tbody>
              ${tbodyHtml}
            </tbody>
          </table>
        `;

      wrapper.appendChild(secEl);
    });

    document.getElementById("out-sig-left").textContent = appState.sigLeft || "";
    document.getElementById("out-sig-right").textContent = appState.sigRight || "";
    document.getElementById("out-sig-label-left").textContent =
      appState.sigLabelLeft || "Ausgeführt von (Name / Unterschrift):";
    document.getElementById("out-sig-label-right").textContent =
      appState.sigLabelRight || "Kontrolliert von (Schichtleiter):";

    checkPageFit();
  }

  function setSlidersValues(padY, minH, fontSize, checkSize, secGap, skipPersist) {
    document.getElementById("slider-row-pad").value = padY;
    document.getElementById("slider-row-minh").value = minH;
    document.getElementById("slider-font-size").value = fontSize;
    document.getElementById("slider-check-size").value = checkSize;
    document.getElementById("slider-sec-gap").value = secGap;
    updateStyleVariables(skipPersist);
  }

  function updateStyleVariables(skipPersist) {
    const padY = document.getElementById("slider-row-pad").value;
    const minH = document.getElementById("slider-row-minh").value;
    const fontSize = document.getElementById("slider-font-size").value;
    const checkSize = document.getElementById("slider-check-size").value;
    const secGap = document.getElementById("slider-sec-gap").value;

    document.getElementById("val-row-pad").textContent = padY + "px";
    document.getElementById("val-row-minh").textContent = minH + "px";
    document.getElementById("val-font-size").textContent = fontSize + "pt";
    document.getElementById("val-check-size").textContent = checkSize + "pt";
    document.getElementById("val-sec-gap").textContent = secGap + "px";

    const root = document.documentElement;
    root.style.setProperty("--row-pad-y", padY + "px");
    root.style.setProperty("--row-min-h", minH + "px");
    root.style.setProperty("--base-font-size", fontSize + "pt");
    root.style.setProperty("--check-size", checkSize + "pt");
    root.style.setProperty("--sec-gap", secGap + "px");

    appState.style = {
      padY: Number(padY),
      minH: Number(minH),
      fontSize: Number(fontSize),
      checkSize: Number(checkSize),
      secGap: Number(secGap),
    };

    checkPageFit();
    if (!skipPersist) schedulePersist();
  }

  function resetStyleSliders() {
    setSlidersValues(4, 26, 8.5, 12.5, 9);
  }

  function checkPageFit() {
    const inner = document.getElementById("a4-inner-content");
    const sheet = document.getElementById("a4-sheet");
    const statusEl = document.getElementById("page-fit-status");
    if (!inner || !sheet || !statusEl) return;

    const isOverflowing = inner.scrollHeight > inner.clientHeight + 2;
    if (isOverflowing) {
      sheet.classList.add("is-overflowing");
      statusEl.className = "flex items-center gap-2 text-red-400 font-medium";
      statusEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>Inhalt zu hoch! Klicke rechts auf „Auto-Fit“</span>`;
    } else {
      sheet.classList.remove("is-overflowing");
      statusEl.className = "flex items-center gap-2 text-emerald-400 font-medium";
      statusEl.innerHTML = `<i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Sitzt perfekt auf 1 DIN-A4-Seite</span>`;
    }
  }

  function autoFitPage() {
    const inner = document.getElementById("a4-inner-content");
    let padY = 5.5;
    let minH = 28;
    let fontSize = 8.75;
    let secGap = 10;

    const apply = () => {
      setSlidersValues(padY, minH, fontSize, 12.5, secGap);
    };
    apply();

    let guard = 0;
    while (inner.scrollHeight > inner.clientHeight && guard < 25) {
      if (padY > 2) padY = Math.max(1.5, padY - 0.5);
      if (minH > 19) minH = Math.max(18, minH - 2);
      if (secGap > 5) secGap = Math.max(4, secGap - 1);
      else if (fontSize > 7.25) fontSize = Math.max(7, fontSize - 0.25);
      apply();
      guard++;
    }
  }

  function handleViewportScaling() {
    const wrapper = document.getElementById("preview-wrapper");
    const scaleContainer = document.getElementById("a4-scale-container");
    const sheet = document.getElementById("a4-sheet");
    if (!wrapper || !scaleContainer || !sheet) return;

    const sheetWidthPx = sheet.offsetWidth;
    const sheetHeightPx = sheet.offsetHeight;

    let scale = currentZoom;
    if (scale === null) {
      const availW = wrapper.clientWidth - 40;
      const availH = wrapper.clientHeight - 65;
      const scaleW = availW / sheetWidthPx;
      const scaleH = availH / sheetHeightPx;
      scale = Math.min(scaleW, scaleH, 1.15);
      scale = Math.max(scale, 0.38);
      document.getElementById("zoom-label").textContent = Math.round(scale * 100) + "%";
    } else {
      document.getElementById("zoom-label").textContent = Math.round(scale * 100) + "%";
    }

    scaleContainer.style.transform = `scale(${scale})`;
    scaleContainer.style.height = `${Math.ceil(sheetHeightPx * scale + 24)}px`;
  }

  function adjustZoom(delta) {
    if (currentZoom === null) {
      const wrapper = document.getElementById("preview-wrapper");
      const sheet = document.getElementById("a4-sheet");
      currentZoom = Math.min(
        (wrapper.clientWidth - 40) / sheet.offsetWidth,
        (wrapper.clientHeight - 65) / sheet.offsetHeight,
        1.15
      );
    }
    currentZoom = Math.min(1.5, Math.max(0.4, currentZoom + delta));
    handleViewportScaling();
  }

  function resetZoom() {
    currentZoom = null;
    handleViewportScaling();
  }

  function triggerPrint() {
    const inner = document.getElementById("a4-inner-content");
    if (inner && inner.scrollHeight > inner.clientHeight + 2) {
      autoFitPage();
    }
    window.print();
  }

  // Expose for inline handlers / tests
  Object.assign(window, {
    switchTab,
    updateMetaFromInputs,
    setTodayDate,
    clearHeaderFields,
    clearSignatures,
    updateSectionField,
    updateRowField,
    toggleRowDone,
    toggleWarningField,
    addRow,
    deleteRow,
    moveRow,
    loadStandardPreset,
    loadBlankoPreset,
    toggleAllCheckboxes,
    updateStyleVariables,
    resetStyleSliders,
    autoFitPage,
    adjustZoom,
    resetZoom,
    triggerPrint,
    exportStateJson,
    importStateJson,
    persistState,
    // for tests / screenshots
    getAppState: () => appState,
    setAppStateForTest: (s) => {
      appState = normalizeState(s) || appState;
    },
    STORAGE_KEY,
    STORAGE_VERSION,
    renderA4Preview,
    syncMetaInputsFromState,
    renderLeftEditor,
    appState, // note: reference may go stale; prefer getAppState
  });

  // Keep window.appState as live getter for screenshot scripts
  Object.defineProperty(window, "appState", {
    get() {
      return appState;
    },
    set(v) {
      appState = v;
    },
    configurable: true,
  });
})();
