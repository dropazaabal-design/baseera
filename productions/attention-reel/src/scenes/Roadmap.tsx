import React from "react";
import { C, Shell, Label, Arrow, useSeconds, ease } from "../design";
export const Roadmap: React.FC = () => {
  const t = useSeconds();
  return (
    <Shell
      kicker="3 تغييرات تبدأ بها"
      heading={"راقب اللحظة…\nثم غيّر البداية."}
      line="تجربة عملية لتنظيم عاداتك مع الهاتف."
    >
      {[
        { n: 1, x: 790, y: 800, l: "راقب" },
        { n: 2, x: 540, y: 1090, l: "سهّل" },
        { n: 3, x: 450, y: 1380, l: "بدّل الراحة" },
      ].map((p, i) => (
        <g key={p.n} opacity={ease(t, i * 0.45, i * 0.45 + 0.35)}>
          <circle cx={p.x} cy={p.y} r={87} fill={i === 1 ? C.blue : C.teal} />
          <Label x={p.x} y={p.y + 27} color={C.white} size={74}>
            {p.n}
          </Label>
          <Label x={p.x - 200} y={p.y + 15} size={49}>
            {p.l}
          </Label>
        </g>
      ))}
      <Arrow x1={750} y1={898} x2={610} y2={1005} p={ease(t, 0.6, 1.1)} />
      <Arrow x1={500} y1={1185} x2={410} y2={1295} p={ease(t, 1.1, 1.6)} />
    </Shell>
  );
};
