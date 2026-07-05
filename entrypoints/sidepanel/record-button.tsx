/** Header record control: plus → red recording dot → stop glyph on hover. */

import { Circle, Plus, Square } from "lucide-react";
import { useState } from "react";
import { IconButton, IconSwap } from "./ui";

export function RecordButton({
  recording,
  onStart,
  onStop,
}: {
  recording: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const [hover, setHover] = useState(false);

  let key = "plus";
  let icon = <Plus aria-hidden="true" className="size-4 shrink-0" />;
  if (recording) {
    key = hover ? "stop" : "rec";
    icon = hover ? (
      <Square aria-hidden="true" className="size-4 shrink-0 fill-current" />
    ) : (
      <Circle
        aria-hidden="true"
        className="size-4 shrink-0 animate-pulse fill-current motion-reduce:animate-none"
      />
    );
  }

  return (
    <IconButton
      label={recording ? "Stop recording and save" : "Record a workflow"}
      onBlur={() => setHover(false)}
      onClick={recording ? onStop : onStart}
      onFocus={() => setHover(true)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      variant={recording ? "destructive" : "primary"}
    >
      <IconSwap id={key}>{icon}</IconSwap>
    </IconButton>
  );
}
