import 'package:flutter/material.dart';

import '../core/auth/auth_api.dart';
import '../core/cart/cart.dart';
import '../core/cart/cart_api.dart';
import '../core/orders/create_order_api.dart';
import '../core/orders/khoa_dat_don.dart';
import '../core/tables/table_session.dart';
import '../core/tien.dart';

/// Giỏ hàng và đặt món (§9.10 M2 mục 5).
class CartScreen extends StatefulWidget {
  const CartScreen({
    super.key,
    required this.cartApi,
    required this.createOrderApi,
    required this.phienBan,
    this.soDienThoai,
    required this.onDatXong,
  });

  final CartApi cartApi;
  final CreateOrderApi createOrderApi;
  final TableSession phienBan;

  /// Số đã liên kết với tài khoản (#27) — tự điền lúc đặt, §9.7 gọi đây là tính năng lõi.
  final String? soDienThoai;

  final void Function(CreatedOrder don) onDatXong;

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  final _khoa = KhoaDatDon();
  Cart? _gio;
  String? _loi;
  bool _dangGui = false;

  @override
  void initState() {
    super.initState();
    _tai();
  }

  Future<void> _tai() async {
    setState(() => _loi = null);
    try {
      final g = await widget.cartApi
          .gio(widget.phienBan.sessionId, widget.phienBan.tableSessionToken);
      if (!mounted) return;
      setState(() => _gio = g);
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loi = e.message);
    }
  }

  /// Cộng/trừ một món.
  ///
  /// KHÔNG cập nhật lạc quan ở đây. Ở màn vận hành (#19) cập nhật lạc quan là đúng vì thao tác
  /// idempotent; giỏ hàng nhận DELTA nên nếu đoán sai thì con số trên màn hình lệch hẳn với máy
  /// chủ, và khách sẽ bấm thêm để "sửa" — làm lệch thêm. Phản hồi luôn trả về cả giỏ, nên chờ
  /// nó rồi vẽ lại là vừa đúng vừa đơn giản.
  Future<void> _doi(String menuItemId, int delta) async {
    if (_dangGui) return;
    setState(() {
      _dangGui = true;
      _loi = null;
    });
    try {
      final g = await widget.cartApi.doiSoLuong(widget.phienBan.sessionId,
          widget.phienBan.tableSessionToken, menuItemId, delta);
      if (!mounted) return;
      setState(() => _gio = g);
    } on AuthException catch (e) {
      if (!mounted) return;
      // Lỗi mạng: KHÔNG gửi lại delta. Đọc lại giỏ để hiện sự thật thay vì đoán.
      setState(() => _loi = e.message);
      if (e.code == 'NETWORK_ERROR') await _tai();
    } finally {
      if (mounted) setState(() => _dangGui = false);
    }
  }

  Future<void> _dat() async {
    final g = _gio;
    if (g == null || g.rong || _dangGui) return;
    setState(() {
      _dangGui = true;
      _loi = null;
    });
    try {
      final don = await widget.createOrderApi.taoDon(
        phienBan: widget.phienBan,
        gio: g,
        // Cùng giỏ thì cùng khoá — gửi lại sau lỗi mạng không tạo đơn thứ hai.
        khoaIdempotency: _khoa.khoaCho(dauVetGio(g)),
        soDienThoai: widget.soDienThoai,
      );
      // Quên khoá SAU KHI thành công: lần đặt sau với giỏ trùng nội dung phải là đơn mới.
      _khoa.quen();
      if (!mounted) return;
      await _tai();
      if (!mounted) return;
      widget.onDatXong(don);
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loi = e.message);
      // Giỏ lệch hoặc món vừa hết: đọc lại để khách thấy đúng thứ mình đang có.
      if (e.code == 'IDEMPOTENCY_KEY_REUSED' ||
          e.code == 'MENU_ITEM_UNAVAILABLE' ||
          e.code == 'TABLE_SESSION_CONFLICT') {
        await _tai();
      }
    } finally {
      if (mounted) setState(() => _dangGui = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final g = _gio;
    final conMonHet = g != null && coMonHetHang(g);
    return Scaffold(
      appBar: AppBar(title: const Text('Giỏ hàng')),
      body: g == null && _loi == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              children: [
                if (_loi != null)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_loi!,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error)),
                  ),
                if (g != null && g.rong)
                  const Padding(
                    padding: EdgeInsets.all(32),
                    child: Text('Giỏ đang trống. Chọn món ở tab Thực đơn.',
                        textAlign: TextAlign.center),
                  ),
                if (g != null) ...g.items.map((i) => _dong(context, i)),
              ],
            ),
      bottomNavigationBar: g == null || g.rong
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (conMonHet)
                      // Chặn ở đây thay vì để backend từ chối cả đơn: một lời từ chối sau khi
                      // khách đã bấm "Đặt món" tệ hơn nhiều so với chỉ ra ngay trong giỏ.
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text('Có món vừa hết. Bỏ món đó ra rồi đặt lại.',
                            style: TextStyle(
                                color: Theme.of(context).colorScheme.error)),
                      ),
                    if (widget.soDienThoai != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text('Tích điểm cho ${widget.soDienThoai}',
                            style: Theme.of(context).textTheme.bodySmall),
                      ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Tổng ${tienVnd(g.subtotal)}',
                            style: Theme.of(context).textTheme.titleMedium),
                        FilledButton(
                          onPressed: _dangGui || conMonHet ? null : _dat,
                          child: Text(_dangGui ? 'Đang gửi…' : 'Đặt món'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _dong(BuildContext context, CartItem i) => ListTile(
        title: Text(i.name),
        subtitle: i.isAvailable
            ? Text(tienVnd(i.price))
            : Text('Vừa hết hàng',
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              onPressed: _dangGui ? null : () => _doi(i.menuItemId, -1),
              icon: const Icon(Icons.remove_circle_outline),
            ),
            Text('${i.quantity}'),
            IconButton(
              // Không cho tăng món đã hết — backend sẽ từ chối, và nút bấm được nhưng không làm
              // gì là cách chắc chắn để khách bấm mãi.
              onPressed: _dangGui || !i.isAvailable
                  ? null
                  : () => _doi(i.menuItemId, 1),
              icon: const Icon(Icons.add_circle_outline),
            ),
          ],
        ),
      );
}
