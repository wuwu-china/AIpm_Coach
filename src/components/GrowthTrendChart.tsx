import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { DIMENSIONS } from '../data/dimensions';
import type { Snapshot } from '../lib/types';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

function md(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function GrowthTrendChart({ snapshots, height = 380 }: { snapshots: Snapshot[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const xs = snapshots.map((s) => md(s.date));

    chart.setOption({
      animationDuration: 400,
      color: DIMENSIONS.map((d) => d.color),
      tooltip: { trigger: 'axis' },
      legend: {
        top: 0,
        type: 'scroll',
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { fontSize: 11, color: '#6b7280' },
      },
      grid: { left: 36, right: 16, top: 44, bottom: 28 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: xs,
        axisLine: { lineStyle: { color: '#e0dccf' } },
        axisLabel: { color: '#9ca3af', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: '#ece7db' } },
        axisLabel: { color: '#9ca3af', fontSize: 11 },
      },
      series: [
        ...DIMENSIONS.map((d) => ({
          name: d.name,
          type: 'line',
          smooth: false,
          symbolSize: 6,
          lineStyle: { width: 2 },
          data: snapshots.map((s) => s.dims[d.id] ?? 0),
        })),
        {
          name: '总分',
          type: 'line',
          smooth: false,
          symbol: 'diamond',
          symbolSize: 7,
          lineStyle: { width: 2, type: 'dashed', color: '#2f4d7d' },
          itemStyle: { color: '#2f4d7d' },
          data: snapshots.map((s) => s.total),
        },
      ],
    });

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [snapshots]);

  return <div ref={ref} style={{ width: '100%', height }} />;
}
