/** A delivery the sender has to fix, such as one missing a required field; it's answered with 400. */
export class InvalidWebhookPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidWebhookPayloadError'
  }
}
