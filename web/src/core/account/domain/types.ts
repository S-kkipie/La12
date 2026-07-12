import { z } from "zod";
import { linkedWalletSchema } from "./schemas";

export type LinkedWallet = z.infer<typeof linkedWalletSchema>;

/** Matches Unicode combining diacritical marks (U+0300–U+036F) so accents
 *  dropped by NFD normalization (e.g. "í" → "i" + mark) get stripped. */
const COMBINING_MARKS = /[̀-ͯ]/gu;

/** Slugify a club name: strip accents, lowercase, dash-separate, trim dashes.
 *  Empty result falls back to "club". Moved verbatim out of the legacy
 *  app/api/account/wallet route. */
export function slugify(name: string): string {
  const noAccents = name.normalize("NFD").replace(COMBINING_MARKS, "");
  const dashed = noAccents.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return dashed.replace(/(^-+|-+$)/g, "") || "club";
}
