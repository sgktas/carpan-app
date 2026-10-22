// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CarpanInvoice is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum InvoiceStatus {
        PENDING,
        PAID,
        CANCELLED
    }

    struct Invoice {
        address creator;
        address recipient;
        uint256 amount;
        uint32 expiry;
        InvoiceStatus status;
    }

    error InvoiceAlreadyExists();
    error InvoiceNotFound();
    error InvoiceNotPending();
    error InvoiceExpired();
    error NotInvoiceCreator();
    error ZeroAddress();
    error ZeroAmount();

    event InvoiceCreated(
        bytes32 indexed invoiceKey,
        address indexed creator,
        address indexed recipient,
        uint256 amount,
        uint32 expiry,
        bytes32 referenceHash
    );

    event InvoicePaid(
        bytes32 indexed invoiceKey,
        address indexed payer,
        address indexed recipient,
        uint256 amount
    );

    event InvoiceCancelled(bytes32 indexed invoiceKey, address indexed creator);

    IERC20 public immutable USDC;

    mapping(bytes32 => Invoice) public invoices;

    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        USDC = IERC20(usdc_);
    }

    function createInvoice(bytes32 referenceHash, address recipient, uint256 amount, uint32 expiry) external {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        bytes32 invoiceKey = _computeKey(msg.sender, referenceHash);
        if (invoices[invoiceKey].creator != address(0)) revert InvoiceAlreadyExists();

        invoices[invoiceKey] = Invoice({
            creator: msg.sender,
            recipient: recipient,
            amount: amount,
            expiry: expiry,
            status: InvoiceStatus.PENDING
        });

        emit InvoiceCreated(invoiceKey, msg.sender, recipient, amount, expiry, referenceHash);
    }

    function payInvoice(bytes32 invoiceKey) external nonReentrant {
        Invoice storage invoice = invoices[invoiceKey];
        if (invoice.creator == address(0)) revert InvoiceNotFound();
        if (invoice.status != InvoiceStatus.PENDING) revert InvoiceNotPending();
        if (invoice.expiry != 0 && block.timestamp > uint256(invoice.expiry)) revert InvoiceExpired();

        USDC.safeTransferFrom(msg.sender, invoice.recipient, invoice.amount);
        invoice.status = InvoiceStatus.PAID;

        emit InvoicePaid(invoiceKey, msg.sender, invoice.recipient, invoice.amount);
    }

    function cancelInvoice(bytes32 invoiceKey) external {
        Invoice storage invoice = invoices[invoiceKey];
        if (invoice.creator == address(0)) revert InvoiceNotFound();
        if (msg.sender != invoice.creator) revert NotInvoiceCreator();
        if (invoice.status != InvoiceStatus.PENDING) revert InvoiceNotPending();

        invoice.status = InvoiceStatus.CANCELLED;

        emit InvoiceCancelled(invoiceKey, msg.sender);
    }

    function getInvoice(bytes32 invoiceKey) external view returns (Invoice memory) {
        return invoices[invoiceKey];
    }

    function computeKey(address creator, bytes32 referenceHash) external pure returns (bytes32) {
        return _computeKey(creator, referenceHash);
    }

    function _computeKey(address creator, bytes32 referenceHash) internal pure returns (bytes32) {
        return keccak256(abi.encode(creator, referenceHash));
    }
}
