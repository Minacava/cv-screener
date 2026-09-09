"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { FileText, Send, Sparkles } from "lucide-react";
import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { MarkdownMessage } from "@/components/chat/markdown-message";
import { PdfPreviewPanel } from "@/components/chat/pdf-preview-panel";
import { ThinkingIndicator } from "@/components/chat/thinking-indicator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const EMPTY_STATE_SUGGESTIONS = [
  "Show candidates with Python",
  "Candidates with AWS",
  "Summary of Jane Doe",
  "Which candidate graduated from UPC?",
] as const;

/** Demo prompts shown above the composer once a conversation has started. */
const PROMPT_TEMPLATES = [
  "Who has experience with Python?",
  "Which candidate graduated from UPC?",
  "Summarize the profile of Jane Doe.",
] as const;

const TEXTAREA_MAX_HEIGHT_PX = 160;

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

function syncTextareaHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
  el.scrollTop = el.scrollHeight;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error } = useChat();

  const isBusy = status === "submitted" || status === "streaming";
  const canSend = input.trim().length > 0 && !isBusy;
  const lastMessage = messages[messages.length - 1];
  const waitingForAssistant = isBusy && lastMessage?.role === "user";
  const lastAssistantPending =
    isBusy &&
    lastMessage?.role === "assistant" &&
    !getMessageText(lastMessage);
  const showThinking = waitingForAssistant || lastAssistantPending;

  function scrollChatToBottom(behavior: ScrollBehavior = "smooth") {
    const anchor = thinkingRef.current ?? messagesEndRef.current;
    if (!anchor) return;

    const viewport = anchor.closest(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLElement | null;

    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
      return;
    }

    anchor.scrollIntoView({ behavior, block: "end" });
  }

  useLayoutEffect(() => {
    if (textareaRef.current) {
      syncTextareaHeight(textareaRef.current);
    }
  }, [input]);

  // Keep the latest message / Thinking row visible inside Radix ScrollArea
  useLayoutEffect(() => {
    if (messages.length === 0) return;

    const behavior: ScrollBehavior = showThinking ? "smooth" : "auto";
    scrollChatToBottom(behavior);

    // Remount / layout settle (empty state → thread, Thinking row insert)
    const frame = requestAnimationFrame(() => {
      scrollChatToBottom(behavior);
    });
    const timeout = window.setTimeout(() => {
      scrollChatToBottom(behavior);
    }, 50);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [messages, status, showThinking]);

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
    if (isBusy) return;
    setInput(prompt);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  return (
    <div className="relative flex h-dvh overflow-hidden bg-[#f7f7f2] text-[#292929] dark:bg-[#1a1a17] dark:text-[#f7f7f2]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(178,194,72,0.14),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(254,190,41,0.08),_transparent_45%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(91,111,0,0.28),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(254,190,41,0.06),_transparent_45%)]"
      />

      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col",
          selectedPdf ? "lg:max-w-[55%]" : "w-full"
        )}
      >
        <main className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 sm:px-6">
          <div className="min-h-0 flex-1 overflow-hidden">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-12 pb-32 text-center">
                <h1 className="animate-in fade-in slide-in-from-bottom-2 max-w-2xl text-[2rem] font-light leading-[1.15] tracking-[-0.02em] text-[#0e0f0c] duration-700 sm:text-[2.75rem] dark:text-[#f7f7f2]">
                  Hello. How can I help you with CVs today?
                </h1>
                <div className="animate-in fade-in fill-mode-both flex max-w-2xl flex-wrap items-center justify-center gap-3 delay-150 duration-700">
                  {EMPTY_STATE_SUGGESTIONS.map((suggestion) => (
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
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-8 pr-2 pt-10 pb-36 sm:pt-16">
                  {messages.map((message) => {
                    const text = getMessageText(message);
                    const sources = getMessageSources(message);
                    const isPendingAssistant =
                      message.role === "assistant" &&
                      !text &&
                      message.id === lastMessage?.id &&
                      isBusy;

                    // Empty streaming placeholder — ThinkingIndicator renders below instead
                    if (isPendingAssistant) {
                      return <Fragment key={message.id} />;
                    }

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
                          {text ? (
                            <MarkdownMessage content={text} />
                          ) : null}
                          {sources.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {sources.map((source, sourceIndex) => (
                                <button
                                  key={`${message.id}-${source}-${sourceIndex}`}
                                  type="button"
                                  onClick={() => setSelectedPdf(source)}
                                  className="inline-flex"
                                >
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "h-auto cursor-pointer gap-1.5 rounded-full border-[#d5d5d2] bg-[#ffffff] px-2.5 py-1 text-[12px] font-normal text-[#4e4d4b] transition-colors hover:border-[#b2c248] hover:bg-[#e5eacd] hover:text-[#5b6f00] dark:border-[#3a3a35] dark:bg-[#242420] dark:text-[#acada8] dark:hover:border-[#788c15] dark:hover:bg-[#2f3a00]/35 dark:hover:text-[#d1e043]",
                                      selectedPdf === source &&
                                        "border-[#b2c248] bg-[#e5eacd] text-[#5b6f00] dark:border-[#788c15] dark:bg-[#2f3a00]/35 dark:text-[#d1e043]"
                                    )}
                                  >
                                    <FileText data-icon="inline-start" />
                                    {source}
                                  </Badge>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {showThinking ? (
                    <div ref={thinkingRef}>
                      <ThinkingIndicator />
                    </div>
                  ) : null}
                  <div ref={messagesEndRef} aria-hidden className="h-px w-full" />
                </div>
              </ScrollArea>
            )}
          </div>
        </main>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#f7f7f2] via-[#f7f7f2]/80 to-transparent px-4 pb-6 pt-16 sm:px-6 dark:from-[#1a1a17] dark:via-[#1a1a17]/80">
          {error ? (
            <p className="pointer-events-auto mb-3 text-center text-sm text-[#e95d3d] dark:text-[#ff736a]">
              Couldn&apos;t send the message. Please try again.
            </p>
          ) : null}

          <form
            onSubmit={handleSubmit}
            className="pointer-events-auto mx-auto w-full max-w-3xl"
          >
            {messages.length > 0 ? (
              <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
                {PROMPT_TEMPLATES.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={isBusy}
                    onClick={() => applySuggestion(prompt)}
                    className="disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Badge
                      variant="outline"
                      className="h-auto max-w-[min(100%,20rem)] cursor-pointer whitespace-normal rounded-full border-[#d5d5d2]/90 bg-[#ffffff]/85 px-3 py-1.5 text-left text-[12px] font-normal leading-snug text-[#4e4d4b] backdrop-blur-sm transition-colors hover:border-[#b2c248] hover:bg-[#e5eacd] hover:text-[#5b6f00] dark:border-[#3a3a35] dark:bg-[#242420]/85 dark:text-[#acada8] dark:hover:border-[#788c15] dark:hover:bg-[#2f3a00]/35 dark:hover:text-[#d1e043]"
                    >
                      {prompt}
                    </Badge>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex items-end gap-1 rounded-[28px] border border-[#d5d5d2]/90 bg-[#ffffff] p-2 shadow-[0_4px_24px_rgba(34,30,15,0.06)] transition-shadow focus-within:border-[#b2c248] focus-within:shadow-[0_6px_28px_rgba(34,30,15,0.08)] dark:border-[#3a3a35] dark:bg-[#242420] dark:shadow-[0_4px_24px_rgba(0,0,0,0.35)] dark:focus-within:border-[#788c15]">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the CVs…"
                rows={1}
                disabled={isBusy}
                className="min-h-12 max-h-40 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-4 py-3 text-[15px] leading-relaxed text-[#292929] shadow-none placeholder:text-[#acada8] focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent dark:text-[#f7f7f2] dark:placeholder:text-[#72726e]"
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
      </div>

      {selectedPdf ? (
        <>
          <button
            type="button"
            aria-label="Close PDF preview overlay"
            className="fixed inset-0 z-30 bg-[#0e0f0c]/25 lg:hidden"
            onClick={() => setSelectedPdf(null)}
          />
          <div className="fixed inset-y-0 right-0 z-40 w-full max-w-xl shadow-2xl lg:static lg:z-0 lg:max-w-none lg:w-[45%] lg:shadow-none">
            <PdfPreviewPanel
              fileName={selectedPdf}
              onClose={() => setSelectedPdf(null)}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
