import React from 'react';

interface ScoreGaugeProps {
  score: number;
  grade: string;
  size?: number;
  strokeWidth?: number;
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  score,
  grade,
  size = 140,
  strokeWidth = 12,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let colorClass = 'text-emerald-500 stroke-emerald-500';
  let badgeClass = 'text-emerald-400 bg-emerald-950/80 border-emerald-800';

  if (score < 45) {
    colorClass = 'text-rose-500 stroke-rose-500';
    badgeClass = 'text-rose-400 bg-rose-950/80 border-rose-800';
  } else if (score < 70) {
    colorClass = 'text-amber-500 stroke-amber-500';
    badgeClass = 'text-amber-400 bg-amber-950/80 border-amber-800';
  }

  return (
    <div className="relative inline-flex flex-col items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="stroke-slate-800 fill-none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={`fill-none transition-all duration-700 ease-out ${colorClass}`}
        />
      </svg>
      {/* Centered text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-extrabold tracking-tight text-white font-mono">
          {score}
        </span>
        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
          out of 100
        </span>
      </div>
      <div
        className={`mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeClass}`}
      >
        Grade {grade}
      </div>
    </div>
  );
};
