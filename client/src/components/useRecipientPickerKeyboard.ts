import { useEffect, useRef, useState } from "react";

export default function useRecipientPickerKeyboard({ items, hasQuery, scrollEnabled = hasQuery, onSelect, onTab }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeOptionRef = useRef(null);
  const activeItem = items[Math.min(activeIndex, Math.max(items.length - 1, 0))];

  useEffect(() => {
    if (!scrollEnabled) return;
    activeOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeItem?.id, items.length, scrollEnabled]);

  function handleKeyDown(event) {
    if (event.key === "Tab" && !event.shiftKey && onTab) {
      event.preventDefault();
      onTab();
      return;
    }
    if (event.key === "ArrowDown" && items.length) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % items.length);
      return;
    }
    if (event.key === "ArrowUp" && items.length) {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
      return;
    }
    if (event.key === "Home" && items.length) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" && items.length) {
      event.preventDefault();
      setActiveIndex(items.length - 1);
      return;
    }
    if (event.key === "Enter" && hasQuery && activeItem) {
      event.preventDefault();
      onSelect(activeItem);
    }
  }

  return { activeIndex, activeItem, activeOptionRef, handleKeyDown, setActiveIndex };
}
