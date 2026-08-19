package com.cmc.restaurant;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/**
 * Biến bố cục §5.3 từ quy ước thành thứ kiểm chứng được.
 *
 * <p>Lý do có file này: bố cục hexagonal của Orders vừa dựng xong ở #76 thì **ngay commit kế tiếp**
 * đã có import từ {@code orders/domain} trỏ ngược ra {@code adapter} và {@code application}. Một
 * cấu trúc thư mục không tự bảo vệ được mình; chỉ có test mới làm được.
 *
 * <p>Phân vai rõ ràng với Checkstyle, hai thứ bắt hai loại lỗi khác nhau:
 * <ul>
 *   <li>Import <em>chết</em> (chỉ nằm trong javadoc) bị xoá lúc biên dịch nên <b>không</b> để lại
 *       dấu vết trong bytecode — ArchUnit không thấy. Đó là việc của Checkstyle.</li>
 *   <li>Phụ thuộc <em>thật</em> thì ngược lại: ArchUnit bắt, Checkstyle không.</li>
 * </ul>
 * Sự cố ở #81 thuộc loại thứ nhất; luật dưới đây chặn loại thứ hai trước khi nó kịp xảy ra.
 */
@AnalyzeClasses(
		packages = "com.cmc.restaurant",
		importOptions = ImportOption.DoNotIncludeTests.class)
class HexagonalArchitectureTest {

	@ArchTest
	static final ArchRule domain_khong_phu_thuoc_tang_ngoai =
			noClasses()
					.that().resideInAPackage("..domain..")
					.should().dependOnClassesThat().resideInAnyPackage("..application..", "..adapter..")
					.because("domain giữ luật nghiệp vụ; nó phải là tầng trong cùng, không biết gì về "
							+ "tầng gọi nó (application) hay tầng lưu trữ / HTTP (adapter)");

	@ArchTest
	static final ArchRule domain_khong_dinh_framework =
			noClasses()
					.that().resideInAPackage("..domain..")
					.should().dependOnClassesThat().resideInAnyPackage(
							"org.springframework..", "jakarta..", "javax..", "org.hibernate..")
					.because("toàn bộ máy trạng thái phải test được bằng `new Order(...)` mà không cần "
							+ "Spring context lẫn PostgreSQL — đúng điều javadoc của Order tự tuyên bố");

	/**
	 * DoD của #80. Trước đó Payments, Realtime, Tables và Reports import thẳng
	 * {@code orders.adapter.out.persistence.OrderEntity} / {@code OrderRepository} — tức biết Orders
	 * lưu trữ bằng gì. Giờ chúng chỉ biết {@code orders.application.OrderLookup}.
	 *
	 * <p>Luật này đọc bytecode nên không thể lách bằng cách bỏ dòng {@code import} rồi viết tên đầy
	 * đủ; phụ thuộc thật vẫn bị bắt.
	 */
	@ArchTest
	static final ArchRule module_khac_khong_duoc_doc_adapter_cua_orders =
			noClasses()
					.that().resideOutsideOfPackage("com.cmc.restaurant.orders..")
					.should().dependOnClassesThat().resideInAPackage("com.cmc.restaurant.orders.adapter..")
					.because("module khác chỉ được biết Orders TRẢ LỜI ĐƯỢC CÂU HỎI GÌ (cổng ở tầng "
							+ "application), không được biết Orders LƯU TRỮ RA SAO");
}
