import React, { useState, useEffect } from 'react';
import './GSTDashboard.css';

const GSTDashboard = () => {
  // Safe initial states with defaults
  const [period, setPeriod] = useState('monthly');
  const [returns, setReturns] = useState([]);
  const [stats, setStats] = useState({ 
    taxable: 0, 
    taxPayable: 0, 
    pending: 0 
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Mock data for offline development
  const mockReturns = [
    { id: 1, type: 'GSTR-1', period: 'Mar 2026', status: 'Ready', value: 1500000, tax: 90000, due: 'Apr 11' },
    { id: 2, type: 'GSTR-3B', period: 'Mar 2026', status: 'Draft', value: 1500000, tax: 90000, due: 'Apr 20' },
    { id: 3, type: 'CMP-08', period: 'Q1 2026', status: 'Filed', value: 1200000, tax: 48000, due: 'Apr 18' },
    { id: 4, type: 'GSTR-4', period: 'Q1 2026', status: 'Ready', value: 1200000, tax: 48000, due: 'Apr 30' }
  ];

  const mockStats = { taxable: 4210000, taxPayable: 222000, pending: 2 };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Try API calls with fallback
        const [statsRes, returnsRes] = await Promise.allSettled([
          fetch(`/api/gst/stats`).then(r => r.ok ? r.json() : Promise.reject()),
          fetch(`/api/gst/returns?period=${period}`).then(r => r.ok ? r.json() : Promise.reject())
        ]);

        if (statsRes.status === 'fulfilled') {
          setStats(statsRes.value);
        } else {
          console.warn('Using mock stats (API not ready)');
          setStats(mockStats);
        }

        if (returnsRes.status === 'fulfilled') {
          setReturns(returnsRes.value);
        } else {
          console.warn('Using mock returns (API not ready)');
          setReturns(mockReturns);
        }
      } catch (err) {
        console.error('GST API error:', err);
        setError('Backend APIs coming soon - using demo data');
        setStats(mockStats);
        setReturns(mockReturns);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [period]);

  const generateReturn = async (type) => {
    // Mock generation
    alert(`🚀 Generating ${type} for ${period}...\n\n✅ JSON ready for download!\n(Connect backend for real filing)`);
  };

  const fileReturn = (type) => {
    window.open('https://gst.gov.in/#/login', '_blank');
  };

  if (loading) {
    return (
      <div className="gst-loading">
        <div className="spinner"></div>
        <p>Loading GST data...</p>
      </div>
    );
  }

  return (
    <div className="gst-dashboard">
      <header>
        <h1>GST Filing Dashboard</h1>
        <select value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
        </select>
        {error && <div className="error-banner">{error}</div>}
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>₹{stats.taxable?.toLocaleString() || '0'}</h3>
          <p>Total Taxable Value</p>
        </div>
        <div className="stat-card warning">
          <h3>{stats.pending || 0}</h3>
          <p>Pending Returns</p>
        </div>
        <div className="stat-card">
          <h3>₹{stats.taxPayable?.toLocaleString() || '0'}</h3>
          <p>Tax Payable</p>
        </div>
      </div>

      <div className="returns-table">
        <h3>Returns Summary ({returns.length})</h3>
        <table>
          <thead>
            <tr>
              <th>Type</th><th>Period</th><th>Status</th><th>Value (₹)</th><th>Tax (₹)</th><th>Due</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {returns.map(r => (
              <tr key={r.id}>
                <td>{r.type}</td>
                <td>{r.period}</td>
                <td><span className={`status ${r.status}`}>{r.status}</span></td>
                <td>₹{r.value?.toLocaleString() || '0'}</td>
                <td>₹{r.tax?.toLocaleString() || '0'}</td>
                <td>{r.due}</td>
                <td>
                  <button onClick={() => generateReturn(r.type)}>Generate</button>
                  <button onClick={() => fileReturn(r.type)}>File</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="quick-actions">
        <button className="primary" onClick={() => generateReturn('gstr1')}>Generate GSTR-1</button>
        <button className="primary" onClick={() => generateReturn('gstr3b')}>Generate GSTR-3B</button>
        <button>Reconcile ITC</button>
        <button>Download All JSON</button>
      </div>

      <div className="api-status">
        <small>✅ Demo mode active | Backend APIs: /api/gst/stats & /api/gst/returns</small>
      </div>
    </div>
  );
};

export default GSTDashboard;