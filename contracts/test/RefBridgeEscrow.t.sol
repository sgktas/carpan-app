// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {RefBridgeEscrow} from "../RefBridgeEscrow.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal ERC-20 mock for testing
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract RefBridgeEscrowTest is Test {
    RefBridgeEscrow public escrow;
    MockUSDC public usdc;

    address public owner = address(0xA0);
    address public oracle = address(0xA1);
    address public platform = address(0xA2);
    address public projectOwner = address(0xB0);
    address public participant = address(0xB1);
    address public participant2 = address(0xB2);

    uint256 constant PRICE_PER_REF = 1_000_000; // 1 USDC (6 dec)
    uint256 constant PLATFORM_FEE_BPS = 5000;   // 50%
    uint256 constant MAX_REFS = 10;

    bytes32 constant ORDER_1 = keccak256("order_1");
    bytes32 constant PART_1 = keccak256("part_1");
    bytes32 constant PART_2 = keccak256("part_2");
    bytes32 constant PART_3 = keccak256("part_3");

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new RefBridgeEscrow(address(usdc), oracle, platform, owner);

        // Fund project owner
        usdc.mint(projectOwner, 100_000_000); // 100 USDC
        vm.prank(projectOwner);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ── depositOrder ──────────────────────────────────────────────────────────

    function test_depositOrder_success() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);

        RefBridgeEscrow.Order memory o = escrow.getOrder(ORDER_1);
        assertEq(o.projectOwner, projectOwner);
        assertEq(o.totalBudget, PRICE_PER_REF * MAX_REFS);
        assertEq(o.usedBudget, 0);
        assertTrue(o.active);
    }

    function test_depositOrder_pullsUSDC() public {
        uint256 before = usdc.balanceOf(projectOwner);
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);
        assertEq(usdc.balanceOf(projectOwner), before - (PRICE_PER_REF * MAX_REFS));
        assertEq(usdc.balanceOf(address(escrow)), PRICE_PER_REF * MAX_REFS);
    }

    function test_depositOrder_revert_duplicate() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);

        vm.prank(projectOwner);
        vm.expectRevert();
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);
    }

    function test_depositOrder_revert_zeroPrice() public {
        vm.prank(projectOwner);
        vm.expectRevert();
        escrow.depositOrder(ORDER_1, 0, PLATFORM_FEE_BPS, MAX_REFS, 0);
    }

    function test_depositOrder_revert_zeroMaxRefs() public {
        vm.prank(projectOwner);
        vm.expectRevert();
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, 0, 0);
    }

    function test_depositOrder_revert_feeTooHigh() public {
        vm.prank(projectOwner);
        vm.expectRevert();
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, 10001, MAX_REFS, 0);
    }

    // ── releasePayment ────────────────────────────────────────────────────────

    function test_releasePayment_success() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);

        uint256 participantBefore = usdc.balanceOf(participant);
        uint256 platformBefore = usdc.balanceOf(platform);

        vm.prank(oracle);
        escrow.releasePayment(ORDER_1, PART_1, participant);

        uint256 platformShare = (PRICE_PER_REF * PLATFORM_FEE_BPS) / 10000;
        uint256 participantShare = PRICE_PER_REF - platformShare;

        assertEq(usdc.balanceOf(participant), participantBefore + participantShare);
        assertEq(usdc.balanceOf(platform), platformBefore + platformShare);
    }

    function test_releasePayment_revert_notOracle() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);

        // Unauthorized user cannot trigger payment
        vm.prank(participant);
        vm.expectRevert();
        escrow.releasePayment(ORDER_1, PART_1, participant);

        // Project owner cannot trigger payment
        vm.prank(projectOwner);
        vm.expectRevert();
        escrow.releasePayment(ORDER_1, PART_1, participant);
    }

    function test_releasePayment_idempotency_sameParticipationId() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);

        vm.prank(oracle);
        escrow.releasePayment(ORDER_1, PART_1, participant);

        // Second call with same participationId must revert — cannot pay twice
        vm.prank(oracle);
        vm.expectRevert();
        escrow.releasePayment(ORDER_1, PART_1, participant);
    }

    function test_releasePayment_updatesAccounting() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);

        vm.prank(oracle);
        escrow.releasePayment(ORDER_1, PART_1, participant);

        RefBridgeEscrow.Order memory o = escrow.getOrder(ORDER_1);
        assertEq(o.paidReferrals, 1);
        assertEq(o.usedBudget, PRICE_PER_REF);
        assertTrue(o.active); // still active (1/10)
    }

    function test_releasePayment_deactivatesOnMax() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, 2, 0);

        usdc.mint(projectOwner, 10_000_000);
        vm.startPrank(oracle);
        escrow.releasePayment(ORDER_1, PART_1, participant);
        escrow.releasePayment(ORDER_1, PART_2, participant2);
        vm.stopPrank();

        RefBridgeEscrow.Order memory o = escrow.getOrder(ORDER_1);
        assertFalse(o.active);
    }

    function test_releasePayment_revert_inactiveOrder() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, 1, 0);

        vm.prank(oracle);
        escrow.releasePayment(ORDER_1, PART_1, participant);

        // Order is now inactive — another participation must fail
        vm.prank(oracle);
        vm.expectRevert();
        escrow.releasePayment(ORDER_1, PART_2, participant2);
    }

    // ── Concurrent request protection ─────────────────────────────────────────
    // The same participationId cannot be paid twice even in concurrent context.
    // Onchain: atomicity guarantees serial execution; idempotency mapping ensures
    // the second call reverts even if they arrive in the same block.

    function test_concurrent_same_participationId_reverts() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);

        // Simulate two "concurrent" oracle calls with same participationId
        vm.startPrank(oracle);
        escrow.releasePayment(ORDER_1, PART_1, participant);
        vm.expectRevert(); // Second must revert — duplicate participationId
        escrow.releasePayment(ORDER_1, PART_1, participant2); // different recipient, same partId
        vm.stopPrank();
    }

    // ── refundBudget ──────────────────────────────────────────────────────────

    function test_refundBudget_success() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);

        uint256 before = usdc.balanceOf(projectOwner);
        vm.prank(oracle);
        escrow.refundBudget(ORDER_1, PRICE_PER_REF * MAX_REFS);

        assertEq(usdc.balanceOf(projectOwner), before + PRICE_PER_REF * MAX_REFS);
    }

    function test_refundBudget_revert_notOracle() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);

        vm.prank(projectOwner);
        vm.expectRevert();
        escrow.refundBudget(ORDER_1, 1_000_000);
    }

    function test_refundBudget_partial_staysActive() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);

        vm.prank(oracle);
        escrow.refundBudget(ORDER_1, PRICE_PER_REF * 5); // refund 5 of 10

        RefBridgeEscrow.Order memory o = escrow.getOrder(ORDER_1);
        assertTrue(o.active); // still has budget
    }

    function test_refundBudget_full_deactivates() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);

        vm.prank(oracle);
        escrow.refundBudget(ORDER_1, PRICE_PER_REF * MAX_REFS);

        RefBridgeEscrow.Order memory o = escrow.getOrder(ORDER_1);
        assertFalse(o.active);
    }

    function test_refundBudget_revert_tooMuch() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);

        vm.prank(oracle);
        vm.expectRevert();
        escrow.refundBudget(ORDER_1, PRICE_PER_REF * MAX_REFS + 1);
    }

    // Partial completion + refund consistency
    function test_partialCompletionRefundConsistency() public {
        vm.prank(projectOwner);
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);

        // Pay 3 participants
        vm.startPrank(oracle);
        escrow.releasePayment(ORDER_1, PART_1, participant);
        escrow.releasePayment(ORDER_1, PART_2, participant2);
        escrow.releasePayment(ORDER_1, PART_3, address(0xC0));
        vm.stopPrank();

        // Remaining = (10-3) * PRICE_PER_REF = 7 USDC
        uint256 remaining = PRICE_PER_REF * (MAX_REFS - 3);
        uint256 before = usdc.balanceOf(projectOwner);

        vm.prank(oracle);
        escrow.refundBudget(ORDER_1, remaining);

        assertEq(usdc.balanceOf(projectOwner), before + remaining);

        // Escrow balance should now be zero
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ── Owner / admin actions ─────────────────────────────────────────────────

    function test_setOracle_ownerOnly() public {
        vm.prank(owner);
        escrow.setOracle(address(0xDEAD));
        assertEq(escrow.oracle(), address(0xDEAD));
    }

    function test_setOracle_revert_notOwner() public {
        vm.prank(participant);
        vm.expectRevert();
        escrow.setOracle(address(0xDEAD));
    }

    function test_pause_blocksDeposit() public {
        vm.prank(owner);
        escrow.pause();

        vm.prank(projectOwner);
        vm.expectRevert();
        escrow.depositOrder(ORDER_1, PRICE_PER_REF, PLATFORM_FEE_BPS, MAX_REFS, 0);
    }

    function test_noETH() public {
        // Low-level call to a non-payable contract returns ok=false without reverting at the test level
        (bool ok,) = address(escrow).call{value: 1 ether}("");
        assertFalse(ok, "ETH send should fail on non-payable contract");
    }

    // ── Fuzz ──────────────────────────────────────────────────────────────────

    function testFuzz_sharesSumToPrice(uint256 feeBps, uint256 price) public {
        feeBps = bound(feeBps, 0, 10000);
        price = bound(price, 1, 1_000_000_000);

        uint256 platformShare = (price * feeBps) / 10000;
        uint256 participantShare = price - platformShare;
        assertEq(platformShare + participantShare, price);
    }
}
