import { cn } from "@/lib/utils";
import { forwardRef } from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-1 text-sm shadow-sm transition-colors",
      "placeholder:text-(--color-muted)",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--color-accent)",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
