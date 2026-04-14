import { useState, useEffect, useRef } from 'react';
import { Rnd } from 'react-rnd';

// Renders an image with glowing bounding boxes. If isInteractive is true, wraps them in Draggable/Resizable Rnd.
function ImageWithOverlays({ src, buttons, isInteractive, onChange }) {
    const containerRef = useRef(null);

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <img src={src} alt="Game Snapshot" style={{ display: 'block', width: '100%', height: 'auto', pointerEvents: 'none' }} />
            
            {buttons && buttons.map((btn, i) => {
                const innerLabel = (
                    <div style={{
                        position: 'absolute', bottom: '100%', left: '-2px',
                        background: isInteractive ? '#3b82f6' : 'rgba(0,0,0,0.85)', 
                        color: isInteractive ? '#fff' : '#00ff88',
                        fontSize: '0.6rem', fontWeight: 'bold',
                        padding: '2px 5px', borderRadius: '3px 3px 0 0',
                        whiteSpace: 'nowrap', lineHeight: '1.2'
                    }}>
                        {btn.name} {isInteractive && '✋'}
                    </div>
                );

                if (!isInteractive) {
                    return (
                        <div key={i} style={{
                            position: 'absolute',
                            left: `${btn.pX1 * 100}%`, top: `${btn.pY1 * 100}%`, 
                            width: `${(btn.pX2 - btn.pX1) * 100}%`, height: `${(btn.pY2 - btn.pY1) * 100}%`,
                            border: '2px solid #00ff88',
                            backgroundColor: 'rgba(0,255,136,0.15)',
                            boxShadow: '0 0 12px rgba(0,255,136,0.6), inset 0 0 8px rgba(0,255,136,0.2)',
                            pointerEvents: 'none',
                            zIndex: 10,
                            borderRadius: '4px'
                        }}>
                            {innerLabel}
                        </div>
                    );
                }

                // Interactive Mode
                return (
                    <Rnd
                        key={i}
                        bounds="parent"
                        size={{ width: `${(btn.pX2 - btn.pX1) * 100}%`, height: `${(btn.pY2 - btn.pY1) * 100}%` }}
                        position={{ x: (btn.pX1 * (containerRef.current?.offsetWidth || 1)), y: (btn.pY1 * (containerRef.current?.offsetHeight || 1)) }}
                        onDragStop={(e, d) => {
                            if (!containerRef.current) return;
                            const w = containerRef.current.offsetWidth;
                            const h = containerRef.current.offsetHeight;
                            const newPx1 = d.x / w;
                            const newPy1 = d.y / h;
                            const widthPercent = btn.pX2 - btn.pX1;
                            const heightPercent = btn.pY2 - btn.pY1;

                            onChange(i, { ...btn, pX1: newPx1, pY1: newPy1, pX2: newPx1 + widthPercent, pY2: newPy1 + heightPercent });
                        }}
                        onResizeStop={(e, direction, ref, delta, position) => {
                            if (!containerRef.current) return;
                            const w = containerRef.current.offsetWidth;
                            const h = containerRef.current.offsetHeight;
                            const newPx1 = position.x / w;
                            const newPy1 = position.y / h;
                            const newPx2 = newPx1 + (ref.offsetWidth / w);
                            const newPy2 = newPy1 + (ref.offsetHeight / h);

                            onChange(i, { ...btn, pX1: newPx1, pY1: newPy1, pX2: newPx2, pY2: newPy2 });
                        }}
                        style={{
                            border: '2px dashed #3b82f6',
                            backgroundColor: 'rgba(59,130,246,0.25)',
                            boxShadow: '0 0 8px rgba(59,130,246,0.5)',
                            zIndex: 20,
                            borderRadius: '4px',
                            cursor: 'move'
                        }}
                    >
                        {innerLabel}
                    </Rnd>
                );
            })}
        </div>
    );
}

function CoordTag({ button }) {
    return (
        <div style={{

            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: '6px', marginBottom: '6px', gap: '8px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1rem' }}>🎯</span>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{button.name}</span>
            </div>
        </div>
    );
}

export default function ReportViewer({ reportId, onBack }) {
    const [data, setData] = useState(null);
    const [executing, setExecuting] = useState(false);
    const [localButtons, setLocalButtons] = useState(null);
    const [selectedTCs, setSelectedTCs] = useState(new Set());

    // Reset local state when switching tests
    useEffect(() => {
        setLocalButtons(null);
        setData(null);
        setSelectedTCs(new Set());
    }, [reportId]);

    const fetchData = async () => {
        try {
            const res = await fetch(`/api/tests/reports/${reportId}`);
            if (res.ok) {
                const json = await res.json();
                setData(json);
                setLocalButtons(prev => prev || json.detectedButtons);
                // Initialize all TCs as selected on first load
                if (json.detectedButtons && json.detectedButtons.length > 0) {
                    setSelectedTCs(prev => prev.size === 0 ? new Set(json.detectedButtons.map((_, i) => i)) : prev);
                }
            }
        } catch(e) {}
    };

    useEffect(() => {
        fetchData();
        const iv = setInterval(() => fetchData(), 3000);
        return () => clearInterval(iv);
    }, [reportId]);

    const handleExecutePhase2 = async (indices = null) => {
        setExecuting(true);
        try {
            const body = { updatedCoordinates: localButtons };
            if (indices) body.selectedIndices = indices;
            const res = await fetch(`/api/tests/execute-test/${reportId}`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                let msg = `Error (${res.status})`;
                try { const d = await res.json(); msg = d.error || msg; } catch(e) {}
                alert(msg);
            } else {
                fetchData();
            }
        } catch(e) {
            alert('Network error: ' + e.message);
        } finally {
            setExecuting(false);
        }
    };

    if (!data) return (
        <div className="empty-state">
            <span className="empty-state-icon">⏳</span>
            <h3>Loading report...</h3>
        </div>
    );

    let hostname = data.url;
    try { hostname = new URL(data.url).hostname; } catch(e) {}

    const passCount = data.reports?.filter(r => r.status === 'Pass').length || 0;
    const isPhase1Detecting = data.status === 'Detecting';
    const isPhase1Done = data.status === 'Detected';
    const isPhase2Running = data.status === 'Running' && data.phase === 2;
    const isFinished = data.status === 'Passed' || data.status === 'Failed';

    return (
        <div>
            {/* Header */}
            <div className="report-header">
                <button className="btn-ghost" onClick={onBack}>← Back</button>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>{hostname}</h2>
                        <span className={`badge badge-${data.status.toLowerCase()}`}>
                            {isPhase1Detecting && '⚡ Detecting...'}
                            {isPhase1Done && '🎯 Coordinates Ready'}
                            {isPhase2Running && '⚡ Testing...'}
                            {data.status === 'Passed' && '✓ Passed'}
                            {data.status === 'Failed' && '✕ Failed'}
                        </span>
                        {(data.phase) && (
                            <span style={{ fontSize: '0.78rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '3px 10px', color: 'var(--text2)' }}>
                                Phase {data.phase} {isFinished ? '✓ Complete' : ''}
                            </span>
                        )}
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '4px', fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-all' }}>{data.url}</p>
                </div>
                {passCount > 0 && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--success)' }}>{passCount}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>TCs Passed</div>
                    </div>
                )}
            </div>

            {/* PHASE 1: Detecting */}
            {isPhase1Detecting && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <div className="card-header">
                        <div className="card-title">⚡ Phase 1: Game Loading & Gemini Analysis</div>
                    </div>
                    <p style={{ color: 'var(--text2)', fontSize: '0.875rem', marginBottom: '12px' }}>
                        The browser has launched and is loading the game. Once the canvas stabilizes, a screenshot will be sent to Gemini Vision to detect all interactive buttons...
                    </p>
                    <div className="tc-logs">
                        {data.logs?.map((l, i) => <div key={i} className="log-line">&gt; {l.message || l}</div>)}
                        {(!data.logs || data.logs.length === 0) && <div style={{ color: 'var(--text3)' }}>Waiting for browser to launch...</div>}
                    </div>
                </div>
            )}

            {/* PHASE 1 DONE: Show detected coordinates */}
            {(isPhase1Done || isPhase2Running || isFinished) && data.detectedButtons?.length > 0 && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <div className="card-header">
                        <div>
                            <div className="card-title">🎯 Gemini Vision — Detected Buttons ({data.detectedButtons.length})</div>
                            <div className="card-sub">Coordinates ready for automated testing</div>
                        </div>
                        {data.screenshotPath && (
                            <a href={data.screenshotPath} target="_blank" rel="noreferrer" className="btn-ghost">View Screenshot</a>
                        )}
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        {data.detectedButtons.map((btn, i) => <CoordTag key={i} button={btn} />)}
                    </div>

                    {data.screenshotPath && (
                        <div style={{ marginBottom: '16px' }}>
                            <p className="form-label" style={{ marginBottom: '8px' }}>
                                Game Screenshot (Phase 1)
                                {isPhase1Done && <span style={{ marginLeft: '10px', color: 'var(--primary)' }}>👉 Feel free to drag or resize these boxes before running Phase 2!</span>}
                            </p>
                            <ImageWithOverlays 
                                src={data.screenshotPath} 
                                buttons={localButtons || data.detectedButtons} 
                                isInteractive={isPhase1Done}
                                onChange={(idx, newVal) => {
                                    if (!localButtons) return;
                                    const copy = [...localButtons];
                                    copy[idx] = newVal;
                                    setLocalButtons(copy);
                                }}
                            />
                        </div>
                    )}

                    {isPhase1Done && (
                        <div style={{ marginTop: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <p className="form-label" style={{ margin: 0 }}>📋 Select Test Cases to Execute</p>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="btn-ghost" style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                        onClick={() => setSelectedTCs(new Set(data.detectedButtons.map((_, i) => i)))}>
                                        Select All
                                    </button>
                                    <button className="btn-ghost" style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                        onClick={() => setSelectedTCs(new Set())}>
                                        Deselect All
                                    </button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                                {(localButtons || data.detectedButtons).map((btn, i) => (
                                    <label key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '8px 12px', background: selectedTCs.has(i) ? 'rgba(59,130,246,0.1)' : 'var(--bg)',
                                        border: `1px solid ${selectedTCs.has(i) ? 'var(--primary)' : 'var(--border)'}`,
                                        borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s'
                                    }}>
                                        <input type="checkbox" checked={selectedTCs.has(i)}
                                            onChange={() => {
                                                const next = new Set(selectedTCs);
                                                next.has(i) ? next.delete(i) : next.add(i);
                                                setSelectedTCs(next);
                                            }}
                                            style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                                        />
                                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>TC{String(i + 2).padStart(2, '0')}</span>
                                        <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>{btn.name}</span>
                                    </label>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    className="btn-primary"
                                    onClick={() => handleExecutePhase2([...selectedTCs])}
                                    disabled={executing || selectedTCs.size === 0}
                                    style={{ flex: 1 }}
                                >
                                    {executing
                                        ? <><span className="spinner"></span> Running...</>
                                        : `▶ Run Selected (${selectedTCs.size} TC${selectedTCs.size !== 1 ? 's' : ''})`}
                                </button>
                                <button
                                    className="btn-ghost"
                                    onClick={() => handleExecutePhase2()}
                                    disabled={executing}
                                    style={{ whiteSpace: 'nowrap' }}
                                >
                                    ▶▶ Run All ({data.detectedButtons.length})
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* PHASE 2 RUNNING: Live logs */}
            {isPhase2Running && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <div className="card-header">
                        <div className="card-title">⚡ Phase 2: Executing Button Clicks (Live)</div>
                        <span className="badge badge-running">Running</span>
                    </div>
                    <div className="tc-logs" style={{ maxHeight: '260px' }}>
                        {data.logs?.filter(l => l.message?.includes('[EXECUTE]') || (typeof l === 'string' && l.includes('[EXECUTE]'))).map((l, i) => (
                            <div key={i} className="log-line">{l.message || l}</div>
                        ))}
                        {data.logs?.slice(-10).map((l, i) => (
                            <div key={i} className="log-line">&gt; {l.message || l}</div>
                        ))}
                    </div>
                </div>
            )}

            {/* RESULTS: TC Reports */}
            {data.reports && data.reports.length > 0 && (
                <div>
                    <div className="section-header" style={{ marginBottom: '16px' }}>
                        <div className="section-title">📊 Test Case Results ({data.reports.length} buttons tested)</div>
                    </div>
                    <div className="tc-list">
                        {data.reports.map((tc, i) => (
                            <div className="tc-card" key={i}>
                                <div className="tc-header">
                                    <span className="tc-name">{tc.testCaseName}</span>
                                    <span className={`badge badge-${tc.status.toLowerCase()}`}>
                                        {tc.status === 'Pass' ? '✓ Pass' : '✕ Fail'}
                                    </span>
                                </div>
                                <div className="tc-body">
                                    {tc.beforeScreenshot && (
                                        <div className="shot-box">
                                            <h4>Before Click</h4>
                                            <ImageWithOverlays 
                                                src={tc.beforeScreenshot} 
                                                buttons={tc.coordinatesUsed ? [tc.coordinatesUsed] : []} 
                                            />
                                        </div>
                                    )}
                                    {tc.afterScreenshot && tc.afterScreenshot !== tc.beforeScreenshot && (
                                        <div className="shot-box">
                                            <h4>After Action</h4>
                                            <img src={tc.afterScreenshot} alt="After Action" className="shot-img" />
                                        </div>
                                    )}
                                    <div className="tc-logs">
                                        {tc.logs?.map((l, j) => <div key={j} className="log-line">&gt; {l}</div>)}
                                        {tc.coordinatesUsed && !Array.isArray(tc.coordinatesUsed) && (
                                            <div className="log-coord">
                                                📍 Box: X({(tc.coordinatesUsed.pX1*100).toFixed(1)}% → {(tc.coordinatesUsed.pX2*100).toFixed(1)}%) | Y({(tc.coordinatesUsed.pY1*100).toFixed(1)}% → {(tc.coordinatesUsed.pY2*100).toFixed(1)}%)
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* No data yet after detection complete */}
            {isPhase1Done && (!data.detectedButtons || data.detectedButtons.length === 0) && (
                <div className="empty-state">
                    <span className="empty-state-icon">⚠️</span>
                    <h3>No buttons detected</h3>
                    <p>Gemini could not identify interactive elements. The game may not have loaded properly or requires login.</p>
                </div>
            )}
        </div>
    );
}
