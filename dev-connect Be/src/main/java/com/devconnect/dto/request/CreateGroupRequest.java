package com.devconnect.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

@Data
public class CreateGroupRequest {

    @NotBlank(message = "Group name is required")
    private String name;

    private String description;

    // Initial members by username (excluding creator)
    private List<String> memberUsernames;

    // Kept for backward compat — prefer memberUsernames
    private List<Long> memberIds;
}
