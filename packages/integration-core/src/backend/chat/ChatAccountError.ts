/** Why a person's chat account can't be linked; the message tells them what to do. */
export class ChatAccountError extends Error {
  constructor(
    /** 404 when there's no such account, 409 when the service's setup is in the way. */
    readonly status: 404 | 409,
    message: string,
  ) {
    super(message)
    this.name = 'ChatAccountError'
  }
}
