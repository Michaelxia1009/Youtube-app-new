import { useState, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function MetricVsTimeChart({ data, metric }) {
  const [enlarged, setEnlarged] = useState(false);
  const chartRef = useRef(null);

  const handleDownload = () => {
    const svg = chartRef.current?.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chart_${metric || 'metric'}_vs_time.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!data?.length) return null;

  const chart = (
    <ResponsiveContainer width="100%" height={enlarged ? 400 : 280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis
          dataKey="date"
          tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={50}
        />
        <Tooltip
          contentStyle={{
            background: 'rgba(15,15,35,0.95)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            color: '#e2e8f0',
          }}
          formatter={(val) => [val?.toLocaleString?.() ?? val, metric || 'value']}
        />
        <Line type="monotone" dataKey="value" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <div className={`metric-chart-wrap ${enlarged ? 'enlarged' : ''}`} ref={chartRef}>
      <div className="metric-chart-header">
        <span className="metric-chart-label">{metric || 'Metric'} vs Time</span>
        <div className="metric-chart-actions">
          <button type="button" className="metric-chart-btn" onClick={() => setEnlarged((e) => !e)}>
            {enlarged ? 'Shrink' : 'Enlarge'}
          </button>
          <button type="button" className="metric-chart-btn" onClick={handleDownload}>
            Download
          </button>
        </div>
      </div>
      <div className="metric-chart-body" onClick={() => !enlarged && setEnlarged(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEnlarged(true)}>
        {chart}
      </div>
    </div>
  );
}
