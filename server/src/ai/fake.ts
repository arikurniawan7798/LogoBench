import { AiError, type GenerateRequest, type Provider } from "./provider.js";

/** Test helper: returns queued responses (validated through the request schema) and records calls. */
export class FakeProvider implements Provider {
  readonly name = "fake";
  readonly model = "fake-model";
  readonly calls: GenerateRequest<unknown>[] = [];
  private queue: unknown[];
  constructor(responses: unknown[] = []) {
    this.queue = [...responses];
  }
  get callCount(): number {
    return this.calls.length;
  }
  enqueue(...responses: unknown[]): void {
    this.queue.push(...responses);
  }
  async generateJson<T>(req: GenerateRequest<T>): Promise<T> {
    this.calls.push(req as GenerateRequest<unknown>);
    if (this.queue.length === 0) throw new Error("FakeProvider: no queued response");
    const parsed = req.schema.safeParse(this.queue.shift());
    if (!parsed.success) throw new AiError("BAD_OUTPUT", `FakeProvider response failed validation: ${parsed.error.issues[0]?.message}`);
    return parsed.data;
  }
}
