package com.devconnect.interview.dto;

import lombok.Data;

import java.util.Map;

@Data
public class WhiteboardUpdateRequest {
    private String roomId;
    // Free-form op payload — client decides shape. Server stores and broadcasts.
    // op = "stroke" | "shape" | "text" | "erase" | "clear"
    private String op;
    private Map<String, Object> data;
}
