import { useState, useEffect, useRef } from 'react';
import { Rnd } from 'react-rnd';

// Renders an image with glowing bounding boxes. If isInteractive is true, wraps them in Draggable/Resizable Rnd.
function ImageWithOverlays({ src, buttons, viewport, isInteractive, onChange }) {
    const baseW = viewport?.w || 1280;
    const baseH = viewport?.h || 720;
    
    const containerRef = useRef(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (let entry of entries) {
                setScale(entry.contentRect.width / baseW);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [baseW]);

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <img src={src} alt="Game Snapshot" style={{ display: 'block', width: '100%', height: 'auto', pointerEvents: 'none' }} />
            
            {buttons && buttons.map((btn, i) => {
                let boxW = (btn.x2 - btn.x1);
                let boxH = (btn.y2 - btn.y1);
                
                // Keep sizes sane for UI rendering
                if (boxW < 40) boxW = 40;
                if (boxH < 40) boxH = 40;

                const scaledX = btn.x1 * scale;
                const scaledY = btn.y1 * scale;
                const scaledW = boxW * scale;
                const scaledH = boxH * scale;

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
                            left: scaledX, top: scaledY, width: scaledW, height: scaledH,
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
                        size={{ width: scaledW, height: scaledH }}
                        position={{ x: scaledX, y: scaledY }}
                        onDragStop={(e, d) => {
                            const newX1 = Math.round(d.x / scale);
                            const newY1 = Math.round(d.y / scale);
                            onChange(i, { ...btn, x1: newX1, y1: newY1, x2: newX1 + boxW, y2: newY1 + boxH });
                        }}
                        onResizeStop={(e, direction, ref, delta, position) => {
                            const newX1 = Math.round(position.x / scale);
                            const newY1 = Math.round(position.y / scale);
                            const newX2 = newX1 + Math.round(ref.offsetWidth / scale);
                            const newY2 = newY1 + Math.round(ref.offsetHeight / scale);
                            onChange(i, { ...btn, x1: newX1, y1: newY1, x2: newX2, y2: newY2 });
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
    const cx = Math.round((button.x1 + button.x2) / 2);
    const cy = Math.round((button.y1 + button.y2) / 2);
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
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                click ({cx}, {cy})
            </span>
        </div>
    );
}

export default function ReportViewer({ reportId, onBack }) {
    const [data, setData] = useState(null);
    const [executing, setExecuting] = useState(false);
    const [localButtons, setLocalButtons] = useState(null);

    // Reset local state when switching tests
    useEffect(() => {
        setLocalButtons(null);
        setData(null);
    }, [reportId]);

    const fetchData = async () => {
        try {
            const res = await fetch(`/api/tests/reports/${reportId}`);
            if (res.ok) {
                const json = await res.json();
                setData(json);
                setLocalButtons(prev => prev || json.detectedButtons);
            }
        } catch(e) {}
    };

    useEffect(() => {
        fetchData();
        const iv = setInterval(() => fetchData(), 3000);
        return () => clearInterval(iv);
    }, [reportId]);

    const handleExecutePhase2 = async () => {
        setExecuting(true);
        try {
            const res = await fetch(`/api/tests/execute-test/${reportId}`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updatedCoordinates: localButtons })
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
                                viewport={data.viewport} 
                                isInteractive={isPhase1Done}
                                onChange={(idx, newVal) => {
                                    if (!localButtons) return;
                                    const copy = [...localButtons];
                                    
                                    // Derive CSS scaling ratio so Phase 2 Playwright clicks remain accurate
                                    const orig = data.detectedButtons[idx];
                                    const ratioX = orig.x1 > 0 ? (orig.cssX1 / orig.x1) : (orig.x2 > 0 ? (orig.cssX2 / orig.x2) : 1);
                                    const ratioY = orig.y1 > 0 ? (orig.cssY1 / orig.y1) : (orig.y2 > 0 ? (orig.cssY2 / orig.y2) : 1);

                                    newVal.cssX1 = Math.round(newVal.x1 * ratioX);
                                    newVal.cssY1 = Math.round(newVal.y1 * ratioY);
                                    newVal.cssX2 = Math.round(newVal.x2 * ratioX);
                                    newVal.cssY2 = Math.round(newVal.y2 * ratioY);

                                    copy[idx] = newVal;
                                    setLocalButtons(copy);
                                }}
                            />
                        </div>
                    )}

                    {isPhase1Done && (
                        <button
                            className="btn-primary"
                            onClick={handleExecutePhase2}
                            disabled={executing}
                        >
                            {executing
                                ? <><span className="spinner"></span> Starting Phase 2...</>
                                : `▶ Execute Phase 2 — Click All ${data.detectedButtons.length} Detected Buttons`}
                        </button>
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
                                                viewport={data.viewport}
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
                                                📍 Box: ({tc.coordinatesUsed.x1},{tc.coordinatesUsed.y1}) → ({tc.coordinatesUsed.x2},{tc.coordinatesUsed.y2})
                                                &nbsp;| Click: ({Math.round((tc.coordinatesUsed.x1+tc.coordinatesUsed.x2)/2)}, {Math.round((tc.coordinatesUsed.y1+tc.coordinatesUsed.y2)/2)})
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
