/// <reference types="node" />
import fontkit from "@pdf-lib/fontkit";
import * as mupdf from "mupdf";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { degrees, PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Test fixture definitions (spec §50). Used in-memory by tests and written to test-pdfs/
 * by scripts/make-fixtures.ts. Every text line carries ground truth for detection tests.
 */

export interface FixtureLine {
  text: string;
  x: number;
  /** Baseline y in PDF user space. */
  y: number;
  size?: number;
  bold?: boolean;
  /** Ground truth: is this line Vietnamese-language content? */
  vi: boolean;
  /** Draw each word as a separate text object (as many PDF producers do). */
  fragmented?: boolean;
  /** Text rotation in degrees (counter-clockwise). */
  rotate?: number;
}

export interface FixturePage {
  size?: [number, number];
  rotate?: 0 | 90 | 180 | 270;
  lines: FixtureLine[];
  /** Image-only content (simulated scan). */
  scannedImage?: boolean;
}

export interface Fixture {
  name: string;
  pages: FixturePage[];
  /** Rasterize every page into an image-only page at this resolution (simulated scan). */
  scanDpi?: number;
}

const FONT_DIR = new URL("../fonts/", import.meta.url);
const L = 72;

const fixtures: Fixture[] = [
  {
    name: "english-only",
    pages: [
      {
        lines: [
          { text: "Project Overview", x: L, y: 720, size: 22, bold: true, vi: false },
          { text: "The goal of this project is to improve the inspection system.", x: L, y: 684, vi: false },
          { text: "Target luminance: 500 nit", x: L, y: 664, vi: false },
          { text: "Owner: Quality Engineering", x: L, y: 644, vi: false },
          { text: "Schedule and milestones are listed below.", x: L, y: 614, vi: false, fragmented: true },
        ],
      },
    ],
  },
  {
    name: "vietnamese-only",
    pages: [
      {
        lines: [
          { text: "Tổng quan dự án", x: L, y: 720, size: 22, bold: true, vi: true },
          { text: "Mục tiêu của dự án là cải thiện hệ thống kiểm tra.", x: L, y: 684, vi: true },
          { text: "Người phụ trách: Nguyễn Văn A", x: L, y: 664, vi: true },
          { text: "Kế hoạch thực hiện được trình bày dưới đây.", x: L, y: 644, vi: true, fragmented: true },
          { text: "Các bước kiểm tra phải được hoàn thành trước khi bàn giao.", x: L, y: 624, vi: true },
        ],
      },
    ],
  },
  {
    name: "mixed-en-vi",
    pages: [
      {
        lines: [
          { text: "Project Overview", x: L, y: 720, size: 22, bold: true, vi: false },
          { text: "Mục tiêu của dự án là cải thiện hệ thống.", x: L, y: 684, vi: true },
          { text: "Target luminance: 500 nit", x: L, y: 660, vi: false },
          { text: "Người phụ trách: Nguyễn Văn A", x: L, y: 636, vi: true },
        ],
      },
    ],
  },
  {
    name: "technical-mixed-language",
    pages: [
      {
        lines: [
          { text: "Inspection Notes", x: L, y: 720, size: 18, bold: true, vi: false },
          { text: "Panel bị lỗi mura", x: L, y: 690, vi: true },
          { text: "Kiểm tra gamma value", x: L, y: 670, vi: true },
          { text: "Upload file lên server", x: L, y: 650, vi: true },
          { text: "Check panel trước khi chạy test", x: L, y: 630, vi: true },
          { text: "Gamma 2.2, white point D65", x: L, y: 610, vi: false },
          { text: "Nguyen Van A", x: L, y: 580, vi: false },
          { text: "LG Display Vietnam", x: L, y: 560, vi: false },
          { text: "Hai Phong", x: L, y: 540, vi: false },
          { text: "Samsung Vietnam", x: L, y: 520, vi: false },
        ],
      },
    ],
  },
  {
    name: "two-column",
    pages: [
      {
        lines: [
          { text: "Specification", x: L, y: 720, size: 12, bold: true, vi: false },
          { text: "Thông số kỹ thuật", x: 320, y: 720, size: 12, bold: true, vi: true },
          { text: "Brightness must exceed 500 nit.", x: L, y: 700, vi: false },
          { text: "Độ sáng phải lớn hơn 500 nit.", x: 320, y: 700, vi: true },
          { text: "Measure after warm-up.", x: L, y: 680, vi: false },
          { text: "Đo sau khi làm nóng máy.", x: 320, y: 680, vi: true },
        ],
      },
    ],
  },
  {
    name: "multi-page",
    pages: Array.from({ length: 10 }, (_, i) => ({
      lines:
        i % 3 === 2
          ? [{ text: `Appendix ${i + 1}: raw measurement data`, x: L, y: 720, vi: false }]
          : [
              { text: `Section ${i + 1}`, x: L, y: 720, size: 18, bold: true, vi: false },
              { text: `Nội dung của phần ${i + 1} được viết bằng tiếng Việt.`, x: L, y: 690, vi: true },
              { text: `Result ${i + 1}: PASS`, x: L, y: 670, vi: false },
            ],
    })),
  },
  {
    name: "rotated-page",
    pages: [
      {
        rotate: 90,
        lines: [
          { text: "Rotated Page Title", x: L, y: 720, size: 18, bold: true, vi: false },
          { text: "Trang này được xoay chín mươi độ.", x: L, y: 690, vi: true },
        ],
      },
      {
        lines: [
          { text: "Vertical label", x: 100, y: 200, rotate: 90, vi: false },
          { text: "Nhãn dọc tiếng Việt", x: 140, y: 200, rotate: 90, vi: true },
          { text: "Diagonal note", x: 300, y: 300, rotate: 45, vi: false },
        ],
      },
    ],
  },
  {
    // Image-only pages with real text: exercises OCR → detection → masking → pixel redaction.
    name: "scanned-mixed",
    scanDpi: 150,
    pages: [
      {
        lines: [
          { text: "Project Overview", x: L, y: 720, size: 20, bold: true, vi: false },
          { text: "Mục tiêu của dự án là cải thiện hệ thống.", x: L, y: 680, size: 13, vi: true },
          { text: "Target luminance: 500 nit", x: L, y: 650, size: 13, vi: false },
          { text: "Người phụ trách: Nguyễn Văn A", x: L, y: 620, size: 13, vi: true },
          { text: "Kiểm tra gamma value", x: L, y: 590, size: 13, vi: true },
          { text: "Gamma 2.2, white point D65", x: L, y: 560, size: 13, vi: false },
        ],
      },
    ],
  },
  {
    name: "scanned-page",
    pages: [
      { lines: [{ text: "Cover page with a text layer", x: L, y: 720, vi: false }] },
      { lines: [], scannedImage: true },
    ],
  },
];

export function listFixtures(): Fixture[] {
  return fixtures;
}

export function getFixture(name: string): Fixture {
  const f = fixtures.find((x) => x.name === name);
  if (!f) throw new Error(`Unknown fixture: ${name}`);
  return f;
}

export async function buildFixture(fixture: Fixture | string): Promise<Uint8Array> {
  const spec = typeof fixture === "string" ? getFixture(fixture) : fixture;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Fonts are pre-subset to Latin + Vietnamese with pyftsubset (see tests/fonts/README.md).
  // pdf-lib's own subsetting corrupts glyphs when rendered, so embed whole (subset: false).
  // ccmp off: otherwise fontkit decomposes letters like "ụ" into "u" + mark glyphs, and the
  // shared "u" glyph's ToUnicode entry loses the diacritic ("Mục" extracts as "Muc").
  const fontOptions = { subset: false, features: { ccmp: false } };
  const regular = await doc.embedFont(readFileSync(new URL("NotoSansVi-Regular.ttf", FONT_DIR)), fontOptions);
  const bold = await doc.embedFont(readFileSync(new URL("NotoSansVi-Bold.ttf", FONT_DIR)), fontOptions);
  doc.setTitle(spec.name);
  doc.setProducer("vimask fixtures");
  doc.setCreator("vimask fixtures");

  for (const pageSpec of spec.pages) {
    const page = doc.addPage(pageSpec.size ?? [612, 792]);
    if (pageSpec.rotate) page.setRotation(degrees(pageSpec.rotate));
    for (const line of pageSpec.lines) drawLine(page, line, line.bold ? bold : regular);
    if (pageSpec.scannedImage) {
      const png = await doc.embedPng(makeScanPng(400, 520));
      page.drawImage(png, { x: 56, y: 100, width: 500, height: 650 });
    }
  }
  const bytes = await doc.save({ useObjectStreams: false });
  return spec.scanDpi ? rasterize(bytes, spec.scanDpi) : bytes;
}

/** Renders each page to a PNG and builds a new PDF containing only those images. */
async function rasterize(bytes: Uint8Array, dpi: number): Promise<Uint8Array> {
  const source = mupdf.Document.openDocument(bytes, "application/pdf");
  const out = await PDFDocument.create();
  for (let i = 0; i < source.countPages(); i++) {
    const page = source.loadPage(i);
    const [x0, y0, x1, y1] = page.getBounds();
    const scale = dpi / 72;
    const png = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceGray, false).asPNG();
    const image = await out.embedPng(png);
    const target = out.addPage([x1 - x0, y1 - y0]);
    target.drawImage(image, { x: 0, y: 0, width: x1 - x0, height: y1 - y0 });
  }
  return out.save({ useObjectStreams: false });
}

function drawLine(page: PDFPage, line: FixtureLine, font: PDFFont) {
  const size = line.size ?? 12;
  const rotate = line.rotate ? degrees(line.rotate) : undefined;
  // Draw NFC text (NFD makes PDF.js report wrong advances for combining marks).
  const text = line.text.normalize("NFC");
  if (!line.fragmented) {
    page.drawText(text, { x: line.x, y: line.y, size, font, rotate });
    return;
  }
  const t = ((line.rotate ?? 0) * Math.PI) / 180;
  let offset = 0;
  const space = font.widthOfTextAtSize(" ", size);
  for (const word of text.split(" ")) {
    page.drawText(word, {
      x: line.x + offset * Math.cos(t),
      y: line.y + offset * Math.sin(t),
      size,
      font,
      rotate,
    });
    offset += font.widthOfTextAtSize(word, size) + space;
  }
}

/** A grayscale "scan": light paper with dark bars where text lines would be. */
function makeScanPng(width: number, height: number): Uint8Array {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width + 1);
    raw[row] = 0; // filter: none
    const inTextBand = y > 40 && y % 28 < 10 && y < height - 60;
    for (let x = 0; x < width; x++) {
      const inLine = inTextBand && x > 30 && x < width - 30 - ((y * 7) % 120);
      raw[row + 1 + x] = inLine ? 40 : 235;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
