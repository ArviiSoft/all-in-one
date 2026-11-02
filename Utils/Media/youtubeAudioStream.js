const { Readable } = require("node:stream");
const { setTimeout: delay } = require("node:timers/promises");

const AUDIO_CLIENTS = Object.freeze(["VISIONOS", "IOS"]);
const REQUEST_TIMEOUT_MS = 12_000;
const RANGE_SIZE = 256 * 1024;

class AudioSourceError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "AudioSourceError";
    this.code = code;
  }
}

function formatAudioError(error) {
  const parts = [];
  const seen = new Set();
  for (let current = error; current && !seen.has(current) && parts.length < 4; current = current.cause) {
    seen.add(current);
    const detail = [current.message || (typeof current === "string" ? current : ""),
      current.info?.status, current.info?.reason].filter(Boolean).join("; ");
    parts.push(`${current.code || current.name || "Error"}: ${detail}`);
  }
  return parts.join(" <- ").replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]")
    .replace(/\r?\n\s+at\s[^\r\n]*/g, "").replace(/[\r\n\t]+/g, " ").slice(0, 1800);
}

function boundedFetch(url, init = {}) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  });
}

async function createRangedStream({ url, contentLength, cpn, fetcher = boundedFetch, headers = {}, signal,
  timeoutMs = REQUEST_TIMEOUT_MS, rangeSize = RANGE_SIZE, retries = 2, retryDelayMs = 300, verifyEnd = true }) {
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) throw new AudioSourceError("INVALID_LENGTH", "Ses dosyasının boyutu geçersiz.");
  const controller = new AbortController();
  const lifetime = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let stream;
  const abort = () => stream?.destroy(lifetime.reason);

  async function readRange(start, end) {
    for (let attempt = 0; ; attempt++) {
      lifetime.throwIfAborted();
      const requestURL = new URL(url);
      requestURL.searchParams.set("cpn", cpn || "");
      requestURL.searchParams.delete("range");
      let response;
      try {
        response = await fetcher(requestURL.toString(), {
          headers: { ...headers, Range: `bytes=${start}-${end}` },
          signal: AbortSignal.any([lifetime, AbortSignal.timeout(timeoutMs)]),
        });
        if (!response.ok || !response.body) {
          const error = new AudioSourceError(`HTTP_${response.status}`, `Ses kaynağı HTTP ${response.status} döndürdü (bayt ${start}-${end}).`);
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }
        const expected = end - start + 1;
        const contentRange = response.headers.get("content-range");
        if (contentRange && contentRange !== `bytes ${start}-${end}/${contentLength}`) {
          throw new AudioSourceError("INVALID_RANGE", "Ses kaynağı farklı bir dosya aralığı döndürdü.");
        }
        const chunks = [];
        let bytes = 0;
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > expected) throw new AudioSourceError("INVALID_RANGE", "Ses kaynağı istenen aralığı döndürmedi.");
          chunks.push(Buffer.from(chunk));
        }
        if (bytes !== expected) throw new AudioSourceError("TRUNCATED_AUDIO", "Ses verisi tamamlanmadan bağlantı kesildi.");
        return Buffer.concat(chunks, bytes);
      } catch (error) {
        await response?.body?.cancel().catch(() => {});
        if (lifetime.aborted) throw lifetime.reason;
        if (attempt >= retries || error.retryable === false || /^HTTP_4/.test(error.code || "") && error.code !== "HTTP_429") throw error;
        await delay(retryDelayMs * (attempt + 1), undefined, { signal: lifetime });
      }
    }
  }

  const firstEnd = Math.min(contentLength, rangeSize) - 1;
  const firstChunk = await readRange(0, firstEnd);
  if (verifyEnd && contentLength > rangeSize) await readRange(Math.max(firstEnd + 1, contentLength - 1024), contentLength - 1);
  lifetime.throwIfAborted();
  stream = Readable.from((async function* () {
    yield firstChunk;
    for (let start = firstEnd + 1; start < contentLength; start += rangeSize) {
      yield await readRange(start, Math.min(contentLength - 1, start + rangeSize - 1));
    }
  })(), { objectMode: false, highWaterMark: rangeSize });
  lifetime.addEventListener("abort", abort, { once: true });
  stream.once("close", () => {
    lifetime.removeEventListener("abort", abort);
    controller.abort();
  });
  return stream;
}

function mediaURL(value, base) {
  const url = new URL(value, base);
  if (url.protocol !== "https:" || !/(^|\.)googlevideo\.com$/.test(url.hostname)) {
    throw new AudioSourceError("INVALID_MEDIA_URL", "Ses listesinde geçersiz bir bağlantı var.");
  }
  return url.toString();
}

async function createHlsStream({ url, fetcher = boundedFetch, headers = {}, signal,
  timeoutMs = REQUEST_TIMEOUT_MS, retries = 2, retryDelayMs = 300 }) {
  const controller = new AbortController();
  const lifetime = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  async function read(url, maxBytes) {
    for (let attempt = 0; ; attempt++) {
      lifetime.throwIfAborted();
      let response;
      try {
        response = await fetcher(url, { headers, signal: AbortSignal.any([lifetime, AbortSignal.timeout(timeoutMs)]) });
        if (!response.ok || !response.body) throw new AudioSourceError(`HTTP_${response.status}`, `HLS ses kaynağı HTTP ${response.status} döndürdü.`);
        const chunks = [];
        let bytes = 0;
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > maxBytes) throw new AudioSourceError("HLS_SIZE_LIMIT", "Ses bölümü beklenenden büyük.");
          chunks.push(Buffer.from(chunk));
        }
        if (!bytes) throw new AudioSourceError("EMPTY_AUDIO", "Ses bölümü boş döndü.");
        return Buffer.concat(chunks, bytes);
      } catch (error) {
        await response?.body?.cancel().catch(() => {});
        if (lifetime.aborted) throw lifetime.reason;
        if (attempt >= retries || error.code === "HLS_SIZE_LIMIT" || /^HTTP_4/.test(error.code || "") && error.code !== "HTTP_429") throw error;
        await delay(retryDelayMs * (attempt + 1), undefined, { signal: lifetime });
      }
    }
  }
  const masterURL = mediaURL(url);
  const master = (await read(masterURL, 1024 * 1024)).toString("utf8");
  const audio = master.split(/\r?\n/).filter(line => line.startsWith("#EXT-X-MEDIA:") && line.includes("TYPE=AUDIO"))
    .map(line => line.match(/URI="([^"]+)"/)?.[1]).filter(Boolean).at(-1);
  if (!audio) throw new AudioSourceError("NO_HLS_AUDIO", "HLS listesinde ses kanalı bulunamadı.");
  const playlistURL = mediaURL(audio, masterURL);
  const playlist = (await read(playlistURL, 1024 * 1024)).toString("utf8");
  if (!playlist.startsWith("#EXTM3U") || !playlist.includes("#EXT-X-ENDLIST")
    || /#EXT-X-(?:BYTERANGE|MAP):/.test(playlist)
    || playlist.split(/\r?\n/).some(line => line.startsWith("#EXT-X-KEY:") && !line.includes("METHOD=NONE"))) {
    throw new AudioSourceError("UNSUPPORTED_HLS", "Bu HLS ses listesi desteklenmiyor.");
  }
  const segments = playlist.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#"))
    .map(value => mediaURL(value, playlistURL));
  if (!segments.length || segments.length > 5000) throw new AudioSourceError("INVALID_HLS", "Ses listesinde geçerli bölümler bulunamadı.");
  const first = await read(segments[0], 2 * 1024 * 1024);
  if (segments.length > 1) await read(segments.at(-1), 2 * 1024 * 1024);
  lifetime.throwIfAborted();
  const stream = Readable.from((async function* () {
    yield first;
    for (const segment of segments.slice(1)) yield await read(segment, 2 * 1024 * 1024);
  })(), { objectMode: false, highWaterMark: RANGE_SIZE });
  const abort = () => stream.destroy(lifetime.reason);
  lifetime.addEventListener("abort", abort, { once: true });
  stream.once("close", () => { lifetime.removeEventListener("abort", abort); controller.abort(); });
  return stream;
}

async function openYoutubeAudio(innertube, videoId, { signal, clients = AUDIO_CLIENTS, ...streamOptions } = {}) {
  const { Constants, FormatUtils } = await import("youtubei.js");
  const failures = [];
  for (const client of clients) {
    signal?.throwIfAborted();
    let stage = "player", directError;
    try {
      const info = await innertube.getBasicInfo(videoId, { client });
      signal?.throwIfAborted();
      if (!info.streaming_data && info.playability_status?.status && info.playability_status.status !== "OK") {
        throw new AudioSourceError(`YOUTUBE_${info.playability_status.status}`,
          info.playability_status.reason || "YouTube bu parçanın oynatılmasına izin vermedi.");
      }
      const options = {
        ...streamOptions,
        fetcher: innertube.session.http.fetch_function, signal,
        headers: { ...Constants.STREAM_HEADERS, "user-agent": Constants.CLIENTS[client].USER_AGENT },
      };
      try {
        stage = "direct";
        const formats = (info.streaming_data?.adaptive_formats || []).filter(format =>
          format.has_audio && !format.has_video && format.url && Number(format.content_length) > 0);
        if (!formats.length) throw new AudioSourceError("NO_AUDIO_URL", "Kullanılabilir bir ses bağlantısı bulunamadı.");
        const format = FormatUtils.chooseFormat({ format: "any", quality: "best", type: "audio" }, { adaptive_formats: formats });
        const stream = await createRangedStream({ ...options, url: format.url, contentLength: Number(format.content_length), cpn: info.cpn });
        return { stream, client, itag: format.itag, transport: "direct" };
      } catch (error) {
        if (signal?.aborted || !info.streaming_data?.hls_manifest_url) throw error;
        directError = error;
        stage = "hls";
        const stream = await createHlsStream({ ...options, url: info.streaming_data.hls_manifest_url });
        return { stream, client, itag: null, transport: "hls" };
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      failures.push({ client, stage, error, directError });
    }
  }
  const summary = failures.map(({ client, error }) => `${client}: ${error.code || error.name}`).join(", ");
  const details = failures.map(({ client, stage, error, directError }) =>
    `${client}/${stage}: ${formatAudioError(error)}${directError ? `; direct: ${formatAudioError(directError)}` : ""}`).join(" | ");
  throw new AudioSourceError("YOUTUBE_STREAM_UNAVAILABLE",
    `YouTube ses kaynağına ulaşılamadı (${summary}). ${details}`);
}

module.exports = { AUDIO_CLIENTS, REQUEST_TIMEOUT_MS, AudioSourceError, formatAudioError, boundedFetch, createRangedStream, createHlsStream, openYoutubeAudio };
