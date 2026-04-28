// FounderScope — Icons (lucide-style)
window.Icons = window.Icons || {};

function FsIcon(props) {
  const { d, size, stroke, fill, strokeWidth, children, ...rest } = props;
  return React.createElement('svg', {
    width: size || 16, height: size || 16, viewBox: '0 0 24 24',
    fill: fill || 'none', stroke: stroke || 'currentColor',
    strokeWidth: strokeWidth || 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': 'true', ...rest,
  }, d ? React.createElement('path', { d }) : children);
}

function mkIcon(d) {
  return function(p) { return React.createElement(FsIcon, { ...p, d }); };
}
function mkIconC(children) {
  return function(p) { return React.createElement(FsIcon, p, children); };
}

const e = React.createElement;
const path = (d, key) => e('path', { d, key });
const circle = (cx, cy, r, key) => e('circle', { cx, cy, r, key });
const rect = (x, y, w, h, rx, key) => e('rect', { x, y, width: w, height: h, rx, key });

window.Icons.IconSearch = mkIconC([circle(11,11,7,'a'), path('m20 20-3.5-3.5','b')]);
window.Icons.IconHome = mkIcon('M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z');
window.Icons.IconClock = mkIconC([circle(12,12,9,'a'), path('M12 7v5l3 2','b')]);
window.Icons.IconSettings = mkIconC([circle(12,12,3,'a'), path('M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z','b')]);
window.Icons.IconChevronLeft = mkIcon('m15 18-6-6 6-6');
window.Icons.IconChevronRight = mkIcon('m9 18 6-6-6-6');
window.Icons.IconChevronDown = mkIcon('m6 9 6 6 6-6');
window.Icons.IconArrowRight = mkIconC([path('M5 12h14','a'), path('m13 6 6 6-6 6','b')]);
window.Icons.IconExternal = mkIconC([path('M15 3h6v6','a'), path('M10 14 21 3','b'), path('M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5','c')]);
window.Icons.IconClose = mkIcon('M18 6 6 18M6 6l12 12');
window.Icons.IconRefresh = mkIconC([path('M3 12a9 9 0 0 1 15-6.7L21 8','a'), path('M21 3v5h-5','b'), path('M21 12a9 9 0 0 1-15 6.7L3 16','c'), path('M3 21v-5h5','d')]);
window.Icons.IconCommand = mkIcon('M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z');
window.Icons.IconCorner = mkIcon('M9 10 4 15l5 5');
window.Icons.IconBook = mkIconC([path('M4 4h13a3 3 0 0 1 3 3v13a1 1 0 0 1-1 1H7a3 3 0 0 1-3-3z','a'), path('M4 17a3 3 0 0 1 3-3h13','b')]);
window.Icons.IconBuilding = mkIconC([rect(4,3,16,18,1.5,'a'), path('M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01','b')]);
window.Icons.IconUsers = mkIconC([circle(9,8,3.5,'a'), path('M2 20a7 7 0 0 1 14 0','b'), circle(17,6,3,'c'), path('M22 17a5.5 5.5 0 0 0-5-5','d')]);
window.Icons.IconCoin = mkIconC([circle(12,12,9,'a'), path('M14.5 9h-3a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3h-3.5M12 7v1.5M12 15v1.5','b')]);
window.Icons.IconChart = mkIconC([path('M3 3v18h18','a'), path('m7 14 3-3 3 2 5-6','b')]);
window.Icons.IconGlobe = mkIconC([circle(12,12,9,'a'), path('M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18','b')]);
window.Icons.IconQuote = mkIcon('M7 7h4v6a4 4 0 0 1-4 4M14 7h4v6a4 4 0 0 1-4 4');
window.Icons.IconCheck = mkIcon('m5 13 4 4L19 7');
window.Icons.IconWarn = mkIconC([path('M12 4 2 21h20z','a'), path('M12 10v4M12 17v.5','b')]);
window.Icons.IconSparkle = mkIconC([path('M12 3v6M12 15v6M3 12h6M15 12h6','a'), path('m6 6 3 3M15 15l3 3M6 18l3-3M15 9l3-3','b')]);
window.Icons.IconLink = mkIconC([path('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11 7','a'), path('M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7L13 17','b')]);
window.Icons.IconEye = mkIconC([path('M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z','a'), circle(12,12,3,'b')]);
window.Icons.IconEyeOff = mkIconC([path('M3 3l18 18','a'), path('M10.6 6.1A10.1 10.1 0 0 1 12 6c6 0 10 6 10 6a13.5 13.5 0 0 1-2.7 3.4M6.6 6.6C3.7 8.5 2 12 2 12s4 6 10 6a9.9 9.9 0 0 0 4.4-1','b'), path('M9 9.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-1.1','c')]);
window.Icons.IconMoon = mkIcon('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z');
window.Icons.IconSun = mkIconC([circle(12,12,4,'a'), path('M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4','b')]);
window.Icons.IconMenu = mkIcon('M3 6h18M3 12h18M3 18h18');
window.Icons.IconPin = mkIconC([path('M12 17v5','a'), path('M9 3h6l-1 6 4 3v2H6v-2l4-3z','b')]);
window.Icons.IconChevronsLeft = mkIconC([path('m11 18-6-6 6-6','a'), path('m18 18-6-6 6-6','b')]);
window.Icons.IconPanel = mkIconC([rect(3,4,18,16,2,'a'), path('M9 4v16','b')]);
window.Icons.IconTwitter = mkIcon('M21 6c-.7.3-1.4.5-2.2.6.8-.5 1.4-1.2 1.7-2.1-.7.4-1.6.7-2.4.9A3.8 3.8 0 0 0 12 8.4a10.8 10.8 0 0 1-7.8-4 3.8 3.8 0 0 0 1.2 5.1c-.6 0-1.2-.2-1.7-.4 0 1.8 1.3 3.4 3 3.7-.5.2-1.1.2-1.7.1.5 1.5 1.9 2.6 3.5 2.6A7.7 7.7 0 0 1 3 17a10.8 10.8 0 0 0 5.9 1.7c7 0 11-5.9 11-11v-.5c.7-.5 1.3-1.2 1.8-1.9z');
window.Icons.IconLinkedIn = mkIconC([rect(3,3,18,18,2,'a'), path('M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 17v-7','b')]);
window.Icons.IconKey = mkIconC([circle(8,15,4,'a'), path('m11 13 7-7 3 3-3 3-2-2-2 2-2-2-1 3z','b')]);
