package com.cmc.restaurant.tables;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TableSessionRepository extends JpaRepository<TableSessionEntity, String> {

	List<TableSessionEntity> findByRestaurantTableIdAndStatus(String restaurantTableId, TableSessionStatus status);

	@Query("select s from TableSessionEntity s where s.restaurantTableId = :tableId "
			+ "and s.status = 'Open' and s.closedAt is null and s.expiresAt > :now "
			+ "order by s.openedAt desc")
	List<TableSessionEntity> findActiveSessions(@Param("tableId") String tableId, @Param("now") OffsetDateTime now);

	default Optional<TableSessionEntity> findActiveSession(String tableId, OffsetDateTime now) {
		List<TableSessionEntity> sessions = findActiveSessions(tableId, now);
		return sessions.isEmpty() ? Optional.empty() : Optional.of(sessions.get(0));
	}

	/** By table CODE rather than id — the realtime subscription guard (issue #13) only knows the
	 * code, because that is what the STOMP destination carries. */
	List<TableSessionEntity> findByTableCodeAndStatus(String tableCode, TableSessionStatus status);

	// --- quản trị phiên bàn (#91) ---------------------------------------------------------------

	/** Bàn này còn phiên đang mở THẬT SỰ không — chưa đóng và chưa hết hạn. */
	@Query("select count(s) > 0 from TableSessionEntity s where s.restaurantTableId = :tableId "
			+ "and s.status = com.cmc.restaurant.tables.TableSessionStatus.Open and s.closedAt is null "
			+ "and s.expiresAt > :now")
	boolean hasActiveSession(@Param("tableId") String tableId, @Param("now") OffsetDateTime now);

	/** {@code join fetch} vì màn quản trị hiển thị tên bàn — không có nó là N+1 một truy vấn mỗi phiên. */
	@Query("select s from TableSessionEntity s left join fetch s.restaurantTable order by s.openedAt desc")
	List<TableSessionEntity> findAllForAdmin();

	@Query("select s from TableSessionEntity s left join fetch s.restaurantTable "
			+ "where s.status = :status order by s.openedAt desc")
	List<TableSessionEntity> findAllForAdminByStatus(@Param("status") TableSessionStatus status);
}
