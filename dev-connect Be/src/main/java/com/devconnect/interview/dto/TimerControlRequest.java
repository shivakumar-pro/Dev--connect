package com.devconnect.interview.dto;

import lombok.Data;

@Data
public class TimerControlRequest {
    private String roomId;
    // action: START, PAUSE, RESUME, RESET, ADD_TIME, SET
    private String action;
    private Integer seconds; // for ADD_TIME, SET
}
