import { useEffect, useState } from "react";
import { graphicsText } from "./labels";
import { retryMissingPictures } from "./Picture";
import { graphicsInfo } from "./pictures";
import type { GraphicsCounts, GraphicsInfo } from "./types";

const text = graphicsText;

/** How often the app is asked while it is still reading the packs, and for how long at most. */
const POLL_MS = 1000;
const POLL_FOR_MS = 20_000;

/** What the sidebar knows about the packs. `info` is null when the app could not say, or never finished reading. */
type Graphics = { phase: "asking" } | { phase: "reading" } | { phase: "known"; info: GraphicsInfo | null };

/**
 * Asks the app about the graphics packs. It reads them in the background when it starts, which takes under a second,
 * so while it says it is not ready the question is repeated every second, for twenty at most. Pictures asked for in
 * the meantime were answered 404, so they are told to ask again once the packs are ready.
 */
function useGraphics(): Graphics {
  const [graphics, setGraphics] = useState<Graphics>({ phase: "asking" });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const giveUpAt = Date.now() + POLL_FOR_MS;
    // Whether an answer said "not ready": only then can a picture have been asked for too early.
    let waited = false;

    const ask = async () => {
      let info: GraphicsInfo | null = null;
      try {
        info = await graphicsInfo();
      } catch {
        // No answer: there is nothing to wait for, and the packs cannot be shown.
      }
      if (cancelled) {
        return;
      }
      if (info !== null && !info.ready && Date.now() < giveUpAt) {
        waited = true;
        setGraphics({ phase: "reading" });
        timer = setTimeout(ask, POLL_MS);
        return;
      }
      if (waited && info?.ready) {
        retryMissingPictures();
      }
      setGraphics({ phase: "known", info: info?.ready ? info : null });
    };
    void ask();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return graphics;
}

/** Whether the packs hold any picture at all. */
const hasPictures = (counts: GraphicsCounts): boolean =>
  counts.clubLogos + counts.faces + counts.flags + counts.competitionLogos > 0;

/**
 * What the graphics packs hold, for the foot of the sidebar: how many club logos, flags and faces, or that there are
 * no packs, and where they go. The folder they are read from is in the hover text.
 */
export function GraphicsStatus() {
  const graphics = useGraphics();
  if (graphics.phase === "asking") {
    return null;
  }
  if (graphics.phase === "reading") {
    return <p className="sidebar-note">{text.reading}</p>;
  }
  const { info } = graphics;
  if (info !== null && hasPictures(info.counts)) {
    return (
      <p className="sidebar-note" title={info.root ?? undefined}>
        {text.summary(info.counts)}
      </p>
    );
  }
  return (
    <div className="graphics-status" title={info?.root ?? undefined}>
      <p className="sidebar-note">{text.none}</p>
      <p className="sidebar-note">{text.noneHint}</p>
    </div>
  );
}
