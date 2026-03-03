type ReportKpi = { label: string; value: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function downloadHtmlReport(options: {
  title: string;
  rangeLabel: string;
  kpis?: ReportKpi[];
  insights?: string[];
  rawData?: unknown;
}) {
  const date = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  const kpis = options.kpis ?? [];
  const insights = options.insights ?? [];
  const raw = options.rawData ?? null;

  const kpiHtml =
    kpis.length === 0
      ? `<div class="muted">No KPI data available for this period.</div>`
      : `<div class="stat-row">${kpis
          .map(
            (k) =>
              `<div class="stat-box"><div class="value">${escapeHtml(k.value)}</div><div class="label">${escapeHtml(
                k.label
              )}</div></div>`
          )
          .join("")}</div>`;

  const insightHtml =
    insights.length === 0
      ? `<div class="muted">No insights available yet for this period.</div>`
      : insights
          .map((t) => `<div class="insight">${escapeHtml(t)}</div>`)
          .join("");

  const rawJson = escapeHtml(JSON.stringify(raw, null, 2));

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)} Report — GAK</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1a1a1a; background: white; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 13px; margin-bottom: 24px; }
    .section { margin-bottom: 20px; }
    .section h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #888; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 10px; }
    .stat-row { display: flex; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
    .stat-box { flex: 1; min-width: 160px; border: 1px solid #eee; border-radius: 8px; padding: 12px; text-align: center; }
    .stat-box .value { font-size: 20px; font-weight: 700; }
    .stat-box .label { font-size: 11px; color: #888; margin-top: 2px; }
    .insight { background: #f7f7f7; border-left: 3px solid #4a90d9; padding: 10px 14px; border-radius: 4px; margin-bottom: 8px; font-size: 13px; }
    .muted { color: #666; font-size: 13px; }
    pre { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 12px; overflow: auto; font-size: 12px; line-height: 1.5; }
    .footer { margin-top: 40px; font-size: 11px; color: #aaa; text-align: center; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(options.title)} Report</h1>
  <div class="subtitle">GAK — Gyaan Karma Ahara · ${escapeHtml(options.rangeLabel)} · Generated ${escapeHtml(date)}</div>

  <div class="section">
    <h2>Key Statistics</h2>
    ${kpiHtml}
  </div>

  <div class="section">
    <h2>Insights</h2>
    ${insightHtml}
  </div>

  <div class="section">
    <h2>Raw Data (JSON)</h2>
    <pre>${rawJson}</pre>
  </div>

  <div class="footer">GAK — DBMS Analytics Export</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const fileName = `${options.title.replace(/\s+/g, "_")}_${options.rangeLabel.replace(/\s+/g, "_")}_${new Date()
    .toISOString()
    .slice(0, 10)}.html`;

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
