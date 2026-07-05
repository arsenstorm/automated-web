/** Header record control: plus → red recording dot → stop glyph on hover. */

import { Circle, Plus, Square } from "lucide-react";
import { useCallback, useState } from "react";
import { IconButton } from "@/components/buttons";
import { IconSwap } from "@/components/transitions";

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
  const hoverOn = useCallback(() => setHover(true), []);
  const hoverOff = useCallback(() => setHover(false), []);

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
      onBlur={hoverOff}
      onClick={recording ? onStop : onStart}
      onFocus={hoverOn}
      onMouseEnter={hoverOn}
      onMouseLeave={hoverOff}
      variant={recording ? "destructive" : "primary"}
    >
      <IconSwap id={key}>{icon}</IconSwap>
    </IconButton>
  );
}
