import 'package:flutter/material.dart';

import '../core/auth/auth_api.dart';
import '../core/auth/auth_session.dart';
import '../core/orders/order.dart';
import '../core/orders/favourite_api.dart';
import '../core/orders/order_history_api.dart';
import '../core/tien.dart';

/// Lịch sử đơn qua nhiều lần ghé, kèm đặt lại món cũ (§9.10 M3 mục 9).
///
/// Chỉ có khi đã đăng nhập: lịch sử gắn với TÀI KHOẢN, không gắn với bàn. Khách vãng lai không
/// có gì để hiện ở đây, và đó là hệ quả thẳng của việc phiên bàn chỉ gắn `MemberId` khi có
/// đăng nhập (#26).
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({
    super.key,
    required this.api,
    required this.favouriteApi,
    required this.dangNhap,
    required this.themVaoGio,
  });

  final OrderHistoryApi api;
  final FavouriteApi favouriteApi;
  final AuthSession dangNhap;

  /// Thêm một món vào giỏ hiện tại — đi qua đúng API giỏ như khi khách tự chọn.
  final Future<void> Function(String menuItemId, int quantity) themVaoGio;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  List<CustomerOrder>? _don;
  List<MonHayGoi> _hayGoi = const [];
  String? _loi;
  String? _dangDatLai;

  @override
  void initState() {
    super.initState();
    _tai();
  }

  Future<void> _tai() async {
    setState(() => _loi = null);
    try {
      final ds = await widget.api.lichSuCuaToi(widget.dangNhap.accessToken);
      // Món hay gọi là phần PHỤ: hỏng nó không được làm hỏng cả màn hình lịch sử.
      List<MonHayGoi> hg = const [];
      try {
        hg = locThoiQuen(
            await widget.favouriteApi.monHayGoi(widget.dangNhap.accessToken));
      } catch (_) {
        // Nuốt có chủ ý — xem trên.
      }
      if (!mounted) return;
      setState(() {
        _don = ds;
        _hayGoi = hg;
      });
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loi = e.message);
    }
  }

  Future<void> _datLai(CustomerOrder don) async {
    if (_dangDatLai != null) return;
    setState(() => _dangDatLai = don.orderCode);
    try {
      final kq = await datLaiDon(
        mon: don.items,
        themVaoGio: widget.themVaoGio,
        moTaLoi: (loi) =>
            loi is AuthException ? loi.message : 'Không thêm được',
      );
      if (!mounted) return;
      // Báo CẢ HAI danh sách. "Đã thêm vào giỏ" rồi im lặng bỏ ba món là nói dối với khách; họ
      // chỉ phát hiện lúc nhìn hoá đơn.
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(kq.tronVen
            ? 'Đã thêm ${kq.daThem.length} món vào giỏ'
            : kq.thatBaiHoanToan
                ? 'Không thêm được món nào: ${kq.khongThem.keys.join(", ")}'
                : 'Đã thêm ${kq.daThem.length} món. '
                    'Không còn: ${kq.khongThem.keys.join(", ")}'),
        duration: const Duration(seconds: 6),
      ));
    } finally {
      if (mounted) setState(() => _dangDatLai = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Lịch sử đơn')),
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
          child: Text(
            'Chưa có đơn nào.\nĐơn đặt khi đã đăng nhập sẽ hiện ở đây.',
            textAlign: TextAlign.center,
          ),
        )
      ]);
    }
    return ListView(
      children: [
        if (_hayGoi.isNotEmpty) ..._khoiHayGoi(context),
        ...don.map((d) =>
            Column(children: [_the(context, d), const Divider(height: 1)])),
      ],
    );
  }

  /// "Món tôi hay gọi" — §9.8.
  ///
  /// Chỉ hiện món đã gọi từ HAI lần trở lên. Một lần là một lần thử, không phải thói quen; hiện
  /// nó dưới nhãn này sẽ khiến danh sách đầy những món khách ăn thử rồi thôi.
  List<Widget> _khoiHayGoi(BuildContext context) => [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
          child: Text('Món bạn hay gọi',
              style: Theme.of(context).textTheme.titleMedium),
        ),
        ..._hayGoi.map((m) => ListTile(
              title: Text(m.name),
              subtitle: Text(moTaThoiQuen(m) ?? ''),
              trailing: TextButton(
                onPressed: () async {
                  await widget.themVaoGio(m.menuItemId, 1);
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Đã thêm ${m.name} vào giỏ')),
                  );
                },
                child: const Text('Thêm'),
              ),
            )),
        const Divider(),
      ];

  Widget _the(BuildContext context, CustomerOrder don) {
    final datLaiDuoc = don.items.any((m) => m.status != 'Cancelled');
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
              Text(_ngay(don.createdAt),
                  style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
          const SizedBox(height: 4),
          ...don.items.map((m) => Text(
                m.status == 'Cancelled'
                    ? '${m.quantity} x ${m.name} (đã huỷ)'
                    : '${m.quantity} x ${m.name}',
                style: Theme.of(context).textTheme.bodyMedium,
              )),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(tienVnd(don.totalAmount)),
              if (datLaiDuoc)
                TextButton.icon(
                  onPressed: _dangDatLai != null ? null : () => _datLai(don),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: Text(
                      _dangDatLai == don.orderCode ? 'Đang thêm…' : 'Đặt lại'),
                ),
            ],
          ),
        ],
      ),
    );
  }

  /// Ngày giờ theo GIỜ MÁY, không phải UTC.
  ///
  /// `createdAt` được giữ ở UTC trong mã (xem `CustomerOrder`), nhưng khách đọc theo giờ của họ —
  /// hiện thẳng UTC sẽ lệch 7 tiếng ở Việt Nam và mọi đơn buổi tối trông như đặt lúc trưa.
  String _ngay(DateTime utc) {
    final t = utc.toLocal();
    String hai(int n) => n.toString().padLeft(2, '0');
    return '${hai(t.day)}/${hai(t.month)} ${hai(t.hour)}:${hai(t.minute)}';
  }
}
