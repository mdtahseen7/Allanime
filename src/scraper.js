const axios = require('axios');
const crypto = require('crypto');

const AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0";
const ALLANIME_REFR = "https://allmanga.to";
const ALLANIME_BASE = "allanime.day";
const ALLANIME_API = `https://api.${ALLANIME_BASE}`;
const ALLANIME_KEY = crypto.createHash('sha256').update('Xot36i3lK3:v1').digest('hex');

// Persisted query hash for episode embeds (from ani-cli v4.14.0)
const EPISODE_QUERY_HASH = "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec";

const axiosInstance = axios.create({
    headers: {
        'User-Agent': AGENT,
        'Referer': ALLANIME_REFR
    },
    timeout: 5000
});

function decrypt(blob) {
    try {
        const data = Buffer.from(blob, 'base64');
        // v4.13+: skip 1st byte (version), IV = next 12 bytes, last 16 bytes = auth tag, middle = ciphertext
        const iv = data.slice(1, 13);
        const ctLen = data.length - 13 - 16;
        const ciphertext = data.slice(13, 13 + ctLen);
        const ctr = Buffer.concat([iv, Buffer.from([0, 0, 0, 2])]);
        
        const decipher = crypto.createDecipheriv('aes-256-ctr', Buffer.from(ALLANIME_KEY, 'hex'), ctr);
        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString('utf8');
    } catch (e) {
        return null;
    }
}

// Filemoon provider decryption (v4.14.0)
// Decodes base64url to hex
function b64urlToHex(b64url) {
    // Add padding
    let padded = b64url;
    const mod = padded.length % 4;
    if (mod === 2) padded += '==';
    else if (mod === 3) padded += '=';
    // Convert base64url to standard base64
    const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(b64, 'base64').toString('hex');
}

async function getFilemoonLinks(providerPath) {
    const allLinks = [];
    const fetchUrl = providerPath.startsWith('http') ? providerPath : `https://${ALLANIME_BASE}${providerPath}`;
    
    try {
        const response = await axiosInstance.get(fetchUrl, { timeout: 4000 });
        const fmData = response.data;

        if (fmData && fmData.iv && fmData.payload && fmData.key_parts) {
            const kp1 = fmData.key_parts[0];
            const kp2 = fmData.key_parts[1];
            const keyHex = b64urlToHex(kp1) + b64urlToHex(kp2);
            const ivHex = b64urlToHex(fmData.iv) + '00000002';

            // Decode payload from base64url
            let payloadB64 = fmData.payload;
            const pMod = payloadB64.length % 4;
            if (pMod === 2) payloadB64 += '==';
            else if (pMod === 3) payloadB64 += '=';
            payloadB64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
            const payloadBuf = Buffer.from(payloadB64, 'base64');

            // Strip last 16 bytes (auth tag)
            const ctLen = payloadBuf.length - 16;
            const ciphertext = payloadBuf.slice(0, ctLen);

            const decipher = crypto.createDecipheriv('aes-256-ctr', Buffer.from(keyHex, 'hex'), Buffer.from(ivHex, 'hex'));
            let decrypted = decipher.update(ciphertext);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            const plain = decrypted.toString('utf8');

            // Parse the decrypted JSON for video URLs
            const parts = plain.replace(/[{}\[\]]/g, '\n').split('\n');
            for (const part of parts) {
                // Match "url":"..." and "height":NNN in either order
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

// Mirrors get_links() from anime.sh
async function getLinks(providerPath) {
    let allLinks = [];

    // If path contains tools.fast4speed.rsvp, output it directly (direct mp4 link)
    if (providerPath.includes('tools.fast4speed.rsvp')) {
        allLinks.push({ resolution: 'Yt', url: providerPath });
        return allLinks;
    }

    // For non-direct URLs, fetch the provider JSON
    const fetchUrl = providerPath.startsWith('http') ? providerPath : `https://${ALLANIME_BASE}${providerPath}`;

    try {
        const response = await axiosInstance.get(fetchUrl, { timeout: 4000 });
        const providerData = response.data;

        if (providerData.links && Array.isArray(providerData.links)) {
            for (const link of providerData.links) {
                const url = link.link;
                const res = link.resolutionStr || 'unknown';

                if (url && url.includes('repackager.wixmp.com')) {
                    // wixmp repackager: extract individual quality URLs (anime.sh lines 35-40)
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
        // Provider fetch failed — timed out or returned error
    }

    return allLinks;
}

async function searchAnime(query) {
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
        const response = await axiosInstance.post(`${ALLANIME_API}/api`, {
            variables: {
                search: {
                    allowAdult: false,
                    allowUnknown: false,
                    query: query
                },
                limit: 40,
                page: 1,
                countryOrigin: "ALL"
            },
            query: searchGql
        });

        const shows = response.data.data.shows.edges;
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

async function getAnimeDetails(showId) {
    const query = `query ($showId: String!) {
        show( _id: $showId ) {
            _id
            name
            englishName
            nativeName
            thumbnail
            description
            status
            availableEpisodesDetail
        }
    }`;

    try {
        const response = await axiosInstance.post(`${ALLANIME_API}/api`, {
            variables: { showId },
            query: query
        });

        const show = response.data.data.show;
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

async function getEpisodesList(showId, mode = 'sub') {
    const episodesListGql = `query ($showId: String!) {
        show( _id: $showId ) {
            _id
            availableEpisodesDetail
        }
    }`;

    try {
        const response = await axiosInstance.post(`${ALLANIME_API}/api`, {
            variables: { showId },
            query: episodesListGql
        });

        const details = response.data.data.show.availableEpisodesDetail;
        const episodes = details[mode] || [];
        return episodes.sort((a, b) => parseFloat(a) - parseFloat(b));
    } catch (e) {
        return [];
    }
}

// Parse tobeparsed/sourceUrls from API response into respLines
function parseSourceLines(apiData) {
    const rawJson = JSON.stringify(apiData);
    const hasTobeparsed = rawJson.includes('"tobeparsed"');
    let respLines = [];

    if (hasTobeparsed) {
        // Extract the tobeparsed blob from wherever it lives in the response
        const data = apiData.data;
        const blob = apiData.tobeparsed ||
                     (data && data.tobeparsed) ||
                     (data && data.episode && data.episode.tobeparsed) ||
                     null;

        let blobValue = blob;
        if (!blobValue) {
            // Fallback: regex extraction from raw JSON
            const tbpMatch = rawJson.match(/"tobeparsed":"([^"]*)"/);
            if (tbpMatch) blobValue = tbpMatch[1];
        }

        if (blobValue) {
            const plain = decrypt(blobValue);
            if (plain) {
                const parts = plain.replace(/[{}]/g, '\n').split('\n');
                for (const part of parts) {
                    const m = part.match(/"sourceUrl":"--([^"]*)".*"sourceName":"([^"]*)"/);
                    if (m) {
                        respLines.push({ sourceName: m[2], hex: m[1] });
                    }
                }
            } else {
                console.error("Decryption of tobeparsed blob failed — key may need updating");
            }
        }
    } else if (apiData.data && apiData.data.episode && apiData.data.episode.sourceUrls) {
        // Fallback: unencrypted sourceUrls
        const raw = JSON.stringify(apiData.data.episode.sourceUrls);
        const cleaned = raw.replace(/\\u002F/g, '/').replace(/\\/g, '');
        const parts = cleaned.replace(/[{}]/g, '\n').split('\n');
        for (const part of parts) {
            const m = part.match(/"sourceUrl":"--([^"]*)".*"sourceName":"([^"]*)"/);
            if (m) {
                respLines.push({ sourceName: m[2], hex: m[1] });
            }
        }
    }

    return respLines;
}

async function getEpisodeUrl(showId, epNo, mode = 'sub', quality = 'best') {
    const episodeEmbedGql = `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) {
        episode( showId: $showId translationType: $translationType episodeString: $episodeString ) {
            episodeString
            sourceUrls
        }
    }`;

    try {
        let apiData = null;

        // v4.14.0: Try persisted query GET request first (bypasses captcha)
        try {
            const queryVars = JSON.stringify({ showId, translationType: mode, episodeString: epNo });
            const queryExt = JSON.stringify({ persistedQuery: { version: 1, sha256Hash: EPISODE_QUERY_HASH } });
            const apiUrl = `${ALLANIME_API}/api?variables=${encodeURIComponent(queryVars)}&extensions=${encodeURIComponent(queryExt)}`;

            const getResp = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': AGENT,
                    'Referer': ALLANIME_REFR,
                    'Origin': 'https://youtu-chan.com'
                },
                timeout: 5000
            });

            const rawText = JSON.stringify(getResp.data);
            if (rawText && rawText.includes('tobeparsed')) {
                apiData = getResp.data;
            }
        } catch (e) {
            // GET request failed, will fall back to POST
        }

        // Fallback: POST request (original method)
        if (!apiData) {
            const postResp = await axiosInstance.post(`${ALLANIME_API}/api`, {
                variables: {
                    showId: showId,
                    translationType: mode,
                    episodeString: epNo
                },
                query: episodeEmbedGql
            });
            apiData = postResp.data;
        }

        // Check for NEED_CAPTCHA or other API-level errors
        if (apiData.errors && apiData.errors.length > 0) {
            const captchaErr = apiData.errors.find(e => e.message === 'NEED_CAPTCHA');
            if (captchaErr) {
                throw new Error('NEED_CAPTCHA: AllAnime API is currently requiring captcha verification. This is an upstream issue affecting all clients.');
            }
            throw new Error(`AllAnime API error: ${apiData.errors.map(e => e.message).join(', ')}`);
        }

        // Parse source lines from the API response
        let respLines = parseSourceLines(apiData);

        if (respLines.length === 0) return null;

        // Provider order: 1=Default, 2=Yt-mp4, 3=S-mp4, 4=Luf-Mp4, 5=Fm-mp4 (filemoon, new in v4.14.0)
        const providerDefs = [
            { name: 'Default', filemoon: false },
            { name: 'Yt-mp4', filemoon: false },
            { name: 'S-mp4', filemoon: false },
            { name: 'Luf-Mp4', filemoon: false },
            { name: 'Fm-mp4', filemoon: true }
        ];

        // Fetch all providers in parallel
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

        // Sort numerically descending (best first)
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

        // Clean up double slashes in URL path (but not in https://)
        let finalUrl = selected.url.replace(/([^:])\/\//g, '$1/');
        return finalUrl;

    } catch (e) {
        console.error("Failed to get episode URL:", e.message);
        // Re-throw NEED_CAPTCHA so callers can handle it appropriately
        if (e.message && e.message.startsWith('NEED_CAPTCHA')) {
            throw e;
        }
        return null;
    }
}

async function getEpisodeInfo(showId, epNo) {
    const epNum = parseFloat(epNo);
    const query = `query ($showId: String!, $epNum: Float!) {
        episodeInfos( showId: $showId episodeNumStart: $epNum episodeNumEnd: $epNum ) {
            episodeIdNum
            notes
            description
            thumbnails
        }
    }`;

    try {
        const response = await axiosInstance.post(`${ALLANIME_API}/api`, {
            variables: { showId, epNum },
            query: query
        });

        const infos = response.data.data.episodeInfos;
        if (!infos || infos.length === 0) return null;

        const info = infos[0];

        // Format thumbnails (some are relative paths)
        let thumbnails = info.thumbnails || [];
        thumbnails = thumbnails.map(t => t.startsWith('/') ? `https://${ALLANIME_BASE}${t}` : t);

        return {
            episode_no: info.episodeIdNum,
            title: info.notes || '',
            description: info.description || '',
            thumbnails: thumbnails
        };
    } catch (e) {
        return null;
    }
}

module.exports = {
    searchAnime,
    getAnimeDetails,
    getEpisodesList,
    getEpisodeUrl,
    getEpisodeInfo
};
