#!/usr/bin/env bash
set -uo pipefail

# ==============================================================================
# TrustFlow Invitation Lifecycle Smoke Test
# Covers: auth -> org creation -> invite -> accept -> membership -> RBAC edges
#
# Confirmed against:
#   src/organizations/organizations.controller.ts
#   src/organization-members/invitations.controller.ts
#   src/organization-members/organization-members.controller.ts
#   src/organization-members/dto/create-invitation.dto.ts
#   src/organization-members/entities/invitation.entity.ts
#   src/organization-members/entities/organization-member.entity.ts
#   src/organizations/dto/create-organization.dto.ts
#
# NOTE: listMembers() currently gates on MembershipAction.INVITE_MEMBER,
# so OWNER_TOKEN is used for the members-list check below (a plain
# viewer likely can't call GET /organizations/:id/members — confirm
# with your CTO whether that's intended).
# ==============================================================================

BASE_URL="${BASE_URL:-http://localhost:4000}"

# Test users — adjust to your seeded test accounts
OWNER_EMAIL="owner.test@example.com"
OWNER_PASSWORD="SecurePass123"

VIEWER_EMAIL="viewer.test@example.com"
VIEWER_PASSWORD="SecurePass123"

UNRELATED_EMAIL="unrelated.test@example.com"
UNRELATED_PASSWORD="SecurePass123"

PASS=0
FAIL=0

pass() { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

json_get() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)" 2>/dev/null; }

login() {
  local email="$1" password="$2"
  curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}" \
    | json_get "['accessToken']"
}

echo "=== 1. Login as organization owner ==="
OWNER_TOKEN=$(login "$OWNER_EMAIL" "$OWNER_PASSWORD")
[ -n "$OWNER_TOKEN" ] && pass "Owner login" || { fail "Owner login"; exit 1; }

echo "=== 2. Create organization ==="
CREATE_ORG_RESPONSE=$(curl -s -X POST "$BASE_URL/organizations" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test Org","country":"Nigeria","currency":"NGN"}')
ORG_ID=$(echo "$CREATE_ORG_RESPONSE" | json_get "['id']")
[ -n "$ORG_ID" ] && pass "Org created: $ORG_ID" || { fail "Org creation failed: $CREATE_ORG_RESPONSE"; exit 1; }

echo "=== 3. Invite viewer ==="
INVITE_RESPONSE=$(curl -s -X POST "$BASE_URL/organizations/$ORG_ID/invitations" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$VIEWER_EMAIL\",\"role\":\"viewer\"}")
INVITATION_TOKEN=$(echo "$INVITE_RESPONSE" | json_get "['token']")
INVITATION_STATUS=$(echo "$INVITE_RESPONSE" | json_get "['status']")
[ -n "$INVITATION_TOKEN" ] && pass "Invitation created, token: ${INVITATION_TOKEN:0:8}..." || { fail "Invitation creation failed: $INVITE_RESPONSE"; exit 1; }

echo "=== 4. Verify invitation status=pending ==="
[ "$INVITATION_STATUS" = "pending" ] && pass "Invitation status is pending" || fail "Expected status=pending, got '$INVITATION_STATUS'"

echo "=== 5. Login as viewer ==="
VIEWER_TOKEN=$(login "$VIEWER_EMAIL" "$VIEWER_PASSWORD")
[ -n "$VIEWER_TOKEN" ] && pass "Viewer login" || { fail "Viewer login"; exit 1; }

echo "=== 6/7. Accept invitation (by token) -> expect 204 ==="
ACCEPT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$BASE_URL/organizations/invitations/$INVITATION_TOKEN/accept" \
  -H "Authorization: Bearer $VIEWER_TOKEN")
[ "$ACCEPT_STATUS" = "204" ] && pass "Accept returned 204" || fail "Expected 204, got $ACCEPT_STATUS"

echo "=== 8/9/10. GET members -> viewer present with role=viewer ==="
# Uses OWNER_TOKEN since listMembers() requires INVITE_MEMBER permission
MEMBERS_RESPONSE=$(curl -s -X GET "$BASE_URL/organizations/$ORG_ID/members" \
  -H "Authorization: Bearer $OWNER_TOKEN")
VIEWER_ROLE=$(echo "$MEMBERS_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
members = d if isinstance(d, list) else d.get('members', [])
for m in members:
    if m.get('user', {}).get('email') == '$VIEWER_EMAIL':
        print(m.get('role', ''))
        break
" 2>/dev/null)
[ "$VIEWER_ROLE" = "viewer" ] && pass "Viewer present with role=viewer" || fail "Viewer not found or wrong role (got '$VIEWER_ROLE'). Response: $MEMBERS_RESPONSE"

echo "=== 11/12. Duplicate accept -> expect 400/409/410 ==="
DUP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$BASE_URL/organizations/invitations/$INVITATION_TOKEN/accept" \
  -H "Authorization: Bearer $VIEWER_TOKEN")
case "$DUP_STATUS" in
  400|409|410) pass "Duplicate accept correctly rejected ($DUP_STATUS)" ;;
  *) fail "Expected 400/409/410 on duplicate accept, got $DUP_STATUS" ;;
esac

echo "=== 13/14/15. Unrelated user attempts accept on a FRESH invite -> expect 403 or equivalent ==="
# Create a second, separate invitation (different email) so this checks
# "wrong user, still-pending invite" cleanly, rather than reusing the
# already-accepted token from above (which would just retest 11/12).
UNRELATED_TOKEN=$(login "$UNRELATED_EMAIL" "$UNRELATED_PASSWORD")
if [ -n "$UNRELATED_TOKEN" ]; then
  SECOND_INVITE_EMAIL="viewer2.test@example.com"
  SECOND_INVITE_RESPONSE=$(curl -s -X POST "$BASE_URL/organizations/$ORG_ID/invitations" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$SECOND_INVITE_EMAIL\",\"role\":\"viewer\"}")
  SECOND_TOKEN=$(echo "$SECOND_INVITE_RESPONSE" | json_get "['token']")

  if [ -n "$SECOND_TOKEN" ]; then
    WRONG_USER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      "$BASE_URL/organizations/invitations/$SECOND_TOKEN/accept" \
      -H "Authorization: Bearer $UNRELATED_TOKEN")
    # NOTE: controller only has @UseGuards(AuthGuard('jwt')) on accept() —
    # no PermissionsGuard or explicit email-match check visible in the
    # controller. The service layer may enforce req.user.email === invitedEmail
    # and throw ForbiddenException (403), or it may not check at all and
    # incorrectly accept (200/204). Flag to CTO if you get 204 here — that's
    # a real vulnerability (anyone can accept anyone else's invitation).
    case "$WRONG_USER_STATUS" in
      403) pass "Unrelated user correctly forbidden (403)" ;;
      204) fail "SECURITY ISSUE: unrelated user was able to accept another user's invitation (204)" ;;
      *) fail "Expected 403, got $WRONG_USER_STATUS" ;;
    esac
  else
    fail "Could not create second invitation for wrong-user test: $SECOND_INVITE_RESPONSE"
  fi
else
  fail "Unrelated user login failed — is unrelated.test@example.com seeded?"
fi

echo "=== 16/17. Owner revokes a pending invitation -> expect 204, then accept fails ==="
REVOKE_INVITE_EMAIL="revoketarget.test@example.com"
REVOKE_INVITE_RESPONSE=$(curl -s -X POST "$BASE_URL/organizations/$ORG_ID/invitations" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$REVOKE_INVITE_EMAIL\",\"role\":\"viewer\"}")
REVOKE_INVITATION_ID=$(echo "$REVOKE_INVITE_RESPONSE" | json_get "['id']")
REVOKE_INVITATION_TOKEN=$(echo "$REVOKE_INVITE_RESPONSE" | json_get "['token']")

if [ -n "$REVOKE_INVITATION_ID" ]; then
  REVOKE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    "$BASE_URL/organizations/$ORG_ID/invitations/$REVOKE_INVITATION_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN")
  [ "$REVOKE_STATUS" = "204" ] && pass "Revoke returned 204" || fail "Expected 204 on revoke, got $REVOKE_STATUS"

  POST_REVOKE_ACCEPT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "$BASE_URL/organizations/invitations/$REVOKE_INVITATION_TOKEN/accept" \
    -H "Authorization: Bearer $OWNER_TOKEN")
  case "$POST_REVOKE_ACCEPT_STATUS" in
    400|409|410) pass "Accepting a revoked invitation correctly rejected ($POST_REVOKE_ACCEPT_STATUS)" ;;
    *) fail "Expected 400/409/410 accepting a revoked invitation, got $POST_REVOKE_ACCEPT_STATUS" ;;
  esac
else
  fail "Could not create invitation for revoke test: $REVOKE_INVITE_RESPONSE"
fi

echo "=== 18/19. Invited user rejects their own invitation -> expect 204, then accept fails ==="
REJECT_INVITE_EMAIL="viewer3.test@example.com"
REJECT_INVITE_RESPONSE=$(curl -s -X POST "$BASE_URL/organizations/$ORG_ID/invitations" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$REJECT_INVITE_EMAIL\",\"role\":\"viewer\"}")
REJECT_INVITATION_TOKEN=$(echo "$REJECT_INVITE_RESPONSE" | json_get "['token']")
REJECT_USER_TOKEN=$(login "$REJECT_INVITE_EMAIL" "$VIEWER_PASSWORD")

if [ -n "$REJECT_INVITATION_TOKEN" ] && [ -n "$REJECT_USER_TOKEN" ]; then
  REJECT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "$BASE_URL/organizations/invitations/$REJECT_INVITATION_TOKEN/reject" \
    -H "Authorization: Bearer $REJECT_USER_TOKEN")
  [ "$REJECT_STATUS" = "204" ] && pass "Reject returned 204" || fail "Expected 204 on reject, got $REJECT_STATUS"

  POST_REJECT_ACCEPT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "$BASE_URL/organizations/invitations/$REJECT_INVITATION_TOKEN/accept" \
    -H "Authorization: Bearer $REJECT_USER_TOKEN")
  case "$POST_REJECT_ACCEPT_STATUS" in
    400|409|410) pass "Accepting a rejected invitation correctly rejected ($POST_REJECT_ACCEPT_STATUS)" ;;
    *) fail "Expected 400/409/410 accepting a rejected invitation, got $POST_REJECT_ACCEPT_STATUS" ;;
  esac
else
  fail "Could not set up reject test (invite token: '$REJECT_INVITATION_TOKEN', user login: '$REJECT_USER_TOKEN')"
fi

echo "=== 20. Unrelated user attempts to reject someone else's pending invitation -> expect 403 ==="
WRONGREJECT_INVITE_EMAIL="viewer4.test@example.com"
WRONGREJECT_INVITE_RESPONSE=$(curl -s -X POST "$BASE_URL/organizations/$ORG_ID/invitations" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$WRONGREJECT_INVITE_EMAIL\",\"role\":\"viewer\"}")
WRONGREJECT_TOKEN=$(echo "$WRONGREJECT_INVITE_RESPONSE" | json_get "['token']")

if [ -n "$WRONGREJECT_TOKEN" ] && [ -n "${UNRELATED_TOKEN:-}" ]; then
  WRONGREJECT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "$BASE_URL/organizations/invitations/$WRONGREJECT_TOKEN/reject" \
    -H "Authorization: Bearer $UNRELATED_TOKEN")
  case "$WRONGREJECT_STATUS" in
    403) pass "Unrelated user correctly forbidden from rejecting (403)" ;;
    204) fail "SECURITY ISSUE: unrelated user was able to reject another user's invitation (204)" ;;
    *) fail "Expected 403, got $WRONGREJECT_STATUS" ;;
  esac
else
  fail "Could not set up wrong-user reject test (invite token: '$WRONGREJECT_TOKEN', unrelated login: '${UNRELATED_TOKEN:-}')"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
