import { buildMediaContentUrl } from "../../../services/ticket-media/publicApiUrl";

it("gives browsers public media URLs while keeping callbacks on the internal API", () => {
  const previous = process.env;
  process.env = { ...previous, PLATFORM_API_URL: "http://backend:3000", PLATFORM_PUBLIC_API_URL: "https://viberglass.example/" };
  try { expect(buildMediaContentUrl("media-1")).toBe("https://viberglass.example/api/tasks/media/media-1/content"); }
  finally { process.env = previous; }
});
