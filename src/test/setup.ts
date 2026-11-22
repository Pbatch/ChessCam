import { beforeEach } from "vitest";
import { MemoryStorage } from "./helpers";

// Node has no Web Storage, and the store saves to localStorage on every change. jsdom tests have their own.
if (typeof window === "undefined") {
  globalThis.localStorage = new MemoryStorage();
}

beforeEach(() => {
  localStorage.clear();
});
