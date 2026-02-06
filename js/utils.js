export const qs = (sel, scope = document) => scope.querySelector(sel);
export const qsa = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

export function show(el) {
  el.classList.remove("hidden");
}

export function hide(el) {
  el.classList.add("hidden");
}

export function setOptions(selectEl, items, labelKey = "name") {
  selectEl.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Select";
  selectEl.appendChild(empty);
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.key;
    opt.textContent = item[labelKey] || item.key;
    selectEl.appendChild(opt);
  });
}

export function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => String(cell).replace(/\"/g, '""')).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

export function safeText(value) {
  return value ? String(value) : "";
}

export function formatQuizLabel(number) {
  return `Quiz ${number}`;
}

export function formatAssignmentLabel(number) {
  return `Assignment ${number}`;
}
