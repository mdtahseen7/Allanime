const AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0";
const ALLANIME_REFR = "https://allmanga.to";
const ALLANIME_BASE = "allanime.day";
const ALLANIME_API = `https://api.${ALLANIME_BASE}`;

// Persisted query hash for episode embeds (from ani-cli v4.14.0)
const EPISODE_QUERY_HASH = "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec";

let ALLANIME_KEY = null;

async function getKey() {
    if (ALLANIME_KEY) return ALLANIME_KEY;
    const enc = new TextEncoder();
    const keyData = await crypto.subtle.digest('SHA-256', enc.encode('Xot36i3lK3:v1'));
    ALLANIME_KEY = await crypto.subtle.importKey('raw', keyData, { name: 'AES-CTR' }, false, ['decrypt']);
    return ALLANIME_KEY;
}

async function decrypt(blob) {
    try {
        const raw = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
        // Format: [version:1][IV:12][ciphertext][auth_tag:16]
        const iv = raw.slice(1, 13);
        const ctLen = raw.length - 13 - 16;
        const ciphertext = raw.slice(13, 13 + ctLen);
        const counter = new Uint8Array(16);
        counter.set(iv, 0);
        counter[15] = 2; // matches openssl counter start

        const key = await getKey();
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-CTR', counter, length: 32 },
            key,
            ciphertext
        );
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        return null;
    }
}

// Base64url to raw bytes helper
function b64urlDecode(b64url) {
    let padded = b64url;
    const mod = padded.length % 4;
    if (mod === 2) padded += '==';
    else if (mod === 3) padded += '=';
    const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// Filemoon provider decryption (v4.14.0)
async function getFilemoonLinks(providerPath) {
    const allLinks = [];
    const fetchUrl = providerPath.startsWith('http') ? providerPath : `https://${ALLANIME_BASE}${providerPath}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(fetchUrl, {
            headers: { 'User-Agent': AGENT, 'Referer': ALLANIME_REFR },
            signal: controller.signal
        });
        clearTimeout(timeout);
        const fmData = await response.json();

        if (fmData && fmData.iv && fmData.payload && fmData.key_parts) {
            const kp1Bytes = b64urlDecode(fmData.key_parts[0]);
            const kp2Bytes = b64urlDecode(fmData.key_parts[1]);
            // Concatenate key parts
            const keyBytes = new Uint8Array(kp1Bytes.length + kp2Bytes.length);
            keyBytes.set(kp1Bytes, 0);
            keyBytes.set(kp2Bytes, kp1Bytes.length);

            const ivBytes = b64urlDecode(fmData.iv);
            const counter = new Uint8Array(16);
            counter.set(ivBytes, 0);
            counter[15] = 2;

            const payloadBytes = b64urlDecode(fmData.payload);
            const ctLen = payloadBytes.length - 16;
            const ciphertext = payloadBytes.slice(0, ctLen);

            const fmKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CTR' }, false, ['decrypt']);
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-CTR', counter, length: 32 },
                fmKey,
                ciphertext
            );
            const plain = new TextDecoder().decode(decrypted);

            const parts = plain.replace(/[{}\[\]]/g, '\n').split('\n');
            for (const part of parts) {
                const m1 = part.match(/"url":"([^"]*)".*"height":(\d+)/);
                const m2 = part.match(/"height":(\d+).*"url":"([^"]*)"/);
                if (m1) {
                    let url = m1[1].replace(/\\u0026/g, '&').replace(/\\u003D/g, '=');
                    allLinks.push({ resolution: m1[2], url });
                } else if (m2) {
                    let url = m2[2].replace(/\\u0026/g, '&').replace(/\\u003D/g, '=');
                    allLinks.push({ resolution: m2[1], url });
                }
            }
        }
    } catch (e) {
        // Filemoon provider fetch failed
    }

    return allLinks;
}

// Custom hex decoding from anime.sh (provider_init)
const decodeMapping = {
    '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G', '70': 'H', '71': 'I', '72': 'J', '73': 'K', '74': 'L', '75': 'M', '76': 'N', '77': 'O',
    '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T', '6d': 'U', '6e': 'V', '6f': 'W', '60': 'X', '61': 'Y', '62': 'Z',
    '59': 'a', '5a': 'b', '5b': 'c', '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', '50': 'h', '51': 'i', '52': 'j', '53': 'k', '54': 'l', '55': 'm', '56': 'n', '57': 'o',
    '48': 'p', '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u', '4e': 'v', '4f': 'w', '40': 'x', '41': 'y', '42': 'z',
    '08': '0', '09': '1', '0a': '2', '0b': '3', '0c': '4', '0d': '5', '0e': '6', '0f': '7', '00': '8', '01': '9',
    '15': '-', '16': '.', '67': '_', '46': '~', '02': ':', '17': '/', '07': '?', '1b': '#', '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$', '1e': '&', '10': '(', '11': ')', '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%'
};

function decodeProviderId(hex) {
    let result = '';
    for (let i = 0; i < hex.length; i += 2) {
        const part = hex.substring(i, i + 2);
        result += decodeMapping[part] || '';
    }
    return result.replace('/clock', '/clock.json');
}

async function apiFetch(query, variables) {
    const response = await fetch(`${ALLANIME_API}/api`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': AGENT,
            'Referer': ALLANIME_REFR
        },
        body: JSON.stringify({ query, variables })
    });
    return response.json();
}

// Mirrors get_links() from anime.sh
async function getLinks(providerPath) {
    let allLinks = [];

    if (providerPath.includes('tools.fast4speed.rsvp')) {
        allLinks.push({ resolution: 'Yt', url: providerPath });
        return allLinks;
    }

    const fetchUrl = providerPath.startsWith('http') ? providerPath : `https://${ALLANIME_BASE}${providerPath}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(fetchUrl, {
            headers: { 'User-Agent': AGENT, 'Referer': ALLANIME_REFR },
            signal: controller.signal
        });
        clearTimeout(timeout);
        const providerData = await response.json();

        if (providerData.links && Array.isArray(providerData.links)) {
            for (const link of providerData.links) {
                const url = link.link;
                const res = link.resolutionStr || 'unknown';

                if (url && url.includes('repackager.wixmp.com')) {
                    const cleaned = url.replace('repackager.wixmp.com/', '').replace(/\.urlset.*/, '');
                    const qualitiesMatch = url.match(/\/,([^/]*),\/mp4/);
                    if (qualitiesMatch) {
                        const qualities = qualitiesMatch[1].split(',');
                        for (const q of qualities) {
                            const qUrl = cleaned.replace(/,[^/]*/, q);
                            allLinks.push({ resolution: q, url: qUrl });
                        }
                    } else {
                        allLinks.push({ resolution: res, url });
                    }
                } else if (url) {
                    allLinks.push({ resolution: res, url });
                }
            }
        }

        if (providerData.hls && providerData.hls.url) {
            allLinks.push({ resolution: 'hls', url: providerData.hls.url });
        }
    } catch (e) {
        // Provider fetch failed
    }

    return allLinks;
}

// Parse tobeparsed/sourceUrls from API response into respLines
async function parseSourceLines(apiData) {
    const rawJson = JSON.stringify(apiData);
    const hasTobeparsed = rawJson.includes('"tobeparsed"');
    let respLines = [];

    if (hasTobeparsed) {
        const data = apiData.data;
        let blobValue = (apiData.tobeparsed) ||
                        (data && data.tobeparsed) ||
                        (data && data.episode && data.episode.tobeparsed) ||
                        null;

        if (!blobValue) {
            const tbpMatch = rawJson.match(/"tobeparsed":"([^"]*)"/);
            if (tbpMatch) blobValue = tbpMatch[1];
        }

        if (blobValue) {
            const plain = await decrypt(blobValue);
            if (plain) {
                const parts = plain.replace(/[{}]/g, '\n').split('\n');
                for (const part of parts) {
                    const m = part.match(/"sourceUrl":"--([^"]*)".*"sourceName":"([^"]*)"/);
                    if (m) respLines.push({ sourceName: m[2], hex: m[1] });
                }
            }
        }
    } else if (apiData.data && apiData.data.episode && apiData.data.episode.sourceUrls) {
        const raw = JSON.stringify(apiData.data.episode.sourceUrls);
        const cleaned = raw.replace(/\\u002F/g, '/').replace(/\\/g, '');
        const parts = cleaned.replace(/[{}]/g, '\n').split('\n');
        for (const part of parts) {
            const m = part.match(/"sourceUrl":"--([^"]*)".*"sourceName":"([^"]*)"/);
            if (m) respLines.push({ sourceName: m[2], hex: m[1] });
        }
    }

    return respLines;
}

export async function searchAnime(query) {
    const searchGql = `query($search: SearchInput $limit: Int $page: Int $countryOrigin: VaildCountryOriginEnumType) {
        shows( search: $search limit: $limit page: $page countryOrigin: $countryOrigin ) {
            edges {
                _id
                name
                englishName
                nativeName
                availableEpisodes
                __typename
            }
        }
    }`;

    try {
        const data = await apiFetch(searchGql, {
            search: { allowAdult: false, allowUnknown: false, query },
            limit: 40, page: 1, countryOrigin: "ALL"
        });

        const shows = data.data.shows.edges;
        return shows.map(show => ({
            id: show._id,
            title: show.englishName || show.name.replace(/\\"/g, '"'),
            episodes_sub: parseInt(show.availableEpisodes.sub) || 0,
            episodes_dub: parseInt(show.availableEpisodes.dub) || 0
        }));
    } catch (e) {
        return [];
    }
}

export async function getAnimeDetails(showId) {
    const query = `query ($showId: String!) {
        show( _id: $showId ) {
            _id name englishName nativeName thumbnail description status availableEpisodesDetail
        }
    }`;

    try {
        const data = await apiFetch(query, { showId });
        const show = data.data.show;
        if (!show) return null;

        return {
            id: show._id,
            title: show.englishName || show.name,
            title_english: show.englishName || show.name,
            thumbnail_url: show.thumbnail,
            synopsis: show.description ? show.description.replace(/<[^>]*>?/gm, '') : '',
            status: show.status,
            episodes_sub: show.availableEpisodesDetail.sub ? show.availableEpisodesDetail.sub.length : 0,
            episodes_dub: show.availableEpisodesDetail.dub ? show.availableEpisodesDetail.dub.length : 0
        };
    } catch (e) {
        return null;
    }
}

export async function getEpisodesList(showId, mode = 'sub') {
    const query = `query ($showId: String!) {
        show( _id: $showId ) { _id availableEpisodesDetail }
    }`;

    try {
        const data = await apiFetch(query, { showId });
        const details = data.data.show.availableEpisodesDetail;
        const episodes = details[mode] || [];
        return episodes.sort((a, b) => parseFloat(a) - parseFloat(b));
    } catch (e) {
        return [];
    }
}

export async function getEpisodeUrl(showId, epNo, mode = 'sub', quality = 'best') {
    const episodeEmbedGql = `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) {
        episode( showId: $showId translationType: $translationType episodeString: $episodeString ) {
            episodeString sourceUrls
        }
    }`;

    try {
        let apiData = null;

        // v4.14.0: Try persisted query GET request first (bypasses captcha)
        try {
            const queryVars = JSON.stringify({ showId, translationType: mode, episodeString: epNo });
            const queryExt = JSON.stringify({ persistedQuery: { version: 1, sha256Hash: EPISODE_QUERY_HASH } });
            const apiUrl = `${ALLANIME_API}/api?variables=${encodeURIComponent(queryVars)}&extensions=${encodeURIComponent(queryExt)}`;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const getResp = await fetch(apiUrl, {
                headers: {
                    'User-Agent': AGENT,
                    'Referer': ALLANIME_REFR,
                    'Origin': 'https://youtu-chan.com'
                },
                signal: controller.signal
            });
            clearTimeout(timeout);

            const getData = await getResp.json();
            const rawText = JSON.stringify(getData);
            if (rawText && rawText.includes('tobeparsed')) {
                apiData = getData;
            }
        } catch (e) {
            // GET request failed, will fall back to POST
        }

        // Fallback: POST request (original method)
        if (!apiData) {
            apiData = await apiFetch(episodeEmbedGql, {
                showId, translationType: mode, episodeString: epNo
            });
        }

        if (apiData.errors && apiData.errors.length > 0) {
            const captchaErr = apiData.errors.find(e => e.message === 'NEED_CAPTCHA');
            if (captchaErr) {
                throw new Error('NEED_CAPTCHA: AllAnime API is currently requiring captcha verification.');
            }
            throw new Error(`API Error: ${apiData.errors.map(e => e.message).join(', ')}`);
        }

        let respLines = await parseSourceLines(apiData);
        if (respLines.length === 0) return null;

        // Provider order: 1=Default, 2=Yt-mp4, 3=S-mp4, 4=Luf-Mp4, 5=Fm-mp4 (filemoon, new in v4.14.0)
        const providerDefs = [
            { name: 'Default', filemoon: false },
            { name: 'Yt-mp4', filemoon: false },
            { name: 'S-mp4', filemoon: false },
            { name: 'Luf-Mp4', filemoon: false },
            { name: 'Fm-mp4', filemoon: true }
        ];

        const linkPromises = providerDefs.map(async (prov) => {
            const entry = respLines.find(r => r.sourceName === prov.name);
            if (!entry) return [];
            const decodedPath = decodeProviderId(entry.hex);
            if (!decodedPath) return [];

            if (prov.filemoon) {
                return getFilemoonLinks(decodedPath);
            } else {
                return getLinks(decodedPath);
            }
        });

        const results = await Promise.all(linkPromises);
        let allLinks = results.flat();
        if (allLinks.length === 0) return null;

        allLinks.sort((a, b) => {
            const resA = parseInt(a.resolution) || 0;
            const resB = parseInt(b.resolution) || 0;
            return resB - resA;
        });

        let selected;
        if (quality === 'best') {
            selected = allLinks[0];
        } else if (quality === 'worst') {
            const numeric = allLinks.filter(l => /^\d+/.test(l.resolution));
            selected = numeric.length > 0 ? numeric[numeric.length - 1] : allLinks[allLinks.length - 1];
        } else {
            selected = allLinks.find(l => l.resolution.includes(quality)) || allLinks[0];
        }

        let finalUrl = selected.url.replace(/([^:])\/\//g, '$1/');
        return finalUrl;
    } catch (e) {
        if (e.message && e.message.startsWith('NEED_CAPTCHA')) {
            throw e;
        }
        return null;
    }
}

export async function getEpisodeInfo(showId, epNo) {
    const epNum = parseFloat(epNo);
    const query = `query ($showId: String!, $epNum: Float!) {
        episodeInfos( showId: $showId episodeNumStart: $epNum episodeNumEnd: $epNum ) {
            episodeIdNum notes description thumbnails
        }
    }`;

    try {
        const data = await apiFetch(query, { showId, epNum });
        const infos = data.data.episodeInfos;
        if (!infos || infos.length === 0) return null;

        const info = infos[0];
        let thumbnails = info.thumbnails || [];
        thumbnails = thumbnails.map(t => t.startsWith('/') ? `https://${ALLANIME_BASE}${t}` : t);

        return {
            episode_no: info.episodeIdNum,
            title: info.notes || '',
            description: info.description || '',
            thumbnails
        };
    } catch (e) {
        return null;
    }
}
