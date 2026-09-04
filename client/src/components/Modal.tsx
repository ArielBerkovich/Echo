import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../lib/cn.js";
import { CloseButton } from "./Button.js";

export function ModalActions({ children, className = "", ...props }) {
  return <div className={cn("modal-actions mt-[22px] flex justify-end gap-2.5", className)} {...props}>{children}</div>;
}

export default function Modal({
  title,
  className = "",
  backdropClassName = "",
  closeLabel = "Close",
  closeClassName = "",
  closeTestId,
  closeDisabled = false,
  onOpenAutoFocus,
  unstyled = false,
  onPointerDownOutside,
  showHeader = true,
  showClose = true,
  testId,
  onClose,
  children,
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && !closeDisabled && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[3px]",
            backdropClassName
          )}
        >
          <Dialog.Content
            className={cn(
              !unstyled && "modal z-[101] w-[480px] max-w-[calc(100vw-40px)] rounded-2xl bg-[var(--surface)] p-6 shadow-[var(--shadow-lg)]",
              className
            )}
            data-testid={testId}
            onOpenAutoFocus={onOpenAutoFocus}
            aria-describedby={undefined}
            onEscapeKeyDown={(event) => {
              // Escape belongs to the topmost modal. Prevent background
              // panels with document-level handlers from seeing the same key.
              event.stopPropagation();
              if (closeDisabled) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              const target = event.detail?.originalEvent?.target;
              // Composer emoji pickers are portaled to the document so they
              // can escape a modal's overflow clipping. Treat that portal as
              // part of the dialog instead of dismissing/blocking its click.
              if (target instanceof Element && target.closest(".emoji-popup-wrap")) {
                event.preventDefault();
                return;
              }
              if (closeDisabled) event.preventDefault();
              onPointerDownOutside?.(event);
            }}
          >
            {showHeader ? (
              <div className="modal-header mb-[18px] flex items-center justify-between">
                <Dialog.Title className="m-0 text-[21px] font-extrabold tracking-[-0.01em]">{title}</Dialog.Title>
                {showClose && (
                  <Dialog.Close asChild>
                    <CloseButton label={closeLabel} disabled={closeDisabled} />
                  </Dialog.Close>
                )}
              </div>
            ) : (
              <>
                <Dialog.Title className="sr-only">{title}</Dialog.Title>
                {showClose && (
                  <Dialog.Close asChild>
                    <CloseButton
                      className={closeClassName}
                      label={closeLabel}
                      data-testid={closeTestId}
                      disabled={closeDisabled}
                    />
                  </Dialog.Close>
                )}
              </>
            )}
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
