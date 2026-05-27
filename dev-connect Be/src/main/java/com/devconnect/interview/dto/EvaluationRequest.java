package com.devconnect.interview.dto;

import lombok.Data;

@Data
public class EvaluationRequest {
    private String roomId;
    private String questionId;
    private String verdict;        // SOLVED, PARTIAL, NOT_SOLVED
    private Integer score;         // 0-10 for this question
    private String comments;
}
