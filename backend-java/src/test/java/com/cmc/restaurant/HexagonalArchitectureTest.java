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
}
