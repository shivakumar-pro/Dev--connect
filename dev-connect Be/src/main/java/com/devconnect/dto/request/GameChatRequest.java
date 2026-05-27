package com.devconnect.dto.request;

import lombok.Data;

@Data
public class GameChatRequest {
    private String roomId;
    private String message;
}
