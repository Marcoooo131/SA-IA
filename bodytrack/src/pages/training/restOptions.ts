export const REST_OPTIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300].map((s) => ({
  value: s,
  label: s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
}));
