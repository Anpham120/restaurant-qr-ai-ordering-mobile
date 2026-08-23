import { khoTrongBoNho } from '../../luuTruAnToan';
import { CauHinhStore } from '../cauHinhStore';

const CAU_HINH = { apiBaseUrl: 'http://192.168.1.5:8081', imageBaseUrl: 'http://192.168.1.5:8080' };

describe('CauHinhStore', () => {
  it('lưu rồi đọc lại được', async () => {
    const store = new CauHinhStore(khoTrongBoNho());
    await store.luu(CAU_HINH);

    expect(await store.doc()).toEqual(CAU_HINH);
  });

  it('chưa cấu hình gì thì đọc ra null', async () => {
    expect(await new CauHinhStore(khoTrongBoNho()).doc()).toBeNull();
  });

  it('dữ liệu hỏng thì xoá và đọc ra null', async () => {
    const kho = khoTrongBoNho({ cau_hinh_may_chu_v1: 'không phải json' });

    expect(await new CauHinhStore(kho).doc()).toBeNull();
    expect(await kho.doc('cau_hinh_may_chu_v1')).toBeNull();
  });

  it('thiếu trường thì thành chuỗi rỗng chứ không phải undefined', async () => {
    // Màn hình cấu hình đổ thẳng hai giá trị này vào ô nhập. `undefined` biến ô nhập từ có kiểm
    // soát thành không kiểm soát, và React cảnh báo giữa lúc người dùng đang gõ.
    const kho = khoTrongBoNho({ cau_hinh_may_chu_v1: '{"apiBaseUrl":"http://a:8081"}' });

    expect(await new CauHinhStore(kho).doc()).toEqual({
      apiBaseUrl: 'http://a:8081',
      imageBaseUrl: '',
    });
  });
});
