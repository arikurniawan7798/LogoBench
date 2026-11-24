import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

export const controlClasses =
  "block w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg shadow-xs " +
  "placeholder:text-fg-subtle transition-[border-color,box-shadow] duration-150 " +
  "hover:border-fg-subtle/60 focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-3 focus:ring-ring/30 " +
  "disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-70 " +
  "aria-invalid:border-danger aria-invalid:focus:ring-danger/25";

export const labelClasses = "block text-sm font-medium text-fg";
export const hintClasses = "text-[0.8125rem] leading-5 text-fg-muted";
export const errorClasses = "text-[0.8125rem] font-medium leading-5 text-danger";

type FieldBits = {
  label: ReactNode;
  hint?: ReactNode;
  /** Error text. When set the control is aria-invalid and described by it (before the hint). */
  error?: ReactNode;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  /** Extra ids to append to aria-describedby. */
  describedBy?: string;
  wrapperClassName?: string;
};

/** Ids and ARIA wiring shared by the three controls. */
function useFieldIds(id: string | undefined, hint: ReactNode, error: ReactNode, describedBy?: string) {
  const auto = useId();
  const controlId = id ?? `f${auto}`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const ids = [error ? errorId : null, hint ? hintId : null, describedBy || null].filter(Boolean).join(" ");
  return { controlId, hintId, errorId, describedBy: ids || undefined };
}

function Wrapper({
  controlId,
  hintId,
  errorId,
  label,
  hint,
  error,
  hideLabel,
  className,
  children,
}: {
  controlId: string;
  hintId: string;
  errorId: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={controlId} className={hideLabel ? "sr-only" : labelClasses}>
        {label}
      </label>
      {children}
      {error && (
        <p id={errorId} className={errorClasses}>
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className={hintClasses}>
          {hint}
        </p>
      )}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "children"> & FieldBits;

/** Labelled text input with hint and error wiring (aria-describedby, aria-invalid). */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, hint, error, hideLabel, describedBy, wrapperClassName, className, "aria-invalid": ariaInvalid, ...rest },
  ref,
) {
  const f = useFieldIds(id, hint, error, describedBy);
  return (
    <Wrapper {...f} label={label} hint={hint} error={error} hideLabel={hideLabel} className={wrapperClassName}>
      <input
        ref={ref}
        id={f.controlId}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={f.describedBy}
        {...rest}
        className={cn(controlClasses, "h-10", className)}
      />
    </Wrapper>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldBits;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { id, label, hint, error, hideLabel, describedBy, wrapperClassName, className, "aria-invalid": ariaInvalid, ...rest },
  ref,
) {
  const f = useFieldIds(id, hint, error, describedBy);
  return (
    <Wrapper {...f} label={label} hint={hint} error={error} hideLabel={hideLabel} className={wrapperClassName}>
      <textarea
        ref={ref}
        id={f.controlId}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={f.describedBy}
        className={cn(controlClasses, "min-h-24 resize-y py-2 leading-6", className)}
        {...rest}
      />
    </Wrapper>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldBits;

export const selectClasses = cn(controlClasses, "select-chevron h-10 cursor-pointer appearance-none pr-9");

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { id, label, hint, error, hideLabel, describedBy, wrapperClassName, className, children, "aria-invalid": ariaInvalid, ...rest },
  ref,
) {
  const f = useFieldIds(id, hint, error, describedBy);
  return (
    <Wrapper {...f} label={label} hint={hint} error={error} hideLabel={hideLabel} className={wrapperClassName}>
      <select
        ref={ref}
        id={f.controlId}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={f.describedBy}
        className={cn(selectClasses, className)}
        {...rest}
      >
        {children}
      </select>
    </Wrapper>
  );
});
