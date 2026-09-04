import { forwardRef } from "react";
import { XIcon } from "lucide-react";
import { cn } from "../lib/cn.js";

const variantClasses = { primary: "btn-primary", secondary: "btn-secondary", danger: "btn-danger", link: "link" };

export const Button = forwardRef(function Button({ variant = "secondary", className, type = "button", ...props }, ref) {
  return <button ref={ref} type={type} className={cn(variantClasses[variant] || variantClasses.secondary, className)} {...props} />;
});

export const IconButton = forwardRef(function IconButton({ label, variant = "default", size = "md", className, type = "button", children, ...props }, ref) {
  return <button ref={ref} type={type} className={cn("icon-button", variant === "close" && "icon-button-close", variant === "close" && `icon-button-close-${size}`, className)} aria-label={label} {...props}>{children}</button>;
});

export const CloseButton = forwardRef(function CloseButton({ label = "Close", size = "md", className, ...props }, ref) {
  return (
    <IconButton ref={ref} variant="close" size={size} className={className} label={label} {...props}>
      <XIcon size={18} strokeWidth={2} aria-hidden="true" />
    </IconButton>
  );
});

export function ChannelOptionButton({ label, active = false, icon, className, ...props }) {
  return (
    <button
      type="button"
      className={cn("header-action", "header-action-icon", active && "active", className)}
      aria-label={label}
      aria-expanded={active}
      aria-pressed={active}
      {...props}
    >
      {icon}
    </button>
  );
}
