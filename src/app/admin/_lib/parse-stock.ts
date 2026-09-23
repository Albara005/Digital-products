// Pure parser shared by the stock upload form (live preview) and its Server Action.
export type StockKind = "CARD" | "SUBSCRIPTION" | "ACCOUNT";

export type ParsedStock = { items: string[]; duplicates: string[] };

export const ACCOUNT_SEPARATOR = "---";

/**
 * CARD / SUBSCRIPTION: every non-empty line is one code.
 * ACCOUNT: items are separated by a line containing only `---`; each item may span several lines.
 * Values are trimmed, blanks skipped, and repeated values reported as duplicates.
 */
export function parseStockInput(text: string, kind: StockKind): ParsedStock {
  const normalized = text.replace(/\r\n?/g, "\n");
  const chunks =
    kind === "ACCOUNT"
      ? normalized.split(/^[ \t]*---[ \t]*$/m).map((block) =>
          block
            .split("\n")
            .map((line) => line.trimEnd())
            .join("\n")
            .trim(),
        )
      : normalized.split("\n").map((line) => line.trim());

  const items = chunks.filter((c) => c.length > 0);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item)) duplicates.add(item);
    else seen.add(item);
  }
  return { items, duplicates: [...duplicates] };
}
