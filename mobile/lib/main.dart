import 'package:flutter/material.dart';

import 'core/auth/auth_api.dart';
import 'core/auth/auth_repository.dart';
import 'core/auth/auth_session.dart';
import 'core/auth/token_store.dart';
import 'core/tables/secure_table_session_store.dart';
import 'core/tables/table_session.dart';
import 'core/tables/table_session_api.dart';
import 'core/tables/table_session_repository.dart';
import 'core/cart/cart_api.dart';
import 'core/cau_hinh/cau_hinh.dart';
import 'core/cau_hinh/cau_hinh_store.dart';
import 'core/chat/chat_api.dart';
import 'core/loyalty/loyalty_api.dart';
import 'core/orders/create_order_api.dart';
import 'core/orders/favourite_api.dart';
import 'core/orders/order_history_api.dart';
import 'core/orders/order_token_store.dart';
import 'core/payment/invoice_api.dart';
import 'core/menu/menu_api.dart';
import 'core/orders/order_api.dart';
import 'core/promotions/promotion_api.dart';
import 'ui/cart_screen.dart';
import 'ui/theme.dart';
import 'ui/server_settings_screen.dart';
import 'ui/chat_screen.dart';
import 'ui/login_screen.dart';
import 'ui/history_screen.dart';
import 'ui/loyalty_screen.dart';
import 'ui/menu_screen.dart';
import 'ui/open_table_screen.dart';
import 'ui/orders_screen.dart';
import 'ui/payment_screen.dart';
import 'ui/promotions_screen.dart';

/// Địa chỉ backend Java. Truyền lúc build:
///
///     flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8081
///
/// `10.0.2.2` là địa chỉ máy chủ nhìn từ máy ảo Android — `localhost` trong máy ảo trỏ về chính
/// máy ảo, nên đây là lỗi tốn thời gian nhất khi chạy lần đầu.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:8081',
);

/// Base URL của ẢNH MÓN — KHÁC base của API, và đây là chỗ dễ mất cả tiếng để hiểu.
///
/// Ảnh không do backend phục vụ. Đo trên hệ thống đang chạy:
///
///     GET :8081/menu-images/04-banh-cuon-thanh-tri.webp  → 401   (API Spring)
///     GET :8080/menu-images/04-banh-cuon-thanh-tri.webp  → 200   (container web)
///
/// Ghép nhầm ảnh vào base API thì thực đơn hiện ra trắng trơn mà không có lỗi nào để lần theo —
/// widget ảnh chỉ lặng lẽ hiện ô trống.
const String imageBaseUrl = String.fromEnvironment(
  'IMAGE_BASE_URL',
  defaultValue: 'http://10.0.2.2:8080',
);

Future<void> main() async {
  // Đọc cấu hình TRƯỚC khi dựng bất kỳ client nào: mọi client cần địa chỉ máy chủ, và địa chỉ đó
  // do người dùng nhập chứ không còn cố định lúc biên dịch.
  WidgetsFlutterBinding.ensureInitialized();
  final store = CauHinhStore();
  final daLuu = await store.doc();
  runApp(RestaurantApp(
    store: store,
    // Chưa lưu gì thì dùng giá trị --dart-define. Máy ảo Android chạy được ngay; điện thoại thật
    // sẽ thấy màn hình nhập địa chỉ.
    cauHinhBanDau: daLuu ??
        const CauHinhMayChu(apiBaseUrl: apiBaseUrl, imageBaseUrl: imageBaseUrl),
    daCoCauHinh: daLuu != null,
  ));
}

class RestaurantApp extends StatefulWidget {
  const RestaurantApp({
    super.key,
    required this.store,
    required this.cauHinhBanDau,
    required this.daCoCauHinh,
  });

  final CauHinhStore store;
  final CauHinhMayChu cauHinhBanDau;

  /// Đã từng lưu cấu hình chưa. Chưa thì mở thẳng màn hình nhập địa chỉ.
  final bool daCoCauHinh;

  @override
  State<RestaurantApp> createState() => _RestaurantAppState();
}

class _RestaurantAppState extends State<RestaurantApp> {
  AuthSession? _dangNhap;
  TableSession? _phienBan;
  String? _soDienThoai;
  bool _dangKhoiPhuc = true;

  late CauHinhMayChu _cauHinh;
  late bool _canNhapCauHinh;

  late AuthRepository _auth;
  late TableSessionRepository _ban;
  late MenuApi _menuApi;
  late CartApi _cartApi;
  late ChatApi _chatApi;
  late CreateOrderApi _createOrderApi;
  late InvoiceApi _invoiceApi;
  late OrderHistoryApi _historyApi;
  late FavouriteApi _favouriteApi;
  late OrderApi _orderApi;
  late PromotionApi _promotionApi;
  late LoyaltyApi _loyaltyApi;
  final OrderTokenStore _tokenStore = OrderTokenStore();

  @override
  void initState() {
    super.initState();
    _cauHinh = widget.cauHinhBanDau;
    _canNhapCauHinh = !widget.daCoCauHinh;
    _dungClient();
    _khoiPhuc();
  }

  /// Dựng lại toàn bộ client theo địa chỉ hiện tại.
  ///
  /// Client giữ `baseUrl` bên trong nên đổi máy chủ bắt buộc phải dựng lại chúng — sửa một biến
  /// toàn cục sẽ không chạm tới những client đã tạo, và app sẽ nửa nói chuyện với máy cũ nửa với
  /// máy mới.
  void _dungClient() {
    final api = _cauHinh.apiBaseUrl;
    _auth = AuthRepository(
        api: HttpAuthApi(baseUrl: api), store: SecureTokenStore());
    _ban = TableSessionRepository(
      api: HttpTableSessionApi(baseUrl: api),
      store: SecureTableSessionStore(),
      auth: _auth,
    );
    _menuApi = HttpMenuApi(baseUrl: api);
    _cartApi = HttpCartApi(baseUrl: api);
    _chatApi = HttpChatApi(baseUrl: api);
    _createOrderApi = HttpCreateOrderApi(baseUrl: api);
    _invoiceApi = HttpInvoiceApi(baseUrl: api);
    _historyApi = HttpOrderHistoryApi(baseUrl: api);
    _favouriteApi = HttpFavouriteApi(baseUrl: api);
    _orderApi = HttpOrderApi(baseUrl: api);
    _promotionApi = HttpPromotionApi(baseUrl: api);
    _loyaltyApi = HttpLoyaltyApi(baseUrl: api);
  }

  /// Lưu địa chỉ mới và bắt đầu lại từ đầu.
  ///
  /// XOÁ phiên bàn và phiên đăng nhập: token do máy chủ CŨ cấp không có nghĩa gì ở máy chủ mới, và
  /// giữ lại chỉ tạo ra một loạt 401 khó hiểu. Màn hình cài đặt đã nói trước điều này.
  Future<void> _luuCauHinh(CauHinhMayChu moi) async {
    await widget.store.luu(moi);
    await _auth.dangXuat();
    await _ban.roiBan();
    await _tokenStore.xoaHet();
    if (!mounted) return;
    setState(() {
      _cauHinh = moi;
      _canNhapCauHinh = false;
      _dangNhap = null;
      _phienBan = null;
      _soDienThoai = null;
      _dungClient();
    });
  }

  Future<void> _khoiPhuc() async {
    // Khôi phục SONG SONG: hai phiên độc lập nhau. Khách có thể đang ngồi ở bàn mà token đăng
    // nhập đã hết hạn, hoặc ngược lại — nối tiếp chỉ làm màn hình chờ lâu gấp đôi.
    final ketQua = await Future.wait([_auth.khoiPhuc(), _ban.khoiPhuc()]);
    if (!mounted) return;
    setState(() {
      _dangNhap = ketQua[0] as AuthSession?;
      _phienBan = ketQua[1] as TableSession?;
      _dangKhoiPhuc = false;
    });
    _taiSoDienThoai();
  }

  /// Lấy số đã liên kết để tự điền lúc đặt món (§9.7).
  ///
  /// Nuốt lỗi có chủ ý: đây là tiện ích, không phải điều kiện để dùng app. Mạng chập chờn thì
  /// khách vẫn đặt được món, chỉ là đơn đó không tích điểm — chặn cả app vì một lời gọi phụ hỏng
  /// là đánh đổi sai.
  Future<void> _taiSoDienThoai() async {
    final ses = _dangNhap;
    if (ses == null) {
      if (mounted) {
        setState(() => _soDienThoai = null);
      }
      return;
    }
    try {
      final kq = await _loyaltyApi.cuaToi(ses.accessToken);
      if (!mounted) return;
      setState(() => _soDienThoai = kq.linked ? kq.phoneNumber : null);
    } catch (_) {
      if (mounted) {
        setState(() => _soDienThoai = null);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Gọi món',
      theme: chuDeQuan(),
      home: _manHinh(),
    );
  }

  Widget _manHinh() {
    // Chưa có địa chỉ máy chủ thì KHÔNG có gì để hiện: mọi màn hình khác đều bắt đầu bằng một
    // lời gọi mạng. Bắt nhập trước là trung thực hơn một màn hình trống kèm lỗi.
    if (_canNhapCauHinh) {
      return ServerSettingsScreen(
        hienTai: _cauHinh,
        batBuoc: true,
        onLuu: _luuCauHinh,
      );
    }
    if (_dangKhoiPhuc) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    // KHÔNG bắt đăng nhập trước khi vào bàn. Khách vãng lai phải dùng được app đúng như web;
    // đăng nhập chỉ đổi lấy việc đơn được gắn tài khoản (§9.4).
    if (_phienBan == null) {
      return OpenTableScreen(
        repository: _ban,
        dangNhapVoi: _dangNhap,
        onMoPhienXong: (session) => setState(() => _phienBan = session),
      );
    }
    return _KhungChinh(
      phienBan: _phienBan!,
      dangNhap: _dangNhap,
      soDienThoai: _soDienThoai,
      menuApi: _menuApi,
      cartApi: _cartApi,
      chatApi: _chatApi,
      createOrderApi: _createOrderApi,
      invoiceApi: _invoiceApi,
      tokenStore: _tokenStore,
      historyApi: _historyApi,
      favouriteApi: _favouriteApi,
      orderApi: _orderApi,
      promotionApi: _promotionApi,
      loyaltyApi: _loyaltyApi,
      cauHinh: _cauHinh,
      onMoCaiDat: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => ServerSettingsScreen(
          hienTai: _cauHinh,
          onLuu: (moi) async {
            await _luuCauHinh(moi);
            if (mounted) Navigator.of(context).pop();
          },
        ),
      )),
      onRoiBan: () async {
        await _ban.roiBan();
        // Token đơn của bàn cũ không dùng được nữa — không có lý do giữ.
        await _tokenStore.xoaHet();
        if (mounted) setState(() => _phienBan = null);
      },
      onDangNhap: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => LoginScreen(
          repository: _auth,
          onDangNhapXong: (session) {
            setState(() => _dangNhap = session);
            _taiSoDienThoai();
            Navigator.of(context).pop();
          },
        ),
      )),
      onDangXuat: () async {
        await _auth.dangXuat();
        if (mounted) {
          setState(() {
            _dangNhap = null;
            _soDienThoai = null;
          });
        }
      },
    );
  }
}

/// Khung chính sau khi đã vào bàn: thực đơn, đơn của bàn, khuyến mãi, tài khoản.
///
/// Bốn tab thay vì một màn hình tạm vì #28 đã cho app đủ nội dung để điều hướng thật. Giỏ hàng
/// (#29) và thanh toán (#30) chưa có tab — thêm tab rỗng để "đủ bộ" sẽ khiến khách bấm vào và
/// tưởng tính năng hỏng.
class _KhungChinh extends StatefulWidget {
  const _KhungChinh({
    required this.phienBan,
    required this.dangNhap,
    required this.soDienThoai,
    required this.menuApi,
    required this.cartApi,
    required this.chatApi,
    required this.createOrderApi,
    required this.invoiceApi,
    required this.tokenStore,
    required this.historyApi,
    required this.favouriteApi,
    required this.orderApi,
    required this.promotionApi,
    required this.loyaltyApi,
    required this.cauHinh,
    required this.onMoCaiDat,
    required this.onRoiBan,
    required this.onDangNhap,
    required this.onDangXuat,
  });

  final TableSession phienBan;
  final AuthSession? dangNhap;

  /// Số đã liên kết với tài khoản (#27) — tự điền lúc đặt món (§9.7).
  final String? soDienThoai;

  final MenuApi menuApi;
  final CartApi cartApi;
  final ChatApi chatApi;
  final CreateOrderApi createOrderApi;
  final InvoiceApi invoiceApi;
  final OrderTokenStore tokenStore;
  final OrderHistoryApi historyApi;
  final FavouriteApi favouriteApi;
  final OrderApi orderApi;
  final PromotionApi promotionApi;
  final LoyaltyApi loyaltyApi;
  final CauHinhMayChu cauHinh;
  final VoidCallback onMoCaiDat;
  final Future<void> Function() onRoiBan;
  final VoidCallback onDangNhap;
  final Future<void> Function() onDangXuat;

  @override
  State<_KhungChinh> createState() => _KhungChinhState();
}

class _KhungChinhState extends State<_KhungChinh> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final man = [
      MenuScreen(
          api: widget.menuApi, imageBaseUrl: widget.cauHinh.imageBaseUrl),
      CartScreen(
        cartApi: widget.cartApi,
        createOrderApi: widget.createOrderApi,
        phienBan: widget.phienBan,
        soDienThoai: widget.soDienThoai,
        onDatXong: (don) async {
          // Cất X-Order-Token NGAY: backend chỉ trả nó một lần, và mất nó là mất quyền huỷ món
          // của chính mình (#11).
          await widget.tokenStore.luu(don.orderCode, don.customerAccessToken);
          if (!context.mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Đã gửi bếp — đơn ${don.orderCode}')),
          );
          setState(() => _tab = 2);
        },
      ),
      OrdersScreen(
        api: widget.orderApi,
        phienBan: widget.phienBan,
        tokenStore: widget.tokenStore,
      ),
      ChatScreen(
        api: widget.chatApi,
        phienBan: widget.phienBan,
        // Trợ lý KHÔNG tự thêm gì. Nó chỉ gọi lại hàm này khi khách bấm "Thêm", và hàm này đi
        // qua đúng API giỏ hàng như khi khách tự chọn món.
        onThemVaoGio: (menuItemId, quantity) => widget.cartApi.doiSoLuong(
          widget.phienBan.sessionId,
          widget.phienBan.tableSessionToken,
          menuItemId,
          quantity,
        ),
      ),
      PromotionsScreen(api: widget.promotionApi),
      _TabTaiKhoan(
        phienBan: widget.phienBan,
        dangNhap: widget.dangNhap,
        invoiceApi: widget.invoiceApi,
        soDienThoai: widget.soDienThoai,
        historyApi: widget.historyApi,
        favouriteApi: widget.favouriteApi,
        themVaoGio: (menuItemId, quantity) => widget.cartApi.doiSoLuong(
          widget.phienBan.sessionId,
          widget.phienBan.tableSessionToken,
          menuItemId,
          quantity,
        ),
        loyaltyApi: widget.loyaltyApi,
        cauHinh: widget.cauHinh,
        onMoCaiDat: widget.onMoCaiDat,
        onRoiBan: widget.onRoiBan,
        onDangNhap: widget.onDangNhap,
        onDangXuat: widget.onDangXuat,
      ),
    ];

    return Scaffold(
      body: man[_tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.restaurant_menu), label: 'Thực đơn'),
          NavigationDestination(
              icon: Icon(Icons.shopping_cart_outlined), label: 'Giỏ'),
          NavigationDestination(icon: Icon(Icons.receipt_long), label: 'Đơn'),
          NavigationDestination(
              icon: Icon(Icons.smart_toy_outlined), label: 'Trợ lý'),
          NavigationDestination(
              icon: Icon(Icons.local_offer_outlined), label: 'Khuyến mãi'),
          NavigationDestination(
              icon: Icon(Icons.person_outline), label: 'Tài khoản'),
        ],
      ),
    );
  }
}

/// Tab tài khoản: trạng thái bàn, đăng nhập/đăng xuất, và điểm thưởng khi đã đăng nhập.
class _TabTaiKhoan extends StatelessWidget {
  const _TabTaiKhoan({
    required this.phienBan,
    required this.dangNhap,
    required this.invoiceApi,
    required this.soDienThoai,
    required this.historyApi,
    required this.favouriteApi,
    required this.themVaoGio,
    required this.loyaltyApi,
    required this.cauHinh,
    required this.onMoCaiDat,
    required this.onRoiBan,
    required this.onDangNhap,
    required this.onDangXuat,
  });

  final TableSession phienBan;
  final AuthSession? dangNhap;
  final InvoiceApi invoiceApi;
  final String? soDienThoai;
  final OrderHistoryApi historyApi;
  final FavouriteApi favouriteApi;
  final Future<void> Function(String menuItemId, int quantity) themVaoGio;
  final LoyaltyApi loyaltyApi;
  final CauHinhMayChu cauHinh;
  final VoidCallback onMoCaiDat;
  final Future<void> Function() onRoiBan;
  final VoidCallback onDangNhap;
  final Future<void> Function() onDangXuat;

  @override
  Widget build(BuildContext context) {
    final ses = dangNhap;
    return Scaffold(
      appBar: AppBar(title: const Text('Tài khoản')),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.table_restaurant),
            title: Text('Bàn ${phienBan.tableCode}'),
            subtitle: Text(phienBan.tableDisplayName),
            trailing:
                TextButton(onPressed: onRoiBan, child: const Text('Rời bàn')),
          ),
          ListTile(
            leading: const Icon(Icons.dns),
            title: const Text('Máy chủ'),
            // Hiện địa chỉ đang dùng chứ không chỉ chữ "Cài đặt": khi app không gọi được gì, câu
            // hỏi đầu tiên luôn là "nó đang trỏ vào đâu", và câu trả lời phải ở ngay đây.
            subtitle: Text(cauHinh.apiBaseUrl),
            trailing: const Icon(Icons.chevron_right),
            onTap: onMoCaiDat,
          ),
          ListTile(
            leading: const Icon(Icons.payments),
            title: const Text('Thanh toán'),
            subtitle: const Text('Xem hoá đơn và chọn cách trả tiền'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => PaymentScreen(
                api: invoiceApi,
                phienBan: phienBan,
                soDienThoai: soDienThoai,
              ),
            )),
          ),
          const Divider(),
          if (ses == null)
            ListTile(
              leading: const Icon(Icons.person_outline),
              title: const Text('Khách vãng lai'),
              subtitle:
                  const Text('Đăng nhập để tích điểm và xem ưu đãi riêng'),
              trailing: TextButton(
                  onPressed: onDangNhap, child: const Text('Đăng nhập')),
            )
          else ...[
            ListTile(
              leading: const Icon(Icons.person),
              title: Text(ses.user.fullName),
              subtitle: Text(ses.user.email),
              trailing: TextButton(
                  onPressed: onDangXuat, child: const Text('Đăng xuất')),
            ),
            ListTile(
              leading: const Icon(Icons.history),
              title: const Text('Lịch sử đơn'),
              subtitle: const Text('Đơn của những lần ghé trước'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => HistoryScreen(
                  api: historyApi,
                  favouriteApi: favouriteApi,
                  dangNhap: ses,
                  themVaoGio: themVaoGio,
                ),
              )),
            ),
            ListTile(
              leading: const Icon(Icons.card_giftcard),
              title: const Text('Điểm thưởng'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => LoyaltyScreen(api: loyaltyApi, dangNhap: ses),
              )),
            ),
          ],
        ],
      ),
    );
  }
}
