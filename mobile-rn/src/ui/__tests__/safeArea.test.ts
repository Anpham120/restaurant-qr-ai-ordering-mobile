import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Canh một bất biến mà jest KHÔNG quan sát được lúc chạy.
 *
 * `SafeAreaView` của `react-native` là no-op trên Android — nó chỉ chừa lề trên iOS. Trên máy
 * Android thật, tiêu đề mọi màn hình bị thanh trạng thái đè lên. Nhưng jest render vào cây ảo,
 * không có thanh trạng thái nào để đè, nên mọi phép kiểm giao diện vẫn xanh. Lỗi này chỉ lộ ra khi
 * cầm điện thoại lên, và nó đã sống suốt nhiều lượt xây tính năng.
 *
 * Vì không dựng lại được tình huống trong jest, canh ở TẦNG MÃ NGUỒN — cùng cách
 * `hubLayoutAudit.test.ts` bên web và `PreAuthorizeExpressionTest` bên backend đang làm.
 */
describe('lề an toàn', () => {
  const app = readFileSync(join(__dirname, '..', '..', '..', 'App.tsx'), 'utf8');

  it('KHÔNG lấy SafeAreaView từ react-native', () => {
    const nhapTuRN = /import\s*\{[^}]*\bSafeAreaView\b[^}]*\}\s*from\s*'react-native'/;

    expect(app).not.toMatch(nhapTuRN);
  });

  it('lấy từ react-native-safe-area-context', () => {
    expect(app).toMatch(/from\s*'react-native-safe-area-context'/);
    expect(app).toContain('SafeAreaView');
  });

  it('bọc toàn bộ cây trong SafeAreaProvider', () => {
    // Thiếu provider thì SafeAreaView của thư viện trả lề bằng 0 và im lặng — trông hệt như bản
    // no-op vừa thay ra.
    expect(app).toContain('SafeAreaProvider');
    expect(app).toMatch(/<SafeAreaProvider>/);
  });
});
