import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/auth/auth_api.dart';
import '../core/orders/khoa_dat_don.dart';
import '../core/payment/invoice.dart';
import '../core/payment/invoice_api.dart';
import '../core/tables/table_session.dart';
import '../core/tien.dart';

/// Hoá đơn bàn và yêu cầu thanh toán (§9.10 M2 mục 6).
///
/// Màn hình này CỐ Ý không có nút "Tôi đã trả". Khách không có quyền xác nhận — đo thật:
/// `POST .../invoice/payment/confirm` bằng token bàn trả **401**, endpoint đó chỉ dành cho nhân
/// viên quầy. Một nút không làm gì sẽ khiến khách bấm rồi tưởng đã xong và bỏ đi.
class PaymentScreen extends StatefulWidget {
  const PaymentScreen({
    super.key,
    required this.api,
    required this.phienBan,
    this.soDienThoai,
  });

  final InvoiceApi api;
  final TableSession phienBan;
  final String? soDienThoai;

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  final _khoa = KhoaDatDon();
  Invoice? _hd;
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
      final hd = await widget.api
          .hoaDon(widget.phienBan.sessionId, widget.phienBan.tableSessionToken);
      if (!mounted) return;
      setState(() => _hd = hd);
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loi = e.message);
    }
  }

  Future<void> _yeuCau(String method) async {
    if (_dangGui) return;
    setState(() {
      _dangGui = true;
      _loi = null;
    });
    try {
      final hd = await widget.api.yeuCauThanhToan(
        widget.phienBan.sessionId,
        widget.phienBan.tableSessionToken,
        method,
        // Khoá gắn với PHƯƠNG THỨC: gửi lại cùng cách trả tiền là cùng một yêu cầu; đổi từ COD
        // sang VietQR là yêu cầu khác và phải có khoá khác.
        _khoa.khoaCho(method),
        soDienThoai: widget.soDienThoai,
      );
      if (!mounted) return;
      setState(() => _hd = hd);
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loi = e.message);
      // Bàn đã có yêu cầu rồi: đọc lại để hiện đúng thứ đang chờ, thay vì để khách bấm tiếp.
      if (e.code == 'TABLE_INVOICE_PAYMENT_PENDING') await _tai();
    } finally {
      if (mounted) setState(() => _dangGui = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hd = _hd;
    return Scaffold(
      appBar: AppBar(title: const Text('Thanh toán')),
      body: RefreshIndicator(
        onRefresh: _tai,
        child: hd == null && _loi == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_loi != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Text(_loi!,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error)),
                    ),
                  if (hd != null) ..._noiDung(context, hd),
                ],
              ),
      ),
    );
  }

  List<Widget> _noiDung(BuildContext context, Invoice hd) {
    if (hd.items.isEmpty) {
      return const [
        Padding(
          padding: EdgeInsets.all(24),
          child: Text('Bàn chưa có món nào để thanh toán.',
              textAlign: TextAlign.center),
        )
      ];
    }
    return [
      Text(hd.invoiceCode, style: Theme.of(context).textTheme.bodySmall),
      const SizedBox(height: 8),
      ...hd.items.map((i) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(children: [
              Expanded(child: Text('${i.quantity} x ${i.name}')),
              Text(tienVnd(i.lineTotal)),
            ]),
          )),
      const Divider(height: 24),
      if (hd.discountAmount > 0)
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          const Text('Giảm giá'),
          Text('-${tienVnd(hd.discountAmount)}'),
        ]),
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text('Tổng', style: Theme.of(context).textTheme.titleMedium),
        Text(tienVnd(hd.totalAmount),
            style: Theme.of(context).textTheme.titleMedium),
      ]),
      const SizedBox(height: 8),
      Text(nhanTrangThaiHoaDon(hd.status)),
      const SizedBox(height: 20),
      if (hd.status == 'NotRequested') ..._chonCach(context),
      if (hd.status == 'Pending') ..._dangCho(context, hd),
      if (hd.status == 'Paid')
        const Text('Cảm ơn bạn. Hẹn gặp lại!', textAlign: TextAlign.center),
    ];
  }

  List<Widget> _chonCach(BuildContext context) => [
        if (widget.soDienThoai != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text('Tích điểm cho ${widget.soDienThoai}',
                style: Theme.of(context).textTheme.bodySmall),
          ),
        // Nói TRƯỚC rằng thêm món sẽ bị khoá. Đo thật: sau khi yêu cầu, thêm món trả
        // TABLE_INVOICE_PAYMENT_PENDING — nhưng BỚT món vẫn được, nên không nói "khoá giỏ".
        const Text('Sau khi yêu cầu, bàn không gọi thêm món được nữa '
            '(vẫn bớt được món đã chọn).'),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _dangGui ? null : () => _yeuCau('COD'),
          child: const Text('Trả tiền mặt tại quầy'),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: _dangGui ? null : () => _yeuCau('VietQR'),
          child: const Text('Chuyển khoản VietQR'),
        ),
      ];

  List<Widget> _dangCho(BuildContext context, Invoice hd) {
    final qr = hd.vietQr;
    return [
      Text(huongDanChoXacNhan(hd.method)),
      if (qr != null) ...[
        const SizedBox(height: 16),
        if (qr.qrImageDataUri != null &&
            qr.qrImageDataUri!.startsWith('data:image'))
          Center(
            child: Image.memory(
              base64Decode(qr.qrImageDataUri!.split(',').last),
              width: 220,
              height: 220,
              // Ảnh QR hỏng KHÔNG được che mất nội dung chuyển khoản bên dưới — khách vẫn
              // chuyển tay được nếu còn đọc được nội dung.
              errorBuilder: (_, __, ___) => const SizedBox(height: 8),
            ),
          ),
        const SizedBox(height: 12),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Nội dung chuyển khoản'),
          subtitle: SelectableText(qr.transferContent),
          // Cho CHÉP chứ không cho sửa: hệ thống đối soát bằng đúng chuỗi này (#3), sửa một ký
          // tự là tiền về mà không ai nhận ra.
          trailing: IconButton(
            icon: const Icon(Icons.copy),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: qr.transferContent));
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Đã chép nội dung')));
              }
            },
          ),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Số tiền'),
          subtitle: SelectableText(tienVnd(qr.amount)),
        ),
      ],
      const SizedBox(height: 20),
      OutlinedButton(
          onPressed: _tai, child: const Text('Kiểm tra lại trạng thái')),
    ];
  }
}
