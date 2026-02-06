import { db, serverTimestamp } from "./firebase.js";
import { state } from "./state.js";
import { qs, safeText } from "./utils.js";
import { ensureXlsx } from "./xlsxLoader.js";

export function bindEnrollmentHandlers() {
  qs("#btn-upload-enrollment").addEventListener("click", uploadEnrollment);
  qs("#btn-download-enrollment-template").addEventListener("click", downloadTemplate);
  qs("#enrollment-file").addEventListener("change", handlePreview);
}

let previewRows = [];
let previewStats = { total: 0, valid: 0, skipped: 0, duplicates: 0, existing: 0 };

export async function loadEnrollmentList() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const list = qs("#enrollment-list");
  list.innerHTML = "";
  if (!classKey || !semesterKey) {
    list.textContent = "Select class and semester.";
    return;
  }
  const snap = await db.collection("enrollments")
    .where("classKey", "==", classKey)
    .where("semesterKey", "==", semesterKey)
    .get();

  if (snap.empty) {
    list.textContent = "No enrolled students.";
    return;
  }

  snap.forEach((doc) => {
    const data = doc.data();
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `<span>${safeText(data.roll)} - ${safeText(data.name)}</span>`;
    list.appendChild(row);
  });
}

async function uploadEnrollment() {
  const fileInput = qs("#enrollment-file");
  const status = qs("#enrollment-status");
  if (!state.currentClassKey || !state.currentSemesterKey) {
    alert("Select class and semester first.");
    return;
  }
  if (!fileInput.files.length) {
    alert("Choose an Excel file");
    return;
  }
  if (!previewRows.length) {
    await handlePreview();
  }
  if (!previewRows.length) {
    alert("Please select a valid Excel file with Name and Roll columns.");
    return;
  }
  if (previewStats.duplicates > 0 || previewStats.existing > 0) {
    alert("Remove duplicate roll numbers before uploading.");
    return;
  }
  const file = fileInput.files[0];
  let rows = [];
  try {
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    if (isCsv) {
      const text = await file.text();
      rows = parseCsv(text);
    } else {
      await ensureXlsx();
      if (typeof XLSX === "undefined") {
        alert("XLSX library not loaded. Please check your internet settings and retry.");
        return;
      }
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    }
  } catch (err) {
    console.error("[Enrollment] Parse error:", err);
    alert("Could not read file. Please re-save and try again.");
    return;
  }

  if (!rows.length) {
    alert("No rows found");
    return;
  }

  status.textContent = `Uploading ${rows.length} rows...`;
  console.log("[Enrollment] Rows detected:", rows.length);
  console.log("[Enrollment] Sample row:", rows[0]);
  const batch = db.batch();
  let inserted = 0;
  let skipped = 0;

  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const className = state.classList.find((c) => c.key === classKey)?.name || classKey;
  const semesterName = state.semesterList.find((s) => s.key === semesterKey)?.name || semesterKey;

  const classRef = db.collection("classes").doc(classKey);
  const semesterRef = db.collection("semesters").doc(semesterKey);
  batch.set(classRef, { name: className, archived: false, createdAt: serverTimestamp() }, { merge: true });
  batch.set(semesterRef, { name: semesterName, archived: false, createdAt: serverTimestamp() }, { merge: true });

  const existing = await db.collection("enrollments")
    .where("classKey", "==", classKey)
    .where("semesterKey", "==", semesterKey)
    .get();
  const existingRolls = new Set(existing.docs.map((doc) => String(doc.data().roll)));

  rows.forEach((row) => {
    const name = String(row.Name || row.name || "").trim();
    const roll = String(row.Roll || row.roll || row["Roll Number"] || "").trim();

    if (!name || !roll || existingRolls.has(roll)) {
      skipped += 1;
      console.warn("[Enrollment] Skipped row (missing fields):", row);
      return;
    }

    const docKey = `${classKey}_${semesterKey}_roll_${roll}`;

    const ref = db.collection("enrollments").doc(docKey);
    batch.set(ref, {
      name,
      roll,
      classKey,
      semesterKey,
      className,
      semesterName,
      createdAt: serverTimestamp()
    }, { merge: true });
    inserted += 1;
  });

  await batch.commit();
  status.textContent = `Enrollment uploaded. Inserted: ${inserted}, Skipped: ${skipped}`;
  console.log("[Enrollment] Inserted:", inserted, "Skipped:", skipped);
  fileInput.value = "";
  document.dispatchEvent(new Event("classes-updated"));
  loadEnrollmentList();
}

function downloadTemplate() {
  ensureXlsx();
  const rows = [
    ["Name", "Roll"],
    ["Student One", "BSCS-001"],
    ["Student Two", "BSCS-002"]
  ];
  const link = document.createElement("a");
  if (typeof XLSX === "undefined") {
    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    link.href = URL.createObjectURL(blob);
    link.download = "enrollment-template.csv";
    link.click();
    alert("XLSX library not loaded. Downloaded CSV template instead.");
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Enrollment");
  const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  link.href = URL.createObjectURL(blob);
  link.download = "enrollment-template.xlsx";
  link.click();
}

async function handlePreview() {
  const fileInput = qs("#enrollment-file");
  const status = qs("#enrollment-status");
  const preview = qs("#enrollment-preview");
  preview.innerHTML = "";
  previewRows = [];
  previewStats = { total: 0, valid: 0, skipped: 0, duplicates: 0, existing: 0 };

  if (!state.currentClassKey || !state.currentSemesterKey) {
    status.textContent = "Select class and semester first.";
    return;
  }
  if (!fileInput.files.length) return;

  const file = fileInput.files[0];
  let rows = [];
  try {
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    if (isCsv) {
      const text = await file.text();
      rows = parseCsv(text);
    } else {
      await ensureXlsx();
      if (typeof XLSX === "undefined") {
        status.textContent = "XLSX library not loaded. Check internet settings.";
        return;
      }
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    }
  } catch (err) {
    console.error("[Enrollment] Preview parse error:", err);
    status.textContent = "Could not read file for preview.";
    return;
  }

  previewStats.total = rows.length;
  const rollSet = new Set();
  const duplicates = new Set();
  rows.forEach((row) => {
    const name = String(row.Name || row.name || "").trim();
    const roll = String(row.Roll || row.roll || row["Roll Number"] || "").trim();
    if (!name || !roll) {
      previewStats.skipped += 1;
      return;
    }
    if (rollSet.has(roll)) {
      duplicates.add(roll);
    } else {
      rollSet.add(roll);
    }
    previewRows.push({ name, roll });
  });

  const existing = await db.collection("enrollments")
    .where("classKey", "==", state.currentClassKey)
    .where("semesterKey", "==", state.currentSemesterKey)
    .get();
  const existingRolls = new Set(existing.docs.map((doc) => String(doc.data().roll)));

  previewStats.duplicates = duplicates.size;
  previewStats.existing = previewRows.filter((row) => existingRolls.has(row.roll)).length;
  previewStats.valid = previewRows.length - previewStats.duplicates - previewStats.existing;

  status.textContent = `Rows: ${previewStats.total}, Valid: ${previewStats.valid}, Missing: ${previewStats.skipped}, Duplicates: ${previewStats.duplicates}, Existing: ${previewStats.existing}`;

  previewRows.slice(0, 50).forEach((row) => {
    const isDuplicate = duplicates.has(row.roll);
    const isExisting = existingRolls.has(row.roll);
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <span>${row.roll} - ${row.name}</span>
      <span>${isDuplicate ? "Duplicate" : isExisting ? "Already Enrolled" : "OK"}</span>
    `;
    preview.appendChild(item);
  });
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] || "";
    });
    return row;
  });
}
