// The share card of a player: an image drawn on the device, in the colours of the window's theme, for a post (4:5) or
// a story (9:16). Nothing is uploaded: the dialog copies or saves the PNG.

import lensSymbol from "./assets/brand/fm-lens-symbol-120.png";
import { formatDate, formatMoney } from "./format";
import { ATTRIBUTE_LABELS, positionLabel, profileText, shareText, type AttributeKey } from "./labels";
import { GOALKEEPING, isGoalkeeper, MENTAL, PHYSICAL, TECHNICAL } from "./playerAttributes";
import { LOWER_IS_BETTER } from "./ProfileParts";
import type { FmDate, PlayerDetails } from "./types";

export type CardFormat = "post" | "story";

export const CARD_FORMATS: readonly CardFormat[] = ["post", "story"];

export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  post: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

/** Where a shared card sends people: the site counts visits that come with `?s=card`. */
export const CARD_LINK = "getfmlens.com/?s=card";

/** Players up to this age are a "wonderkid" in the caption. */
const WONDERKID_AGE = 21;

export interface CardAttribute {
  key: AttributeKey;
  label: string;
  /** 1–20, as the profile shows it. */
  value: number;
}

/**
 * His best attributes, highest first: from the groups the profile shows him with (Goalkeeping in place of Technical for
 * a keeper), ties in FM's order. Hidden ones, feet and those where lower is better are left out.
 */
export function topAttributes(
  details: Pick<PlayerDetails, "attributes" | "positionRatings">,
  count = 8,
): CardAttribute[] {
  const groups = isGoalkeeper(details) ? [GOALKEEPING, MENTAL, PHYSICAL] : [TECHNICAL, MENTAL, PHYSICAL];
  return [...new Set(groups.flat())]
    .flatMap((key) => {
      const attribute = details.attributes[key];
      return attribute && !LOWER_IS_BETTER.has(key) ? [{ key, label: ATTRIBUTE_LABELS[key], value: attribute.value }] : [];
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, count);
}

/** The text to post with the card. */
export function cardCaption(details: Pick<PlayerDetails, "age">): string {
  const young = details.age !== null && details.age <= WONDERKID_AGE;
  return `${shareText.caption(young)} #FM27 ${CARD_LINK}`;
}

/**
 * The stem of the saved file's name: the player's name in lower-case ASCII letters and digits, the format and the
 * in-game date, "lamine-yamal-post-2026-07-18".
 */
export function cardFileStem(name: string, format: CardFormat, date: FmDate | null): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  const two = (n: number) => String(n).padStart(2, "0");
  const day = date ? `-${date.year}-${two(date.month)}-${two(date.day)}` : "";
  return `${slug || "player"}-${format}${day}`;
}

export interface CardInput {
  details: PlayerDetails;
  gameDate: FmDate | null;
  format: CardFormat;
  showAbility: boolean;
}

/** Draws the card. Waits for the app's font first, so the text is never drawn in a fallback. */
export async function drawCard({ details, gameDate, format, showAbility }: CardInput): Promise<HTMLCanvasElement> {
  const [symbol] = await Promise.all([loadImage(lensSymbol), loadFonts()]);
  const { width, height } = CARD_SIZES[format];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("The card cannot be drawn: no 2D canvas.");
  }
  const colors = palette();
  const story = format === "story";
  // Sizes are for the post; the story is drawn larger, and kept clear of the top and bottom that apps cover.
  const s = story ? 1.18 : 1;
  const margin = 80;
  const top = story ? 230 : 84;
  const bottom = story ? 230 : 72;
  const inner = width - margin * 2;

  ctx.fillStyle = colors.panel;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = colors.accent;
  ctx.fillRect(0, 0, width, 14);
  ctx.textBaseline = "alphabetic";

  const blocks: Block[] = [];

  // Positions and the in-game date.
  const chipHeight = 46 * s;
  const date = formatDate(gameDate);
  blocks.push({
    height: chipHeight,
    gap: 24 * s,
    draw: (y) => {
      ctx.font = font(500, 28 * s);
      ctx.fillStyle = colors.muted;
      ctx.textAlign = "right";
      const dateWidth = date ? ctx.measureText(date).width + 24 : 0;
      if (date) {
        ctx.fillText(date, width - margin, y + chipHeight / 2 + 10 * s);
      }
      ctx.textAlign = "left";
      let x = margin;
      ctx.font = font(700, 26 * s);
      for (const key of details.positions.slice(0, 4)) {
        const label = positionLabel(key);
        const chipWidth = ctx.measureText(label).width + 36 * s;
        if (x + chipWidth > width - margin - dateWidth) {
          break;
        }
        ctx.fillStyle = colors.raised;
        roundRect(ctx, x, y, chipWidth, chipHeight, chipHeight / 2);
        ctx.fillStyle = colors.accent;
        ctx.fillText(label, x + 18 * s, y + chipHeight / 2 + 9 * s);
        x += chipWidth + 12 * s;
      }
    },
  });

  // The name, on up to two lines, and his age and club.
  const name = fitName(ctx, details.name, inner, s);
  const metaSize = 36 * s;
  const meta = [
    details.age === null ? null : shareText.age(details.age),
    details.club ?? profileText.freeAgent,
  ]
    .filter((part) => part !== null)
    .join("  ·  ");
  blocks.push({
    height: name.lines.length * name.lineHeight + 18 * s + metaSize,
    gap: 44 * s,
    draw: (y) => {
      ctx.fillStyle = colors.text;
      ctx.font = font(800, name.size);
      name.lines.forEach((line, i) => ctx.fillText(line, margin, y + name.size * 0.86 + i * name.lineHeight));
      ctx.fillStyle = colors.muted;
      ctx.font = font(500, metaSize);
      const metaY = y + name.lines.length * name.lineHeight + 18 * s + metaSize * 0.8;
      ctx.fillText(ellipsize(ctx, meta, inner), margin, metaY);
    },
  });

  // Current and potential ability.
  if (showAbility) {
    const boxHeight = 150 * s;
    blocks.push({
      height: boxHeight,
      gap: 44 * s,
      draw: (y) => {
        const boxes: [string, number][] = [
          [profileText.currentAbilityShort, details.currentAbility],
          [profileText.potentialAbilityShort, details.potentialAbility],
        ];
        drawBoxes(ctx, colors, boxes.map(([label, value]) => [label, String(value)]), margin, y, inner, boxHeight, s, 72);
      },
    });
  }

  // The best attributes, as bars.
  const attributes = topAttributes(details);
  const rowHeight = 58 * s;
  if (attributes.length > 0) {
    blocks.push({
      height: attributes.length * rowHeight - (rowHeight - 40 * s),
      gap: 44 * s,
      draw: (y) => {
        const labelWidth = 360 * s;
        const valueWidth = 64 * s;
        const barX = margin + labelWidth;
        const barWidth = inner - labelWidth - valueWidth;
        const barHeight = 16 * s;
        attributes.forEach((attribute, i) => {
          const rowY = y + i * rowHeight;
          const middle = rowY + 20 * s;
          const tier = colors.tiers[tierOf(attribute.value)];
          ctx.textAlign = "left";
          ctx.fillStyle = colors.text;
          ctx.font = font(500, 32 * s);
          ctx.fillText(ellipsize(ctx, attribute.label, labelWidth - 24 * s), margin, middle + 11 * s);
          ctx.fillStyle = colors.raised;
          roundRect(ctx, barX, middle - barHeight / 2, barWidth, barHeight, barHeight / 2);
          ctx.fillStyle = tier;
          const filled = Math.max(barHeight, (barWidth * Math.min(attribute.value, 20)) / 20);
          roundRect(ctx, barX, middle - barHeight / 2, filled, barHeight, barHeight / 2);
          ctx.textAlign = "right";
          ctx.font = font(800, 36 * s);
          ctx.fillText(String(attribute.value), width - margin, middle + 13 * s);
        });
        ctx.textAlign = "left";
      },
    });
  }

  // His value and wage, the ones known.
  const facts = moneyFacts(details);
  if (facts.length > 0) {
    const boxHeight = 128 * s;
    blocks.push({
      height: boxHeight,
      gap: 0,
      draw: (y) => drawBoxes(ctx, colors, facts, margin, y, inner, boxHeight, s, 46),
    });
  }

  // The footer: always there, and quiet.
  const footerSize = 28 * s;
  const footerY = height - bottom;
  const iconSize = 44 * s;
  ctx.font = font(500, footerSize);
  const footer = shareText.footer;
  const footerWidth = (symbol ? iconSize + 16 * s : 0) + ctx.measureText(footer).width;
  let footerX = (width - footerWidth) / 2;
  if (symbol) {
    ctx.globalAlpha = 0.85;
    ctx.drawImage(symbol, footerX, footerY - iconSize * 0.78, iconSize, iconSize);
    ctx.globalAlpha = 1;
    footerX += iconSize + 16 * s;
  }
  ctx.fillStyle = colors.muted;
  ctx.fillText(footer, footerX, footerY);

  // The blocks from the top, their gaps widened evenly into the room left above the footer.
  const room = footerY - iconSize - 40 * s - top;
  const used = blocks.reduce((sum, block) => sum + block.height + block.gap, 0);
  const gaps = blocks.length - 1;
  const extra = gaps > 0 ? Math.min(Math.max(0, room - used) / gaps, 120 * s) : 0;
  let y = top;
  for (const block of blocks) {
    block.draw(y);
    y += block.height + block.gap + extra;
  }
  return canvas;
}

/** The card as a PNG. */
export function cardBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The card could not be made into a PNG."))), "image/png");
  });
}

interface Block {
  height: number;
  /** The space under it, before any room left over is shared out. */
  gap: number;
  draw: (y: number) => void;
}

interface Palette {
  panel: string;
  raised: string;
  text: string;
  muted: string;
  accent: string;
  tiers: [string, string, string, string];
}

/** The colours of the theme the window shows now. */
function palette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    panel: read("--panel", "#ffffff"),
    raised: read("--raised", "#f4f5f9"),
    text: read("--text", "#191b28"),
    muted: read("--muted", "#586174"),
    accent: read("--accent", "#8338c4"),
    tiers: [
      read("--tier-1", "#b3402f"),
      read("--tier-2", "#8f5d0e"),
      read("--tier-3", "#5a761b"),
      read("--tier-4", "#1f7547"),
    ],
  };
}

/** The band of a 1–20 value, as `tierClass` colours it: 0 for 1–5 up to 3 for 16–20. */
function tierOf(value: number): 0 | 1 | 2 | 3 {
  return value <= 5 ? 0 : value <= 10 ? 1 : value <= 15 ? 2 : 3;
}

function font(weight: number, size: number): string {
  return `${weight} ${Math.round(size)}px "Archivo Variable", system-ui, -apple-system, "Segoe UI", sans-serif`;
}

async function loadFonts(): Promise<void> {
  try {
    await Promise.all([500, 600, 700, 800].map((weight) => document.fonts.load(font(weight, 40))));
  } catch {
    // The card is drawn in the fallback font.
  }
}

/** The image at `src` once loaded, or null when it cannot be: the card is then drawn without it. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** Value and wage, as label and text, leaving out the ones not known. */
function moneyFacts(details: PlayerDetails): [string, string][] {
  const compact = { notation: "compact", maximumFractionDigits: 1 } as const;
  const facts: [string, string][] = [];
  const value = details.transferValue;
  if (value != null && value > 0) {
    facts.push([shareText.value, formatMoney(value, compact)]);
  }
  if (details.contract && details.contract.wage > 0) {
    facts.push([shareText.wage, `${formatMoney(details.contract.wage, compact)} ${shareText.perWeek}`]);
  }
  return facts;
}

/** Boxes side by side, each a small label over a large value. */
function drawBoxes(
  ctx: CanvasRenderingContext2D,
  colors: Palette,
  boxes: [string, string][],
  x: number,
  y: number,
  width: number,
  height: number,
  s: number,
  valueSize: number,
): void {
  const gap = 24 * s;
  const boxWidth = (width - gap * (boxes.length - 1)) / boxes.length;
  const pad = 28 * s;
  boxes.forEach(([label, value], i) => {
    const boxX = x + i * (boxWidth + gap);
    ctx.fillStyle = colors.raised;
    roundRect(ctx, boxX, y, boxWidth, height, 20 * s);
    ctx.textAlign = "left";
    ctx.fillStyle = colors.muted;
    ctx.font = font(600, 26 * s);
    ctx.fillText(ellipsize(ctx, label, boxWidth - pad * 2), boxX + pad, y + pad + 20 * s);
    ctx.fillStyle = colors.text;
    ctx.font = font(800, valueSize * s);
    ctx.fillText(ellipsize(ctx, value, boxWidth - pad * 2), boxX + pad, y + height - pad);
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.min(radius, height / 2, width / 2));
  ctx.fill();
}

/** `text` cut with "…" to fit `max` in the current font. */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) {
    return text;
  }
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

/** The largest size the name fits at on up to two lines, wrapped between words; cut with "…" at the smallest. */
function fitName(ctx: CanvasRenderingContext2D, name: string, max: number, s: number) {
  const words = name.split(/\s+/).filter(Boolean);
  for (let size = 92 * s; size >= 60 * s; size -= 4 * s) {
    ctx.font = font(800, size);
    const lines = wrap(ctx, words, max);
    if (lines.length <= 2 && lines.every((line) => ctx.measureText(line).width <= max)) {
      return { size, lineHeight: size * 1.04, lines };
    }
  }
  const size = 60 * s;
  ctx.font = font(800, size);
  const [first = "", ...rest] = wrap(ctx, words, max);
  const lines = rest.length > 0 ? [ellipsize(ctx, first, max), ellipsize(ctx, rest.join(" "), max)] : [ellipsize(ctx, first, max)];
  return { size, lineHeight: size * 1.04, lines };
}

function wrap(ctx: CanvasRenderingContext2D, words: string[], max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}
