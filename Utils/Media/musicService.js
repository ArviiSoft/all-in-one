const { Readable } = require("node:stream");
const { BaseExtractor, Playlist, QueryType, Track, Util } = require("discord-player");
const play = require("play-dl");

const DEFAULT_PLATFORM = "spotify";

const MUSIC_PLATFORMS = Object.freeze({
  spotify: Object.freeze({
    key: "spotify",
    label: "Spotify",
    emoji: "🟢",
    accentColor: 0x1db954,
    queryType: QueryType.SPOTIFY_SEARCH,
    playbackLabel: "YouTube Music eşleştirmesi",
  }),
  youtube_music: Object.freeze({
    key: "youtube_music",
    label: "YouTube Music",
    emoji: "🔴",
    accentColor: 0xff0033,
    playbackLabel: "Doğrudan YouTube Music",
  }),
  soundcloud: Object.freeze({
    key: "soundcloud",
    label: "SoundCloud",
    emoji: "🟠",
    accentColor: 0xff5500,
    queryType: QueryType.SOUNDCLOUD_SEARCH,
    playbackLabel: "Doğrudan SoundCloud",
  }),
  apple_music: Object.freeze({
    key: "apple_music",
    label: "Apple Music",
    emoji: "🍎",
    accentColor: 0xfa2d48,
    queryType: QueryType.APPLE_MUSIC_SEARCH,
    playbackLabel: "YouTube Music eşleştirmesi",
  }),
  deezer: Object.freeze({
    key: "deezer",
    label: "Deezer",
    emoji: "🟣",
    accentColor: 0xa238ff,
    playbackLabel: "YouTube Music eşleştirmesi",
  }),
});

const PLATFORM_CHOICES = Object.freeze(
  Object.values(MUSIC_PLATFORMS).map(({ key, label, emoji }) => ({
    name: `${emoji} ${label}`,
    value: key,
  }))
);

const VERSION_MARKERS = Object.freeze([
  "cover",
  "karaoke",
  "slowed",
  "sped up",
  "speed up",
  "nightcore",
  "remix",
  "live",
  "instrumental",
  "teaser",
  "trailer",
  "preview",
  "shorts",
]);

class MusicSearchError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "MusicSearchError";
    this.code = code;
  }
}

function parseYoutubeURL(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").replace(/^music\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      return {
        videoId: url.pathname.split("/").filter(Boolean)[0] || null,
        playlistId: url.searchParams.get("list"),
      };
    }
    if (host !== "youtube.com") return null;
    return {
      videoId: url.searchParams.get("v") || (url.pathname.startsWith("/shorts/")
        ? url.pathname.split("/").filter(Boolean)[1]
        : null),
      playlistId: url.searchParams.get("list"),
    };
  } catch {
    return null;
  }
}

function youtubeThumbnail(thumbnails) {
  return thumbnails?.at(-1)?.url || thumbnails?.at(0)?.url || "";
}

function youtubeText(value, fallback) {
  if (typeof value === "string" && value.trim()) return value.trim();
  const text = value?.text || value?.toString?.();
  return text && text !== "[object Object]" ? String(text).trim() : fallback;
}

class YoutubeMusicExtractor extends BaseExtractor {
  static identifier = "com.safir.youtube-music";

  async activate() {
    const { Innertube, Log: YoutubeLog } = await import("youtubei.js");
    YoutubeLog.setLevel(YoutubeLog.Level.ERROR);
    this.innertube = await Innertube.create({ retrieve_player: false });
    this.protocols = ["yt", "youtube", "ytmusic"];
  }

  async deactivate() {
    this.innertube = null;
  }

  async validate(query) {
    return Boolean(parseYoutubeURL(query));
  }

  buildTrack(video, requestedBy, playlist = null) {
    const id = video.id || video.video_id || video.basic_info?.id;
    const title = youtubeText(video.title || video.basic_info?.title, "Bilinmeyen Şarkı");
    const author = youtubeText(
      video.author?.name || video.basic_info?.author || video.basic_info?.channel?.name,
      "Bilinmeyen Sanatçı"
    );
    const durationSeconds = Number(video.duration?.seconds ?? video.basic_info?.duration) || 0;
    const thumbnails = video.thumbnails || video.basic_info?.thumbnail;

    const track = new Track(this.context.player, {
      title,
      cleanTitle: title,
      author,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: youtubeThumbnail(thumbnails),
      duration: formatDuration(durationSeconds),
      views: Number(video.views ?? video.basic_info?.view_count) || 0,
      requestedBy,
      source: "youtube",
      queryType: QueryType.YOUTUBE_VIDEO,
      live: Boolean(video.is_live ?? video.basic_info?.is_live),
      playlist,
      raw: {
        source: "youtube",
        duration_ms: durationSeconds * 1_000,
        musicPlatform: "youtube_music",
      },
    });
    track.extractor = this;
    return track;
  }

  async buildVideo(videoId, requestedBy) {
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId || "")) {
      throw new MusicSearchError("INVALID_YOUTUBE_URL", "Geçerli bir YouTube video kimliği bulunamadı.");
    }
    const info = await this.innertube.getBasicInfo(videoId, { client: "ANDROID_VR" });
    return this.buildTrack(info, requestedBy);
  }

  async buildPlaylist(playlistId, requestedBy) {
    let page = await this.innertube.getPlaylist(playlistId);
    const playlist = new Playlist(this.context.player, {
      title: youtubeText(page.info?.title, "YouTube Oynatma Listesi"),
      description: youtubeText(page.info?.description, ""),
      thumbnail: youtubeThumbnail(page.info?.thumbnails),
      author: {
        name: youtubeText(page.info?.author?.name, "Bilinmeyen Kanal"),
        url: page.info?.author?.url || "",
      },
      tracks: [],
      id: playlistId,
      url: `https://www.youtube.com/playlist?list=${playlistId}`,
      type: "playlist",
      source: "youtube",
    });

    const tracks = [];
    for (let pageCount = 0; page && pageCount < 10; pageCount += 1) {
      for (const video of page.videos || page.items || []) {
        if (!video?.id || !video?.is_playable) continue;
        tracks.push(this.buildTrack(video, requestedBy, playlist));
      }
      page = page.has_continuation ? await page.getContinuation() : null;
    }
    playlist.tracks = tracks;
    return playlist;
  }

  async handle(query, context) {
    const parsed = parseYoutubeURL(query);
    if (!parsed) return this.createResponse();
    if (parsed.playlistId) {
      const playlist = await this.buildPlaylist(parsed.playlistId, context.requestedBy);
      return this.createResponse(playlist, playlist.tracks);
    }
    if (!parsed.videoId) return this.createResponse();
    return this.createResponse(null, [await this.buildVideo(parsed.videoId, context.requestedBy)]);
  }

  async stream(track) {
    return createYoutubeAudioStream(track, this);
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .replaceAll("\\", "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueTokens(value) {
  return [...new Set(normalizeText(value).split(" ").filter(token => token.length > 1))];
}

function tokenCoverage(expected, actual) {
  const expectedTokens = uniqueTokens(expected);
  if (!expectedTokens.length) return 0;

  const actualTokens = new Set(uniqueTokens(actual));
  const matches = expectedTokens.filter(token => actualTokens.has(token)).length;
  return matches / expectedTokens.length;
}

function parseArtistAndTitle(query) {
  const parts = String(query ?? "")
    .split(/\s+(?:-|\u2013|\u2014|\|)\s+/)
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return null;
  return { left: parts[0], right: parts.slice(1).join(" ") };
}

function markerPenalty(query, candidate) {
  const normalizedQuery = normalizeText(query);
  const normalizedCandidate = normalizeText(candidate);

  return VERSION_MARKERS.reduce((penalty, marker) => {
    const normalizedMarker = normalizeText(marker);
    if (normalizedCandidate.includes(normalizedMarker) && !normalizedQuery.includes(normalizedMarker)) {
      return penalty + (normalizedMarker === "live" || normalizedMarker === "cover" ? 32 : 20);
    }
    return penalty;
  }, 0);
}

function scoreTrack(query, track, targetDurationMS = 0) {
  const title = track?.cleanTitle || track?.title || "";
  const author = track?.author || "";
  const combined = `${author} ${title}`;
  const normalizedQuery = normalizeText(query);
  const normalizedTitle = normalizeText(title);
  const normalizedAuthor = normalizeText(author);
  const normalizedCombined = normalizeText(combined);

  let score = tokenCoverage(normalizedQuery, normalizedCombined) * 100;

  if (normalizedCombined === normalizedQuery) score += 90;
  else if (normalizedCombined.includes(normalizedQuery)) score += 45;

  const pair = parseArtistAndTitle(query);
  if (pair) {
    const forward = tokenCoverage(pair.left, normalizedAuthor) + tokenCoverage(pair.right, normalizedTitle);
    const reverse = tokenCoverage(pair.right, normalizedAuthor) + tokenCoverage(pair.left, normalizedTitle);
    score += Math.max(forward, reverse) * 70;

    if (normalizeText(pair.right) === normalizedTitle || normalizeText(pair.left) === normalizedTitle) score += 35;
    if (normalizeText(pair.left) === normalizedAuthor || normalizeText(pair.right) === normalizedAuthor) score += 35;
  } else if (normalizedTitle === normalizedQuery) {
    score += 65;
  }

  score -= markerPenalty(query, `${title} ${author}`);

  const durationMS = Number(track?.durationMS) || 0;
  if (durationMS > 0 && durationMS < 30_000) score -= 180;
  else if (durationMS > 0 && durationMS < 60_000) score -= 70;
  else if (durationMS > 0 && durationMS < 90_000) score -= 20;

  if (targetDurationMS > 0 && durationMS > 0) {
    const difference = Math.abs(targetDurationMS - durationMS);
    if (difference <= 3_000) score += 65;
    else if (difference <= 10_000) score += 45;
    else if (difference <= 30_000) score += 18;
    else if (difference >= 90_000) score -= 75;
  }

  const views = Number(track?.views) || 0;
  if (views > 0) score += Math.min(12, Math.log10(views + 1) * 2);

  return score;
}

function selectBestTrack(query, tracks, targetDurationMS = 0) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  return tracks
    .map((track, index) => ({
      track,
      index,
      score: scoreTrack(query, track, targetDurationMS),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0].track;
}

function getPlatform(platformKey = DEFAULT_PLATFORM) {
  return MUSIC_PLATFORMS[platformKey] || MUSIC_PLATFORMS[DEFAULT_PLATFORM];
}

function inferPlatformKey(track) {
  const taggedPlatform = track?.raw?.musicPlatform;
  if (MUSIC_PLATFORMS[taggedPlatform]) return taggedPlatform;

  const source = String(track?.source || track?.raw?.source || "").toLowerCase();
  const queryType = String(track?.queryType || "").toLowerCase();

  if (source === "spotify" || queryType.includes("spotify")) return "spotify";
  if (source === "apple_music" || queryType.includes("applemusic")) return "apple_music";
  if (source === "soundcloud" || queryType.includes("soundcloud")) return "soundcloud";
  if (source === "youtube" || queryType.includes("youtube")) return "youtube_music";
  if (source === "deezer" || queryType.includes("deezer")) return "deezer";

  return null;
}

function tagTrack(track, platformKey) {
  if (!track) return track;
  track.raw ||= {};
  track.raw.musicPlatform = platformKey;
  return track;
}

function tagSearchResult(result) {
  for (const track of result?.tracks || []) {
    const platformKey = inferPlatformKey(track);
    if (platformKey) tagTrack(track, platformKey);
  }
  return result;
}

function getYoutubeExtractor(player) {
  const extractor = player.extractors.get(YoutubeMusicExtractor.identifier);
  if (!extractor?.innertube) {
    throw new MusicSearchError(
      "YOUTUBE_UNAVAILABLE",
      "YouTube Music oynatma kaynağı şu anda hazır değil."
    );
  }
  return extractor;
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  return Util.buildTimeCode(Util.parseMS(safeSeconds * 1_000));
}

function parseViewCount(value) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return Number.parseInt(digits, 10) || 0;
}

async function searchYoutubeMusic(player, query, requestedBy, limit = 15) {
  const extractor = getYoutubeExtractor(player);
  const search = await extractor.innertube.music.search(query, { type: "song" });
  const songs = Array.from(search?.songs?.contents || []).slice(0, limit);

  return songs.flatMap(song => {
    if (!song?.id || !song?.title) return [];

    const artists = song.artists?.map(artist => artist.name).filter(Boolean) || [];
    const author = artists.join(", ") || song.author?.name || "Bilinmeyen Sanatçı";
    const durationSeconds = Number(song.duration?.seconds) || 0;
    const thumbnail = song.thumbnails?.at(-1)?.url || song.thumbnail?.contents?.at(-1)?.url || "";

    const track = new Track(player, {
      title: song.title,
      author,
      url: `https://youtube.com/watch?v=${song.id}&dpymeta=ytmusic`,
      thumbnail,
      duration: formatDuration(durationSeconds),
      views: parseViewCount(song.views),
      requestedBy,
      source: "youtube",
      queryType: QueryType.YOUTUBE_VIDEO,
      cleanTitle: song.title,
      raw: {
        source: "youtube",
        duration_ms: durationSeconds * 1_000,
        musicPlatform: "youtube_music",
        youtubeMusic: true,
      },
    });

    track.extractor = extractor;
    return [track];
  });
}

function deezerTrackToPlayerTrack(player, deezerTrack, requestedBy) {
  const durationSeconds = Number(deezerTrack.durationInSec) || 0;
  const author = deezerTrack.artist?.name || "Bilinmeyen Sanatçı";
  const thumbnail = deezerTrack.album?.cover?.xl
    || deezerTrack.album?.cover?.big
    || deezerTrack.artist?.picture?.xl
    || "";

  return new Track(player, {
    title: deezerTrack.title,
    author,
    url: deezerTrack.url,
    thumbnail,
    duration: formatDuration(durationSeconds),
    views: Number(deezerTrack.rank) || 0,
    requestedBy,
    source: "arbitrary",
    queryType: QueryType.ARBITRARY,
    cleanTitle: deezerTrack.title,
    raw: {
      source: "arbitrary",
      duration_ms: durationSeconds * 1_000,
      musicPlatform: "deezer",
      deezerId: deezerTrack.id,
    },
  });
}

function appleTrackToPlayerTrack(player, appleTrack, requestedBy) {
  const durationMS = Number(appleTrack.trackTimeMillis) || 0;
  const artwork = String(appleTrack.artworkUrl100 || "")
    .replace("100x100bb", "600x600bb");

  return new Track(player, {
    title: appleTrack.trackName,
    author: appleTrack.artistName || "Bilinmeyen Sanatçı",
    url: appleTrack.trackViewUrl || appleTrack.collectionViewUrl,
    thumbnail: artwork,
    duration: Util.buildTimeCode(Util.parseMS(durationMS)),
    views: 0,
    requestedBy,
    source: "apple_music",
    queryType: QueryType.APPLE_MUSIC_SONG,
    cleanTitle: appleTrack.trackName,
    raw: {
      source: "apple_music",
      duration_ms: durationMS,
      musicPlatform: "apple_music",
      appleTrackId: appleTrack.trackId,
    },
  });
}

async function searchAppleMusic(player, query, requestedBy) {
  const endpoint = new URL("https://itunes.apple.com/search");
  endpoint.searchParams.set("term", query);
  endpoint.searchParams.set("media", "music");
  endpoint.searchParams.set("entity", "song");
  endpoint.searchParams.set("country", "TR");
  endpoint.searchParams.set("limit", "25");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; SafirMusicBot/1.0)",
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Apple katalog isteği ${response.status} durum koduyla sonuçlandı.`);
  }

  const data = await response.json();
  return (data.results || [])
    .filter(track => track.wrapperType === "track" && track.kind === "song" && track.trackName)
    .map(track => appleTrackToPlayerTrack(player, track, requestedBy));
}

async function searchDeezer(player, query, requestedBy) {
  const results = await play.search(query, {
    limit: 20,
    fuzzy: true,
    source: { deezer: "track" },
  });

  return results.map(track => deezerTrackToPlayerTrack(player, track, requestedBy));
}

async function searchPlatformTrack(player, query, platformKey = DEFAULT_PLATFORM, requestedBy) {
  const cleanQuery = String(query ?? "").trim();
  const platform = getPlatform(platformKey);

  if (!cleanQuery) {
    throw new MusicSearchError("EMPTY_QUERY", "Aranacak şarkı adı boş olamaz.");
  }

  try {
    let tracks;

    if (platform.key === "youtube_music") {
      tracks = await searchYoutubeMusic(player, cleanQuery, requestedBy);
    } else if (platform.key === "apple_music") {
      tracks = await searchAppleMusic(player, cleanQuery, requestedBy);
    } else if (platform.key === "deezer") {
      tracks = await searchDeezer(player, cleanQuery, requestedBy);
    } else {
      const result = await player.search(cleanQuery, {
        requestedBy,
        searchEngine: platform.queryType,
        ignoreCache: true,
      });
      tracks = result.tracks.slice(0, 20);
    }

    const selectedTrack = selectBestTrack(cleanQuery, tracks);
    if (!selectedTrack) {
      throw new MusicSearchError(
        "NO_RESULTS",
        `${platform.label} üzerinde bu aramayla eşleşen bir şarkı bulunamadı.`
      );
    }

    if (selectedTrack.durationMS > 0 && selectedTrack.durationMS < 60_000) {
      throw new MusicSearchError(
        "NO_FULL_RESULT",
        `${platform.label} bu arama için yalnızca kısa bir önizleme döndürdü. Tam parça yerine bu kayıt oynatılmadı.`
      );
    }

    return tagTrack(selectedTrack, platform.key);
  } catch (error) {
    if (error instanceof MusicSearchError) throw error;
    throw new MusicSearchError(
      "SEARCH_FAILED",
      `${platform.label} araması şu anda tamamlanamadı.`,
      error
    );
  }
}

async function searchLink(player, url, requestedBy) {
  let parsedURL;
  try {
    parsedURL = new URL(String(url ?? "").trim());
  } catch (error) {
    throw new MusicSearchError("INVALID_URL", "Geçerli bir şarkı veya oynatma listesi bağlantısı gir.", error);
  }

  if (!["http:", "https:"].includes(parsedURL.protocol)) {
    throw new MusicSearchError("INVALID_URL", "Yalnızca HTTP veya HTTPS bağlantıları destekleniyor.");
  }

  try {
    const result = await player.search(parsedURL.toString(), {
      requestedBy,
      ignoreCache: true,
    });

    if (!result.hasTracks()) {
      throw new MusicSearchError("NO_RESULTS", "Bu bağlantıda oynatılabilir bir şarkı bulunamadı.");
    }

    return tagSearchResult(result);
  } catch (error) {
    if (error instanceof MusicSearchError) throw error;
    throw new MusicSearchError(
      "LINK_FAILED",
      "Bağlantı çözümlenemedi veya bu kaynak desteklenmiyor.",
      error
    );
  }
}

async function resolveBridgedStream(player, track) {
  const platformKey = inferPlatformKey(track);
  if (!["spotify", "apple_music", "deezer"].includes(platformKey)) return null;

  const extractor = getYoutubeExtractor(player);
  track.raw ||= {};

  let playbackTrack = track.raw.musicPlaybackTrack;
  if (!playbackTrack) {
    const cleanTitle = track.cleanTitle || track.title;
    const bridgeQuery = `${track.author} - ${cleanTitle}`;
    const candidates = await searchYoutubeMusic(player, bridgeQuery, track.requestedBy, 20);
    playbackTrack = selectBestTrack(bridgeQuery, candidates, track.durationMS);

    if (!playbackTrack) {
      throw new MusicSearchError(
        "PLAYBACK_MATCH_FAILED",
        "Seçilen katalog sonucunun tam ses eşleşmesi bulunamadı."
      );
    }

    track.raw.musicPlaybackTrack = playbackTrack;
  }

  track.bridgedTrack = playbackTrack;
  track.bridgedExtractor = extractor;
  return extractor.stream(playbackTrack);
}

function getYoutubeVideoId(url) {
  const parsed = new URL(url);
  const id = parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).at(-1);
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    throw new MusicSearchError("INVALID_YOUTUBE_URL", "YouTube Music parça kimliği çözümlenemedi.");
  }
  return id;
}

async function createRangedYoutubeStream(innertube, url, contentLength, cpn) {
  const { Constants, Utils: YoutubeUtils } = await import("youtubei.js");
  const rangeSize = 1_024 * 1_024;
  let abortController = null;

  const stream = Readable.from((async function* readRanges() {
    for (let start = 0; start < contentLength; start += rangeSize) {
      const end = Math.min(contentLength - 1, start + rangeSize - 1);
      abortController = new AbortController();
      const separator = url.includes("?") ? "&" : "?";
      const rangedURL = `${url}${separator}cpn=${encodeURIComponent(cpn || "")}&range=${start}-${end}`;
      const response = await innertube.session.http.fetch_function(rangedURL, {
        headers: Constants.STREAM_HEADERS,
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`YouTube ses aralığı alınamadı: HTTP ${response.status}`);
      }

      for await (const chunk of YoutubeUtils.streamToIterable(response.body)) {
        yield Buffer.from(chunk);
      }
    }
  })(), { highWaterMark: 512 * 1_024 });

  stream.once("close", () => abortController?.abort());
  return stream;
}

async function createYoutubeAudioStream(track, extractor) {
  const innertube = extractor?.innertube;
  if (!innertube) {
    throw new MusicSearchError("YOUTUBE_UNAVAILABLE", "YouTube Music oynatma kaynağı hazır değil.");
  }

  const videoId = getYoutubeVideoId(track.url);
  const info = await innertube.getBasicInfo(videoId, { client: "ANDROID_VR" });
  const format = info.chooseFormat({ format: "any", quality: "best", type: "audio" });
  const contentLength = Number(format?.content_length) || 0;

  if (!format?.url || contentLength <= 0) {
    throw new MusicSearchError(
      "YOUTUBE_STREAM_UNAVAILABLE",
      "Eşleşen YouTube Music parçası için doğrudan ses akışı alınamadı."
    );
  }

  return createRangedYoutubeStream(innertube, format.url, contentLength, info.cpn);
}

function createMusicNodeOptions(channel, requestedBy, player) {
  return {
    metadata: { channel, requestedBy },
    leaveOnEmpty: true,
    leaveOnEmptyCooldown: 30_000,
    leaveOnEnd: true,
    leaveOnEndCooldown: 15_000,
    leaveOnStop: true,
    leaveOnStopCooldown: 5_000,
    preferBridgedMetadata: false,
    onBeforeCreateStream: track => resolveBridgedStream(player, track),
  };
}

module.exports = {
  DEFAULT_PLATFORM,
  MUSIC_PLATFORMS,
  PLATFORM_CHOICES,
  MusicSearchError,
  YoutubeMusicExtractor,
  createYoutubeAudioStream,
  createMusicNodeOptions,
  getPlatform,
  inferPlatformKey,
  searchLink,
  searchPlatformTrack,
  tagSearchResult,
  __testing: {
    normalizeText,
    parseArtistAndTitle,
    scoreTrack,
    selectBestTrack,
    tokenCoverage,
  },
};