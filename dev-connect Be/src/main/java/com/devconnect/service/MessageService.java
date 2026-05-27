package com.devconnect.service;

import com.devconnect.dto.request.SendMessageRequest;
import com.devconnect.dto.response.MessageResponse;
import com.devconnect.exception.ResourceNotFoundException;
import com.devconnect.exception.ValidationException;
import com.devconnect.model.ChatRequest;
import com.devconnect.model.Message;
import com.devconnect.model.User;
import com.devconnect.model.UserDeletedMessage;
import com.devconnect.model.UserReadStatus;
import com.devconnect.repository.ChatRequestRepository;
import com.devconnect.repository.MessageRepository;
import com.devconnect.repository.UserBlockRepository;
import com.devconnect.repository.UserDeletedMessageRepository;
import com.devconnect.repository.UserReadStatusRepository;
import com.devconnect.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import com.devconnect.model.GroupMember;
import com.devconnect.repository.GroupMemberRepository;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Message Service — core logic for sending, fetching, and managing chat messages.
 *
 * How messaging works:
 *   1. Messages are sent via WebSocket (STOMP) through ChatWebSocketController
 *   2. This service saves to DB, broadcasts to subscribers, and sends notifications
 *   3. Private messages require an ACCEPTED ChatRequest between users
 *   4. Blocked users cannot send messages to each other
 *
 * Room ID format:
 *   - "global"        — global chat room (everyone)
 *   - "1-3"           — private chat between userId 1 and userId 3 (smaller ID first)
 *   - "group-5"       — group chat for group ID 5
 *
 * WebSocket topics:
 *   - /topic/global           — global messages
 *   - /topic/user/{userId}    — private messages + notifications for a specific user
 *   - /topic/group/{groupId}  — group messages
 *
 * Read status & unread:
 *   - user_read_status table tracks last_read_at per user per room
 *   - Unread count = messages after last_read_at that aren't sent by me
 *
 * Clear/delete:
 *   - "Clear for me" sets cleared_at timestamp — messages before it are hidden
 *   - "Clear for everyone" permanently deletes from DB
 *   - "Delete for everyone" sets is_deleted=true on the message
 *   - "Delete for me" adds entry to user_deleted_messages table
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MessageService {

    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final UserBlockRepository blockRepository;
    private final ChatRequestRepository chatRequestRepository;
    private final UserDeletedMessageRepository deletedMessageRepository;
    private final UserReadStatusRepository readStatusRepository;
    private final SimpMessagingTemplate messagingTemplate;

    /** Save a global message to DB and broadcast to /topic/global. */
    public MessageResponse saveAndBroadcastGlobalMessage(String senderUsername, SendMessageRequest request) {
        log.info("Global message from '{}'", senderUsername);
        User sender = userRepository.findByUsername(senderUsername)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Message message = new Message();
        message.setRoomId("global");
        message.setRoomType(Message.RoomType.GLOBAL);
        message.setSender(sender);
        message.setContent(request.getContent());
        message.setMessageType(Message.MessageType.TEXT);

        Message savedMessage = messageRepository.save(message);
        MessageResponse response = mapToResponse(savedMessage, sender.getUsername());

        // Broadcast
        messagingTemplate.convertAndSend("/topic/global", response);

        // Notification: send to all users (global has no fixed recipient list,
        // frontend handles it via the /topic/global subscription)

        return response;
    }

    /** Save a private message and broadcast to both users. Checks block + chat request approval. */
    public MessageResponse saveAndBroadcastPrivateMessage(String senderUsername, Long recipientId, SendMessageRequest request) {
        log.info("Private message from '{}' to userId={}", senderUsername, recipientId);
        User sender = userRepository.findByUsername(senderUsername)
                .orElseThrow(() -> new ResourceNotFoundException("Sender not found"));
        User recipient = userRepository.findById(recipientId)
                .orElseThrow(() -> new ResourceNotFoundException("Recipient not found"));

        Long senderId = sender.getId();

        // Block check
        if (blockRepository.existsBlockBetween(senderId, recipientId)) {
            throw new ValidationException("Cannot send message. User is blocked.");
        }

        // Chat request check — must be ACCEPTED before messaging
        validateChatApproved(senderId, recipientId);

        // Determine room ID (smallerId-largerId)
        String roomId = senderId < recipientId ?
                senderId + "-" + recipientId : recipientId + "-" + senderId;

        Message message = new Message();
        message.setRoomId(roomId);
        message.setRoomType(Message.RoomType.PRIVATE);
        message.setSender(sender);
        message.setContent(request.getContent());
        message.setMessageType(Message.MessageType.TEXT);

        Message savedMessage = messageRepository.save(message);
        MessageResponse response = mapToResponse(savedMessage, sender.getUsername());

        // Broadcast to both users
        messagingTemplate.convertAndSend("/topic/user/" + senderId, response);
        messagingTemplate.convertAndSend("/topic/user/" + recipientId, response);

        // Notification
        sendNewMessageNotification(savedMessage, sender.getUsername(), List.of(recipientId));

        return response;
    }

    public MessageResponse saveAndBroadcastPrivateMessage(String senderUsername, SendMessageRequest request) {
        User sender = userRepository.findByUsername(senderUsername)
                .orElseThrow(() -> new ResourceNotFoundException("Sender not found"));

        // Private chat roomId expected "1-2"
        String[] ids = request.getRoomId().split("-");
        Long id1 = Long.parseLong(ids[0]);
        Long id2 = Long.parseLong(ids[1]);
        Long recipientId = id1.equals(sender.getId()) ? id2 : id1;

        User recipient = userRepository.findById(recipientId)
                .orElseThrow(() -> new ResourceNotFoundException("Recipient not found"));

        Long senderId = sender.getId();

        // Block check
        if (blockRepository.existsBlockBetween(senderId, recipientId)) {
            throw new ValidationException("Cannot send message. User is blocked.");
        }

        // Chat request check
        validateChatApproved(senderId, recipientId);

        String roomId = senderId < recipientId ?
                senderId + "-" + recipientId : recipientId + "-" + senderId;

        Message message = new Message();
        message.setRoomId(roomId);
        message.setRoomType(Message.RoomType.PRIVATE);
        message.setSender(sender);
        message.setContent(request.getContent());
        message.setMessageType(Message.MessageType.TEXT);

        Message savedMessage = messageRepository.save(message);
        MessageResponse response = mapToResponse(savedMessage, sender.getUsername());

        messagingTemplate.convertAndSend("/topic/user/" + senderId, response);
        messagingTemplate.convertAndSend("/topic/user/" + recipientId, response);

        // Notification
        sendNewMessageNotification(savedMessage, sender.getUsername(), List.of(recipientId));

        return response;
    }

    /** Save a group message and broadcast to /topic/group/{groupId}. Sends notification to all members. */
    public MessageResponse saveAndBroadcastGroupMessage(String senderUsername, Long groupId, SendMessageRequest request) {
        log.info("Group message from '{}' to group={}", senderUsername, groupId);
        User sender = userRepository.findByUsername(senderUsername)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        String roomId = "group-" + groupId;

        Message message = new Message();
        message.setRoomId(roomId);
        message.setRoomType(Message.RoomType.GROUP);
        message.setSender(sender);
        message.setContent(request.getContent());
        message.setMessageType(Message.MessageType.TEXT);

        Message savedMessage = messageRepository.save(message);
        MessageResponse response = mapToResponse(savedMessage, sender.getUsername());

        // Broadcast to group members
        messagingTemplate.convertAndSend("/topic/group/" + groupId, response);

        // Notification to all group members
        List<Long> memberIds = groupMemberRepository.findByGroupId(groupId).stream()
                .map(gm -> gm.getUser().getId())
                .collect(Collectors.toList());
        sendNewMessageNotification(savedMessage, sender.getUsername(), memberIds);

        return response;
    }

    public List<MessageResponse> getMessages(String roomId, String currentUsername, int limit) {
        User user = userRepository.findByUsername(currentUsername)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        // Check if user has cleared this chat
        Optional<UserReadStatus> readStatus = readStatusRepository.findByUserIdAndRoomId(user.getId(), roomId);
        List<Message> messages;
        if (readStatus.isPresent() && readStatus.get().getClearedAt() != null) {
            messages = messageRepository.findByRoomIdAfterTimestamp(roomId, readStatus.get().getClearedAt(), PageRequest.of(0, limit));
        } else {
            messages = messageRepository.findByRoomIdOrderByCreatedAtDesc(roomId, PageRequest.of(0, limit));
        }

        // Filter out deleted-for-me and deleted-for-everyone
        Set<Long> myDeletedIds = deletedMessageRepository.findDeletedMessageIdsByUserId(user.getId());
        return messages.stream()
                .filter(msg -> !Boolean.TRUE.equals(msg.getIsDeleted()))
                .filter(msg -> !myDeletedIds.contains(msg.getId()))
                .map(msg -> mapToResponse(msg, currentUsername))
                .collect(Collectors.toList());
    }

    public List<MessageResponse> getPrivateMessages(String currentUsername, Long otherUserId, int limit) {
        User currentUser = userRepository.findByUsername(currentUsername)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        Long currentUserId = currentUser.getId();
        String roomId = currentUserId < otherUserId ?
                currentUserId + "-" + otherUserId : otherUserId + "-" + currentUserId;

        Optional<UserReadStatus> readStatus = readStatusRepository.findByUserIdAndRoomId(currentUserId, roomId);
        List<Message> messages;
        if (readStatus.isPresent() && readStatus.get().getClearedAt() != null) {
            messages = messageRepository.findByRoomIdAfterTimestamp(roomId, readStatus.get().getClearedAt(), PageRequest.of(0, limit));
        } else {
            messages = messageRepository.findByRoomIdOrderByCreatedAtDesc(roomId, PageRequest.of(0, limit));
        }

        Set<Long> myDeletedIds = deletedMessageRepository.findDeletedMessageIdsByUserId(currentUserId);
        return messages.stream()
                .filter(msg -> !Boolean.TRUE.equals(msg.getIsDeleted()))
                .filter(msg -> !myDeletedIds.contains(msg.getId()))
                .map(msg -> mapToResponse(msg, currentUsername))
                .collect(Collectors.toList());
    }

    public List<MessageResponse> getAllUserMessages(String currentUsername, int limit) {
        User currentUser = userRepository.findByUsername(currentUsername)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Long userId = currentUser.getId();
        String userIdStr = String.valueOf(userId);

        // Get all group roomIds the user belongs to
        List<String> groupRoomIds = groupMemberRepository.findByUserId(userId).stream()
                .map(gm -> "group-" + gm.getGroup().getId())
                .collect(Collectors.toList());

        if (groupRoomIds.isEmpty()) {
            groupRoomIds = List.of("__none__");
        }

        List<Message> messages = messageRepository.findAllUserMessages(
                userId, userIdStr, groupRoomIds, PageRequest.of(0, limit));

        return messages.stream()
                .map(msg -> mapToResponse(msg, currentUsername))
                .collect(Collectors.toList());
    }

    // ==================== READ STATUS / UNREAD ====================

    public void markAsRead(String username, String roomId) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Optional<UserReadStatus> existing = readStatusRepository.findByUserIdAndRoomId(user.getId(), roomId);
        if (existing.isPresent()) {
            existing.get().setLastReadAt(LocalDateTime.now());
            readStatusRepository.save(existing.get());
        } else {
            readStatusRepository.save(new UserReadStatus(user.getId(), roomId, LocalDateTime.now()));
        }
    }

    public Map<String, Long> getUnreadCounts(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        Long userId = user.getId();

        // Gather all roomIds the user belongs to
        List<String> roomIds = new ArrayList<>();

        // Global
        roomIds.add("global");

        // Private chats
        String userIdStr = String.valueOf(userId);
        List<Message> privateMessages = messageRepository.findPrivateMessagesByUserId(userIdStr);
        Set<String> privateRoomIds = privateMessages.stream()
                .map(Message::getRoomId)
                .collect(Collectors.toSet());
        roomIds.addAll(privateRoomIds);

        // Groups
        List<String> groupRoomIds = groupMemberRepository.findByUserId(userId).stream()
                .map(gm -> "group-" + gm.getGroup().getId())
                .collect(Collectors.toList());
        roomIds.addAll(groupRoomIds);

        if (roomIds.isEmpty()) return Map.of();

        // Get last-read timestamps
        Map<String, LocalDateTime> lastReadMap = new HashMap<>();
        for (UserReadStatus rs : readStatusRepository.findByUserId(userId)) {
            lastReadMap.put(rs.getRoomId(), rs.getLastReadAt());
        }

        // Count unread per room
        Map<String, Long> result = new LinkedHashMap<>();
        for (String roomId : roomIds) {
            LocalDateTime since = lastReadMap.getOrDefault(roomId, LocalDateTime.of(1970, 1, 1, 0, 0));
            long count = messageRepository.countUnreadInRoom(roomId, since, userId);
            if (count > 0) {
                result.put(roomId, count);
            }
        }

        return result;
    }

    public long getUnreadCount(String username, String roomId) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        LocalDateTime since = readStatusRepository.findByUserIdAndRoomId(user.getId(), roomId)
                .map(UserReadStatus::getLastReadAt)
                .orElse(LocalDateTime.of(1970, 1, 1, 0, 0));

        return messageRepository.countUnreadInRoom(roomId, since, user.getId());
    }

    // ==================== CLEAR CHAT / DELETE MESSAGE ====================

    /**
     * Clear chat for me — hides all messages before now. Other user still sees them.
     */
    public void clearChatForMe(String username, String roomId) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Optional<UserReadStatus> existing = readStatusRepository.findByUserIdAndRoomId(user.getId(), roomId);
        UserReadStatus status;
        if (existing.isPresent()) {
            status = existing.get();
        } else {
            status = new UserReadStatus(user.getId(), roomId, LocalDateTime.now());
        }
        status.setClearedAt(LocalDateTime.now());
        status.setLastReadAt(LocalDateTime.now());
        readStatusRepository.save(status);
    }

    /**
     * Clear chat for everyone — permanently deletes all messages in the room.
     * Only works for private chats (sender must be part of the room).
     */
    @org.springframework.transaction.annotation.Transactional
    public void clearChatForEveryone(String username, String roomId) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        // Verify user is part of this room
        String userIdStr = String.valueOf(user.getId());
        if (!roomId.equals("global") && !roomId.startsWith("group-")) {
            // Private room — check user is one of the IDs
            String[] ids = roomId.split("-");
            if (!ids[0].equals(userIdStr) && !ids[1].equals(userIdStr)) {
                throw new ValidationException("You are not part of this chat");
            }
        }

        messageRepository.deleteByRoomId(roomId);

        // Broadcast deletion event
        messagingTemplate.convertAndSend("/topic/user/" + user.getId(),
                Map.of("type", "CHAT_CLEARED", "roomId", roomId, "clearedBy", username));

        // Notify other user in private chat
        if (!roomId.equals("global") && !roomId.startsWith("group-")) {
            String[] ids = roomId.split("-");
            Long otherId = Long.parseLong(ids[0].equals(userIdStr) ? ids[1] : ids[0]);
            messagingTemplate.convertAndSend("/topic/user/" + otherId,
                    Map.of("type", "CHAT_CLEARED", "roomId", roomId, "clearedBy", username));
        }
    }

    /**
     * Delete a single message for everyone — marks as deleted, broadcasts event.
     * Only the sender can delete their own message for everyone.
     */
    public void deleteMessageForEveryone(String username, Long messageId) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new ResourceNotFoundException("Message not found"));

        if (!message.getSender().getId().equals(user.getId())) {
            throw new ValidationException("You can only delete your own messages for everyone");
        }

        if (Boolean.TRUE.equals(message.getIsDeleted())) {
            throw new ValidationException("Message is already deleted");
        }

        message.setIsDeleted(true);
        message.setContent("This message was deleted");
        messageRepository.save(message);

        // Broadcast to room
        Map<String, Object> event = Map.of(
                "type", "MESSAGE_DELETED",
                "messageId", messageId,
                "roomId", message.getRoomId(),
                "deletedBy", username
        );

        String roomId = message.getRoomId();
        if (roomId.equals("global")) {
            messagingTemplate.convertAndSend("/topic/global", event);
        } else if (roomId.startsWith("group-")) {
            Long groupId = Long.parseLong(roomId.replace("group-", ""));
            messagingTemplate.convertAndSend("/topic/group/" + groupId, event);
        } else {
            // Private
            String[] ids = roomId.split("-");
            messagingTemplate.convertAndSend("/topic/user/" + ids[0], event);
            messagingTemplate.convertAndSend("/topic/user/" + ids[1], event);
        }
    }

    /**
     * Delete a single message for me only — hidden from my view, other user still sees it.
     */
    public void deleteMessageForMe(String username, Long messageId) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (!messageRepository.existsById(messageId)) {
            throw new ResourceNotFoundException("Message not found");
        }

        if (deletedMessageRepository.existsByUserIdAndMessageId(user.getId(), messageId)) {
            throw new ValidationException("Message already deleted for you");
        }

        deletedMessageRepository.save(new UserDeletedMessage(user.getId(), messageId));
    }

    // ==================== NOTIFICATION HELPER ====================

    private void sendNewMessageNotification(Message message, String senderUsername, List<Long> recipientUserIds) {
        String preview = message.getContent();
        if (preview.length() > 100) preview = preview.substring(0, 100) + "...";

        Map<String, Object> notification = Map.of(
                "type", "NEW_MESSAGE_NOTIFICATION",
                "roomId", message.getRoomId(),
                "roomType", message.getRoomType().name(),
                "senderId", message.getSender().getId(),
                "senderName", senderUsername,
                "preview", preview,
                "timestamp", message.getCreatedAt().toString()
        );

        for (Long recipientId : recipientUserIds) {
            if (!recipientId.equals(message.getSender().getId())) {
                messagingTemplate.convertAndSend("/topic/user/" + recipientId, notification);
            }
        }
    }

    private void validateChatApproved(Long senderId, Long recipientId) {
        Optional<ChatRequest> chatRequest = chatRequestRepository.findAcceptedBetweenUsers(senderId, recipientId);
        if (chatRequest.isEmpty()) {
            throw new ValidationException("Chat not approved. Send a chat request first using POST /api/chat-requests/send/{username}");
        }
    }

    private MessageResponse mapToResponse(Message message, String requestUsername) {
        return MessageResponse.builder()
                .id(message.getId())
                .roomId(message.getRoomId())
                .roomType(message.getRoomType().name())
                .senderId(message.getSender().getId())
                .senderName(message.getSender().getUsername())
                .content(message.getContent())
                .messageType(message.getMessageType().name())
                .createdAt(message.getCreatedAt())
                .isOwn(message.getSender().getUsername().equals(requestUsername))
                .build();
    }
}
