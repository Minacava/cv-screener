"use client";

import ReactMarkdown from "react-markdown";

import { cn } from "@/lib/utils";

type MarkdownMessageProps = {
  content: string;
  className?: string;
};

export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  return (
    <div
      className={cn(
        "text-[15px] font-normal leading-[1.7] text-[#292929] dark:text-[#f7f7f2]",
        "[&_p]:mb-3 [&_p:last-child]:mb-0",
        "[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5",
        "[&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5",
        "[&_li]:leading-relaxed",
        "[&_strong]:font-semibold [&_strong]:text-[#0e0f0c] dark:[&_strong]:text-[#f7f7f2]",
        "[&_em]:italic",
        "[&_code]:rounded-md [&_code]:bg-[#eaebe5] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:font-normal dark:[&_code]:bg-[#2a2a26]",
        "[&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold",
        "[&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold",
        "[&_h3]:mb-1.5 [&_h3]:text-[15px] [&_h3]:font-semibold",
        "[&_a]:text-[#5b6f00] [&_a]:underline-offset-2 hover:[&_a]:underline dark:[&_a]:text-[#d1e043]",
        className
      )}
    >
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
