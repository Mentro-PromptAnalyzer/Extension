import React from 'react';

interface TipCardProps {
  color: string;
  borderColor: string;
  shadowColor: string;
  svgFill: string;
  title: string;
  body: string;
  examples: string[];
}

function TipCard({
  color,
  borderColor,
  shadowColor,
  svgFill,
  title,
  body,
  examples,
}: TipCardProps) {
  return (
    <div className="tip-card">
      <div className="tip-card-header">
        <div
          className="tip-dot"
          style={{
            background: color,
            border: `1px solid ${borderColor}`,
            boxShadow: `0 0 10px 1px ${shadowColor}`,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="3" fill={svgFill} />
          </svg>
        </div>
        <span className="tip-card-title">{title}</span>
      </div>
      <div className="tip-card-body">{body}</div>
      <div className="tip-examples">
        {examples.map((ex, i) => (
          <div key={i} className="tip-example">
            <div className="tip-example-dot" />
            <span>{ex}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TIPS: TipCardProps[] = [
  {
    color: 'rgba(74, 222, 128, 0.15)',
    borderColor: 'rgba(74, 222, 128, 0.35)',
    shadowColor: 'rgba(74, 222, 128, 0.15)',
    svgFill: '#4ade80',
    title: 'Ownership',
    body: "Show your own thinking — what you've tried, your current understanding, or constraints you're working within.",
    examples: [
      '"I\'ve tried X but it fails because…"',
      '"My constraint is that I can\'t use Y."',
      '"I think the issue is Z, but I\'m not sure."',
    ],
  },
  {
    color: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.35)',
    shadowColor: 'rgba(251, 191, 36, 0.15)',
    svgFill: '#fbbf24',
    title: 'Depth',
    body: 'Ask why and how, not just what. Prompts that seek understanding score higher than those that just request an output.',
    examples: [
      '"Why does this approach work better than…?"',
      '"How does X relate to Y under the hood?"',
      '"What are the underlying principles here?"',
    ],
  },
  {
    color: 'rgba(248, 113, 113, 0.15)',
    borderColor: 'rgba(248, 113, 113, 0.35)',
    shadowColor: 'rgba(248, 113, 113, 0.15)',
    svgFill: '#f87171',
    title: 'Critical',
    body: 'Probe edge cases, tradeoffs, and alternatives. Ask the AI to challenge its own answer or consider failure modes.',
    examples: [
      '"What are the risks or downsides of this?"',
      '"What would break this approach?"',
      '"What alternatives should I consider?"',
    ],
  },
  {
    color: 'rgba(96, 165, 250, 0.15)',
    borderColor: 'rgba(96, 165, 250, 0.35)',
    shadowColor: 'rgba(96, 165, 250, 0.15)',
    svgFill: '#60a5fa',
    title: 'Clarity',
    body: 'Be specific and well-contextualized. Name your tools, audience, format, and goal so the AI has no room to guess.',
    examples: [
      '"I\'m using Python 3.11 with FastAPI."',
      '"Format the response as bullet points."',
      '"The audience is a non-technical manager."',
    ],
  },
];

export function TipsTab() {
  return (
    <div className="tips-list">
      {TIPS.map((tip) => (
        <TipCard key={tip.title} {...tip} />
      ))}
    </div>
  );
}
