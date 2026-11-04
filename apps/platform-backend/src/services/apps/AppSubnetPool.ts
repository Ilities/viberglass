const FULL = 0xffffffff;

function toNumber(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    value = value * 256 + Number(part);
  }
  return value;
}

function toAddress(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

interface Cidr {
  base: number;
  prefix: number;
}

function parse(cidr: string): Cidr | null {
  const [address, bits] = cidr.trim().split("/");
  const base = address ? toNumber(address) : null;
  const prefix = Number(bits);
  if (base === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (FULL << (32 - prefix)) >>> 0;
  return { base: (base & mask) >>> 0, prefix };
}

/**
 * The private range app networks take their /24s from. A fixed range lets one
 * set of host firewall rules tell app traffic apart.
 */
export class AppSubnetPool {
  private readonly pool: Cidr;

  constructor(cidr: string) {
    const pool = parse(cidr);
    if (!pool || pool.prefix > 24) throw new Error(`APPS_NETWORK_POOL must be an IPv4 range of /24 or larger, such as 10.250.0.0/16; got ${cidr}`);
    this.pool = pool;
  }

  contains(subnet: string): boolean {
    const cidr = parse(subnet);
    if (!cidr || cidr.prefix < this.pool.prefix) return false;
    const size = 2 ** (32 - this.pool.prefix);
    return cidr.base >= this.pool.base && cidr.base < this.pool.base + size;
  }

  /** The first /24 in the pool that no network in `used` overlaps; null when the pool is full. */
  free(used: string[]): string | null {
    const taken = used.map(parse).filter((cidr): cidr is Cidr => cidr !== null);
    const count = 2 ** (24 - this.pool.prefix);
    for (let index = 0; index < count; index++) {
      const base = this.pool.base + index * 256;
      const overlaps = taken.some((cidr) => {
        const size = 2 ** (32 - cidr.prefix);
        return base < cidr.base + size && cidr.base < base + 256;
      });
      if (!overlaps) return `${toAddress(base)}/24`;
    }
    return null;
  }
}
