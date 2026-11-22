import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Model, ReadPositionResult } from "@chesscam/recorder";
import { useStore } from "../store";
import type { Roi } from "../types";

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

// readPosition answers with whatever the test sets, and records what it was asked
const fake = vi.hoisted(() => ({
  result: null as ReadPositionResult | null,
  calls: [] as unknown[][],
  ready: true
}));

vi.mock("@chesscam/recorder", async (importOriginal) => ({
  ...await importOriginal<typeof import("@chesscam/recorder")>(),
  videoReady: () => fake.ready,
  readPosition: (...args: unknown[]) => {
    fake.calls.push(args);
    return Promise.resolve(fake.result);
  }
}));

const { findFen } = await import("./findFen");

const model = {} as Model;
const video = {} as HTMLVideoElement;
const roi: Roi = { x: 10, y: 20, width: 300, height: 200 };

const run = (overrides: Partial<Parameters<typeof findFen>[0]> = {}) => {
  const setText = vi.fn();
  const done = findFen({
    modelRef: { current: model }, videoRef: { current: video }, roi, setText, color: "white", ...overrides
  });
  return { setText, done };
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true);
  fake.result = null;
  fake.calls = [];
  fake.ready = true;
});

describe("findFen", () => {
  it("starts a new game from the position it reads", async () => {
    fake.result = { ok: true, fen: AFTER_E4 } as ReadPositionResult;
    const { setText, done } = run({ color: "black" });
    await done;

    expect(fake.calls).toEqual([[model, video, roi, "black"]]);
    expect(useStore.getState().game.start).toBe(AFTER_E4);
    expect(useStore.getState().game.fen).toBe(AFTER_E4);
    expect(setText).toHaveBeenCalledWith(["Set starting FEN"]);
  });

  it.each([
    ["empty", "Board is empty"],
    ["kings", "Each side needs exactly one king"],
    ["opposite-check", "Side to move has opponent in check"],
    ["pawns-on-backrank", "Pawns on the first or last rank"]
  ] as const)("explains an illegal position (%s) and keeps the game", async (problem, text) => {
    const before = useStore.getState().game;
    fake.result = { ok: false, problem } as ReadPositionResult;
    const { setText, done } = run();
    await done;

    expect(setText).toHaveBeenCalledWith(["Invalid FEN:", text]);
    expect(useStore.getState().game).toBe(before);
  });

  it("does nothing until the model has loaded", async () => {
    const { setText, done } = run({ modelRef: { current: null } });
    await done;

    expect(fake.calls).toEqual([]);
    expect(setText).not.toHaveBeenCalled();
  });

  it("does nothing until the video has a frame", async () => {
    fake.ready = false;
    const { setText, done } = run();
    await done;

    expect(fake.calls).toEqual([]);
    expect(setText).not.toHaveBeenCalled();
  });
});
