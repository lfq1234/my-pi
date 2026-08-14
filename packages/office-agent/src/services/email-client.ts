export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
}

export interface EmailSendResult {
  sent: boolean;
  provider: string;
  message: string;
}

export class EmailClient {
  constructor(private readonly provider: string = "mock") {}

  async sendEmail(request: SendEmailRequest): Promise<EmailSendResult> {
    if (this.provider === "mock") {
      return {
        sent: false,
        provider: "mock",
        message: `Draft prepared for ${request.to}. Actual delivery is postponed for later stages.`,
      };
    }

    return {
      sent: true,
      provider: this.provider,
      message: `Email sent to ${request.to}`,
    };
  }
}
