package com.devconnect.phase10.dto;

import lombok.Data;

@Data
public class CreatePhase10RoomRequest {
    private Integer maxPlayers;       // 2-6, default 4
    private Integer turnTimerSeconds; // default 45
    private Boolean botsEnabled;      // default false
}
