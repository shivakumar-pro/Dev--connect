package com.devconnect.bottle.dto;

import lombok.Data;

@Data
public class CreateBottleRoomRequest {
    private String hostUsername;
    private Integer maxPlayers;
    /** Number of bottles to shuffle — 5, 7, or 10. Defaults to 5. */
    private Integer bottleCount;
}
