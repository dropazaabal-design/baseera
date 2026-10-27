import React from "react";
import type { Caption } from "@remotion/captions";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "./design";

// A shared RTL template. Each scene owns its literal word array and local timings.
export const CaptionLayer: React.FC<{ captions: Caption[] }> = ({
  captions,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const pages: Caption[][] = [];
  let p: Caption[] = [];
  let chars = 0;
  for (const c of captions) {
    if (p.length && (chars + c.text.length > 36 || p.length >= 6)) {
      pages.push(p);
      p = [];
      chars = 0;
    }
    p.push(c);
    chars += c.text.length;
    if (c.pageBreakAfter) {
      pages.push(p);
      p = [];
      chars = 0;
    }
  }
  if (p.length) pages.push(p);
  const page = pages.find(
    (a, i) =>
      ms >= a[0].startMs &&
      ms < (pages[i + 1]?.[0].startMs ?? a[a.length - 1].endMs + 200),
  );
  if (!page) return null;
  return (
    <div
      dir="rtl"
      style={{
        position: "absolute",
        left: 100,
        right: 100,
        top: 1442,
        height: 155,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Cairo",
        fontSize: 49,
        fontWeight: 600,
        lineHeight: 1.5,
        textAlign: "center",
        color: C.white,
      }}
    >
      <div
        style={{
          padding: "10px 28px",
          borderRadius: 12,
          backgroundColor: "rgba(3,7,13,.90)",
          maxWidth: "100%",
          whiteSpace: "normal",
        }}
      >
        {page.map((c, i) => (
          <React.Fragment key={i}>
            <span
              style={{
                color: ms >= c.startMs && ms < c.endMs ? C.green : C.white,
              }}
            >
              {c.text.trim()}
            </span>
            {i < page.length - 1 ? " " : ""}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
