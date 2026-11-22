// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCamera } from "./useCamera";
import { MEDIA_CONSTRAINTS } from "./constants";
import type { VideoRef } from "../types";

// A camera track that records what it is asked, and offers zoom when given its range
class FakeTrack {
  stopped = false;
  applied: MediaTrackConstraints[] = [];
  constructor(private zoom?: { min: number, max: number }) {}
  stop() {
    this.stopped = true;
  }
  getCapabilities() {
    return this.zoom === undefined ? {} : { zoom: this.zoom };
  }
  applyConstraints(constraints: MediaTrackConstraints) {
    this.applied.push(constraints);
    return Promise.resolve();
  }
}

const fakeStream = (track: FakeTrack = new FakeTrack()) => ({
  track,
  stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
});

const camera = (deviceId: string, label: string) =>
  ({ kind: "videoinput", deviceId, label, groupId: "" }) as MediaDeviceInfo;
const microphone = { kind: "audioinput", deviceId: "mic", label: "Mic", groupId: "" } as MediaDeviceInfo;

// Each getUserMedia call waits until the test answers it
type Request = { constraints: MediaStreamConstraints, resolve: (stream: MediaStream) => void, reject: (error: unknown) => void };
let requests: Request[];
let devices: MediaDeviceInfo[];
let listeners: Set<() => void>;

const installMediaDevices = () => {
  requests = [];
  devices = [];
  listeners = new Set();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: (constraints: MediaStreamConstraints) =>
        new Promise<MediaStream>((resolve, reject) => requests.push({ constraints, resolve, reject })),
      enumerateDevices: () => Promise.resolve(devices),
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener)
    }
  });
}

const render = (enabled: boolean = true) => {
  const video = document.createElement("video");
  const videoRef: VideoRef = { current: video };
  const setText = vi.fn();
  const hook = renderHook(({ enabled }) => useCamera({ enabled, videoRef, setText }), { initialProps: { enabled } });
  return { ...hook, video, setText };
}

// Lets the promises the hook chains on settle
const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

beforeEach(() => {
  installMediaDevices();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // jsdom has no mediaDevices, so put that back
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("useCamera", () => {
  it("does not start while disabled", () => {
    render(false);
    expect(requests).toEqual([]);
  });

  it("shows the stream, preferring the rear camera", async () => {
    const { video } = render();
    expect(requests).toHaveLength(1);
    expect(requests[0].constraints).toEqual(MEDIA_CONSTRAINTS);

    const { stream } = fakeStream();
    requests[0].resolve(stream);
    await settle();
    expect(video.srcObject).toBe(stream);
  });

  it("lists the cameras once access is granted, and again when they change", async () => {
    devices = [camera("rear", "Back camera"), microphone];
    const { result } = render();
    requests[0].resolve(fakeStream().stream);
    await settle();
    expect(result.current.devices.map((device) => device.deviceId)).toEqual(["rear"]);

    devices = [camera("rear", "Back camera"), camera("usb", "USB camera")];
    await act(async () => {
      for (const listener of listeners) {
        listener();
      }
    });
    await settle();
    expect(result.current.devices.map((device) => device.deviceId)).toEqual(["rear", "usb"]);
  });

  it("zooms out as far as the camera allows", async () => {
    render();
    const { stream, track } = fakeStream(new FakeTrack({ min: 0.5, max: 10 }));
    requests[0].resolve(stream);
    await settle();
    expect(track.applied).toEqual([{ zoom: 0.5 }]);
  });

  it("leaves the zoom alone on a camera without it", async () => {
    render();
    const { stream, track } = fakeStream();
    requests[0].resolve(stream);
    await settle();
    expect(track.applied).toEqual([]);
  });

  it("stops the camera when disabled", async () => {
    const { rerender } = render();
    const { stream, track } = fakeStream();
    requests[0].resolve(stream);
    await settle();

    rerender({ enabled: false });
    expect(track.stopped).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it("stops a stream that arrives after it was disabled", async () => {
    const { rerender, video } = render();
    rerender({ enabled: false });
    const { stream, track } = fakeStream();
    requests[0].resolve(stream);
    await settle();

    expect(track.stopped).toBe(true);
    expect(video.srcObject).not.toBe(stream);
  });

  it("switches to a chosen device, overriding the rear camera preference", async () => {
    const { result } = render();
    const first = fakeStream();
    requests[0].resolve(first.stream);
    await settle();

    act(() => result.current.selectDevice("usb"));
    expect(result.current.deviceId).toBe("usb");
    expect(first.track.stopped).toBe(true);
    expect(requests).toHaveLength(2);
    const video = requests[1].constraints.video as MediaTrackConstraints;
    expect(video.deviceId).toEqual({ exact: "usb" });
    expect(video.facingMode).toBeUndefined();
  });

  it("leaves a working camera alone when it is chosen again", async () => {
    const { result } = render();
    act(() => result.current.selectDevice("usb"));
    requests[1].resolve(fakeStream().stream);
    await settle();

    act(() => result.current.selectDevice("usb"));
    expect(requests).toHaveLength(2);
  });

  it("tries a failed camera again when it is chosen again", async () => {
    const { result } = render();
    act(() => result.current.selectDevice("usb"));
    requests[1].reject(new DOMException("No camera", "NotFoundError"));
    await settle();

    act(() => result.current.selectDevice("usb"));
    expect(requests).toHaveLength(3);
  });

  it("retries once when the camera is still busy", async () => {
    vi.useFakeTimers();
    const { video, setText } = render();
    requests[0].reject(new DOMException("Busy", "NotReadableError"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(requests).toHaveLength(2);

    const { stream } = fakeStream();
    requests[1].resolve(stream);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(video.srcObject).toBe(stream);
    expect(setText).not.toHaveBeenCalled();
  });

  it("gives up when the camera is still busy after the retry", async () => {
    vi.useFakeTimers();
    const { setText } = render();
    requests[0].reject(new DOMException("Busy", "NotReadableError"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    requests[1].reject(new DOMException("Busy", "NotReadableError"));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(requests).toHaveLength(2);
    expect(setText).toHaveBeenCalledWith([
      "Camera is in use", "Close other apps using the camera"
    ]);
  });

  it("cancels a pending retry when disabled", async () => {
    vi.useFakeTimers();
    const { rerender } = render();
    requests[0].reject(new DOMException("Busy", "AbortError"));
    await act(async () => {
      await Promise.resolve();
    });
    rerender({ enabled: false });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(requests).toHaveLength(1);
  });

  it.each([
    ["NotAllowedError", ["Camera access was blocked", "Allow camera access in your browser settings"]],
    ["NotFoundError", ["No camera found", "Connect a camera or select another device"]],
    ["OverconstrainedError", ["No camera found", "Connect a camera or select another device"]],
    ["SecurityError", ["Unable to start the camera"]]
  ])("explains a %s", async (name, text) => {
    const { setText } = render();
    requests[0].reject(new DOMException("Failed", name));
    await settle();
    expect(setText).toHaveBeenCalledWith(text);
  });

  it("explains that the camera needs https", () => {
    Reflect.deleteProperty(navigator, "mediaDevices");
    const { setText } = render();
    expect(setText).toHaveBeenCalledWith([
      "Camera unavailable", "The camera needs a secure (https) connection"
    ]);
  });
});
