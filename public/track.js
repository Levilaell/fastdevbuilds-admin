/* FastDevBuilds preview tracker.
 * Embedded in every Vercel preview we ship via:
 *   <script src="https://fastdevbuilds-admin.vercel.app/track.js" async></script>
 *
 * Only fires when the page URL carries ?v={place_id} — Levi opening the raw
 * preview without that param doesn't trigger a beacon, so QA clicks aren't
 * logged. Body uses text/plain to bypass CORS preflight on sendBeacon. */
(function () {
  try {
    var qs = new URLSearchParams(window.location.search);
    var pid = qs.get("v");
    if (!pid) return;

    var endpoint = "https://fastdevbuilds-admin.vercel.app/api/preview-view";
    var payload = JSON.stringify({
      place_id: pid,
      referrer: document.referrer || null,
    });

    if (navigator.sendBeacon) {
      var blob = new Blob([payload], { type: "text/plain" });
      navigator.sendBeacon(endpoint, blob);
    } else {
      fetch(endpoint, {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "text/plain" },
        keepalive: true,
        mode: "no-cors",
      }).catch(function () {});
    }
  } catch (_) {
    /* never let the tracker break the preview page */
  }
})();
