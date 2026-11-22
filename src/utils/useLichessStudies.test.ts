// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Study } from "../types";

// Each load waits until the test finishes it, so loads can overlap in a chosen order
type Load = {
  token: string, username: string, onlyBroadcasts: boolean,
  setStudies: (studies: Study[]) => void, resolve: () => void, reject: (error: unknown) => void
};
const fake = vi.hoisted(() => ({ loads: [] as Load[] }));

vi.mock("../api/lichess", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api/lichess")>(),
  lichessSetStudies: (token: string, setStudies: (studies: Study[]) => void, username: string, onlyBroadcasts: boolean) =>
    new Promise<void>((resolve, reject) => {
      fake.loads.push({ token, username, onlyBroadcasts, setStudies, resolve, reject });
    })
}));

const { useLichessStudies } = await import("./useLichessStudies");
const { LichessError } = await import("../api/lichess");

const STUDIES: Study[] = [{ id: "abc", name: "My study" }];
const BROADCASTS: Study[] = [{ id: "xyz", name: "Round 1" }];

const render = (token: string, username: string, onlyBroadcasts: boolean) =>
  renderHook(({ token, username, onlyBroadcasts }) => useLichessStudies(token, username, onlyBroadcasts), {
    initialProps: { token, username, onlyBroadcasts }
  });

beforeEach(() => {
  fake.loads = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLichessStudies", () => {
  it("loads nothing while signed out", () => {
    const { result } = render("", "", false);

    expect(fake.loads).toEqual([]);
    expect(result.current).toEqual({ studies: [], loadError: null });
  });

  it("loads the user's studies", async () => {
    const { result } = render("token", "alice", false);
    expect(fake.loads).toHaveLength(1);
    expect(fake.loads[0]).toMatchObject({ token: "token", username: "alice", onlyBroadcasts: false });

    await act(async () => {
      fake.loads[0].setStudies(STUDIES);
      fake.loads[0].resolve();
    });
    expect(result.current).toEqual({ studies: STUDIES, loadError: null });
  });

  it("shows why a load failed", async () => {
    const { result } = render("token", "alice", false);

    await act(async () => {
      fake.loads[0].reject(new LichessError(401, "Unauthorized"));
    });
    await waitFor(() => expect(result.current.loadError).toBe(
      "Your Lichess sign-in has expired. Please sign in again."
    ));
    expect(result.current.studies).toEqual([]);
  });

  it("clears an earlier error once a load succeeds", async () => {
    const { result, rerender } = render("token", "alice", false);
    await act(async () => {
      fake.loads[0].reject(new TypeError("Failed to fetch"));
    });
    await waitFor(() => expect(result.current.loadError).not.toBeNull());

    rerender({ token: "token", username: "alice", onlyBroadcasts: true });
    await act(async () => {
      fake.loads[1].setStudies(BROADCASTS);
      fake.loads[1].resolve();
    });
    expect(result.current).toEqual({ studies: BROADCASTS, loadError: null });
  });

  it("loads again when the user or the setting changes", () => {
    const { rerender } = render("token", "alice", false);
    rerender({ token: "token", username: "alice", onlyBroadcasts: true });
    rerender({ token: "other", username: "bob", onlyBroadcasts: true });

    expect(fake.loads.map(({ token, username, onlyBroadcasts }) => [token, username, onlyBroadcasts])).toEqual([
      ["token", "alice", false],
      ["token", "alice", true],
      ["other", "bob", true]
    ]);
  });

  it("keeps only the latest load when an earlier one finishes after it", async () => {
    const { result, rerender } = render("token", "alice", false);
    rerender({ token: "token", username: "alice", onlyBroadcasts: true });
    const [stale, latest] = fake.loads;

    await act(async () => {
      latest.setStudies(BROADCASTS);
      latest.resolve();
    });
    await act(async () => {
      stale.setStudies(STUDIES);
      stale.reject(new TypeError("Failed to fetch"));
    });
    expect(result.current).toEqual({ studies: BROADCASTS, loadError: null });
  });
});
