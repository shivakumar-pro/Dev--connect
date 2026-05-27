package com.devconnect.dto.request;

import lombok.Data;

@Data
public class SendMessageRequest {
    private String roomId;
    private String roomType; // GLOBAL, PRIVATE, GROUP
    private String content;
    private String messageType; // TEXT, CODE
}
