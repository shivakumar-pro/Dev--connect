package com.devconnect.interview.dto;

import lombok.Data;

@Data
public class QuestionControlRequest {
    private String roomId;
    // action: PUSH_FROM_BANK, PUSH_CUSTOM, REVEAL_HINT, CLEAR
    private String action;

    // For PUSH_FROM_BANK
    private String questionId;

    // For PUSH_CUSTOM
    private String title;
    private String description;
    private String starterCode;
    private String language;
    private Integer recommendedTimeMinutes;

    // For REVEAL_HINT
    private Integer hintIndex;
}
