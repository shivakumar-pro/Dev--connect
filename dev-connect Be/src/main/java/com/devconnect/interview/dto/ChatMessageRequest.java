package com.devconnect.interview.dto;

import lombok.Data;

@Data
public class ChatMessageRequest {
    private String roomId;
    private String message;
    private Boolean privateNote; // true = interviewer-only note
    private String questionId;   // optional, for note tagging
}
