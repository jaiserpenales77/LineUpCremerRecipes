// "Download Excel version": the Excel recipe finder (Find Recipe page with
// search, filters and a printable recipe card; Recipes; Update History; How to
// Use), filled with the recipes as they are in the app right now.
//
// assets/excel/cremer-recipes-template.xlsx is that workbook with every recipe
// value taken out (tools/build_excel_template.py makes it), so the public
// repository never holds recipe data. This fills its Recipes rows and Update
// History in the browser and hands the result over as a download; nothing is
// sent anywhere.
const ExcelExport = (() => {
  const TEMPLATE = "assets/excel/cremer-recipes-template.xlsx";
  const JSZIP = "assets/vendor/jszip/jszip.min.js";
  const FIRST_ROW = 3, LAST_ROW = 1000;           // Recipes rows the template's formulas cover
  const HIST_FIRST = 5, HIST_LAST = 199;          // Update History rows

  const colName = n => { let s = ""; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; } return s; };
  const COLS = Array.from({ length: 43 }, (_, i) => colName(i + 1)); // A..AQ

  const xml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const blank = v => v === undefined || v === null || v === "";
  function cell(ref, style, v) {
    const s = style != null ? ` s="${style}"` : "";
    if (blank(v)) return `<c r="${ref}"${s} t="n"></c>`;
    if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"${s} t="n"><v>${v}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  }
  // Excel's date number for the calendar day of an ISO date or time (local day).
  function serial(iso) {
    const d = String(iso).length === 10 ? new Date(iso + "T12:00:00") : new Date(iso);
    if (isNaN(d)) return "";
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 + 25569;
  }
  // The styles each cell of a template row already has.
  const stylesOf = (rowXml, rn) => Object.fromEntries([...rowXml.matchAll(new RegExp(`<c r="([A-Z]+)${rn}" s="(\\d+)"`, "g"))].map(m => [m[1], m[2]]));

  let jszip = null;
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!jszip) jszip = new Promise((ok, no) => {
      const s = document.createElement("script");
      s.src = JSZIP; s.onload = () => (window.JSZip ? ok(window.JSZip) : no(new Error("JSZip didn't load")));
      s.onerror = () => { jszip = null; no(new Error("JSZip didn't load")); };
      document.head.appendChild(s);
    });
    return jszip;
  }

  // o: { recipes, history, fieldKeys, guideDate, guideCount, sourceOf(r), byName(by), actions }
  async function build(o) {
    const [JSZip, res] = await Promise.all([loadJSZip(), fetch(TEMPLATE, { cache: "no-cache" })]);
    if (!res.ok) throw new Error("Template HTTP " + res.status);
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const recipes = o.recipes;
    if (recipes.length > LAST_ROW - FIRST_ROW + 1) throw new Error("Too many recipes for the Excel version");

    // Recipes: line, size, FG, bulk, last updated, source, ID, then the settings.
    const keys = ["line", "size", "fg", "bulk", null, null, "id", ...o.fieldKeys];
    let s3 = await zip.file("xl/worksheets/sheet3.xml").async("string");
    s3 = s3.replace(/<row r="(\d+)"([^>]*)>([\s\S]*?)(<c r="AR\1")/g, (m, rn, attrs, cells, ar) => {
      const r = recipes[+rn - FIRST_ROW];
      if (+rn < FIRST_ROW || !r) return m;
      const st = stylesOf(cells, rn);
      const vals = keys.map((k, i) => i === 4 ? serial(r.updated) : i === 5 ? o.sourceOf(r) : r[k]);
      return `<row r="${rn}"${attrs}>${COLS.map((c, i) => cell(c + rn, st[c], vals[i])).join("")}${ar}`;
    });
    zip.file("xl/worksheets/sheet3.xml", s3);

    // Update History: newest first, then the import from the recipe guides.
    const rows = o.history.filter(h => h && h.at).map(h => h.action === "imported"
      ? [serial(h.at), "", "Recipe file", `Imported ${(h.fields || []).join(", ")}`, o.byName(h.by)]
      : [serial(h.at), +h.line || "", `${h.fg}${h.bulk ? " · " + h.bulk : ""} · ${h.size} cc`,
         (o.actions[h.action] || h.action) + (h.fields && h.fields.length ? ": " + h.fields.join(", ") : ""), o.byName(h.by)]);
    const max = HIST_LAST - HIST_FIRST + 1 - (o.guideCount ? 1 : 0);
    const hist = rows.slice(0, max);
    if (o.guideCount) hist.push([serial(o.guideDate), "9 & 10", `All ${o.guideCount} recipes`, "Recipes imported from the Cremer Recipe Guides, Line 9 and Line 10 (10.06.26)", "LineUp"]);
    let s4 = await zip.file("xl/worksheets/sheet4.xml").async("string");
    s4 = s4.replace(/<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g, (m, rn, attrs, cells) => {
      const h = hist[+rn - HIST_FIRST];
      if (+rn < HIST_FIRST || !h) return m;
      const st = stylesOf(cells, rn);
      return `<row r="${rn}"${attrs}>${["A", "B", "C", "D", "E"].map((c, i) => cell(c + rn, st[c], h[i])).join("")}</row>`;
    });
    zip.file("xl/worksheets/sheet4.xml", s4);

    // When this copy was made (Find Recipe and How to Use).
    const now = new Date();
    const stamp = `Downloaded ${now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}, ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}, from the Cremer Recipes app (${recipes.length} recipes).`;
    for (const n of ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]) {
      zip.file(n, (await zip.file(n).async("string")).split("{{STAMP}}").join(xml(stamp)));
    }
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return { blob, name: `Cremer Recipes ${day}.xlsx` };
  }

  return { build };
})();
