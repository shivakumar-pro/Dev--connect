package com.devconnect.service;

import com.devconnect.dto.request.CreateGroupRequest;
import com.devconnect.dto.request.UpdateGroupRequest;
import com.devconnect.dto.response.GroupResponse;
import com.devconnect.exception.ResourceNotFoundException;
import com.devconnect.exception.ValidationException;
import com.devconnect.model.Group;
import com.devconnect.model.GroupMember;
import com.devconnect.model.User;
import com.devconnect.repository.GroupMemberRepository;
import com.devconnect.repository.GroupRepository;
import com.devconnect.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Group Service — business logic for group chat management.
 *
 * Group roles:
 *   ADMIN   — can add/remove members, update group, delete group, promote/demote
 *   MEMBER  — can view group, send messages, leave
 *   Creator — the original admin, stored as group.createdBy. Only creator can demote other admins.
 *
 * When the creator leaves:
 *   - Ownership transfers to another admin (or first member if no admins)
 *   - If last person leaves, the group is deleted
 *
 * Group messages use roomId format "group-{groupId}" and are broadcast to /topic/group/{groupId}
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GroupService {

    private final GroupRepository groupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final UserRepository userRepository;

    // ==================== CREATE ====================

    @Transactional
    public GroupResponse createGroup(String creatorUsername, CreateGroupRequest request) {
        User creator = findUser(creatorUsername);

        Group group = new Group();
        group.setName(request.getName());
        group.setDescription(request.getDescription());
        group.setCreatedBy(creator);
        Group savedGroup = groupRepository.save(group);

        // Add creator as ADMIN
        addGroupMember(savedGroup, creator, GroupMember.Role.ADMIN);

        // Add members by username
        if (request.getMemberUsernames() != null) {
            for (String username : request.getMemberUsernames()) {
                if (!username.equals(creatorUsername)) {
                    userRepository.findByUsername(username).ifPresent(
                            member -> addGroupMember(savedGroup, member, GroupMember.Role.MEMBER));
                }
            }
        }

        // Backward compat: add by IDs
        if (request.getMemberIds() != null) {
            for (Long memberId : request.getMemberIds()) {
                if (!memberId.equals(creator.getId())) {
                    userRepository.findById(memberId).ifPresent(
                            member -> {
                                if (!groupMemberRepository.existsByGroupIdAndUserId(savedGroup.getId(), member.getId())) {
                                    addGroupMember(savedGroup, member, GroupMember.Role.MEMBER);
                                }
                            });
                }
            }
        }

        return mapToDetailedResponse(savedGroup, creator.getId());
    }

    // ==================== READ ====================

    public List<GroupResponse> getMyGroups(String username) {
        User user = findUser(username);
        List<GroupMember> memberships = groupMemberRepository.findByUserId(user.getId());
        return memberships.stream()
                .map(m -> mapToSimpleResponse(m.getGroup(), user.getId(), m.getRole().name()))
                .collect(Collectors.toList());
    }

    public GroupResponse getGroupDetails(Long groupId, String username) {
        User user = findUser(username);
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException("Group not found"));

        if (!groupMemberRepository.existsByGroupIdAndUserId(groupId, user.getId())) {
            throw new ValidationException("You are not a member of this group");
        }

        return mapToDetailedResponse(group, user.getId());
    }

    public List<Map<String, Object>> getMembers(Long groupId, String username) {
        User user = findUser(username);
        if (!groupMemberRepository.existsByGroupIdAndUserId(groupId, user.getId())) {
            throw new ValidationException("You are not a member of this group");
        }

        return groupMemberRepository.findByGroupId(groupId).stream()
                .map(this::mapMember)
                .collect(Collectors.toList());
    }

    // ==================== UPDATE GROUP ====================

    @Transactional
    public GroupResponse updateGroup(Long groupId, String username, UpdateGroupRequest request) {
        User user = findUser(username);
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException("Group not found"));

        requireAdmin(groupId, user.getId());

        if (request.getName() != null) group.setName(request.getName());
        if (request.getDescription() != null) group.setDescription(request.getDescription());
        groupRepository.save(group);

        return mapToDetailedResponse(group, user.getId());
    }

    // ==================== DELETE GROUP ====================

    @Transactional
    public void deleteGroup(Long groupId, String username) {
        User user = findUser(username);
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException("Group not found"));

        requireAdmin(groupId, user.getId());

        groupMemberRepository.deleteByGroupId(groupId);
        groupRepository.delete(group);
    }

    // ==================== ADD MEMBER (by username) ====================

    @Transactional
    public void addMemberByUsername(Long groupId, String currentUsername, String newMemberUsername) {
        User currentUser = findUser(currentUsername);
        requireAdmin(groupId, currentUser.getId());

        User newMember = userRepository.findByUsername(newMemberUsername)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + newMemberUsername));

        if (groupMemberRepository.existsByGroupIdAndUserId(groupId, newMember.getId())) {
            throw new ValidationException("User is already a member");
        }

        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException("Group not found"));
        addGroupMember(group, newMember, GroupMember.Role.MEMBER);
    }

    // Backward compat: add by ID
    @Transactional
    public void addMember(Long groupId, String currentUsername, Long newMemberId) {
        User currentUser = findUser(currentUsername);
        requireAdmin(groupId, currentUser.getId());

        User newMember = userRepository.findById(newMemberId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (groupMemberRepository.existsByGroupIdAndUserId(groupId, newMemberId)) {
            throw new ValidationException("User is already a member");
        }

        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException("Group not found"));
        addGroupMember(group, newMember, GroupMember.Role.MEMBER);
    }

    // ==================== REMOVE MEMBER ====================

    @Transactional
    public void removeMember(Long groupId, String currentUsername, String targetUsername) {
        User currentUser = findUser(currentUsername);
        User targetUser = findUser(targetUsername);

        requireAdmin(groupId, currentUser.getId());

        if (currentUser.getId().equals(targetUser.getId())) {
            throw new ValidationException("Cannot remove yourself. Use leave instead.");
        }

        // Cannot remove another admin unless you are the creator
        GroupMember targetMembership = groupMemberRepository.findByGroupIdAndUserId(groupId, targetUser.getId())
                .orElseThrow(() -> new ResourceNotFoundException("User is not a member"));

        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException("Group not found"));

        if (targetMembership.getRole() == GroupMember.Role.ADMIN
                && !group.getCreatedBy().getId().equals(currentUser.getId())) {
            throw new ValidationException("Only the group creator can remove admins");
        }

        groupMemberRepository.delete(targetMembership);
    }

    // ==================== LEAVE GROUP ====================

    @Transactional
    public void leaveGroup(Long groupId, String username) {
        User user = findUser(username);
        GroupMember membership = groupMemberRepository.findByGroupIdAndUserId(groupId, user.getId())
                .orElseThrow(() -> new ResourceNotFoundException("You are not a member"));

        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException("Group not found"));

        // If the creator is leaving, transfer ownership
        if (group.getCreatedBy().getId().equals(user.getId())) {
            List<GroupMember> others = groupMemberRepository.findByGroupId(groupId).stream()
                    .filter(m -> !m.getUser().getId().equals(user.getId()))
                    .collect(Collectors.toList());

            if (others.isEmpty()) {
                // Last person — delete the group
                groupMemberRepository.delete(membership);
                groupMemberRepository.deleteByGroupId(groupId);
                groupRepository.delete(group);
                return;
            }

            // Transfer to another admin, or first member
            GroupMember newOwner = others.stream()
                    .filter(m -> m.getRole() == GroupMember.Role.ADMIN)
                    .findFirst()
                    .orElse(others.get(0));
            newOwner.setRole(GroupMember.Role.ADMIN);
            group.setCreatedBy(newOwner.getUser());
            groupMemberRepository.save(newOwner);
            groupRepository.save(group);
        }

        groupMemberRepository.delete(membership);
    }

    // ==================== PROMOTE / DEMOTE ====================

    @Transactional
    public void promoteToAdmin(Long groupId, String currentUsername, String targetUsername) {
        User currentUser = findUser(currentUsername);
        User targetUser = findUser(targetUsername);
        requireAdmin(groupId, currentUser.getId());

        GroupMember targetMembership = groupMemberRepository.findByGroupIdAndUserId(groupId, targetUser.getId())
                .orElseThrow(() -> new ResourceNotFoundException("User is not a member"));

        if (targetMembership.getRole() == GroupMember.Role.ADMIN) {
            throw new ValidationException("User is already an admin");
        }

        targetMembership.setRole(GroupMember.Role.ADMIN);
        groupMemberRepository.save(targetMembership);
    }

    @Transactional
    public void demoteFromAdmin(Long groupId, String currentUsername, String targetUsername) {
        User currentUser = findUser(currentUsername);
        User targetUser = findUser(targetUsername);

        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException("Group not found"));

        // Only creator can demote admins
        if (!group.getCreatedBy().getId().equals(currentUser.getId())) {
            throw new ValidationException("Only the group creator can demote admins");
        }

        if (currentUser.getId().equals(targetUser.getId())) {
            throw new ValidationException("Cannot demote yourself");
        }

        GroupMember targetMembership = groupMemberRepository.findByGroupIdAndUserId(groupId, targetUser.getId())
                .orElseThrow(() -> new ResourceNotFoundException("User is not a member"));

        if (targetMembership.getRole() == GroupMember.Role.MEMBER) {
            throw new ValidationException("User is already a member (not admin)");
        }

        targetMembership.setRole(GroupMember.Role.MEMBER);
        groupMemberRepository.save(targetMembership);
    }

    // ==================== HELPERS ====================

    private void addGroupMember(Group group, User user, GroupMember.Role role) {
        GroupMember member = new GroupMember();
        member.setGroup(group);
        member.setUser(user);
        member.setRole(role);
        groupMemberRepository.save(member);
    }

    private User findUser(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + username));
    }

    private void requireAdmin(Long groupId, Long userId) {
        GroupMember membership = groupMemberRepository.findByGroupIdAndUserId(groupId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("You are not a member"));
        if (membership.getRole() != GroupMember.Role.ADMIN) {
            throw new ValidationException("Only admins can perform this action");
        }
    }

    private GroupResponse mapToSimpleResponse(Group group, Long userId, String role) {
        int count = groupMemberRepository.findByGroupId(group.getId()).size();
        return GroupResponse.builder()
                .id(group.getId())
                .name(group.getName())
                .description(group.getDescription())
                .createdById(group.getCreatedBy().getId())
                .createdByName(group.getCreatedBy().getUsername())
                .createdAt(group.getCreatedAt())
                .memberCount(count)
                .currentUserRole(role)
                .build();
    }

    private GroupResponse mapToDetailedResponse(Group group, Long userId) {
        List<GroupMember> allMembers = groupMemberRepository.findByGroupId(group.getId());
        String myRole = allMembers.stream()
                .filter(m -> m.getUser().getId().equals(userId))
                .map(m -> m.getRole().name())
                .findFirst().orElse("NONE");

        return GroupResponse.builder()
                .id(group.getId())
                .name(group.getName())
                .description(group.getDescription())
                .createdById(group.getCreatedBy().getId())
                .createdByName(group.getCreatedBy().getUsername())
                .createdAt(group.getCreatedAt())
                .memberCount(allMembers.size())
                .currentUserRole(myRole)
                .members(allMembers.stream().map(this::mapMember).collect(Collectors.toList()))
                .build();
    }

    private Map<String, Object> mapMember(GroupMember m) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("userId", m.getUser().getId());
        map.put("username", m.getUser().getUsername());
        map.put("profileAvatar", m.getUser().getProfileAvatar());
        map.put("role", m.getRole().name());
        map.put("joinedAt", m.getJoinedAt().toString());
        return map;
    }
}
