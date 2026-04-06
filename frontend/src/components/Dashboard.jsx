import { useState, useEffect } from 'react';

export default function Dashboard({ onViewReport, showHistoryOnly }) {
  const [url, setUrl] = useState('');
  const [bulkUrls, setBulkUrls] = useState('');
  const [isBulk, setIsBulk] = useState(false);
  const [headless, setHeadless] = useState(false);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [username, setUsername] = useState(localStorage.getItem('savedUsername') || '');
  const [password, setPassword] = useState(localStorage.getItem('savedPassword') || '');
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem('savedUsername', username);
  }, [username]);

  useEffect(() => {
    localStorage.setItem('savedPassword', password);
  }, [password]);

  const fetchTests = async () => {
    try {
      const res = await fetch('/api/tests/all');
      if (res.ok) setTests(await res.json());
      // silently fail if backend is not ready yet
    } catch (e) { /* silent — backend may still be starting */ }
  };

  useEffect(() => {
    fetchTests();
    const interval = setInterval(fetchTests, 4000);
    return () => clearInterval(interval);
  }, []);

  const getConfig = () => ({
    headless, requiresLogin,
    username: requiresLogin ? username : '',
    password: requiresLogin ? password : ''
  });

  const handleRun = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const res = await fetch('/api/tests/run-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, config: getConfig() })
      });
      if (!res.ok) {
        let msg = `Connection Error (${res.status})`;
        try { const d = await res.json(); msg = d.error || msg; } catch(e) {}
        alert('Error: ' + msg);
        return;
      }
      setUrl('');
      setTimeout(fetchTests, 1000);
    } catch (e) {
      alert('Network Error: Backend is not reachable. Make sure backend server is running on port 5000.');
    } finally { setLoading(false); }
  };

  const handleBulk = async () => {
    const urlsArray = bulkUrls.split('\n').map(u => u.trim()).filter(Boolean);
    if (!urlsArray.length) return;
    setLoading(true);
    try {
      const res = await fetch('/api/tests/run-bulk-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlsArray, config: getConfig() })
      });
      if (!res.ok) {
        let msg = `Connection Error (${res.status})`;
        try { const d = await res.json(); msg = d.error || msg; } catch(e) {}
        alert('Error: ' + msg);
        return;
      }
      setBulkUrls('');
      setTimeout(fetchTests, 1000);
    } catch (e) {
      alert('Network Error: Backend is not reachable.');
    } finally { setLoading(false); }
  };

  const passed = tests.filter(t => t.status === 'Passed').length;
  const failed = tests.filter(t => t.status === 'Failed').length;
  const running = tests.filter(t => t.status === 'Running' || t.status === 'Pending').length;

  return (
    <div>
      {/* STATS ROW */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(59,130,246,0.15)' }}>🧪</div>
          <div className="stat-body">
            <h3 style={{ color: '#3b82f6' }}>{tests.length}</h3>
            <p>Total Tests</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.15)' }}>✅</div>
          <div className="stat-body">
            <h3 style={{ color: '#10b981' }}>{passed}</h3>
            <p>Passed</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.15)' }}>❌</div>
          <div className="stat-body">
            <h3 style={{ color: '#ef4444' }}>{failed}</h3>
            <p>Failed</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.15)' }}>⚡</div>
          <div className="stat-body">
            <h3 style={{ color: '#f59e0b' }}>{running}</h3>
            <p>In Progress</p>
          </div>
        </div>
      </div>

      {/* NEW TEST FORM */}
      {!showHistoryOnly && (
        <>
          <div className="page-header">
            <h2>Launch Test Automation</h2>
            <p>AI-powered Canvas game interaction using Gemini Vision + Playwright</p>
          </div>
          <div className="two-col" style={{ marginBottom: '32px' }}>

            {/* LEFT: URL INPUT */}
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Target Game</div>
                  <div className="card-sub">Enter the casino game URL to test</div>
                </div>
              </div>
              <div className="tab-bar">
                <button className={`tab-btn ${!isBulk ? 'active' : ''}`} onClick={() => setIsBulk(false)}>Single URL</button>
                <button className={`tab-btn ${isBulk ? 'active' : ''}`} onClick={() => setIsBulk(true)}>Bulk Queue</button>
              </div>
              {!isBulk ? (
                <div className="form-group">
                  <label className="form-label">Game URL</label>
                  <input
                    className="form-input"
                    type="text"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://freeplay.ragingriver.io/goldBlitz?gameId=..."
                    onKeyDown={e => e.key === 'Enter' && handleRun()}
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">URLs (one per line)</label>
                  <textarea
                    className="form-input"
                    rows={5}
                    value={bulkUrls}
                    onChange={e => setBulkUrls(e.target.value)}
                    placeholder={"https://game1.com\nhttps://game2.com"}
                  />
                </div>
              )}

              {/* FLOW STEPS */}
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginTop: '4px' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text3)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Automation Flow</p>
                {['Launch browser & navigate to URL', 'Wait 12s for canvas stabilization', 'Screenshot → Send to Gemini Vision', 'Gemini returns button coordinates', 'Execute TC01-TC07 via coordinate clicks', 'Generate before/after screenshots & report'].map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--primary)', color: 'white', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>{i+1}</div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT: CONFIG */}
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Execution Settings</div>
                  <div className="card-sub">Configure browser and authentication options</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                <div className="toggle-group" onClick={() => setHeadless(h => !h)}>
                  <label className="toggle" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={headless} onChange={e => setHeadless(e.target.checked)} />
                    <span className="toggle-track"></span>
                    <span className="toggle-thumb"></span>
                  </label>
                  <div className="toggle-info">
                    <h4>Headless Mode</h4>
                    <p>Run in background (no browser window)</p>
                  </div>
                </div>

                <div className="toggle-group" onClick={() => setRequiresLogin(r => !r)}>
                  <label className="toggle" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={requiresLogin} onChange={e => setRequiresLogin(e.target.checked)} />
                    <span className="toggle-track"></span>
                    <span className="toggle-thumb"></span>
                  </label>
                  <div className="toggle-info">
                    <h4>Requires Login</h4>
                    <p>Authenticate before launching game</p>
                  </div>
                </div>

                {requiresLogin && (
                  <div className="credentials-box" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
                      Since some casino games use anti-bot overlays, the most reliable way to authenticate is to log in manually once and save your session cookies.
                    </p>
                    <button 
                      className="btn-ghost" 
                      style={{ border: '1px solid var(--primary)', alignSelf: 'flex-start', padding: '8px 16px' }}
                      onClick={async () => {
                        if (!url) return alert('Please enter a Game URL first.');
                        try {
                           const res = await fetch('/api/tests/manual-login', {
                               method: 'POST',
                               headers: { 'Content-Type': 'application/json' },
                               body: JSON.stringify({ url })
                           });
                           if (res.ok) alert('Browser launched! Please log in on the new window, then CLOSE the browser. Your session will be saved automatically for automated testing!');
                           else alert('Failed to launch manual login');
                        } catch(e) { alert('Error launching manual login'); }
                      }}
                    >
                      👤 Open Browser to Log In Manually (Saves Session)
                    </button>
                    
                    <div style={{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text3)', marginBottom: '8px' }}>Or use programmatic login (may fail on secure sites):</p>
                        <div className="form-group">
                          <label className="form-label">Username / Mobile</label>
                          <input className="form-input" type="text" value={username} onChange={e => setUsername(e.target.value)} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Password</label>
                          <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                        </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                className="btn-primary"
                onClick={!isBulk ? handleRun : handleBulk}
                disabled={loading || (!isBulk ? !url : !bulkUrls)}
              >
                {loading ? <><span className="spinner"></span> Initializing...</> : '🚀 Launch Automated Test Sequence'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* HISTORY SECTION */}
      <div className="section-header">
        <div>
          <div className="section-title">{showHistoryOnly ? 'All Test Executions' : 'Recent Executions'}</div>
          <div className="section-sub">Click a card to view the detailed report</div>
        </div>
        <button className="btn-ghost" onClick={fetchTests}>↻ Refresh</button>
      </div>

      {tests.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">🎰</span>
          <h3>No tests executed yet</h3>
          <p>Launch a test automation run to see results here</p>
        </div>
      ) : (
        <div className="test-grid">
          {tests.map(test => {
            let hostname = 'Unknown';
            let pathname = '';
            try { const u = new URL(test.url); hostname = u.hostname; pathname = u.pathname; } catch(e) { hostname = test.url || 'Unknown'; }
            return (
            <div className="test-card" key={test._id} onClick={() => onViewReport(test._id)}>
              <div className="test-card-header">
                <div className="test-url">
                  <strong>{hostname}</strong>
                  {pathname}
                </div>
                <span className={`badge badge-${test.status === 'Detected' ? 'passed' : (test.status || 'pending').toLowerCase()}`}>
                  {test.status === 'Running' && '⚡ Running'}
                  {test.status === 'Detecting' && '⚡ Detecting...'}
                  {test.status === 'Detected' && '🎯 Awaiting Phase 2'}
                  {test.status === 'Passed' && '✓ Passed'}
                  {test.status === 'Failed' && '✕ Failed'}
                  {test.status === 'Pending' && '⏳ Pending'}
              </span>
              </div>
              <div className="test-meta">
                <span className="test-chip">{test.config?.headless ? 'Headless' : 'Headed'}</span>
                {test.config?.requiresLogin && <span className="test-chip">Auth</span>}
                {test.reports?.length > 0 && <span className="test-chip">{test.reports.length} TCs</span>}
                <span className="test-time">{new Date(test.createdAt).toLocaleString()}</span>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
