import { Connection } from "@solana/web3.js";
import { getRpcUrls } from "./config";

class RpcPool {
  private index = 0;
  private readonly connections = new Map<string, Connection>();

  constructor(private readonly urls: string[]) {}

  get size(): number {
    return this.urls.length;
  }

  currentUrl(): string {
    return this.urls[this.index % this.urls.length];
  }

  connection(): Connection {
    const url = this.currentUrl();
    let conn = this.connections.get(url);
    if (!conn) {
      conn = new Connection(url, {
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 120_000,
        disableRetryOnRateLimit: true,
      });
      this.connections.set(url, conn);
    }
    return conn;
  }

  rotate(): void {
    this.index = (this.index + 1) % this.urls.length;
  }
}

let pool: RpcPool | null = null;

export function getRpcPool(): RpcPool {
  if (!pool) {
    pool = new RpcPool(getRpcUrls());
  }
  return pool;
}
