import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "vi" | "en";
export type TranslationParams = Record<string, string | number>;

const COOKIE_KEY = "cmc_locale";
const STORAGE_KEY = "cmc.locale";

export const EN_COPY: Record<string, string> = {
  "Tiếng Việt": "Vietnamese",
  "Tiếng Anh": "English",
  "Chuyển ngôn ngữ": "Change language",
  "Đang tải...": "Loading...",
  "Đang tải…": "Loading…",
  "Thử lại": "Try again",
  "Đóng": "Close",
  "Hủy": "Cancel",
  "Xác nhận": "Confirm",
  "Tiếp tục": "Continue",
  "Quay lại": "Back",
  "Trang chủ": "Home",
  "Giới thiệu": "About",
  "Thực đơn": "Menu",
  "Đánh giá": "Reviews",
  "Album": "Gallery",
  "AI tư vấn": "AI guide",
  "Giỏ hàng": "Cart",
  "Món đã gọi": "Ordered",
  "Tất cả": "All",
  "Còn món": "Available",
  "Tạm hết": "Unavailable",
  "Thêm": "Add",
  "Giá {price}": "Price {price}",
  "Danh mục thực đơn": "Menu categories",
  "Không tìm thấy": "Not found",
  "Trang bạn đang tìm không tồn tại.": "The page you are looking for does not exist.",
  "Về trang chủ": "Back to home",
  "(tùy chọn)": "(optional)",
  "{count} lần gọi món": "{count} order rounds",
  "{count} món": "{count} items",
  "{count} phần": "{count} servings",
  "{count} phần chưa gửi bếp": "{count} servings not sent to the kitchen",
  "{count} phần trong lần gọi này": "{count} servings in this order round",
  "{item} đã được thêm vào giỏ sau khi bạn xác nhận.": "{item} was added to your cart after confirmation.",
  "AI chỉ đề xuất món này. Giỏ hàng chỉ thay đổi sau khi bạn bấm xác nhận.": "This is an AI suggestion. Your cart changes only after you confirm.",
  "AI Tư vấn CMC Restaurant": "CMC Restaurant AI Guide",
  "AI Tư vấn thực đơn": "AI Menu Guide",
  "Áp dụng": "Apply",
  "Bạn": "You",
  "Bàn {table}": "Table {table}",
  "Bàn chưa có lần gọi món nào trong phiên này.": "No orders have been placed during this table session.",
  "Bạn đã bỏ qua gợi ý này.": "You dismissed this suggestion.",
  "Bạn vẫn có thể gửi món đang chọn.": "You can still send your selected items.",
  "Bỏ qua": "Dismiss",
  "Bộ lọc thực đơn": "Menu filters",
  "Cảm ơn bạn đã dùng bữa tại CMC Restaurant.": "Thank you for dining at CMC Restaurant.",
  "Cần thanh toán": "Payment due",
  "Chi tiết": "Details",
  "Chi tiết giỏ hàng": "Cart details",
  "Chi tiết món": "Item details",
  "Chọn cách thanh toán. Nhân viên sẽ xác nhận sau khi nhận đủ tiền.": "Choose a payment method. A staff member will confirm it after receiving full payment.",
  "Chọn món": "Choose dishes",
  "Chủ tài khoản": "Account holder",
  "Chuyển đến nội dung chính": "Skip to main content",
  "Chuyển đúng số tiền và nội dung hiển thị trên mã QR.": "Transfer the exact amount using the reference shown on the QR code.",
  "Chuyển đúng số tiền và nội dung trên mã QR.": "Transfer the exact amount using the reference on the QR code.",
  "Chưa có bàn": "No table selected",
  "Chưa hữu ích": "Not helpful yet",
  "Chưa kiểm tra được phiên bàn. Vui lòng thử gửi món lại.": "The table session could not be verified. Please try sending the order again.",
  "Chưa tải được tổng các món đã gọi trong phiên.": "The table-session total could not be loaded.",
  "Có {count} món tạm hết. Vui lòng bỏ món đó khỏi giỏ trước khi đặt.": "{count} items are unavailable. Remove them from your cart before ordering.",
  "Đã chọn": "Selected",
  "Đã gọi trong phiên": "Ordered this session",
  "Đã gửi yêu cầu hỗ trợ tới nhân viên. Vui lòng chờ trong giây lát.": "Your assistance request was sent. A staff member will be with you shortly.",
  "Đã gửi yêu cầu thanh toán tiền mặt.": "Your cash payment request was sent.",
  "Đã kết nối": "Connected",
  "Đã tạo yêu cầu thanh toán VietQR.": "Your VietQR payment request was created.",
  "Đã thêm {count} phần vào giỏ.": "Added {count} servings to your cart.",
  "Đang cập nhật trạng thái cho {code}.": "Updating the status of {code}.",
  "Đang chế biến": "Preparing",
  "Đang chọn thêm": "Selecting more items",
  "Đang chờ thanh toán tiền mặt": "Awaiting cash payment",
  "Đang chờ thanh toán VietQR": "Awaiting VietQR payment",
  "Đang chờ thanh toán VietQR.": "Awaiting VietQR payment.",
  "Đang chờ xác nhận thanh toán...": "Awaiting payment confirmation...",
  "Đang gửi món...": "Sending order...",
  "Đang gửi...": "Sending...",
  "Đang gửi…": "Sending…",
  "Đang kết nối lại...": "Reconnecting...",
  "Đang kiểm tra": "Checking",
  "Đang lưu…": "Saving…",
  "Đang mở phiên gọi món…": "Opening your ordering session…",
  "Đang mở đúng bước theo trạng thái bàn…": "Opening the right step for your table status…",
  "Đang mở trang nhà hàng…": "Opening the restaurant website…",
  "Đang mở ứng dụng gọi món…": "Opening the ordering app…",
  "Đang phản hồi": "Responding",
  "Đang tải đơn hàng...": "Loading order...",
  "Đang tải hóa đơn phiên bàn…": "Loading the table-session bill…",
  "Đang tải thực đơn…": "Loading the menu…",
  "Đang tạo mã QR thanh toán...": "Creating payment QR code...",
  "Đang xác minh phiên bàn…": "Verifying the table session…",
  "Đánh giá phản hồi": "Rate this response",
  "Để sau": "Later",
  "Điều hướng gọi món": "Ordering navigation",
  "Điều hướng trang giới thiệu": "Restaurant website navigation",
  "Đơn hàng {code} đã được xác nhận thanh toán.": "Payment for order {code} has been confirmed.",
  "Đơn này đã được hoàn tiền. Vui lòng liên hệ nhân viên nếu cần hỗ trợ thêm.": "This order has been refunded. Please contact a staff member if you need more help.",
  "Đường dẫn này không tồn tại trong portal hiện tại.": "This path does not exist in the current portal.",
  "Giá": "Price",
  "Giỏ hàng đang trống.": "Your cart is empty.",
  "Giỏ hàng tại bàn": "Table cart",
  "Gọi món tại bàn": "Order at your table",
  "Gọi nhân viên": "Call staff",
  "Gọi nhân viên hỗ trợ": "Ask a staff member for help",
  "Gọi nhân viên ngay": "Call staff now",
  "Yêu cầu gọi nhân viên": "Request staff assistance",
  "Đã gọi nhân viên": "Staff notified",
  "Gợi ý cần xác nhận": "Suggestion awaiting confirmation",
  "Gợi ý món": "Dish suggestions",
  "Gợi ý nhanh": "Quick suggestions",
  "Gửi": "Send",
  "Gửi món tới bếp": "Send order to kitchen",
  "Gửi yêu cầu": "Send request",
  "Gửi yêu cầu riêng sau khi đã gửi món cho bếp.": "Send a separate request after your order has reached the kitchen.",
  "Hóa đơn đã thanh toán": "Bill paid",
  "Hóa đơn phiên bàn {table}": "Bill for table {table}",
  "Hóa đơn toàn phiên": "Full session bill",
  "Hỏi bất cứ điều gì về thực đơn, AI sẽ gợi ý cho bạn": "Ask anything about the menu and the AI guide will help",
  "Hỏi về thực đơn, gợi ý món...": "Ask about the menu or request suggestions...",
  "Hữu ích": "Helpful",
  "Không cập nhật được giỏ hàng. Vui lòng thử lại.": "The cart could not be updated. Please try again.",
  "Không còn quyền truy cập đơn này.": "You no longer have access to this order.",
  "Không gửi được đánh giá. Bạn có thể thử lại sau.": "Your rating could not be sent. Please try again later.",
  "Không gửi được yêu cầu thanh toán.": "The payment request could not be sent.",
  "Không tải được thực đơn từ hệ thống.": "The menu could not be loaded from the system.",
  "Không tải được thực đơn. Hãy thử lại.": "The menu could not be loaded. Please try again.",
  "Không tải được thực đơn. Vui lòng thử lại sau.": "The menu could not be loaded. Please try again later.",
  "Không tải được trạng thái đơn hàng.": "The order status could not be loaded.",
  "Không tạo được phiên chat. Vui lòng thử lại sau.": "The chat session could not be created. Please try again later.",
  "Không thể mở phiên bàn": "Unable to open table session",
  "Không tìm thấy món phù hợp.": "No matching dishes found.",
  "Không tìm thấy trang": "Page not found",
  "Làm mới": "Refresh",
  "Lần gọi món tiếp theo": "Next order round",
  "Lịch sử xử lý": "Status history",
  "Lỗi kết nối": "Connection error",
  "Mã đổi điểm": "Points reward code",
  "Mã bạn đổi bằng điểm trong ứng dụng": "The code you redeemed with points in the app",
  "Mã ưu đãi": "Promotion code",
  "Mã ưu đãi, tích điểm và thanh toán được áp dụng một lần cho toàn bộ món trong phiên bàn.": "Promotions, loyalty points and payment apply once to the entire table session.",
  "Mã VietQR cho hóa đơn {code}": "VietQR code for bill {code}",
  "Món đã gọi và món đang chọn được tách riêng, giúp bạn kiểm tra đúng số tiền trước mỗi lần gửi bếp.": "Ordered and selected items are shown separately so you can verify each amount before sending it to the kitchen.",
  "Món đang chọn": "Selected items",
  "Món đang phục vụ": "Items in service",
  "Món này không còn khả dụng nên không thể thêm vào giỏ.": "This item is no longer available and cannot be added to your cart.",
  "Món này tạm hết. Không thể thêm vào giỏ hàng.": "This item is unavailable and cannot be added to your cart.",
  "Món nổi bật": "Featured dishes",
  "món sẵn sàng": "items available",
  "Mở camera và quét mã QR trên bàn. Phiên gọi món chỉ hoạt động trên thiết bị đã quét mã.": "Open your camera and scan the table QR code. The ordering session works only on the device that scanned it.",
  "nắm trọn tổng phiên": "see the full session total",
  "Ngân hàng": "Bank",
  "nhà hàng": "restaurant",
  "Nhân viên đến bàn thu tiền": "A staff member collects payment at your table",
  "Nhân viên sẽ đến bàn để thu tiền và xác nhận hóa đơn.": "A staff member will collect payment at your table and confirm the bill.",
  "Nhân viên sẽ đến bàn để xác nhận thanh toán.": "A staff member will come to your table to confirm payment.",
  "Nhập tin nhắn": "Enter a message",
  "Nội dung chuyển khoản": "Transfer reference",
  "Nội dung CK": "Reference",
  "Phiên bàn {table}": "Table {table} session",
  "Phiên bàn không hợp lệ. Vui lòng quét lại QR tại bàn để gọi món.": "The table session is invalid. Scan the table QR code again to order.",
  "Phiên chat chưa sẵn sàng. Vui lòng thử lại sau.": "The chat session is not ready. Please try again later.",
  "Phiên đang mở": "Session active",
  "Phiên gọi món chưa sẵn sàng": "Ordering session not ready",
  "Phiếu bàn {table}": "Table {table} ticket",
  "Phương thức thanh toán": "Payment method",
  "QR thanh toán đơn {code}": "Payment QR code for order {code}",
  "Quay lại thực đơn": "Back to menu",
  "Quét lại QR tại bàn": "Scan the table QR code again",
  "Quét mã bằng ứng dụng ngân hàng": "Scan with your banking app",
  "Quét mã QR bằng app ngân hàng": "Scan the QR code with your banking app",
  "Quét QR để bắt đầu": "Scan QR to begin",
  "Quét QR để gọi món": "Scan QR to order",
  "Rà soát món mới,": "Review new items,",
  "Sẵn sàng": "Ready",
  "Số điện thoại tích điểm": "Loyalty phone number",
  "Số lượng {item}": "Quantity of {item}",
  "Số tài khoản": "Account number",
  "Số tiền": "Amount",
  "Tạm hết hàng": "Unavailable",
  "Tạm hết, không thể đặt món này": "Unavailable; this item cannot be ordered",
  "Tạm tính": "Subtotal",
  "Tạm tính món đang chọn": "Selected items subtotal",
  "Thanh toán": "Payment",
  "Thanh toán {amount}": "Pay {amount}",
  "Thanh toán đã được xác nhận.": "Payment has been confirmed.",
  "Thanh toán tại bàn": "Pay at table",
  "Thanh toán thành công!": "Payment successful!",
  "Hóa đơn điện tử": "Electronic receipt",
  "Xem hóa đơn điện tử": "View electronic receipt",
  "Tải ứng dụng để tích điểm cho những lần sau": "Get the app to earn points on future visits",
  "Mã HĐ": "Invoice no.",
  "Đây là biên lai điện tử mô phỏng cho phiên bàn. Phiên đã kết thúc — quét QR trên bàn khi bạn muốn gọi món lần sau.": "This is a simulated electronic receipt for your table session. The session has ended — scan the table QR when you want to order again.",
  "Thanh toán hóa đơn": "Pay bill",
  "Thanh toán hóa đơn phiên": "Pay session bill",
  "Thanh toán theo phiên bàn": "Pay for table session",
  "Thanh toán VietQR": "Pay with VietQR",
  "Theo dõi đơn": "Track order",
  "Theo dõi món theo thời gian thực": "Track dishes in real time",
  "Thêm món khác": "Add more items",
  "Thêm vào giỏ": "Add to cart",
  "Thử tải lại": "Try loading again",
  "Thực đơn xem trước · không tạo giỏ hàng": "Menu preview · cart disabled",
  "Tiền mặt": "Cash",
  "Tìm món ăn, đồ uống...": "Search dishes and drinks...",
  "Tin nhắn đang gửi": "Message sending",
  "Tóm tắt hóa đơn": "Bill summary",
  "Tổng": "Total",
  "Tổng quan phiên": "Session overview",
  "Tổng sau khi gửi": "Total after sending",
  "Trang giới thiệu": "Restaurant website",
  "Trạng thái đơn": "Order status",
  "Trạng thái từng món được cập nhật theo thời gian thực, không cần tải lại trang.": "Each dish status updates in real time without refreshing the page.",
  "Trạng thái: {status}": "Status: {status}",
  "Trợ lý AI chưa phản hồi được. Bạn vẫn có thể xem thực đơn và đặt món trực tiếp.": "The AI guide could not respond. You can still browse the menu and order directly.",
  "Trợ lý AI gợi ý bạn nên nhờ nhân viên hỗ trợ trực tiếp cho yêu cầu này.": "The AI guide recommends asking a staff member to help with this request.",
  "Ưu đãi {code}": "Promotion {code}",
  "Ưu đãi và tích điểm": "Promotions and loyalty points",
  "Ưu đãi, tích điểm và thanh toán chỉ áp dụng khi bạn yêu cầu thanh toán toàn bộ phiên bàn.": "Promotions, loyalty points and payment apply only when you request payment for the full table session.",
  "Ưu đãi, tích điểm và thanh toán được tính trên toàn bộ các lần gọi món.": "Promotions, loyalty points and payment are calculated across every order round.",
  "Về trang giới thiệu": "Back to restaurant website",
  "Ví dụ: GIAM10": "Example: GIAM10",
  "Vui lòng kiểm tra giỏ hàng trước khi gửi đơn.": "Review your cart before sending the order.",
  "Vui lòng quét QR tại bàn để mở phiên trước khi gửi món.": "Scan the table QR code to open a session before sending your order.",
  "vừa xong": "just now",
  "Xem giỏ": "View cart",
  "Xem giỏ hàng": "View cart",
  "Xem giỏ hàng gồm {count} món, tổng {total}": "View cart with {count} items, total {total}",
  "Về phiên bàn": "Back to table session",
  "Xem hóa đơn phiên bàn": "View table-session bill",
  "Xem mã VietQR": "View VietQR code",
  "Xem món đã gọi": "View ordered items",
  "Xem thực đơn": "View menu",
  "Xem trang giới thiệu nhà hàng": "View restaurant website",
  "Xem trước": "Preview",
  "Xem trước món ăn và giá hiện tại. Quét QR trên bàn khi bạn muốn gọi món.": "Preview current dishes and prices. Scan the table QR code when you are ready to order.",
  "Yêu cầu thanh toán": "Request payment",
  "* Nhà hàng có chỗ để xe ô tô miễn phí": "* Free car parking is available",
  "145 Hoàng Cầu, Q. Đống Đa, Hà Nội": "145 Hoang Cau, Dong Da District, Hanoi",
  "37 Quang Trung, Q. Hoàn Kiếm, Hà Nội": "37 Quang Trung, Hoan Kiem District, Hanoi",
  "Album ảnh không gian quán": "Restaurant gallery",
  "Ảnh tiếp": "Next image",
  "Ảnh trước": "Previous image",
  "Ẩm thực": "Cuisine",
  "Bánh xèo miền Tây tại CMC Restaurant": "Mekong Delta crispy pancake at CMC Restaurant",
  "Bếp nhận đơn ngay lập tức, nhân viên phục vụ mang món đến tận bàn.": "The kitchen receives your order instantly and our staff serve it at your table.",
  "Cách đặt món": "How to order",
  "Cảm nhận khách hàng": "Guest stories",
  "Chỉ 3 bước đơn giản để thưởng thức bữa ăn tuyệt vời tại CMC Restaurant.": "Enjoy a wonderful meal at CMC Restaurant in three simple steps.",
  "Chiều:": "Evening:",
  "Chọn món yêu thích": "Choose your favorites",
  "Chúng tôi nâng niu từng bữa ăn bằng việc sử dụng nguồn nguyên liệu tươi sạch chuẩn VietGAP thu hoạch mỗi sớm mai, và chế biến tỉ mỉ dưới đôi bàn tay của những người đầu bếp tận tâm nhất.": "We care for every meal with fresh VietGAP ingredients harvested each morning and prepared with precision by our dedicated chefs.",
  "CMC Restaurant - Hương vị Việt tròn vị": "CMC Restaurant — The fullness of Vietnamese flavor",
  "CMC Restaurant, nơi hội tụ tinh hoa ẩm thực Việt trong không gian ấm cúng, trang nhã.": "CMC Restaurant brings the finest Vietnamese cuisine together in a warm, elegant setting.",
  "Combo gia đình": "Family combo",
  "Copyright 2024 CMC Restaurant. Thiết kế và phát triển bởi CMC Technology.": "Copyright 2024 CMC Restaurant. Designed and developed by CMC Technology.",
  "Cơ sở 1:": "Location 1:",
  "Cơ sở 2:": "Location 2:",
  "Cơ sở nhà hàng": "Restaurant locations",
  "Danh mục": "Categories",
  "Duyệt thực đơn, chọn món yêu thích và gửi đơn ngay tại bàn.": "Browse the menu, choose your favorites and send your order from the table.",
  "Đánh giá khách": "Guest rating",
  "Đặt món ngay tại bàn của bạn": "Order right from your table",
  "Đậm đà": "Rich",
  "Đơn giản & Nhanh chóng": "Simple & quick",
  "Giảm 15% tất cả đồ uống và tráng miệng vào khung giờ vàng mỗi ngày.": "Enjoy 15% off all drinks and desserts during happy hour every day.",
  "Giờ mở cửa": "Opening hours",
  "Hanoi Food Review & Báo chí nói về chúng tôi": "What Hanoi Food Review and the press say about us",
  "Happy Hour 14h-17h": "Happy Hour 2–5 PM",
  "Hương vị cơm Việt": "Vietnamese home-style cuisine",
  "Khám phá từng góc nhỏ của CMC Restaurant qua bộ ảnh không gian bên dưới.": "Discover every corner of CMC Restaurant in the gallery below.",
  "Không gian nhà hàng": "Restaurant spaces",
  "Không gian nhà hàng được thiết kế mở, tối giản và ngập tràn nắng gió tự nhiên. Đây là nơi phù hợp cho bữa cơm gia đình, buổi hẹn hò hoặc gặp gỡ đối tác.": "Our open, understated dining space is filled with natural light and fresh air—ideal for family meals, dates or business gatherings.",
  "Không gian quán": "Our spaces",
  "Không gian tầng 1 rộng rãi": "Spacious first-floor dining room",
  "Khuyến mãi hôm nay": "Today's offers",
  "Liên hệ": "Contact",
  "Món bán chạy": "Best sellers",
  "Món ngon Việt": "Vietnamese dishes",
  "Mỗi bàn có mã QR riêng. Quét để mở phiên đặt món cho bàn của bạn.": "Each table has its own QR code. Scan it to open your table's ordering session.",
  "Một nơi để tìm về đúng nghĩa của mâm cơm Việt, những món ngon mộc mạc của bà của mẹ nhưng được bày biện tinh tế theo đẳng cấp 5 sao.": "A true return to the Vietnamese family table, where comforting recipes from mothers and grandmothers are presented with five-star finesse.",
  "MỚI": "NEW",
  "Nem rán Hà Nội - Đặc sản CMC Restaurant": "Hanoi fried spring rolls — a CMC Restaurant specialty",
  "Nhà hàng cơm Việt ngon tròn vị, kết hợp ẩm thực gia đình mộc mạc với trải nghiệm phục vụ hiện đại.": "Full-flavored Vietnamese home cooking paired with a modern dining experience.",
  "Nhận món tại bàn": "Enjoy service at your table",
  "Những món ăn được yêu thích nhất tại nhà hàng, chế biến từ nguyên liệu tươi ngon mỗi ngày.": "Our guests' favorite dishes, prepared daily with fresh ingredients.",
  "Phòng VIP sang trọng": "Elegant VIP room",
  "Quét mã QR tại bàn": "Scan the table QR code",
  "Quét mã QR trên bàn để bắt đầu phiên đặt món. Bếp nhận đơn ngay, phục vụ nhanh chóng.": "Scan the table QR code to start ordering. Your order reaches the kitchen instantly for prompt service.",
  "Quét QR để đặt món": "Scan QR to order",
  "Ra mắt 10 món mới đặc biệt cho mùa hè với nguyên liệu theo mùa tươi ngon.": "Discover 10 new summer specials made with fresh seasonal ingredients.",
  "Sáng:": "Lunch:",
  "Sẵn sàng thưởng thức?": "Ready to dine?",
  "Sân vườn xanh mát": "Lush garden",
  "Slide sau": "Next slide",
  "Slide trước": "Previous slide",
  "Tại CMC Restaurant, triết lý của chúng tôi rất đơn giản: chia sẻ hương vị ẩm thực Việt truyền thống và văn hóa thưởng thức cơm gia đình thơm ngon, tròn vị tới tất cả mọi người.": "Our philosophy is simple: share the full flavors of traditional Vietnamese cuisine and the culture of the family table with everyone.",
  "Tất cả các ngày trong tuần": "Open every day",
  "Thực đơn đang được đồng bộ từ hệ thống. Vui lòng thử lại sau ít phút.": "The menu is syncing. Please try again in a few minutes.",
  "Thực đơn hôm nay": "Today's menu",
  "Thực đơn mùa hè": "Summer menu",
  "Tiết kiệm 20% khi gọi combo 4 món chính + 2 đồ uống + 1 tráng miệng.": "Save 20% with a combo of four mains, two drinks and one dessert.",
  "Triết lý ẩm thực": "Our culinary philosophy",
  "Truyền thông đánh giá": "Press reviews",
  "Về chúng tôi": "About us",
  "Vị trí CMC Restaurant trên Google Maps": "CMC Restaurant on Google Maps",
  "Vui lòng quét mã QR tại bàn trong nhà hàng để đặt món.": "Please scan the QR code at your table to order.",
  "Xem ảnh phóng to": "View enlarged image",
  "Xem ảnh: {caption}": "View image: {caption}",
  "Xem thêm": "View more",
  "Xem Video Đánh Giá": "Watch the review",

  "Phở bò tái nạm truyền thống": "Traditional rare-beef and brisket pho",
  "Bún chả Hà Nội đặc trưng": "Classic Hanoi grilled pork with noodles",
  "Cơm tấm sườn bì chả Sài Gòn": "Saigon broken rice with pork chop, pork skin and egg loaf",
  "Lẩu hải sản chua cay": "Hot and sour seafood hotpot",
  "Phở bò tái nạm": "Rare-beef and brisket pho",
  "Nước dùng hầm xương 12 tiếng, thịt bò tái mềm, nạm giòn và hành lá tươi. Tinh hoa ẩm thực Hà Nội.": "Twelve-hour bone broth with tender rare beef, brisket and fresh scallions—a Hanoi classic.",
  "Bún chả Hà Nội": "Hanoi grilled pork with noodles",
  "Chả viên và chả miếng nướng than hoa thơm lừng, ăn kèm bún tươi, rau sống và nước mắm chua ngọt.": "Charcoal-grilled pork patties and slices served with fresh noodles, herbs and sweet-sour fish sauce.",
  "Cơm tấm sườn bì chả": "Broken rice with pork chop, pork skin and egg loaf",
  "Sườn nướng mật ong giòn ngọt, bì heo sợi giòn dai và chả trứng hấp mềm mịn, đúng vị Sài Gòn.": "Honey-glazed pork chop, springy shredded pork skin and soft steamed egg loaf in true Saigon style.",
  "Tôm, mực, nghêu tươi sống trong nước lẩu Tom Yum chua cay đậm đà, ăn kèm rau sống và bún tươi.": "Fresh shrimp, squid and clams in bold hot-and-sour Tom Yum broth, served with vegetables and rice noodles.",
  "Một nơi để tìm về đúng nghĩa với mâm cơm Việt, những món ngon mộc mạc của bà của mẹ. Mình gọi đĩa thịt rang cháy cạnh và bát canh cua mồng tơi nhiều gạch kèm cà pháo muối giòn mà ưng ý vô cùng!": "A true return to the Vietnamese family table and the comforting food of our mothers and grandmothers. The caramelized pork, crab soup with malabar spinach and crisp pickled eggplant were wonderful!",
  "Đồ ăn đúng vị gia đình nhưng lại được bày biện bắt mắt như nhà hàng 5 sao. Không gian quán đẹp, thoáng đãng ngập ánh nắng tự nhiên, phục vụ rất dễ thương và lên món nhanh.": "The food tastes just like home yet looks five-star. The beautiful, airy space is filled with natural light, and the warm team serves dishes quickly.",
  "Nhà hàng cơm Việt CMC là nơi tôi tự tin rủ bạn bè, đối tác đi ăn những bữa cơm thân mật như tại nhà. Đặc biệt hệ thống quét QR đặt món tại bàn rất tiện lợi, thông minh.": "CMC is where I confidently bring friends and business partners for a meal that feels like home. The smart table-side QR ordering is especially convenient.",

  "Ngoại cảnh nhà hàng CMC Restaurant": "CMC Restaurant exterior",
  "Mặt tiền nhà hàng": "Restaurant frontage",
  "Sảnh đón khách ấm áp": "Warm reception lobby",
  "Sảnh đón khách": "Reception lobby",
  "Không gian tầng 1 rộng rãi, ngập nắng": "Spacious, sunlit first-floor dining room",
  "Không gian tầng 1": "First-floor dining room",
  "Góc ấm cúng dành cho gia đình": "Cozy family dining corner",
  "Góc gia đình": "Family corner",
  "Phòng VIP sang trọng cho tiếp khách": "Elegant VIP room for private dining",
  "Phòng VIP": "VIP room",
  "Sân vườn xanh mát buổi tối": "Lush garden at night",
  "Sân vườn": "Garden",
  "Bếp mở với đầu bếp chuyên nghiệp": "Open kitchen with professional chefs",
  "Bếp mở": "Open kitchen",
  "Quầy bar pha chế đồ uống": "Drink bar",
  "Quầy bar": "Bar",
  "Chi tiết trang trí phong cách Việt": "Vietnamese-inspired decor",
  "Trang trí nội thất": "Interior decor",
  "Ban công tầng 2 lãng mạn": "Romantic second-floor balcony",
  "Ban công tầng 2": "Second-floor balcony",
  "Bàn tiệc trang trí tinh tế": "Elegantly dressed banquet table",
  "Bàn tiệc": "Banquet table",
  "Hành lang ấm áp với gạch trần": "Warm exposed-brick corridor",
  "Hành lang": "Corridor",
  "Ngoại cảnh": "Exterior",
  "Nội thất": "Interior",
  "Bếp": "Kitchen",
  "Trang trí": "Decor",
  "Phiên bàn đã hết hạn hoặc đã được nhân viên đóng. Vui lòng quét QR tại bàn để mở phiên mới.": "This table session has expired or was closed by staff. Scan the table QR code to open a new session.",
  "Không thể xác minh phiên bàn lúc này. Hãy kiểm tra kết nối và thử lại.": "The table session cannot be verified right now. Check your connection and try again.",
  "Liên kết này chưa có quyền truy cập phiên. Vui lòng mở lại bằng mã QR trên bàn.": "This link does not have session access. Open it again from the table QR code.",
  "Phiên trên thiết bị không khớp với liên kết. Vui lòng quét lại mã QR trên bàn.": "The session on this device does not match the link. Scan the table QR code again.",
  "Phiên bàn này đã hết hạn. Vui lòng quét lại QR tại bàn.": "This table session has expired. Scan the table QR code again.",
  "Không thể kết nối phiên bàn. Vui lòng thử lại hoặc nhờ nhân viên hỗ trợ.": "The table session could not be connected. Try again or ask a staff member for help.",
  "Mã QR không hợp lệ hoặc không còn hoạt động.": "This QR code is invalid or no longer active.",
  // Nhãn trạng thái MÓN cho khách. Năm câu này tới `t()` qua biến (`labelGuestItemStatus`), nên
  // phép kiểm phủ ngôn ngữ — vốn chỉ quét `t("...")` viết thẳng — KHÔNG thấy chúng. Đổi bộ chữ
  // tiếng Việt mà quên chỗ này thì khách nói tiếng Anh nhận lại nguyên câu tiếng Việt, và không
  // có gì đỏ lên. Đã xảy ra thật: `orderItemStatusEnCopy.test.ts` là cửa chặn cho lần sau.
  // Nhãn trạng thái ĐƠN cho khách, và câu mô tả từng bước tiến trình. Cũng tới `t` qua biến như
  // nhãn món, nên cũng nằm ngoài tầm cửa phủ ngôn ngữ — `orderItemStatusEnCopy.test.ts` canh cả hai.
  "Bếp đang đông nên món lâu hơn thường ngày.": "The kitchen is busy, so dishes take longer than usual.",
  "Dự kiến {khoang}": "Expected in {khoang}",
  "Đã gửi bếp": "Sent to the kitchen",
  "Bếp đã nhận": "The kitchen has it",
  "Đang nấu": "Cooking",
  "Nấu xong, chờ mang ra": "Cooked, waiting to be brought out",
  "Đơn đã tới bếp.": "The order reached the kitchen.",
  "Bếp đang làm các món.": "The kitchen is cooking your dishes.",
  "Món đã xong, đang được mang ra.": "The dishes are done and on their way out.",
  "Bếp đã đưa hết món ra bàn.": "The kitchen has sent every dish to your table.",
  "Đã gửi bếp, chờ tới lượt": "Sent to the kitchen, waiting its turn",
  "Đang làm món của bạn": "Your dish is being cooked",
  "Món xong, đang mang ra bàn": "Ready and on its way to your table",
  "Đã mang ra bàn": "Brought to your table",
  "Đã huỷ": "Cancelled",
  "Đã lên {daLen}/{tong} món": "{daLen}/{tong} dishes at your table",
  "Đã lên {daLen}/{tong} món · {dangRa} món đang mang ra": "{daLen}/{tong} dishes at your table · {dangRa} on the way",
  "{ten} đang được mang ra bàn bạn": "{ten} is on the way to your table",
  "món đã lên bàn": "dishes at your table",
  "{n} món đang mang ra": "{n} on the way",
  "Đã rõ": "Got it",
  "Đóng thông báo": "Dismiss notice",
  "Chờ xác nhận": "Awaiting confirmation",
  "Chờ chế biến": "Waiting for kitchen",
  "Đang chuẩn bị": "Preparing",
  "Sẵn sàng phục vụ": "Ready to serve",
  "Đã phục vụ": "Served",
  "Đã hủy": "Cancelled",
  "Bản nháp": "Draft",
  "Đã gửi": "Sent",
  "Đã xác nhận": "Confirmed",
  "Hoàn tất": "Completed",
  "Không thể tải các món đã gọi.": "The ordered items could not be loaded.",
  "Chờ xử lý": "Queued",
  "Bếp đã nhận món và đang xếp hàng xử lý.": "The kitchen received this item and queued it for preparation.",
  "Đầu bếp đang chế biến món này.": "The chef is preparing this item.",
  "Món đã sẵn sàng để phục vụ.": "This item is ready to serve.",
  "Món đã được phục vụ.": "This item has been served.",
  "Món đã hủy.": "This item was cancelled.",
  "Đã ghi nhận": "Received",
  "Nháp": "Draft",
  "Đã đặt": "Placed",
  "Chưa thanh toán": "Unpaid",
  "Chưa yêu cầu thanh toán": "Payment not requested",
  "Chờ thanh toán": "Awaiting payment",
  "Đã thanh toán": "Paid",
  "Thanh toán lỗi": "Payment failed",
  "Đã hoàn tiền": "Refunded",
  "Đơn đã được ghi nhận.": "Your order has been received.",
  "Bếp đang xử lý các món.": "The kitchen is preparing your dishes.",
  "Món sẵn sàng để mang ra.": "Your dishes are ready to serve.",
  "Nhân viên xác nhận phục vụ.": "A staff member confirmed service.",
  "Thông tin dị ứng chỉ mang tính tham khảo từ mô tả menu. Nếu bạn dị ứng nghiêm trọng, vui lòng báo nhân viên để xác nhận trực tiếp với bếp trước khi đặt.": "Allergen information is inferred from menu descriptions. If you have a severe allergy, ask staff to confirm directly with the kitchen before ordering.",
  "Gợi ý món nhẹ cho 2 người": "Suggest a light meal for two",
  "Có món nào hợp ăn trưa không?": "What would you recommend for lunch?",
  "Tôi muốn đồ uống thanh mát": "I would like a refreshing drink",
  "Có pizza hải sản không?": "Do you have seafood pizza?",
  "Xin chào, mình là trợ lý AI của CMC Restaurant. Mình có thể gợi ý món và tạo thẻ đề xuất, nhưng chỉ thêm vào giỏ khi bạn xác nhận.": "Hello, I’m CMC Restaurant’s AI guide. I can suggest dishes and create recommendation cards, but items are added to your cart only after you confirm.",
  "Phiên bàn đã hết hạn. Vui lòng quét lại QR tại bàn.": "The table session has expired. Scan the table QR code again.",
  "Phiên bàn không còn hợp lệ. Vui lòng quét lại QR tại bàn.": "The table session is no longer valid. Scan the table QR code again.",
  "Không thể gửi đơn lúc này.": "The order cannot be sent right now.",
  "Đang tải": "Loading",
  "Không thể thêm món vào giỏ.": "The item could not be added to your cart.",
  "Không gửi được yêu cầu hỗ trợ.": "The assistance request could not be sent.",
  "Mở menu": "Open menu",
  "Đóng menu": "Close menu",
  "Mã ưu đãi không hợp lệ.": "The promotion code is invalid.",
  "Vui lòng bấm Áp dụng để kiểm tra mã ưu đãi và xem đúng số tiền cần thanh toán.": "Select Apply to validate the promotion code and see the correct amount due.",
  "Bàn của bạn": "Your table",
  "Bắt đầu gọi món": "Start ordering",
  "Bếp đang chuẩn bị món": "The kitchen is preparing your order",
  "Bàn đã sẵn sàng thanh toán": "Your table is ready for payment",
  "Bàn sẵn sàng thanh toán. Bạn vẫn có thể gọi thêm món trước khi thanh toán.": "Your table is ready for payment. You can still add more items before paying.",
  "Đang chờ xác nhận thanh toán": "Awaiting payment confirmation",
  "Gọi món": "Order",
  "Gọi thêm món": "Order more",
  "Chế biến": "Preparing",
  "Phục vụ": "Serving",
  "Tiến trình phiên bàn": "Table session progress",
  "Đang cập nhật trực tiếp": "Live updates active",
  "Đang đồng bộ lại": "Resyncing",
  "{ready}/{total} món đã sẵn sàng": "{ready}/{total} items are ready",
  "Quét QR thành công. Bạn có thể bắt đầu gọi món.": "QR scanned successfully. You can start ordering.",
  "Bếp đã nhận món và đang cập nhật tiến độ.": "The kitchen received your order and is updating its progress.",
  "Gọi thêm trước khi thanh toán": "Add more before paying",
  "Các món đã được phục vụ. Bạn có thể yêu cầu thanh toán.": "Your order has been served. You can request payment.",
  "Món trong đơn này đã phục vụ xong. Thanh toán theo toàn bộ phiên bàn.": "All items in this order have been served. Payment is settled for the full table session.",
  "Yêu cầu đã được gửi. Vui lòng chờ nhà hàng xác nhận.": "Your request was sent. Please wait for the restaurant to confirm it.",
};

function replaceParams(template: string, params?: TranslationParams) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(params[key] ?? match));
}

export function translate(locale: Locale, source: string, params?: TranslationParams) {
  return replaceParams(locale === "en" ? EN_COPY[source] ?? source : source, params);
}

function readCookieLocale(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=(vi|en)(?:;|$)`));
  return match?.[1] === "en" ? "en" : match?.[1] === "vi" ? "vi" : null;
}

function readInitialLocale(): Locale {
  if (typeof window === "undefined") return "vi";
  const cookieLocale = readCookieLocale();
  if (cookieLocale) return cookieLocale;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "vi" || stored === "en") return stored;
  return window.navigator.language.toLowerCase().startsWith("en") ? "en" : "vi";
}

function persistLocale(locale: Locale) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, locale);
  const sharedDomain = window.location.hostname.endsWith(".cmcrestaurant.app")
    ? "; Domain=.cmcrestaurant.app"
    : "";
  document.cookie = `${COOKIE_KEY}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${sharedDomain}`;
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (source: string, params?: TranslationParams) => string;
  formatMoney: (amount: number) => string;
  formatDate: (value: string | number | Date) => string;
  formatDateTime: (value: string | number | Date) => string;
  formatTime: (value: string | number | Date) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    persistLocale(next);
    setLocaleState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    persistLocale(locale);
    const syncLocale = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && (event.newValue === "vi" || event.newValue === "en")) {
        setLocaleState(event.newValue);
      }
    };
    window.addEventListener("storage", syncLocale);
    return () => window.removeEventListener("storage", syncLocale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const intlLocale = locale === "vi" ? "vi-VN" : "en-US";
    return {
      locale,
      setLocale,
      t: (source, params) => translate(locale, source, params),
      formatMoney: (amount) => new Intl.NumberFormat(intlLocale, {
        style: "currency",
        currency: "VND",
        currencyDisplay: "symbol",
        maximumFractionDigits: 0,
      }).format(amount),
      formatDate: (value) => new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium" }).format(new Date(value)),
      formatDateTime: (value) => new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)),
      formatTime: (value) => new Intl.DateTimeFormat(intlLocale, { hour: "2-digit", minute: "2-digit" }).format(new Date(value)),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}

export function getNextLocale(locale: Locale): Locale {
  return locale === "vi" ? "en" : "vi";
}

export function LanguageSwitcher({
  className = "",
  variant = "segmented",
}: {
  className?: string;
  variant?: "segmented" | "toggle";
}) {
  const { locale, setLocale, t } = useI18n();
  if (variant === "toggle") {
    const nextLocale = getNextLocale(locale);
    const nextLocaleLabel = nextLocale === "vi" ? t("Tiếng Việt") : t("Tiếng Anh");
    return (
      <button
        aria-label={`${t("Chuyển ngôn ngữ")}: ${nextLocaleLabel}`}
        className={`language-toggle ${className}`.trim()}
        onClick={() => setLocale(nextLocale)}
        title={nextLocaleLabel}
        type="button"
      >
        {locale.toUpperCase()}
      </button>
    );
  }

  return (
    <div className={`language-switcher ${className}`.trim()} role="group" aria-label={t("Chuyển ngôn ngữ")}>
      <button aria-label={t("Tiếng Việt")} aria-pressed={locale === "vi"} onClick={() => setLocale("vi")} type="button">VI</button>
      <button aria-label={t("Tiếng Anh")} aria-pressed={locale === "en"} onClick={() => setLocale("en")} type="button">EN</button>
    </div>
  );
}
