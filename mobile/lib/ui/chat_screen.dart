import 'package:flutter/material.dart';

import '../core/auth/auth_api.dart';
import '../core/chat/chat.dart';
import '../core/chat/chat_api.dart';
import '../core/tables/table_session.dart';
import '../core/tien.dart';

/// Trợ lý AI trong phiên bàn (§9.10 M2 mục 8).
///
/// Gợi ý món của AI hiện thành NÚT BẤM, không bao giờ tự thêm vào giỏ. Backend chỉ chuyển tiếp
/// gợi ý có `requiresCustomerConfirmation == true`, và app tôn trọng đúng điều đó: tự thêm là
/// tiêu tiền của khách theo lời một mô hình ngôn ngữ.
class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    required this.api,
    required this.phienBan,
    required this.onThemVaoGio,
  });

  final ChatApi api;
  final TableSession phienBan;

  /// Thêm món vào giỏ — do MÀN HÌNH GIỎ thực hiện, sau khi khách bấm.
  final Future<void> Function(String menuItemId, int quantity) onThemVaoGio;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _oNhap = TextEditingController();
  final _cuon = ScrollController();
  ChatSession? _phien;
  List<ChatMessage> _tin = [];
  List<GoiYThemMon> _goiY = const [];
  bool _canGoiNhanVien = false;
  String? _loi;
  bool _dangGui = false;

  @override
  void initState() {
    super.initState();
    _mo();
  }

  @override
  void dispose() {
    _oNhap.dispose();
    _cuon.dispose();
    super.dispose();
  }

  Future<void> _mo() async {
    setState(() => _loi = null);
    try {
      final p = await widget.api
          .moPhien(widget.phienBan.sessionId, widget.phienBan.tableCode);
      if (!mounted) return;
      setState(() {
        _phien = p;
        // Phiên dùng lại thì lịch sử đã có sẵn — KHÔNG xoá màn hình rồi chào lại từ đầu.
        _tin = List.of(p.messages);
      });
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loi = e.message);
    }
  }

  Future<void> _gui() async {
    final p = _phien;
    final noiDung = _oNhap.text;
    // Chặn ở app: một lượt hỏng VẪN tính vào hạn mức 10 tin/phút, nên đừng tiêu hạn mức cho một
    // câu rỗng.
    if (p == null || _dangGui || !cauHoiGuiDuoc(noiDung)) return;

    setState(() {
      _dangGui = true;
      _loi = null;
      _goiY = const [];
    });
    try {
      final luot =
          await widget.api.gui(p.chatSessionId, p.accessToken, noiDung);
      if (!mounted) return;
      _oNhap.clear();
      setState(() {
        // Dùng tin nhắn do BACKEND trả về, không dùng bản app tự dựng: id và thời điểm là của
        // máy chủ.
        _tin = [..._tin, luot.tinKhach, luot.traLoi];
        _goiY = luot.goiY;
        _canGoiNhanVien = luot.canGoiNhanVien;
      });
      _cuonXuongCuoi();
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loi = e.message);
    } finally {
      if (mounted) setState(() => _dangGui = false);
    }
  }

  void _cuonXuongCuoi() {
    if (!_cuon.hasClients) return;
    _cuon.animateTo(
      _cuon.position.maxScrollExtent + 200,
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Trợ lý')),
      body: Column(
        children: [
          Expanded(
            child: _phien == null && _loi == null
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    controller: _cuon,
                    padding: const EdgeInsets.all(16),
                    children: [
                      if (_tin.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 24),
                          child: Text(
                            'Hỏi tôi về món ăn: cay hay không, hợp trẻ nhỏ, món chay, ngân sách…',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ..._tin.map((m) => _bongBong(context, m)),
                      if (_dangGui)
                        // Đo thật: một câu trả lời mất khoảng 10 giây. Nói RÕ là đang nghĩ, thay
                        // vì một vòng quay im lặng khiến khách tưởng app treo.
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 12),
                          child: Row(children: [
                            SizedBox(
                                width: 16,
                                height: 16,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2)),
                            SizedBox(width: 12),
                            Text('Trợ lý đang xem thực đơn…'),
                          ]),
                        ),
                      if (_goiY.isNotEmpty) ..._khoiGoiY(context),
                      if (_canGoiNhanVien)
                        Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text(
                            'Câu này nên hỏi nhân viên trực tiếp sẽ nhanh hơn.',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                    ],
                  ),
          ),
          if (_loi != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(_loi!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _oNhap,
                    // Chặn ngay ở bàn phím thay vì để khách gõ 2500 ký tự rồi mới nhận lỗi.
                    maxLength: gioiHanDoDaiCauHoi,
                    maxLines: 3,
                    minLines: 1,
                    onSubmitted: (_) => _gui(),
                    decoration: const InputDecoration(
                      hintText: 'Hỏi về món ăn…',
                      counterText: '',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _dangGui ? null : _gui,
                  icon: const Icon(Icons.send),
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _bongBong(BuildContext context, ChatMessage m) {
    final cua = m.cuaKhach;
    return Align(
      alignment: cua ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints:
            BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        decoration: BoxDecoration(
          color: cua
              ? Theme.of(context).colorScheme.primaryContainer
              : Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(14),
        ),
        child: SelectableText(m.content),
      ),
    );
  }

  List<Widget> _khoiGoiY(BuildContext context) => [
        const SizedBox(height: 12),
        Text('Trợ lý gợi ý', style: Theme.of(context).textTheme.titleSmall),
        // Nói THẲNG rằng đây là gợi ý và khách mới là người quyết định. Không có dòng này thì một
        // danh sách món kèm nút bấm rất dễ đọc như "đã chọn giúp bạn".
        Text('Bấm để thêm vào giỏ — trợ lý không tự thêm gì cả.',
            style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 8),
        ..._goiY.map((g) => Card(
              child: ListTile(
                title: Text(g.name),
                subtitle: g.reason == null ? null : Text(g.reason!),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(tienVnd(g.price)),
                    TextButton(
                      onPressed: () async {
                        await widget.onThemVaoGio(g.menuItemId, g.quantity);
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Đã thêm ${g.name} vào giỏ')),
                        );
                      },
                      child: const Text('Thêm'),
                    ),
                  ],
                ),
              ),
            )),
      ];
}
