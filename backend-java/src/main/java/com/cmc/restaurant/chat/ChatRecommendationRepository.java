package com.cmc.restaurant.chat;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatRecommendationRepository extends JpaRepository<ChatRecommendationEntity, String> {

	List<ChatRecommendationEntity> findByChatSessionIdOrderByCreatedAtAsc(String chatSessionId);

	/** Khoá tự nhiên của bảng: chỉ số duy nhất trong V1 là (chat_session_id, menu_item_id, status),
	 * nên tra đúng bộ ba này là cách biết một lần bấm là mới hay lặp lại. */
	Optional<ChatRecommendationEntity> findByChatSessionIdAndMenuItemIdAndStatus(
			String chatSessionId, String menuItemId, String status);
}
