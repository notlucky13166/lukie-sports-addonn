const express = require('express');
const axios = require('axios');
const { chromium } = require('playwright');

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

async function extractM3u8(embedUrl) {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  let m3u8Url = null;
  let capturedHeaders = {};

  page.on('request', request => {
    const url = request.url();
    if (!m3u8Url && url.includes('.m3u8')) {
      m3u8Url = url;
      capturedHeaders = request.headers();
    }
  });

  try {
    await page.goto(embedUrl, { waitUntil: 'networkidle', timeout: 15000 });
    if (!m3u8Url) await page.waitForTimeout(3000);
  } catch (e) {}

  await browser.close();
  return m3u8Url ? { url: m3u8Url, headers: capturedHeaders } : null;
}

app.get('/stream/channel/:id.json', async (req, res) => {
  try {
    const channelId = req.params.id.replace('dlhd_', '');
    const embedUrl = `https://dlhd.pk/stream/stream-${channelId}.php`;
    
    const result = await extractM3u8(embedUrl);
    
    if (result) {
      res.json({
        streams: [{
          url: result.url,
          title: '🔴 Lukie Sports HD',
          behaviorHints: {
            notWebReady: false,
            proxyHeaders: {
              request: {
                'Referer': embedUrl,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            }
          }
        }]
      });
    } else {
      // fallback to external
      res.json({
        streams: [{
          externalUrl: embedUrl,
          title: '📺 Lukie Sports (External)'
        }]
      });
    }
  } catch (e) {
    res.json({ streams: [] });
  }
});

app.listen(PORT, () => console.log(`✅ Lukie Sports running at http://localhost:${PORT}/manifest.json`));