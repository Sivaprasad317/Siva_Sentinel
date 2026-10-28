import { Composition, Folder } from "remotion";
import { calculatePromoMetadata, PROMO_FRAMES, SivaPromo } from "./SivaPromo";
import { Features } from "./scenes/Features";
import { Hook } from "./scenes/Hook";
import { Intro } from "./scenes/Intro";
import { Outro } from "./scenes/Outro";
import { Pipeline } from "./scenes/Pipeline";
import { Product } from "./scenes/Product";
import { Ranking } from "./scenes/Ranking";
import { VoiceDemo } from "./scenes/VoiceDemo";
import { VOICE } from "./script";
import { FPS, HEIGHT, WIDTH } from "./theme";

const size = { width: WIDTH, height: HEIGHT, fps: FPS };

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="SivaPromo" component={SivaPromo} durationInFrames={PROMO_FRAMES} defaultProps={{ withVoice: false }} calculateMetadata={calculatePromoMetadata} {...size} />
      <Folder name="SivaPromo-Scenes">
        <Composition id="Hook" component={Hook} durationInFrames={120} {...size} />
        <Composition id="Intro" component={Intro} durationInFrames={100} {...size} />
        <Composition id="VoiceDemo" component={VoiceDemo} durationInFrames={VOICE.duration} defaultProps={{ withVoice: false }} {...size} />
        <Composition id="Pipeline" component={Pipeline} durationInFrames={230} {...size} />
        <Composition id="Ranking" component={Ranking} durationInFrames={200} {...size} />
        <Composition id="Product" component={Product} durationInFrames={312} {...size} />
        <Composition id="Features" component={Features} durationInFrames={170} {...size} />
        <Composition id="Outro" component={Outro} durationInFrames={170} {...size} />
      </Folder>
    </>
  );
};
