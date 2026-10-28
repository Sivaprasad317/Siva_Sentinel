import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { CalculateMetadataFunction, interpolate, Sequence, staticFile } from "remotion";
import { Features } from "./scenes/Features";
import { Hook } from "./scenes/Hook";
import { Intro } from "./scenes/Intro";
import { Outro } from "./scenes/Outro";
import { Pipeline } from "./scenes/Pipeline";
import { Product } from "./scenes/Product";
import { Ranking } from "./scenes/Ranking";
import { VoiceDemo } from "./scenes/VoiceDemo";
import { VOICE } from "./script";

export type PromoProps = { withVoice: boolean };

// Scene lengths in frames (30 fps). Keep in sync with Root.tsx.
export const SCENES = { hook: 120, intro: 100, voice: VOICE.duration, pipeline: 230, ranking: 200, product: 312, features: 170, outro: 170 };
const T = 12; // transition length
const ORDER = [SCENES.hook, SCENES.intro, SCENES.voice, SCENES.pipeline, SCENES.ranking, SCENES.product, SCENES.features, SCENES.outro];
export const PROMO_FRAMES = ORDER.reduce((a, b) => a + b, 0) - (ORDER.length - 1) * T;
/** Frame where each transition starts on the main timeline. */
const CUTS = ORDER.slice(0, -1).map((_, i) => ORDER.slice(0, i + 1).reduce((a, b) => a + b, 0) - (i + 1) * T);
const VOICE_START = CUTS[1];

/** Turns the voice on automatically once public/voice/user.wav and siva.wav exist. */
export const calculatePromoMetadata: CalculateMetadataFunction<PromoProps> = async ({ props }) => {
  const exists = async (f: string) => {
    try {
      return (await fetch(staticFile(f), { method: "HEAD" })).ok;
    } catch {
      return false;
    }
  };
  const withVoice = (await exists("voice/user.wav")) && (await exists("voice/siva.wav"));
  return { props: { ...props, withVoice } };
};

export const SivaPromo: React.FC<PromoProps> = ({ withVoice }) => {
  return (
    <>
      <Audio
        src={staticFile("sfx/pad.mp3")}
        name="Music"
        volume={(f) =>
          interpolate(
            f,
            [0, 20, VOICE_START + VOICE.userStart - 10, VOICE_START + VOICE.userStart, VOICE_START + VOICE.sivaEnd, VOICE_START + VOICE.sivaEnd + 20, PROMO_FRAMES - 40, PROMO_FRAMES],
            [0, 0.5, 0.5, withVoice ? 0.14 : 0.35, withVoice ? 0.14 : 0.35, 0.5, 0.5, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          )
        }
      />
      {CUTS.map((at) => (
        <Sequence key={at} from={at - 4} durationInFrames={30} layout="none">
          <Audio src={staticFile("sfx/whoosh.wav")} volume={0.45} />
        </Sequence>
      ))}
      {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45].map((at) => (
        <Sequence key={at} from={at} durationInFrames={10} layout="none">
          <Audio src={staticFile("sfx/tick.wav")} volume={0.5} />
        </Sequence>
      ))}
      <Sequence from={76} durationInFrames={20} layout="none">
        <Audio src={staticFile("sfx/pulse.wav")} volume={0.9} />
      </Sequence>

      <TransitionSeries>
        <TransitionSeries.Sequence name="Hook" durationInFrames={120}>
          <Hook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="Intro" durationInFrames={100}>
          <Intro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="Voice demo" durationInFrames={VOICE.duration}>
          <VoiceDemo withVoice={withVoice} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="Pipeline" durationInFrames={230}>
          <Pipeline />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="Ranking" durationInFrames={200}>
          <Ranking />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="Product" durationInFrames={312}>
          <Product />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="Features" durationInFrames={170}>
          <Features />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="Outro" durationInFrames={170}>
          <Outro />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </>
  );
};
