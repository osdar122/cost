import React from 'react';
import { Item } from '../types';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';

type Props = { items: Item[]; onUpdateItem?: (id: number, patch: Partial<Item>) => void };

const formatJPY = (v?: number | null) => {
  if (v === undefined || v === null || isNaN(v)) return '¥0';
  return `¥${v.toLocaleString('ja-JP')}`;
};

const toYM = (s?: string | null) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (m) return `${m[1]}-${m[2]}`;
  const m2 = String(s).match(/^(\d{4})[\/.](\d{1,2})[\/.]\d{1,2}$/);
  if (m2) return `${m2[1]}-${String(Number(m2[2])).padStart(2, '0')}`;
  return '';
};

export const AnalysisPanel: React.FC<Props> = ({ items, onUpdateItem }) => {
  const isCostSummaryRow = React.useCallback((row: Item) => {
    const hay = `${row.title || ''} ${row.vendor || ''} ${row.note || ''}`;
    return (hay.includes('仕入') && hay.includes('合計')) || hay.includes('収支');
  }, []);

  // Precompute deepest-populated sets per amount key to avoid double counting
  const [selectedYM, setSelectedYM] = React.useState<string>(''); // YYYY-MM or ''
  const { deepestBudget, deepestActual, deepestConfirmed } = React.useMemo(() => {
    const hasDeeperWithValue = (base: string, key: keyof Item) =>
      items.some(d => d.code.startsWith(base + '.') && (d[key] as number | null) != null);
    const filterDeepest = (key: keyof Item) =>
      items
        .filter(it => !isCostSummaryRow(it))
        .filter(it => (it[key] as number | null) != null)
        .filter(it => !hasDeeperWithValue(it.code, key));
    return {
      deepestBudget: filterDeepest('budget_amount'),
      deepestActual: filterDeepest('actual_planned_amount'),
      deepestConfirmed: filterDeepest('confirmed_amount'),
    };
  }, [items, isCostSummaryRow]);

  // Filter by selected month if set (prefer confirmed, then actual, then budget)
  const monthMatch = (it: Item) => {
    if (!selectedYM) return true;
    const ym = (s?: string | null) => {
      if (!s) return '';
      const m = String(s).match(/^(\d{4})-(\d{2})-\d{2}$/);
      return m ? `${m[1]}-${m[2]}` : '';
    };
    const c = ym(it.confirmed_date);
    const a = ym(it.actual_planned_date);
    const b = ym(it.budget_date);
    return (c && c === selectedYM) || (!c && a && a === selectedYM) || (!c && !a && b && b === selectedYM);
  };

  // Vendor summary (Top 10)
  const vendorRows = React.useMemo(() => {
    const map = new Map<string, { vendor: string; budget: number; actual: number; confirmed: number }>();
    const norm = (v?: string) => (v && v.trim()) ? v.trim() : '（未入力）';
    for (const it of deepestBudget.filter(monthMatch)) {
      const k = norm(it.vendor);
      const rec = map.get(k) || { vendor: k, budget: 0, actual: 0, confirmed: 0 };
      rec.budget += it.budget_amount || 0;
      map.set(k, rec);
    }
    for (const it of deepestActual.filter(monthMatch)) {
      const k = norm(it.vendor);
      const rec = map.get(k) || { vendor: k, budget: 0, actual: 0, confirmed: 0 };
      rec.actual += it.actual_planned_amount || 0;
      map.set(k, rec);
    }
    for (const it of deepestConfirmed.filter(monthMatch)) {
      const k = norm(it.vendor);
      const rec = map.get(k) || { vendor: k, budget: 0, actual: 0, confirmed: 0 };
      rec.confirmed += it.confirmed_amount || 0;
      map.set(k, rec);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => (b.confirmed || 0) - (a.confirmed || 0));
    return arr.slice(0, 10);
  }, [deepestBudget, deepestActual, deepestConfirmed, selectedYM]);

  // Monthly trend (confirmed preferred, fallback to actual when confirmed empty for that row)
  const monthly = React.useMemo(() => {
    const buckets = new Map<string, { ym: string; budget: number; actual: number; confirmed: number }>();
    const bump = (ym: string, key: 'budget' | 'actual' | 'confirmed', val: number) => {
      if (!ym) return;
      const rec = buckets.get(ym) || { ym, budget: 0, actual: 0, confirmed: 0 };
      (rec as any)[key] += val || 0;
      buckets.set(ym, rec);
    };
    for (const it of deepestBudget) bump(toYM(it.budget_date), 'budget', it.budget_amount || 0);
    for (const it of deepestActual) bump(toYM(it.actual_planned_date), 'actual', it.actual_planned_amount || 0);
    for (const it of deepestConfirmed) bump(toYM(it.confirmed_date), 'confirmed', it.confirmed_amount || 0);
    const arr = Array.from(buckets.values());
    arr.sort((a, b) => a.ym.localeCompare(b.ym));
    return arr;
  }, [deepestBudget, deepestActual, deepestConfirmed]);

  // Second-level variance (group like A.1, B.2)
  const varianceRows = React.useMemo(() => {
    const groups = new Set<string>();
    for (const it of items) {
      const parts = it.code.split('.');
      if (parts.length >= 2) groups.add(parts.slice(0, 2).join('.'));
    }
    const sumForPrefixDeepest = (prefix: string, key: keyof Item) => {
      const pool = items.filter(it => (it.code === prefix || it.code.startsWith(prefix + '.')) && monthMatch(it));
      const hasDeeperWithValue = (base: string) => pool.some(d => d.code.startsWith(base + '.') && (d[key] as number | null) != null);
      return pool
        .filter(it => !isCostSummaryRow(it))
        .filter(it => (it[key] as number | null) != null)
        .filter(it => !hasDeeperWithValue(it.code))
        .reduce((a, b) => a + ((b[key] as number) || 0), 0);
    };
    const arr = Array.from(groups).map(code => {
      const budget = sumForPrefixDeepest(code, 'budget_amount');
      const confirmed = sumForPrefixDeepest(code, 'confirmed_amount');
      const variance = (confirmed || 0) - (budget || 0);
      const pct = budget ? Math.round((variance / budget) * 100) : 0;
      const title = items.find(i => i.code === code)?.title || '';
      const top = code.split('.')[0];
      return { code, title, top, budget, confirmed, variance, pct };
    });
    arr.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    return arr.slice(0, 12);
  }, [items, isCostSummaryRow, selectedYM]);

  // Data quality metrics & paid summary
  const quality = React.useMemo(() => {
    const missingVendor = items.filter(i => !i.vendor || !i.vendor.trim()).length;
    const codes = items.map(i => i.code);
    const dupMap = new Map<string, number>();
    for (const c of codes) dupMap.set(c, (dupMap.get(c) || 0) + 1);
    const duplicates = Array.from(dupMap.entries()).filter(([_, n]) => n > 1).map(([c, n]) => ({ code: c, count: n }));
    const actualNoDate = items.filter(i => (i.actual_planned_amount || 0) > 0 && !i.actual_planned_date).length;
    const confirmedNoDate = items.filter(i => (i.confirmed_amount || 0) > 0 && !i.confirmed_date).length;
    const specialRows = items.filter(isCostSummaryRow).length;
    const topConfirmed = [...items]
      .filter(it => (it.confirmed_amount || 0) > 0)
      .sort((a, b) => (b.confirmed_amount || 0) - (a.confirmed_amount || 0))
      .slice(0, 5)
      .map(it => ({ code: it.display_code || it.code, title: it.title, amt: it.confirmed_amount || 0 }));
  const paidRows = items.filter(i => i.is_paid);
  const paidCount = paidRows.length;
  const paidTotal = paidRows.reduce((a, b) => a + (b.confirmed_amount || 0), 0);
  const unpaidWithConfirmed = items.filter(i => !i.is_paid && (i.confirmed_amount || 0) > 0);
  const unpaidWithConfirmedCount = unpaidWithConfirmed.length;
  const unpaidWithConfirmedTotal = unpaidWithConfirmed.reduce((a, b) => a + (b.confirmed_amount || 0), 0);
  return { missingVendor, duplicates, actualNoDate, confirmedNoDate, specialRows, topConfirmed, paidCount, paidTotal, unpaidWithConfirmedCount, unpaidWithConfirmedTotal };
  }, [items, isCostSummaryRow]);

  // Export helpers
  const toCSV = (rows: any[], headers?: string[]) => {
    if (!rows.length) return '';
    const cols = headers || Object.keys(rows[0]);
    const head = cols.join(',');
    const body = rows.map(r => cols.map(c => {
      const v = r[c];
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    return head + '\n' + body;
  };
  const download = (filename: string, content: string, mime = 'text/csv;charset=utf-8;') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportVendorCSV = () => download('vendor_summary.csv', toCSV(vendorRows, ['vendor','budget','actual','confirmed']));
  const exportVarianceCSV = () => download('variance_top12.csv', toCSV(varianceRows, ['code','title','top','budget','confirmed','variance','pct']));
  const exportItemsCSV = () => {
    const cols = ['code','display_code','title','vendor','budget_amount','budget_date','actual_planned_amount','actual_planned_date','confirmed_amount','confirmed_date','payment_date','note'];
    const rows = items.map(i => Object.fromEntries(cols.map(k => [k, (i as any)[k]])));
    download('all_items.csv', toCSV(rows, cols));
  };
  const exportItemsJSON = () => download('all_items.json', JSON.stringify(items, null, 2), 'application/json');

  // Navigation helper
  const jumpToCode = (code: string) => {
    const id = 'row-' + encodeURIComponent(code);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2','ring-indigo-400');
      setTimeout(() => el.classList.remove('ring-2','ring-indigo-400'), 1500);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">分析・サポート</h3>
        <div className="flex gap-2">
          <button onClick={exportVendorCSV} className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200">業者別CSV</button>
          <button onClick={exportVarianceCSV} className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200">差異Top12 CSV</button>
          <button onClick={exportItemsCSV} className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200">全明細CSV</button>
          <button onClick={exportItemsJSON} className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200">全明細JSON</button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1">
          <label className="text-sm text-gray-700">対象年月</label>
          <input type="month" className="border rounded px-2 py-1 text-sm" value={selectedYM} onChange={e => setSelectedYM(e.target.value)} />
        </div>
      </div>

      {/* Vendor top 10 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="border rounded">
          <div className="px-3 py-2 border-b bg-gray-50 font-medium text-gray-800">業者別 上位10（確定金額順）</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">業者</th>
                <th className="px-3 py-2 text-right">予算</th>
                <th className="px-3 py-2 text-right">実施・予定</th>
                <th className="px-3 py-2 text-right">確定</th>
              </tr>
            </thead>
            <tbody>
              {vendorRows.map(v => (
                <tr key={v.vendor} className="border-b">
                  <td className="px-3 py-2 truncate max-w-[36ch]" title={v.vendor}>{v.vendor}</td>
                  <td className="px-3 py-2 text-right">{formatJPY(v.budget)}</td>
                  <td className="px-3 py-2 text-right">{formatJPY(v.actual)}</td>
                  <td className="px-3 py-2 text-right">{formatJPY(v.confirmed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Monthly trend */}
        <div className="border rounded">
          <div className="px-3 py-2 border-b bg-gray-50 font-medium text-gray-800">月次推移（予算/実施/確定）</div>
          <div className="p-3 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#eee" strokeDasharray="5 5" />
                <XAxis dataKey="ym" />
                <YAxis />
                <Tooltip formatter={(v: any) => formatJPY(v)} />
                <Legend />
                <Line type="monotone" dataKey="budget" name="予算" stroke="#6366f1" dot={false} />
                <Line type="monotone" dataKey="actual" name="実施" stroke="#f59e0b" dot={false} />
                <Line type="monotone" dataKey="confirmed" name="確定" stroke="#10b981" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">年月</th>
                <th className="px-3 py-2 text-right">予算</th>
                <th className="px-3 py-2 text-right">実施・予定</th>
                <th className="px-3 py-2 text-right">確定</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map(m => (
                <tr key={m.ym} className="border-b">
                  <td className="px-3 py-2">{m.ym || '—'}</td>
                  <td className="px-3 py-2 text-right">{formatJPY(m.budget)}</td>
                  <td className="px-3 py-2 text-right">{formatJPY(m.actual)}</td>
                  <td className="px-3 py-2 text-right">{formatJPY(m.confirmed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Variance and quality */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <div className="border rounded">
          <div className="px-3 py-2 border-b bg-gray-50 font-medium text-gray-800">第二階層 差異Top12（確定−予算）</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">グループ</th>
                <th className="px-3 py-2 text-left">名称</th>
                <th className="px-3 py-2 text-right">予算</th>
                <th className="px-3 py-2 text-right">確定</th>
                <th className="px-3 py-2 text-right">差異</th>
                <th className="px-3 py-2 text-right">差異%</th>
              </tr>
            </thead>
            <tbody>
              {varianceRows.map(r => (
                <tr key={r.code} className="border-b">
                  <td className="px-3 py-2 font-mono text-xs"><span className="bg-gray-100 px-1.5 py-0.5 rounded border">{items.find(it => it.code === r.code)?.display_code || r.code}</span></td>
                  <td className="px-3 py-2 truncate max-w-[36ch]" title={r.title}>{r.title || '—'}</td>
                  <td className="px-3 py-2 text-right">{formatJPY(r.budget)}</td>
                  <td className="px-3 py-2 text-right">{formatJPY(r.confirmed)}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatJPY(r.variance)}</td>
                  <td className="px-3 py-2 text-right">{r.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

  <div className="border rounded">
          <div className="px-3 py-2 border-b bg-gray-50 font-medium text-gray-800">データ品質</div>
          <div className="p-3 text-sm text-gray-800">
            <div className="grid grid-cols-2 gap-y-2">
              <div>支払い済み行:</div><div className="text-right font-medium">{quality.paidCount}</div>
              <div>支払い済み合計（確定）:</div><div className="text-right font-medium">{formatJPY(quality.paidTotal)}</div>
              <div>未払い（確定あり）行:</div><div className="text-right font-medium">{quality.unpaidWithConfirmedCount}</div>
              <div>未払い（確定あり）合計:</div><div className="text-right font-medium">{formatJPY(quality.unpaidWithConfirmedTotal)}</div>
              <div>取引先（業者）未入力行:</div><div className="text-right font-medium">{quality.missingVendor}</div>
              <div>重複コード:</div><div className="text-right font-medium">{quality.duplicates.length}</div>
              <div>実施・予定 金額あり/日付なし:</div><div className="text-right font-medium">{quality.actualNoDate}</div>
              <div>確定 金額あり/日付なし:</div><div className="text-right font-medium">{quality.confirmedNoDate}</div>
              <div>特別サマリー行（仕入合計/収支）:</div><div className="text-right font-medium">{quality.specialRows}</div>
            </div>
            {quality.duplicates.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-gray-600 mb-1">重複コード詳細（上位）</div>
                <ul className="list-disc pl-5 text-xs text-gray-700 max-h-28 overflow-auto">
                  {quality.duplicates.slice(0, 8).map(d => (
                    <li key={d.code}>{d.code} × {d.count}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3">
              <div className="text-xs text-gray-600 mb-1">確定額 上位5</div>
              <ul className="list-disc pl-5 text-xs text-gray-700 max-h-28 overflow-auto">
                {quality.topConfirmed.map((r, idx) => (
                  <li key={idx}><span className="font-mono bg-gray-100 px-1 py-0.5 rounded border mr-1">{r.code}</span>{r.title || '—'}: {formatJPY(r.amt)}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Unpaid with confirmed list */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <div className="border rounded">
          <div className="px-3 py-2 border-b bg-gray-50 font-medium text-gray-800">未払い（確定あり）一覧</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">コード</th>
                <th className="px-3 py-2 text-left">名称</th>
                <th className="px-3 py-2 text-right">確定</th>
                <th className="px-3 py-2 text-left">確定日</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.filter(i => !i.is_paid && (i.confirmed_amount || 0) > 0).slice(0, 20).map(i => (
                <tr key={i.id} className="border-b">
                  <td className="px-3 py-2 font-mono text-xs"><span className="bg-gray-100 px-1.5 py-0.5 rounded border">{i.display_code || i.code}</span></td>
                  <td className="px-3 py-2 truncate max-w-[32ch]" title={i.title}>{i.title || '—'}</td>
                  <td className="px-3 py-2 text-right">{formatJPY(i.confirmed_amount)}</td>
                  <td className="px-3 py-2">{i.confirmed_date || '—'}</td>
                  <td className="px-3 py-2"><button className="px-2 py-1 text-xs border rounded" onClick={() => jumpToCode(i.code)}>ジャンプ</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Missing PO for confirmed */}
        <div className="border rounded">
          <div className="px-3 py-2 border-b bg-gray-50 font-medium text-gray-800">PO未設定（確定あり）</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">コード</th>
                <th className="px-3 py-2 text-left">名称</th>
                <th className="px-3 py-2 text-left">発注書番号</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.filter(i => (i.confirmed_amount || 0) > 0 && (!i.po_number || !i.po_number.trim())).slice(0, 20).map(i => (
                <tr key={i.id} className="border-b">
                  <td className="px-3 py-2 font-mono text-xs"><span className="bg-gray-100 px-1.5 py-0.5 rounded border">{i.display_code || i.code}</span></td>
                  <td className="px-3 py-2 truncate max-w-[28ch]" title={i.title}>{i.title || '—'}</td>
                  <td className="px-3 py-2">
                    <input className="border rounded px-2 py-1 text-sm w-40" defaultValue={i.po_number || ''} onBlur={(e) => onUpdateItem && onUpdateItem(i.id, { po_number: e.target.value })} />
                  </td>
                  <td className="px-3 py-2 flex gap-2">
                    <button className="px-2 py-1 text-xs border rounded" onClick={() => jumpToCode(i.code)}>ジャンプ</button>
                    {onUpdateItem && <button className="px-2 py-1 text-xs border rounded" onClick={() => {
                      const el = (document.activeElement as HTMLInputElement);
                      if (el && el.tagName === 'INPUT') el.blur();
                    }}>保存</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default AnalysisPanel;
