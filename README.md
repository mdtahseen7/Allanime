# Allanime API

A fast, lightweight Node.js API to search anime, get episode lists, and stream videos — powered by Allanime.

## Setup

### Option 1: Cloudflare Workers (Recommended)

Host the API on Cloudflare's global edge network for free. It is fully stateless, serverless, and highly performant.

```bash
cd worker
npm install
npm run deploy
```

*This will prompt you to log into your Cloudflare account and deploy the API to a `*.workers.dev` domain.*

---

### Option 2: Local / Node.js Server

Run the API as a standard Node.js Express server.

```bash
npm install
npm start
```

The server runs on `http://localhost:5678` by default. Set `PORT` in `.env` to change it.

---

## Endpoints

### `GET /search?query=<query>`

Search for anime titles.

**Example:**
```
GET /search?query=one piece
```

**Response:**
```json
[
  {
    "id": "ReooPAxPMsHM4KPMY",
    "title": "One Piece",
    "episodes_sub": 1159,
    "episodes_dub": 1149
  },
  {
    "id": "goYFnpCpue3Mpi2pQ",
    "title": "One Piece Film: Red",
    "episodes_sub": 1,
    "episodes_dub": 1
  }
]
```

---

### `GET /anime/<id>`

Get details for a specific anime.

**Example:**
```
GET /anime/ReooPAxPMsHM4KPMY
```

**Response:**
```json
{
  "id": "ReooPAxPMsHM4KPMY",
  "title": "One Piece",
  "title_english": "One Piece",
  "thumbnail_url": "https://wp.youtube-anime.com/aln.youtube-anime.com/images/...",
  "synopsis": "Gol D. Roger was known as the Pirate King...",
  "status": "Releasing",
  "episodes_sub": 1159,
  "episodes_dub": 1149
}
```

---

### `GET /episodes/<id>?mode=<sub|dub>`

Get the list of available episode numbers.

**Example:**
```
GET /episodes/ReooPAxPMsHM4KPMY?mode=sub
```

**Response:**
```json
{
  "mode": "sub",
  "episodes": ["1", "2", "3", "4", "5", "..."]
}
```

---

### `GET /episode_info?show_id=<id>&ep_no=<num>`

Get metadata for a specific episode, including thumbnails, title, and description.

**Example:**
```
GET /episode_info?show_id=ReooPAxPMsHM4KPMY&ep_no=1
```

**Response:**
```json
{
  "episode_no": 1,
  "title": "Original Title: I'm Luffy! The Man Who Will Become the Pirate King!",
  "description": "Alvida’s Pirate Crew is terrorizing a cruise ship and they’ve found a barrel...",
  "thumbnails": [
    "https://allanime.day/data2/ep_tbs/ReooPAxPMsHM4KPMY/1_dub.jpg",
    "https://static.wixstatic.com/media/a3bb38_53b4872d69c84e40bc5698680d2efb4bf001.jpg"
  ]
}
```

---


### `GET /episode_url?show_id=<id>&ep_no=<num>&mode=<sub|dub>&quality=<best|worst|1080p>`

Get the direct video URL for an episode.

**Example:**
```
GET /episode_url?show_id=ReooPAxPMsHM4KPMY&ep_no=1&mode=sub&quality=best
```

**Response:**
```json
{
  "episode_url": "https://video.wixstatic.com/video/.../1080p/mp4/file.mp4",
  "mode": "sub"
}
```

---

### `GET /play?show_id=<id>&ep_no=<num>&mode=<sub|dub>&quality=<best|worst|1080p>`

**Stream the video directly** in your browser or any video player. This proxies the video through the API with the required headers.

**Example:**
```
http://localhost:5678/play?show_id=ReooPAxPMsHM4KPMY&ep_no=1
```

Open this URL in your browser, VLC, or any media player — it plays directly.

---

### `POST /thumbnails`

Get thumbnails for multiple anime in one request.

**Body:**
```json
{
  "ids": ["ReooPAxPMsHM4KPMY", "2NxpL4ikTQvnri9Cm"]
}
```

---

## Parameters

| Parameter  | Values           | Default | Description                 |
| ---------- | ---------------- | ------- | --------------------------- |
| `mode`     | `sub`, `dub`     | `sub`   | Subbed or dubbed version    |
| `quality`  | `best`, `worst`, `1080p`, `720p`, `480p` | `best` | Video quality |

## License

MIT
