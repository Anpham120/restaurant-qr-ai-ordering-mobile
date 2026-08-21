import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/tables/quet_qr.dart';
import 'theme.dart';

/// Quét mã QR đặt trên bàn (§9.10).
///
/// Đây là lối vào CHÍNH của sản phẩm: cả hệ thống tên là "gọi món qua QR". Bắt khách gõ tay chuỗi
/// `cmc-table-t01-qr` là hỏng ngay ở bước đầu — không ai đọc được chuỗi đó từ một tem dán trên bàn.
///
/// Ô nhập tay vẫn giữ ở màn hình trước, làm phương án dự phòng cho ba trường hợp có thật: khách từ
/// chối quyền camera, máy không có camera, và tem QR bị mờ.
class QrScanScreen extends StatefulWidget {
  const QrScanScreen({super.key});

  @override
  State<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends State<QrScanScreen> {
  final _controller = MobileScannerController(
    // Chỉ đọc QR. Bật cả mã vạch khiến camera nhận nhầm tem giá dán cạnh bàn.
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );

  /// Đã trả kết quả chưa. Camera bắn liên tục nhiều khung; không chốt lại thì màn hình bị pop
  /// nhiều lần và Navigator ném lỗi.
  bool _daTraKetQua = false;

  String? _loi;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _khiQuet(BarcodeCapture capture) {
    if (_daTraKetQua) return;
    for (final ma in capture.barcodes) {
      final kq = phanTichQrBan(ma.rawValue);
      if (kq != null) {
        _daTraKetQua = true;
        Navigator.of(context).pop(kq);
        return;
      }
    }
    // Quét trúng một QR KHÁC (wifi, danh thiếp, link ví). Nói rõ thay vì im lặng tiếp tục quét —
    // khách đang chĩa máy vào đúng thứ họ nghĩ là mã bàn.
    if (capture.barcodes.isNotEmpty && _loi == null) {
      setState(() => _loi =
          'Mã này không phải QR của bàn. Tìm tem QR dán trên mặt bàn nhé.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: const Text('Quét mã bàn'),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
      ),
      body: Stack(
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _khiQuet,
            // Camera hỏng hoặc bị từ chối quyền KHÔNG được để lại khung đen im lặng: khách sẽ
            // đứng chĩa máy vào bàn và không hiểu vì sao không có gì xảy ra.
            errorBuilder: (_, loi, __) => Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.no_photography,
                        color: Colors.white54, size: 48),
                    const SizedBox(height: 16),
                    Text(
                      _moTaLoiCamera(loi),
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white),
                    ),
                    const SizedBox(height: 20),
                    OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white38),
                      ),
                      child: const Text('Quay lại nhập mã bằng tay'),
                    ),
                  ],
                ),
              ),
            ),
          ),
          // Khung ngắm: nói cho khách biết chĩa vào đâu.
          Center(
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                border: Border.all(color: MauQuan.brass, width: 3),
                borderRadius: BorderRadius.circular(BoGoc.the),
              ),
            ),
          ),
          Positioned(
            left: 24,
            right: 24,
            bottom: 48,
            child: Column(
              children: [
                if (_loi != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: MauQuan.danger,
                      borderRadius: BorderRadius.circular(BoGoc.vua),
                    ),
                    child: Text(_loi!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white)),
                  ),
                const Text(
                  'Đưa mã QR trên bàn vào khung',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Dịch lỗi camera thành câu chỉ ra việc cần làm.
  ///
  /// `MobileScannerErrorCode` phân biệt được "khách từ chối quyền" với "máy không có camera", và
  /// hai thứ đó cần hai lời khuyên khác nhau: một cái mở được trong Cài đặt, một cái thì không.
  String _moTaLoiCamera(MobileScannerException loi) {
    switch (loi.errorCode) {
      case MobileScannerErrorCode.permissionDenied:
        return 'Chưa có quyền dùng camera.\n'
            'Mở Cài đặt → Ứng dụng → quyền Camera, hoặc nhập mã bằng tay.';
      case MobileScannerErrorCode.unsupported:
        return 'Máy này không quét được mã QR.\nNhập mã trên tem bằng tay giúp nhé.';
      default:
        return 'Không mở được camera.\nNhập mã trên tem bằng tay giúp nhé.';
    }
  }
}
