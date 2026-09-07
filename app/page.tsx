"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { FileText, Send, Sparkles } from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Show candidates with Python",
  "UPC graduates",
  "Summary of Jane Doe",
  "Experience in machine learning",
] as const;

type MessageSources = {
  sources?: string[];
};

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getMessageSources(message: UIMessage): string[] {
  const metadata = message.metadata as MessageSources | undefined;
  return Array.isArray(metadata?.sources) ? metadata.sources : [];
}

export default function Home() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { messages, sendMessage, status, error } = useChat();

  const isBusy = status === "submitted" || status === "streaming";
  const canSend = input.trim().length > 0 && !isBusy;

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;

    setInput("");
    await sendMessage({ text });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  function applySuggestion(prompt: string) {
    setInput(prompt);
    textareaRef.current?.focus();
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden bg-[#f7f7f2] text-[#292929] dark:bg-[#1a1a17] dark:text-[#f7f7f2]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(178,194,72,0.14),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(254,190,41,0.08),_transparent_45%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(91,111,0,0.28),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(254,190,41,0.06),_transparent_45%)]"
      />

      <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-40 pt-10 sm:px-6 sm:pt-16">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-12 text-center">
            <h1 className="animate-in fade-in slide-in-from-bottom-2 max-w-2xl text-[2rem] font-light leading-[1.15] tracking-[-0.02em] text-[#0e0f0c] duration-700 sm:text-[2.75rem] dark:text-[#f7f7f2]">
              Hello. How can I help you with CVs today?
            </h1>
            <div className="animate-in fade-in fill-mode-both flex max-w-2xl flex-wrap items-center justify-center gap-3 delay-150 duration-700">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => applySuggestion(suggestion)}
                  className="rounded-full border border-[#d5d5d2]/80 bg-[#ffffff]/70 px-4 py-2.5 text-[13px] font-normal text-[#4e4d4b] backdrop-blur-sm transition-colors duration-200 hover:border-[#b2c248]/70 hover:bg-[#e5eacd]/70 hover:text-[#5b6f00] dark:border-[#3a3a35] dark:bg-[#242420]/70 dark:text-[#acada8] dark:hover:border-[#788c15]/60 dark:hover:bg-[#2f3a00]/35 dark:hover:text-[#d1e043]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-8 py-4">
              {messages.map((message) => {
                const text = getMessageText(message);
                const sources = getMessageSources(message);

                if (message.role === "user") {
                  return (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[min(85%,36rem)] rounded-[24px] bg-[#e5eacd] px-5 py-3 text-[15px] font-normal leading-relaxed text-[#292929] dark:bg-[#2f3a00]/55 dark:text-[#f7f7f2]">
                        {text}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={message.id} className="flex gap-3.5">
                    <Avatar size="sm" className="mt-1">
                      <AvatarFallback className="bg-transparent text-[#5b6f00] ring-0 after:hidden dark:text-[#d1e043]">
                        <Sparkles className="size-4" aria-hidden />
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-3 pt-0.5">
                      <p className="whitespace-pre-wrap text-[15px] font-normal leading-[1.7] text-[#292929] dark:text-[#f7f7f2]">
                        {text || (isBusy ? "…" : "")}
                      </p>
                      {sources.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {sources.map((source) => (
                            <Badge
                              key={source}
                              variant="outline"
                              className="h-auto gap-1.5 rounded-full border-[#d5d5d2] bg-[#ffffff] px-2.5 py-1 text-[12px] font-normal text-[#4e4d4b] dark:border-[#3a3a35] dark:bg-[#242420] dark:text-[#acada8]"
                            >
                              <FileText data-icon="inline-start" />
                              {source}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-6 sm:px-6">
          {error ? (
            <p className="pointer-events-auto mb-3 text-center text-sm text-[#e95d3d] dark:text-[#ff736a]">
              Couldn&apos;t send the message. The{" "}
              <code className="rounded bg-[#0e0f0c]/5 px-1 dark:bg-[#f7f7f2]/10">
                /api/chat
              </code>{" "}
              endpoint isn&apos;t available yet.
            </p>
          ) : null}

          <form
            onSubmit={handleSubmit}
            className="pointer-events-auto mx-auto w-full max-w-3xl"
          >
            <div className="flex items-end gap-1 rounded-[28px] border border-[#d5d5d2]/90 bg-[#ffffff] p-2 shadow-[0_4px_24px_rgba(34,30,15,0.06)] transition-shadow focus-within:border-[#b2c248] focus-within:shadow-[0_6px_28px_rgba(34,30,15,0.08)] dark:border-[#3a3a35] dark:bg-[#242420] dark:shadow-[0_4px_24px_rgba(0,0,0,0.35)] dark:focus-within:border-[#788c15]">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the CVs…"
                rows={1}
                disabled={isBusy}
                className="min-h-12 max-h-40 flex-1 resize-none border-0 bg-transparent px-4 py-3 text-[15px] leading-relaxed text-[#292929] shadow-none placeholder:text-[#acada8] focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent dark:text-[#f7f7f2] dark:placeholder:text-[#72726e]"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!canSend}
                aria-label="Send"
                className={cn(
                  "mb-1 size-10 shrink-0 rounded-full border-0 transition-all duration-200",
                  canSend
                    ? "bg-[#5b6f00] text-white hover:bg-[#465800] dark:bg-[#b2c248] dark:text-[#0e0f0c] dark:hover:bg-[#d1e043]"
                    : "bg-[#eaebe5] text-[#acada8] dark:bg-[#3a3a35] dark:text-[#72726e]"
                )}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
