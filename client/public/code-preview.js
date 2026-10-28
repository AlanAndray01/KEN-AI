/* global window, document */
// Loaded only inside an opaque sandbox. No storage access or parent callbacks.
window.addEventListener("message", event => {
  if (event.source !== window.parent || event.data?.type !== "ken-code-preview" || typeof event.data.html !== "string") return;
  document.getElementById("preview").srcdoc = event.data.html;
});
