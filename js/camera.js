const sessions = new WeakMap();

export function stopCamera(video) {
  const session = sessions.get(video);
  if (!session) return;
  sessions.delete(video);
  clearTimeout(session.timer);
  window.removeEventListener('pagehide', session.close);
  session.stream?.getTracks().forEach(track => track.stop());
  if (session.stream && video.srcObject === session.stream) {
    video.pause();
    video.srcObject = null;
  }
}

async function createDecoder() {
  let reader;
  try {
    if ('BarcodeDetector' in globalThis) {
      const formats = await globalThis.BarcodeDetector.getSupportedFormats?.();
      if (!formats || formats.includes('qr_code')) {
        reader = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
      }
    }
  } catch {
    // Some browsers expose BarcodeDetector without the installed QR backend.
  }

  const fallback = globalThis.jsQR;
  if (typeof fallback !== 'function' && !reader) {
    throw new Error('QR decoding is unavailable. Use a USB scanner or enter the code manually.');
  }
  const canvas = typeof fallback === 'function' ? document.createElement('canvas') : null;
  const context = canvas?.getContext('2d', { willReadFrequently: true });
  if (!reader && !context) throw new Error('The browser cannot prepare camera scanning.');

  return async video => {
    if (reader) {
      try {
        const hits = await reader.detect(video);
        return hits.find(hit => hit.rawValue)?.rawValue || '';
      } catch {
        if (!context) throw new Error('The camera QR reader could not read a frame.');
        reader = null;
      }
    }
    const scale = Math.min(1, 660 / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.drawImage(video, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    return fallback(pixels.data, width, height, { inversionAttempts: 'attemptBoth' })?.data || '';
  };
}

export async function startCamera(video, onCode, { onError, intervalMs = 125 } = {}) {
  stopCamera(video);
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera scanning requires HTTPS or a local connection. USB and manual entry are available.');
  }
  if (typeof onCode !== 'function') throw new TypeError('A QR result handler is required.');

  const session = { stream: null, timer: null, close: () => stopCamera(video) };
  sessions.set(video, session);
  window.addEventListener('pagehide', session.close, { once: true });
  const active = () => sessions.get(video) === session;

  try {
    const decode = await createDecoder();
    if (!active()) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
    });
    if (!active()) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    session.stream = stream;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();

    const seenAt = new Map();
    const sentAt = new Map();
    async function tick() {
      if (!active()) return;
      try {
        if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
          const code = (await decode(video)).trim();
          if (code && active()) {
            const now = performance.now();
            for (const [key, lastSeen] of seenAt) {
              if (now - lastSeen > 10000) {
                seenAt.delete(key);
                sentAt.delete(key);
              }
            }
            const absentFor = now - (seenAt.get(code) ?? -Infinity);
            seenAt.set(code, now);
            if (absentFor >= 700 && now - (sentAt.get(code) ?? -Infinity) >= 1100) {
              sentAt.set(code, now);
              try {
                await onCode(code);
              } finally {
                // An API call may take longer than the re-entry window while the QR is held still.
                seenAt.set(code, performance.now());
              }
            }
          }
        }
      } catch (error) {
        onError?.(error);
      } finally {
        if (active()) session.timer = setTimeout(tick, intervalMs);
      }
    }
    if (active()) session.timer = setTimeout(tick, intervalMs);
  } catch (error) {
    if (!active()) return;
    stopCamera(video);
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      throw new Error('Camera access was denied. Allow permission, use a USB scanner, or enter the code manually.');
    }
    if (error.name === 'NotFoundError') throw new Error('No camera was found on this device.');
    if (error.name === 'NotReadableError') throw new Error('The camera is in use or unavailable.');
    throw error;
  }
}
