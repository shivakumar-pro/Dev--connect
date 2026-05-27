package com.devconnect.interview.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class CodeSnapshot {
    private String code;
    private String language;
    private String editedBy;
    private Instant updatedAt;
}
