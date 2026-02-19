// ===== Elements =====
const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileInput");
const extractBtn = document.getElementById("extractBtn");
const status = document.getElementById("status");
const imagesPerPage = document.getElementById("imagesPerPage");
const fileName = document.getElementById("fileName");
const progress = document.getElementById("progress");
const resultCard = document.getElementById("resultCard");
const downloadBtn = document.getElementById("downloadBtn");

let selectedFile = null;

// ===== Click to Upload =====
uploadArea.onclick = () => fileInput.click();

// ===== Drag Over =====
uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("dragover");
});

// ===== Drag Leave =====
uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("dragover");
});

// ===== Drop File =====
uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.classList.remove("dragover");

    selectedFile = e.dataTransfer.files[0];
    showFile();
});

// ===== File Picker =====
fileInput.onchange = () => {
    selectedFile = fileInput.files[0];
    showFile();
};

// ===== Show Selected File =====
function showFile() {
    if (!selectedFile) return;

    // Validate PDF
    if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
        status.innerText = "Only PDF files are allowed.";
        selectedFile = null;
        return;
    }

    fileName.textContent = selectedFile.name;
    fileName.classList.remove("hidden");
    status.innerText = "";
    resultCard.classList.add("hidden");
}

// ===== Extract Images =====
extractBtn.onclick = async () => {
    if (!selectedFile) {
        status.innerText = "Please select a PDF first.";
        return;
    }

    // Show progress
    progress.classList.remove("hidden");
    status.innerText = "Processing...";
    resultCard.classList.add("hidden");

    try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("images_per_page", imagesPerPage.value);

        const res = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        const data = await res.json();

        progress.classList.add("hidden");

        if (data.download_url) {
            downloadBtn.href = data.download_url;
            resultCard.classList.remove("hidden");
            status.innerText = "";
        } else {
            status.innerText = data.error || "Something went wrong.";
        }
    } catch (err) {
        progress.classList.add("hidden");
        status.innerText = "Server error. Please try again.";
    }
};
