export function scrollElementToCenter(scroller, element, behavior = "auto") {
  if (!scroller || !element) return false;
  const scrollerRect = scroller.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const top =
    scroller.scrollTop +
    elementRect.top -
    scrollerRect.top -
    (scroller.clientHeight - elementRect.height) / 2;

  if (behavior === "smooth") {
    scroller.scrollTo({ top: Math.max(0, top), behavior });
  } else {
    scroller.scrollTop = Math.max(0, top);
  }
  return true;
}
