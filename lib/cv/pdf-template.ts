import { createWriteStream } from "node:fs";
import PDFDocument from "pdfkit";

import type { CvCandidate } from "./types";

const PAGE = {
  marginX: 48,
  marginTop: 48,
  marginBottom: 48,
  width: 595.28,
  height: 841.89,
};

const CONTENT_WIDTH = PAGE.width - PAGE.marginX * 2;
const PHOTO_SIZE = 84;
const HEADER_GAP = 16;
const SECTION_GAP = 16;
const BLOCK_GAP = 10;
const LINE = "#d5d5d2";
const INK = "#292929";
const MUTED = "#72726e";
const ACCENT = "#5b6f00";
const TITLE = "#0e0f0c";

export function writeCandidatePdf(
  candidate: CvCandidate,
  photo: Buffer | null,
  outPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE.marginX,
      info: {
        Title: `CV — ${candidate.fullName}`,
        Author: "CV Screener mock generator",
      },
    });

    const stream = createWriteStream(outPath);
    doc.pipe(stream);

    let y = PAGE.marginTop;
    y = drawHeader(doc, candidate, photo, y);
    y += SECTION_GAP;
    y = drawSection(doc, "Summary", y, (cursor) =>
      drawParagraph(doc, candidate.summary, cursor)
    );
    y = drawSection(doc, "Skills", y, (cursor) =>
      drawParagraph(doc, candidate.skills.join("  ·  "), cursor)
    );
    y = drawSection(doc, "Experience", y, (cursor) => {
      let cy = cursor;
      for (let i = 0; i < candidate.experience.length; i++) {
        cy = drawExperience(doc, candidate.experience[i]!, cy);
        if (i < candidate.experience.length - 1) cy += BLOCK_GAP;
      }
      return cy;
    });
    y = drawSection(doc, "Education", y, (cursor) => {
      let cy = cursor;
      for (let i = 0; i < candidate.education.length; i++) {
        cy = drawEducation(doc, candidate.education[i]!, cy);
        if (i < candidate.education.length - 1) cy += BLOCK_GAP;
      }
      return cy;
    });

    void y;
    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number): number {
  if (y + needed <= PAGE.height - PAGE.marginBottom) return y;
  doc.addPage();
  return PAGE.marginTop;
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  candidate: CvCandidate,
  photo: Buffer | null,
  y: number
): number {
  const left = PAGE.marginX;
  const textLeft = left + PHOTO_SIZE + HEADER_GAP;
  const textWidth = CONTENT_WIDTH - PHOTO_SIZE - HEADER_GAP;

  drawCandidatePhotoOrPlaceholder(doc, photo, left, y, PHOTO_SIZE);

  let textY = y;
  doc
    .fillColor(TITLE)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(candidate.fullName, textLeft, textY, {
      width: textWidth,
      lineGap: 2,
    });
  textY = doc.y + 4;

  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(ACCENT)
    .text(candidate.headline, textLeft, textY, {
      width: textWidth,
      lineGap: 2,
    });
  textY = doc.y + 6;

  doc
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      `${candidate.email}  ·  ${candidate.phone}  ·  ${candidate.location}`,
      textLeft,
      textY,
      { width: textWidth, lineGap: 2 }
    );

  const headerBottom = Math.max(y + PHOTO_SIZE, doc.y);
  const ruleY = headerBottom + 14;
  doc
    .moveTo(left, ruleY)
    .lineTo(left + CONTENT_WIDTH, ruleY)
    .strokeColor(LINE)
    .lineWidth(1)
    .stroke();

  return ruleY + 4;
}

function drawSection(
  doc: PDFKit.PDFDocument,
  title: string,
  y: number,
  render: (cursor: number) => number
): number {
  y = ensureSpace(doc, y, 48);
  const left = PAGE.marginX;

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(ACCENT)
    .text(title.toUpperCase(), left, y, {
      width: CONTENT_WIDTH,
      characterSpacing: 0.6,
    });

  const underlineY = doc.y + 3;
  doc
    .moveTo(left, underlineY)
    .lineTo(left + CONTENT_WIDTH, underlineY)
    .strokeColor(LINE)
    .lineWidth(1)
    .stroke();

  const bodyStart = underlineY + 10;
  const end = render(bodyStart);
  return end + SECTION_GAP;
}

function drawParagraph(
  doc: PDFKit.PDFDocument,
  text: string,
  y: number
): number {
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(INK)
    .text(text, PAGE.marginX, y, {
      width: CONTENT_WIDTH,
      align: "left",
      lineGap: 3,
    });
  return doc.y;
}

function drawExperience(
  doc: PDFKit.PDFDocument,
  job: CvCandidate["experience"][number],
  y: number
): number {
  y = ensureSpace(doc, y, 72);
  const left = PAGE.marginX;
  const dateWidth = 120;
  const titleWidth = CONTENT_WIDTH - dateWidth - 8;

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(TITLE)
    .text(`${job.title} — ${job.company}`, left, y, {
      width: titleWidth,
      lineGap: 1,
    });
  const titleBottom = doc.y;

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(`${job.startDate} – ${job.endDate}`, left + titleWidth + 8, y, {
      width: dateWidth,
      align: "right",
      lineGap: 1,
    });

  let cursor = Math.max(titleBottom, doc.y) + 4;

  for (const bullet of job.bullets) {
    cursor = ensureSpace(doc, cursor, 28);
    cursor = drawBullet(doc, bullet, cursor);
    cursor += 3;
  }

  return cursor;
}

function drawEducation(
  doc: PDFKit.PDFDocument,
  ed: CvCandidate["education"][number],
  y: number
): number {
  y = ensureSpace(doc, y, 40);
  const left = PAGE.marginX;
  const yearWidth = 48;
  const titleWidth = CONTENT_WIDTH - yearWidth - 8;

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(TITLE)
    .text(`${ed.degree} in ${ed.field}`, left, y, {
      width: titleWidth,
      lineGap: 1,
    });
  const titleBottom = doc.y;

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(ed.graduationYear, left + titleWidth + 8, y, {
      width: yearWidth,
      align: "right",
    });

  let cursor = Math.max(titleBottom, doc.y) + 2;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(ed.institution, left, cursor, {
      width: CONTENT_WIDTH,
      lineGap: 1,
    });

  return doc.y;
}

function drawBullet(
  doc: PDFKit.PDFDocument,
  text: string,
  y: number
): number {
  const left = PAGE.marginX;
  const bulletCol = 12;
  const textLeft = left + bulletCol;
  const textWidth = CONTENT_WIDTH - bulletCol;

  doc.font("Helvetica").fontSize(10).fillColor(INK);
  doc.text("•", left, y, { width: bulletCol, lineGap: 2 });
  doc.text(text, textLeft, y, {
    width: textWidth,
    align: "left",
    lineGap: 2,
  });
  return doc.y;
}

function drawCandidatePhotoOrPlaceholder(
  doc: PDFKit.PDFDocument,
  photo: Buffer | null,
  left: number,
  y: number,
  photoSize: number
): void {
  if (photo) {
    try {
      doc.save();
      doc.roundedRect(left, y, photoSize, photoSize, 8).clip();
      doc.image(photo, left, y, {
        width: photoSize,
        height: photoSize,
      });
      doc.restore();
      doc
        .roundedRect(left, y, photoSize, photoSize, 8)
        .lineWidth(1)
        .strokeColor(LINE)
        .stroke();
      return;
    } catch {
      // fall through to placeholder
    }
  }

  doc
    .roundedRect(left, y, photoSize, photoSize, 8)
    .fillAndStroke("#e5eacd", ACCENT);
  doc
    .fillColor(ACCENT)
    .font("Helvetica")
    .fontSize(9)
    .text(photo ? "Photo" : "No photo", left, y + photoSize / 2 - 5, {
      width: photoSize,
      align: "center",
      lineBreak: false,
    });
}
