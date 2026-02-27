import { useState } from 'react';
import './Chat.css';

export default function YouTubeChannelDownload({ onLoaded }) {
  const [channelUrl, setChannelUrl] = useState('https://www.youtube.com/@veritasium');
  const [maxVideos, setMaxVideos] = useState(10);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setStatus('');
    const trimmed = channelUrl.trim();
    if (!trimmed) {
      setError('Please enter a YouTube channel URL.');
      return;
    }
    const n = Number(maxVideos) || 10;
    const clamped = Math.min(100, Math.max(1, n));

    try {
      setLoading(true);
      setProgress(5);
      setStatus('Contacting YouTube API…');

      const interval = setInterval(() => {
        setProgress((p) => Math.min(p + 5, 90));
      }, 800);

      const res = await fetch('/api/youtube/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl: trimmed, maxVideos: clamped }),
      });

      clearInterval(interval);
      setProgress(95);
      setStatus('Processing…');

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || res.statusText);
      }

      const json = await res.json();
      setProgress(100);
      setStatus(`Downloaded ${json.videoCount} videos. Saved as ${json.fileName} in the public folder.`);

      if (onLoaded && json.data) {
        onLoaded(json.data, json.fileName);
      }
    } catch (err) {
      console.error('YouTube download failed', err);
      setError(err.message || 'Failed to download channel data.');
      setProgress(0);
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="youtube-panel">
      <h2 className="youtube-title">YouTube Channel Download</h2>
      <p className="youtube-subtitle">
        Enter a YouTube channel URL to download video metadata (title, description, transcript, duration, views, likes, comments). The JSON file is saved to the public folder and can be dragged into the chat.
      </p>

      <form className="youtube-form" onSubmit={handleSubmit}>
        <label className="youtube-label">
          Channel URL
          <input
            type="url"
            className="youtube-input"
            placeholder="https://www.youtube.com/@veritasium"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            required
          />
        </label>

        <label className="youtube-label youtube-max-row">
          Max videos
          <input
            type="number"
            className="youtube-input youtube-input-small"
            min={1}
            max={100}
            value={maxVideos}
            onChange={(e) => setMaxVideos(Math.min(100, Math.max(1, Number(e.target.value) || 10)))}
          />
          <span className="youtube-max-hint">(1–100, default 10)</span>
        </label>

        {status && <p className="youtube-status">{status}</p>}
        {error && <p className="youtube-error">{error}</p>}

        {loading && (
          <div className="youtube-progress-wrap">
            <div className="youtube-progress-bar">
              <div className="youtube-progress-inner" style={{ width: `${progress}%` }} />
            </div>
            <span className="youtube-progress-text">Downloading channel data…</span>
          </div>
        )}

        <button type="submit" className="youtube-submit" disabled={loading}>
          {loading ? 'Downloading…' : 'Download Channel Data'}
        </button>
      </form>

      <p className="youtube-footnote">
        Add YOUTUBE_API_KEY or REACT_APP_YOUTUBE_API_KEY to .env for the YouTube Data API v3. After downloading, drag the JSON from the public folder into the chat to analyze it.
      </p>
    </div>
  );
}
