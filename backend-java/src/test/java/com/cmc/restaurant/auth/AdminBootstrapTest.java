package com.cmc.restaurant.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Example;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/**
 * Tài khoản quản trị đầu tiên.
 *
 * <p>Lỗi đã gặp thật: máy chủ staging lên xanh, năm cổng web trả HTTP 200, và KHÔNG có tài khoản
 * nào đăng nhập được. Không migration nào chèn người dùng, còn mọi đường tạo tài khoản nhân sự đều
 * nằm sau lớp xác thực vai trò Admin — nên bản triển khai tự khoá mình ra ngoài, không có đường
 * vào qua API.
 */
class AdminBootstrapTest {

	private static final String MAT_KHAU = "MatKhauDemo#123";

	@Test
	@DisplayName("Chưa đặt biến thì KHÔNG tạo gì — máy phát triển không tự mọc tài khoản quản trị")
	void doesNothingWhenUnconfigured() {
		KhoGia kho = new KhoGia();

		chay(kho, new AdminBootstrapProperties(null, null, null));
		chay(kho, new AdminBootstrapProperties("", "", ""));
		chay(kho, new AdminBootstrapProperties("admin@quan.test", "", null));
		chay(kho, new AdminBootstrapProperties("", MAT_KHAU, null));

		assertThat(kho.daLuu)
				.as("thiếu email hoặc mật khẩu mà vẫn tạo nghĩa là có một mặc định ở đâu đó")
				.isEmpty();
	}

	@Test
	@DisplayName("Đặt đủ và chưa có ai thì tạo Admin, và mật khẩu ĐÃ BĂM")
	void createsAdminWhenConfiguredAndEmpty() {
		KhoGia kho = new KhoGia();

		chay(kho, new AdminBootstrapProperties("admin@quan.test", MAT_KHAU, "Chị Quản"));

		assertThat(kho.daLuu).hasSize(1);
		UserEntity admin = kho.daLuu.get(0);
		assertThat(admin.getEmail()).isEqualTo("admin@quan.test");
		assertThat(admin.getFullName()).isEqualTo("Chị Quản");
		assertThat(admin.getRole()).isEqualTo(UserRole.ADMIN);

		// Lưu thô thì bất kỳ ai đọc được cơ sở dữ liệu cũng đăng nhập được bằng tài khoản quyền
		// cao nhất. Kiểm cả hai chiều: không phải chuỗi gốc, VÀ băm ra khớp lại được.
		assertThat(admin.getPasswordHash()).isNotEqualTo(MAT_KHAU);
		assertThat(new PasswordHasher().verifyPassword(MAT_KHAU, admin.getPasswordHash())).isTrue();
	}

	@Test
	@DisplayName("Đã có Admin thì KHÔNG đụng vào — không đặt lại mật khẩu mỗi lần khởi động")
	void neverOverwritesAnExistingAdmin() {
		// Không có luật này thì mỗi lần khởi động lại là một lần đưa mật khẩu về giá trị trong biến
		// môi trường, kể cả sau khi quản trị viên đã tự đổi — và biến đó nằm trong lịch sử cấu hình
		// của người triển khai, không nằm trong tay chủ tài khoản.
		KhoGia kho = new KhoGia();
		kho.coAdmin = true;

		chay(kho, new AdminBootstrapProperties("admin@quan.test", MAT_KHAU, null));

		assertThat(kho.daLuu).isEmpty();
	}

	@Test
	@DisplayName("Mật khẩu ngắn thì DỪNG HẲN, không im lặng bỏ qua")
	void refusesToStartOnAShortPassword() {
		// Bỏ qua ở đây cho ra đúng triệu chứng mà lớp này sinh ra để chữa: máy chủ lên xanh, không
		// ai đăng nhập được, và không có gì nói tại sao.
		KhoGia kho = new KhoGia();

		assertThatThrownBy(() -> chay(kho, new AdminBootstrapProperties("admin@quan.test", "ngan", null)))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("ADMIN_BOOTSTRAP_PASSWORD");

		assertThat(kho.daLuu).isEmpty();
	}

	@Test
	@DisplayName("Email đã thuộc tài khoản khác thì bỏ qua, không để ràng buộc duy nhất ném ra")
	void skipsWhenTheEmailIsTaken() {
		KhoGia kho = new KhoGia();
		kho.emailDaCo = true;

		chay(kho, new AdminBootstrapProperties("admin@quan.test", MAT_KHAU, null));

		assertThat(kho.daLuu).isEmpty();
	}

	@Test
	@DisplayName("Không khai họ tên thì vẫn có tên đọc được, không để rỗng")
	void fallsBackToAReadableName() {
		KhoGia kho = new KhoGia();

		chay(kho, new AdminBootstrapProperties("admin@quan.test", MAT_KHAU, "   "));

		assertThat(kho.daLuu.get(0).getFullName()).isNotBlank();
	}

	private static void chay(KhoGia kho, AdminBootstrapProperties props) {
		new AdminBootstrap(kho, new PasswordHasher(), props).run(null);
	}

	/**
	 * Kho giả lập: chỉ ba câu hỏi mà {@link AdminBootstrap} thật sự hỏi.
	 *
	 * <p>Viết tay thay vì Mockito vì phần còn lại của {@link UserRepository} không liên quan, và
	 * một bản giả lập tự động sẽ âm thầm trả `false`/`null` cho mọi thứ — che mất việc lớp đang
	 * kiểm gọi thêm gì ngoài dự kiến.
	 */
	private static final class KhoGia implements UserRepository {
		final List<UserEntity> daLuu = new ArrayList<>();
		boolean coAdmin;
		boolean emailDaCo;

		@Override
		public boolean existsByRole(String role) {
			return coAdmin && UserRole.ADMIN.equals(role);
		}

		@Override
		public boolean existsByEmailIgnoreCase(String email) {
			return emailDaCo;
		}

		@Override
		public <S extends UserEntity> S save(S entity) {
			daLuu.add(entity);
			return entity;
		}

		// Phần còn lại của JpaRepository — không lời gọi nào được đi qua đây. Ném ra thay vì trả
		// null: nếu AdminBootstrap gọi thêm thứ gì, phép kiểm phải đỏ chứ không im lặng chạy tiếp.
		private static UnsupportedOperationException khongDung() {
			return new UnsupportedOperationException("AdminBootstrap không được gọi phương thức này");
		}

		@Override public Optional<UserEntity> findByEmailIgnoreCase(String e) { throw khongDung(); }
		@Override public Optional<UserEntity> findByGoogleSub(String s) { throw khongDung(); }
		@Override public boolean existsByPhoneNumberAndIdNot(String p, String i) { throw khongDung(); }
		@Override public Optional<UserEntity> findByPhoneNumber(String p) { throw khongDung(); }
		@Override public Optional<UserEntity> findFirstByRoleAndIdNotOrderByCreatedAtAsc(String r, String i) { throw khongDung(); }
		@Override public void flush() { throw khongDung(); }
		@Override public <S extends UserEntity> S saveAndFlush(S e) { throw khongDung(); }
		@Override public <S extends UserEntity> List<S> saveAllAndFlush(Iterable<S> e) { throw khongDung(); }
		@Override public void deleteAllInBatch(Iterable<UserEntity> e) { throw khongDung(); }
		@Override public void deleteAllByIdInBatch(Iterable<String> i) { throw khongDung(); }
		@Override public void deleteAllInBatch() { throw khongDung(); }
		@Override public UserEntity getOne(String id) { throw khongDung(); }
		@Override public UserEntity getById(String id) { throw khongDung(); }
		@Override public UserEntity getReferenceById(String id) { throw khongDung(); }
		@Override public <S extends UserEntity> Optional<S> findOne(Example<S> e) { throw khongDung(); }
		@Override public <S extends UserEntity> List<S> findAll(Example<S> e) { throw khongDung(); }
		@Override public <S extends UserEntity> List<S> findAll(Example<S> e, Sort s) { throw khongDung(); }
		@Override public <S extends UserEntity> Page<S> findAll(Example<S> e, Pageable p) { throw khongDung(); }
		@Override public <S extends UserEntity> long count(Example<S> e) { throw khongDung(); }
		@Override public <S extends UserEntity> boolean exists(Example<S> e) { throw khongDung(); }
		@Override public <S extends UserEntity, R> R findBy(Example<S> e, java.util.function.Function<org.springframework.data.repository.query.FluentQuery.FetchableFluentQuery<S>, R> f) { throw khongDung(); }
		@Override public <S extends UserEntity> List<S> saveAll(Iterable<S> e) { throw khongDung(); }
		@Override public Optional<UserEntity> findById(String id) { throw khongDung(); }
		@Override public boolean existsById(String id) { throw khongDung(); }
		@Override public List<UserEntity> findAll() { throw khongDung(); }
		@Override public List<UserEntity> findAllById(Iterable<String> ids) { throw khongDung(); }
		@Override public long count() { throw khongDung(); }
		@Override public void deleteById(String id) { throw khongDung(); }
		@Override public void delete(UserEntity e) { throw khongDung(); }
		@Override public void deleteAllById(Iterable<? extends String> ids) { throw khongDung(); }
		@Override public void deleteAll(Iterable<? extends UserEntity> e) { throw khongDung(); }
		@Override public void deleteAll() { throw khongDung(); }
		@Override public List<UserEntity> findAll(Sort s) { throw khongDung(); }
		@Override public Page<UserEntity> findAll(Pageable p) { throw khongDung(); }
	}
}
