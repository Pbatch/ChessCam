import type { Roi, VideoRef } from "../../types";

// Shades the video outside the region the recorder crops to, once it has found the board
const RoiOverlay = ({ videoRef, roi }: { videoRef: VideoRef, roi: Roi | null }) => {
  const video = videoRef.current;
  if (roi === null || video === null || video.videoWidth === 0) {
    return null;
  }

  const style: React.CSSProperties = {
    left: `${100 * roi.x / video.videoWidth}%`,
    top: `${100 * roi.y / video.videoHeight}%`,
    width: `${100 * roi.width / video.videoWidth}%`,
    height: `${100 * roi.height / video.videoHeight}%`
  };

  return (
    <div className="roi-overlay">
      <div className="roi-overlay__region" style={style} />
    </div>
  );
};

export default RoiOverlay;
