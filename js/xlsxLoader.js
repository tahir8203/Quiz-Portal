export async function ensureXlsx() {
  if (window.XLSX) return;
  await loadScript("https://unpkg.com/xlsx@0.19.3/dist/xlsx.full.min.js");
  if (window.XLSX) return;
  await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.19.3/dist/xlsx.full.min.js");
}

function loadScript(src) {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}
