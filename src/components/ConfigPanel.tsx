import React, { useState } from 'react';
import { Settings, Database, Users, FileText, Save } from 'lucide-react';

interface ConfigPanelProps {
  onConfigChange: (config: any) => void;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ onConfigChange }) => {
  const [config, setConfig] = useState({
    database: {
      url: 'postgresql+psycopg2://user:pass@localhost:5432/appdb',
      schema: 'cost'
    },
    integration: {
      enableFuzzyMatch: true,
      fuzzyThreshold: 90,
      existingProjectsTable: 'existing.projects',
      existingVendorsTable: 'existing.vendors'
    },
    rules: {
      accountCodeRegex: '^[A-Z]\\.[0-9]+(\\.[0-9]+)*$',
      subtotalKeywords: ['合計', '小計', '累計', '売上合計', 'kW単価']
    }
  });

  const [activeTab, setActiveTab] = useState('database');

  const handleInputChange = (section: string, field: string, value: any) => {
    const newConfig = {
      ...config,
      [section]: {
        ...config[section as keyof typeof config],
        [field]: value
      }
    };
    setConfig(newConfig);
    onConfigChange(newConfig);
  };

  const tabs = [
    { id: 'database', label: 'データベース', icon: Database },
    { id: 'integration', label: '連携設定', icon: Users },
    { id: 'rules', label: 'ビジネスルール', icon: FileText }
  ];

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center mb-4">
        <Settings className="w-5 h-5 mr-2 text-indigo-600" />
        <h3 className="text-lg font-semibold text-gray-900">システム設定</h3>
      </div>

      {/* タブナビゲーション */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4 mr-1" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* データベース設定 */}
      {activeTab === 'database' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              データベースURL
            </label>
            <input
              type="text"
              value={config.database.url}
              onChange={(e) => handleInputChange('database', 'url', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="postgresql+psycopg2://user:pass@host:5432/db"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              スキーマ名
            </label>
            <input
              type="text"
              value={config.database.schema}
              onChange={(e) => handleInputChange('database', 'schema', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="cost"
            />
          </div>
        </div>
      )}

      {/* 連携設定 */}
      {activeTab === 'integration' && (
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="fuzzyMatch"
              checked={config.integration.enableFuzzyMatch}
              onChange={(e) => handleInputChange('integration', 'enableFuzzyMatch', e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor="fuzzyMatch" className="ml-2 block text-sm text-gray-900">
              あいまい取引先マッチングを有効にする
            </label>
          </div>
          
          {config.integration.enableFuzzyMatch && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                あいまいマッチング閾値 (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={config.integration.fuzzyThreshold}
                onChange={(e) => handleInputChange('integration', 'fuzzyThreshold', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              既存プロジェクトテーブル
            </label>
            <input
              type="text"
              value={config.integration.existingProjectsTable}
              onChange={(e) => handleInputChange('integration', 'existingProjectsTable', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="existing.projects"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              既存取引先テーブル
            </label>
            <input
              type="text"
              value={config.integration.existingVendorsTable}
              onChange={(e) => handleInputChange('integration', 'existingVendorsTable', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="existing.vendors"
            />
          </div>
        </div>
      )}

      {/* ビジネスルール */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              勘定科目コード正規表現
            </label>
            <input
              type="text"
              value={config.rules.accountCodeRegex}
              onChange={(e) => handleInputChange('rules', 'accountCodeRegex', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
              placeholder="^[A-Z]\\.[0-9]+(\\.[0-9]+)*$"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              小計キーワード（カンマ区切り）
            </label>
            <input
              type="text"
              value={config.rules.subtotalKeywords.join(', ')}
              onChange={(e) => handleInputChange('rules', 'subtotalKeywords', e.target.value.split(',').map(s => s.trim()))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="合計, 小計, 累計, 売上合計, kW単価"
            />
          </div>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-gray-200">
        <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
          <Save className="w-4 h-4 mr-2" />
          設定を保存
        </button>
      </div>
    </div>
  );
};