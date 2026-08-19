package com.cmc.restaurant.chat;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatMessageRepository extends JpaRepository<ChatMessageEntity, String> {

	/** Cũ nhất trước — hội thoại đọc theo thứ tự thời gian (#95). */
	List<ChatMessageEntity> findByChatSessionIdOrderByCreatedAtAsc(String chatSessionId);
}
