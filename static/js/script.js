/* ═══════════════════════════════════════════════════════════
   Student PDF Toolkit — script.js  v2
═══════════════════════════════════════════════════════════ */

// ── Sidebar ───────────────────────────────────────────────
const sidebar        = document.getElementById("sidebar");
const sidebarToggle  = document.getElementById("sidebarToggle");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const navItems       = document.querySelectorAll(".nav-item");
const toolSections   = document.querySelectorAll(".tool-section");

function switchTool(tool) {
  navItems.forEach(n => n.classList.toggle("active", n.dataset.tool === tool));
  toolSections.forEach(s => s.classList.toggle("active", s.id === `tool-${tool}`));
  window.scrollTo({ top: 0, behavior: "smooth" });
  sidebar.classList.remove("open");
}

navItems.forEach(btn => btn.addEventListener("click", () => switchTool(btn.dataset.tool)));

// Tool-card clicks on home page
document.querySelectorAll(".tool-card").forEach(card => {
  card.addEventListener("click", () => switchTool(card.dataset.tool));
});

sidebarToggle.addEventListener("click", () => sidebar.classList.toggle("open"));
sidebarOverlay.addEventListener("click", () => sidebar.classList.remove("open"));

// ── Generic helpers ───────────────────────────────────────
function $id(id) { return document.getElementById(id); }

function makeDropZone(areaId, inputId, onFiles) {
  const area  = $id(areaId);
  const input = $id(inputId);
  area.addEventListener("click", () => input.click());
  area.addEventListener("dragover",  e => { e.preventDefault(); area.classList.add("dragover"); });
  area.addEventListener("dragleave", () => area.classList.remove("dragover"));
  area.addEventListener("drop", e => { e.preventDefault(); area.classList.remove("dragover"); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); });
  input.addEventListener("change", () => { if (input.files.length) onFiles(input.files); });
}

function showBadge(badgeId, nameId, name) { $id(nameId).textContent = name; $id(badgeId).classList.remove("hidden"); }
function hideBadge(id) { $id(id).classList.add("hidden"); }
function showErr(id, msg) { const el = $id(id); el.textContent = msg; el.classList.remove("hidden"); }
function hideErr(id)  { $id(id).classList.add("hidden"); }
function showProg(id) { $id(id).classList.remove("hidden"); }
function hideProg(id) { $id(id).classList.add("hidden"); }
function showRes(id)  { $id(id).classList.remove("hidden"); }
function hideRes(id)  { $id(id).classList.add("hidden"); }
function disableBtn(id, v) { $id(id).disabled = v; }

function isPDF(f) { return f.name.toLowerCase().endsWith(".pdf"); }

function statChips(chips) {
  return chips.map(([label, val]) =>
    `<span class="stat-chip">${label}: <strong>${val}</strong></span>`
  ).join("");
}

function copyTextToBtn(textareaId, btnId) {
  $id(btnId).addEventListener("click", () => {
    navigator.clipboard.writeText($id(textareaId).value).then(() => {
      const btn = $id(btnId);
      const orig = btn.innerHTML;
      btn.innerHTML = '✓ Copied!';
      setTimeout(() => btn.innerHTML = orig, 1600);
    });
  });
}

// ══════════════════════════════════════════════════════════
// 1. IMAGE EXTRACTOR
// ══════════════════════════════════════════════════════════
let imgFile = null, imgPreviews = [], imgLBIdx = 0;

makeDropZone("imgUploadArea", "imgFileInput", files => {
  if (!isPDF(files[0])) { showErr("imgError", "Only PDF files accepted."); return; }
  imgFile = files[0];
  showBadge("imgFileName", "imgFileNameText", files[0].name);
  hideErr("imgError"); hideRes("imgResult"); hideProg("imgProgress");
});

$id("imgClearBtn").addEventListener("click", e => {
  e.stopPropagation(); imgFile = null;
  $id("imgFileInput").value = "";
  hideBadge("imgFileName"); hideRes("imgResult"); hideProg("imgProgress"); hideErr("imgError");
});

// Stepped progress for image extractor
const IMG_STEPS  = ["upload","extract","build","done"];
const IMG_LABELS = { upload:"Uploading your PDF…", extract:"Extracting images…", build:"Building output PDF…", done:"Done — ready to download!" };

function setImgStep(name) {
  const idx = IMG_STEPS.indexOf(name);
  IMG_STEPS.forEach((s, i) => {
    const el = $id(`pst-${s}`);
    if (!el) return;
    el.classList.toggle("active", i === idx);
    el.classList.toggle("done", i < idx);
  });
  // connectors
  document.querySelectorAll(".psl").forEach((l, i) => l.classList.toggle("done", i < idx));
  $id("imgPLabel").textContent = IMG_LABELS[name] || "";
}

function animateBar(fillId, from, to, ms) {
  return new Promise(res => {
    const el = $id(fillId);
    const start = performance.now();
    (function tick(now) {
      const t = Math.min((now - start) / ms, 1);
      const e = 1 - Math.pow(1 - t, 3);
      el.style.width = (from + (to - from) * e).toFixed(1) + "%";
      t < 1 ? requestAnimationFrame(tick) : res();
    })(performance.now());
  });
}

$id("imgExtractBtn").addEventListener("click", async () => {
  if (!imgFile) { showErr("imgError", "Please select a PDF file first."); return; }
  disableBtn("imgExtractBtn", true);
  hideErr("imgError"); hideRes("imgResult"); showProg("imgProgress");
  setImgStep("upload"); await animateBar("imgPFill", 0, 28, 400);

  const fd = new FormData();
  fd.append("file", imgFile);
  fd.append("images_per_page", $id("imagesPerPage").value);

  try {
    setImgStep("extract"); await animateBar("imgPFill", 28, 60, 500);
    const res  = await fetch("/upload", { method:"POST", body:fd });
    setImgStep("build");   await animateBar("imgPFill", 60, 92, 400);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
    setImgStep("done"); await animateBar("imgPFill", 92, 100, 200);

    imgPreviews = data.previews || [];
    $id("imgCount").textContent = `${data.count} image${data.count!==1?"s":""}`;
    renderImgGallery(imgPreviews);
    $id("imgDownloadBtn").href = data.download_url;
    hideProg("imgProgress"); showRes("imgResult");
  } catch (err) {
    hideProg("imgProgress"); showErr("imgError", err.message || "Something went wrong.");
  } finally { disableBtn("imgExtractBtn", false); }
});

function renderImgGallery(previews) {
  const g = $id("imgGallery"); g.innerHTML = "";
  if (!previews.length) { g.innerHTML = '<div class="gallery-empty">No previews — download the PDF to view images.</div>'; return; }
  previews.forEach((src, i) => {
    const item = document.createElement("div");
    item.className = "gallery-item";
    item.innerHTML = `<img src="${src}" alt="Image ${i+1}" loading="lazy"><div class="gallery-overlay"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></div><div class="gallery-index">${i+1}</div>`;
    item.addEventListener("click", () => openLB(i));
    g.appendChild(item);
  });
}

function openLB(i)   { imgLBIdx = i; updateLB(); $id("imgLightbox").classList.remove("hidden"); document.body.style.overflow="hidden"; }
function closeLB()   { $id("imgLightbox").classList.add("hidden"); document.body.style.overflow=""; }
function updateLB()  {
  $id("imgLightboxImg").src = imgPreviews[imgLBIdx];
  $id("imgLightboxCounter").textContent = `${imgLBIdx+1} / ${imgPreviews.length}`;
  $id("imgLightboxPrev").disabled = imgLBIdx === 0;
  $id("imgLightboxNext").disabled = imgLBIdx === imgPreviews.length - 1;
}
$id("imgLightboxClose").addEventListener("click", closeLB);
$id("imgLightboxBackdrop").addEventListener("click", closeLB);
$id("imgLightboxPrev").addEventListener("click", () => { if (imgLBIdx > 0) { imgLBIdx--; updateLB(); } });
$id("imgLightboxNext").addEventListener("click", () => { if (imgLBIdx < imgPreviews.length-1) { imgLBIdx++; updateLB(); } });
document.addEventListener("keydown", e => {
  if ($id("imgLightbox").classList.contains("hidden")) return;
  if (e.key === "Escape") closeLB();
  if (e.key === "ArrowLeft"  && imgLBIdx > 0)                      { imgLBIdx--; updateLB(); }
  if (e.key === "ArrowRight" && imgLBIdx < imgPreviews.length - 1) { imgLBIdx++; updateLB(); }
});

// ══════════════════════════════════════════════════════════
// 2. TEXT EXTRACTOR
// ══════════════════════════════════════════════════════════
let txtFile = null;

makeDropZone("txtUploadArea", "txtFileInput", files => {
  if (!isPDF(files[0])) { showErr("txtError", "Only PDF files accepted."); return; }
  txtFile = files[0];
  showBadge("txtFileName", "txtFileNameText", files[0].name);
  hideErr("txtError"); hideRes("txtResult");
});
$id("txtClearBtn").addEventListener("click", e => {
  e.stopPropagation(); txtFile = null; $id("txtFileInput").value = "";
  hideBadge("txtFileName"); hideRes("txtResult"); hideErr("txtError");
});
copyTextToBtn("txtOutput", "txtCopyBtn");

$id("txtExtractBtn").addEventListener("click", async () => {
  if (!txtFile) { showErr("txtError", "Please select a PDF file first."); return; }
  disableBtn("txtExtractBtn", true);
  hideErr("txtError"); hideRes("txtResult"); showProg("txtProgress");
  const fd = new FormData(); fd.append("file", txtFile);
  try {
    const res  = await fetch("/extract-text", { method:"POST", body:fd });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
    $id("txtOutput").value = data.text;
    $id("txtStats").innerHTML = statChips([["Pages", data.page_count], ["Words", data.word_count.toLocaleString()], ["Characters", data.char_count.toLocaleString()]]);
    $id("txtDownloadBtn").href = data.download_url;
    hideProg("txtProgress"); showRes("txtResult");
  } catch (err) { hideProg("txtProgress"); showErr("txtError", err.message || "Something went wrong."); }
  finally { disableBtn("txtExtractBtn", false); }
});

// ══════════════════════════════════════════════════════════
// 3. MERGER
// ══════════════════════════════════════════════════════════
let mergeFiles = [];

makeDropZone("mergeUploadArea", "mergeFileInput", files => {
  const pdfs = Array.from(files).filter(isPDF);
  if (!pdfs.length) { showErr("mergeError", "Only PDF files accepted."); return; }
  mergeFiles = pdfs;
  hideErr("mergeError"); hideRes("mergeResult");
  renderMergeList();
});

function renderMergeList() {
  const list = $id("mergeFileList");
  if (!mergeFiles.length) { list.classList.add("hidden"); return; }
  list.innerHTML = mergeFiles.map((f, i) =>
    `<div class="file-list-item">
       <span class="file-list-num">${i+1}</span>
       <span class="file-list-name">${f.name}</span>
       <span class="file-list-size">${(f.size/1024).toFixed(0)} KB</span>
     </div>`
  ).join("");
  list.classList.remove("hidden");
}

$id("mergeRunBtn").addEventListener("click", async () => {
  if (mergeFiles.length < 2) { showErr("mergeError", "Please upload at least 2 PDF files."); return; }
  disableBtn("mergeRunBtn", true);
  hideErr("mergeError"); hideRes("mergeResult"); showProg("mergeProgress");
  const fd = new FormData(); mergeFiles.forEach(f => fd.append("files", f));
  try {
    const res  = await fetch("/merge", { method:"POST", body:fd });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
    $id("mergeStats").innerHTML = statChips([["Files merged", data.file_count], ["Total pages", data.total_pages]]);
    $id("mergeDownloadBtn").href = data.download_url;
    hideProg("mergeProgress"); showRes("mergeResult");
  } catch (err) { hideProg("mergeProgress"); showErr("mergeError", err.message || "Something went wrong."); }
  finally { disableBtn("mergeRunBtn", false); }
});

// ══════════════════════════════════════════════════════════
// 4. SPLITTER
// ══════════════════════════════════════════════════════════
let splitFile = null;

makeDropZone("splitUploadArea", "splitFileInput", files => {
  if (!isPDF(files[0])) { showErr("splitError", "Only PDF files accepted."); return; }
  splitFile = files[0];
  showBadge("splitFileName", "splitFileNameText", files[0].name);
  hideErr("splitError"); hideRes("splitResult");
});
$id("splitClearBtn").addEventListener("click", e => {
  e.stopPropagation(); splitFile = null; $id("splitFileInput").value = "";
  hideBadge("splitFileName"); hideRes("splitResult"); hideErr("splitError");
});

$id("splitRunBtn").addEventListener("click", async () => {
  if (!splitFile) { showErr("splitError", "Please select a PDF file first."); return; }
  const start = parseInt($id("splitStart").value, 10);
  const end   = parseInt($id("splitEnd").value, 10);
  if (isNaN(start) || isNaN(end) || start < 1 || end < start) { showErr("splitError", "Enter a valid range (start ≤ end, both ≥ 1)."); return; }
  disableBtn("splitRunBtn", true);
  hideErr("splitError"); hideRes("splitResult"); showProg("splitProgress");
  const fd = new FormData(); fd.append("file", splitFile); fd.append("start_page", start); fd.append("end_page", end);
  try {
    const res  = await fetch("/split", { method:"POST", body:fd });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
    $id("splitStats").innerHTML = statChips([["Pages extracted", data.extracted_pages], ["Range", data.range], ["Original", data.total_pages + " pages"]]);
    $id("splitDownloadBtn").href = data.download_url;
    hideProg("splitProgress"); showRes("splitResult");
  } catch (err) { hideProg("splitProgress"); showErr("splitError", err.message || "Something went wrong."); }
  finally { disableBtn("splitRunBtn", false); }
});

// ══════════════════════════════════════════════════════════
// 5. COMPRESSOR
// ══════════════════════════════════════════════════════════
let compressFile = null;

makeDropZone("compressUploadArea", "compressFileInput", files => {
  if (!isPDF(files[0])) { showErr("compressError", "Only PDF files accepted."); return; }
  compressFile = files[0];
  showBadge("compressFileName", "compressFileNameText", files[0].name);
  hideErr("compressError"); hideRes("compressResult");
});
$id("compressClearBtn").addEventListener("click", e => {
  e.stopPropagation(); compressFile = null; $id("compressFileInput").value = "";
  hideBadge("compressFileName"); hideRes("compressResult"); hideErr("compressError");
});

$id("compressRunBtn").addEventListener("click", async () => {
  if (!compressFile) { showErr("compressError", "Please select a PDF file first."); return; }
  disableBtn("compressRunBtn", true);
  hideErr("compressError"); hideRes("compressResult"); showProg("compressProgress");
  const quality = document.querySelector('input[name="compressQ"]:checked')?.value || "medium";
  const fd = new FormData(); fd.append("file", compressFile); fd.append("quality", quality);
  try {
    const res  = await fetch("/compress", { method:"POST", body:fd });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
    const pct = Math.max(0, Math.min(100, data.reduction_pct));
    $id("compressStats").innerHTML = `
      <div class="compress-nums">
        <div class="cn-item"><span class="cn-label">Original</span><span class="cn-val">${data.original_kb} KB</span></div>
        <div class="cn-item"><span class="cn-label">Compressed</span><span class="cn-val">${data.compressed_kb} KB</span></div>
        <div class="cn-item"><span class="cn-label">Saved</span><span class="cn-val saved">−${pct}%</span></div>
      </div>
      <div class="cbar-track"><div class="cbar-fill" style="width:${pct}%"></div></div>`;
    $id("compressDownloadBtn").href = data.download_url;
    hideProg("compressProgress"); showRes("compressResult");
  } catch (err) { hideProg("compressProgress"); showErr("compressError", err.message || "Something went wrong."); }
  finally { disableBtn("compressRunBtn", false); }
});

// ══════════════════════════════════════════════════════════
// 6. FLASHCARDS
// ══════════════════════════════════════════════════════════
let fcFile = null, fcCards = [], fcIdx = 0;

makeDropZone("fcUploadArea", "fcFileInput", files => {
  if (!isPDF(files[0])) { showErr("fcError", "Only PDF files accepted."); return; }
  fcFile = files[0];
  showBadge("fcFileName", "fcFileNameText", files[0].name);
  hideErr("fcError"); hideRes("fcResult");
});
$id("fcClearBtn").addEventListener("click", e => {
  e.stopPropagation(); fcFile = null; $id("fcFileInput").value = "";
  hideBadge("fcFileName"); hideRes("fcResult"); hideErr("fcError");
});

$id("fcRunBtn").addEventListener("click", async () => {
  if (!fcFile) { showErr("fcError", "Please select a PDF file first."); return; }
  disableBtn("fcRunBtn", true);
  hideErr("fcError"); hideRes("fcResult"); showProg("fcProgress");
  const fd = new FormData(); fd.append("file", fcFile); fd.append("max_cards", $id("fcMaxCards").value);
  try {
    const res  = await fetch("/flashcards", { method:"POST", body:fd });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
    fcCards = data.cards; fcIdx = 0;
    $id("fcCountBadge").textContent = `${data.count} card${data.count!==1?"s":""}`;
    renderCard();
    renderDots();
    renderMiniCards();
    hideProg("fcProgress"); showRes("fcResult");
  } catch (err) { hideProg("fcProgress"); showErr("fcError", err.message || "Something went wrong."); }
  finally { disableBtn("fcRunBtn", false); }
});

$id("fcCard").addEventListener("click", () => $id("fcCard").classList.toggle("flipped"));
$id("fcPrevBtn").addEventListener("click", () => { if (fcIdx > 0) { fcIdx--; renderCard(); updateDots(); } });
$id("fcNextBtn").addEventListener("click", () => { if (fcIdx < fcCards.length-1) { fcIdx++; renderCard(); updateDots(); } });

function renderCard() {
  if (!fcCards.length) return;
  $id("fcCard").classList.remove("flipped");
  $id("fcFront").textContent = fcCards[fcIdx].q;
  $id("fcBack").textContent  = fcCards[fcIdx].a;
  $id("fcCounter").textContent = `${fcIdx+1} / ${fcCards.length}`;
}

function renderDots() {
  const dots = $id("fcDots");
  const max = Math.min(fcCards.length, 30);
  dots.innerHTML = Array.from({length:max}, (_,i) =>
    `<div class="fc-dot${i===fcIdx?" active":""}" data-i="${i}"></div>`
  ).join("");
  dots.querySelectorAll(".fc-dot").forEach(d => {
    d.addEventListener("click", () => { fcIdx = parseInt(d.dataset.i); renderCard(); updateDots(); });
  });
}

function updateDots() {
  document.querySelectorAll(".fc-dot").forEach((d,i) => d.classList.toggle("active", i === fcIdx));
}

function renderMiniCards() {
  const grid = $id("fcAllCards");
  grid.innerHTML = fcCards.map((c,i) =>
    `<div class="fc-mini" data-idx="${i}"><div class="fc-mini-q">${c.q}</div><div class="fc-mini-a">${c.a}</div></div>`
  ).join("");
  grid.querySelectorAll(".fc-mini").forEach(card => {
    card.addEventListener("click", () => card.classList.toggle("revealed"));
  });
}

/* ═══════════════════════════════════════════════════════════
   NEW TOOLS — Student PDF Study Workspace v3
═══════════════════════════════════════════════════════════ */

// ── localStorage helpers ──────────────────────────────────
const LS = {
  get(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set(k, v)   { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  inc(k)      { this.set(k, (this.get(k, 0) + 1)); return this.get(k, 0); },
};

// ── Dashboard Controller ──────────────────────────────────
(function() {
  const dashArea    = $id("dashUploadArea");
  const dashInput   = $id("dashFileInput");
  const dashNotice  = $id("dashUploadNotice");
  const dashNoticeTxt = $id("dashUploadNoticeText");
  const libList     = $id("studyLibraryList");
  const countBadge  = $id("docCountBadge");
  const recsList    = $id("dashRecsList");
  const goalPills   = document.querySelectorAll(".goal-pill");
  const goalRecBox  = $id("goalRecBox");

  function getLibrary() { return LS.get("study_library", []); }
  function saveLibrary(lib) {
    LS.set("study_library", lib);
    $id("statPDFs").textContent = lib.length;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  // 1. Dashboard File Upload Dropzone
  if (dashArea && dashInput) {
    dashInput.addEventListener("click", e => e.stopPropagation());
    dashArea.addEventListener("click", () => dashInput.click());
    dashArea.addEventListener("dragover", e => { e.preventDefault(); dashArea.classList.add("dragover"); });
    dashArea.addEventListener("dragleave", () => dashArea.classList.remove("dragover"));
    dashArea.addEventListener("drop", e => {
      e.preventDefault(); dashArea.classList.remove("dragover");
      if (e.dataTransfer.files.length) handleDashFiles([...e.dataTransfer.files]);
    });
    dashInput.addEventListener("change", () => {
      if (dashInput.files.length) handleDashFiles([...dashInput.files]);
    });
  }

  function handleDashFiles(files) {
    const lib = getLibrary();
    let addedCount = 0;
    files.forEach(f => {
      const ext = f.name.split(".").pop().toUpperCase();
      const existing = lib.findIndex(d => d.name === f.name);
      const docEntry = {
        id: Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        name: f.name,
        ext: ext,
        size: formatBytes(f.size),
        rawSize: f.size,
        date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        timestamp: Date.now(),
      };
      if (existing > -1) {
        lib[existing] = docEntry;
      } else {
        lib.unshift(docEntry);
      }
      addedCount++;
      LS.inc("stat_pdfs");
    });

    saveLibrary(lib);
    renderLibrary();
    renderRecommendations();

    if (dashNotice && dashNoticeTxt) {
      dashNoticeTxt.textContent = `✓ Added ${addedCount} file${addedCount > 1 ? "s" : ""} to your study workspace`;
      dashNotice.classList.remove("hidden");
      setTimeout(() => dashNotice.classList.add("hidden"), 3500);
    }
  }

  // 2. Render Study Library
  function renderLibrary() {
    const lib = getLibrary();
    if (countBadge) countBadge.textContent = `${lib.length} file${lib.length !== 1 ? "s" : ""}`;
    if (!libList) return;

    if (!lib.length) {
      libList.innerHTML = `<div class="recent-empty">No documents in library yet.<br>Drop a PDF or document above to activate 1-click tools.</div>`;
      return;
    }

    libList.innerHTML = lib.slice(0, 8).map(d => {
      const icon = d.ext === "PDF" ? "📄" : d.ext === "DOCX" ? "📘" : (d.ext === "JPG" || d.ext === "PNG") ? "🖼️" : "📑";
      return `
        <div class="lib-item">
          <div class="lib-header">
            <div class="lib-title-wrap">
              <div class="lib-icon">${icon}</div>
              <div style="overflow:hidden">
                <div class="lib-title" title="${d.name}">${d.name}</div>
                <div class="lib-meta">${d.ext} · ${d.size} · Added ${d.date}</div>
              </div>
            </div>
            <button class="lib-del-btn" data-id="${d.id}" title="Remove file">✕</button>
          </div>
          <div class="lib-actions">
            <button class="lib-act-btn" onclick="switchTool('summary')">⚡ Summarize</button>
            <button class="lib-act-btn" onclick="switchTool('askpdf')">💬 Ask PDF</button>
            <button class="lib-act-btn" onclick="switchTool('notes')">📝 Notes</button>
            <button class="lib-act-btn" onclick="switchTool('quiz')">🎯 Quiz</button>
            <button class="lib-act-btn" onclick="switchTool('flashcards')">📇 Flashcards</button>
            <button class="lib-act-btn" onclick="switchTool('planner')">📅 Planner</button>
            <button class="lib-act-btn" onclick="switchTool('converter')">🔄 Convert</button>
          </div>
        </div>`;
    }).join("");

    libList.querySelectorAll(".lib-del-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const updated = getLibrary().filter(d => d.id !== id);
        saveLibrary(updated);
        renderLibrary();
        renderRecommendations();
      });
    });
  }

  // 3. Personalized AI Recommendations
  function renderRecommendations() {
    if (!recsList) return;
    const lib = getLibrary();
    const quizzes = LS.get("stat_quizzes", 0);
    const summaries = LS.get("stat_summaries", 0);
    const notes = LS.get("stat_notes", 0);
    const bookmarks = LS.get("bookmarks", []).length;

    let recs = [];

    if (lib.length > 0) {
      const topDoc = lib[0].name;
      recs.push({
        tag: "Exam Prep",
        title: `Generate Exam Revision Sheet for ${topDoc}`,
        desc: "Condense this document into high-yield formulas, key concepts, and exam questions.",
        btn: "Summarize PDF",
        tool: "summary"
      });
      recs.push({
        tag: "Active Recall",
        title: `Test Knowledge with 10-Question Quiz`,
        desc: "Generate an instant self-assessment quiz with MCQ, True/False, and explanations.",
        btn: "Start Quiz",
        tool: "quiz"
      });
      recs.push({
        tag: "Study Schedule",
        title: `Create Day-by-Day Study Plan`,
        desc: "Distribute chapters across your available study days and set milestones.",
        btn: "Generate Plan",
        tool: "planner"
      });
      if (lib.some(d => d.ext === "PDF")) {
        recs.push({
          tag: "AI Assistant",
          title: `Chat & Ask Questions on ${topDoc}`,
          desc: "Ask complex doubts and get page-referenced answers directly from the PDF.",
          btn: "Open Ask PDF",
          tool: "askpdf"
        });
      }
    } else {
      recs.push({
        tag: "Quick Start",
        title: "Upload a Textbook or Lecture PDF",
        desc: "Drop your study material in the box above to unlock automatic AI notes, quizzes, and summaries.",
        btn: "Upload File",
        action: () => { if (dashInput) dashInput.click(); }
      });
      recs.push({
        tag: "Universal Tool",
        title: "Convert PDF ↔ Word, Text & Images",
        desc: "Easily convert notes to Word (.docx), extract text, or compile photos into a PDF.",
        btn: "Universal Converter",
        tool: "converter"
      });
      recs.push({
        tag: "Flashcards",
        title: "Interactive Study Flashcards",
        desc: "Master key definitions and terms with flipped study cards.",
        btn: "Explore Flashcards",
        tool: "flashcards"
      });
    }

    if (bookmarks > 0) {
      recs.unshift({
        tag: "Revision",
        title: `Review ${bookmarks} Saved Bookmarks`,
        desc: "Quickly access critical textbook pages you marked for upcoming tests.",
        btn: "View Bookmarks",
        tool: "bookmarks"
      });
    }

    recsList.innerHTML = recs.slice(0, 3).map(r => `
      <div class="rec-card">
        <div class="rec-tag">${r.tag}</div>
        <div class="rec-title">${r.title}</div>
        <div class="rec-desc">${r.desc}</div>
        <button class="rec-btn" type="button" data-tool="${r.tool || ''}">
          <span>${r.btn}</span> →
        </button>
      </div>`).join("");

    recsList.querySelectorAll(".rec-btn").forEach((b, idx) => {
      b.addEventListener("click", () => {
        const item = recs[idx];
        if (item.action) {
          item.action();
        } else if (item.tool) {
          switchTool(item.tool);
        }
      });
    });
  }

  // 4. Study Goal Selector
  const GOAL_CONFIG = {
    exam: {
      title: "Exam Preparation & High-Yield Mastery",
      desc: "Optimized workflow to score maximum marks with minimum study time.",
      tools: [
        { name: "AI Summary (Exam Mode)", desc: "Extract core formulas, definitions, and high-frequency topics", tool: "summary" },
        { name: "Question Paper Analyzer", desc: "Identify recurring question topics from past papers", tool: "qanalyzer" },
        { name: "Quiz Generator", desc: "Practice active recall with automated MCQs and answer keys", tool: "quiz" },
        { name: "Flashcard Generator", desc: "Spaced-repetition study cards for formula memorization", tool: "flashcards" }
      ]
    },
    deep: {
      title: "Deep Conceptual Understanding",
      desc: "Ideal for breaking down difficult textbook chapters and comprehensive learning.",
      tools: [
        { name: "Ask PDF (Interactive Chat)", desc: "Ask questions, explore derivations, and get exact page quotes", tool: "askpdf" },
        { name: "Notes Generator", desc: "Structured, hierarchical notes organized by concepts", tool: "notes" },
        { name: "Image Extractor", desc: "Extract diagrams, graphs, and visual charts from textbooks", tool: "images" }
      ]
    },
    revision: {
      title: "1-Day Rapid Revision",
      desc: "Fastest way to refresh your entire syllabus before entering the exam hall.",
      tools: [
        { name: "One-Day Revision Summary", desc: "Ultra-condensed 1-page cheatsheet of the whole document", tool: "summary" },
        { name: "Study Bookmarks", desc: "Revisit your pinned pages and exam hints", tool: "bookmarks" },
        { name: "Syllabus Tracker", desc: "Track completed chapters and mark topics needing review", tool: "syllabus" }
      ]
    },
    convert: {
      title: "File Conversion & Document Utilities",
      desc: "Format switching, merging, compressing, and splitting student documents.",
      tools: [
        { name: "Universal File Converter", desc: "Convert PDF ↔ DOCX, TXT, or compile camera photos into PDF", tool: "converter" },
        { name: "PDF Merger", desc: "Combine multiple lecture handouts into one document", tool: "merge" },
        { name: "PDF Compressor", desc: "Reduce file size for submitting assignments", tool: "compress" },
        { name: "PDF Splitter", desc: "Extract specific chapters or problem sets", tool: "split" }
      ]
    }
  };

  function renderGoal(goalKey) {
    goalPills.forEach(p => p.classList.toggle("active", p.dataset.goal === goalKey));
    const cfg = GOAL_CONFIG[goalKey] || GOAL_CONFIG.exam;
    if (!goalRecBox) return;

    goalRecBox.innerHTML = `
      <div style="margin-bottom:6px">
        <div style="font-size:13.5px;font-weight:500;color:var(--amber)">${cfg.title}</div>
        <div style="font-size:12px;color:var(--text-dim);margin-top:2px">${cfg.desc}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${cfg.tools.map(t => `
          <div class="goal-rec-item">
            <div class="goal-rec-info">
              <div class="goal-rec-name">${t.name}</div>
              <div class="goal-rec-desc">${t.desc}</div>
            </div>
            <button class="goal-rec-action" type="button" onclick="switchTool('${t.tool}')">Launch →</button>
          </div>`).join("")}
      </div>`;
  }

  goalPills.forEach(p => {
    p.addEventListener("click", () => renderGoal(p.dataset.goal));
  });

  function updateDashboard() {
    const lib = getLibrary();
    $id("statPDFs").textContent       = lib.length || LS.get("stat_pdfs", 0);
    $id("statFlashcards").textContent = LS.get("stat_flashcards", 0);
    $id("statQuizzes").textContent    = LS.get("stat_quizzes", 0);
    $id("statSummaries").textContent  = LS.get("stat_summaries", 0);
    $id("statNotes").textContent      = LS.get("stat_notes", 0);
    $id("statBookmarks").textContent  = LS.get("bookmarks", []).length;

    renderLibrary();
    renderRecommendations();
    renderGoal("exam");
  }

  // Refresh dashboard when navigating to it
  document.querySelectorAll('.nav-item[data-tool="dashboard"]').forEach(b =>
    b.addEventListener("click", updateDashboard));

  updateDashboard();
})();

// ── TTS helper ────────────────────────────────────────────
function makeTTS(getText, btnId, speedId) {
  const btn = $id(btnId);
  if (!btn || !window.speechSynthesis) return;
  let utterance = null;
  btn.addEventListener("click", () => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      btn.textContent = "▶ Play";
      btn.classList.remove("playing");
      utterance = null;
      return;
    }
    const text = getText();
    if (!text) return;
    utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = parseFloat($id(speedId)?.value || 1);
    utterance.onend = () => { btn.textContent = "▶ Play"; btn.classList.remove("playing"); };
    window.speechSynthesis.speak(utterance);
    btn.textContent = "⏹ Stop";
    btn.classList.add("playing");
  });
}

// ── AI Summary ────────────────────────────────────────────
(function() {
  let sumFile = null;
  let sumMode = "medium";
  let sumText = "";

  makeDropZone("sumUploadArea", "sumFileInput", fs => {
    if (!isPDF(fs[0])) return showErr("sumError", "Please select a PDF file.");
    sumFile = fs[0];
    showBadge("sumFileName", "sumFileNameText", fs[0].name);
    hideErr("sumError"); hideRes("sumResult");
  });

  $id("sumClearBtn").onclick = () => {
    sumFile = null;
    hideBadge("sumFileName");
    hideRes("sumResult"); hideErr("sumError");
  };

  document.querySelectorAll("#tool-summary .mode-tab").forEach(t => {
    t.onclick = () => {
      document.querySelectorAll("#tool-summary .mode-tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      sumMode = t.dataset.mode;
    };
  });

  $id("sumRunBtn").onclick = async () => {
    if (!sumFile) return showErr("sumError", "Please select a PDF file.");
    hideErr("sumError"); hideRes("sumResult");
    showProg("sumProgress"); disableBtn("sumRunBtn", true);

    const fd = new FormData();
    fd.append("file", sumFile);
    fd.append("mode", sumMode);
    try {
      const r = await fetch("/summarize", { method: "POST", body: fd });
      const d = await r.json();
      hideProg("sumProgress");
      if (!r.ok) { showErr("sumError", d.error || "Summarization failed."); return; }

      sumText = d.summary;
      $id("sumOutput").textContent = sumText;
      $id("sumStats").innerHTML = statChips([
        ["Pages", d.page_count],
        ["Headings", d.heading_count],
        ["Mode", d.mode],
      ]);
      // Download as TXT blob
      const blob = new Blob([sumText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      $id("sumDownloadBtn").href = url;
      $id("sumDownloadBtn").download = `summary_${sumMode}.txt`;

      showRes("sumResult");
      LS.inc("stat_summaries"); LS.inc("stat_pdfs");
      window._recordDoc && _recordDoc(sumFile.name, "Summarized");
    } catch(e) {
      hideProg("sumProgress");
      showErr("sumError", "Network error: " + e.message);
    } finally {
      disableBtn("sumRunBtn", false);
    }
  };

  $id("sumCopyBtn").onclick = () => {
    navigator.clipboard.writeText(sumText).then(() => {
      $id("sumCopyBtn").textContent = "✓ Copied!";
      setTimeout(() => $id("sumCopyBtn").textContent = "📋 Copy", 1500);
    });
  };

  makeTTS(() => sumText, "sumTTSBtn", "sumTTSSpeed");
})();

// ── Ask PDF ───────────────────────────────────────────────
(function() {
  let askSession = null;
  let askFile    = null;

  makeDropZone("askUploadArea", "askFileInput", fs => {
    if (!isPDF(fs[0])) return showErr("askUploadError", "Please select a PDF file.");
    askFile = fs[0];
    showBadge("askFileName", "askFileNameText", fs[0].name);
    hideErr("askUploadError");
  });

  $id("askClearBtn").onclick = () => {
    askFile = null; hideBadge("askFileName"); hideErr("askUploadError");
  };

  $id("askUploadBtn").onclick = async () => {
    if (!askFile) return showErr("askUploadError", "Please select a PDF file.");
    hideErr("askUploadError");
    showProg("askUploadProgress"); disableBtn("askUploadBtn", true);
    const fd = new FormData();
    fd.append("file", askFile);
    try {
      const r = await fetch("/ask-pdf", { method: "POST", body: fd });
      const d = await r.json();
      hideProg("askUploadProgress");
      if (!r.ok) { showErr("askUploadError", d.error || "Upload failed."); return; }
      askSession = d.session;
      $id("askDocBadge").innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="14"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/></svg><span>${askFile.name}</span>`;
      $id("askUploadStep").style.display = "none";
      $id("askChatStep").style.display   = "";
      LS.inc("stat_pdfs");
      window._recordDoc && _recordDoc(askFile.name, "Asked questions");
    } catch(e) {
      hideProg("askUploadProgress");
      showErr("askUploadError", "Network error: " + e.message);
    } finally {
      disableBtn("askUploadBtn", false);
    }
  };

  $id("askChangePDF").onclick = () => {
    askSession = null; askFile = null;
    $id("askUploadStep").style.display = "";
    $id("askChatStep").style.display   = "none";
    $id("askChatHistory").innerHTML = `<div class="chat-empty" id="askChatEmpty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><span>Ask any question about your PDF.<br>Answers will include page references.</span></div>`;
  };

  async function sendQuestion(q) {
    if (!q.trim() || !askSession) return;
    const history = $id("askChatHistory");
    $id("askChatEmpty")?.remove();

    history.innerHTML += `<div class="chat-bubble chat-bubble--user">${q}</div>`;
    history.scrollTop = history.scrollHeight;
    $id("askSendBtn").disabled = true;

    try {
      const r = await fetch("/ask-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, pdf_session: askSession }),
      });
      const d = await r.json();
      if (!r.ok) {
        history.innerHTML += `<div class="chat-bubble chat-bubble--ai">❌ ${d.error || "Error finding answer."}</div>`;
      } else if (!d.found || !d.answers.length) {
        history.innerHTML += `<div class="chat-bubble chat-bubble--ai">I couldn't find a direct answer to that in the uploaded PDF. Try rephrasing or ask about a specific topic.</div>`;
      } else {
        const ans = d.answers[0];
        const sources = d.answers.map(a => `Source: Page ${a.page}`).join(" · ");
        history.innerHTML += `<div class="chat-bubble chat-bubble--ai">${ans.passage}<div class="source-tag">📄 ${sources}</div></div>`;
      }
    } catch(e) {
      history.innerHTML += `<div class="chat-bubble chat-bubble--ai">❌ Network error: ${e.message}</div>`;
    } finally {
      $id("askSendBtn").disabled = false;
      history.scrollTop = history.scrollHeight;
    }
  }

  $id("askSendBtn").onclick = () => {
    const inp = $id("askInput");
    sendQuestion(inp.value);
    inp.value = "";
  };
  $id("askInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { $id("askSendBtn").click(); }
  });

  document.querySelectorAll(".sug-btn").forEach(b => {
    b.onclick = () => { $id("askInput").value = b.dataset.q; $id("askSendBtn").click(); };
  });
})();

// ── Notes Generator ───────────────────────────────────────
(function() {
  let notesFile = null;
  let notesMode = "study";
  let notesText = "";

  makeDropZone("notesUploadArea", "notesFileInput", fs => {
    if (!isPDF(fs[0])) return showErr("notesError", "Please select a PDF file.");
    notesFile = fs[0];
    showBadge("notesFileName", "notesFileNameText", fs[0].name);
    hideErr("notesError"); hideRes("notesResult");
  });

  $id("notesClearBtn").onclick = () => {
    notesFile = null; hideBadge("notesFileName");
    hideRes("notesResult"); hideErr("notesError");
  };

  document.querySelectorAll("#tool-notes .mode-tab").forEach(t => {
    t.onclick = () => {
      document.querySelectorAll("#tool-notes .mode-tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      notesMode = t.dataset.mode;
    };
  });

  $id("notesRunBtn").onclick = async () => {
    if (!notesFile) return showErr("notesError", "Please select a PDF file.");
    hideErr("notesError"); hideRes("notesResult");
    showProg("notesProgress"); disableBtn("notesRunBtn", true);
    const fd = new FormData();
    fd.append("file", notesFile);
    fd.append("mode", notesMode);
    try {
      const r = await fetch("/generate-notes", { method: "POST", body: fd });
      const d = await r.json();
      hideProg("notesProgress");
      if (!r.ok) { showErr("notesError", d.error || "Failed to generate notes."); return; }
      notesText = d.notes;
      $id("notesOutput").textContent = notesText;
      $id("notesStats").innerHTML = statChips([
        ["Pages", d.page_count],
        ["Headings", d.heading_count],
        ["Definitions", d.definition_count],
        ["Mode", d.mode],
      ]);
      if (d.download_url) {
        $id("notesDownloadBtn").href = d.download_url;
        $id("notesDownloadBtn").download = `notes_${d.mode}.txt`;
      }
      showRes("notesResult");
      LS.inc("stat_notes"); LS.inc("stat_pdfs");
      window._recordDoc && _recordDoc(notesFile.name, "Notes generated");
    } catch(e) {
      hideProg("notesProgress");
      showErr("notesError", "Network error: " + e.message);
    } finally {
      disableBtn("notesRunBtn", false);
    }
  };

  $id("notesCopyBtn").onclick = () => {
    navigator.clipboard.writeText(notesText).then(() => {
      $id("notesCopyBtn").textContent = "✓ Copied!";
      setTimeout(() => $id("notesCopyBtn").textContent = "📋 Copy", 1500);
    });
  };

  makeTTS(() => notesText, "notesTTSBtn", "notesTTSSpeed");
})();

// ── Quiz Generator ────────────────────────────────────────
(function() {
  let quizFile = null;
  let questions = [];
  let current   = 0;
  let answers   = [];
  let answered  = [];

  makeDropZone("quizUploadArea", "quizFileInput", fs => {
    if (!isPDF(fs[0])) return showErr("quizError", "Please select a PDF file.");
    quizFile = fs[0];
    showBadge("quizFileName", "quizFileNameText", fs[0].name);
    hideErr("quizError");
    $id("quizArea").style.display = "none";
    $id("quizScoreArea").style.display = "none";
  });

  $id("quizClearBtn").onclick = () => {
    quizFile = null; hideBadge("quizFileName");
    $id("quizArea").style.display = "none";
  };

  $id("quizRunBtn").onclick = async () => {
    if (!quizFile) return showErr("quizError", "Please select a PDF file.");
    hideErr("quizError");
    $id("quizArea").style.display = "none";
    $id("quizScoreArea").style.display = "none";
    showProg("quizProgress"); disableBtn("quizRunBtn", true);

    const fd = new FormData();
    fd.append("file", quizFile);
    fd.append("count",      $id("quizCount").value);
    fd.append("difficulty", $id("quizDifficulty").value);
    fd.append("q_type",     $id("quizType").value);
    try {
      const r = await fetch("/generate-quiz", { method: "POST", body: fd });
      const d = await r.json();
      hideProg("quizProgress");
      if (!r.ok) { showErr("quizError", d.error || "Quiz generation failed."); return; }
      questions = d.questions;
      answers   = new Array(questions.length).fill(null);
      answered  = new Array(questions.length).fill(false);
      current   = 0;
      $id("quizArea").style.display = "";
      renderQuestion();
      LS.inc("stat_pdfs");
      window._recordDoc && _recordDoc(quizFile.name, "Quiz taken");
    } catch(e) {
      hideProg("quizProgress");
      showErr("quizError", "Network error: " + e.message);
    } finally {
      disableBtn("quizRunBtn", false);
    }
  };

  function renderQuestion() {
    const q = questions[current];
    const total = questions.length;
    $id("quizFill").style.width = `${((current) / total) * 100}%`;
    $id("quizCounter").textContent = `${current + 1} / ${total}`;
    $id("quizPrevBtn").disabled = current === 0;
    const isLast = current === total - 1;
    $id("quizNextBtn").textContent = isLast ? "Submit Quiz" : "Next →";

    let optionsHTML = "";
    if (q.type === "fillblank") {
      optionsHTML = `<input class="fill-blank-input" id="quizFillInput" placeholder="Type your answer…" value="${answers[current] || ""}">`;
    } else {
      optionsHTML = `<div class="quiz-options">` +
        q.options.map((opt, i) => {
          const letters = ["A","B","C","D"];
          let cls = "quiz-opt";
          if (answered[current]) {
            if (i === q.correct) cls += " correct";
            else if (i === answers[current] && i !== q.correct) cls += " wrong";
            else if (i === answers[current]) cls += " selected";
          } else if (answers[current] === i) {
            cls += " selected";
          }
          return `<button class="${cls}" data-i="${i}" ${answered[current] ? "disabled" : ""}>
            <span class="quiz-opt-letter">${letters[i] || i}</span>${opt}
          </button>`;
        }).join("") + `</div>`;
    }

    const explHidden = answered[current] ? "" : "none";
    $id("quizQuestionArea").innerHTML = `
      <div class="quiz-question">
        <div class="quiz-q-num">Question ${current + 1} of ${total} · ${q.type.toUpperCase()}</div>
        <div class="quiz-q-text">${q.question}</div>
        ${optionsHTML}
        <div class="quiz-explanation" id="quizExpl" style="display:${explHidden}">
          ${q.explanation}
          <div class="quiz-source">📄 Source: Page ${q.page}</div>
        </div>
      </div>`;

    if (q.type === "fillblank") {
      $id("quizFillInput").addEventListener("input", e => { answers[current] = e.target.value; });
    } else {
      document.querySelectorAll(".quiz-opt").forEach(btn => {
        btn.addEventListener("click", () => {
          if (answered[current]) return;
          answers[current] = parseInt(btn.dataset.i);
          answered[current] = true;
          renderQuestion();
          if ($id("quizExpl")) $id("quizExpl").style.display = "";
        });
      });
    }
  }

  $id("quizPrevBtn").onclick = () => { if (current > 0) { current--; renderQuestion(); } };

  $id("quizNextBtn").onclick = () => {
    // For fill-blank, capture answer
    const fi = $id("quizFillInput");
    if (fi) { answers[current] = fi.value.trim(); answered[current] = true; }

    if (current < questions.length - 1) {
      current++;
      renderQuestion();
    } else {
      showScore();
    }
  };

  function showScore() {
    let correct = 0;
    questions.forEach((q, i) => {
      if (q.type === "fillblank") {
        const userAns = (answers[i] || "").toLowerCase().trim();
        const correctAns = (q.correct || "").toLowerCase().trim();
        if (userAns === correctAns || correctAns.includes(userAns)) correct++;
      } else {
        if (answers[i] === q.correct) correct++;
      }
    });
    const total = questions.length;
    const pct = Math.round((correct / total) * 100);
    $id("quizArea").style.display = "none";
    $id("quizScoreArea").style.display = "";
    $id("quizScoreArea").innerHTML = `
      <div class="quiz-score-screen">
        <div class="score-circle"><div class="score-pct">${pct}%</div><div class="score-label">Score</div></div>
        <div class="score-chips">
          <div class="score-chip correct">✓ Correct: ${correct}</div>
          <div class="score-chip wrong">✗ Wrong: ${total - correct}</div>
        </div>
        <button class="quiz-nav-btn quiz-nav-btn--primary" id="quizRetryBtn">↺ Retry Quiz</button>
      </div>`;
    $id("quizRetryBtn").onclick = () => {
      answers  = new Array(questions.length).fill(null);
      answered = new Array(questions.length).fill(false);
      current  = 0;
      $id("quizScoreArea").style.display = "none";
      $id("quizArea").style.display = "";
      renderQuestion();
    };
    LS.inc("stat_quizzes");
  }
})();

// ── Question Paper Analyzer ────────────────────────────────
(function() {
  let qaFile = null;
  makeDropZone("qaUploadArea", "qaFileInput", fs => {
    if (!isPDF(fs[0])) return showErr("qaError", "Please select a PDF file.");
    qaFile = fs[0];
    showBadge("qaFileName", "qaFileNameText", fs[0].name);
    hideErr("qaError"); hideRes("qaResult");
  });
  $id("qaClearBtn").onclick = () => { qaFile = null; hideBadge("qaFileName"); hideRes("qaResult"); };

  $id("qaRunBtn").onclick = async () => {
    if (!qaFile) return showErr("qaError", "Please select a PDF file.");
    hideErr("qaError"); hideRes("qaResult");
    showProg("qaProgress"); disableBtn("qaRunBtn", true);
    const fd = new FormData();
    fd.append("file", qaFile);
    try {
      const r = await fetch("/analyze-questions", { method: "POST", body: fd });
      const d = await r.json();
      hideProg("qaProgress");
      if (!r.ok) { showErr("qaError", d.error || "Analysis failed."); return; }

      $id("qaStats").innerHTML = statChips([
        ["Pages", d.page_count],
        ["Questions Found", d.question_count],
        ["Topics", d.frequent_topics.length],
      ]);

      // Topics
      $id("qaTopicList").innerHTML = d.frequent_topics.slice(0,10).map((t,i) =>
        `<div class="topic-item">
          <span class="topic-rank">${i+1}</span>
          <span class="topic-name">${t.topic}</span>
          <span class="topic-badge ${(t.importance||'low').toLowerCase()}">${t.importance||'Low'}</span>
        </div>`).join("") || "<div style='color:var(--text-muted);font-size:13px'>No frequent topics detected.</div>";

      // Keywords
      $id("qaKeywords").innerHTML = d.keyword_cloud.slice(0,20).map(k =>
        `<span class="kw-tag">${k.word} <small style="opacity:.5">${k.count}</small></span>`).join("");

      // Repeated questions
      if (d.repeated_questions.length) {
        $id("qaRepeatedBlock").style.display = "";
        $id("qaRepeatedList").innerHTML = d.repeated_questions.map(q =>
          `<div class="repeated-item">${q}</div>`).join("");
      }

      showRes("qaResult");
      LS.inc("stat_pdfs");
      window._recordDoc && _recordDoc(qaFile.name, "Paper analyzed");
    } catch(e) {
      hideProg("qaProgress");
      showErr("qaError", "Network error: " + e.message);
    } finally {
      disableBtn("qaRunBtn", false);
    }
  };
})();

// ── Study Planner ─────────────────────────────────────────
(function() {
  let planFile = null;
  makeDropZone("planUploadArea", "planFileInput", fs => {
    if (!isPDF(fs[0])) return showErr("planError", "Please select a PDF file.");
    planFile = fs[0];
    showBadge("planFileName", "planFileNameText", fs[0].name);
    hideErr("planError"); hideRes("planResult");
  });
  $id("planClearBtn").onclick = () => { planFile = null; hideBadge("planFileName"); hideRes("planResult"); };

  $id("planRunBtn").onclick = async () => {
    if (!planFile) return showErr("planError", "Please select a PDF file.");
    hideErr("planError"); hideRes("planResult");
    showProg("planProgress"); disableBtn("planRunBtn", true);
    const fd = new FormData();
    fd.append("file", planFile);
    fd.append("exam_date",    $id("planExamDate").value);
    fd.append("hours_per_day",$id("planHours").value);
    fd.append("total_days",   $id("planDays").value);
    try {
      const r = await fetch("/study-plan", { method: "POST", body: fd });
      const d = await r.json();
      hideProg("planProgress");
      if (!r.ok) { showErr("planError", d.error || "Plan generation failed."); return; }

      $id("planStats").innerHTML = statChips([
        ["Days", d.total_days],
        ["Chapters", d.chapter_count],
        ["Pages", d.page_count],
        ["Est. Hours", d.estimated_total_hours],
      ]);

      $id("planTimeline").innerHTML = d.plan.map(day => `
        <div class="plan-day">
          <div class="plan-day-marker">
            <div class="plan-day-num">Day ${day.day}</div>
            <div class="plan-day-dot ${day.type}"></div>
            <div class="plan-day-line"></div>
          </div>
          <div class="plan-day-content">
            <div class="plan-day-date">${day.date}</div>
            <div class="plan-type-badge ${day.type}">${day.type.toUpperCase()}</div>
            <div class="plan-day-topics">
              ${day.topics.map(t => `<div class="plan-topic">• ${t}</div>`).join("")}
            </div>
            <div class="plan-hours">⏱ ${day.hours} hrs · Pages: ${day.pages}</div>
          </div>
        </div>`).join("");

      showRes("planResult");
      LS.inc("stat_pdfs");
      window._recordDoc && _recordDoc(planFile.name, "Study plan created");
    } catch(e) {
      hideProg("planProgress");
      showErr("planError", "Network error: " + e.message);
    } finally {
      disableBtn("planRunBtn", false);
    }
  };
})();

// ── Syllabus Tracker ──────────────────────────────────────
(function() {
  let sylFile = null;
  let sylTopics = [];

  makeDropZone("sylUploadArea", "sylFileInput", fs => {
    if (!isPDF(fs[0])) return showErr("sylError", "Please select a PDF file.");
    sylFile = fs[0];
    showBadge("sylFileName", "sylFileNameText", fs[0].name);
    hideErr("sylError"); hideRes("sylResult");
  });
  $id("sylClearBtn").onclick = () => { sylFile = null; hideBadge("sylFileName"); hideRes("sylResult"); };

  $id("sylRunBtn").onclick = async () => {
    if (!sylFile) return showErr("sylError", "Please select a PDF file.");
    hideErr("sylError"); hideRes("sylResult");
    showProg("sylProgress"); disableBtn("sylRunBtn", true);
    const fd = new FormData();
    fd.append("file", sylFile);
    // Reuse notes endpoint to extract headings as "topics"
    fd.append("mode", "study");
    try {
      const r = await fetch("/generate-notes", { method: "POST", body: fd });
      const d = await r.json();
      hideProg("sylProgress");
      if (!r.ok) { showErr("sylError", d.error || "Failed to extract topics."); return; }

      // Extract lines starting with •, ☑, ##, etc as topics
      const lines = (d.notes || "").split("\n").filter(l => l.trim().length > 5);
      sylTopics = lines.slice(0, 40).map((l, i) => ({
        id: i,
        text: l.replace(/^[•★☑→#\-\s]+/, "").trim(),
        status: "not_started",
      })).filter(t => t.text.length > 3);

      if (!sylTopics.length) { showErr("sylError", "No topics detected. Try a text-rich syllabus PDF."); return; }

      renderSyllabus();
      showRes("sylResult");
      LS.inc("stat_pdfs");
    } catch(e) {
      hideProg("sylProgress");
      showErr("sylError", "Network error: " + e.message);
    } finally {
      disableBtn("sylRunBtn", false);
    }
  };

  function renderSyllabus() {
    $id("sylList").innerHTML = sylTopics.map(t => `
      <div class="syllabus-item">
        <span class="syllabus-item-text">${t.text}</span>
        <select class="syllabus-status-select" data-id="${t.id}">
          <option value="not_started" ${t.status==="not_started"?"selected":""}>Not Started</option>
          <option value="studying"    ${t.status==="studying"?"selected":""}>Studying</option>
          <option value="completed"   ${t.status==="completed"?"selected":""}>Completed ✓</option>
          <option value="revision"    ${t.status==="revision"?"selected":""}>Needs Revision</option>
        </select>
      </div>`).join("");

    document.querySelectorAll(".syllabus-status-select").forEach(sel => {
      sel.addEventListener("change", () => {
        const topic = sylTopics.find(t => t.id === parseInt(sel.dataset.id));
        if (topic) { topic.status = sel.value; sel.className = `syllabus-status-select ${sel.value}`; }
        updateProgress();
      });
    });
    updateProgress();
  }

  function updateProgress() {
    const completed = sylTopics.filter(t => t.status === "completed").length;
    const pct = sylTopics.length ? Math.round((completed / sylTopics.length) * 100) : 0;
    $id("sylPct").textContent = pct + "%";
    $id("sylProgressBar").style.width = pct + "%";
  }
})();

// ── Bookmarks ─────────────────────────────────────────────
(function() {
  function getBookmarks() { return LS.get("bookmarks", []); }
  function saveBookmarks(bm) { LS.set("bookmarks", bm); }

  function renderBookmarks() {
    const list = $id("bmList");
    if (!list) return;
    const bm = getBookmarks();
    if (!bm.length) {
      list.innerHTML = '<div class="bookmark-empty">📌 No bookmarks yet.<br>Add a page above to get started.</div>';
      return;
    }
    list.innerHTML = `<div class="bookmark-list">` +
      bm.map((b, i) => `
        <div class="bookmark-item">
          <div class="bookmark-page">Pg ${b.page}</div>
          <div class="bookmark-info">
            <div class="bookmark-note">${b.note || "Bookmark"}</div>
            <div class="bookmark-doc">${b.doc || "Unknown document"}</div>
          </div>
          <button class="bookmark-del" data-i="${i}">✕</button>
        </div>`).join("") + "</div>";
    document.querySelectorAll(".bookmark-del").forEach(btn => {
      btn.onclick = () => {
        const bm2 = getBookmarks();
        bm2.splice(parseInt(btn.dataset.i), 1);
        saveBookmarks(bm2);
        renderBookmarks();
      };
    });
  }

  const addBtn = $id("bmAddBtn");
  if (addBtn) {
    addBtn.onclick = () => {
      const pageEl = $id("bmPage");
      const noteEl = $id("bmNote");
      const docEl  = $id("bmDoc");
      const page = pageEl ? parseInt(pageEl.value) : 0;
      const note = noteEl ? noteEl.value.trim() : "";
      const doc  = docEl ? docEl.value.trim() : "";
      if (!page || page < 1) { alert("Please enter a valid page number."); return; }
      const bm = getBookmarks();
      bm.unshift({ page, note: note || "Bookmark", doc: doc || "Untitled" });
      saveBookmarks(bm);
      if (pageEl) pageEl.value = "";
      if (noteEl) noteEl.value = "";
      renderBookmarks();
    };
  }

  // Refresh when navigating
  document.querySelectorAll('.nav-item[data-tool="bookmarks"]').forEach(b =>
    b.addEventListener("click", renderBookmarks));
  renderBookmarks();
})();

// ── Universal File Converter ──────────────────────────────
(function() {
  const convOpts      = document.querySelectorAll(".conv-opt");
  const singleWrap    = $id("convSingleUpload");
  const multiWrap     = $id("convMultiUpload");
  const uploadArea    = $id("convUploadArea");
  const fileInput     = $id("convFileInput");
  const uploadTitle   = $id("convUploadTitle");
  const uploadSub     = $id("convUploadSub");
  const imgArea       = $id("convImgUploadArea");
  const imgInput      = $id("convImgFileInput");
  const fileBadge     = $id("convFileName");
  const fileNameTxt   = $id("convFileNameText");
  const clearBtn      = $id("convClearBtn");
  const imgFileList   = $id("convImgFileList");
  const runBtn        = $id("convRunBtn");
  const progress      = $id("convProgress");
  const progTxt       = $id("convProgressText");
  const errDiv        = $id("convError");
  const result        = $id("convResult");
  const resultLabel   = $id("convResultLabel");
  const dlBtn         = $id("convDownloadBtn");
  const statsDiv      = $id("convStats");

  if (!runBtn) return;

  let selectedFile = null;
  let selectedImgs = [];
  let currentMode  = "pdf-to-docx";

  const MODE_CONFIG = {
    "pdf-to-docx": {
      accept: ".pdf",
      title: "Drop your PDF here",
      sub: "Convert PDF to editable Word document (.docx)",
      multi: false,
      label: "PDF → DOCX",
      actionText: "Converting to DOCX…",
      outExt: ".docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    },
    "pdf-to-txt": {
      accept: ".pdf",
      title: "Drop your PDF here",
      sub: "Extract plain text cleanly (.txt)",
      multi: false,
      label: "PDF → TXT",
      actionText: "Extracting text…",
      outExt: ".txt",
      mime: "text/plain"
    },
    "pdf-to-images": {
      accept: ".pdf",
      title: "Drop your PDF here",
      sub: "Render all pages as high-res PNGs packaged into a ZIP (.zip)",
      multi: false,
      label: "PDF → Images",
      actionText: "Rendering page images…",
      outExt: ".zip",
      mime: "application/zip"
    },
    "docx-to-pdf": {
      accept: ".docx",
      title: "Drop your Word document (.docx) here",
      sub: "Convert DOCX to clean formatted PDF (.pdf)",
      multi: false,
      label: "DOCX → PDF",
      actionText: "Converting Word to PDF…",
      outExt: ".pdf",
      mime: "application/pdf"
    },
    "txt-to-pdf": {
      accept: ".txt",
      title: "Drop your plain text file (.txt) here",
      sub: "Format text into standard A4 PDF document (.pdf)",
      multi: false,
      label: "TXT → PDF",
      actionText: "Building PDF from text…",
      outExt: ".pdf",
      mime: "application/pdf"
    },
    "images-to-pdf": {
      accept: "image/jpeg,image/png,image/webp",
      title: "Drop JPG, PNG, or WebP images here",
      sub: "Select one or multiple photos/scans to combine into 1 PDF",
      multi: true,
      label: "Images → PDF",
      actionText: "Combining images into PDF…",
      outExt: ".pdf",
      mime: "application/pdf"
    }
  };

  function setMode(mode, keepFile = false) {
    currentMode = mode;
    convOpts.forEach(opt => {
      const isCur = opt.dataset.mode === mode;
      opt.classList.toggle("active", isCur);
      const radio = opt.querySelector('input[type="radio"]');
      if (radio) radio.checked = isCur;
    });

    const cfg = MODE_CONFIG[mode] || MODE_CONFIG["pdf-to-docx"];
    if (cfg.multi) {
      singleWrap.style.display = "none";
      multiWrap.style.display  = "";
    } else {
      singleWrap.style.display = "";
      multiWrap.style.display  = "none";
      if (fileInput) fileInput.accept = cfg.accept;
      if (uploadTitle) uploadTitle.textContent = cfg.title;
      if (uploadSub) uploadSub.innerHTML = `or <u>click to browse</u> — ${cfg.sub}`;
    }

    // Check if the currently loaded file is compatible
    if (!keepFile) {
      if (selectedFile) {
        const ext = "." + selectedFile.name.split(".").pop().toLowerCase();
        const allowedExts = cfg.accept.split(",").map(e => e.trim().toLowerCase());
        const isCompatible = allowedExts.some(e => e === ext || e === "*/*");
        if (!isCompatible) {
          resetUploads();
        }
      } else if (!cfg.multi && selectedImgs.length > 0) {
        resetUploads();
      }
    }
  }

  convOpts.forEach(opt => {
    opt.addEventListener("click", () => {
      setMode(opt.dataset.mode);
    });
  });

  // Single file dropzone wiring
  if (fileInput) {
    fileInput.addEventListener("click", e => e.stopPropagation());
    fileInput.addEventListener("change", () => {
      if (fileInput.files.length) {
        handleIncomingFile(fileInput.files[0]);
      }
    });
  }

  if (uploadArea) {
    uploadArea.addEventListener("click", () => {
      if (fileInput) {
        fileInput.value = "";
        fileInput.click();
      }
    });
    uploadArea.addEventListener("dragover", e => { e.preventDefault(); uploadArea.classList.add("dragover"); });
    uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("dragover"));
    uploadArea.addEventListener("drop", e => {
      e.preventDefault();
      uploadArea.classList.remove("dragover");
      if (e.dataTransfer.files.length) {
        handleIncomingFile(e.dataTransfer.files[0]);
      }
    });
  }

  // Multi-image dropzone wiring
  if (imgInput) {
    imgInput.addEventListener("click", e => e.stopPropagation());
    imgInput.addEventListener("change", () => {
      if (imgInput.files.length) {
        addImages([...imgInput.files]);
      }
    });
  }

  if (imgArea) {
    imgArea.addEventListener("click", () => {
      if (imgInput) {
        imgInput.value = "";
        imgInput.click();
      }
    });
    imgArea.addEventListener("dragover", e => { e.preventDefault(); imgArea.classList.add("dragover"); });
    imgArea.addEventListener("dragleave", () => imgArea.classList.remove("dragover"));
    imgArea.addEventListener("drop", e => {
      e.preventDefault();
      imgArea.classList.remove("dragover");
      if (e.dataTransfer.files.length) {
        addImages([...e.dataTransfer.files]);
      }
    });
  }

  // Auto-detect format & populate
  function handleIncomingFile(file) {
    const ext = "." + file.name.split(".").pop().toLowerCase();

    // Auto-switch mode based on file type
    if (ext === ".docx") {
      setMode("docx-to-pdf", true);
    } else if (ext === ".txt") {
      setMode("txt-to-pdf", true);
    } else if (/\.(jpg|jpeg|png|webp)$/i.test(ext)) {
      setMode("images-to-pdf", true);
      addImages([file]);
      return;
    } else if (ext === ".pdf") {
      if (currentMode !== "pdf-to-docx" && currentMode !== "pdf-to-txt" && currentMode !== "pdf-to-images") {
        setMode("pdf-to-docx", true);
      }
    }

    selectedFile = file;
    if (fileNameTxt) fileNameTxt.textContent = `${file.name} (${formatBytes(file.size)})`;
    if (fileBadge) fileBadge.classList.remove("hidden");
    hideErr("convError"); hideRes("convResult");
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", e => {
      e.stopPropagation();
      selectedFile = null;
      if (fileInput) fileInput.value = "";
      if (fileBadge) fileBadge.classList.add("hidden");
      hideErr("convError"); hideRes("convResult");
    });
  }

  function addImages(files) {
    const valid = files.filter(f => f.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(f.name));
    if (!valid.length) {
      showErr("convError", "Please select valid image files (JPG, PNG, WebP).");
      return;
    }
    selectedImgs = [...selectedImgs, ...valid];
    renderImageList();
    hideErr("convError"); hideRes("convResult");
  }

  function renderImageList() {
    if (!imgFileList) return;
    if (!selectedImgs.length) {
      imgFileList.classList.add("hidden");
      return;
    }
    imgFileList.classList.remove("hidden");
    imgFileList.innerHTML = selectedImgs.map((f, i) => `
      <div class="file-item">
        <svg viewBox="0 0 20 20" fill="currentColor" width="16" style="color:#00dcb4;flex-shrink:0">
          <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
        </svg>
        <span class="fi-name">${i + 1}. ${f.name} <span style="color:var(--text-muted)">(${formatBytes(f.size)})</span></span>
        <button class="clear-btn img-del-btn" data-idx="${i}" title="Remove image" type="button">✕</button>
      </div>`).join("");

    imgFileList.querySelectorAll(".img-del-btn").forEach(b => {
      b.addEventListener("click", e => {
        e.stopPropagation();
        const idx = parseInt(b.dataset.idx);
        selectedImgs.splice(idx, 1);
        renderImageList();
        hideErr("convError"); hideRes("convResult");
      });
    });
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function resetUploads() {
    selectedFile = null;
    selectedImgs = [];
    if (fileInput) fileInput.value = "";
    if (imgInput) imgInput.value = "";
    if (fileBadge) fileBadge.classList.add("hidden");
    if (imgFileList) {
      imgFileList.classList.add("hidden");
      imgFileList.innerHTML = "";
    }
    hideErr("convError"); hideRes("convResult"); hideProg("convProgress");
  }

  // Convert execution
  runBtn.addEventListener("click", async () => {
    const cfg = MODE_CONFIG[currentMode] || MODE_CONFIG["pdf-to-docx"];
    hideErr("convError"); hideRes("convResult");

    if (cfg.multi) {
      if (!selectedImgs.length) {
        showErr("convError", "Please select at least one image to combine into a PDF.");
        return;
      }
    } else {
      if (!selectedFile) {
        showErr("convError", `Please select a file to convert (${cfg.accept}).`);
        return;
      }
    }

    const fd = new FormData();
    fd.append("conversion_type", currentMode);

    if (cfg.multi) {
      selectedImgs.forEach(f => fd.append("files", f));
    } else {
      fd.append("file", selectedFile);
    }

    progTxt.textContent = cfg.actionText;
    showProg("convProgress");
    disableBtn("convRunBtn", true);
    const startTime = performance.now();

    try {
      const res = await fetch("/converter/convert", { method: "POST", body: fd });
      hideProg("convProgress");

      if (!res.ok) {
        let msg = "Conversion failed. Please verify your input file.";
        try {
          const errData = await res.json();
          msg = errData.error || msg;
        } catch (_) {}
        showErr("convError", msg);
        return;
      }

      const blob = await res.blob();
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      const url = URL.createObjectURL(blob);

      let outFileName = "converted" + cfg.outExt;
      if (cfg.multi) {
        outFileName = "combined_images.pdf";
      } else if (selectedFile) {
        const baseName = selectedFile.name.replace(/\.[^/.]+$/, "");
        outFileName = `${baseName}_converted${cfg.outExt}`;
      }

      // Populate download button & stat chips
      resultLabel.textContent = `${outFileName} is ready (${formatBytes(blob.size)})`;
      dlBtn.href = url;
      dlBtn.download = outFileName;

      statsDiv.innerHTML = statChips([
        ["Mode", cfg.label],
        ["Output Size", formatBytes(blob.size)],
        ["Time", `${elapsed}s`],
        ["Status", "Ready ✓"]
      ]);

      showRes("convResult");

      // Update study stats & library
      LS.inc("stat_pdfs");
      const docs = LS.get("recent_docs", []);
      docs.unshift({
        name: outFileName,
        date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        action: `Converted (${cfg.label})`
      });
      LS.set("recent_docs", docs.slice(0, 15));
    } catch (err) {
      hideProg("convProgress");
      showErr("convError", "Network or server error: " + (err.message || "Please try again."));
    } finally {
      disableBtn("convRunBtn", false);
    }
  });

  // Initialize mode
  setMode("pdf-to-docx");
})();

// ── Auto-route tool from URL parameter or hash ───────────
(function() {
  function checkUrlTool() {
    const params = new URLSearchParams(window.location.search);
    let tool = params.get("tool");
    if (!tool && window.location.hash) {
      tool = window.location.hash.replace(/^#tool-|^#/, "");
    }
    if (tool && $id(`tool-${tool}`)) {
      switchTool(tool);
    }
  }
  window.addEventListener("DOMContentLoaded", checkUrlTool);
  checkUrlTool();
})();