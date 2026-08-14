import type { EmailProvider } from "../core/types.ts";

export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  provider?: EmailProvider;
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface EmailSendResult {
  sent: boolean;
  provider: EmailProvider;
  message: string;
  status: "draft" | "sent" | "failed";
  requestId?: string;
}

export class EmailClient {
  private readonly provider: EmailProvider;

  constructor(provider: EmailProvider = "mock") {
    this.provider = provider;
  }

  async sendEmail(request: SendEmailRequest): Promise<EmailSendResult> {
    const provider = request.provider ?? this.provider;

    if (provider === "mock") {
      return {
        sent: false,
        provider: "mock",
        status: "draft",
        message: `Draft prepared for ${request.to}. Actual delivery is postponed until the user confirms the message.`,
      };
    }

    if (provider === "webhook") {
      const endpoint = process.env.EMAIL_WEBHOOK_URL;
      if (!endpoint) {
        return {
          sent: false,
          provider: "webhook",
          status: "failed",
          message: "EMAIL_WEBHOOK_URL is not configured.",
        };
      }

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            to: request.to,
            subject: request.subject,
            body: request.body,
            metadata: request.metadata ?? {},
          }),
        });

        if (!response.ok) {
          return {
            sent: false,
            provider: "webhook",
            status: "failed",
            message: `Webhook returned status ${response.status}.`,
          };
        }

        return {
          sent: true,
          provider: "webhook",
          status: "sent",
          message: `Email sent to ${request.to} via webhook.`,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          sent: false,
          provider: "webhook",
          status: "failed",
          message: `Webhook send failed: ${reason}`,
        };
      }
    }

    if (provider === "smtp" || provider === "graph") {
      return {
        sent: false,
        provider,
        status: "draft",
        message: `Provider ${provider} is reserved for real external integration and not enabled in this stage.`,
      };
    }

    return {
      sent: false,
      provider: "mock",
      status: "draft",
      message: `Email processing is currently in draft mode for ${request.to}.`,
    };
  }
}
