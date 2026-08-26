import { useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/utils/cn";

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string;
  tone?: "error" | "success" | undefined;
}

export function AuthField({ label, error, tone, type = "text", className, ...inputProps }: AuthFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && visible ? "text" : type;
  const resolvedTone = error ? "error" : tone;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          id={id}
          type={resolvedType}
          placeholder=" "
          aria-invalid={Boolean(error) || resolvedTone === "error"}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "peer w-full rounded-xl border bg-transparent px-3.5 pt-5 pb-2 text-sm outline-none transition-colors",
            resolvedTone === "error" && "auth-field-error",
            resolvedTone === "success" && "auth-field-ok",
            !resolvedTone && (error ? "border-danger" : "border-border focus:border-fg"),
            isPassword && "pr-11",
            className,
          )}
          {...inputProps}
        />
        <label
          htmlFor={id}
          className="pointer-events-none absolute top-1.5 left-3.5 text-[11px] text-fg-muted transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[11px]"
        >
          {label}
        </label>
        {isPassword ? (
          <button
            type="button"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg"
            aria-label={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible((value) => !value)}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
