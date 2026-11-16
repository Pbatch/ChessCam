import i18n from "../i18n";
import { createRecorder, type Game, type Model, type RecorderError } from "@chesscam/recorder";
import { useStore } from "../store";
import type { Mode, SetFps, SetOrientation, SetStringArray } from "../types";
import type { RefObject } from "react";

// Keeps the same array when the text is unchanged, so React skips re-rendering the page every frame
const setTextIfChanged = (setText: SetStringArray, text: string[]) => {
  setText((prev) => ((prev.length === text.length) && prev.every((t, i) => t === text[i])) ? prev : text);
}

const errorText = (error: RecorderError): string[] => [i18n.t("detection.failed"),
  (error.code === "worker-stopped") ? i18n.t("detection.stopped") : error.message];

interface FindPiecesInput {
  model: Model,
  video: HTMLVideoElement,
  setText: SetStringArray,
  setFps: SetFps,
  setOrientation: SetOrientation,
  moveTextRef: RefObject<string>,
  mode: Mode
}

// Reads moves off the board with the recorder, which keeps its own copy of the game: its moves go to the store, and
// the store's changes from elsewhere (a takeback, a new game, the Lichess opponent's moves) go back to it. Returns the
// recorder, paused, to start, pause and give regions to, and a function that stops it.
export const findPieces = ({ model, video, setText, setFps, setOrientation, moveTextRef, mode }: FindPiecesInput) => {
  const initial = useStore.getState();
  // Play mode reads only the user's move, once it is certain, as it goes to Lichess, which can't take it back; the
  // opponent's moves come from Lichess, through the store (see below). Record mode times each move, for the PGN.
  const recorder = createRecorder({
    model, video, start: initial.game.start, timed: mode === "record", play: mode === "play",
    onUpdate: (game: Game) => {
      useStore.setState({ game });
    },
    onDetect: () => {
      setTextIfChanged(setText, [moveTextRef.current]);
    },
    onFps: setFps,
    onOrientation: setOrientation,
    onError: (error) => {
      setTextIfChanged(setText, errorText(error));
    }
  });
  recorder.setGame(initial.game);

  let trackerResets: number = initial.trackerResets;
  const unsubscribe = useStore.subscribe((state) => {
    // A reset (upload mode) starts the tracker afresh, as its beliefs about the board no longer hold
    if (state.trackerResets !== trackerResets) {
      trackerResets = state.trackerResets;
      recorder.reset(state.game.start);
    }
    // Does nothing for the recorder's own moves, which the store already has
    recorder.setGame(state.game);
  });

  return {
    recorder,
    stop: () => {
      unsubscribe();
      recorder.destroy();
    }
  };
}
