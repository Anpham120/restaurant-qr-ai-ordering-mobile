package com.cmc.restaurant.chat;

import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Mirrors {@code ChatAdminEndpoints.cs} (.NET) — #95.
 *
 * <p>Tách khỏi {@link ChatController} vì hai lớp có chế độ bảo vệ đối lập: mọi endpoint của khách
 * mở công khai rồi tự kiểm token phiên chat bên trong, còn endpoint này là {@code AdminOnly}. Để
 * chung một lớp thì quy tắc {@code permitAll} theo đường dẫn trong {@code SecurityConfig} sẽ nằm
 * cạnh một phương thức không được phép mở, và một lần sửa đường dẫn cẩu thả là lộ toàn bộ phản hồi
 * của khách.
 */
@RestController
@PreAuthorize("hasRole('Admin')")
public class AdminChatController {

	private final ChatService chatService;

	public AdminChatController(ChatService chatService) {
		this.chatService = chatService;
	}

	@GetMapping("/api/admin/chat/feedback")
	public List<ChatDtos.AdminChatFeedbackResponse> listFeedback(
			@RequestParam(required = false) String rating,
			@RequestParam(defaultValue = "50") int take) {
		return chatService.listFeedbackForAdmin(rating, take);
	}
}
