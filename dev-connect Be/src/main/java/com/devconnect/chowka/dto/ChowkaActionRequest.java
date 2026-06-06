package com.devconnect.chowka.dto;

import lombok.Data;

/** Payload for WebSocket gameplay actions (move / chat / remove-bot). */
@Data
public class ChowkaActionRequest {
    private String roomId;
    private Integer pieceId;   // move: which piece to move
    private String message;    // chat
    private String botName;    // remove-bot
}
