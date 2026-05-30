import React, { useMemo, useRef, useState } from "react";
import { Search, Plus, Trash2, Upload, ClipboardList, CheckCircle2, AlertTriangle, PackageSearch, FileSpreadsheet, Download, FileText, RefreshCw, X } from "lucide-react";

const initialInventory = [
  { code: "PCB-A001", name: "A产品主板", spec: "V1.2 蓝牙版", unit: "PCS", available: 120, batch: "B20260501-01", supplierBatch: "SUP-0528-A", location: "A01-03-02", boxNo: "BOX00023891", status: "合格" },
  { code: "SHELL-A001-BK", name: "A产品黑色外壳", spec: "ABS+PC 黑色", unit: "PCS", available: 84, batch: "B20260512-03", supplierBatch: "SUP-0512-SH", location: "B02-01-01", boxNo: "BOX00023940", status: "合格" },
  { code: "SCREW-M2X5-304", name: "不锈钢螺丝", spec: "M2×5 304", unit: "PCS", available: 5600, batch: "B20260420-02", supplierBatch: "SUP-SCR-0420", location: "D05-02-03", boxNo: "BOX00022018", status: "合格" },
  { code: "BAT-18650-2600", name: "18650 电芯", spec: "2600mAh 带保护", unit: "PCS", available: 38, batch: "B20260520-01", supplierBatch: "SUP-BAT-0520", location: "C01-04-01", boxNo: "BOX00024102", status: "合格" },
  { code: "LABEL-A001-CN", name: "中文铭牌标签", spec: "A产品 国内版", unit: "PCS", available: 600, batch: "B20260515-01", supplierBatch: "SUP-LAB-0515", location: "E03-01-04", boxNo: "BOX00024001", status: "合格" },
  { code: "BOX-A001", name: "A产品彩盒", spec: "国内版彩盒", unit: "PCS", available: 220, batch: "B20260510-02", supplierBatch: "SUP-PKG-0510", location: "E01-02-02", boxNo: "BOX00023902", status: "合格" },
  { code: "CABLE-A001-USB", name: "USB-C 线束", spec: "150mm 黑色", unit: "PCS", available: 16, batch: "B20260528-01", supplierBatch: "SUP-CAB-0528", location: "C03-02-01", boxNo: "BOX00024210", status: "待检" },
];

const sampleBomText = "物料编号,物料名称,数量\nPCB-A001,A产品主板,10\nSHELL-A001-BK,A产品黑色外壳,10\nSCREW-M2X5-304,不锈钢螺丝,40\nBAT-18650-2600,18650 电芯,10\nCABLE-A001-USB,USB-C 线束,10";

function cnDateTime() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function makeOrderNo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `PK${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function parseBomText(text) {
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (rows.length === 0) return [];

  const delimiter = rows[0].includes("\t") ? "\t" : rows[0].includes(",") ? "," : /\s{2,}/;
  const cells = rows.map((line) =>
    typeof delimiter === "string" ? line.split(delimiter).map((v) => v.trim()) : line.split(delimiter).map((v) => v.trim())
  );

  const header = cells[0].map(normalizeKey);
  const hasHeader = header.some((h) => ["物料编号", "物料编码", "料号", "code", "partno", "pn", "数量", "qty", "用量"].includes(h));
  const dataRows = hasHeader ? cells.slice(1) : cells;
  const codeIndex = hasHeader ? header.findIndex((h) => ["物料编号", "物料编码", "料号", "code", "partno", "pn", "p/n"].includes(h)) : 0;
  const nameIndex = hasHeader ? header.findIndex((h) => ["物料名称", "名称", "name"].includes(h)) : 1;
  const qtyIndex = hasHeader ? header.findIndex((h) => ["数量", "需求数量", "用量", "qty", "quantity", "用量/台"].includes(h)) : 2;

  return dataRows
    .map((cols, index) => ({
      lineNo: index + 1,
      code: cols[codeIndex] || "",
      name: nameIndex >= 0 ? cols[nameIndex] || "" : "",
      qty: Number((cols[qtyIndex] || "").replace(/,/g, "")),
      raw: cols.join(" | "),
    }))
    .filter((r) => r.code || r.name || Number.isFinite(r.qty));
}

function statusTone(row) {
  if (!row) return "bg-slate-100 text-slate-700";
  if (row.status !== "合格") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

function resolveRisk(item, qty) {
  if (!item) return { label: "未匹配", tone: "bg-rose-100 text-rose-800", icon: AlertTriangle };
  if (item.status !== "合格") return { label: "非合格库存", tone: "bg-amber-100 text-amber-800", icon: AlertTriangle };
  if (qty > item.available) return { label: "库存不足", tone: "bg-rose-100 text-rose-800", icon: AlertTriangle };
  return { label: "可拣货", tone: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 };
}

export default function SimplePickingSystem() {
  const [inventory] = useState(initialInventory);
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState(null);
  const [pickQty, setPickQty] = useState(1);
  const [pickList, setPickList] = useState([]);
  const [order, setOrder] = useState(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [bomText, setBomText] = useState(sampleBomText);
  const [bomRows, setBomRows] = useState([]);
  const [bomModalOpen, setBomModalOpen] = useState(false);
  const [bomFileName, setBomFileName] = useState("示例BOM.csv");
  const [orderNote, setOrderNote] = useState("MO20260530001 / A产品 10台");
  const fileInputRef = useRef(null);

  const suggestions = useMemo(() => {
    const k = normalizeKey(keyword);
    if (!k) return [];
    return inventory
      .filter((item) => [item.code, item.name, item.spec, item.batch, item.location].map(normalizeKey).some((v) => v.includes(k)))
      .slice(0, 8);
  }, [keyword, inventory]);

  const matchedBom = useMemo(() => {
    return bomRows.map((row) => {
      const byCode = inventory.find((item) => normalizeKey(item.code) === normalizeKey(row.code));
      const byName = inventory.find((item) => normalizeKey(item.name) === normalizeKey(row.name));
      const match = byCode || byName || null;
      return { ...row, item: match, pickQty: Number.isFinite(row.qty) ? row.qty : 0 };
    });
  }, [bomRows, inventory]);

  const bomSummary = useMemo(() => {
    const matched = matchedBom.filter((row) => row.item).length;
    const blocked = matchedBom.filter((row) => resolveRisk(row.item, row.pickQty).label !== "可拣货").length;
    return { total: matchedBom.length, matched, blocked };
  }, [matchedBom]);

  const totals = useMemo(() => {
    const totalLines = pickList.length;
    const blocked = pickList.filter((row) => row.item.status !== "合格" || row.qty > row.item.available).length;
    const totalQty = pickList.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    return { totalLines, blocked, totalQty };
  }, [pickList]);

  const pageIsCovered = bomModalOpen || orderModalOpen;

  function addSelected() {
    if (!selected) return;
    const qty = Number(pickQty);
    if (!Number.isFinite(qty) || qty <= 0) return;

    setPickList((prev) => {
      const existed = prev.find((row) => row.item.code === selected.code && row.item.batch === selected.batch && row.item.boxNo === selected.boxNo);
      if (existed) return prev.map((row) => (row === existed ? { ...row, qty: row.qty + qty } : row));
      return [...prev, { id: `${selected.code}-${selected.batch}-${selected.boxNo}-${Date.now()}`, item: selected, qty, source: "手动添加" }];
    });

    setKeyword("");
    setSelected(null);
    setPickQty(1);
  }

  function openBomModal(text = bomText, fileName = bomFileName) {
    setBomText(text);
    setBomFileName(fileName);
    setBomRows(parseBomText(text));
    setBomModalOpen(true);
  }

  function handleBomUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (readerEvent) => openBomModal(String(readerEvent.target?.result || ""), file.name);
    reader.readAsText(file, "UTF-8");
    event.target.value = "";
  }

  function addBomToPickList() {
    const valid = matchedBom.filter((row) => row.item && row.pickQty > 0);
    setPickList((prev) => {
      const next = [...prev];
      valid.forEach((row) => {
        const existedIndex = next.findIndex((line) => line.item.code === row.item.code && line.item.batch === row.item.batch && line.item.boxNo === row.item.boxNo);
        if (existedIndex >= 0) {
          next[existedIndex] = {
            ...next[existedIndex],
            qty: next[existedIndex].qty + row.pickQty,
            source: next[existedIndex].source.includes("BOM") ? next[existedIndex].source : `${next[existedIndex].source} + BOM`,
          };
        } else {
          next.push({ id: `${row.item.code}-${row.item.batch}-${row.item.boxNo}-${Date.now()}-${row.lineNo}`, item: row.item, qty: row.pickQty, source: "BOM导入" });
        }
      });
      return next;
    });
    setBomModalOpen(false);
  }

  function createPickOrder() {
    if (pickList.length === 0) return;
    const nextOrder = {
      orderNo: makeOrderNo(),
      createdAt: cnDateTime(),
      note: orderNote,
      rows: pickList.map((line, index) => ({ seq: index + 1, ...line, risk: resolveRisk(line.item, line.qty) })),
    };
    setOrder(nextOrder);
    setOrderModalOpen(true);
  }

  function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportOrderAsExcel() {
    if (!order) return;
    const headers = ["序号", "物料编号", "物料名称", "规格", "数量", "单位", "库位", "批次", "箱号", "状态", "签收"];
    const rows = order.rows.map((row) => [
      row.seq,
      row.item.code,
      row.item.name,
      row.item.spec,
      row.qty,
      row.item.unit,
      row.item.location,
      row.item.batch,
      row.item.boxNo,
      row.risk.label,
      "",
    ]);
    const htmlTable = `
      <html>
        <head><meta charset="UTF-8" /></head>
        <body>
          <h2>拣货表 ${order.orderNo}</h2>
          <p>生成时间：${order.createdAt}</p>
          <p>工单 / 备注：${order.note || "—"}</p>
          <table border="1">
            <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
            <tbody>${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${String(cell ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>
          <p>拣货人：________　复核人：________　产线签收：________</p>
        </body>
      </html>
    `;
    downloadTextFile(`${order.orderNo}-拣货表.xls`, htmlTable, "application/vnd.ms-excel;charset=utf-8");
    setExportMenuOpen(false);
  }

  function exportOrderAsPdf() {
    setExportMenuOpen(false);
    window.print();
  }

  function resetAll() {
    setPickList([]);
    setOrder(null);
    setOrderModalOpen(false);
    setExportMenuOpen(false);
    setSelected(null);
    setKeyword("");
    setPickQty(1);
  }

  return (
    <div className="relative min-h-screen bg-slate-50 text-slate-900">
      <div className={`mx-auto max-w-7xl px-4 py-6 transition duration-200 sm:px-6 lg:px-8 ${pageIsCovered ? "pointer-events-none select-none blur-sm" : ""}`}>
        <header className="mb-6 flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
              <PackageSearch className="h-4 w-4" />
              简易仓库拣料系统原型
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">生产领料 / BOM 批量拣货</h1>
            <p className="mt-1 text-sm text-slate-500">适合验证流程：搜索物料 → 加入清单 → 生成拣货表 → 仓库按库位、批次、箱号拿料。</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-slate-100 px-4 py-3"><div className="text-lg font-semibold">{totals.totalLines}</div><div className="text-slate-500">清单行数</div></div>
            <div className="rounded-xl bg-slate-100 px-4 py-3"><div className="text-lg font-semibold">{totals.totalQty}</div><div className="text-slate-500">合计数量</div></div>
            <div className="rounded-xl bg-slate-100 px-4 py-3"><div className={`text-lg font-semibold ${totals.blocked ? "text-rose-600" : "text-emerald-600"}`}>{totals.blocked}</div><div className="text-slate-500">异常行</div></div>
          </div>
        </header>

        <main className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="space-y-6">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">1. 添加物料</h2>
                  <p className="text-sm text-slate-500">可以单个搜索添加，也可以上传 BOM 后批量核对。</p>
                </div>
                <Search className="h-5 w-5 text-slate-400" />
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_120px_auto]">
                <div className="relative">
                  <input
                    value={keyword}
                    onChange={(e) => { setKeyword(e.target.value); setSelected(null); }}
                    placeholder="搜索物料：输入料号 / 名称 / 批次 / 库位，例如 PCB 或 外壳"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                  />
                  {suggestions.length > 0 && !selected && (
                    <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                      {suggestions.map((item) => (
                        <button
                          key={`${item.code}-${item.batch}-${item.boxNo}`}
                          onClick={() => { setSelected(item); setKeyword(`${item.code} / ${item.name}`); }}
                          className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
                        >
                          <div>
                            <div className="font-medium">{item.code}</div>
                            <div className="text-sm text-slate-500">{item.name}｜{item.spec}</div>
                            <div className="mt-1 text-xs text-slate-400">批次 {item.batch}｜库位 {item.location}｜箱号 {item.boxNo}</div>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${statusTone(item)}`}>{item.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input type="number" min="1" value={pickQty} onChange={(e) => setPickQty(e.target.value)} className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200" placeholder="数量" />
                <button onClick={addSelected} disabled={!selected} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                  <Plus className="h-4 w-4" />加入清单
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 font-medium text-slate-800"><FileSpreadsheet className="h-4 w-4" />BOM 批量添加</div>
                    <p className="mt-1 text-sm text-slate-500">上传 CSV / TXT / 复制自 Excel 的表格文本，上传后进入独立核对窗口。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input ref={fileInputRef} type="file" accept=".csv,.txt,.tsv" onChange={handleBomUpload} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"><Upload className="h-4 w-4" />上传 BOM</button>
                    <button onClick={() => openBomModal(sampleBomText, "示例BOM.csv")} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">打开示例核对</button>
                  </div>
                </div>
              </div>

              {selected && (
                <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
                  <div className="mb-2 flex items-center justify-between"><div className="font-medium">已选择：{selected.code}</div><span className={`rounded-full px-2 py-1 text-xs ${statusTone(selected)}`}>{selected.status}</span></div>
                  <div className="grid gap-2 text-slate-600 md:grid-cols-2">
                    <div>名称：{selected.name}</div><div>规格：{selected.spec}</div><div>可用库存：{selected.available} {selected.unit}</div><div>库位：{selected.location}</div><div>批次：{selected.batch}</div><div>箱号：{selected.boxNo}</div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">2. 当前拣货清单</h2>
                  <p className="text-sm text-slate-500">生成拣货表前先确认数量、批次、状态。</p>
                </div>
                <ClipboardList className="h-5 w-5 text-slate-400" />
              </div>

              <label className="mb-3 block text-sm font-medium text-slate-700">工单 / 备注</label>
              <input value={orderNote} onChange={(e) => setOrderNote(e.target.value)} className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200" placeholder="例如：MO20260530001 / A产品 10台" />

              {pickList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">暂无物料。请搜索添加，或上传 BOM 后批量加入清单。</div>
              ) : (
                <div className="space-y-3">
                  {pickList.map((line) => {
                    const risk = resolveRisk(line.item, line.qty);
                    const RiskIcon = risk.icon;
                    return (
                      <div key={line.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div><div className="font-semibold">{line.item.code}</div><div className="text-sm text-slate-500">{line.item.name}｜{line.item.spec}</div></div>
                          <button onClick={() => setPickList((prev) => prev.filter((row) => row.id !== line.id))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600" aria-label="删除"><Trash2 className="h-4 w-4" /></button>
                        </div>
                        <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                          <div>需求数量：<span className="font-medium text-slate-900">{line.qty} {line.item.unit}</span></div><div>可用库存：{line.item.available} {line.item.unit}</div><div>批次：{line.item.batch}</div><div>库位：{line.item.location}</div><div>箱号：{line.item.boxNo}</div><div>来源：{line.source}</div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${risk.tone}`}><RiskIcon className="h-3 w-3" />{risk.label}</span>
                          <span className="text-xs text-slate-400">供应商批次：{line.item.supplierBatch}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={createPickOrder} disabled={pickList.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"><ClipboardList className="h-4 w-4" />生成拣货表</button>
                {order && <button onClick={() => setOrderModalOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"><ClipboardList className="h-4 w-4" />查看上次拣货表</button>}
                <button onClick={resetAll} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"><RefreshCw className="h-4 w-4" />清空重来</button>
              </div>
            </div>
          </section>
        </main>
      </div>

      {bomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600"><FileSpreadsheet className="h-4 w-4" />BOM 核对确认</div>
                <h2 className="text-xl font-semibold">确认导入物料</h2>
                <p className="mt-1 text-sm text-slate-500">文件：{bomFileName}｜共 {bomSummary.total} 行，已匹配 {bomSummary.matched} 行，异常 {bomSummary.blocked} 行。</p>
              </div>
              <button onClick={() => setBomModalOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="关闭"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[360px_1fr]">
              <div className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
                <label className="mb-2 block text-sm font-medium text-slate-700">BOM 原始文本</label>
                <textarea value={bomText} onChange={(e) => { setBomText(e.target.value); setBomRows(parseBomText(e.target.value)); }} rows={16} className="h-[420px] w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200" />
                <p className="mt-2 text-xs text-slate-500">可在这里修正列名或数量。支持字段：物料编号、物料名称、数量。</p>
              </div>

              <div className="min-h-0 overflow-auto p-5">
                <div className="mb-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-xl bg-slate-100 px-3 py-2"><div className="text-lg font-semibold">{bomSummary.total}</div><div className="text-slate-500">总行数</div></div>
                  <div className="rounded-xl bg-slate-100 px-3 py-2"><div className="text-lg font-semibold text-emerald-600">{bomSummary.matched}</div><div className="text-slate-500">已匹配</div></div>
                  <div className="rounded-xl bg-slate-100 px-3 py-2"><div className={`text-lg font-semibold ${bomSummary.blocked ? "text-rose-600" : "text-emerald-600"}`}>{bomSummary.blocked}</div><div className="text-slate-500">异常</div></div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-100 text-slate-600"><tr><th className="px-3 py-2">BOM料号</th><th className="px-3 py-2">匹配库存</th><th className="px-3 py-2">需求</th><th className="px-3 py-2">可用</th><th className="px-3 py-2">批次 / 库位 / 箱号</th><th className="px-3 py-2">状态</th></tr></thead>
                    <tbody>
                      {matchedBom.length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-500">没有识别到 BOM 行。</td></tr>
                      ) : (
                        matchedBom.map((row) => {
                          const risk = resolveRisk(row.item, row.pickQty);
                          const RiskIcon = risk.icon;
                          return (
                            <tr key={`${row.lineNo}-${row.code}-${row.name}`} className="border-t border-slate-200">
                              <td className="px-3 py-2 font-medium">{row.code || "—"}</td>
                              <td className="px-3 py-2">{row.item ? <div><div>{row.item.code}</div><div className="text-xs text-slate-500">{row.item.name}</div></div> : <span className="text-rose-600">未找到库存物料</span>}</td>
                              <td className="px-3 py-2">{row.pickQty || "—"}</td>
                              <td className="px-3 py-2">{row.item ? `${row.item.available} ${row.item.unit}` : "—"}</td>
                              <td className="px-3 py-2 text-xs text-slate-500">{row.item ? `${row.item.batch} / ${row.item.location} / ${row.item.boxNo}` : "—"}</td>
                              <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${risk.tone}`}><RiskIcon className="h-3 w-3" />{risk.label}</span></td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">确认后，会把已匹配且数量有效的行加入当前拣货清单；异常行仍会带入风险提示。</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setBomModalOpen(false)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">取消</button>
                <button onClick={addBomToPickList} disabled={matchedBom.length === 0 || bomSummary.matched === 0} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"><Plus className="h-4 w-4" />确认加入拣货清单</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {orderModalOpen && order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600"><ClipboardList className="h-4 w-4" />拣货表预览</div>
                <h2 className="text-xl font-semibold">生成拣货表</h2>
                <p className="mt-1 text-sm text-slate-500">单号：{order.orderNo}｜生成时间：{order.createdAt}｜行数：{order.rows.length}｜异常：{order.rows.filter((row) => row.risk.label !== "可拣货").length}</p>
              </div>
              <button onClick={() => setOrderModalOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="关闭"><X className="h-5 w-5" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              <div className="mb-4 grid gap-3 md:grid-cols-[1fr_160px_160px_160px]">
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                  <div className="mb-1 text-xs text-slate-400">工单 / 备注</div>
                  <div className="font-medium text-slate-800">{order.note || "—"}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><div className="mb-1 text-xs text-slate-400">清单行数</div><div className="text-lg font-semibold text-slate-900">{order.rows.length}</div></div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><div className="mb-1 text-xs text-slate-400">合计数量</div><div className="text-lg font-semibold text-slate-900">{order.rows.reduce((sum, row) => sum + Number(row.qty || 0), 0)}</div></div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><div className="mb-1 text-xs text-slate-400">异常行</div><div className={`text-lg font-semibold ${order.rows.some((row) => row.risk.label !== "可拣货") ? "text-rose-600" : "text-emerald-600"}`}>{order.rows.filter((row) => row.risk.label !== "可拣货").length}</div></div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">序号</th><th className="px-3 py-2">物料编号</th><th className="px-3 py-2">物料名称</th><th className="px-3 py-2">规格</th><th className="px-3 py-2">数量</th><th className="px-3 py-2">单位</th><th className="px-3 py-2">库位</th><th className="px-3 py-2">批次</th><th className="px-3 py-2">箱号</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">签收</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.rows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-200">
                        <td className="px-3 py-2">{row.seq}</td><td className="px-3 py-2 font-medium">{row.item.code}</td><td className="px-3 py-2">{row.item.name}</td><td className="px-3 py-2 text-slate-500">{row.item.spec}</td><td className="px-3 py-2 font-medium">{row.qty}</td><td className="px-3 py-2">{row.item.unit}</td><td className="px-3 py-2">{row.item.location}</td><td className="px-3 py-2">{row.item.batch}</td><td className="px-3 py-2">{row.item.boxNo}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs ${row.risk.tone}`}>{row.risk.label}</span></td><td className="px-3 py-2 text-slate-300">________</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-slate-500 sm:grid-cols-3">
                <div>拣货人：________</div>
                <div>复核人：________</div>
                <div>产线签收：________</div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">这是生成后的拣货表预览。实际系统中，此步骤通常会同时占用库存并生成待拣任务。</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setOrderModalOpen(false)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">关闭</button>
                <div className="relative">
                  <button onClick={() => setExportMenuOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                    <Download className="h-4 w-4" />导出
                  </button>
                  {exportMenuOpen && (
                    <div className="absolute bottom-full right-0 mb-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                      <button onClick={exportOrderAsPdf} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50">
                        <FileText className="h-4 w-4" />导出为 PDF
                      </button>
                      <button onClick={exportOrderAsExcel} className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50">
                        <FileSpreadsheet className="h-4 w-4" />导出为 EXCEL
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
