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

export function setScrollCenteringSpace(scroller, startSpacer, endSpacer, enabled) {
  if (!startSpacer || !endSpacer) return;
  const height = enabled && scroller ? `${Math.ceil(scroller.clientHeight / 2)}px` : "0px";
  startSpacer.style.height = height;
  endSpacer.style.height = height;
  startSpacer.style.flexShrink = "0";
  endSpacer.style.flexShrink = "0";
}
