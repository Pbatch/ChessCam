import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Model, ModelOptions } from "@chesscam/recorder";
import modelFile from "../model.json";
import type { ModelRefs } from "../types";

// loadModel resolves or rejects when the test says, so overlapping calls can be checked
const fake = vi.hoisted(() => ({
  calls: [] as (ModelOptions | undefined)[],
  pending: [] as { resolve: (model: Model) => void, reject: (error: unknown) => void }[]
}));

vi.mock("@chesscam/recorder", async (importOriginal) => ({
  ...await importOriginal<typeof import("@chesscam/recorder")>(),
  loadModel: (options?: ModelOptions) => {
    fake.calls.push(options);
    return new Promise<Model>((resolve, reject) => fake.pending.push({ resolve, reject }));
  }
}));

// The module remembers its load, so each test imports a fresh copy
const importFresh = async () => {
  vi.resetModules();
  return (await import("./pieceModel")).loadPieceModelOnce;
}
const emptyRef = (): ModelRefs["modelRef"] => ({ current: null });

beforeEach(() => {
  fake.calls = [];
  fake.pending = [];
  vi.stubGlobal("document", { baseURI: "https://chesscam.example/app/" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadPieceModelOnce", () => {
  it("loads the model named in model.json from the site, and the runtime from node_modules in dev", async () => {
    const loadPieceModelOnce = await importFresh();
    const ref = emptyRef();
    const done = loadPieceModelOnce(ref);
    const model = {} as Model;
    fake.pending[0].resolve(model);
    await done;

    expect(fake.calls).toEqual([{
      modelUrl: `https://chesscam.example/app/models/${modelFile.file}`,
      wasmUrl: "https://chesscam.example/node_modules/@litertjs/core/wasm/"
    }]);
    expect(ref.current).toBe(model);
  });

  it("loads once for overlapping calls, and gives every ref the model", async () => {
    const loadPieceModelOnce = await importFresh();
    const first = emptyRef();
    const second = emptyRef();
    const done = Promise.all([loadPieceModelOnce(first), loadPieceModelOnce(second)]);
    const model = {} as Model;
    fake.pending[0].resolve(model);
    await done;

    expect(fake.calls).toHaveLength(1);
    expect(first.current).toBe(model);
    expect(second.current).toBe(model);
  });

  it("gives a later, empty ref the model already loaded", async () => {
    const loadPieceModelOnce = await importFresh();
    const model = {} as Model;
    const first = loadPieceModelOnce(emptyRef());
    fake.pending[0].resolve(model);
    await first;

    // e.g. App remounted after a hot reload
    const remounted = emptyRef();
    await loadPieceModelOnce(remounted);
    expect(fake.calls).toHaveLength(1);
    expect(remounted.current).toBe(model);
  });

  it("does not load again for a ref that already has a model", async () => {
    const loadPieceModelOnce = await importFresh();
    const model = {} as Model;
    const ref: ModelRefs["modelRef"] = { current: model };
    await loadPieceModelOnce(ref);

    expect(fake.calls).toEqual([]);
    expect(ref.current).toBe(model);
  });

  it("tries again after a failed load", async () => {
    const loadPieceModelOnce = await importFresh();
    const ref = emptyRef();
    const failed = loadPieceModelOnce(ref);
    const error = new Error("offline");
    fake.pending[0].reject(error);
    await expect(failed).rejects.toBe(error);
    expect(ref.current).toBeNull();

    const retried = loadPieceModelOnce(ref);
    const model = {} as Model;
    fake.pending[1].resolve(model);
    await retried;
    expect(fake.calls).toHaveLength(2);
    expect(ref.current).toBe(model);
  });
});
