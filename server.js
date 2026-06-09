const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 7000;
const DADDY_SCHEDULE = 'https://dlhd.pk/schedule/schedule-generated.json';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
});

app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'com.lukiestreams.livesports',
    version: '1.0.0',
    name: '🏆 Lukie Sports',
    description: 'Live sports streams by Lukie',
    resources: ['catalog', 'meta', 'stream'],
    types: ['channel'],
    catalogs: [{ type: 'channel', id: 'live-sports', name: '🔴 Live & Upcoming Sports' }],
    idPrefixes: ['dlhd_'],
    behaviorHints: { adult: false }
  });
});

app.get('/catalog/channel/live-sports.json', async (req, res) => {
  try {
    const { data } = await axios.get(DADDY_SCHEDULE);
    const metas = [];
    for (const day of Object.values(data)) {
      for (const category of Object.values(day)) {
        for (const event of category) {
          if (!event.channels || event.channels.length === 0) continue;
          const ch = event.channels[0];
          metas.push({
            id: `dlhd_${ch.channel_id}`,
            type: 'channel',
            name: event.event,
            poster: ch.logo_url ? `https://dlhd.pk/${ch.logo_url}` : null,
            genres: [],
            releaseInfo: event.time || '',
          });
        }
      }
    }
    res.json({ metas });
  } catch (e) {
    res.json({ metas: [] });
  }
});

app.get('/meta/channel/:id.json', async (req, res) => {
  try {
    const id = req.params.id;
    const channelId = id.replace('dlhd_', '');
    const { data } = await axios.get(DADDY_SCHEDULE);
    let found = null;
    for (const day of Object.values(data)) {
      for (const category of Object.values(day)) {
        for (const event of category) {
          if (!event.channels) continue;
          const ch = event.channels.find(c => c.channel_id == channelId);
          if (ch) { found = { event, ch }; break; }
        }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) return res.json({ meta: {} });
    res.json({
      meta: {
        id,
        type: 'channel',
        name: found.event.event,
        poster: found.ch.logo_url ? `https://dlhd.pk/${found.ch.logo_url}` : null,
        description: `⏰ ${found.event.time || 'TBD'}`,
        genres: [],
        videos: [{
          id,
          title: '🔴 Watch Live',
          released: new Date().toISOString(),
          streams: []
        }]
      }
    });
  } catch (e) {
    res.json({ meta: {} });
  }
});

async function extractM3u8(channelId) {
  const embedUrl = `https://donis.jimpenopisonline.online/premiumtv/daddy3.php?id=${channelId}`;
  try {
    const { data: html } = await axios.get(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://dlhd.pk'
      }
    });
    const match = html.match(/window\.atob\('([^']+)'\)/);
    if (!match) return null;
    return Buffer.from(match[1], 'base64').toString('utf8');
  } catch (e) {
    console.error('extractM3u8 error:', e.message);
    return null;
  }
}

app.get('/proxy.m3u8', async (req, res) => {
  try {
    const url = req.query.url;
    const referer = req.query.referer;

    const response = await axios.get(url, {
      headers: {
        'Referer': referer,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://donis.jimpenopisonline.online'
      },
      responseType: 'text'
    });

    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
    let playlist = response.data;
    playlist = playlist.replace(/^(?!#)(.+)$/gm, (line) => {
      const segUrl = line.startsWith('http') ? line : baseUrl + line;
      return `https://lukie-sports-addonn.onrender.com/proxy.m3u8?url=${encodeURIComponent(segUrl)}&referer=${encodeURIComponent(referer)}`;
    });

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(playlist);
  } catch (e) {
    console.error('Proxy error:', e.message);
    res.status(500).send('Proxy error');
  }
});

app.get('/stream/channel/:id.json', async (req, res) => {
  try {
    const channelId = req.params.id.replace('dlhd_', '');
    const m3u8 = await extractM3u8(channelId);
    if (m3u8) {
      const referer = `https://donis.jimpenopisonline.online/premiumtv/daddy3.php?id=${channelId}`;
      const proxiedUrl = `https://lukie-sports-addonn.onrender.com/proxy.m3u8?url=${encodeURIComponent(m3u8)}&referer=${encodeURIComponent(referer)}`;
      res.json({
        streams: [{
          url: proxiedUrl,
          title: '🔴 Lukie Sports HD',
          behaviorHints: { notWebReady: false }
        }]
      });
    } else {
      res.json({ streams: [{ externalUrl: `https://dlhd.pk/stream/stream-${channelId}.php`, title: '📺 External' }] });
    }
  } catch (e) {
    console.error(e.message);
    res.json({ streams: [] });
  }
});

app.listen(PORT, () => console.log(`✅ Lukie Sports running at http://localhost:${PORT}/manifest.json`));