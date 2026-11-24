import type { ReactNode } from "react";
import { cn } from "./cn";

/** Hand-drawn 24px stroke icons. Always decorative (aria-hidden): the control around them carries the name. */
function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("size-[1.125rem] shrink-0", className)}
    >
      {children}
    </svg>
  );
}

type P = { className?: string };

export const IconLogos = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.75" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="3.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="3.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.75" />
  </Icon>
);
export const IconCompare = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="4" width="7" height="16" rx="1.75" />
    <rect x="13.5" y="4" width="7" height="16" rx="1.75" />
    <path d="M6 15h2M16 11h2" />
  </Icon>
);
export const IconForms = (p: P) => (
  <Icon {...p}>
    <path d="M9 4h6v2.5H9z" />
    <path d="M15 5h2.5A1.5 1.5 0 0 1 19 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-13A1.5 1.5 0 0 1 6.5 5H9" />
    <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" />
  </Icon>
);
export const IconTools = (p: P) => (
  <Icon {...p}>
    <path d="M14.5 6.5a4 4 0 0 0 5 5l-8.25 8.25a2 2 0 0 1-2.83-2.83L16.67 8.67" />
    <path d="M14.5 6.5 17.5 3.5l3 3-3 3" />
    <path d="M4 4l5 5M4 4h2.5M4 4v2.5" />
  </Icon>
);
export const IconSettings = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.75v2.5M12 18.75v2.5M2.75 12h2.5M18.75 12h2.5M5.46 5.46l1.77 1.77M16.77 16.77l1.77 1.77M5.46 18.54l1.77-1.77M16.77 7.23l1.77-1.77" />
  </Icon>
);
export const IconMenu = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);
export const IconClose = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const IconUpload = (p: P) => (
  <Icon {...p}>
    <path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5" />
    <path d="M4 14.5v4A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-4" />
  </Icon>
);
export const IconDownload = (p: P) => (
  <Icon {...p}>
    <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5" />
    <path d="M4 16.5v2A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-2" />
  </Icon>
);
export const IconCheck = (p: P) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
export const IconX = (p: P) => (
  <Icon {...p}>
    <path d="M7 7l10 10M17 7 7 17" />
  </Icon>
);
export const IconAlert = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5 21.5 20h-19z" />
    <path d="M12 10v4.5M12 17.25v.25" />
  </Icon>
);
export const IconInfo = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.75V8" />
  </Icon>
);
export const IconSun = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.75v1.5M12 19.75v1.5M2.75 12h1.5M19.75 12h1.5M5.46 5.46l1.06 1.06M17.48 17.48l1.06 1.06M5.46 18.54l1.06-1.06M17.48 6.52l1.06-1.06" />
  </Icon>
);
export const IconMoon = (p: P) => (
  <Icon {...p}>
    <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />
  </Icon>
);
export const IconMonitor = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="12.5" rx="2" />
    <path d="M9 20.5h6M12 16.5v4" />
  </Icon>
);
export const IconChevronRight = (p: P) => (
  <Icon {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Icon>
);
export const IconSparkles = (p: P) => (
  <Icon {...p}>
    <path d="M11 3.5 12.6 8.4 17.5 10l-4.9 1.6L11 16.5l-1.6-4.9L4.5 10l4.9-1.6z" />
    <path d="M18 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </Icon>
);
export const IconRefresh = (p: P) => (
  <Icon {...p}>
    <path d="M19.5 12a7.5 7.5 0 0 1-13.1 5M4.5 12a7.5 7.5 0 0 1 13.1-5" />
    <path d="M17.75 3.5v3.75H14M6.25 20.5v-3.75H10" />
  </Icon>
);
export const IconPencil = (p: P) => (
  <Icon {...p}>
    <path d="M15 5.5l3.5 3.5M4.5 19.5l.9-4.1L16.2 4.6a1.4 1.4 0 0 1 2 0l1.2 1.2a1.4 1.4 0 0 1 0 2L8.6 18.6z" />
  </Icon>
);
export const IconPlus = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const IconTrash = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
  </Icon>
);
export const IconArrowUp = (p: P) => (
  <Icon {...p}>
    <path d="M12 19V5m0 0-5.5 5.5M12 5l5.5 5.5" />
  </Icon>
);
export const IconArrowDown = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14m0 0-5.5-5.5M12 19l5.5-5.5" />
  </Icon>
);
export const IconImage = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.75" />
    <path d="M20.5 15.5 15.5 11 6 19.5" />
  </Icon>
);
export const IconExpand = (p: P) => (
  <Icon {...p}>
    <path d="M14.5 4.5h5v5M9.5 19.5h-5v-5M19.5 4.5l-6 6M4.5 19.5l6-6" />
  </Icon>
);
export const IconTrophy = (p: P) => (
  <Icon {...p}>
    <path d="M8 4.5h8v5a4 4 0 0 1-8 0z" />
    <path d="M8 6.5H5.5a2.5 2.5 0 0 0 2.6 3M16 6.5h2.5a2.5 2.5 0 0 1-2.6 3M12 13.5V17M8.5 20h7M9.5 17h5" />
  </Icon>
);
export const IconLock = (p: P) => (
  <Icon {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Icon>
);
export const IconFile = (p: P) => (
  <Icon {...p}>
    <path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z" />
    <path d="M13.5 3.5v5h5" />
  </Icon>
);
export const IconClock = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
export const IconMinus = (p: P) => (
  <Icon {...p}>
    <path d="M6 12h12" />
  </Icon>
);
export const IconCircle = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="7.5" />
  </Icon>
);

/** The LogoBench mark: a bench with a logo disc resting on it. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" className="fill-accent" />
      <circle cx="16" cy="12.5" r="5" fill="none" stroke="white" strokeWidth="2.4" />
      <rect x="7" y="19.5" width="18" height="2.6" rx="1.3" fill="white" />
      <rect x="9" y="22" width="2.2" height="4" rx="1" fill="white" fillOpacity="0.75" />
      <rect x="20.8" y="22" width="2.2" height="4" rx="1" fill="white" fillOpacity="0.75" />
    </svg>
  );
}
