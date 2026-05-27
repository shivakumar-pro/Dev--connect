package com.devconnect.dto.request;

import lombok.Data;

@Data
public class GameCreateRoomRequest {
    private String difficulty; // EASY, MEDIUM, HARD (defaults to MEDIUM if null)
}
