import React, { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, X } from 'lucide-react';

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
      // ファイル読み込みをシミュレート
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // サンプルデータでの処理結果をシミュレート
      const result: ProcessingResult = {
        fileName: file.name,
        status: 'success',
        message: 'ファイルの処理が完了しました',
        data: {
          totalRows: 250,
          validRows: 230,
          rejectedRows: 20,
          projectMeta: {
            pjcd: 'EM20',
            projectName: 'BBB',
            address: 'AA',
            acKw: 1250.00,
            dcKw: 1458.24
          },
          totals: {
            budget: 836078000,
            actualPlan: 778222542,
            confirmed: 147640758
          }
        }
      };
      
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