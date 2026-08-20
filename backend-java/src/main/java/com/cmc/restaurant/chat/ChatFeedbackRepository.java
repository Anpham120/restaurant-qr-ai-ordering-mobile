package com.cmc.restaurant.chat;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatFeedbackRepository extends JpaRepository<ChatFeedbackEntity, String> {

	/**
	 * Danh sách cho quản trị, mới nhất trước, kèm câu trả lời bị chấm.
	 *
	 * <p>Nối sang {@code chat_messages} ngay trong truy vấn thay vì đọc từng tin nhắn một sau đó:
	 * 200 dòng phản hồi sẽ thành 201 lượt truy vấn. {@code rating} rỗng nghĩa là không lọc — viết
	 * thành một truy vấn có điều kiện thay vì hai phương thức để chỗ gọi khỏi phải rẽ nhánh.
	 */
	@Query("""
			select new com.cmc.restaurant.chat.ChatDtos$AdminChatFeedbackRow(
				f.id, f.chatSessionId, f.messageId, f.rating, f.reason, f.createdAt, m.role, m.content)
			from ChatFeedbackEntity f join ChatMessageEntity m on m.id = f.messageId
			where (:rating is null or f.rating = :rating)
			order by f.createdAt desc""")
	List<ChatDtos.AdminChatFeedbackRow> listForAdmin(@Param("rating") String rating, Pageable pageable);
}
