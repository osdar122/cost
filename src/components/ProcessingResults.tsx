import React from 'react';
import { CheckCircle, AlertCircle, FileText, Database, Users, BarChart3 } from 'lucide-react';

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
  };
}

interface ProcessingResultsProps {
  results: ProcessingResult[];
  onClear: () => void;
}

export const ProcessingResults: React.FC<ProcessingResultsProps> = ({ results, onClear }) => {
  if (results.length === 0) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <BarChart3 className="w-5 h-5 mr-2 text-indigo-600" />
          処理結果
        </h3>
        <button
          onClick={onClear}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          クリア
        </button>
      </div>

      <div className="space-y-4">
        {results.map((result, index) => (
          <div key={index} className="border rounded-lg p-4">
            <div className="flex items-center mb-3">
              {result.status === 'success' ? (
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              )}
              <span className="font-medium text-gray-900">{result.fileName}</span>
            </div>

            <p className={`text-sm mb-3 ${
              result.status === 'success' ? 'text-green-700' : 'text-red-700'
            }`}>
              {result.message}
            </p>

            {result.data && (
              <div className="space-y-4">
                {/* プロジェクト情報 */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                    <FileText className="w-4 h-4 mr-1" />
                    プロジェクト情報
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>PJCD: <span className="font-mono">{result.data.projectMeta.pjcd}</span></div>
                    <div>案件名: {result.data.projectMeta.projectName}</div>
                    <div>住所: {result.data.projectMeta.address}</div>
                    <div>AC: {result.data.projectMeta.acKw}kW</div>
                    <div>DC: {result.data.projectMeta.dcKw}kW</div>
                  </div>
                </div>

                {/* 処理統計 */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                    <Database className="w-4 h-4 mr-1" />
                    処理統計
                  </h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-600">{result.data.totalRows}</div>
                      <div className="text-gray-600">総行数</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-green-600">{result.data.validRows}</div>
                      <div className="text-gray-600">有効行数</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-red-600">{result.data.rejectedRows}</div>
                      <div className="text-gray-600">除外行数</div>
                    </div>
                  </div>
                </div>

                {/* 金額合計 */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                    <BarChart3 className="w-4 h-4 mr-1" />
                    金額合計（検証済み）
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-green-100 rounded">
                      <div className="text-lg font-bold text-green-700">
                        {formatCurrency(result.data.totals.budget)}
                      </div>
                      <div className="text-sm text-gray-600">予算合計</div>
                    </div>
                    <div className="text-center p-3 bg-blue-100 rounded">
                      <div className="text-lg font-bold text-blue-700">
                        {formatCurrency(result.data.totals.actualPlan)}
                      </div>
                      <div className="text-sm text-gray-600">実績/予定合計</div>
                    </div>
                    <div className="text-center p-3 bg-purple-100 rounded">
                      <div className="text-lg font-bold text-purple-700">
                        {formatCurrency(result.data.totals.confirmed)}
                      </div>
                      <div className="text-sm text-gray-600">確定合計</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};