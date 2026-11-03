import React from "react";
import { Composition, staticFile } from "remotion";
import { Demo } from "./Demo";
import timeline from "../public/timeline.json";

const total = Math.max(...timeline.segments.map((g: any) => g.start + g.dur));
export const Root: React.FC = () => (
  <Composition id="Demo" component={Demo as any} durationInFrames={Math.ceil(total * timeline.fps)} fps={timeline.fps} width={1920} height={1080} defaultProps={{ timeline }} />
);
