// 保存先を差し替えられるよう、localStorage への直接アクセスをここに集約する
export const appStorage = {
  getItem: (key: string): string | null => localStorage.getItem(key),
  setItem: (key: string, value: string): void => localStorage.setItem(key, value),
  removeItem: (key: string): void => localStorage.removeItem(key),
};
