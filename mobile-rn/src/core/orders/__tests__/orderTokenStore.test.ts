import { khoTrongBoNho } from '../../luuTruAnToan';
import { OrderTokenStore } from '../orderTokenStore';

describe('OrderTokenStore', () => {
  it('lưu rồi đọc lại token theo mã đơn', async () => {
    const s = new OrderTokenStore(khoTrongBoNho());
    await s.luu('DH1', 'tok1');
    await s.luu('DH2', 'tok2');

    expect(await s.token('DH1')).toBe('tok1');
    expect(await s.tatCa()).toEqual({ DH1: 'tok1', DH2: 'tok2' });
  });

  it('đơn của MÁY KHÁC không có token, và đó là đúng', async () => {
    // Người đặt mới là người quyết định huỷ. App chỉ đơn giản không hiện nút huỷ cho đơn đó.
    expect(await new OrderTokenStore(khoTrongBoNho()).token('DH-cua-may-khac')).toBeNull();
  });

  it('lưu thêm KHÔNG ghi đè token đơn cũ', async () => {
    // Một bàn đặt nhiều đợt là chuyện bình thường. Ghi đè nghĩa là mất quyền huỷ với mọi đơn trừ
    // đơn mới nhất.
    const s = new OrderTokenStore(khoTrongBoNho());
    await s.luu('DH1', 'tok1');
    await s.luu('DH2', 'tok2');

    expect(await s.token('DH1')).toBe('tok1');
  });

  it('dữ liệu hỏng thì xoá và coi như chưa có token nào', async () => {
    const kho = khoTrongBoNho({ order_tokens_v1: 'không phải json' });

    expect(await new OrderTokenStore(kho).tatCa()).toEqual({});
    expect(await kho.doc('order_tokens_v1')).toBeNull();
  });

  it('JSON hợp lệ nhưng là MẢNG cũng bị coi là hỏng', async () => {
    // Ca này KHÔNG có ở bản Flutter: ép kiểu `as Map` của Dart sẽ ném, còn ở JavaScript một mảng
    // vẫn là object nên Object.entries chạy được và cho ra bảng {"0": ...} — token rác, im lặng.
    const kho = khoTrongBoNho({ order_tokens_v1: '["tok1","tok2"]' });

    expect(await new OrderTokenStore(kho).tatCa()).toEqual({});
  });

  it('rời bàn thì xoá hết token', async () => {
    const s = new OrderTokenStore(khoTrongBoNho());
    await s.luu('DH1', 'tok1');

    await s.xoaHet();

    expect(await s.tatCa()).toEqual({});
  });
});
