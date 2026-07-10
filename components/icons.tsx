// Tabler-style line icons, 1.8 stroke. Sized 1em so they inherit text size;
// color inherits via `stroke="currentColor"` unless overridden.
import type { SVGProps } from "react";

function Base({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function MapPin(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </Base>
  );
}

export function Clock(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Base>
  );
}

export function Users(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    </Base>
  );
}

export function Camera(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </Base>
  );
}

export function Upload(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="M12 15V3" />
      <path d="M7 8l5-5 5 5" />
    </Base>
  );
}

export function ArrowRight(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </Base>
  );
}

export function Calendar(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </Base>
  );
}

export function Car(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
      <path d="M4 11h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1M3 17a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
      <path d="M9 17h6" />
    </Base>
  );
}

export function AlertTriangle(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </Base>
  );
}

export function X(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Base>
  );
}

export function Pause(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M9 5v14M15 5v14" />
    </Base>
  );
}

export function Play(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M8 5v14l11-7z" />
    </Base>
  );
}

export function Pencil(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.83-2.83L5 17.5z" />
      <path d="M13.5 6.5l4 4" />
    </Base>
  );
}

// Handling cues on cards: a bounded set (hot · cold · shelf-stable · perishable)
// where a glyph reads faster than the words alone — the one thing a volunteer
// must prepare for. Food-type categories stay text (open-ended, clearer as words).
export function Flame(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 3c1 2.5 4 4.5 4 8a4 4 0 0 1-8 0c0-1.2.5-2.2 1.2-3 .2 1 1 1.6 1.8 1.6 0-2.4-1-4.4 1-6.6z" />
    </Base>
  );
}

export function Snowflake(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
    </Base>
  );
}

export function Box(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
      <path d="M4 8l8 4 8-4M12 12v8" />
    </Base>
  );
}
