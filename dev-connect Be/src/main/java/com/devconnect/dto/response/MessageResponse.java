package com.devconnect.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class MessageResponse {
    private Long id;
    private String roomId;
    private String roomType;
    private Long senderId;
    private String senderName;
    private String content;
    private String messageType;
    private LocalDateTime createdAt;
    private boolean isOwn;
}
