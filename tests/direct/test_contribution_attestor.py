import pytest

from conftest import warp_to

GEN = 10**18
KEEPER_REWARD_WEI = 5 * 10**14

NOW = "2026-06-01T00:00:00Z"
LATER = "2026-06-02T00:00:01Z"  # > 1 day after NOW, past RECHECK_COOLDOWN_SECONDS

REPO = "https://github.com/octocat/Hello-World"
PR = 1348
USERNAME = "octocat"

PR_BODY = '{"merged": true, "user": {"login": "octocat"}, "merged_at": "2020-01-01T00:00:00Z"}'
PROFILE_BODY = '{"login": "octocat", "bio": "just a bio"}'


def mock_verification(direct_vm, pr_status="MERGED_BY_AUTHOR", bio_status="ADDRESS_FOUND",
                       merged_at="2020-01-01T00:00:00Z", rationale="checked"):
    """Mirrors ProofOfLifeVault's own mock_life_signal helper: mock_web supplies realistic (but,
    since mock_llm fully controls the canned verdict below, not load-bearing) fetch bodies for the
    two fixed api.github.com endpoints this contract calls, and mock_llm pins exactly what the
    consensus round returns -- making the VERIFIED/REJECTED outcome fully deterministic and
    independent of any real network access or real GitHub account state."""
    direct_vm.clear_mocks()
    direct_vm.mock_web(
        r".*api\.github\.com/repos/octocat/Hello-World/pulls/1348.*",
        {"status": 200, "body": PR_BODY},
    )
    direct_vm.mock_web(
        r".*api\.github\.com/users/octocat.*",
        {"status": 200, "body": PROFILE_BODY},
    )
    direct_vm.mock_llm(
        r".*verifying two objective facts.*",
        f'{{"pr_status":"{pr_status}","bio_status":"{bio_status}",'
        f'"merged_at":"{merged_at}","rationale":"{rationale}"}}',
    )


def register(direct_vm, sender, username=USERNAME, repo=REPO, pr=PR, note="note", contract=None):
    direct_vm.sender = sender
    contract.register_claim(username, repo, pr, note)


# ---------------------------------------------------------------------------
# register_claim: pure input validation -- fails before any fetch or LLM call, no mocks needed
# ---------------------------------------------------------------------------

def test_register_rejects_username_too_long(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.register_claim("a" * 40, REPO, 1, "note")


def test_register_rejects_empty_username(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.register_claim("", REPO, 1, "note")


def test_register_rejects_username_with_invalid_characters(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.register_claim("bad_user!", REPO, 1, "note")


def test_register_rejects_username_starting_with_hyphen(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.register_claim("-octocat", REPO, 1, "note")


def test_register_rejects_non_github_domain(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.register_claim(USERNAME, "https://gitlab.com/octocat/Hello-World", 1, "note")


def test_register_rejects_repo_url_missing_repo_segment(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.register_claim(USERNAME, "https://github.com/octocat", 1, "note")


def test_register_rejects_private_ip_host(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.register_claim(USERNAME, "https://127.0.0.1/octocat/Hello-World", 1, "note")


def test_register_rejects_obfuscated_octal_private_ip_host(contract, direct_vm, direct_bob):
    # 0177.0.0.1 is octal for 127.0.0.1 -- a classic SSRF-filter-bypass trick.
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.register_claim(USERNAME, "https://0177.0.0.1/octocat/Hello-World", 1, "note")


def test_register_rejects_zero_pr_number(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.register_claim(USERNAME, REPO, 0, "note")


def test_register_rejects_absurdly_large_pr_number(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.register_claim(USERNAME, REPO, 10**12, "note")


def test_register_note_is_stored_and_truncated(contract, direct_vm, direct_bob):
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, note="x" * 10_000, contract=contract)
    assert len(contract.get_attestation(REPO, PR, direct_bob)["note"]) == 500


def test_register_sets_pending_status(contract, direct_vm, direct_bob):
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    record = contract.get_attestation(REPO, PR, direct_bob)
    assert record["status"] == "PENDING"
    assert int(record["attempts"]) == 0


def test_register_can_overwrite_a_still_pending_claim(contract, direct_vm, direct_bob):
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, username="octocat", note="first try", contract=contract)
    register(direct_vm, direct_bob, username="torvalds", note="corrected", contract=contract)
    record = contract.get_attestation(REPO, PR, direct_bob)
    assert record["github_username"] == "torvalds"
    assert record["note"] == "corrected"


# ---------------------------------------------------------------------------
# verify_contribution: requires a prior registration, and only ever checks the REGISTERED
# username -- never anything the verify-caller supplies.
# ---------------------------------------------------------------------------

def test_verify_fails_without_prior_registration(contract, direct_vm, direct_bob):
    warp_to(direct_vm, NOW)
    mock_verification(direct_vm)
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.verify_contribution(direct_bob, REPO, PR)


def test_verify_by_claimant_themselves_succeeds_when_checks_pass(contract, direct_vm, direct_bob):
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm, pr_status="MERGED_BY_AUTHOR", bio_status="ADDRESS_FOUND")
    direct_vm.sender = direct_bob
    contract.verify_contribution(direct_bob, REPO, PR)

    record = contract.get_attestation(REPO, PR, direct_bob)
    assert record["status"] == "VERIFIED"
    assert contract.get_verified_owner(REPO, PR) == str(direct_bob)
    assert int(contract.get_reputation(direct_bob)) == 1
    assert [c["claim_key"] for c in contract.list_claims_for_address(direct_bob)] == ["octocat/Hello-World#1348"]


def test_verify_triggered_by_a_third_party_keeper_succeeds(contract, direct_vm, direct_bob, direct_carol):
    """The core new permissionless property: carol (a keeper, unrelated to the claim) can trigger
    bob's verification, and it succeeds using BOB'S own registered username -- carol never
    supplies or influences what is checked."""
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm)
    direct_vm.sender = direct_carol
    contract.verify_contribution(direct_bob, REPO, PR)

    record = contract.get_attestation(REPO, PR, direct_bob)
    assert record["status"] == "VERIFIED"
    assert contract.get_verified_owner(REPO, PR) == str(direct_bob)
    assert int(contract.get_reputation(direct_bob)) == 1
    # The reward (if any pool existed) would go to carol, the caller -- covered separately below.


def test_verify_rejected_when_bio_missing_address(contract, direct_vm, direct_bob):
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm, bio_status="ADDRESS_NOT_FOUND")
    direct_vm.sender = direct_bob
    contract.verify_contribution(direct_bob, REPO, PR)

    record = contract.get_attestation(REPO, PR, direct_bob)
    assert record["status"] == "REJECTED"
    assert contract.get_verified_owner(REPO, PR) == ""
    assert int(contract.get_reputation(direct_bob)) == 0


def test_verify_rejected_when_wrong_author(contract, direct_vm, direct_bob):
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm, pr_status="NOT_MERGED_OR_WRONG_AUTHOR")
    direct_vm.sender = direct_bob
    contract.verify_contribution(direct_bob, REPO, PR)
    assert contract.get_attestation(REPO, PR, direct_bob)["status"] == "REJECTED"


def test_partial_pass_is_still_rejected_not_partial_credit(contract, direct_vm, direct_bob):
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm, pr_status="MERGED_BY_AUTHOR", bio_status="FETCH_UNAVAILABLE")
    direct_vm.sender = direct_bob
    contract.verify_contribution(direct_bob, REPO, PR)
    record = contract.get_attestation(REPO, PR, direct_bob)
    assert record["status"] == "REJECTED"
    assert record["bio_status"] == "FETCH_UNAVAILABLE"


def test_unrecognized_llm_status_value_falls_back_to_fetch_unavailable(contract, direct_vm, direct_bob):
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm, pr_status="SOMETHING_UNEXPECTED")
    direct_vm.sender = direct_bob
    contract.verify_contribution(direct_bob, REPO, PR)
    record = contract.get_attestation(REPO, PR, direct_bob)
    assert record["status"] == "REJECTED"
    assert record["pr_status"] == "FETCH_UNAVAILABLE"


# ---------------------------------------------------------------------------
# Locking and cooldown
# ---------------------------------------------------------------------------

def test_verified_claim_locks_out_a_different_address(contract, direct_vm, direct_bob, direct_carol):
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm)
    direct_vm.sender = direct_bob
    contract.verify_contribution(direct_bob, REPO, PR)

    direct_vm.sender = direct_carol
    with pytest.raises(Exception):
        contract.register_claim(USERNAME, REPO, PR, "carol tries too")

    assert contract.get_verified_owner(REPO, PR) == str(direct_bob)
    assert int(contract.get_reputation(direct_carol)) == 0


def test_verified_claim_rejects_reverification(contract, direct_vm, direct_bob):
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm)
    direct_vm.sender = direct_bob
    contract.verify_contribution(direct_bob, REPO, PR)

    warp_to(direct_vm, LATER)
    with pytest.raises(Exception):
        contract.verify_contribution(direct_bob, REPO, PR)


def test_reverify_before_cooldown_elapsed_is_rejected(contract, direct_vm, direct_bob):
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm, bio_status="ADDRESS_NOT_FOUND")
    direct_vm.sender = direct_bob
    contract.verify_contribution(direct_bob, REPO, PR)

    warp_to(direct_vm, NOW)  # no time has passed
    with pytest.raises(Exception):
        contract.verify_contribution(direct_bob, REPO, PR)


def test_reverify_after_cooldown_can_then_succeed(contract, direct_vm, direct_bob):
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm, bio_status="ADDRESS_NOT_FOUND")
    direct_vm.sender = direct_bob
    contract.verify_contribution(direct_bob, REPO, PR)
    assert contract.get_attestation(REPO, PR, direct_bob)["status"] == "REJECTED"

    warp_to(direct_vm, LATER)
    mock_verification(direct_vm, bio_status="ADDRESS_FOUND")  # claimant updated their bio meanwhile
    contract.verify_contribution(direct_bob, REPO, PR)

    record = contract.get_attestation(REPO, PR, direct_bob)
    assert record["status"] == "VERIFIED"
    assert int(record["attempts"]) == 2
    assert int(contract.get_reputation(direct_bob)) == 1


# ---------------------------------------------------------------------------
# Blacklist
# ---------------------------------------------------------------------------

def test_non_admin_cannot_blacklist(contract, direct_vm, direct_bob, direct_carol):
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.blacklist_address(direct_carol, "spam")


def test_admin_can_blacklist_and_it_blocks_registration(contract, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_alice  # alice is the deployer -> admin, per the contract fixture
    contract.blacklist_address(direct_bob, "spam account")

    status = contract.get_blacklist_status(direct_bob)
    assert status["blacklisted"] is True
    assert status["reason"] == "spam account"

    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.register_claim(USERNAME, REPO, PR, "note")


def test_blacklisted_address_reputation_reads_as_zero_but_record_survives(
    contract, direct_vm, direct_alice, direct_bob
):
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm)
    direct_vm.sender = direct_bob
    contract.verify_contribution(direct_bob, REPO, PR)
    assert int(contract.get_reputation(direct_bob)) == 1

    direct_vm.sender = direct_alice
    contract.blacklist_address(direct_bob, "later found to be abusive")

    assert int(contract.get_reputation(direct_bob)) == 0
    # The underlying attestation record itself is untouched, not deleted.
    assert contract.get_attestation(REPO, PR, direct_bob)["status"] == "VERIFIED"


def test_unblacklist_restores_reputation_visibility(contract, direct_vm, direct_alice, direct_bob):
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm)
    direct_vm.sender = direct_bob
    contract.verify_contribution(direct_bob, REPO, PR)

    direct_vm.sender = direct_alice
    contract.blacklist_address(direct_bob, "temporary flag")
    assert int(contract.get_reputation(direct_bob)) == 0

    contract.unblacklist_address(direct_bob)
    assert int(contract.get_reputation(direct_bob)) == 1


def test_non_admin_cannot_unblacklist(contract, direct_vm, direct_alice, direct_bob, direct_carol):
    direct_vm.sender = direct_alice
    contract.blacklist_address(direct_bob, "spam")

    direct_vm.sender = direct_carol
    with pytest.raises(Exception):
        contract.unblacklist_address(direct_bob)


# ---------------------------------------------------------------------------
# Reward pool
# ---------------------------------------------------------------------------

def test_fund_rewards_rejects_zero_value(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    direct_vm.value = 0
    with pytest.raises(Exception):
        contract.fund_rewards()


def test_fund_rewards_increases_pool(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    direct_vm.value = 1 * GEN
    contract.fund_rewards()
    direct_vm.value = 0
    assert int(contract.get_reward_pool()) == 1 * GEN


def test_keeper_reward_paid_to_caller_on_genuine_verification(
    contract, direct_vm, direct_bob, direct_carol
):
    direct_vm.sender = direct_bob
    direct_vm.value = 1 * GEN
    contract.fund_rewards()
    direct_vm.value = 0
    pool_before = int(contract.get_reward_pool())

    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm)
    direct_vm.sender = direct_carol  # carol is the keeper triggering it, not the claimant
    contract.verify_contribution(direct_bob, REPO, PR)

    assert int(contract.get_reward_pool()) == pool_before - KEEPER_REWARD_WEI


def test_no_reward_paid_on_rejected_outcome(contract, direct_vm, direct_bob, direct_carol):
    direct_vm.sender = direct_bob
    direct_vm.value = 1 * GEN
    contract.fund_rewards()
    direct_vm.value = 0
    pool_before = int(contract.get_reward_pool())

    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm, bio_status="ADDRESS_NOT_FOUND")
    direct_vm.sender = direct_carol
    contract.verify_contribution(direct_bob, REPO, PR)

    assert int(contract.get_reward_pool()) == pool_before  # untouched -- REJECTED earns nothing


def test_verification_still_succeeds_when_pool_is_empty(contract, direct_vm, direct_bob):
    """An empty reward pool must never block verification itself -- the reward is a bonus, not a
    requirement."""
    warp_to(direct_vm, NOW)
    register(direct_vm, direct_bob, contract=contract)
    mock_verification(direct_vm)
    assert int(contract.get_reward_pool()) == 0
    direct_vm.sender = direct_bob
    contract.verify_contribution(direct_bob, REPO, PR)
    assert contract.get_attestation(REPO, PR, direct_bob)["status"] == "VERIFIED"


# ---------------------------------------------------------------------------
# Views on a claim nobody has ever submitted, and enumeration
# ---------------------------------------------------------------------------

def test_get_attestation_empty_for_unknown_claim(contract, direct_bob):
    assert contract.get_attestation(REPO, 999999, direct_bob) == {}


def test_get_verified_owner_empty_for_unknown_claim(contract):
    assert contract.get_verified_owner(REPO, 999999) == ""


def test_get_reputation_zero_for_unknown_address(contract, direct_bob):
    assert int(contract.get_reputation(direct_bob)) == 0


def test_list_claims_empty_for_unknown_address(contract, direct_bob):
    assert contract.list_claims_for_address(direct_bob) == []


def test_get_expected_bio_proof_is_lowercased_address(contract, direct_bob):
    assert contract.get_expected_bio_proof(direct_bob) == str(direct_bob).lower()


def test_list_verified_addresses_empty_initially(contract):
    assert contract.list_verified_addresses(0, 10) == []


def test_list_verified_addresses_after_two_different_claimants_verify(
    contract, direct_vm, direct_bob, direct_carol
):
    warp_to(direct_vm, NOW)

    register(direct_vm, direct_bob, contract=contract)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*api\.github\.com/repos/octocat/Hello-World/pulls/1348.*",
                        {"status": 200, "body": PR_BODY})
    direct_vm.mock_web(r".*api\.github\.com/users/octocat.*", {"status": 200, "body": PROFILE_BODY})
    direct_vm.mock_llm(r".*verifying two objective facts.*",
                        '{"pr_status":"MERGED_BY_AUTHOR","bio_status":"ADDRESS_FOUND","merged_at":"x","rationale":"ok"}')
    direct_vm.sender = direct_bob
    contract.verify_contribution(direct_bob, REPO, PR)

    register(direct_vm, direct_carol, username="torvalds", repo=REPO, pr=2, contract=contract)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*api\.github\.com/repos/octocat/Hello-World/pulls/2\b.*",
                        {"status": 200, "body": '{"merged": true, "user": {"login": "torvalds"}, "merged_at": "x"}'})
    direct_vm.mock_web(r".*api\.github\.com/users/torvalds.*",
                        {"status": 200, "body": '{"login": "torvalds", "bio": "linux"}'})
    direct_vm.mock_llm(r".*verifying two objective facts.*",
                        '{"pr_status":"MERGED_BY_AUTHOR","bio_status":"ADDRESS_FOUND","merged_at":"x","rationale":"ok"}')
    direct_vm.sender = direct_carol
    contract.verify_contribution(direct_carol, REPO, 2)

    listing = contract.list_verified_addresses(0, 10)
    addresses = {row["address"] for row in listing}
    assert addresses == {str(direct_bob), str(direct_carol)}
    assert len(listing) == 2


def test_reputation_accumulates_across_different_claims_same_address(contract, direct_vm, direct_bob):
    warp_to(direct_vm, NOW)
    direct_vm.sender = direct_bob

    register(direct_vm, direct_bob, pr=1, contract=contract)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*api\.github\.com/repos/octocat/Hello-World/pulls/1\b.*",
                        {"status": 200, "body": PR_BODY})
    direct_vm.mock_web(r".*api\.github\.com/users/octocat.*", {"status": 200, "body": PROFILE_BODY})
    direct_vm.mock_llm(r".*verifying two objective facts.*",
                        '{"pr_status":"MERGED_BY_AUTHOR","bio_status":"ADDRESS_FOUND","merged_at":"x","rationale":"ok"}')
    contract.verify_contribution(direct_bob, REPO, 1)

    register(direct_vm, direct_bob, pr=2, contract=contract)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*api\.github\.com/repos/octocat/Hello-World/pulls/2\b.*",
                        {"status": 200, "body": PR_BODY})
    direct_vm.mock_web(r".*api\.github\.com/users/octocat.*", {"status": 200, "body": PROFILE_BODY})
    direct_vm.mock_llm(r".*verifying two objective facts.*",
                        '{"pr_status":"MERGED_BY_AUTHOR","bio_status":"ADDRESS_FOUND","merged_at":"x","rationale":"ok"}')
    contract.verify_contribution(direct_bob, REPO, 2)

    assert int(contract.get_reputation(direct_bob)) == 2
    claim_keys = {c["claim_key"] for c in contract.list_claims_for_address(direct_bob)}
    assert claim_keys == {"octocat/Hello-World#1", "octocat/Hello-World#2"}
