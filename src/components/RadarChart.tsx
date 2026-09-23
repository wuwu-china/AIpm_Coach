import { useEffect, useRef } from 'react';
// 按需引入 ECharts，避免全量打包（雷达图 + Canvas 渲染器即可）
import * as echarts from 'echarts/core';
import { RadarChart as EChartsRadarChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { DIMENSIONS, SCORE_GOOD, SCORE_WEAK } from '../data/dimensions';
import type { DimensionId } from '../data/questions';

echarts.use([EChartsRadarChart, CanvasRenderer]);

interface Props {
  scores: Record<DimensionId, number>;
  /** 上一次测评分数；传入则叠加对比 */
  prevScores?: Record<DimensionId, number> | null;
  height?: number;
}

const BRAND = '#2f4d7d';
const PREV = '#b4b0a6';

export default function RadarChart({ scores, prevScores = null, height = 380 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;

    const indicator = DIMENSIONS.map((d) => ({ name: d.name, max: 100, min: 0 }));
    const values = DIMENSIONS.map((d) => scores[d.id] ?? 0);
    const prevValues = prevScores ? DIMENSIONS.map((d) => prevScores[d.id] ?? 0) : null;

    // 轴标签始终以「本次」分数着色
    chart.setOption({
      animationDuration: 500,
      radar: {
        indicator,
        radius: '66%',
        center: ['50%', '54%'],
        splitNumber: 4,
        axisName: {
          fontSize: 13,
          padding: [3, 4],
          formatter: (name: string) => {
            const dim = DIMENSIONS.find((d) => d.name === name);
            const v = dim ? scores[dim.id] : 0;
            const cls = v > SCORE_GOOD ? 'good' : v < SCORE_WEAK ? 'weak' : 'normal';
            return `{${cls}n|${name}}\n{${cls}v|${v}}`;
          },
          rich: {
            goodn: { color: '#3f8f6b', fontSize: 13, fontWeight: 600, lineHeight: 18 },
            goodv: { color: '#3f8f6b', fontSize: 15, fontWeight: 700, lineHeight: 20 },
            weakn: { color: '#d0822f', fontSize: 13, fontWeight: 600, lineHeight: 18 },
            weakv: { color: '#d0822f', fontSize: 15, fontWeight: 700, lineHeight: 20 },
            normaln: { color: '#374151', fontSize: 13, fontWeight: 600, lineHeight: 18 },
            normalv: { color: '#374151', fontSize: 15, fontWeight: 700, lineHeight: 20 },
          },
        },
        splitLine: { lineStyle: { color: '#e6e1d6' } },
        splitArea: {
          areaStyle: { color: ['rgba(255,255,255,0.4)', 'rgba(246,244,238,0.4)'] },
        },
        axisLine: { lineStyle: { color: '#e0dccf' } },
      },
      series: [
        {
          type: 'radar',
          symbol: 'circle',
          symbolSize: 6,
          // 上次：浅灰虚线、不填充；本次：主色实线 + 半透明填充。
          // 顺序上先画上次、再画本次，让「现在的我」在最上层。
          data: [
            ...(prevValues
              ? [
                  {
                    value: prevValues,
                    name: '上次',
                    symbol: 'emptyCircle',
                    symbolSize: 5,
                    lineStyle: { color: PREV, width: 2, type: 'dashed' },
                    itemStyle: { color: PREV },
                    areaStyle: { color: 'rgba(0,0,0,0)' },
                  },
                ]
              : []),
            {
              value: values,
              name: '本次',
              lineStyle: { color: BRAND, width: 2 },
              itemStyle: { color: BRAND },
              areaStyle: { color: prevValues ? 'rgba(47,77,125,0.30)' : 'rgba(47,77,125,0.16)' },
            },
          ],
        },
      ],
    });

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [scores, prevScores]);

  return <div ref={ref} style={{ width: '100%', height }} />;
}
