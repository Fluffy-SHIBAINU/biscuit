import React from "react";
import { Composition, staticFile } from "remotion";
import { Demo } from "./Demo";
import timeline from "../public/timeline.json";

const total = timeline.segments.reduce((n: number, g: any) => n + g.dur, 0);
export const Root: React.FC = () => (
  <Composition id="Demo" component={Demo as any} durationInFrames={Math.ceil(total * timeline.fps)} fps={timeline.fps} width={1920} height={1080} defaultProps={{ timeline }} />
);
