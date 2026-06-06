package com.devconnect.toxic.dto;

import lombok.Data;

@Data
public class CreateToxicBiteRoomRequest {
    private String hostUsername;
    private Integer rounds;       // 1, 3, or 5; defaults to 3
    private Integer maxPlayers;   // defaults to 2
}
