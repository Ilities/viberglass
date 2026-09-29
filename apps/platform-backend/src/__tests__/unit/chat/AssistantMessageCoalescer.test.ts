import { AssistantMessageCoalescer } from "../../../chat/AssistantMessageCoalescer";

describe("AssistantMessageCoalescer", () => {
  it("joins streamed chunks into one message", () => {
    const coalescer = new AssistantMessageCoalescer();
    coalescer.append("The repo");
    coalescer.append(" uses Vite");
    coalescer.append(".");

    expect(coalescer.flush()).toBe("The repo uses Vite.");
  });

  it("clears the buffer when flushed", () => {
    const coalescer = new AssistantMessageCoalescer();
    coalescer.append("First");
    coalescer.flush();

    expect(coalescer.flush()).toBeNull();
  });

  it("has nothing to post for whitespace-only chunks", () => {
    const coalescer = new AssistantMessageCoalescer();
    coalescer.append("\n\n");

    expect(coalescer.flush()).toBeNull();
  });
});
