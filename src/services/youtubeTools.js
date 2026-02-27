// ── YouTube channel JSON tools (for Gemini function calling) ──────────────────

export const YOUTUBE_TOOL_DECLARATIONS = [
  {
    name: 'generateImage',
    description:
      'Generate an image from a text prompt and optionally an anchor image. Use when the user asks to generate a thumbnail, banner, or visual concept for the channel. The anchor image (if provided) inspires style/content.',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: {
          type: 'STRING',
          description: 'Detailed text description of the image to generate (composition, colors, mood, text overlays).',
        },
        anchorTitle: {
          type: 'STRING',
          description: 'Optional: title of a video from the channel to use as style reference.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'plot_metric_vs_time',
    description:
      'Plot a numeric metric (views, likes, comments, etc.) vs time for the channel videos. Use when the user asks to plot, graph, or visualize a metric over time.',
    parameters: {
      type: 'OBJECT',
      properties: {
        metric: {
          type: 'STRING',
          description: 'Numeric field to plot: viewCount, likeCount, commentCount, or other numeric field from the videos.',
        },
      },
      required: ['metric'],
    },
  },
  {
    name: 'play_video',
    description:
      'Select and display a video from the loaded channel data. Use when the user asks to play, open, or show a video. User can specify by title (e.g. "asbestos video"), ordinal (e.g. "first", "second"), or "most viewed" / "most liked" / "most commented".',
    parameters: {
      type: 'OBJECT',
      properties: {
        videoTitle: {
          type: 'STRING',
          description: 'Exact or partial video title to match.',
        },
        ordinal: {
          type: 'NUMBER',
          description: 'Ordinal position (1=first, 2=second, etc.) when sorted by publishedAt.',
        },
        sortBy: {
          type: 'STRING',
          description: 'Sort criterion: "most_viewed", "most_liked", "most_commented" to get the top video.',
        },
      },
    },
  },
  {
    name: 'compute_stats_json',
    description:
      'Compute mean, median, std, min, and max for a numeric field in the channel JSON. Use when the user asks for statistics, average, distribution, or summary of a numeric column (e.g. viewCount, likeCount, commentCount).',
    parameters: {
      type: 'OBJECT',
      properties: {
        field: {
          type: 'STRING',
          description: 'Numeric field name: viewCount, likeCount, commentCount, or durationSeconds.',
        },
      },
      required: ['field'],
    },
  },
];

// Normalize field names (user might say "views" or "view_count")
const resolveNumericField = (videos, name) => {
  if (!videos?.length) return null;
  const keys = Object.keys(videos[0]);
  const n = String(name || '').toLowerCase().replace(/[_\s]/g, '');
  const map = {
    viewcount: 'viewCount',
    likecount: 'likeCount',
    commentcount: 'commentCount',
    duration: 'durationSeconds',
    durationseconds: 'durationSeconds',
  };
  const resolved = map[n] || keys.find((k) => k.toLowerCase().replace(/[_\s]/g, '') === n) || name;
  return keys.includes(resolved) ? resolved : name;
};

// Parse ISO 8601 duration to seconds (e.g. PT10M5S -> 605)
const parseDuration = (dur) => {
  if (!dur || typeof dur !== 'string') return null;
  const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return null;
  const h = parseInt(m[1] || 0, 10);
  const min = parseInt(m[2] || 0, 10);
  const s = parseInt(m[3] || 0, 10);
  return h * 3600 + min * 60 + s;
};

export function executeYouTubeTool(toolName, args, channelData) {
  const videos = channelData?.videos || [];
  if (!videos.length && toolName !== 'generateImage') {
    return { error: 'No channel data loaded. Drag a JSON file into the chat first.' };
  }

  switch (toolName) {
    case 'generateImage': {
      // Create a placeholder SVG image (Gemini Imagen would require separate API)
      const prompt = args.prompt || 'YouTube channel visual';
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225">
          <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#ff6b6b"/><stop offset="100%" style="stop-color:#4ecdc4"/></linearGradient></defs>
          <rect width="400" height="225" fill="url(#g)"/>
          <text x="200" y="110" text-anchor="middle" fill="white" font-family="sans-serif" font-size="14">${prompt.slice(0, 40)}</text>
          <text x="200" y="130" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-family="sans-serif" font-size="10">Generated concept</text>
        </svg>
      `;
      const base64 = btoa(unescape(encodeURIComponent(svg)));
      return {
        _type: 'image',
        data: base64,
        mimeType: 'image/svg+xml',
        prompt,
      };
    }

    case 'plot_metric_vs_time': {
      const metric = resolveNumericField(videos, args.metric);
      let dataPoints = videos.map((v) => {
        const date = v.publishedAt ? new Date(v.publishedAt).toISOString().slice(0, 10) : null;
        let val = v[metric];
        if (metric === 'durationSeconds' && !val && v.duration) val = parseDuration(v.duration);
        return { date, value: Number(val) || 0, title: v.title?.slice(0, 30) };
      });
      dataPoints = dataPoints.filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date));
      return {
        _chartType: 'metric_vs_time',
        metric: metric || args.metric,
        data: dataPoints,
      };
    }

    case 'play_video': {
      let selected = null;
      if (args.sortBy) {
        const sortKey = {
          most_viewed: 'viewCount',
          most_liked: 'likeCount',
          most_commented: 'commentCount',
        }[String(args.sortBy).toLowerCase()] || 'viewCount';
        const sorted = [...videos].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
        selected = sorted[0];
      } else if (args.ordinal != null) {
        const idx = Math.max(0, Math.floor(Number(args.ordinal)) - 1);
        const byDate = [...videos].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
        selected = byDate[idx];
      } else if (args.videoTitle) {
        const q = String(args.videoTitle).toLowerCase();
        selected = videos.find((v) => (v.title || '').toLowerCase().includes(q));
        if (!selected) {
          const partial = videos.find((v) => q.includes((v.title || '').toLowerCase().slice(0, 20)));
          selected = partial;
        }
      }
      if (!selected) return { error: 'No matching video found.' };
      return {
        _type: 'video_card',
        video: {
          videoId: selected.videoId,
          title: selected.title,
          url: selected.url,
          thumbnailUrl: selected.thumbnailUrl,
        },
      };
    }

    case 'compute_stats_json': {
      const field = resolveNumericField(videos, args.field);
      let values = videos.map((v) => {
        let val = v[field];
        if (field === 'durationSeconds' && !val && v.duration) val = parseDuration(v.duration);
        return Number(val);
      }).filter((n) => !isNaN(n));
      if (!values.length) return { error: `No numeric values for field "${field}".` };
      values.sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / values.length;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      const median = values.length % 2 === 0
        ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
        : values[Math.floor(values.length / 2)];
      return {
        field: field || args.field,
        count: values.length,
        mean: Math.round(mean * 100) / 100,
        median: Math.round(median * 100) / 100,
        std: Math.round(Math.sqrt(variance) * 100) / 100,
        min: values[0],
        max: values[values.length - 1],
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
