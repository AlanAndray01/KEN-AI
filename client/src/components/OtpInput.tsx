import { useRef, type ClipboardEvent, type KeyboardEvent, type ChangeEvent } from "react";
import { cn } from "@/utils/cn";

const OTP_LENGTH = 6;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
}

export function OtpInput({ value, onChange, disabled = false, error = false }: OtpInputProps) {
  const digits = Array.from({ length: OTP_LENGTH }, (_, index) => value[index] ?? "");
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function focusAt(index: number): void {
    refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, index))]?.focus();
  }

  function writeDigits(next: string, startIndex = 0): void {
    const incoming = onlyDigits(next).slice(0, OTP_LENGTH - startIndex);
    const chars = digits.slice();
    for (let offset = 0; offset < incoming.length; offset += 1) {
      chars[startIndex + offset] = incoming[offset] ?? "";
    }
    const joined = chars.join("").slice(0, OTP_LENGTH);
    onChange(joined);
    focusAt(startIndex + incoming.length);
  }

  function onDigitChange(index: number, event: ChangeEvent<HTMLInputElement>): void {
    const raw = onlyDigits(event.target.value);
    if (!raw) {
      const chars = digits.slice();
      chars[index] = "";
      onChange(chars.join(""));
      return;
    }
    writeDigits(raw, index);
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      const chars = digits.slice();
      chars[index - 1] = "";
      onChange(chars.join(""));
      focusAt(index - 1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(index - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(index + 1);
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>): void {
    event.preventDefault();
    writeDigits(event.clipboardData.getData("text"), 0);
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="Verification code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          value={digit}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          autoFocus={index === 0}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
          className={cn(
            "h-12 w-10 rounded-xl border bg-surface/70 text-center text-lg font-semibold tracking-widest shadow-sm outline-none transition-colors sm:h-14 sm:w-12",
            error ? "border-danger" : "border-border focus:border-fg",
            disabled && "opacity-60",
          )}
          onChange={(event) => onDigitChange(index, event)}
          onKeyDown={(event) => onKeyDown(index, event)}
          onPaste={onPaste}
        />
      ))}
    </div>
  );
}
