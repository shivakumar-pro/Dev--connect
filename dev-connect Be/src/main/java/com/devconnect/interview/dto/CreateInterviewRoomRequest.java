package com.devconnect.interview.dto;

import lombok.Data;

@Data
public class CreateInterviewRoomRequest {
    private String title;
    private String type;          // InterviewType enum name
    private String level;         // InterviewLevel enum name
    private Integer durationMinutes;
    private Integer maxParticipants;
    private Boolean isPublic;
    private String accessCode;    // optional for private rooms
    private String role;          // host's role: INTERVIEWER (default) or CANDIDATE
    private Boolean recordingEnabled;
}
