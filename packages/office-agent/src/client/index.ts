export class RemoteSessionPlaceholder {
  static async create(): Promise<RemoteSessionPlaceholder> {
    return new RemoteSessionPlaceholder();
  }

  async submit(_text: string): Promise<void> {
    return;
  }

  subscribe(_listener: (state: unknown) => void): () => void {
    return () => {};
  }
}
