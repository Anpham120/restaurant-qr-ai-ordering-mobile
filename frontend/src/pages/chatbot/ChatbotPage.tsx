import { FormEvent, Fragment, type KeyboardEvent, useEffect, useState } from "react";
import { useI18n } from "@cmc/i18n";
import { localizeMenuItemName } from "@cmc/i18n/menu";
import { Link } from "react-router-dom";
import { ChatMessageBubble } from "../../components/chatbot/ChatMessageBubble";
import { SuggestedCartActionCard } from "../../components/chatbot/SuggestedCartActionCard";
import "../../components/chatbot/chatbot.css";
import "../../components/chatbot/chatbot-vian-theme.css";
import { applyCartDelta } from "../../components/customer/customerMenuStorage";
import { chatApi } from "../../services/chatService";
import { fetchCustomerMenu } from "../../services/menuService";
import type { CustomerMenuResponse } from "../../services/menuService";
import {
  connectOrderRealtime,
  subscribeOrderRealtime,
  watchTableRealtime,
} from "../../services/realtimeOrderService";
import type { ChatMessage, ChatRecommendation, SuggestedCartAction } from "../../types";
import { useOrderingSession } from "../../ordering/OrderingSessionProvider";
import { orderingPath } from "../../ordering/orderingRoutes";
import {
  appendCommittedExchange,
  restoreCommittedHistory,
} from "../../ordering/chatHistory";


type ActionStatus = "pending" | "confirmed" | "dismissed";

const ALLERGEN_DISCLAIMER =
  "Thông tin dị ứng chỉ mang tính tham khảo từ mô tả menu. Nếu bạn dị ứng nghiêm trọng, vui lòng báo nhân viên để xác nhận trực tiếp với bếp trước khi đặt.";

const quickPrompts = [
  "Gợi ý món nhẹ cho 2 người",
  "Có món nào hợp ăn trưa không?",
  "Tôi muốn đồ uống thanh mát",
  "Có pizza hải sản không?",
];

const WELCOME_COPY =
  "Xin chào, mình là trợ lý AI của CMC Restaurant. Mình có thể gợi ý món và tạo thẻ đề xuất, nhưng chỉ thêm vào giỏ khi bạn xác nhận.";

function createWelcomeMessage(content: string): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
    suggestedCartActions: [],
  };
}

function getActionKey(action: SuggestedCartAction) {
  return `${action.menuItemId}:${action.quantity}`;
}

function mapRecommendationStatus(status: string): ActionStatus | null {
  if (status === "accepted" || status === "added_to_cart") {
    return "confirmed";
  }
  if (status === "rejected") {
    return "dismissed";
  }
  return null;
}

function buildActionStatuses(
  messages: ChatMessage[],
  recommendations: ChatRecommendation[],
): Record<string, ActionStatus> {
  const statuses: Record<string, ActionStatus> = {};

  for (const message of messages) {
    for (const action of message.suggestedCartActions ?? []) {
      if (action.status) {
        statuses[getActionKey(action)] = action.status;
      }
    }
  }

  const recommendationByItem = new Map<string, ActionStatus>();
  for (const recommendation of recommendations) {
    const mapped = mapRecommendationStatus(recommendation.status);
    if (mapped) {
      recommendationByItem.set(recommendation.menuItemId, mapped);
    }
  }

  for (const message of messages) {
    for (const action of message.suggestedCartActions ?? []) {
      const key = getActionKey(action);
      if (statuses[key]) {
        continue;
      }

      const fromRecommendation = recommendationByItem.get(action.menuItemId);
      if (fromRecommendation) {
        statuses[key] = fromRecommendation;
      }
    }
  }

  return statuses;
}

function buildUserMessage(content: string): ChatMessage {
  return {
    id: `user_${Date.now().toString(36)}`,
    role: "user",
    content,
    createdAt: new Date().toISOString(),
    suggestedCartActions: [],
  };
}

export function ChatbotPage() {
  const { locale, t } = useI18n();
  const { context: orderContext } = useOrderingSession();
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createWelcomeMessage(t(WELCOME_COPY))]);
  const [composerValue, setComposerValue] = useState("");
  const [isAssistantThinking, setIsAssistantThinking] = useState(false);
  const [streamingAssistantMessage, setStreamingAssistantMessage] = useState<ChatMessage | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<ChatMessage | null>(null);
  const [chatAccessToken, setChatAccessToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionStatuses, setActionStatuses] = useState<Record<string, ActionStatus>>({});
  const [feedbackMessageIds, setFeedbackMessageIds] = useState<Record<string, "up" | "down">>({});

  const [cartNotice, setCartNotice] = useState("");
  const [staffHandoffBanner, setStaffHandoffBanner] = useState(false);
  const [assistanceNotice, setAssistanceNotice] = useState("");
  const [isRequestingAssistance, setIsRequestingAssistance] = useState(false);
  const [menuData, setMenuData] = useState<CustomerMenuResponse>({ categories: [], items: [] });
  const [unavailableMenuItemIds, setUnavailableMenuItemIds] = useState<Set<string>>(new Set());

  const tableCode = orderContext.tableCode;

  useEffect(() => {
    setMessages((current) => current.map((message) => (
      message.id === "welcome" ? { ...message, content: t(WELCOME_COPY) } : message
    )));
  }, [locale, t]);

  useEffect(() => {
    let isMounted = true;

    chatApi
      .createSession({
        tableSessionId: orderContext.sessionId,
      })
      .then((session) => {
        if (isMounted) {
          const restoredMessages = restoreCommittedHistory(session.messages, createWelcomeMessage(t(WELCOME_COPY)));
          setChatSessionId(session.chatSessionId);
          setChatAccessToken(session.accessToken);
          setMessages(restoredMessages);
          setActionStatuses(buildActionStatuses(restoredMessages, session.recommendations ?? []));
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage(t("Không tạo được phiên chat. Vui lòng thử lại sau."));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [orderContext.sessionId, orderContext.tableCode]);

  useEffect(() => {
    fetchCustomerMenu().then(setMenuData).catch(() => {});
  }, []);

  useEffect(() => {
    if (!tableCode) {
      return undefined;
    }

    let active = true;

    void connectOrderRealtime()
      .then(() => watchTableRealtime(tableCode, orderContext.sessionToken))
      .catch(() => undefined);

    const unsubscribe = subscribeOrderRealtime((event) => {
      if (!active) {
        return;
      }

      if (event.event === "menu.availabilityChanged" && !event.payload.isAvailable) {
        setUnavailableMenuItemIds((current) => new Set(current).add(event.payload.menuItemId));
        setMenuData((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === event.payload.menuItemId
              ? { ...item, isAvailable: event.payload.isAvailable }
              : item,
          ),
        }));
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [tableCode]);

  async function sendMessage(event?: FormEvent<HTMLFormElement>, overrideContent?: string) {
    event?.preventDefault();

    const content = (overrideContent ?? composerValue).trim();

    if (!content || isAssistantThinking) {
      return;
    }

    if (!chatSessionId || !chatAccessToken) {
      setErrorMessage(t("Phiên chat chưa sẵn sàng. Vui lòng thử lại sau."));
      return;
    }

    const userMessage = buildUserMessage(content);

    setPendingUserMessage(userMessage);
    setComposerValue("");
    setIsAssistantThinking(true);
    setStreamingAssistantMessage(null);
    setErrorMessage("");
    setCartNotice("");
    setStaffHandoffBanner(false);

    try {
      let streamSucceeded = false;
      const streamMessageId = `assistant_stream_${Date.now().toString(36)}`;

      try {
        streamSucceeded = await chatApi.sendMessageStream(
          chatSessionId,
          { content },
          chatAccessToken,
          {
            onToken: (tokenText) => {
              setStreamingAssistantMessage((current) => {
                if (!current) {
                  return {
                    id: streamMessageId,
                    role: "assistant",
                    content: tokenText,
                    createdAt: new Date().toISOString(),
                    suggestedCartActions: [],
                  };
                }

                return {
                  ...current,
                  content: `${current.content}${tokenText}`,
                };
              });
            },
            onFinal: (response) => {
              streamSucceeded = true;
              setStreamingAssistantMessage(null);
              setMessages((current) => appendCommittedExchange(current, response));
              setActionStatuses((current) =>
                response.suggestedCartActions.reduce<Record<string, ActionStatus>>((result, action) => {
                  result[getActionKey(action)] = action.status ?? "pending";
                  return result;
                }, { ...current }),
              );
              if (response.suggestStaffHandoff) {
                setStaffHandoffBanner(true);
              }
            },
          },
        );
      } catch {
        streamSucceeded = false;
      }

      if (!streamSucceeded) {
        setStreamingAssistantMessage(null);
        const response = await chatApi.sendMessage(chatSessionId, {
          content,
        }, chatAccessToken);

        setMessages((current) => appendCommittedExchange(current, response));
        setActionStatuses((current) =>
          response.suggestedCartActions.reduce<Record<string, ActionStatus>>((result, action) => {
            result[getActionKey(action)] = action.status ?? "pending";
            return result;
          }, { ...current }),
        );
        if (response.suggestStaffHandoff) {
          setStaffHandoffBanner(true);
        }
      }
    } catch (error) {
      try {
        const history = await chatApi.getHistory(chatSessionId, chatAccessToken);
        const restoredMessages = restoreCommittedHistory(history.messages, createWelcomeMessage(t(WELCOME_COPY)));
        setMessages(restoredMessages);
        setActionStatuses(buildActionStatuses(restoredMessages, history.recommendations ?? []));
      } catch {
        // Keep the last confirmed local snapshot when history reconciliation also fails.
      }
      setComposerValue(content);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("Trợ lý AI chưa phản hồi được. Bạn vẫn có thể xem thực đơn và đặt món trực tiếp."),
      );
    } finally {
      setPendingUserMessage(null);
      setStreamingAssistantMessage(null);
      setIsAssistantThinking(false);
    }
  }

  async function confirmSuggestedAction(action: SuggestedCartAction) {
    const menuItem = menuData.items.find((item) => item.id === action.menuItemId);
    const isUnavailable = unavailableMenuItemIds.has(action.menuItemId) || !menuItem?.isAvailable;

    if (!menuItem || isUnavailable) {
      setErrorMessage(t("Món này không còn khả dụng nên không thể thêm vào giỏ."));
      return;
    }

    if (!chatSessionId || !chatAccessToken) {
      setErrorMessage(t("Phiên chat chưa sẵn sàng. Vui lòng thử lại sau."));
      return;
    }

    try {
      await applyCartDelta(action.menuItemId, action.quantity);
      await chatApi.updateRecommendation(
        chatSessionId,
        { menuItemId: action.menuItemId, status: "added_to_cart" },
        chatAccessToken,
      );
      setCartNotice(t("{item} đã được thêm vào giỏ sau khi bạn xác nhận.", {
        item: localizeMenuItemName(action.menuItemId, action.name, locale),
      }));
      setActionStatuses((current) => ({
        ...current,
        [getActionKey(action)]: "confirmed",
      }));
    } catch (error) {
      setErrorMessage(t(error instanceof Error ? error.message : "Không thể thêm món vào giỏ."));
    }
  }

  async function dismissSuggestedAction(action: SuggestedCartAction) {
    if (!chatSessionId || !chatAccessToken) {
      setActionStatuses((current) => ({
        ...current,
        [getActionKey(action)]: "dismissed",
      }));
      return;
    }

    try {
      await chatApi.updateRecommendation(
        chatSessionId,
        { menuItemId: action.menuItemId, status: "rejected" },
        chatAccessToken,
      );
      setActionStatuses((current) => ({
        ...current,
        [getActionKey(action)]: "dismissed",
      }));
    } catch {
      setActionStatuses((current) => ({
        ...current,
        [getActionKey(action)]: "dismissed",
      }));
    }
  }

  async function requestStaffAssistance() {
    if (!chatSessionId || !chatAccessToken || isRequestingAssistance) {
      return;
    }

    setIsRequestingAssistance(true);
    setAssistanceNotice("");
    setErrorMessage("");

    try {
      await chatApi.requestAssistance(chatSessionId, {}, chatAccessToken);
      setAssistanceNotice(t("Đã gửi yêu cầu hỗ trợ tới nhân viên. Vui lòng chờ trong giây lát."));
      setStaffHandoffBanner(false);
    } catch (error) {
      setErrorMessage(t(error instanceof Error ? error.message : "Không gửi được yêu cầu hỗ trợ."));
    } finally {
      setIsRequestingAssistance(false);
    }
  }

  async function submitMessageFeedback(messageId: string, rating: "up" | "down") {
    if (!chatSessionId || !chatAccessToken || feedbackMessageIds[messageId]) {
      return;
    }

    try {
      await chatApi.submitFeedback(chatSessionId, { messageId, rating }, chatAccessToken);
      setFeedbackMessageIds((current) => ({ ...current, [messageId]: rating }));
    } catch {
      setErrorMessage(t("Không gửi được đánh giá. Bạn có thể thử lại sau."));
    }
  }

  function isActionAvailable(action: SuggestedCartAction) {
    if (unavailableMenuItemIds.has(action.menuItemId)) {
      return false;
    }
    return menuData.items.find((item) => item.id === action.menuItemId)?.isAvailable ?? true;
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    void sendMessage(undefined);
  }

  return (
    <div className="page-shell page-shell-chat">
      <div className="cmc-chat-layout">
        <section className="cmc-chat-panel" aria-label={t("AI Tư vấn CMC Restaurant")}>
          <div className="cmc-chat-session-bar">
            <div>
              <h3>{t("AI Tư vấn thực đơn")}</h3>
              <p className="cmc-chat-muted">{t("Hỏi bất cứ điều gì về thực đơn, AI sẽ gợi ý cho bạn")}</p>
              <p className="cmc-chat-allergen-disclaimer">{t(ALLERGEN_DISCLAIMER)}</p>
            </div>
            {tableCode ? (
              <span className="cmc-chat-muted">{t("Bàn {table}", { table: tableCode })}</span>
            ) : null}
          </div>

          <button
            aria-label={t("Gọi nhân viên hỗ trợ")}
            className="cmc-chat-assistance-button"
            disabled={isRequestingAssistance || !chatSessionId}
            onClick={() => void requestStaffAssistance()}
            type="button"
          >
            {isRequestingAssistance ? t("Đang gửi…") : t("Gọi nhân viên")}
          </button>

          <div className="cmc-chat-transcript" aria-live="polite">
            {staffHandoffBanner ? (
              <div className="cmc-chat-handoff-banner" role="status">
                <p>{t("Trợ lý AI gợi ý bạn nên nhờ nhân viên hỗ trợ trực tiếp cho yêu cầu này.")}</p>
                <button
                  className="cmc-chat-button primary"
                  disabled={isRequestingAssistance}
                  onClick={() => void requestStaffAssistance()}
                  type="button"
                >
                  {t("Gọi nhân viên ngay")}
                </button>
              </div>
            ) : null}
            {messages.map((message) => {
              const actions = message.suggestedCartActions ?? [];
              return (
                <Fragment key={message.id}>
                  <ChatMessageBubble
                    message={message}
                    onFeedback={
                      message.role === "assistant" && message.id !== "welcome"
                        ? (rating) => void submitMessageFeedback(message.id, rating)
                        : undefined
                    }
                  />
                  {message.role === "assistant" && actions.length > 0 ? (
                    <div className="cmc-chat-suggestions-inline" aria-label={t("Gợi ý món")}>
                      {actions.map((action) => (
                        <SuggestedCartActionCard
                          action={action}
                          key={getActionKey(action)}
                          status={actionStatuses[getActionKey(action)] ?? action.status ?? "pending"}
                          imageUrl={
                            menuData.items.find((item) => item.id === action.menuItemId)?.imageUrl ?? null
                          }
                          isAvailable={isActionAvailable(action)}
                          onConfirm={(nextAction) => void confirmSuggestedAction(nextAction)}
                          onDismiss={(nextAction) => void dismissSuggestedAction(nextAction)}
                        />
                      ))}
                    </div>
                  ) : null}
                </Fragment>
              );
            })}
            {pendingUserMessage ? (
              <div className="cmc-chat-message-pending" aria-label={t("Tin nhắn đang gửi")}>
                <ChatMessageBubble message={pendingUserMessage} />
                <small>{t("Đang lưu…")}</small>
              </div>
            ) : null}
            {streamingAssistantMessage ? (
              <ChatMessageBubble message={streamingAssistantMessage} />
            ) : null}
            {messages.length <= 1 ? (
              <div className="cmc-chat-quick-prompts cmc-chat-quick-prompts-inline" aria-label={t("Gợi ý nhanh")}>
                {quickPrompts.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => sendMessage(undefined, t(prompt))}>
                    {t(prompt)}
                  </button>
                ))}
              </div>
            ) : null}
            {isAssistantThinking && !streamingAssistantMessage ? (
              <div className="cmc-chat-typing" aria-label={t("Đang phản hồi")}>
                <span />
                <span />
                <span />
              </div>
            ) : null}
            {assistanceNotice ? <p className="cmc-chat-notice">{assistanceNotice}</p> : null}
            {cartNotice ? (
              <p className="cmc-chat-notice">
                {cartNotice} <Link to={orderingPath(orderContext.sessionId, "cart")}>{t("Xem giỏ hàng")}</Link>
              </p>
            ) : null}
            {errorMessage ? <p className="cmc-chat-error">{errorMessage}</p> : null}
          </div>

          <form className="cmc-chat-composer" onSubmit={(event) => sendMessage(event)}>
            <textarea
              aria-label={t("Nhập tin nhắn")}
              placeholder={t("Hỏi về thực đơn, gợi ý món...")}
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              onKeyDown={handleComposerKeyDown}
            />
            <div className="cmc-chat-composer-actions">
              <button className="cmc-chat-button primary" disabled={isAssistantThinking} type="submit">
                {t("Gửi")}
              </button>
            </div>
          </form>
        </section>

      </div>
    </div>
  );
}
