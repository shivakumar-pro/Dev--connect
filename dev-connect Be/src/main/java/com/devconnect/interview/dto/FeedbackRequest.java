package com.devconnect.interview.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class FeedbackRequest {
    private String roomId;
    private String toUsername;          // user being rated
    private String verdict;             // STRONG_HIRE, HIRE, NO_HIRE, STRONG_NO_HIRE
    private Integer overallRating;      // 1-5
    private Map<String, Integer> skillRatings;
    private String strengths;
    private String improvements;
    private String detailedNotes;
    private List<String> tags;
}
