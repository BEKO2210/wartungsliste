/* Reinigungs- und Wartungsliste – Editor */
(function () {
  "use strict";

  const STORAGE_KEY = "wartungsliste-state";
  const STORAGE_VERSION = 1;

  const DEFAULT_FOOTER = "Reinigungs- und Wartungsliste";
  const LOGO_MAX_BYTES = 8 * 1024 * 1024; // Eingabedatei
  const LOGO_MAX_EDGE = 600; // px, Raster-Logos werden verkleinert
  const LOGO_SRC_RE = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

  // Farbschemata für den Ausdruck
  const THEMES = {
    slate: { label: "Schiefer", brand: "#2c3e50", brand2: "#34495e", accent: "#3498db" },
    anthracite: { label: "Anthrazit", brand: "#1f2937", brand2: "#374151", accent: "#f59e0b" },
    petrol: { label: "Petrol", brand: "#134e4a", brand2: "#1d5f5a", accent: "#2dd4bf" },
    bordeaux: { label: "Bordeaux", brand: "#5b1a24", brand2: "#74232f", accent: "#f87171" },
    forest: { label: "Wald", brand: "#1c4532", brand2: "#24573f", accent: "#4ade80" },
    eco: { label: "Tonersparend", brand: "#ffffff", brand2: "#f1f5f9", accent: "#1e293b" },
    custom: { label: "Eigene", brand: null, brand2: null, accent: null },
  };

  let currentZoom = null; // null = auto-fit
  let persistTimer = null;
  let undoSnapshot = null;
  const openColumnEditors = new Set();

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
      footerText: DEFAULT_FOOTER,
      logo: null, // { src, height, position: "left"|"right", plate }
      theme: "slate",
      customColor: "#0f4c81",
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

  function showToast(message, kind, action) {
    const el = document.getElementById("app-toast");
    const msg = document.getElementById("app-toast-msg");
    const btn = document.getElementById("app-toast-action");
    if (!el || !msg || !btn) return;
    msg.textContent = message;
    el.className = "is-visible " + (kind === "error" ? "is-error" : "is-ok");
    if (action) {
      btn.textContent = action.label;
      btn.onclick = () => {
        hideToast();
        action.fn();
      };
      btn.hidden = false;
    } else {
      btn.onclick = null;
      btn.textContent = "";
      btn.hidden = true;
    }
    clearTimeout(showToast._t);
    showToast._t = setTimeout(hideToast, action ? 7000 : 4200);
  }

  function hideToast() {
    const el = document.getElementById("app-toast");
    if (!el) return;
    el.className = "";
    document.getElementById("app-toast-msg").textContent = "";
    document.getElementById("app-toast-action").hidden = true;
  }

  // Vor riskanten Aktionen Zustand merken, damit man sie rückgängig machen kann
  function rememberForUndo() {
    appState.style = readStyleFromSliders();
    undoSnapshot = JSON.parse(JSON.stringify(appState));
  }

  function offerUndo(message) {
    showToast(message, "ok", { label: "Rückgängig", fn: undoLastAction });
  }

  function undoLastAction() {
    if (!undoSnapshot) return;
    appState = undoSnapshot;
    undoSnapshot = null;
    refreshAll();
    persistState();
    showToast("Rückgängig gemacht.", "ok");
  }

  function refreshAll() {
    applyStyleFromState();
    syncMetaInputsFromState();
    renderLeftEditor();
    renderA4Preview();
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
      footerText: typeof raw.footerText === "string" ? raw.footerText : base.footerText,
      logo: normalizeLogo(raw.logo),
      theme: typeof raw.theme === "string" && THEMES[raw.theme] ? raw.theme : base.theme,
      customColor: isHexColor(raw.customColor) ? raw.customColor : base.customColor,
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

  function isHexColor(v) {
    return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
  }

  function normalizeLogo(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.src !== "string" || !LOGO_SRC_RE.test(raw.src)) return null;
    const h = Number(raw.height);
    return {
      src: raw.src,
      height: h >= 20 && h <= 70 ? h : 40,
      position: raw.position === "right" ? "right" : "left",
      plate: raw.plate !== false,
    };
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
      if (e && e.name === "QuotaExceededError") {
        showToast("Browser-Speicher voll – bitte ein kleineres Logo verwenden.", "error");
      }
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
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    a.download = `wartungsliste-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Datei gespeichert.", "ok");
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
        rememberForUndo();
        appState = normalized;
        refreshAll();
        persistState();
        offerUndo("Import erfolgreich.");
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
    renderThemeSwatches();
    refreshAll();
    handleViewportScaling();
    window.addEventListener("resize", handleViewportScaling);
    setupTabKeyboard();
    setupLogoInput();

    // Logo lädt asynchron – danach Seitenpassung neu prüfen
    const outLogo = document.getElementById("out-logo");
    if (outLogo) outLogo.addEventListener("load", checkPageFit);

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
      el.classList.toggle("hidden", !selected);
      el.toggleAttribute("hidden", !selected);
      btn.setAttribute("aria-selected", selected ? "true" : "false");
      btn.setAttribute("tabindex", selected ? "0" : "-1");
    });
    const scroller = document.getElementById("editor-scroll");
    if (scroller) scroller.scrollTop = 0;
    if (tabId === "tab-tasks") autosizeTextareas();
  }

  // Pfeiltasten-Navigation zwischen den Tabs (WAI-ARIA Tabs-Pattern)
  function setupTabKeyboard() {
    const ids = ["tab-tasks", "tab-meta", "tab-style"];
    ids.forEach((id, i) => {
      const btn = document.getElementById("btn-" + id);
      if (!btn) return;
      btn.addEventListener("keydown", (ev) => {
        let next = null;
        if (ev.key === "ArrowRight") next = ids[(i + 1) % ids.length];
        else if (ev.key === "ArrowLeft") next = ids[(i - 1 + ids.length) % ids.length];
        else if (ev.key === "Home") next = ids[0];
        else if (ev.key === "End") next = ids[ids.length - 1];
        if (!next) return;
        ev.preventDefault();
        switchTab(next);
        document.getElementById("btn-" + next).focus();
      });
    });
  }

  function setMobileView(view) {
    document.body.dataset.view = view;
    document.getElementById("view-btn-editor").setAttribute("aria-selected", view === "editor" ? "true" : "false");
    document.getElementById("view-btn-preview").setAttribute("aria-selected", view === "preview" ? "true" : "false");
    if (view === "preview") handleViewportScaling();
    else autosizeTextareas();
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
    document.getElementById("inp-footer-text").value = appState.footerText;
    syncLogoControls();
    syncThemeSwatches();
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
    appState.footerText = document.getElementById("inp-footer-text").value;
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
    const secCount = appState.sections.length;

    appState.sections.forEach((sec, sIdx) => {
      const secCard = document.createElement("div");
      secCard.className = "sec-card";
      secCard.setAttribute("role", "group");
      secCard.setAttribute("aria-label", sec.title || "Abschnitt");
      const colsOpen = openColumnEditors.has(sec.id);

      let rowsHtml = "";
      sec.rows.forEach((row, rIdx) => {
        const hasWarning = row.warning && row.warning.trim().length > 0;
        rowsHtml += `
            <div class="row-card space-y-2 ${row.done ? "is-done" : ""}">
              <div class="flex items-center gap-1.5">
                <span class="row-num" aria-hidden="true">${rIdx + 1}</span>
                <button type="button" onclick="toggleRowDone(${sIdx}, ${rIdx})" class="done-btn" title="Als erledigt / offen markieren" aria-pressed="${row.done ? "true" : "false"}" aria-label="Erledigt umschalten">
                  <i class="fa-solid fa-check text-[11px]" aria-hidden="true"></i>
                </button>
                <label class="sr-only" for="row-target-${sIdx}-${rIdx}">${escapeHtml(sec.col1Header)}</label>
                <input id="row-target-${sIdx}-${rIdx}" type="text" value="${escapeHtml(row.target)}" oninput="updateRowField(${sIdx}, ${rIdx}, 'target', this.value)" placeholder="${escapeHtml(sec.col1Header || "Station")} (leer = Blanko)" class="field field-sm font-semibold" aria-label="${escapeHtml(sec.col1Header)}">
                <div class="flex items-center shrink-0">
                  <button type="button" onclick="toggleWarningField(${sIdx}, ${rIdx})" class="mini-btn ${hasWarning ? "is-warn-on" : ""}" title="Roten Warnhinweis ein-/ausblenden" aria-label="Warnhinweis umschalten" aria-pressed="${hasWarning ? "true" : "false"}">
                    <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                  </button>
                  <button type="button" onclick="moveRow(${sIdx}, ${rIdx}, -1)" ${rIdx === 0 ? "disabled" : ""} class="mini-btn" title="Nach oben" aria-label="Zeile nach oben">
                    <i class="fa-solid fa-chevron-up text-[10px]" aria-hidden="true"></i>
                  </button>
                  <button type="button" onclick="moveRow(${sIdx}, ${rIdx}, 1)" ${rIdx === sec.rows.length - 1 ? "disabled" : ""} class="mini-btn" title="Nach unten" aria-label="Zeile nach unten">
                    <i class="fa-solid fa-chevron-down text-[10px]" aria-hidden="true"></i>
                  </button>
                  <button type="button" onclick="deleteRow(${sIdx}, ${rIdx})" class="mini-btn is-danger" title="Zeile löschen" aria-label="Zeile löschen">
                    <i class="fa-solid fa-trash-can text-[11px]" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
              <div class="pl-[1.475rem]">
                <label class="sr-only" for="row-tasks-${sIdx}-${rIdx}">${escapeHtml(sec.col2Header || "Auszuführende Arbeiten")}</label>
                <textarea id="row-tasks-${sIdx}-${rIdx}" rows="2" oninput="updateRowField(${sIdx}, ${rIdx}, 'tasks', this.value); autosizeTextarea(this)" placeholder="Eine Aufgabe pro Zeile – wird automatisch zur Aufzählung. **fett** möglich. Leer = Blanko" class="field field-sm leading-snug text-slate-200">${escapeHtml(row.tasks)}</textarea>
                <div id="warn-wrap-${sIdx}-${rIdx}" class="${hasWarning ? "" : "hidden"} pt-2" ${hasWarning ? "" : "hidden"}>
                  <div class="flex items-center gap-2 bg-red-950/40 border border-red-500/40 rounded-lg px-2.5 py-1.5">
                    <i class="fa-solid fa-circle-exclamation text-red-400 text-xs" aria-hidden="true"></i>
                    <label class="sr-only" for="row-warn-${sIdx}-${rIdx}">Warnhinweis</label>
                    <input id="row-warn-${sIdx}-${rIdx}" type="text" value="${escapeHtml(row.warning)}" oninput="updateRowField(${sIdx}, ${rIdx}, 'warning', this.value)" placeholder="z.B. Wichtig: Auch die Schubladen abstauben!" class="w-full bg-transparent text-xs text-red-200 placeholder-red-400/50 focus:outline-none font-semibold" aria-label="Warnhinweis">
                  </div>
                </div>
              </div>
            </div>
          `;
      });

      secCard.innerHTML = `
          <div class="sec-card-head">
            <label class="sr-only" for="sec-title-${sIdx}">Abschnittstitel</label>
            <input id="sec-title-${sIdx}" type="text" value="${escapeHtml(sec.title)}" oninput="updateSectionField(${sIdx}, 'title', this.value)" placeholder="Abschnittstitel" class="field field-title flex-1" aria-label="Abschnittstitel">
            <button type="button" onclick="toggleColumnEditor(${sIdx})" class="mini-btn ${colsOpen ? "is-on" : ""}" title="Spaltenüberschriften bearbeiten" aria-label="Spaltenüberschriften bearbeiten" aria-expanded="${colsOpen ? "true" : "false"}">
              <i class="fa-solid fa-table-columns" aria-hidden="true"></i>
            </button>
            <button type="button" onclick="moveSection(${sIdx}, -1)" ${sIdx === 0 ? "disabled" : ""} class="mini-btn" title="Abschnitt nach oben" aria-label="Abschnitt nach oben">
              <i class="fa-solid fa-arrow-up text-[10px]" aria-hidden="true"></i>
            </button>
            <button type="button" onclick="moveSection(${sIdx}, 1)" ${sIdx === secCount - 1 ? "disabled" : ""} class="mini-btn" title="Abschnitt nach unten" aria-label="Abschnitt nach unten">
              <i class="fa-solid fa-arrow-down text-[10px]" aria-hidden="true"></i>
            </button>
            <button type="button" onclick="deleteSection(${sIdx})" ${secCount <= 1 ? "disabled" : ""} class="mini-btn is-danger" title="Abschnitt löschen" aria-label="Abschnitt löschen">
              <i class="fa-solid fa-trash-can text-[11px]" aria-hidden="true"></i>
            </button>
          </div>
          <div class="${colsOpen ? "" : "hidden"} px-3 pt-3 grid grid-cols-[1fr_1.6fr_0.9fr] gap-2" ${colsOpen ? "" : "hidden"}>
            <div>
              <label for="sec-col1-${sIdx}" class="field-label">Spalte 1</label>
              <input id="sec-col1-${sIdx}" type="text" value="${escapeHtml(sec.col1Header)}" oninput="updateSectionField(${sIdx}, 'col1Header', this.value)" class="field field-sm">
            </div>
            <div>
              <label for="sec-col2-${sIdx}" class="field-label">Spalte 2</label>
              <input id="sec-col2-${sIdx}" type="text" value="${escapeHtml(sec.col2Header)}" oninput="updateSectionField(${sIdx}, 'col2Header', this.value)" class="field field-sm">
            </div>
            <div>
              <label for="sec-col3-${sIdx}" class="field-label">Spalte 3</label>
              <input id="sec-col3-${sIdx}" type="text" value="${escapeHtml(sec.col3Header)}" oninput="updateSectionField(${sIdx}, 'col3Header', this.value)" class="field field-sm">
            </div>
          </div>
          <div class="p-3 space-y-2">
            ${rowsHtml}
            <button type="button" onclick="addRow(${sIdx})" class="chip-btn w-full justify-center" aria-label="Zeile zu ${escapeHtml(sec.title || "Abschnitt")} hinzufügen">
              <i class="fa-solid fa-plus" aria-hidden="true"></i> Zeile hinzufügen
            </button>
          </div>
        `;

      container.appendChild(secCard);
    });

    updateToggleAllButtonLabel();
    autosizeTextareas();
  }

  function autosizeTextarea(el) {
    if (!el || el.offsetParent === null) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }

  function autosizeTextareas() {
    document
      .querySelectorAll("#sections-editor-container textarea")
      .forEach(autosizeTextarea);
  }

  function toggleColumnEditor(sIdx) {
    const id = appState.sections[sIdx].id;
    if (openColumnEditors.has(id)) openColumnEditors.delete(id);
    else openColumnEditors.add(id);
    renderLeftEditor();
  }

  function newSectionId() {
    let n = appState.sections.length + 1;
    const ids = new Set(appState.sections.map((s) => s.id));
    while (ids.has("sec-" + n)) n++;
    return "sec-" + n;
  }

  function addSection() {
    const nr = appState.sections.length + 1;
    appState.sections.push({
      id: newSectionId(),
      title: nr + ". NEUER ABSCHNITT",
      col1Header: "Station",
      col2Header: "Auszuführende Arbeiten",
      col3Header: "Erledigt",
      rows: [{ target: "", tasks: "", warning: "", done: false }],
    });
    renderLeftEditor();
    renderA4Preview();
    schedulePersist();
    const input = document.getElementById("sec-title-" + (appState.sections.length - 1));
    if (input) {
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus({ preventScroll: true });
      input.select();
    }
  }

  function deleteSection(sIdx) {
    if (appState.sections.length <= 1) return;
    rememberForUndo();
    const removed = appState.sections.splice(sIdx, 1)[0];
    openColumnEditors.delete(removed.id);
    renderLeftEditor();
    renderA4Preview();
    schedulePersist();
    offerUndo("Abschnitt gelöscht.");
  }

  function moveSection(sIdx, dir) {
    const secs = appState.sections;
    const newIdx = sIdx + dir;
    if (newIdx < 0 || newIdx >= secs.length) return;
    [secs[sIdx], secs[newIdx]] = [secs[newIdx], secs[sIdx]];
    renderLeftEditor();
    renderA4Preview();
    schedulePersist();
  }

  /* ---------- Logo ---------- */

  function setupLogoInput() {
    const input = document.getElementById("inp-logo");
    const drop = document.getElementById("logo-drop");
    if (!input || !drop) return;
    input.addEventListener("change", (ev) => {
      const f = ev.target.files && ev.target.files[0];
      handleLogoFile(f);
      ev.target.value = "";
    });
    ["dragenter", "dragover"].forEach((type) =>
      drop.addEventListener(type, (ev) => {
        ev.preventDefault();
        drop.classList.add("is-dragover");
      })
    );
    ["dragleave", "drop"].forEach((type) =>
      drop.addEventListener(type, () => drop.classList.remove("is-dragover"))
    );
    drop.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      handleLogoFile(f);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
      img.src = src;
    });
  }

  // Raster-Logos auf max. LOGO_MAX_EDGE verkleinern, damit localStorage nicht überläuft
  async function prepareLogoSrc(file) {
    const dataUrl = await readFileAsDataUrl(file);
    if (file.type === "image/svg+xml" || file.type === "image/gif") return dataUrl;
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, LOGO_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 300 * 1024) return dataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL("image/png");
    if (png.length < 500 * 1024) return png;
    return canvas.toDataURL("image/webp", 0.9);
  }

  async function handleLogoFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) {
      showToast("Bitte ein Bild wählen (PNG, JPG, SVG oder WebP).", "error");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      showToast("Bild ist zu groß (max. 8 MB).", "error");
      return;
    }
    try {
      const src = await prepareLogoSrc(file);
      if (!LOGO_SRC_RE.test(src)) throw new Error("Bildformat wird nicht unterstützt.");
      const prev = appState.logo || {};
      appState.logo = {
        src,
        height: prev.height || 40,
        position: prev.position || "left",
        plate: prev.plate !== undefined ? prev.plate : true,
      };
      syncLogoControls();
      renderA4Preview();
      persistState();
      showToast("Logo hinzugefügt.", "ok");
    } catch (e) {
      showToast(e.message || "Logo konnte nicht geladen werden.", "error");
    }
  }

  function removeLogo() {
    if (!appState.logo) return;
    rememberForUndo();
    appState.logo = null;
    syncLogoControls();
    renderA4Preview();
    persistState();
    offerUndo("Logo entfernt.");
  }

  function updateLogoOptions() {
    if (!appState.logo) return;
    appState.logo.height = Number(document.getElementById("slider-logo-size").value);
    appState.logo.plate = document.getElementById("chk-logo-plate").checked;
    document.getElementById("val-logo-size").textContent = appState.logo.height + "px";
    renderA4Preview();
    schedulePersist();
  }

  function setLogoPosition(pos) {
    if (!appState.logo) return;
    appState.logo.position = pos === "right" ? "right" : "left";
    syncLogoControls();
    renderA4Preview();
    schedulePersist();
  }

  function syncLogoControls() {
    const logo = appState.logo;
    const thumb = document.getElementById("logo-thumb");
    const empty = document.getElementById("logo-drop-empty");
    const opts = document.getElementById("logo-options");
    const removeBtn = document.getElementById("btn-logo-remove");
    if (!thumb) return;
    if (logo) {
      thumb.src = logo.src;
      thumb.hidden = false;
      empty.hidden = true;
      opts.hidden = false;
      removeBtn.hidden = false;
      document.getElementById("slider-logo-size").value = logo.height;
      document.getElementById("val-logo-size").textContent = logo.height + "px";
      document.getElementById("chk-logo-plate").checked = logo.plate;
      document.getElementById("logo-pos-left").setAttribute("aria-checked", logo.position === "left" ? "true" : "false");
      document.getElementById("logo-pos-right").setAttribute("aria-checked", logo.position === "right" ? "true" : "false");
    } else {
      thumb.removeAttribute("src");
      thumb.hidden = true;
      empty.hidden = false;
      opts.hidden = true;
      removeBtn.hidden = true;
    }
  }

  function renderLogoPreview() {
    const wrap = document.getElementById("out-logo-wrap");
    const img = document.getElementById("out-logo");
    const banner = document.getElementById("out-banner");
    const logo = appState.logo;
    if (!wrap || !img || !banner) return;
    if (logo) {
      if (img.getAttribute("src") !== logo.src) img.src = logo.src;
      wrap.hidden = false;
      wrap.classList.toggle("has-plate", logo.plate);
      banner.classList.toggle("logo-right", logo.position === "right");
      document.documentElement.style.setProperty("--logo-h", logo.height + "px");
    } else {
      img.removeAttribute("src");
      wrap.hidden = true;
      banner.classList.remove("logo-right");
    }
  }

  /* ---------- Farbschema ---------- */

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function isLightColor(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
  }

  function mixHex(hex, withHex, amount) {
    const a = hexToRgb(hex);
    const b = hexToRgb(withHex);
    const m = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
    return "#" + m.map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  function resolveTheme() {
    const key = THEMES[appState.theme] ? appState.theme : "slate";
    if (key === "custom") {
      const c = isHexColor(appState.customColor) ? appState.customColor : "#0f4c81";
      const light = isLightColor(c);
      return {
        brand: c,
        brand2: mixHex(c, light ? "#000000" : "#ffffff", 0.12),
        accent: mixHex(c, light ? "#000000" : "#ffffff", 0.5),
      };
    }
    return THEMES[key];
  }

  function applyTheme() {
    const sheet = document.getElementById("a4-sheet");
    if (!sheet) return;
    const t = resolveTheme();
    const light = isLightColor(t.brand);
    sheet.style.setProperty("--brand", t.brand);
    sheet.style.setProperty("--brand-2", t.brand2);
    sheet.style.setProperty("--accent", t.accent);
    sheet.style.setProperty("--brand-fg", light ? "#1e293b" : "#ffffff");
    sheet.style.setProperty("--brand-fg-muted", light ? "#475569" : "#cbd5e1");
    sheet.classList.toggle("theme-eco", appState.theme === "eco");
  }

  function renderThemeSwatches() {
    const host = document.getElementById("theme-swatches");
    if (!host) return;
    host.innerHTML = Object.keys(THEMES)
      .map((key) => {
        const t = THEMES[key];
        if (key === "custom") {
          return `
            <label class="swatch" role="radio" data-theme="custom" aria-checked="false" title="Eigene Farbe wählen" onclick="setTheme('custom')">
              <span class="swatch-dot" id="swatch-custom-dot" style="background:${appState.customColor}"><span class="flex items-center justify-center text-white/90 text-[11px]"><i class="fa-solid fa-eye-dropper" aria-hidden="true"></i></span></span>
              Eigene
              <input type="color" id="inp-custom-color" value="${appState.customColor}" oninput="setCustomColor(this.value)" aria-label="Eigene Farbe wählen">
            </label>`;
        }
        const dot =
          key === "eco"
            ? `<span style="background:#fff"></span><span style="background:#fff;box-shadow:inset 1px 0 0 #1e293b"></span>`
            : `<span style="background:${t.brand}"></span><span style="background:${t.accent}"></span>`;
        return `
          <button type="button" class="swatch" role="radio" data-theme="${key}" aria-checked="false" onclick="setTheme('${key}')">
            <span class="swatch-dot">${dot}</span>
            ${t.label}
          </button>`;
      })
      .join("");
  }

  function syncThemeSwatches() {
    document.querySelectorAll("#theme-swatches .swatch").forEach((el) => {
      el.setAttribute("aria-checked", el.dataset.theme === appState.theme ? "true" : "false");
    });
    const color = document.getElementById("inp-custom-color");
    const dot = document.getElementById("swatch-custom-dot");
    if (color) color.value = appState.customColor;
    if (dot) dot.style.background = appState.customColor;
  }

  function setTheme(key) {
    if (!THEMES[key]) return;
    appState.theme = key;
    syncThemeSwatches();
    renderA4Preview();
    schedulePersist();
  }

  function setCustomColor(hex) {
    if (!isHexColor(hex)) return;
    appState.customColor = hex;
    appState.theme = "custom";
    syncThemeSwatches();
    renderA4Preview();
    schedulePersist();
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
    rememberForUndo();
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
    offerUndo("Zeile gelöscht.");
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

  // Branding (Logo, Farben, Fußzeile) bleibt beim Laden einer Vorlage erhalten
  function keepBranding(next, prev) {
    next.logo = prev.logo;
    next.theme = prev.theme;
    next.customColor = prev.customColor;
    next.footerText = prev.footerText;
    return next;
  }

  function loadStandardPreset() {
    rememberForUndo();
    defaultState = createDefaultState();
    appState = keepBranding(JSON.parse(JSON.stringify(defaultState)), appState);
    appState.datum = formatDateDE(new Date());
    setSlidersValues(4, 26, 8.5, 12.5, 9);
    syncMetaInputsFromState();
    renderLeftEditor();
    renderA4Preview();
    schedulePersist();
    offerUndo("Standard-Daten geladen.");
  }

  function loadBlankoPreset() {
    rememberForUndo();
    defaultState = createDefaultState();
    appState = keepBranding(JSON.parse(JSON.stringify(defaultState)), appState);
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
    offerUndo("Blanko-Liste erstellt.");
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
      lbl.textContent = allDone ? "Alle offen" : "Alle erledigt";
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
    document.getElementById("out-footer-text").textContent = appState.footerText || "";

    renderLogoPreview();
    applyTheme();

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
      statusEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>Zu viel Inhalt – „Auto-Fit“ drücken</span>`;
    } else {
      sheet.classList.remove("is-overflowing");
      statusEl.className = "flex items-center gap-2 text-emerald-400 font-medium";
      statusEl.innerHTML = `<i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Passt auf 1 DIN-A4-Seite</span>`;
    }
  }

  function autoFitPage() {
    const inner = document.getElementById("a4-inner-content");
    let padY = 5.5;
    let minH = 28;
    let fontSize = 8.75;
    let secGap = 10;
    const checkSize = Number(document.getElementById("slider-check-size").value) || 12.5;

    const apply = () => {
      setSlidersValues(padY, minH, fontSize, checkSize, secGap);
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

  // Zoomstufe, bei der die A4-Seite in den sichtbaren Vorschaubereich passt
  function computeAutoScale() {
    const wrapper = document.getElementById("preview-wrapper");
    const sheet = document.getElementById("a4-sheet");
    const toolbar = wrapper.firstElementChild;
    const toolbarH = toolbar ? toolbar.offsetHeight + 16 : 50;
    const padY = parseFloat(getComputedStyle(wrapper).paddingTop) * 2;
    const availW = wrapper.clientWidth - (window.innerWidth < 640 ? 36 : 40);
    const availH = wrapper.clientHeight - toolbarH - padY;
    const scaleW = availW / sheet.offsetWidth;
    const scaleH = availH / sheet.offsetHeight;
    // Auf schmalen Bildschirmen auf Breite einpassen und vertikal scrollen
    const scale = window.innerWidth < 1024 ? Math.min(scaleW, 1.15) : Math.min(scaleW, scaleH, 1.15);
    return Math.max(scale, 0.38);
  }

  function handleViewportScaling() {
    const wrapper = document.getElementById("preview-wrapper");
    const scaleContainer = document.getElementById("a4-scale-container");
    const sheet = document.getElementById("a4-sheet");
    if (!wrapper || !scaleContainer || !sheet) return;

    const scale = currentZoom === null ? computeAutoScale() : currentZoom;
    document.getElementById("zoom-label").textContent = Math.round(scale * 100) + "%";

    scaleContainer.style.transform = `scale(${scale})`;
    scaleContainer.style.height = `${Math.ceil(sheet.offsetHeight * scale + 24)}px`;
  }

  function adjustZoom(delta) {
    if (currentZoom === null) currentZoom = computeAutoScale();
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
    setMobileView,
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
    addSection,
    deleteSection,
    moveSection,
    toggleColumnEditor,
    autosizeTextarea,
    handleLogoFile,
    removeLogo,
    updateLogoOptions,
    setLogoPosition,
    setTheme,
    setCustomColor,
    undoLastAction,
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
