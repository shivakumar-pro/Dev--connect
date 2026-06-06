package com.devconnect.chowka.dto;

import lombok.Data;

@Data
public class JoinChowkaRoomRequest {
    private String username;
    private String botName;   // remove-bot
}
