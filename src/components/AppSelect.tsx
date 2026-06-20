import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

export interface AppSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface AppSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  ariaLabel?: string;
  disabled?: boolean;
  placeholder?: string;
}

function getNextEnabledIndex(options: AppSelectOption[], currentIndex: number, direction: 1 | -1): number {
  if (options.length === 0) {
    return -1;
  }

  let nextIndex = currentIndex;

  for (let attempt = 0; attempt < options.length; attempt += 1) {
    nextIndex = (nextIndex + direction + options.length) % options.length;

    if (!options[nextIndex]?.disabled) {
      return nextIndex;
    }
  }

  return -1;
}

export function AppSelect({
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
  placeholder = "Seleccionar",
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (selectedIndex >= 0 && !options[selectedIndex]?.disabled) {
      setActiveIndex(selectedIndex);
      return;
    }

    setActiveIndex(getNextEnabledIndex(options, -1, 1));
  }, [open, options, selectedIndex]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

  function commitSelection(index: number) {
    const option = options[index];

    if (!option || option.disabled) {
      return;
    }

    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        return;
      }

      setActiveIndex((currentIndex) => getNextEnabledIndex(options, currentIndex, 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        return;
      }

      setActiveIndex((currentIndex) => getNextEnabledIndex(options, currentIndex, -1));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        return;
      }

      if (activeIndex >= 0) {
        commitSelection(activeIndex);
      }
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div
      className={open ? "app-select app-select--open" : "app-select"}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        className="app-select__trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={selectedOption ? "app-select__value" : "app-select__value app-select__value--placeholder"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span className={open ? "app-select__caret app-select__caret--open" : "app-select__caret"} aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="app-select__menu" id={listboxId} role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            const className = [
              "app-select__option",
              isSelected ? "app-select__option--selected" : "",
              isActive ? "app-select__option--active" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={`${option.value}-${option.label}`}
                className={className}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commitSelection(index)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
