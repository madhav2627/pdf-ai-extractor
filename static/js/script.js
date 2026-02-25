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
// 3. OCR
// ══════════════════════════════════════════════════════════
let ocrFile = null;

makeDropZone("ocrUploadArea", "ocrFileInput", files => {
  if (!isPDF(files[0])) { showErr("ocrError", "Only PDF files accepted."); return; }
  ocrFile = files[0];
  showBadge("ocrFileName", "ocrFileNameText", files[0].name);
  hideErr("ocrError"); hideRes("ocrResult");
});
$id("ocrClearBtn").addEventListener("click", e => {
  e.stopPropagation(); ocrFile = null; $id("ocrFileInput").value = "";
  hideBadge("ocrFileName"); hideRes("ocrResult"); hideErr("ocrError");
});
copyTextToBtn("ocrOutput", "ocrCopyBtn");

$id("ocrRunBtn").addEventListener("click", async () => {
  if (!ocrFile) { showErr("ocrError", "Please select a PDF file first."); return; }
  disableBtn("ocrRunBtn", true);
  hideErr("ocrError"); hideRes("ocrResult"); showProg("ocrProgress");
  const fd = new FormData(); fd.append("file", ocrFile);
  try {
    const res  = await fetch("/ocr", { method:"POST", body:fd });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
    $id("ocrOutput").value = data.text;
    $id("ocrStats").innerHTML = statChips([["Pages", data.page_count], ["Words", data.word_count.toLocaleString()]]);
    $id("ocrDownloadBtn").href = data.download_url;
    hideProg("ocrProgress"); showRes("ocrResult");
  } catch (err) { hideProg("ocrProgress"); showErr("ocrError", err.message || "Something went wrong."); }
  finally { disableBtn("ocrRunBtn", false); }
});

// ══════════════════════════════════════════════════════════
// 4. MERGER
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
// 5. SPLITTER
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
// 6. COMPRESSOR
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
// 7. FLASHCARDS
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