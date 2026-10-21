import type { ReactNode, SVGProps } from 'react';

const base = (children: ReactNode) =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
        {children}
      </svg>
    );
  };

export const IMap = base(<><path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z" /><path d="M9 4v13M15 7v13" /></>);
export const IBell = base(<><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>);
export const IPin = base(<><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>);
export const IUser = base(<><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></>);
export const IPlus = base(<path d="M12 5v14M5 12h14" />);
export const ILocate = base(<><circle cx="12" cy="12" r="3.2" /><circle cx="12" cy="12" r="7.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>);
export const IFit = base(<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />);
export const ISos = base(<><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4.5M12 17.4v.1" /></>);
export const ICopy = base(<><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" /></>);
export const IShare = base(<><path d="M12 15V3M8 7l4-4 4 4" /><path d="M5 12v6a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6" /></>);
export const ITrash = base(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>);
export const IEdit = base(<><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>);
export const IClose = base(<path d="m6 6 12 12M18 6 6 18" />);
export const ICheck = base(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IBolt = base(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />);
export const INav = base(<path d="m4 11 16-7-7 16-2.2-6.8L4 11Z" />);
export const IEye = base(<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>);
export const IEyeOff = base(<><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.7C3.9 8.5 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>);
export const IRoute = base(<><circle cx="6" cy="19" r="2.2" /><circle cx="18" cy="5" r="2.2" /><path d="M8.2 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8" /></>);
export const IShield = base(<><path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6L12 3Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>);
export const IChevron = base(<path d="m9 6 6 6-6 6" />);
export const ISun = base(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" /></>);
export const IMoon = base(<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />);
export const IRefresh = base(<><path d="M20 11a8 8 0 0 0-14.5-3.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14.5 3.5L20 15M20 20v-5h-5" /></>);
export const IHeart = base(<path d="M12 20s-7.5-4.6-9-9.5A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 9 3.5C19.500 15.400 12 20 12 20Z" />);
export const IClock = base(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>);
export const IMountain = base(<path d="m3 19 6-10 4 6 2.5-3.5L21 19H3Z" />);
export const ITarget = base(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>);
export const ISpeed = base(<><path d="M4.5 18A9 9 0 1 1 19.500 18" /><path d="m12 13 4-5" /></>);
export const IBattery = base(<><rect x="2.500" y="7" width="17" height="10" rx="2.500" /><path d="M22 10.500v3" /></>);
export const ICompass = base(<><circle cx="12" cy="12" r="9" /><path d="m15.500 8.500-2 5-5 2 2-5 5-2Z" /></>);
export const IPlay = base(<path d="m7 4 13 8-13 8V4Z" />);
