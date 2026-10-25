"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { Loader2, Search, X } from "lucide-react";

export interface SearchBarProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onClear?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  className?: string;
  inputClassName?: string;
  prefixAction?: ReactNode;
  suffixAction?: ReactNode;
  showSearchButton?: boolean;
  searchButtonText?: string;
  searchButtonLoadingText?: string;
  dropdownContent?: ReactNode;
  "aria-label"?: string;
  size?: "default" | "sm" | "lg";
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  {
    id,
    name,
    value,
    onChange,
    onSubmit,
    onClear,
    onFocus,
    onBlur,
    onKeyDown,
    placeholder = "搜索歌曲、艺人或歌单",
    disabled = false,
    loading = false,
    autoFocus = false,
    maxLength = 100,
    className = "",
    inputClassName = "",
    prefixAction,
    suffixAction,
    showSearchButton = false,
    searchButtonText = "搜索",
    searchButtonLoadingText = "搜索中…",
    dropdownContent,
    "aria-label": ariaLabel = "搜索",
    size = "default"
  },
  forwardedRef
) {
  const [localValue, setLocalValue] = useState(value);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const isFocusedRef = useRef(false);
  const lastReportedValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useImperativeHandle(forwardedRef, () => internalInputRef.current as HTMLInputElement);

  const syncValue = useCallback((nextVal: string) => {
    lastReportedValueRef.current = nextVal;
    setLocalValue(nextVal);
    onChangeRef.current(nextVal);
  }, []);

  useEffect(() => {
    const node = internalInputRef.current;
    if (!node) return;

    const handleNativeInput = () => {
      const currentVal = node.value;
      syncValue(currentVal);
    };

    node.addEventListener("input", handleNativeInput);
    node.addEventListener("compositionend", handleNativeInput);
    node.addEventListener("change", handleNativeInput);

    return () => {
      node.removeEventListener("input", handleNativeInput);
      node.removeEventListener("compositionend", handleNativeInput);
      node.removeEventListener("change", handleNativeInput);
    };
  }, [syncValue]);

  useEffect(() => {
    if (value !== lastReportedValueRef.current) {
      lastReportedValueRef.current = value;
      if (internalInputRef.current && internalInputRef.current.value !== value) {
        internalInputRef.current.value = value;
      }
      setLocalValue(value);
    }
  }, [value]);

  const handleInput = (event: React.FormEvent<HTMLInputElement>) => {
    const nextVal = event.currentTarget.value;
    syncValue(nextVal);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = event.target.value;
    if (nextVal !== lastReportedValueRef.current) {
      syncValue(nextVal);
    }
  };

  const handleSubmit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (disabled || loading) return;
    const domValue = internalInputRef.current?.value ?? "";
    const rawValue = (domValue || localValue || value).trim();
    if (!rawValue) {
      internalInputRef.current?.focus();
      return;
    }
    if (domValue !== value) {
      syncValue(domValue);
    }
    internalInputRef.current?.blur();
    onSubmit?.(rawValue);
  };

  const handleClear = () => {
    if (internalInputRef.current) {
      internalInputRef.current.value = "";
    }
    lastReportedValueRef.current = "";
    setLocalValue("");
    onChange("");
    onClear?.();
    internalInputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const isComposing = isComposingRef.current || (event.nativeEvent as unknown as { isComposing?: boolean })?.isComposing;
    if (event.key === "Enter" && !isComposing) {
      event.preventDefault();
      handleSubmit();
      return;
    }
    onKeyDown?.(event);
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    const domVal = internalInputRef.current?.value ?? event.currentTarget.value ?? "";
    syncValue(domVal);
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
    onFocus?.();
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = false;
    isComposingRef.current = false;
    const domVal = internalInputRef.current?.value ?? event.currentTarget.value ?? "";
    if (domVal !== value) {
      syncValue(domVal);
    }
    onBlur?.();
  };

  const hasContent = Boolean((localValue || internalInputRef.current?.value || value).trim());

  const sizeClasses = {
    sm: "h-8 text-xs",
    default: "h-9 sm:h-10 text-xs sm:text-sm",
    lg: "h-11 text-sm sm:text-base"
  }[size];

  return (
    <div className={`relative w-full ${className}`}>
      <form
        action="#"
        className="flex w-full min-w-0 items-center gap-2"
        onSubmit={handleSubmit}
        role="search"
      >
        <div
          className={`relative flex min-w-0 flex-1 items-center rounded-full border border-surface-border bg-surface/80 px-3 transition-all duration-150 hover:bg-surface focus-within:border-foreground/25 focus-within:bg-surface-elevated focus-within:ring-2 focus-within:ring-foreground/5 ${sizeClasses} ${
            disabled ? "opacity-60 cursor-not-allowed" : ""
          }`}
        >
          {prefixAction ? (
            <div className="flex shrink-0 items-center mr-1.5">{prefixAction}</div>
          ) : (
            <span
              aria-hidden="true"
              className="flex h-4 w-4 shrink-0 items-center justify-center text-foreground-muted/60 mr-2"
            >
              <Search size={16} />
            </span>
          )}

          <div className="relative min-w-0 flex-1 h-full flex items-center">
            <input
              ref={internalInputRef}
              id={id}
              name={name}
              defaultValue={value}
              onInput={handleInput}
              onChange={handleChange}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              autoFocus={autoFocus}
              maxLength={maxLength}
              type="search"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label={ariaLabel}
              className={`h-full w-full min-w-0 bg-transparent py-1 text-foreground placeholder:text-foreground-muted/50 outline-none ${inputClassName}`}
            />

            {hasContent && !disabled ? (
              <button
                type="button"
                onClick={handleClear}
                onPointerDown={(e) => e.preventDefault()}
                aria-label="清空搜索内容"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-foreground-muted/50 transition hover:bg-foreground/10 hover:text-foreground"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>

          {suffixAction ? (
            <div className="flex shrink-0 items-center ml-1.5">{suffixAction}</div>
          ) : null}
        </div>

        {showSearchButton ? (
          <button
            type="submit"
            disabled={disabled || loading || !hasContent}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") {
                e.preventDefault();
              }
            }}
            onClick={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-accent/40 bg-accent px-3.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-accent-hover hover:border-accent active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${
              size === "sm" ? "h-8 text-xs" : "h-9 sm:h-10 text-xs"
            } ${!hasContent ? "opacity-50" : ""}`}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>{searchButtonLoadingText}</span>
              </>
            ) : (
              <span>{searchButtonText}</span>
            )}
          </button>
        ) : null}
      </form>

      {dropdownContent ? dropdownContent : null}
    </div>
  );
});
