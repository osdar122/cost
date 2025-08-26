import React from 'react';
import { Database, FileSpreadsheet, Settings, CheckCircle, AlertCircle, BarChart3 } from 'lucide-react';
import { FileUpload } from './components/FileUpload';
import { ProcessingResults } from './components/ProcessingResults';
import { ConfigPanel } from './components/ConfigPanel';
import { DatabaseStatus } from './components/DatabaseStatus';

function App() {
  const [processingResults, setProcessingResults] = React.useState<any[]>([]);
  const [config, setConfig] = React.useState<any>({});

  const handleFileProcessed = (result: any) => {
    setProcessingResults(prev => [...prev, result]);
  };

  const handleConfigChange = (newConfig: any) => {
    setConfig(newConfig);
  };

  const clearResults = () => {
    setProcessingResults([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Database className="w-8 h-8 text-indigo-600" />
              <h1 className="text-xl font-bold text-gray-900">Excelコストレポート ETLシステム</h1>
            </div>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <CheckCircle className="w-3 h-3 mr-1" />
                準備完了
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Excelコストレポート用包括的ETLソリューション
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            インテリジェントなヘッダー検出、既存システム連携、包括的データ検証により、
            Excelコストレポートを正規化されたデータベーススキーマに変換します。
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {/* Excel Processing */}
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center mb-4">
              <FileSpreadsheet className="w-8 h-8 text-green-600 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">Excel処理</h3>
            </div>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>• インテリジェント2段ヘッダー検出</li>
              <li>• 柔軟な列マッピング</li>
              <li>• プロジェクトメタデータ抽出</li>
              <li>• 勘定科目コード検証</li>
              <li>• 小計行フィルタリング</li>
            </ul>
          </div>

          {/* Database Integration */}
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center mb-4">
              <Database className="w-8 h-8 text-blue-600 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">データベース統合</h3>
            </div>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>• 正規化されたPostgreSQLスキーマ</li>
              <li>• ディメンションテーブルとファクトテーブル</li>
              <li>• 既存システム連携</li>
              <li>• あいまい取引先マッチング</li>
              <li>• 冪等処理</li>
            </ul>
          </div>

          {/* Data Quality */}
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center mb-4">
              <CheckCircle className="w-8 h-8 text-purple-600 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">データ品質</h3>
            </div>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>• ビジネスルール検証</li>
              <li>• 型正規化</li>
              <li>• 受入テスト</li>
              <li>• 包括的ログ出力</li>
              <li>• エラーレポート</li>
            </ul>
          </div>
        </div>

        {/* 機能セクション */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* ファイルアップロード */}
          <FileUpload onFileProcessed={handleFileProcessed} />
          
          {/* データベース状態 */}
          <DatabaseStatus config={config} />
        </div>

        {/* 処理結果 */}
        <ProcessingResults results={processingResults} onClear={clearResults} />

        {/* 設定パネル */}
        <div className="mb-8">
          <ConfigPanel onConfigChange={handleConfigChange} />
        </div>

        {/* システムアーキテクチャ */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">システムアーキテクチャ</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <FileSpreadsheet className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <div className="font-medium text-gray-900">抽出</div>
              <div className="text-xs text-gray-600">Excel処理</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <Settings className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <div className="font-medium text-gray-900">変換</div>
              <div className="text-xs text-gray-600">正規化</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <Database className="w-8 h-8 text-purple-600 mx-auto mb-2" />
              <div className="font-medium text-gray-900">格納</div>
              <div className="text-xs text-gray-600">データベース保存</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <CheckCircle className="w-8 h-8 text-indigo-600 mx-auto mb-2" />
              <div className="font-medium text-gray-900">検証</div>
              <div className="text-xs text-gray-600">品質保証</div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Excelコストレポート ETLシステム - 本番環境対応実装
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-500">
              <span>Python 3.10+</span>
              <span>•</span>
              <span>PostgreSQL</span>
              <span>•</span>
              <span>SQLAlchemy</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;