import { useTranslation } from "react-i18next";
import { Sidebar, SidebarSection, StudyButton, DeviceButton } from "../common";
import type {
  Camera, SetNumber, SetStringArray, SetStudy, Study
} from "../../types";
import BoardNumberButton from "./boardNumberButton";

// Broadcasting is controlled from the bar over the camera (cameraControls.tsx)
const BroadcastSidebar = ({ camera,
  playing, text, setText, study, setStudy, boardNumber, setBoardNumber }: {
  camera: Camera,
  playing: boolean,
  text: string[], setText: SetStringArray,
  study: Study | null, setStudy: SetStudy,
  boardNumber: number, setBoardNumber: SetNumber
}) => {
  const { t } = useTranslation();

  return (
    // The board always shows, so pausing to check the game moves nothing
    <Sidebar playing={playing} text={text} setText={setText} setupFirst={true} showBoard={true}>
      {/* Stays while broadcasting, disabled, except on landscape phones, which need the room */}
      <SidebarSection title={t("common.setup")} className={playing ? "sidebar-section--hidden-short" : ""}>
        <DeviceButton camera={camera} disabled={playing} />
        <StudyButton study={study} setStudy={setStudy} onlyBroadcasts={true} disabled={playing} />
        <BoardNumberButton boardNumber={boardNumber} setBoardNumber={setBoardNumber} disabled={playing} />
      </SidebarSection>
    </Sidebar>
  );
};

export default BroadcastSidebar;
