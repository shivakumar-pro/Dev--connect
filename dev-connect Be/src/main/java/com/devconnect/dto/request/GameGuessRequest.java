package com.devconnect.dto.request;

import lombok.Data;

@Data
public class GameGuessRequest {
    private String roomId;
    private int guess;
}
