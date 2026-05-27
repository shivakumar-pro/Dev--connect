package com.devconnect.interview.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class Question {
    private String id;
    private InterviewType type;
    private InterviewLevel level;
    private String title;
    private String description;
    private List<String> examples;
    private List<String> hints;
    private List<String> tags;
    private String starterCode;
    private String language;
    private String expectedAnswer;
    private int recommendedTimeMinutes;
}
