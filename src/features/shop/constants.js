export const CATEGORIES = [
  { value: 'api-key', label: 'Api key' },
  { value: 'theme', label: 'Theme' },
  { value: 'nitro-boost', label: 'Nitro + Boost' },
  { value: 'commission-bot', label: 'Commission Bot' },
  { value: 'vertex-email', label: 'Email สำหรับ Vertex' },
];

export function getCategoryLabel(value) {
  const found = CATEGORIES.find((c) => c.value === value);
  return found ? found.label : value;
}
