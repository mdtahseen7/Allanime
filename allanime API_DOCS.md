# Allanime API Documentation

This document outlines all available endpoints, required parameters, and JSON response schemas for the Allanime API.

---

## 1. Search Anime
Searches for anime titles matching the query.

**Endpoint:** `GET /search`

**Query Parameters:**
- `query` (required): The search string (e.g., `naruto`).

**Response Schema:**
```json
[
  {
    "id": "J2B9PqjWk8M...",
    "title": "Naruto Shippuden",
    "episodes_sub": 500,
    "episodes_dub": 500
  }
]
```

---

## 2. Get Anime Details
Retrieves detailed metadata for a specific anime show ID.

**Endpoint:** `GET /anime/:id`

**Path Parameters:**
- `id` (required): The internal Allanime show ID.

**Response Schema:**
```json
{
  "id": "J2B9PqjWk8M...",
  "title": "Naruto Shippuden",
  "title_english": "Naruto Shippuden",
  "thumbnail_url": "https://allanime.day/images/...",
  "synopsis": "Naruto Uzumaki is back! After two and a half years of training...",
  "status": "Finished",
  "episodes_sub": 500,
  "episodes_dub": 500
}
```

---

## 3. Get Episode List
Returns a sorted array of available episode numbers for an anime.

**Endpoint:** `GET /episodes/:id`

**Path Parameters:**
- `id` (required): The internal Allanime show ID.

**Query Parameters:**
- `mode` (optional): The translation type. Accepts `sub` or `dub`. Defaults to `sub`.

**Response Schema:**
```json
{
  "mode": "sub",
  "episodes": [
    "1",
    "2",
    "2.5",
    "3"
  ]
}
```

---

## 4. Get Episode URL
Extracts and selects the raw media URL (mp4 or m3u8) for a specific episode.

**Endpoint:** `GET /episode_url`

**Query Parameters:**
- `show_id` (required): The internal Allanime show ID.
- `ep_no` (required): The episode number (must match a string from the `/episodes/:id` list).
- `mode` (optional): `sub` or `dub`. Defaults to `sub`.
- `quality` (optional): Desired quality. Accepts `best`, `worst`, `1080`, `720`, `480`, `360`. Defaults to `best`.

**Response Schema:**
```json
{
  "episode_url": "https://v1.allanime.day/stream/...",
  "mode": "sub"
}
```

---

## 5. Play Video Stream
Acts as a proxy to stream the video directly to the client, bypassing CORS and automatically selecting the best link based on your parameters. 

**Endpoint:** `GET /play`

**Query Parameters:**
- `show_id` (required): The internal Allanime show ID.
- `ep_no` (required): The episode number.
- `mode` (optional): `sub` or `dub`. Defaults to `sub`.
- `quality` (optional): `best`, `worst`, or specific resolution (e.g. `1080`). Defaults to `best`.

**Response:**
*Returns a raw binary video stream with `Content-Type: video/mp4` and handles `Range` headers natively for seamless seeking.*

---

## 6. Get Episode Info
Fetches metadata (titles, descriptions, thumbnails) for a specific episode.

**Endpoint:** `GET /episode_info`

**Query Parameters:**
- `show_id` (required): The internal Allanime show ID.
- `ep_no` (required): The episode number.

**Response Schema:**
```json
{
  "episode_no": 1,
  "title": "Homecoming",
  "description": "Naruto returns to the Hidden Leaf Village...",
  "thumbnails": [
    "https://allanime.day/images/episode_thumb_1.jpg"
  ]
}
```

---

## 7. Batch Get Thumbnails
A utility endpoint to fetch thumbnail URLs for multiple anime IDs at once.

**Endpoint:** `POST /thumbnails`

**Request Body Schema:**
```json
{
  "ids": ["J2B9PqjWk8M...", "another_id_123"]
}
```
*(Note: You can also use the key `"mal_ids"` in place of `"ids"` if you modified the schema)*

**Response Schema:**
```json
{
  "J2B9PqjWk8M...": "https://allanime.day/images/thumb1.jpg",
  "another_id_123": "https://allanime.day/images/thumb2.jpg"
}
```
