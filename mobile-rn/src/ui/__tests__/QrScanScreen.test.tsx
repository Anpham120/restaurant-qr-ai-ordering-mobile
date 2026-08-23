import { fireEvent, render, screen } from '@testing-library/react-native';

import { QrScanScreen } from '../QrScanScreen';

/**
 * `expo-camera` nói chuyện với tầng native, thứ không tồn tại trong jest.
 *
 * Bản giả ở đây giữ lại đúng hai thứ màn hình phụ thuộc: trạng thái quyền, và lời gọi
 * `onBarcodeScanned`. `CameraView` giả phơi hàm đó ra qua một biến ngoài để test tự bắn khung
 * quét vào — cách duy nhất kiểm được luật "camera bắn nhiều khung, chỉ nhận một lần".
 *
 * Tên biến bắt buộc có tiền tố `mock`: jest kéo `jest.mock` lên đầu file, nên factory chạy TRƯỚC
 * mọi khai báo, và jest chặn hẳn việc chạm biến ngoài để tránh đọc phải `undefined`.
 */
let mockBanKhung: ((e: { data: string }) => void) | null = null;
let mockQuyen: { granted: boolean; canAskAgain: boolean } | null = {
  granted: true,
  canAskAgain: true,
};
const mockXinQuyen = jest.fn();

jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [mockQuyen, mockXinQuyen],
  CameraView: (props: { onBarcodeScanned?: (e: { data: string }) => void; testID?: string }) => {
    mockBanKhung = props.onBarcodeScanned ?? null;
    const { Text: T } = jest.requireActual<typeof import('react-native')>('react-native');
    return <T testID={props.testID}>camera</T>;
  },
}));

beforeEach(() => {
  mockBanKhung = null;
  mockQuyen = { granted: true, canAskAgain: true };
  mockXinQuyen.mockClear();
});

describe('quét mã bàn', () => {
  it('quét trúng QR của bàn thì trả CẢ token lẫn mã bàn ra ngoài', async () => {
    const quetDuoc = jest.fn();
    await render(<QrScanScreen onHuy={jest.fn()} onQuetDuoc={quetDuoc} />);

    mockBanKhung?.({ data: 'https://order.cmcrestaurant.app/table/T01?qr=cmc-table-t01-qr' });

    expect(quetDuoc).toHaveBeenCalledWith({ qrToken: 'cmc-table-t01-qr', tableCode: 'T01' });
  });

  it('camera bắn nhiều khung liên tiếp nhưng CHỈ nhận một lần', async () => {
    // Không chốt lại thì màn hình sau bị mở chồng. Cờ phải có hiệu lực ngay ở khung kế tiếp, nên
    // nó là useRef chứ không phải useState — setState chỉ áp ở lượt dựng sau.
    const quetDuoc = jest.fn();
    await render(<QrScanScreen onHuy={jest.fn()} onQuetDuoc={quetDuoc} />);

    const khung = { data: 'cmc-table-t01-qr' };
    mockBanKhung?.(khung);
    mockBanKhung?.(khung);
    mockBanKhung?.(khung);

    expect(quetDuoc).toHaveBeenCalledTimes(1);
  });

  it('quét trúng QR wifi thì nói rõ, KHÔNG im lặng quét tiếp', async () => {
    // Khách đang chĩa máy vào đúng thứ họ nghĩ là mã bàn. Im lặng nghĩa là họ đứng đó mãi.
    const quetDuoc = jest.fn();
    await render(<QrScanScreen onHuy={jest.fn()} onQuetDuoc={quetDuoc} />);

    mockBanKhung?.({ data: 'WIFI:S:QuanAn;T:WPA;P:12345678;;' });

    await screen.findByText(/không phải QR của bàn/);
    expect(quetDuoc).not.toHaveBeenCalled();
  });

  it('sau khi báo sai mã, quét trúng mã đúng thì VẪN nhận', async () => {
    // Ca này chốt việc câu báo lỗi không khoá luôn bộ quét. Khách quét nhầm rồi quét lại là
    // luồng bình thường nhất của màn hình này.
    const quetDuoc = jest.fn();
    await render(<QrScanScreen onHuy={jest.fn()} onQuetDuoc={quetDuoc} />);

    mockBanKhung?.({ data: 'WIFI:S:QuanAn;;' });
    mockBanKhung?.({ data: 'cmc-table-t01-qr' });

    expect(quetDuoc).toHaveBeenCalledWith({ qrToken: 'cmc-table-t01-qr', tableCode: null });
  });
});

describe('quyền camera', () => {
  it('chưa biết quyền thì nói đang mở, không để khung đen im lặng', async () => {
    mockQuyen = null;
    await render(<QrScanScreen onHuy={jest.fn()} onQuetDuoc={jest.fn()} />);

    expect(screen.getByText('Đang mở camera…')).toBeTruthy();
  });

  it('còn hỏi lại được thì hiện nút xin quyền', async () => {
    mockQuyen = { granted: false, canAskAgain: true };
    await render(<QrScanScreen onHuy={jest.fn()} onQuetDuoc={jest.fn()} />);

    await fireEvent.press(screen.getByText('Cho phép dùng camera'));

    expect(mockXinQuyen).toHaveBeenCalled();
  });

  it('đã bị chặn hẳn thì KHÔNG hiện nút xin quyền, mà chỉ đường vào Cài đặt', async () => {
    // Hiện nút "Cho phép" lúc hệ điều hành đã khoá hẳn là hứa một việc bấm vào không xảy ra gì —
    // và khách sẽ bấm mãi. Bản Flutter gộp hai tình huống này thành một câu.
    mockQuyen = { granted: false, canAskAgain: false };
    await render(<QrScanScreen onHuy={jest.fn()} onQuetDuoc={jest.fn()} />);

    expect(screen.queryByText('Cho phép dùng camera')).toBeNull();
    expect(screen.getByText(/Cài đặt/)).toBeTruthy();
  });

  it('mọi trạng thái từ chối đều còn lối thoát về nhập tay', async () => {
    mockQuyen = { granted: false, canAskAgain: false };
    const huy = jest.fn();
    await render(<QrScanScreen onHuy={huy} onQuetDuoc={jest.fn()} />);

    await fireEvent.press(screen.getByText('Quay lại nhập mã bằng tay'));

    expect(huy).toHaveBeenCalled();
  });
});
