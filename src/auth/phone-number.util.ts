const INDONESIA_PHONE_PATTERN = /^\+628\d{7,12}$/;

export function normalizeIndonesiaPhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const compact = value.trim().replace(/[\s()-]/g, '');

  if (/^08\d+$/.test(compact)) return `+62${compact.slice(1)}`;
  if (/^628\d+$/.test(compact)) return `+${compact}`;
  if (/^\+628\d+$/.test(compact)) return compact;

  return compact;
}

export { INDONESIA_PHONE_PATTERN };
