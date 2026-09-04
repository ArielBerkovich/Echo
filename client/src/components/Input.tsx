import { forwardRef } from "react";
import { cn } from "../lib/cn.js";

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("input-control", className)} {...props} />;
});

export function InputShell({ className, ...props }) {
  return <div className={cn("input-shell", className)} {...props} />;
}
