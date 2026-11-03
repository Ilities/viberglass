import { demuxDockerLogs } from "../../../../services/apps/demuxDockerLogs";

function frame(stream: 1 | 2, text: string): Buffer {
  const body = Buffer.from(text);
  const header = Buffer.alloc(8);
  header[0] = stream;
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

describe("demuxDockerLogs", () => {
  it("joins stdout and stderr frames in order", () => {
    expect(demuxDockerLogs(Buffer.concat([frame(1, "listening\n"), frame(2, "warning\n"), frame(1, "ok\n")]))).toBe("listening\nwarning\nok\n");
  });

  it("passes plain output through", () => {
    expect(demuxDockerLogs(Buffer.from("plain output\n"))).toBe("plain output\n");
  });
});
