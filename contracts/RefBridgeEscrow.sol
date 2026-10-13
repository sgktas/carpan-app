// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title RefBridgeEscrow
 * @notice Escrow for project referral budgets funded in USDC.
 * @dev Payment release is triggered by an authorized oracle that has verified participation offchain.
 * The oracle is the only entity that can call releasePayment.
 * The smart contract itself cannot verify offchain referral relationships.
 */
contract RefBridgeEscrow is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Order {
        address projectOwner;
        uint256 totalBudget;
        uint256 usedBudget;
        uint256 refundedBudget;
        uint256 pricePerReferral;
        uint256 platformFeeBps;
        uint256 maxReferrals;
        uint256 paidReferrals;
        uint256 expiresAt;
        bool active;
    }

    error ZeroAddress();
    error InvalidValue();
    error OrderAlreadyExists(bytes32 orderId);
    error OrderNotFound(bytes32 orderId);
    error OrderInactive(bytes32 orderId);
    error UnauthorizedOracle(address caller);
    error ParticipationAlreadyPaid(bytes32 participationId);
    error InsufficientRemainingBudget(bytes32 orderId, uint256 requested, uint256 remaining);
    error EthNotAccepted();

    event OrderCreated(
        bytes32 indexed orderId,
        address indexed projectOwner,
        uint256 totalBudget,
        uint256 pricePerReferral,
        uint256 platformFeeBps,
        uint256 maxReferrals
    );

    event PaymentReleased(
        bytes32 indexed orderId,
        bytes32 indexed participationId,
        address indexed participant,
        uint256 participantShare,
        uint256 platformShare
    );

    event BudgetRefunded(bytes32 indexed orderId, uint256 amount, address indexed projectOwner);
    event OracleUpdated(address indexed previousOracle, address indexed newOracle);
    event PlatformFeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);

    IERC20 public immutable usdcToken;
    address public oracle;
    address public platformFeeRecipient;

    mapping(bytes32 => Order) private _orders;
    mapping(bytes32 => bool) public participationPaid;

    modifier onlyOracle() {
        if (msg.sender != oracle) revert UnauthorizedOracle(msg.sender);
        _;
    }

    constructor(
        address usdcToken_,
        address initialOracle,
        address initialPlatformFeeRecipient,
        address initialOwner
    ) Ownable(initialOwner) {
        if (usdcToken_ == address(0) || initialOracle == address(0) || initialPlatformFeeRecipient == address(0)) {
            revert ZeroAddress();
        }

        usdcToken = IERC20(usdcToken_);
        oracle = initialOracle;
        platformFeeRecipient = initialPlatformFeeRecipient;
    }

    function depositOrder(
        bytes32 orderId,
        uint256 pricePerReferral,
        uint256 platformFeeBps,
        uint256 maxReferrals,
        uint256 expiresAt
    ) external whenNotPaused nonReentrant {
        if (_orders[orderId].projectOwner != address(0)) revert OrderAlreadyExists(orderId);
        if (pricePerReferral == 0 || maxReferrals == 0) revert InvalidValue();
        if (platformFeeBps > 10_000) revert InvalidValue();

        uint256 totalBudget = pricePerReferral * maxReferrals;

        _orders[orderId] = Order({
            projectOwner: msg.sender,
            totalBudget: totalBudget,
            usedBudget: 0,
            refundedBudget: 0,
            pricePerReferral: pricePerReferral,
            platformFeeBps: platformFeeBps,
            maxReferrals: maxReferrals,
            paidReferrals: 0,
            expiresAt: expiresAt,
            active: true
        });

        usdcToken.safeTransferFrom(msg.sender, address(this), totalBudget);

        emit OrderCreated(orderId, msg.sender, totalBudget, pricePerReferral, platformFeeBps, maxReferrals);
    }

    function releasePayment(
        bytes32 orderId,
        bytes32 participationId,
        address participant
    ) external onlyOracle whenNotPaused nonReentrant {
        if (participant == address(0)) revert ZeroAddress();
        if (participationPaid[participationId]) revert ParticipationAlreadyPaid(participationId);

        Order storage order = _orders[orderId];
        if (order.projectOwner == address(0)) revert OrderNotFound(orderId);
        if (!order.active) revert OrderInactive(orderId);

        uint256 remainingBudget = order.totalBudget - order.usedBudget - order.refundedBudget;
        uint256 unitPrice = order.pricePerReferral;
        if (remainingBudget < unitPrice) {
            revert InsufficientRemainingBudget(orderId, unitPrice, remainingBudget);
        }

        uint256 participantShare = (unitPrice * (10_000 - order.platformFeeBps)) / 10_000;
        uint256 platformShare = unitPrice - participantShare;

        participationPaid[participationId] = true;
        order.paidReferrals += 1;
        order.usedBudget += unitPrice;

        if (order.paidReferrals >= order.maxReferrals) {
            order.active = false;
        }

        usdcToken.safeTransfer(participant, participantShare);
        if (platformShare > 0) {
            usdcToken.safeTransfer(platformFeeRecipient, platformShare);
        }

        emit PaymentReleased(orderId, participationId, participant, participantShare, platformShare);
    }

    function refundBudget(bytes32 orderId, uint256 amount) external onlyOracle whenNotPaused nonReentrant {
        Order storage order = _orders[orderId];
        if (order.projectOwner == address(0)) revert OrderNotFound(orderId);
        if (!order.active) revert OrderInactive(orderId);

        uint256 remainingBudget = order.totalBudget - order.usedBudget - order.refundedBudget;
        if (amount > remainingBudget) {
            revert InsufficientRemainingBudget(orderId, amount, remainingBudget);
        }

        order.refundedBudget += amount;

        if (order.refundedBudget + order.usedBudget == order.totalBudget) {
            order.active = false;
        }

        usdcToken.safeTransfer(order.projectOwner, amount);

        emit BudgetRefunded(orderId, amount, order.projectOwner);
    }

    function setOracle(address oracle_) external onlyOwner {
        if (oracle_ == address(0)) revert ZeroAddress();

        address previousOracle = oracle;
        oracle = oracle_;

        emit OracleUpdated(previousOracle, oracle_);
    }

    function setPlatformFeeRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();

        address previousRecipient = platformFeeRecipient;
        platformFeeRecipient = recipient;

        emit PlatformFeeRecipientUpdated(previousRecipient, recipient);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getOrder(bytes32 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    receive() external payable {
        revert EthNotAccepted();
    }

    fallback() external payable {
        revert EthNotAccepted();
    }
}
