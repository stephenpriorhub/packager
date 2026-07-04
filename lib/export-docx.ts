/**
 * Render a generated component into a Word .docx, and bundle a whole package
 * into a zip. One doc per component (Stephen's call) — a per-item component like
 * lift notes becomes a single doc with each variation as its own titled section.
 *
 * Generalized from promo-analyzer/lib/export-docx.ts.
 */

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  AlignmentType,
  BorderStyle,
} from "docx";
import JSZip from "jszip";
import type { GeneratedComponent } from "./generate";

const ACCENT = "2563EB";

export function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9\-_ ]/gi, "").replace(/\s+/g, " ").trim();
}

/** Convert a block of copy (light markdown) into styled paragraphs. */
function copyToParagraphs(text: string): Paragraph[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return new Paragraph({ spacing: { after: 80 } });

      // Heading lines (#, ##, ###)
      const h = trimmed.match(/^(#{1,3})\s+(.*)$/);
      if (h) {
        return new Paragraph({
          children: [new TextRun({ text: h[2].replace(/\*\*/g, ""), bold: true, size: 24 })],
          spacing: { before: 160, after: 80 },
        });
      }

      // Bullets
      const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
      if (bullet) {
        return new Paragraph({
          children: [new TextRun({ text: bullet[1].replace(/\*\*/g, ""), size: 22 })],
          bullet: { level: 0 },
          spacing: { after: 60 },
        });
      }

      // Field labels like "SUBJECT A:" / "SSL:" / "CTA:" — bold the label.
      const field = trimmed.match(/^([A-Z][A-Za-z0-9 /()#]{1,28}):\s*(.*)$/);
      if (field) {
        return new Paragraph({
          children: [
            new TextRun({ text: `${field[1]}: `, bold: true, size: 22 }),
            new TextRun({ text: field[2].replace(/\*\*/g, ""), size: 22 }),
          ],
          spacing: { after: 60 },
        });
      }

      return new Paragraph({
        children: [new TextRun({ text: trimmed.replace(/\*\*/g, ""), size: 22 })],
        spacing: { after: 80 },
      });
    });
}

function itemHeading(label: string, n: number, voice?: string): Paragraph {
  const suffix = voice === "guru" ? "  (guru voice)" : "";
  return new Paragraph({
    text: `${label} #${n}${suffix}`,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT } },
  });
}

export async function buildComponentDocx(
  component: GeneratedComponent,
  promoTitle: string
): Promise<Uint8Array> {
  const children: Paragraph[] = [
    new Paragraph({
      text: component.label,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: promoTitle, italics: true, size: 20, color: "666666" }),
        new TextRun({ text: `   |   The Packager`, size: 20, color: "999999" }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
  ];

  if (component.perItem) {
    component.items.forEach((item, i) => {
      children.push(itemHeading(component.label, i + 1, item.voice));
      children.push(...copyToParagraphs(item.text));
    });
  } else {
    children.push(...copyToParagraphs(component.items[0]?.text ?? ""));
  }

  const doc = new Document({
    sections: [{ children }],
    styles: {
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", run: { color: "1E3A5F", bold: true, size: 36 } },
        { id: "Heading2", name: "Heading 2", run: { color: "1E3A5F", bold: true, size: 26 } },
      ],
    },
  });

  return Packer.toBuffer(doc);
}

/** Zip every component of a package into one download. */
export async function buildPackageZip(
  components: GeneratedComponent[],
  promoTitle: string
): Promise<Uint8Array> {
  const zip = new JSZip();
  const folder = zip.folder(safeFilename(promoTitle) || "Copy Package")!;
  let n = 1;
  for (const c of components) {
    if (c.error || c.items.length === 0) continue;
    const bytes = await buildComponentDocx(c, promoTitle);
    const num = String(n).padStart(2, "0");
    folder.file(`${num} - ${safeFilename(c.label)}.docx`, bytes);
    n++;
  }
  const out = await zip.generateAsync({ type: "uint8array" });
  return out;
}
