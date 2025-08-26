import React, { useState, useEffect } from 'react';
import { Database, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface DatabaseStatusProps {
  config: any;
}

export const DatabaseStatus: React.FC<DatabaseStatusProps> = ({ config }) => {
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [stats, setStats] = useState({
    projects: 0,
    accounts: 0,
    vendors: 0,
    facts: 0
  });

  useEffect(() => {
    checkDatabaseStatus();
  }, [config]);

  const checkDatabaseStatus = async () => {
    setStatus('checking');
    
    // データベース接続をシミュレート
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // サンプルデータでステータスをシミュレート
    setStatus('connected');
    setStats({
      projects: 15,
      accounts: 342,
      vendors: 128,
      facts: 2847
    });
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'checking':
        return <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />;
      case 'connected':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'checking':
        return 'データベース接続を確認中...';
      case 'connected':
        return 'データベースに接続済み';
      case 'error':
        return 'データベース接続エラー';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'checking':
        return 'text-blue-600';
      case 'connected':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <Database className="w-5 h-5 mr-2 text-indigo-600" />
          データベース状態
        </h3>
        <button
          onClick={checkDatabaseStatus}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          更新
        </button>
      </div>

      <div className="space-y-4">
        {/* 接続状態 */}
        <div className="flex items-center">
          {getStatusIcon()}
          <span className={`ml-2 font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
        </div>

        {/* データベース情報 */}
        {status === 'connected' && (
          <>
            <div className="bg-gray-50 rounded-lg p-3">
              <h4 className="font-medium text-gray-900 mb-2">接続情報</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <div>スキーマ: <span className="font-mono">{config?.database?.schema || 'cost'}</span></div>
                <div>URL: <span className="font-mono text-xs">{config?.database?.url?.replace(/\/\/.*@/, '//***@') || '未設定'}</span></div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <h4 className="font-medium text-gray-900 mb-2">データ統計</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-600">{stats.projects}</div>
                  <div className="text-xs text-gray-600">プロジェクト</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{stats.accounts}</div>
                  <div className="text-xs text-gray-600">勘定科目</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-purple-600">{stats.vendors}</div>
                  <div className="text-xs text-gray-600">取引先</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-indigo-600">{stats.facts}</div>
                  <div className="text-xs text-gray-600">事実レコード</div>
                </div>
              </div>
            </div>
          </>
        )}

        {status === 'error' && (
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-sm text-red-700">
              データベースに接続できません。設定を確認してください。
            </p>
          </div>
        )}
      </div>
    </div>
  );
};