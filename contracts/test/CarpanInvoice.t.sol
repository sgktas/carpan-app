// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {CarpanInvoice} from "../CarpanInvoice.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {FalseReturnERC20} from "../test-helpers/FalseReturnERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// ─────────────────────────────────────────────────────────────────────────────
// BadToken — inline bad-token for test 6 (overrides transferFrom → false).
// Separate from FalseReturnERC20 in test-helpers to be explicit in this file.
// ─────────────────────────────────────────────────────────────────────────────
contract BadToken {
    string public name     = "BadToken";
    string public symbol   = "BAD";
    uint8  public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function totalSupply() external pure returns (uint256) { return 0; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }

    /// @dev Always returns false — SafeERC20 must revert on this.
    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main test contract
// ─────────────────────────────────────────────────────────────────────────────
contract CarpanInvoiceTest is Test {

    // ── Contracts ────────────────────────────────────────────────────────────
    CarpanInvoice internal invoice;
    MockERC20     internal usdc;

    // ── Actors ───────────────────────────────────────────────────────────────
    address internal creator1  = makeAddr("creator1");
    address internal creator2  = makeAddr("creator2");
    address internal recipient = makeAddr("recipient");
    address internal payer     = makeAddr("payer");
    address internal stranger  = makeAddr("stranger");

    // ── Fixture values ───────────────────────────────────────────────────────
    bytes32 internal constant REF_HASH  = keccak256("invoice-ref-001");
    uint256 internal constant AMOUNT    = 500e6;   // 500 USDC (6 decimals)
    uint32  internal constant NO_EXPIRY = 0;

    // ── Setup ─────────────────────────────────────────────────────────────────
    function setUp() public {
        usdc    = new MockERC20("Mock USDC", "mUSDC", 6);
        invoice = new CarpanInvoice(address(usdc));

        // Seed payer with USDC and approve the invoice contract.
        usdc.mint(payer, 10_000e6);
        vm.prank(payer);
        usdc.approve(address(invoice), type(uint256).max);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 1 — Creator namespace isolation
    //   Two different creators use the same referenceHash; keys are distinct,
    //   both invoices exist independently.
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case1_NamespaceIsolation_KeysDistinct() public {
        // creator1 creates — must succeed.
        vm.prank(creator1);
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, NO_EXPIRY);

        // creator2 uses the SAME referenceHash — must also succeed (different namespace).
        vm.prank(creator2);
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, NO_EXPIRY);

        bytes32 key1 = invoice.computeKey(creator1, REF_HASH);
        bytes32 key2 = invoice.computeKey(creator2, REF_HASH);

        // Keys must differ.
        assertTrue(key1 != key2, "keys must differ across creators");

        // Both invoices exist and point to their respective creators.
        CarpanInvoice.Invoice memory inv1 = invoice.getInvoice(key1);
        CarpanInvoice.Invoice memory inv2 = invoice.getInvoice(key2);

        assertEq(inv1.creator, creator1, "key1 creator mismatch");
        assertEq(inv2.creator, creator2, "key2 creator mismatch");

        // Statuses are independent — cancelling one doesn't affect the other.
        vm.prank(creator1);
        invoice.cancelInvoice(key1);

        assertEq(
            uint8(invoice.getInvoice(key1).status),
            uint8(CarpanInvoice.InvoiceStatus.CANCELLED),
            "key1 should be CANCELLED"
        );
        assertEq(
            uint8(invoice.getInvoice(key2).status),
            uint8(CarpanInvoice.InvoiceStatus.PENDING),
            "key2 should still be PENDING"
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 2a — Zero-field validation: createInvoice reverts on zero recipient
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case2a_CreateInvoice_RevertsOnZeroRecipient() public {
        vm.prank(creator1);
        vm.expectRevert(CarpanInvoice.ZeroAddress.selector);
        invoice.createInvoice(REF_HASH, address(0), AMOUNT, NO_EXPIRY);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 2b — Zero-field validation: createInvoice reverts on zero amount
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case2b_CreateInvoice_RevertsOnZeroAmount() public {
        vm.prank(creator1);
        vm.expectRevert(CarpanInvoice.ZeroAmount.selector);
        invoice.createInvoice(REF_HASH, recipient, 0, NO_EXPIRY);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 2c — Zero-field validation: payInvoice reverts on non-existent key
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case2c_PayInvoice_RevertsOnNonExistentKey() public {
        bytes32 ghost = keccak256("ghost-invoice-key");
        vm.prank(payer);
        vm.expectRevert(CarpanInvoice.InvoiceNotFound.selector);
        invoice.payInvoice(ghost);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 3 — Duplicate on creation
    //   Second createInvoice with same (creator, referenceHash) reverts
    //   InvoiceAlreadyExists.
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case3_CreateInvoice_RevertsOnDuplicate() public {
        vm.startPrank(creator1);

        // First creation — must succeed.
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, NO_EXPIRY);

        // Exact same (creator, referenceHash) — must revert.
        vm.expectRevert(CarpanInvoice.InvoiceAlreadyExists.selector);
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, NO_EXPIRY);

        vm.stopPrank();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 4 — Payment happy path
    //   Payer approves USDC, calls payInvoice, USDC transfers directly from
    //   payer to recipient (balance checks), status becomes PAID, InvoicePaid
    //   event emitted.
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case4_PayInvoice_HappyPath() public {
        // Create invoice.
        vm.prank(creator1);
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, NO_EXPIRY);

        bytes32 key = invoice.computeKey(creator1, REF_HASH);

        uint256 payerBalBefore     = usdc.balanceOf(payer);
        uint256 recipientBalBefore = usdc.balanceOf(recipient);

        // Expect the InvoicePaid event with all indexed topics and data correct.
        vm.expectEmit(true, true, true, true, address(invoice));
        emit CarpanInvoice.InvoicePaid(key, payer, recipient, AMOUNT);

        vm.prank(payer);
        invoice.payInvoice(key);

        // Payer deducted, recipient credited.
        assertEq(usdc.balanceOf(payer),     payerBalBefore     - AMOUNT, "payer balance wrong");
        assertEq(usdc.balanceOf(recipient), recipientBalBefore + AMOUNT, "recipient balance wrong");

        // Status is PAID.
        CarpanInvoice.Invoice memory inv = invoice.getInvoice(key);
        assertEq(
            uint8(inv.status),
            uint8(CarpanInvoice.InvoiceStatus.PAID),
            "status should be PAID"
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 5 — Payment replay
    //   Calling payInvoice again on a PAID invoice reverts InvoiceNotPending.
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case5_PayInvoice_RevertsOnReplay() public {
        vm.prank(creator1);
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, NO_EXPIRY);

        bytes32 key = invoice.computeKey(creator1, REF_HASH);

        // First payment succeeds.
        vm.prank(payer);
        invoice.payInvoice(key);

        // Second payment must revert — invoice is now PAID, not PENDING.
        vm.prank(payer);
        vm.expectRevert(CarpanInvoice.InvoiceNotPending.selector);
        invoice.payInvoice(key);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 6 — False-return / failed token
    //   Deploy a mock ERC20 that returns false on transferFrom; SafeERC20
    //   wrapper must revert the payment.
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case6_PayInvoice_RevertsWhenTransferFromReturnsFalse() public {
        // Wire up a separate invoice contract to the BadToken.
        BadToken      badToken   = new BadToken();
        CarpanInvoice badInvoice = new CarpanInvoice(address(badToken));

        // Create invoice on badInvoice.
        vm.prank(creator1);
        badInvoice.createInvoice(REF_HASH, recipient, AMOUNT, NO_EXPIRY);

        bytes32 key = badInvoice.computeKey(creator1, REF_HASH);

        // Payer "approves" — approve() returns true; transferFrom() will return false.
        vm.prank(payer);
        badToken.approve(address(badInvoice), type(uint256).max);

        // SafeERC20.safeTransferFrom must revert because transferFrom returned false.
        vm.prank(payer);
        vm.expectRevert(); // SafeERC20FailedOperation (OZ 5.x) or SafeTransferFailed
        badInvoice.payInvoice(key);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 7 — Expiry past
    //   Invoice with expiry = block.timestamp - 1 reverts InvoiceExpired.
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case7_PayInvoice_RevertsWhenExpiryInPast() public {
        // Start at a known timestamp so we can go back by 1.
        vm.warp(1_000_000);
        uint32 expiry = uint32(block.timestamp - 1); // already in the past

        vm.prank(creator1);
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, expiry);

        bytes32 key = invoice.computeKey(creator1, REF_HASH);

        vm.prank(payer);
        vm.expectRevert(CarpanInvoice.InvoiceExpired.selector);
        invoice.payInvoice(key);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 8 — Expiry future
    //   Invoice with expiry = block.timestamp + 1000 succeeds.
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case8_PayInvoice_SucceedsWithFutureExpiry() public {
        uint32 expiry = uint32(block.timestamp + 1000);

        vm.prank(creator1);
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, expiry);

        bytes32 key = invoice.computeKey(creator1, REF_HASH);

        // Do NOT warp — block.timestamp is still below expiry.
        vm.prank(payer);
        invoice.payInvoice(key); // must not revert

        assertEq(
            uint8(invoice.getInvoice(key).status),
            uint8(CarpanInvoice.InvoiceStatus.PAID),
            "status should be PAID"
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 9 — Expiry zero (no expiry)
    //   Invoice with expiry = 0 succeeds regardless of time.
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case9_PayInvoice_ZeroExpiryNeverExpires() public {
        vm.prank(creator1);
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, NO_EXPIRY); // expiry == 0

        bytes32 key = invoice.computeKey(creator1, REF_HASH);

        // Warp 100 years into the future.
        vm.warp(block.timestamp + 365 days * 100);

        vm.prank(payer);
        invoice.payInvoice(key); // must not revert

        assertEq(
            uint8(invoice.getInvoice(key).status),
            uint8(CarpanInvoice.InvoiceStatus.PAID),
            "status should be PAID"
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 10 — Cancellation by creator
    //   Creator cancels PENDING invoice; status is CANCELLED, event emitted.
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case10_CancelInvoice_CreatorCanCancel() public {
        vm.prank(creator1);
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, NO_EXPIRY);

        bytes32 key = invoice.computeKey(creator1, REF_HASH);

        // Expect InvoiceCancelled event.
        vm.expectEmit(true, true, false, false, address(invoice));
        emit CarpanInvoice.InvoiceCancelled(key, creator1);

        vm.prank(creator1);
        invoice.cancelInvoice(key);

        assertEq(
            uint8(invoice.getInvoice(key).status),
            uint8(CarpanInvoice.InvoiceStatus.CANCELLED),
            "status should be CANCELLED"
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 11 — Cancellation by non-creator
    //   Reverts NotInvoiceCreator.
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case11_CancelInvoice_RevertsForNonCreator() public {
        vm.prank(creator1);
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, NO_EXPIRY);

        bytes32 key = invoice.computeKey(creator1, REF_HASH);

        // A stranger tries to cancel.
        vm.prank(stranger);
        vm.expectRevert(CarpanInvoice.NotInvoiceCreator.selector);
        invoice.cancelInvoice(key);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 12 — Pay cancelled invoice
    //   Reverts InvoiceNotPending.
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case12_PayInvoice_RevertsOnCancelledInvoice() public {
        vm.prank(creator1);
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, NO_EXPIRY);

        bytes32 key = invoice.computeKey(creator1, REF_HASH);

        // Creator cancels it first.
        vm.prank(creator1);
        invoice.cancelInvoice(key);

        // Now try to pay — must revert.
        vm.prank(payer);
        vm.expectRevert(CarpanInvoice.InvoiceNotPending.selector);
        invoice.payInvoice(key);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 13 — Cancel already-paid invoice
    //   Reverts InvoiceNotPending.
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case13_CancelInvoice_RevertsIfAlreadyPaid() public {
        vm.prank(creator1);
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, NO_EXPIRY);

        bytes32 key = invoice.computeKey(creator1, REF_HASH);

        // Pay it first.
        vm.prank(payer);
        invoice.payInvoice(key);

        // Creator attempts to cancel a PAID invoice.
        vm.prank(creator1);
        vm.expectRevert(CarpanInvoice.InvoiceNotPending.selector);
        invoice.cancelInvoice(key);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 14 — computeKey determinism
    //   Off-chain keccak256(abi.encode(creator, referenceHash)) matches
    //   computeKey() return value.
    // ══════════════════════════════════════════════════════════════════════════

    function test_Case14_ComputeKey_MatchesOffChainKeccak() public view {
        // Reproduce the exact on-chain derivation off-chain in Solidity.
        bytes32 expected = keccak256(abi.encode(creator1, REF_HASH));
        bytes32 actual   = invoice.computeKey(creator1, REF_HASH);
        assertEq(actual, expected, "computeKey must match keccak256(abi.encode(creator, referenceHash))");
    }

    function testFuzz_Case14_ComputeKey_DeterministicAcrossCalls(
        address c,
        bytes32 ref
    ) public view {
        // Same inputs, called twice, must return identical values.
        bytes32 k1 = invoice.computeKey(c, ref);
        bytes32 k2 = invoice.computeKey(c, ref);
        assertEq(k1, k2, "computeKey is not deterministic");

        // Must also match the off-chain formula.
        bytes32 expected = keccak256(abi.encode(c, ref));
        assertEq(k1, expected, "computeKey does not match keccak256(abi.encode(creator, ref))");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BONUS — Event: InvoiceCreated (all fields correct)
    // ══════════════════════════════════════════════════════════════════════════

    function test_Bonus_Event_InvoiceCreated() public {
        bytes32 expectedKey = invoice.computeKey(creator1, REF_HASH);

        vm.expectEmit(true, true, true, true, address(invoice));
        emit CarpanInvoice.InvoiceCreated(
            expectedKey,
            creator1,
            recipient,
            AMOUNT,
            NO_EXPIRY,
            REF_HASH
        );

        vm.prank(creator1);
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, NO_EXPIRY);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BONUS — Fuzz: exact amount transferred end-to-end
    // ══════════════════════════════════════════════════════════════════════════

    function testFuzz_Bonus_PayInvoice_ExactAmountTransferred(uint256 amt) public {
        amt = bound(amt, 1, 1_000_000e6);

        // Top up payer so the transfer can succeed for any bounded amt.
        usdc.mint(payer, amt);

        vm.prank(creator1);
        invoice.createInvoice(REF_HASH, recipient, amt, NO_EXPIRY);

        bytes32 key = invoice.computeKey(creator1, REF_HASH);

        uint256 payerBefore     = usdc.balanceOf(payer);
        uint256 recipientBefore = usdc.balanceOf(recipient);

        vm.prank(payer);
        invoice.payInvoice(key);

        assertEq(usdc.balanceOf(payer),     payerBefore     - amt, "payer deduction wrong");
        assertEq(usdc.balanceOf(recipient), recipientBefore + amt, "recipient credit wrong");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BONUS — Constructor revert on zero USDC address
    // ══════════════════════════════════════════════════════════════════════════

    function test_Bonus_Constructor_RevertsOnZeroUSDCAddress() public {
        vm.expectRevert(CarpanInvoice.ZeroAddress.selector);
        new CarpanInvoice(address(0));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BONUS — Expiry boundary: block.timestamp == expiry is NOT expired
    //   (condition is strictly `>`, so equality should pass)
    // ══════════════════════════════════════════════════════════════════════════

    function test_Bonus_PayInvoice_AtExactExpiryTimestampIsNotExpired() public {
        uint32 expiry = uint32(block.timestamp + 1 hours);

        vm.prank(creator1);
        invoice.createInvoice(REF_HASH, recipient, AMOUNT, expiry);

        bytes32 key = invoice.computeKey(creator1, REF_HASH);

        // Warp to exactly the expiry timestamp.
        vm.warp(uint256(expiry));

        // block.timestamp == expiry → strictly NOT expired (> vs >=).
        vm.prank(payer);
        invoice.payInvoice(key); // must succeed

        assertEq(
            uint8(invoice.getInvoice(key).status),
            uint8(CarpanInvoice.InvoiceStatus.PAID),
            "should be PAID at exact expiry"
        );
    }
}
