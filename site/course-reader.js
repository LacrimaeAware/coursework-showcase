document.addEventListener("keydown", event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.target.closest("a,button,input,select,textarea,summary,[contenteditable]")) return;
  const selector = event.key === "ArrowRight" ? "[data-reader-next]" : event.key === "ArrowLeft" ? "[data-reader-prev]" : null;
  const destination = selector && document.querySelector(selector);
  if (destination) { event.preventDefault(); location.href = destination.href; }
});
