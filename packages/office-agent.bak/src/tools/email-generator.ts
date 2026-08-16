import type { EmailDraft } from "../core/types.ts";
import { makeId, nowIso } from "../utils.ts";

export function createEmailDraft(
	to: string,
	subjectHint: string,
	bodyContext: string,
	tone: EmailDraft["tone"] = "professional",
): EmailDraft {
	const subject = subjectHint.trim() || "Follow-up on recent office update";
	const body = buildEmailBody(bodyContext, tone);

	return {
		id: makeId("email"),
		to,
		subject,
		body,
		tone,
		createdAt: nowIso(),
	};
}

function buildEmailBody(context: string, tone: EmailDraft["tone"]): string {
	const lead = {
		professional: "Hello,\n\nThank you for your time and attention.\n\n",
		friendly: "Hi there,\n\nThanks for your attention and support.\n\n",
		concise: "Hi,\n\n",
	}[tone];

	const closing = {
		professional: "\n\nBest regards,\nOffice Agent",
		friendly: "\n\nThanks again,\nOffice Agent",
		concise: "\n\nRegards,\nOffice Agent",
	}[tone];

	return `${lead}${context.trim() || "Here is a quick update and next step summary."}${closing}`;
}
