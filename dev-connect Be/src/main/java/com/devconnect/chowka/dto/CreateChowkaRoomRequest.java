package com.devconnect.chowka.dto;

import lombok.Data;

@Data
public class CreateChowkaRoomRequest {
    private String hostUsername;
    private Integer maxPlayers;   // 2..4
    private Boolean openStart;    // true = all pieces start on the board
}
