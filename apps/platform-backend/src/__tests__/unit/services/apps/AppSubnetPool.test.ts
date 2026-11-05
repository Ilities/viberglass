import { AppSubnetPool } from "../../../../services/apps/AppSubnetPool";

describe("AppSubnetPool", () => {
  const pool = new AppSubnetPool("10.250.0.0/16");

  it("hands out the first /24 no network uses", () => {
    expect(pool.free([])).toBe("10.250.0.0/24");
    expect(pool.free(["10.250.0.0/24", "10.250.1.0/24", "172.18.0.0/16"])).toBe("10.250.2.0/24");
    expect(pool.free(["10.250.0.0/23"])).toBe("10.250.2.0/24");
  });

  it("knows which subnets are its own", () => {
    expect(pool.contains("10.250.7.0/24")).toBe(true);
    expect(pool.contains("172.25.0.0/16")).toBe(false);
    expect(pool.contains("10.0.0.0/8")).toBe(false);
  });

  it("says when it's full, and refuses a range too small or not IPv4", () => {
    expect(new AppSubnetPool("10.250.0.0/24").free(["10.250.0.0/24"])).toBeNull();
    expect(() => new AppSubnetPool("10.250.0.0/25")).toThrow(/APPS_NETWORK_POOL/);
    expect(() => new AppSubnetPool("fd00::/64")).toThrow(/APPS_NETWORK_POOL/);
  });

  it("knows which connection addresses come from an app network", () => {
    const pool = new AppSubnetPool("10.250.0.0/16");

    expect(pool.containsAddress("10.250.3.7")).toBe(true);
    expect(pool.containsAddress("::ffff:10.250.0.2")).toBe(true);
    expect(pool.containsAddress("10.251.0.1")).toBe(false);
    expect(pool.containsAddress("172.18.0.5")).toBe(false);
    expect(pool.containsAddress("::1")).toBe(false);
    expect(pool.containsAddress(undefined)).toBe(false);
  });
});
