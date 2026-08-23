// expo-secure-store nói chuyện với Keychain/Keystore qua tầng native. Trong `jest` không có
// tầng đó, nên mọi lời gọi thật sẽ ném lỗi.
//
// Đây là lý do lớp lưu trữ trong `src/core/luuTruAnToan.ts` nhận kho qua tham số: phần quyết
// định (hỏng thì xoá, hết hạn thì xoá) kiểm được mà không cần thiết bị thật. Bản giả ở đây chỉ
// để những test lỡ chạm vào module này không nổ vì lý do không liên quan.
jest.mock('expo-secure-store', () => {
  const bo = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => bo.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => {
      bo.set(k, v);
    },
    deleteItemAsync: async (k: string) => {
      bo.delete(k);
    },
  };
});
