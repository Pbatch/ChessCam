import i18n from "../../i18n";
import { findPieces } from "../../vision/findPieces";
import { useEffect, useRef, useState } from "react";
import { getMoveText, type Recorder } from "@chesscam/recorder";
import { MEDIA_ASPECT_RATIO } from "../../utils/constants";
import type {
  CornerName, Game, Mode, ModelRefs, Roi, SetRoi,
  SetBoolean, SetStringArray, VideoRef
} from "../../types";
import { makeBoard, useGame } from "../../slices/gameSlice";
import RoiOverlay from "./roiOverlay";
import OrientationMarkers from "./orientationMarkers";
import FpsDisplay from "./fpsDisplay";
import EvalGauge from "./evalGauge";
import VideoControls from "../upload/videoControls";
import CameraControls from "./cameraControls";
import type { StartBlock } from "./cameraControls";

// The controls' height over the video, in px, as in .video-controls: uploads have a seek bar above the buttons
const CONTROLS_HEIGHT = { upload: 52, camera: 40 };

const Video = ({ modelRef, videoRef, playing,
  setPlaying, setText, mode, roi, setRoi,
  canPlay, setCanPlay, engineEnabled = false, startBlock = null }: {
    modelRef: ModelRefs["modelRef"],
    videoRef: VideoRef,
    playing: boolean,
    setPlaying: SetBoolean,
    setText: SetStringArray, mode: Mode,
    // The region the recorder crops to, which it finds itself
    roi: Roi | null, setRoi: SetRoi,
    canPlay: boolean, setCanPlay: SetBoolean,
    // What the camera modes need chosen before detection can start
    startBlock?: StartBlock | null,
    // Shows Stockfish's eval bar on the video's right
    engineEnabled?: boolean
  }) => {
  const game: Game = useGame();

  const [recorder, setRecorder] = useState<Recorder | null>(null);
  const moveTextRef = useRef<string>("");
  const [orientation, setOrientation] = useState<CornerName[] | null>(null);
  // Cameras return whichever native mode is closest to the request, so the real shape is only known once frames arrive
  const [aspectRatio, setAspectRatio] = useState<number>(MEDIA_ASPECT_RATIO);
  // Kept here rather than in VideoAndSidebar, so its updates re-render only the video and not the sidebar
  const [fps, setFps] = useState<number | null>(null);
  // Whether the upload controls show over the bottom of the video, which the corner markers then move clear of
  const [controlsVisible, setControlsVisible] = useState<boolean>(false);
  const showControls: boolean = canPlay;

  useEffect(() => {
    moveTextRef.current = getMoveText(makeBoard(game));
  }, [game])

  // The ModelLoader route holds this page back until the model has loaded, and the video element is always rendered
  useEffect(() => {
    const model = modelRef.current;
    const video = videoRef.current;
    if (model === null || video === null) {
      return;
    }
    const found = findPieces({ model, video, setText, setFps, setOrientation, setRoi, moveTextRef, mode });
    setRecorder(found.recorder);
    return () => {
      setRecorder(null);
      setRoi(null);
      found.stop();
    };
  }, [mode, modelRef, setRoi, setText, videoRef]);

  // A new recorder (e.g. after the mode changes) gets the current values too
  useEffect(() => {
    if (playing) {
      recorder?.start();
    } else {
      recorder?.pause();
    }
  }, [playing, recorder]);

  useEffect(() => {
    const video = videoRef.current;
    if ((mode !== "upload") || !canPlay || video === null || (video.getAttribute("src") === null)) {
      return;
    }

    if (!playing) {
      video.pause();
      return;
    }

    void video.play().catch(() => {
      setPlaying(false);
      setText([i18n.t("video.playFailed"), i18n.t("video.formatHint")]);
    });
  }, [canPlay, mode, playing, setPlaying, setText, videoRef])

  const liveStyle: React.CSSProperties = {
    // As large as fits in the stage at the video's aspect ratio
    width: `min(100cqw, 100cqh * ${aspectRatio})`,
    aspectRatio: `${aspectRatio}`
  }

  // Fires when the first frame arrives and whenever the size changes, e.g. when a phone rotates
  const onResize = () => {
    const video = videoRef.current;
    if (video === null || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }
    setAspectRatio(video.videoWidth / video.videoHeight);
    // The board is looked for afresh, as a region found at the old size no longer lines up
    recorder?.setRoi(null);
    setOrientation(null);
  }

  const onCanPlay = () => {
    setCanPlay(true);
  }

  const onLoadStart = () => {
    setCanPlay(false);
    // A new source may show the board elsewhere, or have a different resolution
    recorder?.setRoi(null);
    setOrientation(null);
  }

  const onError = () => {
    if (mode === "upload") {
      setPlaying(false);
      setText([i18n.t("video.loadFailed"), i18n.t("video.formatHint")]);
    }
  }

  const onEnded = () => {
    if (mode === "upload") {
      const video = videoRef.current;
      if (video !== null) {
        video.currentTime = video.duration;
        video.pause();
      }
    }
    setPlaying(false);
  }

  return (
    <div className={`video-stage flex items-center justify-center${engineEnabled ? " video-stage--gauge" : ""}`}>
      <div className="video-live" style={liveStyle}>
        <div className="video-live__container">
          <div className="video-live__wrapper">
            {/* No picture-in-picture: Chrome would add a button for it, and float the video out when the tab is left */}
            <video ref={videoRef} autoPlay={mode !== "upload"} playsInline={true} muted={true} disablePictureInPicture={true}
              className="video-live__video" onResize={onResize}
              onCanPlay={onCanPlay} onLoadStart={onLoadStart} onError={onError} onEnded={onEnded} />
            {/* Only over a picture, and once the board is found: while a new video loads, or the board is looked for,
                no region or corners apply */}
            {canPlay && <RoiOverlay videoRef={videoRef} roi={roi} />}
            {canPlay && (roi !== null) && <OrientationMarkers videoRef={videoRef} roi={roi} orientation={orientation}
              bottomInset={(showControls && controlsVisible) ? CONTROLS_HEIGHT[mode === "upload" ? "upload" : "camera"] : 0} />}
            <FpsDisplay fps={fps} />
            {showControls && (mode === "upload") && <VideoControls videoRef={videoRef} playing={playing}
              setPlaying={setPlaying} setText={setText} onVisible={setControlsVisible} />}
            {showControls && (mode !== "upload") && <CameraControls mode={mode} videoRef={videoRef} playing={playing}
              setPlaying={setPlaying} setText={setText} onVisible={setControlsVisible} blocked={startBlock} />}
          </div>
        </div>
        {engineEnabled && <EvalGauge />}
      </div>
    </div>
  );
};

export default Video;
