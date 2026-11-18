import { useI18n } from 'vue-i18n';

// 业务枚举值（status / priority / source 等）统一翻译：enum_<value>
export function useStatusLabel() {
  const { t, te } = useI18n();
  return (value) => {
    if (value === null || value === undefined || value === '') return '';
    const key = `enum_${String(value).toLowerCase().replace(/[-\s]/g, '_')}`;
    return te(key) ? t(key) : String(value);
  };
}
