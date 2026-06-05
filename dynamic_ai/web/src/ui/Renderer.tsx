import type { UiNode } from "@dyn/shared";
import * as B from "./blocks";
import { Chart } from "./Chart";

/** Recursively render a generative-UI tree. The single place node types map to
 * components — adding a primitive is adding one case here + one block. */
export function Renderer({ node }: { node: UiNode }) {
  switch (node.type) {
    case "stack":
      return <B.Stack node={node} />;
    case "grid":
      return <B.Grid node={node} />;
    case "card":
      return <B.Card node={node} />;
    case "section":
      return <B.Section node={node} />;
    case "divider":
      return <B.Divider />;
    case "text":
      return <B.Text node={node} />;
    case "stat":
      return <B.Stat node={node} />;
    case "badge":
      return <B.Badge node={node} />;
    case "icon":
      return <B.IconBlock node={node} />;
    case "image":
      return <B.Image node={node} />;
    case "keyvalue":
      return <B.KeyValue node={node} />;
    case "progress":
      return <B.Progress node={node} />;
    case "gauge":
      return <B.Gauge node={node} />;
    case "chart":
      return <Chart node={node} />;
    case "sparkline":
      return <B.Sparkline node={node} />;
    case "timeline":
      return <B.Timeline node={node} />;
    case "entity":
      return <B.Entity node={node} />;
    case "action_card":
      return <B.ActionCard node={node} />;
    case "button":
      return <B.ActionButtonBlock node={node} />;
    case "toggle":
      return <B.Toggle node={node} />;
    case "slider":
      return <B.Slider node={node} />;
    default:
      return null;
  }
}
