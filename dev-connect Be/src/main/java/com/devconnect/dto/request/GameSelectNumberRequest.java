package com.devconnect.dto.request;

import lombok.Data;

@Data
public class GameSelectNumberRequest {
    private String roomId;
    private int secretNumber;
}
