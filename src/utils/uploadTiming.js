// Build-time opt-in. Diagnostics stay in the console, never in the customer UI.
export function startUploadTiming(surface, { fileCount = 0, fileBytes = 0 } = {}) {
  const enabled = process.env.REACT_APP_UPLOAD_TIMING_ENABLED === 'true';
  const start = performance.now();
  const events = [];
  let finished = false;
  let serverTimingId = null;
  return {
    mark(stage) {
      if (enabled && !finished) events.push({ stage, atMs: Math.round((performance.now() - start) * 100) / 100 });
    },
    response(response) {
      if (!enabled) return;
      serverTimingId = response.headers.get('X-Upload-Timing-Id');
      this.mark('response_headers_received');
    },
    finish(outcome) {
      if (!enabled || finished) return;
      finished = true;
      console.info('[upload-timing]', {
        surface, serverTimingId, fileCount, fileBytes, outcome,
        totalMs: Math.round((performance.now() - start) * 100) / 100, events,
      });
    },
  };
}
