"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const THINKING_STAGES = [
  "Thinking",
  "Searching CVs",
  "Ranking matches",
  "Preparing answer",
] as const;

type ThinkingIndicatorProps = {
  className?: string;
};

/** Animated status row shown while the assistant prepares a reply. */
export function ThinkingIndicator({ className }: ThinkingIndicatorProps) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStageIndex((current) =>
        current < THINKING_STAGES.length - 1 ? current + 1 : current
      );
    }, 1800);
    return () => window.clearInterval(id);
  }, []);

  const label = THINKING_STAGES[stageIndex] ?? THINKING_STAGES[0];

  return (
    <div
      className={cn("flex gap-3.5", className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <Avatar size="sm" className="mt-1">
        <AvatarFallback className="bg-transparent text-[#5b6f00] ring-0 after:hidden dark:text-[#d1e043]">
          <Sparkles className="size-4 animate-pulse" aria-hidden />
        </AvatarFallback>
      </Avatar>
      <div className="flex items-center gap-2 pt-1.5 text-[15px] text-[#72726e] dark:text-[#acada8]">
        <span key={label} className="animate-in fade-in duration-300">
          {label}
        </span>
        <span className="inline-flex gap-1" aria-hidden>
          <span className="size-1.5 animate-bounce rounded-full bg-[#b2c248] [animation-delay:0ms]" />
          <span className="size-1.5 animate-bounce rounded-full bg-[#b2c248] [animation-delay:150ms]" />
          <span className="size-1.5 animate-bounce rounded-full bg-[#b2c248] [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  );
}
