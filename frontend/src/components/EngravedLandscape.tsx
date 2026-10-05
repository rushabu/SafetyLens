import { useId, useMemo, type CSSProperties } from "react";

/**
 * Engraved blue-ink landscape (contour-hatched hills, river, tea-garden rows, drilling derrick,
 * storage tanks, pipeline). Drawn procedurally so it scales cleanly and follows the theme
 * colours (--line-art / --line-art-soft). Purely decorative.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const g = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));

/** 1 inside the range, easing to 0 over `fade` px at the right end so ridges settle into the plain. */
function taper(x: number, end: number, fade: number) {
  const t = Math.min(1, Math.max(0, (end - x) / fade));
  return t * t * (3 - 2 * t);
}

function ridgeFar(x: number) {
  const raw = 318 - 150 * g(x, 210, 95) - 105 * g(x, 410, 105) - 70 * g(x, 610, 85) - 30 * g(x, 740, 60) - 5 * Math.sin(x / 17) - 3 * Math.sin(x / 7.3);
  return 470 - (470 - raw) * taper(x, 840, 190);
}
function ridgeMid(x: number) {
  const raw = 402 - 78 * g(x, 110, 120) - 58 * g(x, 470, 130) - 40 * g(x, 680, 90) - 4 * Math.sin(x / 13) - 2 * Math.sin(x / 5.1);
  return 482 - (482 - raw) * taper(x, 900, 200);
}

function line(points: [number, number][]) {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
}

function contourSet(ridge: (x: number) => number, x0: number, x1: number, bottom: number, gap: number, wobble: number, seed: number) {
  const r = rng(seed);
  const lines: string[] = [];
  const n = Math.ceil((bottom - 120) / gap);
  for (let k = 1; k < n; k++) {
    const phase = r() * 10;
    const pts: [number, number][] = [];
    for (let x = x0; x <= x1; x += 5) {
      const base = ridge(x);
      const depth = k * gap * (0.55 + 0.45 * g(x, (x0 + x1) / 2, (x1 - x0) * 0.8));
      pts.push([x, base + depth + wobble * Math.sin(x / (9 + (k % 5)) + phase)]);
    }
    lines.push(line(pts));
  }
  return lines;
}

function outline(ridge: (x: number) => number, x0: number, x1: number, bottom: number) {
  const pts: [number, number][] = [];
  for (let x = x0; x <= x1; x += 4) pts.push([x, ridge(x)]);
  return `${line(pts)}L${x1},${bottom}L${x0},${bottom}Z`;
}

function ridgeLine(ridge: (x: number) => number, x0: number, x1: number) {
  const pts: [number, number][] = [];
  for (let x = x0; x <= x1; x += 4) pts.push([x, ridge(x)]);
  return line(pts);
}

function Derrick() {
  const baseL = 872;
  const baseR = 1028;
  const topL = 937;
  const topR = 963;
  const yTop = 118;
  const yBase = 512;
  const levels = 11;
  const at = (t: number) => {
    const y = yTop + (yBase - yTop) * t;
    return { y, l: topL + (baseL - topL) * t, r: topR + (baseR - topR) * t };
  };
  const girts: string[] = [];
  const braces: string[] = [];
  for (let i = 0; i <= levels; i++) {
    const a = at(i / levels);
    girts.push(`M${a.l},${a.y}L${a.r},${a.y}`);
    if (i < levels) {
      const b = at((i + 1) / levels);
      braces.push(`M${a.l},${a.y}L${b.r},${b.y}M${a.r},${a.y}L${b.l},${b.y}`);
    }
  }
  const mb = at(0.28);
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* legs */}
      <path d={`M${baseL},${yBase}L${topL},${yTop}M${baseR},${yBase}L${topR},${yTop}`} strokeWidth={2.2} pathLength={1} className="ls-draw" style={{ "--d": "900ms" } as CSSProperties} />
      <path d={girts.join("")} strokeWidth={1.1} pathLength={1} className="ls-draw" style={{ "--d": "1300ms" } as CSSProperties} />
      <path d={braces.join("")} strokeWidth={0.7} opacity={0.85} />
      {/* crown block + gin pole */}
      <rect x={929} y={100} width={42} height={18} strokeWidth={1.4} fill="var(--surface)" />
      <path d="M933,104h34M933,109h34M933,114h34M950,100v-14M944,86h12" strokeWidth={0.8} />
      {/* aircraft-warning beacon */}
      <circle cx={950} cy={81} r={3.2} fill="var(--sif)" stroke="none" className="ls-beacon" />
      {/* travelling block and line */}
      <path d="M950,118V300" strokeWidth={0.6} />
      <rect x={943} y={300} width={14} height={22} rx={2} strokeWidth={1} fill="var(--surface)" />
      {/* monkey board */}
      <path d={`M${mb.l - 22},${mb.y}H${mb.r + 4}M${mb.l - 22},${mb.y}v-12M${mb.l - 14},${mb.y}v-12M${mb.l - 22},${mb.y - 12}H${mb.l}`} strokeWidth={1} />
      {/* drill floor */}
      <rect x={826} y={512} width={250} height={14} strokeWidth={1.4} fill="var(--surface)" />
      <path d="M826,517H1076M826,522H1076" strokeWidth={0.5} />
      {Array.from({ length: 21 }).map((_, i) => (
        <path key={i} d={`M${830 + i * 12},512v-20`} strokeWidth={0.8} />
      ))}
      <path d="M826,492H1076M826,500H1076" strokeWidth={0.9} />
      {/* substructure */}
      <path d="M836,526L836,566M1066,526L1066,566M836,526L951,566M1066,526L951,566M836,566L951,526M1066,566L951,526" strokeWidth={0.8} />
      {/* dog house */}
      <rect x={1076} y={478} width={58} height={48} strokeWidth={1.2} fill="var(--surface)" />
      <path d="M1076,478l29,-14l29,14" strokeWidth={1.2} fill="var(--surface)" />
      {Array.from({ length: 9 }).map((_, i) => (
        <path key={i} d={`M${1082 + i * 6},486v34`} strokeWidth={0.5} />
      ))}
      <rect x={1095} y={492} width={16} height={20} strokeWidth={0.9} fill="var(--surface)" />
    </g>
  );
}

function Stairs() {
  // Engraved stairway from the drill floor to the paved ground (echoes the reference image).
  const steps = 13;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x0 = 826 - 120 * t;
    const y = 526 + 70 * t;
    parts.push(`M${x0},${y}H${x0 + 52}`);
  }
  return (
    <g strokeLinecap="round">
      <path d="M826,526L706,596M878,526L758,596" strokeWidth={1.3} />
      <path d={parts.join("")} strokeWidth={0.9} />
      <path d="M826,506L706,576M826,506V526M706,576V596" strokeWidth={1} />
      {Array.from({ length: 7 }).map((_, i) => (
        <path key={i} d={`M${826 - i * 20},${506 + i * 11.7}v20`} strokeWidth={0.6} />
      ))}
    </g>
  );
}

function Tanks() {
  const tank = (cx: number, top: number, rx: number, h: number, key: string) => {
    const hatch: string[] = [];
    for (let x = cx - rx + 4; x < cx + rx; x += 4) {
      const t = (x - (cx - rx)) / (2 * rx);
      const len = h * (0.35 + 0.65 * Math.sin(Math.PI * t));
      hatch.push(`M${x},${top + h}v-${len.toFixed(1)}`);
    }
    return (
      <g key={key}>
        <path d={`M${cx - rx},${top}V${top + h}A${rx},${rx * 0.22} 0 0 0 ${cx + rx},${top + h}V${top}`} strokeWidth={1.3} fill="var(--surface)" />
        <ellipse cx={cx} cy={top} rx={rx} ry={rx * 0.22} strokeWidth={1.3} fill="var(--surface)" />
        <path d={`M${cx - rx},${top}Q${cx},${top - rx * 0.45} ${cx + rx},${top}`} strokeWidth={0.8} fill="none" />
        <path d={hatch.join("")} strokeWidth={0.5} opacity={0.75} />
        {/* spiral stair */}
        <path d={`M${cx + rx - 4},${top + h}L${cx - rx + 10},${top + 6}`} strokeWidth={0.7} />
        <path d={`M${cx + rx - 4},${top + h - 6}L${cx - rx + 10},${top}`} strokeWidth={0.5} />
      </g>
    );
  };
  return (
    <g>
      {tank(1170, 452, 46, 76, "a")}
      {tank(1116, 474, 30, 54, "b")}
      {/* flare stack */}
      <path d="M1188,452V300M1184,300h8M1186,452l-6,-90M1190,452l6,-90" strokeWidth={0.9} />
      <path d="M1188,300c-5,-8 2,-12 0,-22c5,8 4,14 0,22" strokeWidth={0.9} fill="none" className="ls-flame" />
    </g>
  );
}

function Ground() {
  // Paved apron in perspective, like the terrace in the reference image.
  const lines: string[] = [];
  for (let i = 0; i <= 8; i++) {
    const xTop = 760 + i * 55;
    const xBot = 640 + i * 75;
    lines.push(`M${xTop},566L${xBot},640`);
  }
  [566, 586, 610, 640].forEach((y) => lines.push(`M${700 - (y - 566) * 0.8},${y}H1200`));
  return <path d={lines.join("")} strokeWidth={0.7} opacity={0.75} />;
}

function Pipeline() {
  const supports = Array.from({ length: 10 }).map((_, i) => `M${200 + i * 58},${605 - i * 2.2}v14`);
  return (
    <g strokeLinecap="round">
      <path d="M140,606C420,598 600,584 760,566M140,614C420,606 600,592 760,574" strokeWidth={1.3} />
      <path d={supports.join("")} strokeWidth={0.8} />
      <path d="M760,566L1080,560M760,574L1080,568" strokeWidth={1.1} />
    </g>
  );
}

function TeaGarden({ seed }: { seed: number }) {
  const r = rng(seed);
  const rows: string[] = [];
  for (let row = 0; row < 7; row++) {
    const y0 = 520 + row * 17;
    for (let x = -10 + (row % 2) * 9; x < 470 - row * 18; x += 18) {
      const y = y0 + 4 * Math.sin(x / 60 + row);
      rows.push(`M${x},${y}a9,${6 + r() * 2} 0 0 1 18,0`);
    }
  }
  return <path d={rows.join("")} strokeWidth={0.8} opacity={0.9} fill="none" />;
}

function Tree({ x, y, s, seed }: { x: number; y: number; s: number; seed: number }) {
  const r = rng(seed);
  const dots: string[] = [];
  const clusters = [
    [0, -78, 30],
    [-26, -60, 24],
    [26, -62, 24],
    [-10, -98, 20],
    [16, -94, 18],
  ];
  clusters.forEach(([cx, cy, rad]) => {
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * rad;
      const px = x + (cx + Math.cos(a) * d) * s;
      const py = y + (cy + Math.sin(a) * d * 0.7) * s;
      dots.push(`M${px.toFixed(1)},${py.toFixed(1)}h${(1.6 + r() * 2.4).toFixed(1)}`);
    }
  });
  return (
    <g strokeLinecap="round">
      <path d={`M${x},${y}C${x - 2},${y - 30 * s} ${x + 6 * s},${y - 50 * s} ${x - 4 * s},${y - 80 * s}M${x},${y - 40 * s}L${x + 22 * s},${y - 62 * s}M${x - 1},${y - 50 * s}L${x - 20 * s},${y - 64 * s}`} strokeWidth={1.6} />
      <path d={dots.join("")} strokeWidth={1.4} />
    </g>
  );
}

export default function EngravedLandscape({ className, variant = "hero" }: { className?: string; variant?: "hero" | "band" }) {
  const id = useId().replace(/:/g, "");
  const art = useMemo(
    () => ({
      farOutline: outline(ridgeFar, 0, 840, 470),
      farRidge: ridgeLine(ridgeFar, 0, 840),
      far: contourSet(ridgeFar, 0, 840, 470, 7, 1.6, 7),
      midOutline: outline(ridgeMid, 0, 900, 482),
      midRidge: ridgeLine(ridgeMid, 0, 900),
      mid: contourSet(ridgeMid, 0, 900, 482, 6.2, 1.1, 11),
      water: (() => {
        const r = rng(3);
        const out: string[] = [];
        for (let i = 0; i < 26; i++) {
          const y = 470 + i * 2.6 + r() * 1.5;
          let x = r() * 40;
          while (x < 860 - i * 6) {
            const len = 18 + r() * 70;
            out.push(`M${x.toFixed(1)},${y.toFixed(1)}h${len.toFixed(1)}`);
            x += len + 10 + r() * 50;
          }
        }
        return out.join("");
      })(),
    }),
    [],
  );

  const band = variant === "band";
  // Hero only: layers settle in back-to-front, outlines are drawn, then the river and sky keep moving.
  const layer = (d: number) => (band ? {} : { className: "ls-layer", style: { "--d": `${d}ms` } as CSSProperties });
  const draw = (d: number) => (band ? {} : { pathLength: 1, className: "ls-draw", style: { "--d": `${d}ms` } as CSSProperties });
  return (
    <svg
      className={className}
      viewBox={band ? "0 140 900 360" : "0 0 1200 640"}
      preserveAspectRatio={band ? "xMidYMax slice" : "xMidYMax meet"}
      role="img"
      aria-label="Engraved line illustration of hills, a river and an oil drilling site"
      fill="none"
      stroke="var(--line-art)"
    >
      <defs>
        <clipPath id={`far-${id}`}>
          <path d={art.farOutline} />
        </clipPath>
        <clipPath id={`mid-${id}`}>
          <path d={art.midOutline} />
        </clipPath>
      </defs>
      {/* birds */}
      {!band && (
        <g {...layer(1400)}>
          <path d="M520,150q6,-6 12,0q6,-6 12,0M572,128q4,-4 8,0q4,-4 8,0M480,182q4,-4 8,0q4,-4 8,0" strokeWidth={0.9} opacity={0.7} className="ls-birds" />
        </g>
      )}
      {/* far ranges */}
      <g {...layer(0)}>
        <g clipPath={`url(#far-${id})`} stroke="var(--line-art-soft)" strokeWidth={0.7}>
          {art.far.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </g>
      <path d={art.farRidge} stroke="var(--line-art-soft)" strokeWidth={1.2} {...draw(0)} />
      {/* mid hills */}
      <g {...layer(250)}>
        <path d={art.midOutline} fill="var(--surface)" stroke="none" />
        <g clipPath={`url(#mid-${id})`} strokeWidth={0.6} opacity={0.75}>
          {art.mid.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </g>
      <path d={art.midRidge} strokeWidth={1.4} {...draw(250)} />
      {/* river */}
      <g {...layer(450)}>
        <path d={art.water} stroke="var(--line-art-soft)" strokeWidth={0.8} className={band ? undefined : "ls-water"} />
      </g>
      {!band && (
        <>
          <g {...layer(650)}>
            <TeaGarden seed={5} />
            <Tree x={96} y={548} s={1.15} seed={21} />
            <Tree x={430} y={560} s={0.85} seed={22} />
            <Tree x={630} y={566} s={0.7} seed={23} />
          </g>
          <g {...layer(800)}>
            <Pipeline />
            <Ground />
            <Stairs />
          </g>
          <g {...layer(900)}>
            <Derrick />
          </g>
          <g {...layer(1100)}>
            <Tanks />
          </g>
        </>
      )}
    </svg>
  );
}
