'use client';

import { FC, useEffect, useMemo, useRef } from 'react';
import DrawChart from 'chart.js/auto';
import { TotalList } from '@gitroom/frontend/components/analytics/stars.and.forks.interface';
import { useTheme } from '@gitroom/react/helpers/theme';
import {
  mergeAnalyticsPoints,
  normalizeAnalyticsPoints,
} from './analytics-data';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const ChartSocial: FC<{
  data: TotalList[];
  color?: 'purple' | 'green' | 'blue';
  average?: boolean;
}> = (props) => {
  const { data, color = 'purple', average = false } = props;
  const [mode] = useTheme();
  const t = useT();

  const list = useMemo(() => {
    try {
      const points = normalizeAnalyticsPoints(data);
      const merged =
        points.length < 7 ? points : mergeAnalyticsPoints(points, 7, average);
      return merged.length === 1 ? [merged[0], merged[0]] : merged;
    } catch {
      return null;
    }
  }, [data, average]);

  const ref = useRef<any>(null);
  const chart = useRef<null | DrawChart>(null);

  const colorSchemes = {
    purple: {
      start: 'rgba(97, 43, 211, 0.8)',
      end: 'rgba(97, 43, 211, 0.1)',
      border: 'rgb(97, 43, 211)',
    },
    green: {
      start: 'rgba(50, 213, 131, 0.8)',
      end: 'rgba(50, 213, 131, 0.1)',
      border: 'rgb(50, 213, 131)',
    },
    blue: {
      start: 'rgba(29, 155, 240, 0.8)',
      end: 'rgba(29, 155, 240, 0.1)',
      border: 'rgb(29, 155, 240)',
    },
  };

  const { start, end, border } = colorSchemes[color];

  useEffect(() => {
    if (!list || !ref.current) return;
    const ctx = ref.current.getContext('2d');
    if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, 0, ref.current.height);
    gradient.addColorStop(0, start);
    gradient.addColorStop(1, end);

    chart.current = new DrawChart(ref.current!, {
      type: 'line',
      options: {
        maintainAspectRatio: false,
        responsive: true,
        animation: {
          duration: 750,
          easing: 'easeOutQuart',
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        layout: {
          padding: {
            left: 0,
            right: 0,
            top: 4,
            bottom: 0,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            display: false,
          },
          x: {
            display: false,
            ticks: {
              stepSize: 10,
              maxTicksLimit: 7,
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            enabled: true,
            backgroundColor: mode === 'dark' ? '#1e1d1d' : '#fff',
            titleColor: mode === 'dark' ? '#fff' : '#000',
            bodyColor: mode === 'dark' ? '#9c9c9c' : '#777',
            borderColor: mode === 'dark' ? '#2b2b2b' : '#e7e9eb',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            titleFont: {
              size: 12,
              weight: 'normal',
            },
            bodyFont: {
              size: 14,
              weight: 'bold',
            },
          },
        },
      },
      data: {
        labels: list.map((row) => row.date),
        datasets: [
          {
            borderColor: border,
            borderWidth: 2,
            label: 'Total',
            backgroundColor: gradient,
            fill: true,
            data: list.map((row) => row.total),
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: border,
            pointHoverBorderColor: mode === 'dark' ? '#1e1d1d' : '#fff',
            pointHoverBorderWidth: 2,
          },
        ],
      },
    });
    return () => {
      chart?.current?.destroy();
    };
  }, [list, start, end, border, mode]);

  if (!list)
    return (
      <p role="alert">
        {t(
          'analytics_load_failed',
          'Could not load metrics. Please try again.'
        )}
      </p>
    );
  return <canvas className="w-full h-full" ref={ref} />;
};
