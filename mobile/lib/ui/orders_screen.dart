import 'package:flutter/material.dart';

import '../core/auth/auth_api.dart';
import '../core/orders/order.dart';
import '../core/orders/order_api.dart';
import '../core/tables/table_session.dart';
import '../core/tien.dart';

/// Đơn của bàn — CHỈ ĐỌC (§9.10 M1 mục 4).
///
/// Không có nút huỷ món và không có nút thanh toán: hai việc đó nằm ở #31 và #30. Dựng sẵn nút
/// rồi để nó không làm gì là cách chắc chắn để khách bấm và tưởng đã huỷ được món.
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key, required this.api, required this.phienBan});

  final OrderApi api;
  final TableSession phienBan;

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List<CustomerOrder>? _don;
  String? _loi;

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
      if (!mounted) return;
      setState(() => _don = ds);
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loi = e.message);
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
          ...don.items.map((m) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Expanded(child: Text('${m.quantity}× ${m.name}')),
                    Text(nhanTrangThaiMon(m.status),
                        style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(width: 12),
                    Text(tienVnd(m.lineTotal)),
                  ],
                ),
              )),
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
