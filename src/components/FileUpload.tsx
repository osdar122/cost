import React, { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Item } from '../types';
import { Upload, FileSpreadsheet } from 'lucide-react';

interface FileUploadProps {
  onFileProcessed: (result: ProcessingResult) => void;
}

interface ProcessingResult {
  fileName: string;
  status: 'success' | 'error';
  message: string;
  data?: {
    totalRows: number;
    validRows: number;
    rejectedRows: number;
    projectMeta: any;
    totals: {
      budget: number;
      actualPlan: number;
      confirmed: number;
  };
  items?: Item[];
  };
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileProcessed }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const excelFile = files.find(file => 
      file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    );
    
    if (excelFile) {
      processFile(excelFile);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, []);

  const processFile = async (file: File) => {
    setIsProcessing(true);
    
    try {
      // ブラウザでExcelを読み取り
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      // 先頭シートを対象
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      // ヘッダをそのまま読みつつ、空行をできるだけ無視
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[];

      // 2行ヘッダ想定: キーワードを含む行を探す
      const headerIdx = Math.max(0, rows.findIndex(r => r.some((c: any) => `${c}`.includes('項目CD') || `${c}`.includes('内容'))));
      const top = rows[headerIdx] || [];
      const sub = rows[headerIdx + 1] || [];
      const dataStart = headerIdx + 2;
      const normalizeHeaderToken = (s: any) => String(s ?? '').trim().replace(/\n+/g, '\\n');
      const headers: string[] = top.map((t: any, i: number) => {
        const ts = normalizeHeaderToken(t);
        const ss = normalizeHeaderToken(sub[i]);
        if (ts && ss) return `${ts}__${ss}`;
        return (ts || ss || `col_${i}`);
      });

      const dataRows = rows.slice(dataStart).filter(r => (r || []).some((c: any) => String(c).trim() !== ''));

      // 列名候補
  const col = (name: string) => headers.findIndex(h => h === normalizeHeaderToken(name));
  const colIncludesAll = (parts: string[]) => headers.findIndex(h => parts.every(p => h.includes(p)));
      const idxCode = col('項目CD');
      const idxTitle = col('内容');
      const vendorHeaderFull = '協力会社__売上げの場合：売り先\n仕入れの場合：仕入れ先';
      const idxVendor = col(vendorHeaderFull) >= 0
        ? col(vendorHeaderFull)
        : headers.findIndex(h => h.includes('協力会社'));
      const idxBudgetAmt = col('事業開始時予算__金額（円）');
      const idxBudgetDate = col('事業開始時予算__日付') >= 0 ? col('事業開始時予算__日付') : col('日付（予算）');
      const idxActualAmt = col('現時点の実施済み及び予定__金額（円）') >= 0
        ? col('現時点の実施済み及び予定__金額（円）')
        : headers.findIndex(h => h.includes('実施') && h.includes('金額'));
      // Support both two-row header and single label like '日付（実施/予定）'
      let idxActualDate = col('現時点の実施済み及び予定__日付');
      if (idxActualDate < 0) idxActualDate = col('日付（実施/予定）');
  if (idxActualDate < 0) idxActualDate = colIncludesAll(['実施', '日付']);
  if (idxActualDate < 0) idxActualDate = colIncludesAll(['予定', '日付']);
      // Proximity fallback: pick the nearest '日付' column after the actual amount column
      if (idxActualDate < 0 && idxActualAmt >= 0) {
        const dateCandidates = headers
          .map((h, i) => ({ i, h }))
          .filter(x => x.h.includes('日付') && x.i > idxActualAmt)
          .map(x => x.i);
        if (dateCandidates.length) idxActualDate = dateCandidates[0];
      }
  // ensure confirmed amount index once for proximity fallback below
  const idxConfirmedAmt = col('確定金額__金額') >= 0 ? col('確定金額__金額') : col('確定金額');
      let idxConfirmedDate = col('確定金額__日付');
      if (idxConfirmedDate < 0) idxConfirmedDate = col('日付（確定）');
  if (idxConfirmedDate < 0) idxConfirmedDate = colIncludesAll(['確定', '日付']);
      // Proximity fallback: nearest '日付' after confirmed amount
      if (idxConfirmedDate < 0 && idxConfirmedAmt >= 0) {
        const dateCandidates = headers
          .map((h, i) => ({ i, h }))
          .filter(x => x.h.includes('日付') && x.i > idxConfirmedAmt)
          .map(x => x.i);
        if (dateCandidates.length) idxConfirmedDate = dateCandidates[0];
      }
      const idxPaymentDate = col('請求書__支払日') >= 0 ? col('請求書__支払日') : headers.findIndex(h => h.includes('支払'));
      const idxNote = col('備考');
      const idxDelivery = col('納品日');
      const idxPO = col('発注書番号');

      const toNum = (v: any): number | null => {
        if (v === null || v === undefined) return null;
        const s = String(v).trim().replace(/[¥￥,\s]/g, '');
        if (!s) return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      };

      // Excel date serial (1900-based) helper -> 'YYYY-MM-DD'
      const excelSerialToDate = (v: any): string | null => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        if (!Number.isFinite(n)) {
          // Try to parse as string date already
          const s = String(v).trim();
          if (!s) return null;
          // Basic normalization: keep as-is; browser date input expects YYYY-MM-DD
          // If it looks like yyyy/m/d or yyyy.m.d, normalize
          const m = s.match(/^(\d{4})[\/\.\-](\d{1,2})[\/\.\-](\d{1,2})$/);
          if (m) {
            const [_, y, mo, d] = m;
            const mm = String(Number(mo)).padStart(2, '0');
            const dd = String(Number(d)).padStart(2, '0');
            return `${y}-${mm}-${dd}`;
          }
          return s;
        }
        // Excel serial dates are days since 1899-12-30 in practice
        const epoch = new Date(Date.UTC(1899, 11, 30));
        const dt = new Date(epoch.getTime() + n * 86400000);
        const yyyy = dt.getUTCFullYear();
        const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(dt.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };

      // Infer hierarchy codes for rows missing explicit numbering
      let lastTop: string | null = null;   // e.g., 'A' or 'B'
      let lastFull: string | null = null;  // e.g., 'B.4.3'
      const uCounters = new Map<string, number>();
      const ensureDotAfterLetter = (s: string) => s.replace(/^([A-Z])(\d)/, '$1.$2');
      const normalizeCode = (raw: string): { code: string; display: string } => {
        const orig = raw.trim();
        if (!orig) {
          // No code: attach under lastFull if possible
          if (lastFull) {
            const n = (uCounters.get(lastFull) || 0) + 1;
            uCounters.set(lastFull, n);
            return { code: `${lastFull}.u${n}`, display: '' };
          }
          if (lastTop) {
            const key = `${lastTop}`;
            const n = (uCounters.get(key) || 0) + 1;
            uCounters.set(key, n);
            return { code: `${lastTop}.u${n}`, display: '' };
          }
          return { code: `U.u1`, display: '' };
        }
        const withDot = ensureDotAfterLetter(orig); // handle 'B4.3' -> 'B.4.3'
        if (/^[A-Z]\.\d+(?:\.\d+)*$/.test(withDot)) {
          // Full qualified like 'B.4.3'
          const top = withDot.split('.')[0];
          lastTop = top;
          lastFull = withDot;
          return { code: withDot, display: orig };
        }
        if (/^\d+(?:\.\d+)*$/.test(orig)) {
          // Like '4.3' following a top-level context
          if (lastTop) {
            const full = `${lastTop}.${orig}`;
            lastFull = full;
            return { code: full, display: orig };
          }
          // No top context yet
          return { code: `U.${orig}`, display: orig };
        }
        // Fallback: text or other token
        if (lastFull) {
          const n = (uCounters.get(lastFull) || 0) + 1;
          uCounters.set(lastFull, n);
          return { code: `${lastFull}.u${n}`, display: orig };
        }
        if (lastTop) {
          const key = `${lastTop}`;
          const n = (uCounters.get(key) || 0) + 1;
          uCounters.set(key, n);
          return { code: `${lastTop}.u${n}`, display: orig };
        }
        return { code: `U.u1`, display: orig };
      };

      const items: Item[] = dataRows
        .map((r, i) => {
          const rawCode = String(r[idxCode] ?? '').trim();
          const { code, display } = normalizeCode(rawCode);
          const paymentDate = excelSerialToDate(r[idxPaymentDate]);
          return {
            id: i + 1,
            code,
            display_code: display || undefined,
            title: String(r[idxTitle] ?? '').trim(),
            vendor: String(r[idxVendor] ?? '').trim(),
            budget_amount: toNum(r[idxBudgetAmt]),
            budget_date: excelSerialToDate(r[idxBudgetDate]),
            actual_planned_amount: toNum(r[idxActualAmt]),
            actual_planned_date: excelSerialToDate(r[idxActualDate]),
            confirmed_amount: toNum(r[idxConfirmedAmt]),
            confirmed_date: excelSerialToDate(r[idxConfirmedDate]),
            payment_date: paymentDate,
            is_paid: !!paymentDate,
            note: String(r[idxNote] ?? '').trim(),
            delivery_date: excelSerialToDate(r[idxDelivery]),
            po_number: String(r[idxPO] ?? '').trim(),
          } as Item;
        });

      const result: ProcessingResult = {
        fileName: file.name,
        status: 'success',
        message: 'ファイルの処理が完了しました',
        data: {
          totalRows: dataRows.length,
          validRows: items.length,
          rejectedRows: dataRows.length - items.length,
          projectMeta: {},
          totals: {
            budget: items.reduce((a, b) => a + (b.budget_amount || 0), 0),
            actualPlan: items.reduce((a, b) => a + (b.actual_planned_amount || 0), 0),
            confirmed: items.reduce((a, b) => a + (b.confirmed_amount || 0), 0),
          }
        },
      };

      result.data!.items = items;
      onFileProcessed(result);
    } catch (error) {
      onFileProcessed({
        fileName: file.name,
        status: 'error',
        message: 'ファイルの処理中にエラーが発生しました'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <Upload className="w-5 h-5 mr-2 text-indigo-600" />
        Excelファイルアップロード
      </h3>
      
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-indigo-500 bg-indigo-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isProcessing ? (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-gray-600">ファイルを処理中...</p>
          </div>
        ) : (
          <>
            <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-2">
              Excelファイルをドラッグ&ドロップするか、クリックして選択してください
            </p>
            <p className="text-sm text-gray-500 mb-4">
              対応形式: .xlsx, .xls
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
            >
              ファイルを選択
            </label>
          </>
        )}
      </div>
    </div>
  );
};