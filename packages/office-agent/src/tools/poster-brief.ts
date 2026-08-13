import { makeId, nowIso } from "../utils.ts";
import type { PosterBrief } from "../core/types.ts";

export function createPosterBrief(
  theme: string,
  audience: string,
  style: string,
  extraContext?: string,
): PosterBrief {
  const prompt = [
    `Create a high-quality poster for: ${theme}`,
    `Target audience: ${audience}`,
    `Visual style: ${style}`,
    extraContext ? `Additional context: ${extraContext}` : "",
    "Use clear layout, modern aesthetic, strong headline, and high contrast modern design.",
  ]
    .filter(Boolean)
    .join(". ");

  return {
    id: makeId("poster"),
    theme,
    audience,
    style,
    prompt,
    status: "draft",
    createdAt: nowIso(),
  };
}
