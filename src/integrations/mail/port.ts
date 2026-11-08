export interface MailPort {
  sendInvitation(input: { recipient: string; url: string }): Promise<void>;
}
