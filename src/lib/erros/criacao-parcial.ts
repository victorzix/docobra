export class CriacaoParcialError extends Error {
  constructor(
    message: string,
    public readonly id: string,
  ) {
    super(message);
    this.name = "CriacaoParcialError";
  }
}
