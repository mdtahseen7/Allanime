import { Hono } from 'hono';
import { cors } from 'hono/cors';
import * as scraper from './scraper.js';

const app = new Hono();
app.use('*', cors());

app.get('/', (c) => c.json({
    title: "Anime API (Cloudflare Worker)",
    status: "running",
    source: "Allanime Direct",
    available_endpoints: [
        "/search?query=<query>",
        "/anime/<id>",
        "/thumbnails (POST with {'ids': ['id1', 'id2', ...]})",
        "/episodes/<id>?mode=<sub|dub>",
        "/episode_info?show_id=<id>&ep_no=<ep_no>",
        "/episode_url?show_id=<id>&ep_no=<ep_no>&quality=<quality>&mode=<sub|dub>",
        "/play?show_id=<id>&ep_no=<ep_no>&quality=<quality>&mode=<sub|dub> (streams video directly)"
    ]
}));

app.get('/search', async (c) => {
    const query = c.req.query('query') || '';
    if (!query) return c.json({ error: "Missing query parameter" }, 400);
    try {
        const results = await scraper.searchAnime(query);
        return c.json(results);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/anime/:id', async (c) => {
    try {
        const id = c.req.param('id');
        const details = await scraper.getAnimeDetails(id);
        if (!details) return c.json({ error: "Anime not found on Allanime" }, 404);
        return c.json(details);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/episodes/:id', async (c) => {
    const id = c.req.param('id');
    const mode = c.req.query('mode') === 'dub' ? 'dub' : 'sub';
    try {
        const episodes = await scraper.getEpisodesList(id, mode);
        return c.json({ mode, episodes });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/episode_url', async (c) => {
    const id = c.req.query('show_id');
    const epNo = c.req.query('ep_no');
    const quality = c.req.query('quality') || 'best';
    const mode = c.req.query('mode') === 'dub' ? 'dub' : 'sub';

    if (!id || !epNo) return c.json({ error: "Missing show_id or ep_no" }, 400);

    try {
        const url = await scraper.getEpisodeUrl(id, epNo, mode, quality);
        if (!url) return c.json({ error: "Episode not found or URL not available" }, 404);
        return c.json({ episode_url: url, mode });
    } catch (e) {
        const status = e.message && e.message.startsWith('NEED_CAPTCHA') ? 503 : 500;
        return c.json({ error: e.message }, status);
    }
});

app.get('/play', async (c) => {
    const id = c.req.query('show_id');
    const epNo = c.req.query('ep_no');
    const quality = c.req.query('quality') || 'best';
    const mode = c.req.query('mode') === 'dub' ? 'dub' : 'sub';

    if (!id || !epNo) return c.json({ error: "Missing show_id or ep_no" }, 400);

    try {
        const url = await scraper.getEpisodeUrl(id, epNo, mode, quality);
        if (!url) return c.json({ error: "Episode not found or URL not available" }, 404);

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
            'Referer': 'https://allmanga.to'
        };
        const range = c.req.header('Range');
        if (range) headers['Range'] = range;

        const videoResp = await fetch(url, { headers });

        const respHeaders = new Headers();
        respHeaders.set('Content-Type', 'video/mp4');
        respHeaders.set('Content-Disposition', 'inline');
        if (videoResp.headers.get('content-length')) {
            respHeaders.set('Content-Length', videoResp.headers.get('content-length'));
        }
        if (videoResp.headers.get('content-range')) {
            respHeaders.set('Content-Range', videoResp.headers.get('content-range'));
        }
        if (videoResp.headers.get('accept-ranges')) {
            respHeaders.set('Accept-Ranges', videoResp.headers.get('accept-ranges'));
        }

        return new Response(videoResp.body, {
            status: videoResp.status,
            headers: respHeaders
        });
    } catch (e) {
        const status = e.message && e.message.startsWith('NEED_CAPTCHA') ? 503 : 500;
        return c.json({ error: e.message }, status);
    }
});

app.get('/episode_info', async (c) => {
    const id = c.req.query('show_id');
    const epNo = c.req.query('ep_no');

    if (!id || !epNo) return c.json({ error: "Missing show_id or ep_no" }, 400);

    try {
        const info = await scraper.getEpisodeInfo(id, epNo);
        if (!info) return c.json({ error: "Episode info not found" }, 404);
        return c.json(info);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/thumbnails', async (c) => {
    try {
        const body = await c.req.json();
        const inputIds = body.ids || body.mal_ids;

        if (!inputIds || !Array.isArray(inputIds)) {
            return c.json({ error: "Missing 'ids' list in request body" }, 400);
        }

        const results = {};
        for (const id of inputIds) {
            try {
                const details = await scraper.getAnimeDetails(id);
                if (details && details.thumbnail_url) {
                    results[id] = details.thumbnail_url;
                }
            } catch (err) { /* ignore */ }
        }

        return c.json(results);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;
