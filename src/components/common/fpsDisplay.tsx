import { useTranslation } from "react-i18next";

// Detection speed over the video's top-right corner, clear of a corner marker when one is there
const FpsDisplay = ({ fps }: { fps: number | null }) => {
  const { t } = useTranslation();
  if (fps === null) {
    return null;
  }

  return (
    <div className="video-fps">{t("camera.fps", { fps: fps.toFixed(1) })}</div>
  )
}

export default FpsDisplay;
