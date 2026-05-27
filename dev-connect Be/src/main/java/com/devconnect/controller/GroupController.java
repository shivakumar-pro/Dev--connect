package com.devconnect.controller;

import com.devconnect.dto.request.CreateGroupRequest;
import com.devconnect.dto.request.UpdateGroupRequest;
import com.devconnect.dto.response.ApiResponse;
import com.devconnect.dto.response.GroupResponse;
import com.devconnect.service.GroupService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Group Controller — full CRUD for group chats with admin/member roles.
 *
 * Roles:
 *   ADMIN   — can add/remove members, update/delete group, promote/demote
 *   MEMBER  — can view, send messages, leave
 *   Creator — the original admin. Only creator can demote other admins.
 *
 * Endpoints:
 *   POST   /api/groups                        — create group with initial members
 *   GET    /api/groups/my-groups              — list groups I belong to
 *   GET    /api/groups/{groupId}              — group details with members list
 *   GET    /api/groups/{groupId}/members      — members list only
 *   PUT    /api/groups/{groupId}              — update name/description (admin only)
 *   DELETE /api/groups/{groupId}              — delete group (admin only)
 *   POST   /api/groups/{groupId}/members/{username} — add member by username (admin only)
 *   POST   /api/groups/{groupId}/members      — add member by username or userId in body (admin only)
 *   DELETE /api/groups/{groupId}/members/{username} — remove member (admin only)
 *   POST   /api/groups/{groupId}/leave        — leave group (ownership transfers if creator)
 *   POST   /api/groups/{groupId}/promote/{username} — promote to admin
 *   POST   /api/groups/{groupId}/demote/{username}  — demote from admin (creator only)
 */
@Slf4j
@RestController
@RequestMapping("/api/groups")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class GroupController {

    private final GroupService groupService;

    // ==================== CREATE ====================

    @PostMapping
    public ResponseEntity<ApiResponse<GroupResponse>> createGroup(
            @AuthenticationPrincipal String currentUsername,
            @Valid @RequestBody CreateGroupRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                "Group created",
                groupService.createGroup(currentUsername, request)
        ));
    }

    // ==================== READ ====================

    @GetMapping("/my-groups")
    public ResponseEntity<ApiResponse<List<GroupResponse>>> getMyGroups(
            @AuthenticationPrincipal String currentUsername) {
        return ResponseEntity.ok(ApiResponse.success(
                "Groups fetched",
                groupService.getMyGroups(currentUsername)
        ));
    }

    @GetMapping("/{groupId}")
    public ResponseEntity<ApiResponse<GroupResponse>> getGroupDetails(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long groupId) {
        return ResponseEntity.ok(ApiResponse.success(
                "Group details",
                groupService.getGroupDetails(groupId, currentUsername)
        ));
    }

    @GetMapping("/{groupId}/members")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getMembers(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long groupId) {
        return ResponseEntity.ok(ApiResponse.success(
                "Group members",
                groupService.getMembers(groupId, currentUsername)
        ));
    }

    // ==================== UPDATE GROUP ====================

    @PutMapping("/{groupId}")
    public ResponseEntity<ApiResponse<GroupResponse>> updateGroup(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long groupId,
            @RequestBody UpdateGroupRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                "Group updated",
                groupService.updateGroup(groupId, currentUsername, request)
        ));
    }

    // ==================== DELETE GROUP ====================

    @DeleteMapping("/{groupId}")
    public ResponseEntity<ApiResponse<Void>> deleteGroup(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long groupId) {
        groupService.deleteGroup(groupId, currentUsername);
        return ResponseEntity.ok(ApiResponse.success("Group deleted", null));
    }

    // ==================== ADD MEMBER (by username) ====================

    @PostMapping("/{groupId}/members/{username}")
    public ResponseEntity<ApiResponse<Void>> addMemberByUsername(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long groupId,
            @PathVariable String username) {
        groupService.addMemberByUsername(groupId, currentUsername, username);
        return ResponseEntity.ok(ApiResponse.success("Member added", null));
    }

    // Backward compat: add by userId in body
    @PostMapping("/{groupId}/members")
    public ResponseEntity<ApiResponse<Void>> addMember(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long groupId,
            @RequestBody Map<String, Object> body) {
        if (body.containsKey("username")) {
            groupService.addMemberByUsername(groupId, currentUsername, (String) body.get("username"));
        } else if (body.containsKey("userId")) {
            groupService.addMember(groupId, currentUsername, Long.valueOf(body.get("userId").toString()));
        } else {
            return ResponseEntity.badRequest().body(ApiResponse.error("Provide 'username' or 'userId'"));
        }
        return ResponseEntity.ok(ApiResponse.success("Member added", null));
    }

    // ==================== REMOVE MEMBER ====================

    @DeleteMapping("/{groupId}/members/{username}")
    public ResponseEntity<ApiResponse<Void>> removeMember(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long groupId,
            @PathVariable String username) {
        groupService.removeMember(groupId, currentUsername, username);
        return ResponseEntity.ok(ApiResponse.success("Member removed", null));
    }

    // ==================== LEAVE GROUP ====================

    @PostMapping("/{groupId}/leave")
    public ResponseEntity<ApiResponse<Void>> leaveGroup(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long groupId) {
        groupService.leaveGroup(groupId, currentUsername);
        return ResponseEntity.ok(ApiResponse.success("Left group", null));
    }

    // ==================== PROMOTE / DEMOTE ====================

    @PostMapping("/{groupId}/promote/{username}")
    public ResponseEntity<ApiResponse<Void>> promoteToAdmin(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long groupId,
            @PathVariable String username) {
        groupService.promoteToAdmin(groupId, currentUsername, username);
        return ResponseEntity.ok(ApiResponse.success("User promoted to admin", null));
    }

    @PostMapping("/{groupId}/demote/{username}")
    public ResponseEntity<ApiResponse<Void>> demoteFromAdmin(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long groupId,
            @PathVariable String username) {
        groupService.demoteFromAdmin(groupId, currentUsername, username);
        return ResponseEntity.ok(ApiResponse.success("User demoted to member", null));
    }
}
