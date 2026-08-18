package com.cmc.restaurant.chat;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatSessionRepository extends JpaRepository<ChatSessionEntity, String> {

	List<ChatSessionEntity> findByTableSessionIdAndClosedFalse(String tableSessionId);
}
