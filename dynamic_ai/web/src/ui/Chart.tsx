import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { UiNode } from "@dyn/shared";

type ChartNode = Extract<UiNode, { type: "chart" }>;

const PALETTE = ["#5b8bff", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#22d3ee"];

export function Chart({ node }: { node: ChartNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const isTime = node.xType === "time";
    const series = node.series.map((s) => ({
      name: s.label,
      type: node.kind === "bar" ? "bar" : node.kind === "scatter" ? "scatter" : "line",
      smooth: node.kind === "line" || node.kind === "area",
      areaStyle: node.kind === "area" ? { opacity: 0.18 } : undefined,
      showSymbol: node.kind === "scatter",
      symbolSize: 6,
      data: s.points.map((p) => (isTime ? [p[0], p[1]] : p[1])),
    }));

    chart.setOption(
      {
        grid: { left: 48, right: 16, top: node.series.length > 1 ? 30 : 16, bottom: 28 },
        tooltip: { trigger: "axis", backgroundColor: "#161a24", borderColor: "#2b3242", textStyle: { color: "#e8ecf4" } },
        legend: node.series.length > 1 ? { textStyle: { color: "#cbd5e1" }, top: 0 } : undefined,
        xAxis: isTime
          ? { type: "time", axisLabel: { color: "#94a3b8", hideOverlap: true }, axisLine: { lineStyle: { color: "#334155" } } }
          : {
              type: "category",
              data: node.series[0]?.points.map((p) => String(p[0])) ?? [],
              axisLabel: { color: "#94a3b8" },
              axisLine: { lineStyle: { color: "#334155" } },
            },
        yAxis: {
          type: "value",
          name: node.unit,
          nameTextStyle: { color: "#94a3b8" },
          axisLabel: { color: "#94a3b8" },
          splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } },
        },
        color: PALETTE,
        series: series as echarts.SeriesOption[],
      },
      true,
    );
  }, [node]);

  return <div ref={ref} style={{ width: "100%", height: node.height || 240 }} />;
}
