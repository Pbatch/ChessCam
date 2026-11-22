import { useTranslation } from "react-i18next";
import { Sidebar, SidebarSection, FenButton, DeviceButton } from "../common";
import type {
  Camera, ModelRefs, Roi, SetStringArray, VideoRef
} from "../../types";

// Recording is controlled from the bar over the camera (cameraControls.tsx)
const RecordSidebar = ({ modelRef, videoRef, camera,
  playing, text, setText, roi, canPlay }: {
  modelRef: ModelRefs["modelRef"],
  videoRef: VideoRef,
  camera: Camera,
  playing: boolean,
  text: string[], setText: SetStringArray,
  roi: Roi | null,
  canPlay: boolean
}) => {
  const { t } = useTranslation();

  return (
    // The board always shows, so pausing to check the game moves nothing
    <Sidebar playing={playing} text={text} setText={setText} exportable={true} setupFirst={true} showBoard={true}>
      {/* Stays while recording, disabled, except on landscape phones, which need the room */}
      <SidebarSection title={t("common.setup")} className={playing ? "sidebar-section--hidden-short" : ""}>
        <DeviceButton camera={camera} disabled={playing} />
        <FenButton modelRef={modelRef} videoRef={videoRef} roi={roi} setText={setText}
          canPlay={canPlay && !playing} />
      </SidebarSection>
    </Sidebar>
  );
};

export default RecordSidebar;
