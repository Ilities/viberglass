import { ExpiringCache } from "../../../../services/apps/ExpiringCache";

describe("ExpiringCache", () => {
  it("forgets values once their time is up", () => {
    let now = 0;
    const cache = new ExpiringCache<string | null>(1_000, 10, () => now);
    cache.set("a", null);

    expect(cache.get("a")).toBeNull();
    now = 1_000;
    expect(cache.get("a")).toBeUndefined();
  });

  it("makes room by dropping the least recently used value", () => {
    const cache = new ExpiringCache<number>(1_000, 2, () => 0);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);

    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
  });
});
