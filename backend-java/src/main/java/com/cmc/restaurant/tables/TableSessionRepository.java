package com.cmc.restaurant.tables;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TableSessionRepository extends JpaRepository<TableSessionEntity, String> {

	List<TableSessionEntity> findByRestaurantTableIdAndStatus(String restaurantTableId, String status);

	@Query("select s from TableSessionEntity s where s.restaurantTableId = :tableId "
			+ "and s.status = 'Open' and s.closedAt is null and s.expiresAt > :now "
			+ "order by s.openedAt desc")
	List<TableSessionEntity> findActiveSessions(@Param("tableId") String tableId, @Param("now") OffsetDateTime now);

	default Optional<TableSessionEntity> findActiveSession(String tableId, OffsetDateTime now) {
		List<TableSessionEntity> sessions = findActiveSessions(tableId, now);
		return sessions.isEmpty() ? Optional.empty() : Optional.of(sessions.get(0));
	}
}
