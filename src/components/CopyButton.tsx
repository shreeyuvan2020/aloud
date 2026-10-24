"use client";

import { useState } from "react";
import { CheckIcon, LinkIcon } from "@/components/icons";

export function CopyButton({
  text,
  children,
  className = "ghost",
}: {
  text: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is a nice-to-have; the URL is on screen either way.
    }
  }

  return (
    <button className={className} onClick={copy} aria-live="polite">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
        {copied ? <CheckIcon size={15} /> : <LinkIcon size={15} />}
        {copied ? "Copied" : (children ?? "Copy link")}
      </span>
    </button>
  );
}
