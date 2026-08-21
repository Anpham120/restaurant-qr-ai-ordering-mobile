import 'package:flutter/material.dart';

import '../core/auth/auth_api.dart';
import '../core/orders/order.dart';
import '../core/orders/order_api.dart';
import '../core/orders/order_token_store.dart';
import '../core/tables/table_session.dart';
import '../core/tien.dart';

/// Đơn của bàn — CHỈ ĐỌC (§9.10 M1 mục 4).
///
/// Không có nút huỷ món và không có nút thanh toán: hai việc đó nằm ở #31 và #30. Dựng sẵn nút
/// rồi để nó không làm gì là cách chắc chắn để khách bấm và tưởng đã huỷ được món.
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({
    super.key,
    required this.api,
    required this.phienBan,
    required this.tokenStore,
  });

  final OrderApi api;
  final TableSession phienBan;
  final OrderTokenStore tokenStore;

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List<CustomerOrder>? _don;
  Map<String, String> _tokenDon = const {};
  String? _loi;
  String? _dangHuy;

  @override
  void initState() {
    super.initState();
    _tai();
  }

  Future<void> _tai() async {
    setState(() => _loi = null);
    try {
      final ds = await widget.api.donCuaPhien(
          widget.phienBan.sessionId, widget.phienBan.tableSessionToken);
      // Đọc token cùng lúc với đơn: nút huỷ chỉ hiện khi máy này có token của đúng đơn đó, nên
      // hai thứ phải luôn khớp nhau trong một lần vẽ.
      final tokens = await widget.tokenStore.tatCa();
      if (!mounted) return;
      setState(() {
        _don = ds;
        _tokenDon = tokens;
      });
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loi = e.message);
    }
  }

  Future<void> _huy(
      CustomerOrder don, OrderItem mon, String orderItemId) async {
    if (_dangHuy != null) return;
    final token = _tokenDon[don.orderCode];
    if (token == null) return;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Huỷ món này?'),
        // Nói RÕ món nào và bao nhiêu phần. Ở màn hình có nhiều dòng giống nhau, một hộp thoại
        // chỉ hỏi "bạn có chắc không" là chỗ dễ bấm nhầm nhất.
        content: Text(
            '${mon.quantity} x ${mon.name} sẽ bị bỏ khỏi đơn ${don.orderCode}.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Không')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Huỷ món')),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() {
      _dangHuy = orderItemId;
      _loi = null;
    });
    try {
      await widget.api.huyMon(don.orderCode, orderItemId, token);
      if (!mounted) return;
      // Đọc lại thay vì tự xoá dòng: bếp có thể vừa đổi trạng thái món khác, và danh sách đọc
      // lại là sự thật duy nhất.
      await _tai();
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loi = e.message);
      // Bếp đã nấu mất rồi: đọc lại để trạng thái trên màn hình khớp với thực tế.
      if (e.code == 'ORDER_ITEM_CANCEL_NOT_ALLOWED') await _tai();
    } finally {
      if (mounted) setState(() => _dangHuy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Đơn bàn ${widget.phienBan.tableCode}')),
      body: RefreshIndicator(onRefresh: _tai, child: _than(context)),
    );
  }

  Widget _than(BuildContext context) {
    if (_loi != null) {
      return ListView(children: [
        Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            Text(_loi!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _tai, child: const Text('Thử lại')),
          ]),
        )
      ]);
    }
    final don = _don;
    if (don == null) return const Center(child: CircularProgressIndicator());
    if (don.isEmpty) {
      return ListView(children: const [
        Padding(
          padding: EdgeInsets.all(32),
          child: Text('Bàn chưa có đơn nào.', textAlign: TextAlign.center),
        )
      ]);
    }

    return ListView.separated(
      itemCount: don.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (_, i) => _theDon(context, don[i]),
    );
  }

  Widget _dongMon(BuildContext context, CustomerOrder don, OrderItem m) {
    final uocLuong =
        moTaUocLuong(m.estimatedReadyMinutesLow, m.estimatedReadyMinutesHigh);
    final huyDuoc = chophepHuyMon(
      m.status,
      coTokenDon: _tokenDon.containsKey(don.orderCode),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${m.quantity} x ${m.name}'),
                // KHÔNG hiện gì khi chưa có ước lượng. Một câu thay thế kiểu "đang tính" hay
                // "khoảng 15 phút" phá đúng cơ chế mà hạn chế #10 dựng lên.
                if (uocLuong != null)
                  Text('Dự kiến $uocLuong',
                      style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(nhanTrangThaiMon(m.status),
                  style: Theme.of(context).textTheme.bodySmall),
              Text(tienVnd(m.lineTotal)),
            ],
          ),
          if (huyDuoc)
            IconButton(
              tooltip: 'Huỷ món',
              onPressed:
                  _dangHuy != null ? null : () => _huy(don, m, m.orderItemId),
              icon: const Icon(Icons.close),
            ),
        ],
      ),
    );
  }

  Widget _theDon(BuildContext context, CustomerOrder don) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(don.orderCode,
                  style: Theme.of(context).textTheme.titleSmall),
              Text(nhanTrangThaiDon(don.status)),
            ],
          ),
          const SizedBox(height: 8),
          ...don.items.map((m) => _dongMon(context, don, m)),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: Text('Tổng ${tienVnd(don.totalAmount)}',
                style: Theme.of(context).textTheme.titleSmall),
          ),
        ],
      ),
    );
  }
}
