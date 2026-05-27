package com.devconnect.service;

import com.devconnect.exception.ResourceNotFoundException;
import com.devconnect.exception.ValidationException;
import com.devconnect.model.ChatRequest;
import com.devconnect.model.User;
import com.devconnect.repository.ChatRequestRepository;
import com.devconnect.repository.UserBlockRepository;
import com.devconnect.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Chat Request Service — manages the DM request/approval flow.
 *
 * Before two users can exchange private messages, the flow is:
 *   1. Sender calls sendChatRequest(sender, receiver, message)
 *   2. Receiver is notified via WebSocket (CHAT_REQUEST_RECEIVED)
 *   3. Receiver accepts or rejects the request
 *   4. If accepted, sender is notified (CHAT_REQUEST_ACCEPTED) and messaging is unlocked
 *
 * Rejected requests can be re-sent. Blocked users cannot send requests.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatRequestService {

    private final ChatRequestRepository chatRequestRepository;
    private final UserRepository userRepository;
    private final UserBlockRepository blockRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public ChatRequest sendChatRequest(String senderUsername, String receiverUsername, String firstMessage) {
        if (senderUsername.equals(receiverUsername)) {
            throw new ValidationException("Cannot send chat request to yourself");
        }

        User sender = userRepository.findByUsername(senderUsername)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        User receiver = userRepository.findByUsername(receiverUsername)
                .orElseThrow(() -> new ResourceNotFoundException("Recipient not found: " + receiverUsername));

        // Check block
        if (blockRepository.existsBlockBetweenUsernames(senderUsername, receiverUsername)) {
            throw new ValidationException("Cannot send request. User is blocked.");
        }

        // Check if already exists
        Optional<ChatRequest> existing = chatRequestRepository.findBetweenUsernames(senderUsername, receiverUsername);
        if (existing.isPresent()) {
            ChatRequest cr = existing.get();
            if (cr.getStatus() == ChatRequest.Status.ACCEPTED) {
                throw new ValidationException("Chat already accepted. You can message directly.");
            }
            if (cr.getStatus() == ChatRequest.Status.PENDING) {
                throw new ValidationException("Chat request already pending.");
            }
            if (cr.getStatus() == ChatRequest.Status.REJECTED) {
                cr.setStatus(ChatRequest.Status.PENDING);
                cr.setSender(sender);
                cr.setReceiver(receiver);
                cr.setFirstMessage(firstMessage);
                ChatRequest saved = chatRequestRepository.save(cr);
                notifyReceiver(receiver, sender, firstMessage);
                return saved;
            }
        }

        ChatRequest request = new ChatRequest(sender, receiver, firstMessage);
        ChatRequest saved = chatRequestRepository.save(request);

        notifyReceiver(receiver, sender, firstMessage);

        return saved;
    }

    public ChatRequest acceptRequest(String receiverUsername, Long requestId) {
        ChatRequest request = chatRequestRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("Chat request not found"));

        if (!request.getReceiver().getUsername().equals(receiverUsername)) {
            throw new ValidationException("You can only accept requests sent to you");
        }

        if (request.getStatus() != ChatRequest.Status.PENDING) {
            throw new ValidationException("Request is not pending");
        }

        request.setStatus(ChatRequest.Status.ACCEPTED);
        ChatRequest saved = chatRequestRepository.save(request);

        // Notify the sender that their request was accepted
        messagingTemplate.convertAndSend(
                "/topic/user/" + request.getSender().getId(),
                Map.of(
                        "type", "CHAT_REQUEST_ACCEPTED",
                        "fromUsername", receiverUsername,
                        "message", receiverUsername + " accepted your chat request"
                )
        );

        return saved;
    }

    public ChatRequest rejectRequest(String receiverUsername, Long requestId) {
        ChatRequest request = chatRequestRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("Chat request not found"));

        if (!request.getReceiver().getUsername().equals(receiverUsername)) {
            throw new ValidationException("You can only reject requests sent to you");
        }

        if (request.getStatus() != ChatRequest.Status.PENDING) {
            throw new ValidationException("Request is not pending");
        }

        request.setStatus(ChatRequest.Status.REJECTED);
        return chatRequestRepository.save(request);
    }

    public List<ChatRequest> getPendingRequests(String username) {
        return chatRequestRepository.findByReceiverUsernameAndStatus(username, ChatRequest.Status.PENDING);
    }

    public List<ChatRequest> getSentRequests(String username) {
        return chatRequestRepository.findBySenderUsernameAndStatus(username, ChatRequest.Status.PENDING);
    }

    public boolean canChat(String username1, String username2) {
        if (blockRepository.existsBlockBetweenUsernames(username1, username2)) {
            return false;
        }
        Optional<ChatRequest> request = chatRequestRepository.findAcceptedBetweenUsernames(username1, username2);
        return request.isPresent();
    }

    public String getChatStatus(String myUsername, String otherUsername) {
        if (blockRepository.existsBlockBetweenUsernames(myUsername, otherUsername)) {
            return "BLOCKED";
        }

        Optional<ChatRequest> request = chatRequestRepository.findBetweenUsernames(myUsername, otherUsername);
        if (request.isEmpty()) {
            return "NONE";
        }

        ChatRequest cr = request.get();
        if (cr.getStatus() == ChatRequest.Status.ACCEPTED) {
            return "ACCEPTED";
        }
        if (cr.getStatus() == ChatRequest.Status.PENDING) {
            if (cr.getSender().getUsername().equals(myUsername)) {
                return "PENDING_SENT";
            } else {
                return "PENDING_RECEIVED";
            }
        }
        return "REJECTED";
    }

    private void notifyReceiver(User receiver, User sender, String firstMessage) {
        messagingTemplate.convertAndSend(
                "/topic/user/" + receiver.getId(),
                Map.of(
                        "type", "CHAT_REQUEST_RECEIVED",
                        "fromUsername", sender.getUsername(),
                        "fromAvatar", sender.getProfileAvatar() != null ? sender.getProfileAvatar() : "avatar_default",
                        "message", firstMessage != null ? firstMessage : sender.getUsername() + " wants to chat with you"
                )
        );
    }
}
