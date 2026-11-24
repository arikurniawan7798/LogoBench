import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";
import { IconDownload } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "download";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium no-underline " +
  "transition-[background-color,border-color,color,box-shadow] duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
  "disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink shadow-sm hover:bg-accent-hover disabled:hover:bg-accent",
  secondary:
    "border border-line-strong bg-surface text-fg shadow-xs hover:bg-subtle hover:border-fg-subtle/50 " +
    "aria-pressed:border-accent-line aria-pressed:bg-accent-soft aria-pressed:text-accent-text",
  ghost: "text-fg-muted hover:bg-muted-bg hover:text-fg",
  danger: "border border-danger-line bg-surface text-danger hover:bg-danger-soft",
  download: "border border-accent-line bg-accent-soft text-accent-text hover:border-accent hover:bg-accent/20",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-10 px-4 text-sm",
};

/** Classes for anything that should look like a button (links, file-input labels). */
export function buttonClasses({ variant = "secondary", size = "md", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and `loadingText`, disables the button and sets aria-busy. */
  loading?: boolean;
  loadingText?: string;
  icon?: ReactNode;
};

/**
 * The one button. While `loading` it is disabled, aria-busy, and its accessible name becomes `loadingText`
 * (e.g. "Saving…"), so the state is announced and a second click can't fire.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, loadingText, icon, className, disabled, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      data-variant={variant}
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner />
          {loadingText ?? children}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
});

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode };

/** A link styled as a button. The download variant gets a download icon. */
export function ButtonLink({ variant = "secondary", size = "md", icon, className, children, ...rest }: LinkProps) {
  const lead = icon ?? (variant === "download" ? <IconDownload className={size === "sm" ? "size-4" : undefined} /> : null);
  return (
    <a data-variant={variant} className={buttonClasses({ variant, size, className })} {...rest}>
      {lead}
      {children}
    </a>
  );
}
