"use client";

import { FileText, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type PdfPreviewPanelProps = {
  fileName: string;
  onClose: () => void;
};

export function PdfPreviewPanel({ fileName, onClose }: PdfPreviewPanelProps) {
  const src = `/api/cvs/${encodeURIComponent(fileName)}`;

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-[#d5d5d2]/90 bg-[#ffffff] dark:border-[#3a3a35] dark:bg-[#1f1f1b]">
      <div className="flex items-center gap-2 border-b border-[#d5d5d2]/90 px-4 py-3 dark:border-[#3a3a35]">
        <FileText className="size-4 shrink-0 text-[#5b6f00] dark:text-[#d1e043]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#0e0f0c] dark:text-[#f7f7f2]">
            {fileName}
          </p>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[#5b6f00] hover:underline dark:text-[#d1e043]"
          >
            Open in new tab
          </a>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Close PDF preview"
          onClick={onClose}
          className="size-8 rounded-full text-[#4e4d4b] hover:bg-[#eaebe5] dark:text-[#acada8] dark:hover:bg-[#2a2a26]"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 bg-[#f0f0eb] p-3 dark:bg-[#151512]">
        <iframe
          title={fileName}
          src={`${src}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
          className="h-full w-full rounded-lg border border-[#d5d5d2]/80 bg-white dark:border-[#3a3a35]"
        />
      </div>
    </aside>
  );
}
