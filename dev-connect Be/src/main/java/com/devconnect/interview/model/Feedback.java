package com.devconnect.interview.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class Feedback {
    private String id;
    private String roomId;
    private String fromUsername;
    private String toUsername;

    // Overall verdict
    private String verdict; // STRONG_HIRE, HIRE, NO_HIRE, STRONG_NO_HIRE
    private int overallRating; // 1-5

    // Skill ratings (1-5)
    private Map<String, Integer> skillRatings;
    // e.g., problemSolving, codeQuality, communication, dataStructures,
    // algorithms, systemDesign, debugging, behavioral

    private String strengths;
    private String improvements;
    private String detailedNotes;
    private List<String> tags;

    private Instant submittedAt;
}
