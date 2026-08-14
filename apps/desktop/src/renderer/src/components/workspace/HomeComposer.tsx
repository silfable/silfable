// @ts-nocheck
import { useEffect, useRef } from "react";
import { Activity, Brain, Target, ShieldCheck, ArrowUp } from "lucide-react";
import { Button } from "../ui";
import { BrandMark } from "../setup/SetupHelpers";

export function Composer({
  value,
  setValue,
  onSubmit,
  disabled = false,
  placeholder,
}: {
  value: string;
  setValue: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeComposer = (element: HTMLTextAreaElement): void => {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
  };

  useEffect(() => {
    if (textareaRef.current) resizeComposer(textareaRef.current);
  }, [value]);

  return (
    <div className={`composer ${disabled ? "disabled" : ""}`}>
      <textarea
        ref={textareaRef}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          setValue(event.target.value);
          resizeComposer(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (!disabled && event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        rows={1}
      />
      <Button
        className="composerSubmit"
        size="sm"
        icon={<ArrowUp className="size-4" />}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        onClick={onSubmit}
      >
        <span className="sr-only">Send</span>
      </Button>
    </div>
  );
}

export function HomeComposer({
  draft,
  setDraft,
  onSubmit,
}: {
  draft: string;
  setDraft: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="homeState">
      <BrandMark large />
      <p className="tagline">Robinhood Chain first · Solana connected</p>
      <h1>Where should your next route lead?</h1>
      <Composer
        value={draft}
        setValue={setDraft}
        onSubmit={onSubmit}
        placeholder="Plan a Robinhood swap, bridge, or portfolio task…"
      />
      <div className="suggestions">
        <Button variant="outline" size="sm" icon={<Activity className="size-3.5" />}
          onClick={() =>
            setDraft(
              "Explain exactly what you can and cannot do in this desktop application.",
            )
          }
        >
          AI capabilities
        </Button>
        <Button variant="outline" size="sm" icon={<Brain className="size-3.5" />}
          onClick={() =>
            setDraft(
              "Review my configured wallet balances and recent finalized activity.",
            )
          }
        >
          Wallet activity
        </Button>
        <Button variant="outline" size="sm" icon={<Target className="size-3.5" />}
          onClick={() =>
            setDraft(
              "Draft a conservative SOL accumulation mission with explicit limits.",
            )
          }
        >
          Plan a mission
        </Button>
        <Button variant="outline" size="sm" icon={<ShieldCheck className="size-3.5" />}
          onClick={() =>
            setDraft("Explain the current Mainnet execution restrictions.")
          }
        >
          Runtime safety
        </Button>
      </div>
    </div>
  );
}
