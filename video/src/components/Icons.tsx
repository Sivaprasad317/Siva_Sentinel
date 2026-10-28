// Small stroke icons, drawn inline so they render the same everywhere (no emoji fonts needed).
const P = { fill: "none", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Icon: React.FC<{ name: string; color: string; size?: number }> = ({ name, color, size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...P}>
    {name === "mic" && (
      <>
        <rect x="9" y="2.5" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
      </>
    )}
    {name === "globe" && (
      <>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M2.5 12h19M12 2.5c3 3.2 3 15.8 0 19M12 2.5c-3 3.2-3 15.8 0 19" />
      </>
    )}
    {name === "brain" && (
      <>
        <circle cx="6" cy="7" r="2.2" />
        <circle cx="18" cy="6" r="2.2" />
        <circle cx="12" cy="13" r="2.4" />
        <circle cx="6" cy="19" r="2.2" />
        <circle cx="18" cy="18" r="2.2" />
        <path d="M7.8 8.3l2.5 3M16.3 7.4l-2.6 3.8M10.2 14.6l-2.6 2.9M13.8 14.6l2.6 2" />
      </>
    )}
    {name === "clock" && (
      <>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 6.5V12l3.5 2.5" />
      </>
    )}
    {name === "shield" && (
      <>
        <path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z" />
        <path d="M8.5 12l2.5 2.5 4.5-5" />
      </>
    )}
    {name === "check" && (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <path d="M7.5 12.5l3 3 6-7" />
      </>
    )}
    {name === "rss" && (
      <>
        <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
        <circle cx="5" cy="19" r="1.5" />
      </>
    )}
    {name === "filter" && <path d="M3 4.5h18l-7 8.5v6l-4 2v-8z" />}
    {name === "link" && (
      <>
        <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
        <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
      </>
    )}
    {name === "rank" && <path d="M5 20V13M12 20V5M19 20v-9" />}
    {name === "spark" && <path d="M12 2.5l2.3 6.2 6.2 2.3-6.2 2.3L12 19.5l-2.3-6.2L3.5 11l6.2-2.3z" />}
    {name === "screen" && (
      <>
        <rect x="2.5" y="4" width="19" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    )}
  </svg>
);
