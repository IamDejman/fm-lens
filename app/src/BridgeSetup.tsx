import { useState } from "react";
import { call } from "./api";
import { describeError } from "./format";
import { appText } from "./labels";
import type { BridgeInfo } from "./types";

type Command = "set_up_bridge" | "remove_bridge";

/**
 * macOS: the bridge FM27 has to load before the app can reach it. Shows how far it is set up, sets it up or removes
 * it, and gives the launch option to enter in Steam by hand while Steam runs.
 */
export function BridgeSetup(props: { bridge: BridgeInfo; busy: boolean; onChange: (bridge: BridgeInfo) => void }) {
  const { bridge, busy, onChange } = props;
  const text = appText.connect.bridge;
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const launchOptionSet = bridge.accounts.some((account) => account.loadsBridge);

  const change = async (command: Command) => {
    setWorking(true);
    setError(null);
    try {
      onChange(await call<BridgeInfo>(command));
    } catch (e) {
      setError(describeError(e));
      // Setting up can stop halfway, with the library installed and the launch option not set.
      const now = await call<BridgeInfo | null>("bridge_status").catch(() => null);
      if (now) {
        onChange(now);
      }
    } finally {
      setWorking(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bridge.launchOption);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="bridge">
      <h3>{text.title}</h3>
      <p className="muted">{text.intro}</p>
      <dl className="facts">
        <dt>{text.library}</dt>
        <dd>{bridge.installed ? text.installed : text.missing}</dd>
        <dt>{text.launchOption}</dt>
        <dd>{launchOptionSet ? text.set : text.notSet}</dd>
      </dl>

      {bridge.ready ? (
        <p className="hint">{text.ready}</p>
      ) : (
        bridge.steamRunning && !error && <p className="hint">{text.steamRunning}</p>
      )}
      {error && <p className="hint error">{error}</p>}

      <div className="bridge-actions">
        {!bridge.ready && (
          <button className="primary" onClick={() => void change("set_up_bridge")} disabled={busy || working}>
            {text.setUp}
          </button>
        )}
        {(bridge.installed || launchOptionSet) && (
          <button onClick={() => void change("remove_bridge")} disabled={busy || working}>
            {text.remove}
          </button>
        )}
      </div>

      {!bridge.ready && (
        <div className="bridge-manual">
          <p className="muted">{text.manual}</p>
          <div className="launch-option">
            <code>{bridge.launchOption}</code>
            <button onClick={() => void copy()}>{copied ? text.copied : text.copy}</button>
          </div>
        </div>
      )}
    </div>
  );
}
