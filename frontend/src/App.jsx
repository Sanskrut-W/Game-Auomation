import { useState } from 'react';
import Dashboard from './components/Dashboard';
import ReportViewer from './components/ReportViewer';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('new');
  const [selectedReportId, setSelectedReportId] = useState(null);

  const viewReport = (id) => {
    setSelectedReportId(id);
    setActiveTab('report');
  };

  const tabLabel = {
    new: '🚀 New Test',
    history: '📋 Test History',
    report: '📊 Report Viewer'
  };

  return (
    <div className="app-root">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>🎰 Casino AutoAI</h1>
          <p>AI Canvas Testing Platform</p>
        </div>
        <nav className="sidebar-nav">
          {['new', 'history'].map(tab => (
            <div
              key={tab}
              className={`nav-item ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              <span className="nav-icon">{tab === 'new' ? '🚀' : '📋'}</span>
              {tab === 'new' ? 'New Test' : 'Test History'}
            </div>
          ))}
          {selectedReportId && (
            <div
              className={`nav-item ${activeTab === 'report' ? 'active' : ''}`}
              onClick={() => setActiveTab('report')}
            >
              <span className="nav-icon">📊</span>
              Report Viewer
            </div>
          )}
        </nav>
        <div className="sidebar-footer">
          Powered by Gemini 2.5 + Playwright
        </div>
      </aside>

      {/* MAIN */}
      <div className="main">
        <header className="topbar">
          <span className="topbar-title">{tabLabel[activeTab]}</span>
          <span className="topbar-badge">● Backend Active · In-Memory Mode</span>
        </header>
        <div className="content">
          {activeTab === 'new' && (
            <Dashboard onViewReport={viewReport} showHistoryOnly={false} />
          )}
          {activeTab === 'history' && (
            <Dashboard onViewReport={viewReport} showHistoryOnly={true} />
          )}
          {activeTab === 'report' && selectedReportId && (
            <ReportViewer reportId={selectedReportId} onBack={() => setActiveTab('history')} />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
