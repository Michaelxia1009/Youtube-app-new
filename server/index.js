const dotenv = require('dotenv');
dotenv.config({ override: true });
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const URI = process.env.REACT_APP_MONGODB_URI || process.env.MONGODB_URI || process.env.REACT_APP_MONGO_URI;
const DB = 'chatapp';
const getYouTubeApiKey = () => {
  // Re-load .env so newly added keys are picked up without a full restart.
  dotenv.config({ override: true });
  return process.env.YOUTUBE_API_KEY || process.env.REACT_APP_YOUTUBE_API_KEY;
};

let db;

async function connect() {
  const client = await MongoClient.connect(URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    tlsAllowInvalidCertificates: true, // helps with some Atlas SSL handshake issues
  });
  db = client.db(DB);
  console.log('MongoDB connected');
}

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif;padding:2rem;background:#00356b;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0">
        <div style="text-align:center">
          <h1>Chat API Server</h1>
          <p>Backend is running. Use the React app at <a href="http://localhost:3000" style="color:#ffd700">localhost:3000</a></p>
          <p><a href="/api/status" style="color:#ffd700">Check DB status</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/status', async (req, res) => {
  try {
    const usersCount = await db.collection('users').countDocuments();
    const sessionsCount = await db.collection('sessions').countDocuments();
    res.json({ usersCount, sessionsCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Users ────────────────────────────────────────────────────────────────────

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = String(username).trim().toLowerCase();
    const existing = await db.collection('users').findOne({ username: name });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    const hashed = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({
      username: name,
      password: hashed,
      email: email ? String(email).trim().toLowerCase() : null,
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = username.trim().toLowerCase();
    const user = await db.collection('users').findOne({ username: name });
    if (!user) return res.status(401).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });
    res.json({ ok: true, username: name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username required' });
    const sessions = await db
      .collection('sessions')
      .find({ username })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(
      sessions.map((s) => ({
        id: s._id.toString(),
        agent: s.agent || null,
        title: s.title || null,
        createdAt: s.createdAt,
        messageCount: (s.messages || []).length,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { username, agent } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const { title } = req.body;
    const result = await db.collection('sessions').insertOne({
      username,
      agent: agent || null,
      title: title || null,
      createdAt: new Date().toISOString(),
      messages: [],
    });
    res.json({ id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await db.collection('sessions').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/sessions/:id/title', async (req, res) => {
  try {
    const { title } = req.body;
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Messages ─────────────────────────────────────────────────────────────────

app.post('/api/messages', async (req, res) => {
  try {
    const { session_id, role, content, imageData, charts, toolCalls } = req.body;
    if (!session_id || !role || content === undefined)
      return res.status(400).json({ error: 'session_id, role, content required' });
    const msg = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...(imageData && {
        imageData: Array.isArray(imageData) ? imageData : [imageData],
      }),
      ...(charts?.length && { charts }),
      ...(toolCalls?.length && { toolCalls }),
    };
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(session_id) },
      { $push: { messages: msg } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const doc = await db
      .collection('sessions')
      .findOne({ _id: new ObjectId(session_id) });
    const raw = doc?.messages || [];
    const msgs = raw.map((m, i) => {
      const arr = m.imageData
        ? Array.isArray(m.imageData)
          ? m.imageData
          : [m.imageData]
        : [];
      return {
        id: `${doc._id}-${i}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        images: arr.length
          ? arr.map((img) => ({ data: img.data, mimeType: img.mimeType }))
          : undefined,
        charts: m.charts?.length ? m.charts : undefined,
        toolCalls: m.toolCalls?.length ? m.toolCalls : undefined,
      };
    });
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── YouTube channel download ───────────────────────────────────────────────────

const { YoutubeTranscript } = require('youtube-transcript');

async function fetchChannelVideos(channelUrl, maxVideos, onProgress) {
  const ytApiKey = getYouTubeApiKey();
  if (!ytApiKey) throw new Error('YOUTUBE_API_KEY or REACT_APP_YOUTUBE_API_KEY required in .env');
  const handleMatch = String(channelUrl).match(/youtube\.com\/@([^/?]+)/i);
  if (!handleMatch) throw new Error('Use @handle URLs, e.g. https://www.youtube.com/@veritasium');
  const handle = handleMatch[1];

  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&forHandle=${encodeURIComponent(handle)}&key=${ytApiKey}`
  );
  const channelJson = await channelRes.json();
  if (!channelRes.ok) throw new Error(channelJson.error?.message || 'YouTube API error');
  const channel = channelJson.items?.[0];
  if (!channel) throw new Error('Channel not found');
  const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) throw new Error('Uploads playlist not found');

  const videos = [];
  let pageToken;
  const totalToFetch = Math.min(maxVideos, 100);

  while (videos.length < totalToFetch) {
    if (onProgress) onProgress(Math.round((videos.length / totalToFetch) * 80));
    const piUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    piUrl.searchParams.set('part', 'contentDetails');
    piUrl.searchParams.set('playlistId', uploadsId);
    piUrl.searchParams.set('maxResults', String(Math.min(50, totalToFetch - videos.length)));
    if (pageToken) piUrl.searchParams.set('pageToken', pageToken);
    piUrl.searchParams.set('key', ytApiKey);

    const piRes = await fetch(piUrl);
    const piJson = await piRes.json();
    if (!piRes.ok) throw new Error(piJson.error?.message || 'Playlist fetch failed');
    const ids = (piJson.items || []).map((it) => it.contentDetails?.videoId).filter(Boolean);
    if (!ids.length) break;

    const vidsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${ids.join(',')}&key=${ytApiKey}`
    );
    const vidsJson = await vidsRes.json();
    if (!vidsRes.ok) throw new Error(vidsJson.error?.message || 'Videos fetch failed');
    const byId = new Map((vidsJson.items || []).map((v) => [v.id, v]));

    for (let i = 0; i < ids.length && videos.length < totalToFetch; i++) {
      const id = ids[i];
      const v = byId.get(id);
      if (!v) continue;
      const s = v.snippet || {};
      const stats = v.statistics || {};
      const cd = v.contentDetails || {};
      const thumbs = s.thumbnails || {};
      const thumbUrl = thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || null;

      let transcript = null;
      try {
        const t = await YoutubeTranscript.fetchTranscript(id);
        transcript = Array.isArray(t) ? t.map((x) => x.text).join(' ') : String(t || '');
      } catch (_) {}

      const dur = cd.duration || null;
      let durationSeconds = null;
      if (dur && typeof dur === 'string') {
        const dm = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
        if (dm) durationSeconds = (parseInt(dm[1] || 0, 10) * 3600) + (parseInt(dm[2] || 0, 10) * 60) + parseInt(dm[3] || 0, 10);
      }
      videos.push({
        videoId: id,
        title: s.title || '',
        description: s.description || '',
        duration: dur,
        durationSeconds,
        publishedAt: s.publishedAt || null,
        viewCount: Number(stats.viewCount || 0),
        likeCount: Number(stats.likeCount || 0),
        commentCount: Number(stats.commentCount || 0),
        url: `https://www.youtube.com/watch?v=${id}`,
        thumbnailUrl: thumbUrl,
        channelTitle: s.channelTitle || channel.snippet?.title || null,
        transcript,
      });
    }
    pageToken = piJson.nextPageToken;
    if (!pageToken) break;
  }

  if (onProgress) onProgress(95);
  const data = {
    channelHandle: `@${handle}`,
    channelId: channel.id,
    fetchedAt: new Date().toISOString(),
    videoCount: videos.length,
    videos,
  };
  if (onProgress) onProgress(100);
  return data;
}

app.post('/api/youtube/channel', async (req, res) => {
  try {
    const { channelUrl, maxVideos } = req.body || {};
    if (!channelUrl) return res.status(400).json({ error: 'channelUrl required' });
    const limit = Math.min(100, Math.max(1, Number(maxVideos) || 10));

    const progressCallback = (p) => {
      // SSE or polling could be used; for simplicity we just complete
    };
    const data = await fetchChannelVideos(channelUrl, limit, progressCallback);

    const safeHandle = (data.channelHandle || 'channel').replace(/^@/, '');
    const fileName = `${safeHandle}_${data.videoCount}_videos.json`;
    const publicDir = path.join(__dirname, '..', 'public');
    const outPath = path.join(publicDir, fileName);
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');

    res.json({ ok: true, fileName, videoCount: data.videoCount, data, downloadUrl: `/${fileName}` });
  } catch (err) {
    console.error('YouTube download error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

connect()
  .then(() => {
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
