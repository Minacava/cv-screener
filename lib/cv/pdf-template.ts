import { createWriteStream } from "node:fs";
import PDFDocument from "pdfkit";

import type { CvCandidate } from "./types";

export function writeCandidatePdf(
  candidate: CvCandidate,
  photo: Buffer | null,
  outPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `CV — ${candidate.fullName}`,
        Author: "CV Screener mock generator",
      },
    });

    const stream = createWriteStream(outPath);
    doc.pipe(stream);

    const left = 50;
    const photoSize = 88;
    let y = 50;

    drawCandidatePhotoOrPlaceholder(doc, photo, left, y, photoSize);

    const textLeft = left + photoSize + 18;
    doc
      .fillColor("#0e0f0c")
      .font("Helvetica-Bold")
      .fontSize(18)
      .text(candidate.fullName, textLeft, y, { width: 380 });
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#5b6f00")
      .text(candidate.headline, textLeft, doc.y + 4, { width: 380 });
    doc
      .fontSize(9)
      .fillColor("#4e4d4b")
      .text(
        `${candidate.email}  ·  ${candidate.phone}  ·  ${candidate.location}`,
        textLeft,
        doc.y + 6,
        { width: 380 }
      );

    y = Math.max(doc.y, y + photoSize) + 24;
    doc.y = y;

    const writeSectionTitle = (title: string) => {
      doc.moveDown(0.6);
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#5b6f00")
        .text(title);
      doc
        .moveTo(left, doc.y + 2)
        .lineTo(545, doc.y + 2)
        .strokeColor("#d5d5d2")
        .stroke();
      doc.moveDown(0.5);
      doc.fillColor("#292929");
    };

    writeSectionTitle("Summary");
    doc.font("Helvetica").fontSize(10).text(candidate.summary, {
      align: "left",
      lineGap: 2,
    });

    writeSectionTitle("Skills");
    doc.font("Helvetica").fontSize(10).text(candidate.skills.join(" · "), {
      lineGap: 2,
    });

    writeSectionTitle("Experience");
    for (const job of candidate.experience) {
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(`${job.title} — ${job.company}`);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#72726e")
        .text(`${job.startDate} – ${job.endDate}`);
      doc.fillColor("#292929");
      for (const bullet of job.bullets) {
        doc.font("Helvetica").fontSize(10).text(`• ${bullet}`, {
          indent: 8,
          lineGap: 1,
        });
      }
      doc.moveDown(0.4);
    }

    writeSectionTitle("Education");
    for (const ed of candidate.education) {
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(`${ed.degree} in ${ed.field}`);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#72726e")
        .text(`${ed.institution} · ${ed.graduationYear}`);
      doc.fillColor("#292929");
      doc.moveDown(0.3);
    }

    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

/** Draw the AI portrait, or a labelled box if photo is missing/invalid. */
function drawCandidatePhotoOrPlaceholder(
  doc: PDFKit.PDFDocument,
  photo: Buffer | null,
  left: number,
  y: number,
  photoSize: number
): void {
  if (photo) {
    try {
      doc.image(photo, left, y, {
        width: photoSize,
        height: photoSize,
      });
      return;
    } catch {
      // fall through to placeholder
    }
  }

  doc
    .roundedRect(left, y, photoSize, photoSize, 8)
    .fillAndStroke("#e5eacd", "#5b6f00");
  doc
    .fillColor("#5b6f00")
    .fontSize(9)
    .text(photo ? "Photo" : "No photo", left, y + photoSize / 2 - 4, {
      width: photoSize,
      align: "center",
    });
}
